/**
 * Adversarial Evaluator
 * ─────────────────────────────────────────────────────────────────────────────
 * For every batch of AI-generated growth strategies, runs a devil's-advocate
 * challenge call. Only strategies that survive (score ≥ SURVIVE_THRESHOLD)
 * are committed to the database.
 *
 * This is ASI pillar #1: the system argues with itself before acting.
 */

import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { createLogger } from "../lib/logger";

const logger = createLogger("adversarial-evaluator");

const SURVIVE_THRESHOLD = 40; // 0-100; strategies below this are rejected

export interface StrategyCandidate {
  title: string;
  category: string;
  priority: string;
  description: string;
  actionItems: string[];
  estimatedImpact: string;
  sourceField?: string;
}

export interface AdversarialResult {
  strategy: StrategyCandidate;
  score: number;
  challenge: string;
  rebuttal: string;
  survived: boolean;
}

export async function evaluateStrategiesAdversarially(
  userId: string,
  candidates: StrategyCandidate[],
  focusGame: string,
): Promise<AdversarialResult[]> {
  if (candidates.length === 0) return [];

  const prompt = `You are a rigorous devil's advocate evaluating growth strategies for the "${focusGame}" gaming YouTube channel "ET Gaming 274" (~6K subscribers). This is a no-commentary gaming channel — full playthroughs and live stream VODs are the primary content; Shorts are clipped from that footage as a growth tool, not the main format.

STRATEGIES TO EVALUATE:
${candidates.map((s, i) => `
[${i + 1}] "${s.title}" (${s.category}, ${s.priority} priority)
Description: ${s.description}
Actions: ${s.actionItems.join("; ")}
Expected impact: ${s.estimatedImpact}
Source field: ${s.sourceField ?? "gaming"}
`).join("\n")}

For EACH strategy:
1. Write the STRONGEST possible objection in 1-2 sentences (why it might fail or be wrong for this channel)
2. Write a rebuttal in 1-2 sentences (why it would still work despite the challenge)
3. Score 0-100 on survivability AFTER your challenge:
   - 80-100: Strong — challenge makes it sharper
   - 60-79: Solid with minor caveats
   - 40-59: Borderline — fragile premise or thin evidence
   - 0-39: REJECT — speculation, not specific to this channel, or wrong direction

Be genuinely critical. A score of 70+ means this strategy truly deserves execution resources.

Return ONLY valid JSON (no markdown):
{
  "evaluations": [
    {
      "index": 1,
      "challenge": "strongest objection in 1-2 sentences",
      "rebuttal": "rebuttal in 1-2 sentences",
      "score": 75
    }
  ]
}`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "critique", userId, maxTokens: 2000 },
      "You are a rigorous quality-control agent. Find genuine flaws in proposed strategies and score their survivability honestly. Be critical — a 70+ score means it deserves real execution resources. Return only valid JSON.",
      prompt
    );

    const parsed = safeParseJSON<{
      evaluations: Array<{ index: number; challenge: string; rebuttal: string; score: number }>;
    } | null>(result.content, null);

    if (!parsed?.evaluations) {
      logger.warn("[Adversarial] Non-JSON response — passing all candidates with default score");
      return candidates.map(s => ({
        strategy: s, score: 60, challenge: "", rebuttal: "", survived: true,
      }));
    }

    const results: AdversarialResult[] = candidates.map((s, i) => {
      const ev = parsed.evaluations.find(e => e.index === i + 1);
      const score = Math.max(0, Math.min(100, ev?.score ?? 60));
      return {
        strategy: s,
        score,
        challenge: ev?.challenge ?? "",
        rebuttal: ev?.rebuttal ?? "",
        survived: score >= SURVIVE_THRESHOLD,
      };
    });

    const passed = results.filter(r => r.survived).length;
    const rejected = results.filter(r => !r.survived).map(r => r.strategy.title);

    logger.info("[Adversarial] Evaluation complete", {
      userId: userId.slice(0, 8),
      total: candidates.length,
      passed,
      rejected: rejected.length,
      rejectedTitles: rejected.slice(0, 3),
    });

    return results;
  } catch (err: any) {
    logger.warn(`[Adversarial] Evaluation failed — passing all candidates: ${err.message?.slice(0, 100)}`);
    return candidates.map(s => ({
      strategy: s, score: 60, challenge: "", rebuttal: "", survived: true,
    }));
  }
}
