
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
  max: 15,                      // raised from 10 — Replit Postgres handles ~25 total; extra headroom for burst
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // 15 s — fail fast so withRetry can try a fresh connection sooner
  allowExitOnIdle: true,
  statement_timeout: 30_000,
  query_timeout: 30_000,
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

pool.on("connect", () => {
  poolErrorCount = Math.max(0, poolErrorCount - 1);
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

function isTransientDbError(msg: string): boolean {
  return TRANSIENT_DB_ERRORS.some(p => msg.includes(p));
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
  throw lastErr;
}
