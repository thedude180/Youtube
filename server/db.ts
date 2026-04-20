
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
  max: 5,                       // reduced from 10 — 14+ background engines caused thundering herd exhaustion
  idleTimeoutMillis: 30_000,    // longer idle release to avoid churn from rapid acquire/release cycles
  connectionTimeoutMillis: 6_000, // 6s fail-fast so withRetry can try fresh connection sooner
  allowExitOnIdle: false,
  statement_timeout: 25_000,
  query_timeout: 25_000,
  ssl: process.env.REPLIT_DEPLOYMENT
    ? { rejectUnauthorized: false }   // production deployments require SSL
    : (process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined),
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
  client.query("SET statement_timeout = 25000").catch((err: Error) => {
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
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
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
