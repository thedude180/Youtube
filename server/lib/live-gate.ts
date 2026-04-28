/**
 * LIVE GATE
 * ──────────────────────────────────────────────────────────────────────────
 * A tiny in-memory flag that tells all background engines whether a live
 * stream is currently active. When live = true, background pipelines pause
 * so all resources concentrate on the stream.
 *
 * Set by agent-events.ts on stream.started / stream.ended.
 * Checked by the pipeline drip-feed, content-variation engine, and any other
 * background work that should yield to the live stream.
 *
 * Resets to false on server restart — the PS5 detector re-fires stream.started
 * within 90 seconds if still live, which re-arms the gate automatically.
 */

import { setBackgroundAIConcurrency } from "./ai-semaphore";

let _liveActive = false;
let _liveStartedAt: Date | null = null;
let _liveUserId: string | null = null;

export function setLiveActive(userId: string, active: boolean): void {
  _liveActive = active;
  _liveUserId = userId;
  _liveStartedAt = active ? new Date() : null;

  // When live: throttle background AI to 1 concurrent slot so all ~15 background
  // engines yield to real-time stream operations (live chat, SEO, stream ops).
  // When stream ends: restore full background concurrency (5 slots).
  setBackgroundAIConcurrency(active ? 1 : null);
}

export function isLiveActive(): boolean {
  return _liveActive;
}

export function getLiveStatus(): { active: boolean; userId: string | null; startedAt: Date | null } {
  return { active: _liveActive, userId: _liveUserId, startedAt: _liveStartedAt };
}
