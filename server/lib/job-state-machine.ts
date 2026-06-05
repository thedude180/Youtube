/**
 * server/lib/job-state-machine.ts
 *
 * Phase 11 — Job State Machine
 *
 * Enforces valid job state transitions for all queue tables.
 * Blocked transitions (from spec):
 *   - blocked       → running
 *   - quota_blocked → running
 *   - demo_user     → running
 *   - failed        → running  (without backoff)
 *   - budget_exhausted → running (before reset)
 *
 * Call validateTransition() before every status update to a queue table.
 * Throws JobStateError for invalid transitions.
 */

import { createLogger } from "./logger";

const log = createLogger("job-state-machine");

export type JobStatus =
  | "pending"
  | "queued"
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"
  | "deferred"
  | "blocked"
  | "quota_blocked"
  | "budget_exhausted"
  | "demo_user"
  | "needs_reconnect"
  | "paused";

export interface JobTransitionContext {
  jobId?: string | number;
  module?: string;
  userId?: string;
  backoffMs?: number;         // required when transitioning from "failed" → something
  reason?: string;
}

export class JobStateError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    reason: string,
    public readonly context: JobTransitionContext,
  ) {
    super(`[JobStateMachine] Invalid transition ${from} → ${to}: ${reason}`);
    this.name = "JobStateError";
  }
}

// ── Allowed transitions ───────────────────────────────────────────────────────
// Map from → Set of allowed "to" states.
const ALLOWED: Partial<Record<JobStatus, Set<JobStatus>>> = {
  pending:          new Set(["queued", "scheduled", "running", "skipped", "cancelled", "deferred"]),
  queued:           new Set(["running", "scheduled", "deferred", "skipped", "cancelled", "blocked", "quota_blocked", "budget_exhausted"]),
  scheduled:        new Set(["queued", "running", "deferred", "skipped", "cancelled", "blocked"]),
  running:          new Set(["completed", "failed", "skipped", "cancelled", "deferred"]),
  failed:           new Set(["queued", "deferred", "skipped", "cancelled"]),  // NOT running directly
  deferred:         new Set(["queued", "running", "skipped", "cancelled"]),
  paused:           new Set(["queued", "running", "cancelled"]),
  completed:        new Set([]),   // terminal — no transitions out
  skipped:          new Set([]),   // terminal
  cancelled:        new Set([]),   // terminal
  blocked:          new Set(["queued", "deferred", "skipped", "cancelled"]),  // NOT running
  quota_blocked:    new Set(["deferred", "queued", "skipped", "cancelled"]),  // NOT running
  budget_exhausted: new Set(["deferred", "queued", "skipped", "cancelled"]),  // NOT running
  demo_user:        new Set(["skipped", "cancelled"]),                         // NOT running, ever
  needs_reconnect:  new Set(["queued", "cancelled", "skipped"]),
};

// Additional context-sensitive rules
const REQUIRES_BACKOFF_FROM = new Set<JobStatus>(["failed"]);
const MIN_BACKOFF_MS = 5_000;

/**
 * Validate a job state transition.
 * @throws JobStateError if the transition is invalid.
 */
export function validateTransition(
  from: JobStatus | string,
  to: JobStatus | string,
  ctx: JobTransitionContext = {},
): void {
  const fromStatus = from as JobStatus;
  const toStatus = to as JobStatus;

  const allowed = ALLOWED[fromStatus];

  // Unknown "from" state — allow but warn
  if (!allowed) {
    log.warn(`[JobStateMachine] Unknown source state "${from}" → "${to}" (job ${ctx.jobId ?? "?"})`);
    return;
  }

  if (!allowed.has(toStatus)) {
    throw new JobStateError(
      from,
      to,
      `transition not allowed from ${from}`,
      ctx,
    );
  }

  // Extra rule: transitioning out of "failed" to "queued"/"running" requires backoff
  if (REQUIRES_BACKOFF_FROM.has(fromStatus) && (toStatus === "running" || toStatus === "queued")) {
    if (!ctx.backoffMs || ctx.backoffMs < MIN_BACKOFF_MS) {
      throw new JobStateError(
        from,
        to,
        `transition from "failed" requires backoffMs >= ${MIN_BACKOFF_MS}ms`,
        ctx,
      );
    }
  }
}

/**
 * Safe version — logs invalid transitions instead of throwing.
 * Returns true if transition is valid, false otherwise.
 */
export function safeValidateTransition(
  from: JobStatus | string,
  to: JobStatus | string,
  ctx: JobTransitionContext = {},
): boolean {
  try {
    validateTransition(from, to, ctx);
    return true;
  } catch (err: any) {
    log.warn(err.message, ctx);
    return false;
  }
}

/**
 * Determine the correct next state for a job that failed.
 * Returns "deferred" if we should retry later, "failed" to mark as failed,
 * "skipped" if the error is permanent.
 */
export function nextStateAfterFailure(
  errorCode: string,
  attemptCount: number,
): JobStatus {
  const perm = new Set([
    "YOUTUBE_CHANNEL_INVALID",
    "UNSUPPORTED_PLATFORM",
    "PRODUCTION_GUARD",
    "YTDLP_FORMAT_UNAVAILABLE",
    "AI_INVALID_SCHEMA",
  ]);
  if (perm.has(errorCode)) return "skipped";

  if (
    errorCode === "YOUTUBE_QUOTA_EXCEEDED" ||
    errorCode === "AI_BUDGET_EXHAUSTED"
  ) return "deferred";

  if (attemptCount >= 3) return "failed";

  return "deferred";
}
