import { createLogger } from "../lib/logger";

const logger = createLogger("token-budget-alert");

const ALERT_THRESHOLD = 0.8;

// In-memory log-dedup: one log line per engine per UTC day, not per token spend.
const _loggedToday = new Set<string>();

function utcDay(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Called from TokenBudgetGuard.consumeBudget() on every token spend.
 *
 * Quota exhaustion is expected, self-healing behaviour — the system pauses
 * AI calls and resumes automatically at UTC midnight. No email or in-app
 * notification is sent; only an internal log entry is written (once per
 * engine per UTC day) so the behaviour is still observable in server logs.
 */
export async function checkAndAlertTokenBudget(
  engine: string,
  used: number,
  cap: number
): Promise<void> {
  if (used / cap < ALERT_THRESHOLD) return;

  const key = `${engine}|${utcDay()}`;
  if (_loggedToday.has(key)) return;
  _loggedToday.add(key);

  const pct = Math.round((used / cap) * 100);
  logger.warn(`[TokenBudget] ${engine} at ${pct}% (${used}/${cap}) — will pause and auto-resume at midnight UTC`);
}
