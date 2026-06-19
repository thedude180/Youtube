/**
 * adaptive-mode-engine.ts
 *
 * THE TRANSMISSION — shifts the entire system between operating modes based on
 * real-time health. Like a car's automatic gearbox: read current conditions,
 * select the right gear. Every service importing getAdaptiveMode() adapts.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PEAK         (score 85-100) Channel thriving. Maximum aggression.       │
 * │    • +30% batch sizes, shorter cycles, deeper optimization               │
 * │    • Lower viral threshold → catch more revival signals                  │
 * │    • Larger queue depth target                                            │
 * │                                                                          │
 * │  NORMAL       (score 60-84)  Standard operating parameters.              │
 * │                                                                          │
 * │  CONSERVATIVE (score 35-59)  System under pressure.                      │
 * │    • -30% batch sizes, longer intervals, no deep optimization            │
 * │    • Higher quota reserve, only proven-viral content boosted             │
 * │                                                                          │
 * │  RECOVERY     (score 0-34)   Emergency protocol.                         │
 * │    • Minimum viable publishing. All AI optimization suspended.           │
 * │    • Maximum quota conservation. All non-essential work deferred.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Written to:  service_state("adaptive-mode", "current")
 * Read by:     getAdaptiveMode() — importable by any service
 *              loop-conductor (adjusts its own revival threshold + batch targeting)
 */

import { createLogger }              from "../lib/logger";
import { getState, setStateAsync }   from "../lib/service-state";
import { logSystemIncident }         from "../lib/incident-log";

const logger = createLogger("adaptive-mode");

// ── Types ──────────────────────────────────────────────────────────────────

export type AdaptiveMode = "RECOVERY" | "CONSERVATIVE" | "NORMAL" | "PEAK";

export interface AdaptiveModeConfig {
  mode:                      AdaptiveMode;
  score:                     number;
  batchMultiplier:           number;
  deepOptimizationAllowed:   boolean;
  scanDepthMultiplier:       number;
  revivalBoostViewThreshold: number;
  queueDepthTarget:          number;
  conserveQuota:             boolean;
  reason:                    string;
  computedAt:                string;
  previousMode:              AdaptiveMode | null;
}

// ── Per-mode configuration table ───────────────────────────────────────────

type ModeParams = Omit<AdaptiveModeConfig, "mode"|"score"|"reason"|"computedAt"|"previousMode">;

const MODE_PARAMS: Record<AdaptiveMode, ModeParams> = {
  PEAK: {
    batchMultiplier:           1.3,
    deepOptimizationAllowed:   true,
    scanDepthMultiplier:       1.5,
    revivalBoostViewThreshold: 300,
    queueDepthTarget:          150,
    conserveQuota:             false,
  },
  NORMAL: {
    batchMultiplier:           1.0,
    deepOptimizationAllowed:   true,
    scanDepthMultiplier:       1.0,
    revivalBoostViewThreshold: 500,
    queueDepthTarget:          87,
    conserveQuota:             false,
  },
  CONSERVATIVE: {
    batchMultiplier:           0.7,
    deepOptimizationAllowed:   false,
    scanDepthMultiplier:       0.7,
    revivalBoostViewThreshold: 750,
    queueDepthTarget:          45,
    conserveQuota:             true,
  },
  RECOVERY: {
    batchMultiplier:           0.5,
    deepOptimizationAllowed:   false,
    scanDepthMultiplier:       0.5,
    revivalBoostViewThreshold: 1000,
    queueDepthTarget:          20,
    conserveQuota:             true,
  },
};

// ── Mode calculation ───────────────────────────────────────────────────────

function calculateMode(
  healthScore:   number,
  quotaRatio:    number,
  incidentCount: number,
): { mode: AdaptiveMode; reason: string } {

  const rawMode: AdaptiveMode =
    healthScore >= 85 ? "PEAK"
    : healthScore >= 60 ? "NORMAL"
    : healthScore >= 35 ? "CONSERVATIVE"
    : "RECOVERY";

  const reasons: string[] = [`score=${healthScore}/100`];
  let mode = rawMode;

  if (rawMode === "PEAK" && quotaRatio > 0.85) {
    mode = "NORMAL";
    reasons.push(`quota=${Math.round(quotaRatio * 100)}%>85% → capped to NORMAL`);
  }

  if ((mode === "PEAK" || mode === "NORMAL") && incidentCount >= 5) {
    mode = "CONSERVATIVE";
    reasons.push(`${incidentCount} active incidents → capped to CONSERVATIVE`);
  }

  return { mode, reason: reasons.join(", ") };
}

