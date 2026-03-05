
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                      // raised from 15 — Replit Postgres handles ~25 total; 20 gives headroom for burst
  idleTimeoutMillis: 20_000,    // release idle connections faster to free up pool slots
  connectionTimeoutMillis: 10_000, // 10 s — fail fast so withRetry can try a fresh connection sooner
  allowExitOnIdle: true,
  statement_timeout: 25_000,
  query_timeout: 25_000,
});

let poolErrorCount = 0;
pool.on("error", (err) => {
  poolErrorCount++;
  const msg = err?.message || String(err);
  if (msg.includes("Connection terminated") || msg.includes("ECONNRESET")) {
    if (poolErrorCount % 10 === 1) {
      console.warn(`[DB Pool] Transient error (count=${poolErrorCount}): ${msg.substring(0, 100)}`);
    }
  } else {
    console.error(`[DB Pool] Unexpected client error (count=${poolErrorCount}):`, msg.substring(0, 150));
  }
});

pool.on("connect", (client) => {
  poolErrorCount = Math.max(0, poolErrorCount - 1);
  // AUDIT FIX: Apply statement_timeout per-connection; Pool constructor options are not reliably applied by all pg versions
  client.query("SET statement_timeout = 25000").catch((err: Error) => {
    console.warn("[DB Pool] Failed to set statement_timeout on new client:", err.message);
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
      console.warn(`[DB Retry] ${label} attempt ${attempt}/${maxRetries} failed (${msg.substring(0, 80)}), retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // AUDIT FIX: Wrap final error with label and attempt count for production debuggability
  console.error(`[DB Retry] ${label} final failure:`, lastErr);
  const wrapped = new Error(`[DB Retry] ${label} failed after ${maxRetries} attempts: ${lastErr?.message}`);
  (wrapped as any).cause = lastErr;
  throw wrapped;
}
