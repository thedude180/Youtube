
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { createLogger } from "./lib/logger";

const dbLogger = createLogger("db-pool");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,                      // 30 slots — headroom for 146 background services competing during memory recovery
  idleTimeoutMillis: 10_000,    // release idle connections quickly to keep headroom
  connectionTimeoutMillis: 5_000, // 5s wait for a pool slot — fail fast so services don't pile up
  allowExitOnIdle: false,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  ssl: (
    process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT ||
    process.env.DATABASE_URL?.includes("sslmode=require") ||
    process.env.DATABASE_URL?.includes("ssl=true")
  ) ? { rejectUnauthorized: false } : undefined,
});

let poolErrorCount = 0;
pool.on("error", (err) => {
  poolErrorCount++;
  const msg = err?.message || String(err);
  if (msg.includes("Connection terminated") || msg.includes("ECONNRESET")) {
    if (poolErrorCount % 10 === 1) {
      dbLogger.warn("Transient pool error", { count: poolErrorCount, error: msg.substring(0, 100) });
    }
  } else {
    dbLogger.error("Unexpected pool error", { count: poolErrorCount, error: msg.substring(0, 150) });
  }
});

pool.on("connect", (client) => {
  poolErrorCount = Math.max(0, poolErrorCount - 1);
  // AUDIT FIX: Apply statement_timeout per-connection; Pool constructor options are not reliably applied by all pg versions
  client.query("SET statement_timeout = 10000").catch((err: Error) => {
    dbLogger.warn("Failed to set statement_timeout", { error: err.message });
  });
});

export const db = drizzle(pool, { schema });

const TRANSIENT_DB_ERRORS = [
  "Connection terminated",
  "Authentication timed out",
  "connection refused",
  "too many clients",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "Client has encountered a connection error",
  "terminating connection",
  "Connection lost",
  "socket hang up",
  "remaining connection slots are reserved",
  "server closed the connection unexpectedly",
  "could not connect to server",
  "the database system is starting up",
  "the database system is shutting down",
  "timeout exceeded when trying to connect",
  "Query read timeout",
  "query_timeout",
  "statement_timeout",
  "connection timeout",
];

// AUDIT FIX: Lowercase both sides to handle mixed-case DB driver error messages (e.g. "Connection Refused" vs "connection refused")
function isTransientDbError(msg: string): boolean {
  const msgL = (msg || "").toLowerCase();
  return TRANSIENT_DB_ERRORS.some(p => msgL.includes(p.toLowerCase()));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label = "db-op",
  maxRetries = 3,
): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (!isTransientDbError(msg) || attempt === maxRetries) break;
      // Add ±30% jitter to prevent thundering herd when all 146 background services retry simultaneously
      const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      const jitter = Math.floor(baseDelay * 0.3 * (Math.random() * 2 - 1));
      const delay = Math.max(200, baseDelay + jitter);
      dbLogger.warn("DB retry", { label, attempt, maxRetries, error: msg.substring(0, 80), retryMs: delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // AUDIT FIX: Wrap final error with label and attempt count for production debuggability
  dbLogger.error("DB retry final failure", { label, maxRetries, error: String(lastErr) });
  const wrapped = new Error(`[DB Retry] ${label} failed after ${maxRetries} attempts: ${lastErr?.message}`);
  (wrapped as any).cause = lastErr;
  throw wrapped;
}
