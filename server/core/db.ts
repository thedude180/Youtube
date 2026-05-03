import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../shared/schema/index.js";
import { createLogger } from "./logger.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const log = createLogger("db");

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,
  ssl: process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on("error", (err) => {
  log.warn("Pool error", { message: err.message });
});

pool.on("connect", (client) => {
  client.query("SET statement_timeout = 15000").catch(() => {});
});

export const db = drizzle(pool, { schema });

const TRANSIENT = [
  "connection terminated", "connection refused", "too many clients",
  "econnreset", "etimedout", "econnrefused", "socket hang up",
  "statement_timeout", "query_timeout", "connection timeout",
  "server closed the connection", "could not connect",
];

function isTransient(msg: string): boolean {
  const m = msg.toLowerCase();
  return TRANSIENT.some((t) => m.includes(t));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label = "query",
  maxAttempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isTransient(msg) || i === maxAttempts) break;
      const delay = Math.min(500 * 2 ** (i - 1), 4_000) * (0.7 + Math.random() * 0.6);
      log.warn("DB retry", { label, attempt: i, delay: Math.round(delay) });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`[DB] ${label} failed after ${maxAttempts} attempts: ${(last as Error)?.message}`);
}
