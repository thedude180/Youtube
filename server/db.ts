
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
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected client error:", err.message);
});

export const db = drizzle(pool, { schema });

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
      const isTransient =
        msg.includes("Connection terminated") ||
        msg.includes("Authentication timed out") ||
        msg.includes("connection refused") ||
        msg.includes("too many clients") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("Client has encountered a connection error");
      if (!isTransient || attempt === maxRetries) break;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.warn(`[DB Retry] ${label} attempt ${attempt}/${maxRetries} failed (${msg.substring(0, 80)}), retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
