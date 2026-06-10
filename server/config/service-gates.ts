/**
 * server/config/service-gates.ts
 *
 * Single source of truth for which background services are allowed to start.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ACTIVE:   YouTube autopilot + live-stream services                 │
 * │  DISABLED: everything else — permanently off until you re-enable    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * To RE-ENABLE any service:
 *   1. Remove its label from DISABLED_SERVICES below.
 *   2. Redeploy.
 *
 * To DISABLE something new:
 *   1. Add its label string to DISABLED_SERVICES.
 *   2. Redeploy.
 *
 * Labels match the { label: "..." } field used in sequentialBoot() arrays
 * and the string keys passed to isEnabled() for directly-called services.
 */

const DISABLED_SERVICES = new Set<string>([

  // ── Security / threat intelligence ──────────────────────────────────────
  // Not needed for YouTube upload ops; removes ~3 background AI calls/hour.
  "sentinel",
  "threat-learning-engine",
  "injection-spike-monitor",

  // ── Social / community management ───────────────────────────────────────
  "community-audience-engine",
  "creator-education-engine",
  "compliance-legal-engine",

  // ── Non-YouTube analytics + general-purpose learning ────────────────────
  // analytics-intelligence-engine loops through ALL platforms (TikTok, etc.)
  // and produces multi-platform forecasts — not YouTube-specific.
  "analytics-intelligence-engine",
  // universal-learning-observer is a general event logger, not YouTube-specific.
  "universal-learning-observer",

  // ── Non-YouTube integrations ─────────────────────────────────────────────
  "stripe-init",
  "stripe-webhook",
  "agent-orchestrator",
  "content-loop",
  "notification-digests",
  "notification-watchdog",

  // ── Marketing / reporting ────────────────────────────────────────────────
  "weekly-report-engine",
  "daily-upload-digest",
  "automation-engine",
  "trend-rider-engine",
  "trust-governance",
  "marketer-engine",

  // ── Wave 9: AI self-improvement / growth ─────────────────────────────────
  "self-improvement-engine",
  "growth-flywheel-engine",

  // ── Wave 10: non-core meta engines ───────────────────────────────────────
  "media-command-center",
  "smart-content-distributor",
  "empire-brain",
  "platform-feature-detector",
  "infinite-evolution-engine",
  "knowledge-mesh",

  // ── Wave 10.5: ALL 18 deep meta-intelligence engines ─────────────────────
  // Single key "meta-intelligence" gates the entire wave block.
  // Individual keys listed too so they can be selectively re-enabled later.
  "meta-intelligence",
  "engine-interval-tuner",
  "closed-loop-attribution",
  "prompt-evolution-engine",
  "revenue-optimizer-engine",
  "audience-intelligence-engine",
  "predictive-guardian",
  "empire-intelligence-engine",
  "memory-architect",
  "autonomous-experimenter",
  "decision-chronicler",
  "autonomous-capability-engine",
  "internet-benchmark-engine",
  "omni-intelligence-harvester",
  "niche-video-researcher",
  "generation-cohort-tracker",
  "viral-prediction-engine",
  "trend-wave-interceptor",
  "competitor-gap-scanner",

  // ── Misc background agents ────────────────────────────────────────────────
  "critical-alert",
  "self-healing-agent",
  "kernel-seeds",
]);

/**
 * Returns true if the service is allowed to start.
 *
 * Any label NOT in DISABLED_SERVICES is considered enabled.
 * Unknown labels also default to enabled — add them to DISABLED_SERVICES
 * to turn them off.
 */
export function isEnabled(label: string): boolean {
  return !DISABLED_SERVICES.has(label);
}