function buildConfig(
  mode:         AdaptiveMode,
  score:        number,
  reason:       string,
  previousMode: AdaptiveMode | null,
): AdaptiveModeConfig {
  return {
    mode,
    score,
    reason,
    computedAt:  new Date().toISOString(),
    previousMode,
    ...MODE_PARAMS[mode],
  };
}

// ── Public: read current mode ──────────────────────────────────────────────

/**
 * Returns the current adaptive mode config.
 * Falls back to NORMAL defaults if the engine has not yet run.
 * Never throws.
 */
export async function getAdaptiveMode(): Promise<AdaptiveModeConfig> {
  try {
    const stored = await getState<AdaptiveModeConfig>("adaptive-mode", "current");
    if (stored?.mode) return stored;
  } catch { /* fall through */ }
  return buildConfig("NORMAL", 70, "default — engine not yet run", null);
}

// ── Public: compute + persist ──────────────────────────────────────────────

/**
 * Calculate adaptive mode from current system metrics, persist to service_state,
 * log any transitions, and return the new config.
 *
 * Called by loop-conductor at the start of every 30-min cycle.
 */
export async function computeAndSetAdaptiveMode(
  healthScore:   number,
  quotaRatio:    number,
  incidentCount: number,
): Promise<AdaptiveModeConfig> {

  const previous     = await getState<AdaptiveModeConfig>("adaptive-mode", "current");
  const previousMode = previous?.mode ?? null;

  const { mode, reason } = calculateMode(healthScore, quotaRatio, incidentCount);
  const config = buildConfig(mode, healthScore, reason, previousMode);

  await setStateAsync("adaptive-mode", "current", config as unknown as Record<string, unknown>);

  if (!previousMode) {
    logger.info(`[adaptive-mode] Initial mode: ${mode} (${reason})`);
    return config;
  }

  if (previousMode === mode) {
    logger.debug(`[adaptive-mode] Mode unchanged: ${mode} (${reason})`);
    return config;
  }

  const arrow =
    mode === "PEAK"         ? "⬆⬆" :
    mode === "NORMAL"       ? (previousMode === "PEAK" ? "⬇" : "⬆") :
    mode === "CONSERVATIVE" ? "⬇" : "⬇⬇";

  logger.info(`[adaptive-mode] ${arrow} Transition: ${previousMode} → ${mode} (${reason})`);

  // Sharp downgrades logged to brain learning pipeline
  const isSharpDrop =
    (previousMode === "PEAK" && (mode === "CONSERVATIVE" || mode === "RECOVERY")) ||
    (previousMode === "NORMAL" && mode === "RECOVERY");

  if (isSharpDrop) {
    logSystemIncident({
      category:       "other",
      service:        "adaptive-mode-engine",
      severity:       "high",
      status:         "active",
      rootCause:
        `System mode dropped sharply: ${previousMode} → ${mode}. ` +
        `Health score: ${healthScore}/100. Reason: ${reason}.`,
      fixDescription:
        `System auto-entered ${mode} mode. ` +
        `Batch sizes reduced, deep optimization suspended, quota conserved.`,
      lesson:
        `Sharp mode drop (${previousMode}→${mode}) signals systemic trouble. ` +
        `At score ${healthScore}/100 the system cannot sustain aggressive operation. ` +
        `Check: quota usage vs daily pace, OAuth token health, engine heartbeats. ` +
        `Adaptive mode auto-recovers when health score rises above threshold.`,
      tags: ["adaptive-mode", "mode-drop", previousMode.toLowerCase(), mode.toLowerCase()],
    });
  }

  if (mode === "PEAK") {
    logger.info(
      `[adaptive-mode] 🚀 PEAK mode reached (score=${healthScore}/100). ` +
      `Max aggression: +30% batches, lower viral threshold, deeper optimization.`,
    );
  }

  return config;
}

// ── Init ───────────────────────────────────────────────────────────────────
// Driven by loop-conductor; this init only ensures a safe default exists on boot.

export async function initAdaptiveModeEngine(): Promise<void> {
  logger.info("[adaptive-mode] Initializing — ensuring safe default on boot");

  const existing = await getState<AdaptiveModeConfig>("adaptive-mode", "current");
  if (!existing?.mode) {
    const def = buildConfig("NORMAL", 70, "boot default", null);
    await setStateAsync("adaptive-mode", "current", def as unknown as Record<string, unknown>);
    logger.info("[adaptive-mode] Default NORMAL mode written to service_state");
  } else {
    logger.info(`[adaptive-mode] Existing mode on boot: ${existing.mode} (score=${existing.score})`);
  }
}
