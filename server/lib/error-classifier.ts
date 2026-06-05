/**
 * server/lib/error-classifier.ts
 *
 * Phase 7 — Error Classifier
 *
 * Takes an error object + context and returns a structured classification:
 * { code, severity, action, retryAfter?, human_required }
 *
 * Each error code maps to a repair policy that the self-healing engine
 * and command center use to decide what to do next.
 */

export type ErrorCode =
  | "YOUTUBE_QUOTA_EXCEEDED"
  | "YOUTUBE_TOKEN_MISSING"
  | "YOUTUBE_CHANNEL_INVALID"
  | "YOUTUBE_RSS_404"
  | "AI_QUEUE_FULL"
  | "AI_BUDGET_EXHAUSTED"
  | "AI_PROVIDER_KEY_MISSING"
  | "AI_INVALID_JSON"
  | "AI_INVALID_SCHEMA"
  | "DB_TABLE_MISSING"
  | "DB_QUERY_FAILED"
  | "MEMORY_PRESSURE"
  | "CRON_OVERLAP"
  | "UNSUPPORTED_PLATFORM"
  | "YTDLP_FORMAT_UNAVAILABLE"
  | "YTDLP_TIMEOUT"
  | "INNERTUBE_INVALID_ARGUMENT"
  | "PRODUCTION_GUARD"
  | "KILL_SWITCH_ACTIVE"
  | "UNKNOWN";

export type ErrorSeverity = "critical" | "high" | "medium" | "low";

export type RepairAction =
  | "defer"           // delay the job until a cooldown expires
  | "skip"            // skip this job permanently (bad target)
  | "blacklist"       // add to a blacklist and never retry
  | "reconnect"       // channel needs OAuth reconnect
  | "degrade"         // continue in reduced-capability mode
  | "retry_backoff"   // retry with exponential backoff
  | "suppress_log"    // just suppress the noise
  | "human_review"    // escalate to human
  | "none";           // no automatic action

export interface ErrorClassification {
  code: ErrorCode;
  severity: ErrorSeverity;
  action: RepairAction;
  retryAfterMs?: number;
  human_required: boolean;
  message: string;
}

export interface ClassifyContext {
  module?: string;
  userId?: string;
  channelId?: string;
  jobId?: string | number;
}

const MIDNIGHT_PACIFIC_MS = () => {
  const now = new Date();
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const midnight = new Date(pacific);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() - pacific.getTime();
};

/**
 * Classify an error into a structured repair policy.
 */
