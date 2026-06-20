/**
 * Safe Self-Implementer
 *
 * The self-architect proposes changes and emails a human for code-level changes.
 * This service handles the "safe middle ground" — changes that are purely
 * configurational (system_settings thresholds, engine interval tuning,
 * strategy toggling, discoveredStrategies activation) and can be implemented
 * autonomously without touching a single line of code.
 *
 * Pipeline:
 *   masterKnowledgeBank (category="action_required", timesApplied=0)
 *     → classify: SAFE vs UNSAFE
 *     → SAFE → implement → mark applied → log to systemImprovements
 *     → UNSAFE → leave for human / self-architect email flow
 *
 * Runs every 6 h (Wave 10.5).
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  systemSettings,
  systemImprovements,
  discoveredStrategies,
  engineIntervalConfigs,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { acquireAISlotBackground, releaseAISlot } from "../lib/ai-semaphore";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";

const logger      = createLogger("safe-self-implementer");
const CYCLE_MS    = 6 * 60 * 60_000;
const REAL_USER   = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

// Safe action categories the implementer can execute without human approval
type SafeAction =
  | { type: "system_setting"; key: string; value: string; reasoning: string }
  | { type: "engine_interval"; engine: string; newIntervalMs: number; reasoning: string }
  | { type: "strategy_toggle"; strategyTitle: string; activate: boolean; reasoning: string }
  | { type: "none"; reasoning: string };

// ─── Classify + extract action from MKB principle ────────────────────────────

async function classifyAndExtract(principle: string, mkbId: number): Promise<SafeAction> {
  await acquireAISlotBackground();
  try {
    const client = getRawOpenAIClientForDirectUse();
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a safe-change classifier for an autonomous YouTube AI system.

The following action was proposed by the architecture critic or self-architect:
"${principle}"

Classify this as ONE of these safe action types that require NO code changes:
1. system_setting — update a key/value in system_settings table (thresholds, flags, config)
2. engine_interval — adjust how often a background engine runs (in ms)
3. strategy_toggle — activate or deactivate a discovered_strategy by title
4. none — this requires code changes or human approval (leave it for human review)

Respond as JSON only:
{
  "type": "system_setting" | "engine_interval" | "strategy_toggle" | "none",
  "key": "...",           // for system_setting
  "value": "...",         // for system_setting (as string)
  "engine": "...",        // for engine_interval
  "newIntervalMs": 0,     // for engine_interval
  "strategyTitle": "...", // for strategy_toggle
  "activate": true,       // for strategy_toggle
  "reasoning": "one-line explanation"
}`,
      }],
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as SafeAction;
  } catch {
    return { type: "none", reasoning: "classification failed" };
  } finally {
    releaseAISlot();
  }
}

// ─── Execute safe action ──────────────────────────────────────────────────────

async function executeSafeAction(action: SafeAction, principle: string): Promise<boolean> {
  if (action.type === "none") return false;

  try {
    if (action.type === "system_setting") {
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${action.key}, ${action.value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `);
      logger.info(`[SafeImpl] system_settings["${action.key}"] = "${action.value}" — ${action.reasoning}`);
    }

    else if (action.type === "engine_interval") {
      const clampMs = Math.max(5 * 60_000, Math.min(24 * 60 * 60_000, action.newIntervalMs));
      await db.update(engineIntervalConfigs)
        .set({ currentIntervalMs: clampMs, updatedAt: new Date() } as any)
        .where(and(
          eq(engineIntervalConfigs.userId, REAL_USER),
          eq(engineIntervalConfigs.engineName, action.engine),
        ));
      logger.info(`[SafeImpl] engine interval "${action.engine}" → ${clampMs}ms — ${action.reasoning}`);
    }

    else if (action.type === "strategy_toggle") {
      await db.update(discoveredStrategies)
        .set({ isActive: action.activate })
        .where(eq(discoveredStrategies.title, action.strategyTitle));
      logger.info(`[SafeImpl] strategy "${action.strategyTitle}" → ${action.activate ? "active" : "paused"} — ${action.reasoning}`);
    }

    // Log to systemImprovements for audit trail + brain learning
    await db.insert(systemImprovements).values({
      userId:       REAL_USER,
      improvementType: "autonomous_config_change",
      area:         action.type,
      beforeState:  "prior config",
      afterState:   JSON.stringify(action),
      engineSource: "safe-self-implementer",
      triggerEvent: principle.slice(0, 200),
    });

    return true;
  } catch (err: any) {
    logger.warn(`[SafeImpl] Failed to execute ${action.type}: ${err?.message}`);
    return false;
  }
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runImplementerCycle(): Promise<void> {
  try {
    // Find unimplemented action_required entries in masterKnowledgeBank
    const pending = await db.select({
      id:        masterKnowledgeBank.id,
      principle: masterKnowledgeBank.principle,
    })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, REAL_USER),
        eq(masterKnowledgeBank.category, "action_required"),
        eq(masterKnowledgeBank.isActive, true),
        sql`${masterKnowledgeBank.timesApplied} = 0`,
      ))
      .limit(5); // process max 5 per cycle to avoid over-spending AI slots

    if (pending.length === 0) {
      logger.info("[SafeImpl] No pending action_required entries — all clear");
      return;
    }

    let implemented = 0;
    let skipped = 0;

    for (const item of pending) {
      const action = await classifyAndExtract(item.principle, item.id);
      const done   = await executeSafeAction(action, item.principle);

      // Mark as applied regardless (so we don't re-process it next cycle)
      await db.update(masterKnowledgeBank)
        .set({
          timesApplied: sql`${masterKnowledgeBank.timesApplied} + 1`,
          lastAppliedAt: new Date(),
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            safeImplResult: done ? "implemented" : "skipped_unsafe",
            actionType: action.type,
            reasoning: action.reasoning,
            processedAt: new Date().toISOString(),
          })}::jsonb`,
        })
        .where(eq(masterKnowledgeBank.id, item.id));

      if (done) implemented++; else skipped++;
    }

    logger.info(`[SafeImpl] Cycle complete — ${implemented} implemented, ${skipped} skipped (unsafe/code-level)`);
  } catch (err: any) {
    logger.warn(`[SafeImpl] Cycle failed (non-fatal): ${err?.message}`);
  }
}

export function initSafeSelfImplementer(userId: string): NodeJS.Timeout {
  const delay = 12 * 60_000; // T+12min after Wave 10.5 start
  logger.info(`[SafeImpl] Init — first cycle in ${delay / 60_000}min, then every 6h`);
  const t = setTimeout(async () => {
    await runImplementerCycle();
    setInterval(runImplementerCycle, CYCLE_MS);
  }, delay);
  return t;
}
