/**
 * recursive-critique-loop.ts
 *
 * The core "recursive AI" primitive for CreatorOS.
 *
 * Content generators currently produce one-shot outputs. This module wraps
 * any generated content (title, description, tags) in a self-critique +
 * self-refine cycle before it ships:
 *
 *   generate() → critique(output) → refine(output + critique) → publish
 *
 * The AI reviews its own work, identifies specific weaknesses, then produces
 * an improved version. Critique findings are stored in engineKnowledge so the
 * prompt-evolution-engine can learn what patterns fail vs succeed.
 *
 * Design constraints:
 *  - Max ONE additional AI round-trip (critique+refine is one call)
 *  - Skipped gracefully if AI semaphore slot unavailable — never blocks publish
 *  - Uses gpt-4o-mini (same tier as content generators)
 *  - Per-content token budget capped at 800 tokens
 */

import { createLogger } from "../lib/logger";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import { getOpenAIClientBackground } from "../lib/openai";
import { recordEngineKnowledge } from "./knowledge-mesh";

const logger = createLogger("recursive-critique");

export interface ContentDraft {
  title: string;
  description?: string | null;
  tags?: string[] | null;
}

export interface CritiqueResult {
  title: string;
  description?: string | null;
  tags?: string[] | null;
  critique: string;       // what the AI said was weak in the original
  improved: boolean;      // true if the refined version differs meaningfully
  skipped: boolean;       // true if critique was bypassed (AI slot full, etc.)
}

/**
 * Run the generate→critique→refine loop on a content draft.
 *
 * @param draft     The content as initially generated
 * @param context   Short context string: game name, content type, platform
 * @param userId    Used to store learnings in engineKnowledge
 * @returns         The improved draft (or the original if refinement was skipped)
 */
export async function critiqueAndRefine(
  draft: ContentDraft,
  context: string,
  userId: string,
): Promise<CritiqueResult> {
  if (!tryAcquireAISlotNow()) {
    logger.debug("[CritiqueLoop] AI slot unavailable — skipping critique, publishing original");
    return { ...draft, critique: "", improved: false, skipped: true };
  }

  try {
    const openai = getOpenAIClientBackground();

    const prompt = `You are a YouTube content quality auditor for a PS5 gaming channel.

CONTENT BEING REVIEWED:
Title: ${draft.title}
Description (first 300 chars): ${(draft.description ?? "").slice(0, 300)}
Tags: ${(draft.tags ?? []).slice(0, 10).join(", ")}

Context: ${context}

Your job is to:
1. CRITIQUE the current title — what is weak? Is the hook strong? Is the curiosity gap clear? Does it front-load the most interesting element? Is it too generic?
2. REWRITE the title to be stronger. Be specific. Concrete. Create tension or curiosity.
3. Optionally improve the first hook line of the description (max 25 words).

Rules:
- Never mention AI, AI-generated, artificial intelligence, or machine learning
- Keep rewritten title under 100 chars
- If the original is genuinely excellent, say so and keep it unchanged
- Return ONLY valid JSON

{
  "critique": "1-2 sentences: what specifically is weak about the original title",
  "rewrittenTitle": "the improved title, or the exact original if it's already excellent",
  "improvedHook": "optional improved first description line, or null",
  "confidenceImproved": true/false
}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a ruthless YouTube title critic who always improves what you critique. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.8,
    });

    releaseAISlot();

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const critique: string = parsed.critique ?? "";
    const rewrittenTitle: string = (typeof parsed.rewrittenTitle === "string" && parsed.rewrittenTitle.length > 5)
      ? parsed.rewrittenTitle.slice(0, 100)
      : draft.title;
    const improvedHook: string | null = (typeof parsed.improvedHook === "string" && parsed.improvedHook.length > 10)
      ? parsed.improvedHook
      : null;
    const didImprove = parsed.confidenceImproved === true && rewrittenTitle !== draft.title;

    // Build improved description: replace first line if we got an improved hook
    let improvedDescription = draft.description ?? null;
    if (improvedHook && improvedDescription) {
      const lines = improvedDescription.split("\n");
      if (lines[0].length < 120) {
        lines[0] = improvedHook;
        improvedDescription = lines.join("\n");
      } else {
        improvedDescription = improvedHook + "\n\n" + improvedDescription;
      }
    }

    if (critique) {
      recordEngineKnowledge(
        "recursive-critique",
        userId,
        "title_critique",
        `title_weakness:${context.slice(0, 40)}`,
        critique,
        `Original: "${draft.title.slice(0, 60)}" → Improved: ${didImprove}`,
        didImprove ? 70 : 50,
      ).catch(() => {});
    }

    if (didImprove) {
      logger.info(`[CritiqueLoop] Title improved: "${draft.title.slice(0, 50)}" → "${rewrittenTitle.slice(0, 50)}"`);
    }

    return {
      title: rewrittenTitle,
      description: improvedDescription,
      tags: draft.tags,
      critique,
      improved: didImprove,
      skipped: false,
    };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[CritiqueLoop] Failed (non-fatal): ${err.message?.slice(0, 80)}`);
    return { ...draft, critique: "", improved: false, skipped: true };
  }
}