export function classifyError(
  err: unknown,
  ctx: ClassifyContext = {},
): ErrorClassification {
  const msg = extractMessage(err).toLowerCase();
  const code = extractCode(err);
  const status = extractStatus(err);
  const stack = extractStack(err).toLowerCase();
  const allText = `${msg} ${code} ${stack}`;

  // ── YouTube quota exhausted ────────────────────────────────────────────────
  if (
    allText.includes("quota") ||
    allText.includes("dailylimitexceeded") ||
    code === "QUOTA_EXCEEDED" ||
    (status === 403 && allText.includes("quota"))
  ) {
    return {
      code: "YOUTUBE_QUOTA_EXCEEDED",
      severity: "high",
      action: "defer",
      retryAfterMs: MIDNIGHT_PACIFIC_MS(),
      human_required: false,
      message: "YouTube API daily quota exhausted — all API calls deferred until midnight Pacific",
    };
  }

  // ── YouTube token missing ──────────────────────────────────────────────────
  if (
    allText.includes("access token") ||
    allText.includes("refresh token") ||
    allText.includes("oauth") ||
    allText.includes("invalid_grant") ||
    allText.includes("token missing") ||
    allText.includes("token expired") ||
    status === 401
  ) {
    return {
      code: "YOUTUBE_TOKEN_MISSING",
      severity: "high",
      action: "reconnect",
      human_required: true,
      message: "YouTube OAuth token missing or expired — channel needs reconnect",
    };
  }

  // ── YouTube channel invalid ────────────────────────────────────────────────
  if (
    allText.includes("channelvalidation") ||
    allText.includes("invalid channel id") ||
    allText.includes("channel not found") ||
    allText.includes("ucdemo")
  ) {
    return {
      code: "YOUTUBE_CHANNEL_INVALID",
      severity: "medium",
      action: "skip",
      human_required: false,
      message: "YouTube channel ID is invalid or demo — all jobs for this channel are skipped",
    };
  }

  // ── RSS 404 ────────────────────────────────────────────────────────────────
  if (
    (allText.includes("rss") || allText.includes("feed")) &&
    (allText.includes("404") || allText.includes("not found"))
  ) {
    return {
      code: "YOUTUBE_RSS_404",
      severity: "low",
      action: "suppress_log",
      human_required: false,
      message: "YouTube RSS feed returned 404 — invalid channel or feed not found",
    };
  }

  // ── AI queue full ──────────────────────────────────────────────────────────
  if (
    allText.includes("ai queue full") ||
    allText.includes("queue full") ||
    allText.includes("semaphore") ||
    allText.includes("request dropped")
  ) {
    return {
      code: "AI_QUEUE_FULL",
      severity: "medium",
      action: "defer",
      retryAfterMs: 5 * 60_000,
      human_required: false,
      message: "AI queue at capacity — request deferred",
    };
  }

  // ── AI budget exhausted ────────────────────────────────────────────────────
  if (
    allText.includes("budget") ||
    allText.includes("hourly cap") ||
    allText.includes("token limit") ||
    allText.includes("rate limit") ||
    status === 429
  ) {
    return {
      code: "AI_BUDGET_EXHAUSTED",
      severity: "medium",
      action: "defer",
      retryAfterMs: 60 * 60_000,
      human_required: false,
      message: "AI token budget exhausted — deferred until next hour",
    };
  }

  // ── AI provider key missing ────────────────────────────────────────────────
  if (
    allText.includes("api key") ||
    allText.includes("no api key") ||
    allText.includes("openai_api_key") ||
    allText.includes("anthropic_api_key") ||
    allText.includes("unauthorized") && (allText.includes("openai") || allText.includes("anthropic"))
  ) {
    return {
      code: "AI_PROVIDER_KEY_MISSING",
      severity: "critical",
      action: "human_review",
      human_required: true,
      message: "AI provider API key missing — all AI calls will fail",
    };
  }

  // ── AI invalid JSON ────────────────────────────────────────────────────────
  if (
    allText.includes("invalid json") ||
    allText.includes("json parse") ||
    allText.includes("syntaxerror") ||
    allText.includes("unexpected token") ||
    allText.includes("all recovery attempts failed")
  ) {
    return {
      code: "AI_INVALID_JSON",
      severity: "low",
      action: "retry_backoff",
      retryAfterMs: 30_000,
      human_required: false,
      message: "AI returned invalid JSON — retrying with backoff",
    };
  }

  // ── AI invalid schema ──────────────────────────────────────────────────────
  if (
    allText.includes("invalid schema") ||
    allText.includes("zod") ||
    allText.includes("validation error") ||
    allText.includes("missing required")
  ) {
    return {
      code: "AI_INVALID_SCHEMA",
      severity: "low",
      action: "skip",
      human_required: false,
      message: "AI response failed schema validation — skipping this job",
    };
  }

  // ── DB table missing ───────────────────────────────────────────────────────
  if (
    allText.includes("relation") && allText.includes("does not exist") ||
    allText.includes("table") && allText.includes("does not exist") ||
    allText.includes("no such table") ||
    allText.includes("failed query") && allText.includes("does not exist")
  ) {
    return {
      code: "DB_TABLE_MISSING",
      severity: "high",
      action: "degrade",
      human_required: false,
      message: "Database table missing — feature degraded until schema is updated",
    };
  }

  // ── DB query failed ────────────────────────────────────────────────────────
  if (
    allText.includes("db") ||
    allText.includes("database") ||
    allText.includes("postgres") ||
    allText.includes("connection") && allText.includes("refused") ||
    code === "ECONNREFUSED"
  ) {
    return {
      code: "DB_QUERY_FAILED",
      severity: "high",
      action: "retry_backoff",
      retryAfterMs: 10_000,
      human_required: false,
      message: "Database query failed — retrying with backoff",
    };
  }

  // ── Memory pressure ────────────────────────────────────────────────────────
  if (
    allText.includes("memory") ||
    allText.includes("oom") ||
    allText.includes("heap") ||
    allText.includes("insufficient container memory")
  ) {
    return {
      code: "MEMORY_PRESSURE",
      severity: "high",
      action: "defer",
      retryAfterMs: 10 * 60_000,
      human_required: false,
      message: "Container memory pressure — heavy jobs deferred",
    };
  }

  // ── Cron overlap ───────────────────────────────────────────────────────────
  if (
    allText.includes("already running") ||
    allText.includes("cycle already active") ||
    allText.includes("overlap")
  ) {
    return {
      code: "CRON_OVERLAP",
      severity: "low",
      action: "suppress_log",
      human_required: false,
      message: "Cron job already running — skipping this invocation",
    };
  }

  // ── Unsupported platform ───────────────────────────────────────────────────
  if (
    allText.includes("youtube-only") ||
    allText.includes("unsupported platform") ||
    allText.includes("tiktok") ||
    allText.includes("rumble") ||
    allText.includes("kick.com")
  ) {
    return {
      code: "UNSUPPORTED_PLATFORM",
      severity: "low",
      action: "skip",
      human_required: false,
      message: "Unsupported platform — YouTube-only mode is active",
    };
  }

  // ── yt-dlp format unavailable ──────────────────────────────────────────────
  if (
    allText.includes("format") && (allText.includes("not available") || allText.includes("no video"))
  ) {
    return {
      code: "YTDLP_FORMAT_UNAVAILABLE",
      severity: "low",
      action: "blacklist",
      human_required: false,
      message: "yt-dlp: video format not available — blacklisting this video",
    };
  }

  // ── yt-dlp timeout ─────────────────────────────────────────────────────────
  if (
    allText.includes("ytdlp") && allText.includes("timeout") ||
    allText.includes("yt-dlp") && allText.includes("timeout") ||
    allText.includes("timed out") && allText.includes("download")
  ) {
    return {
      code: "YTDLP_TIMEOUT",
      severity: "medium",
      action: "retry_backoff",
      retryAfterMs: 30 * 60_000,
      human_required: false,
      message: "yt-dlp download timed out — retrying with backoff",
    };
  }

  // ── InnerTube invalid argument ─────────────────────────────────────────────
  if (
    allText.includes("innertube") ||
    allText.includes("invalid argument") && allText.includes("youtube")
  ) {
    return {
      code: "INNERTUBE_INVALID_ARGUMENT",
      severity: "medium",
      action: "skip",
      human_required: false,
      message: "YouTube InnerTube API returned invalid argument — skipping this call",
    };
  }

  // ── Production guard ───────────────────────────────────────────────────────
  if (
    allText.includes("productionguar") ||
    allText.includes("demo or phantom") ||
    allText.includes("productionguarderror")
  ) {
    return {
      code: "PRODUCTION_GUARD",
      severity: "medium",
      action: "skip",
      human_required: false,
      message: "Production guard blocked automation for demo/phantom account",
    };
  }

  // ── Kill switch ────────────────────────────────────────────────────────────
  if (allText.includes("kill switch") || allText.includes("killswitch")) {
    return {
      code: "KILL_SWITCH_ACTIVE",
      severity: "low",
      action: "suppress_log",
      human_required: false,
      message: "Kill switch is active — module paused",
    };
  }

  // ── Unknown ────────────────────────────────────────────────────────────────
  return {
    code: "UNKNOWN",
    severity: "medium",
    action: "none",
    human_required: false,
    message: extractMessage(err) || "Unknown error",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return String(e.message ?? e.msg ?? e.error ?? "");
  }
  return String(err);
}

function extractCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    return String((err as Record<string, unknown>).code ?? "");
  }
  return "";
}

function extractStatus(err: unknown): number {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return Number(e.status ?? e.statusCode ?? e.code ?? 0);
  }
  return 0;
}

function extractStack(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    return String((err as Record<string, unknown>).stack ?? "");
  }
  return "";
}
