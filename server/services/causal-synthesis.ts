/**
 * Causal Synthesis Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Takes curiosity discoveries + cross-domain signals and extracts causal chains:
 *   [FIELD SIGNAL] → [MECHANISM] → [VIEWER EFFECT] → [CHANNEL ACTION]
 *
 * Example:
 *   [NEUROSCIENCE] Dopamine prediction error fires on unexpected reward →
 *   Surprise spikes attention harder than expected reward →
 *   Viewer brain registers kill-cam as higher-value than telegraphed moment →
 *   CHANNEL RULE: Cut TO the kill in under 0.2s — never pan in, always snap cut
 *
 * Stored in masterKnowledgeBank (category="causal_chain") so every downstream
 * AI generator automatically absorbs the reasoning, not just the conclusion.
 *
 * This is ASI pillar #2: the system builds a causal world model, not just
 * a pattern library.
 */

import { db } from "../db";
import { masterKnowledgeBank, intelligenceSignals } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { createLogger } from "../lib/logger";

const logger = createLogger("causal-synthesis");

const CAUSAL_COOLDOWN_MS = 20 * 60 * 60_000; // once per 20 h per user
const _lastCausalAt = new Map<string, number>();

export async function runCausalSynthesis(userId: string): Promise<number> {
  const last = _lastCausalAt.get(userId) ?? 0;
  if (Date.now() - last < CAUSAL_COOLDOWN_MS) {
    logger.debug(`[CausalSynth] Cooldown active for ${userId.slice(0, 8)}`);
    return 0;
  }

  // Pull cross-domain signals from last 48 h
  const since = new Date(Date.now() - 48 * 60 * 60_000);
  const rawSignals = await db.select()
    .from(intelligenceSignals)
    .where(and(
      eq(intelligenceSignals.userId, userId),
      gte(intelligenceSignals.createdAt, since),
    ))
    .orderBy(desc(intelligenceSignals.score))
    .limit(60);

  const curiosity = rawSignals.filter(s => s.source === "curiosity");
  const broadWeb  = rawSignals.filter(s => s.source === "web_search").slice(0, 8);
  const broadRSS  = rawSignals.filter(s => s.source === "rss" && (s.metadata as any)?.domain !== "gaming").slice(0, 8);

  const allCross = [...curiosity, ...broadWeb, ...broadRSS].slice(0, 22);

  if (allCross.length < 3) {
    logger.debug(`[CausalSynth] Not enough cross-domain signals (${allCross.length}) — skipping`);
    return 0;
  }

  // Pull existing causal chains to avoid duplicates
  const existingChains = await db.select({ principle: masterKnowledgeBank.principle })
    .from(masterKnowledgeBank)
    .where(and(
      eq(masterKnowledgeBank.userId, userId),
      eq(masterKnowledgeBank.category, "causal_chain"),
      eq(masterKnowledgeBank.isActive, true),
    ))
    .orderBy(desc(masterKnowledgeBank.confidenceScore))
    .limit(12);

  const signalLines = allCross.map(s => {
    const m = s.metadata as any;
    if (s.source === "curiosity") {
      return `- [CURIOSITY/${m?.topic}] ${m?.abstract?.slice(0, 160) ?? s.title} | Related: ${(m?.relatedTopics ?? []).slice(0, 3).join(", ")}`;
    }
    return `- [${(m?.feedName ?? "web")}/${m?.domain ?? m?.query?.slice(0, 30) ?? ""}] ${s.title.slice(0, 120)}`;
  }).join("\n");

  const prompt = `You are a causal reasoning engine for "ET Gaming 274" (~6K subscribers) — a no-commentary gaming channel. Primary content is full playthroughs and live stream VODs; Shorts are clipped from that footage. Currently focused on Battlefield 6.

CROSS-DOMAIN SIGNALS FROM THE LAST 48 HOURS:
${signalLines}

EXISTING CAUSAL CHAINS (already known — do NOT duplicate):
${existingChains.map(c => `- ${c.principle.slice(0, 130)}`).join("\n") || "none yet — this is a fresh start"}

TASK: Extract 3-5 NEW causal chains not already in the list above.

Each causal chain must:
1. Start with a real scientific/academic signal from any field
2. Trace the mechanism step-by-step to a viewer brain effect
3. End with a SPECIFIC, testable channel action rule
4. Be genuinely non-obvious — not just "make better thumbnails"

Format each as:
{
  "field": "neuroscience|psychology|marketing|design|biology|economics|philosophy|physics|other",
  "signal": "the source discovery, 1 sentence (cite the field/concept)",
  "mechanism": "the causal mechanism behind it, 1-2 sentences",
  "viewerEffect": "what this does to a viewer's brain or behaviour, 1 sentence",
  "channelAction": "the SPECIFIC rule for this channel, 1-2 sentences — must mention clips/thumbnails/titles/editing/pacing",
  "exampleApplication": "one concrete example starting with a specific number or action (e.g. 'Hold the kill frame for 0.4 s before cutting')",
  "confidence": 45-78
}

Return ONLY valid JSON (no markdown):
{"causalChains": [...]}`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "learning", userId, maxTokens: 3000 },
      "You are a polymath causal reasoning engine. You find the hidden mechanism behind any scientific signal from any field and trace it to a specific actionable rule for a no-commentary gaming YouTube channel. Be precise and non-obvious. Return only valid JSON.",
      prompt
    );

    const parsed = safeParseJSON<{ causalChains: any[] } | null>(result.content, null);
    if (!parsed?.causalChains?.length) {
      logger.warn("[CausalSynth] No valid causal chains in response");
      return 0;
    }

    let written = 0;
    for (const chain of parsed.causalChains.slice(0, 5)) {
      if (!chain?.channelAction || !chain?.mechanism) continue;

      const principle = [
        `[${(chain.field ?? "CROSS-DOMAIN").toUpperCase()}]`,
        chain.signal,
        "→",
        chain.mechanism,
        "→",
        chain.viewerEffect,
        "→ CHANNEL RULE:",
        chain.channelAction,
        chain.exampleApplication ? `(e.g. ${chain.exampleApplication})` : "",
      ].filter(Boolean).join(" ");

      try {
        await db.insert(masterKnowledgeBank).values({
          userId,
          category: "causal_chain",
          principle,
          sourceEngines: ["causal-synthesis"],
          evidenceCount: 1,
          confidenceScore: Math.min(78, Math.max(45, Math.round(chain.confidence ?? 60))),
          applicableEngines: [
            "shorts-pipeline", "vod-seo-optimizer", "clip-selector",
            "title-generator", "thumbnail-concept", "short-hook",
          ],
          metadata: {
            field: chain.field,
            signal: chain.signal,
            mechanism: chain.mechanism,
            viewerEffect: chain.viewerEffect,
            channelAction: chain.channelAction,
            exampleApplication: chain.exampleApplication,
            synthesizedAt: new Date().toISOString(),
          },
        });
        written++;
      } catch { /* conflict with existing — non-fatal */ }
    }

    _lastCausalAt.set(userId, Date.now());
    logger.info(`[CausalSynth] Wrote ${written} causal chain(s) to masterKnowledgeBank`, {
      userId: userId.slice(0, 8),
      model: result.model,
    });
    return written;
  } catch (err: any) {
    logger.warn(`[CausalSynth] Failed: ${err.message?.slice(0, 120)}`);
    return 0;
  }
}
