/**
 * strategy-bus.ts — per-user in-memory pub/sub for strategic directives.
 *
 * When the YouTube AI Orchestrator completes a full strategy synthesis cycle and
 * writes a new strategic directive to masterKnowledgeBank, it also publishes to
 * this bus so every running engine can pick up the new direction on its next tick
 * without polling the database.
 *
 * Exports:
 *   publishDirective(userId, directive)    — store + notify subscribers
 *   getLatestDirective(userId)             — latest cached directive (or null)
 *   subscribeDirective(userId, cb)         — returns an unsubscribe fn
 *   getDirectiveAgeMs(userId)              — ms since last publish (Infinity if none)
 *
 * All writes are in-process only — no DB, no network, never throws.
 */

type DirectiveCallback = (directive: string) => void;

const _latest = new Map<string, { directive: string; publishedAt: number }>();
const _subs   = new Map<string, Set<DirectiveCallback>>();

/**
 * Publish a new strategic directive for a user.
 * All registered subscribers are called synchronously before returning.
 */
export function publishDirective(userId: string, directive: string): void {
  if (!directive?.trim()) return;
  _latest.set(userId, { directive: directive.slice(0, 600), publishedAt: Date.now() });
  const subs = _subs.get(userId);
  if (subs) {
    for (const cb of subs) {
      try { cb(directive); } catch { /* subscriber errors never propagate */ }
    }
  }
}

/**
 * Get the latest cached strategic directive for a user.
 * Returns null if no directive has been published since process start.
 */
export function getLatestDirective(userId: string): string | null {
  return _latest.get(userId)?.directive ?? null;
}

/**
 * Register a callback that fires when a new directive is published.
 * Returns an unsubscribe function — call it to stop receiving updates.
 */
export function subscribeDirective(userId: string, cb: DirectiveCallback): () => void {
  if (!_subs.has(userId)) _subs.set(userId, new Set());
  _subs.get(userId)!.add(cb);
  return () => { _subs.get(userId)?.delete(cb); };
}

/**
 * Age of the latest published directive in milliseconds.
 * Returns Infinity when no directive has been published yet.
 */
export function getDirectiveAgeMs(userId: string): number {
  const entry = _latest.get(userId);
  return entry ? Date.now() - entry.publishedAt : Infinity;
}
