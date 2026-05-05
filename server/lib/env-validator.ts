/**
 * env-validator.ts
 *
 * Validates that required environment variables are present at startup.
 * Called once from server/index.ts before any services are initialised.
 *
 * - REQUIRED vars cause a fatal startup error if missing.
 * - WARNED vars log a warning but allow the server to start (feature degrades).
 *
 * Never hard-codes values — only checks for presence.
 */

import { createLogger } from "./logger";

const logger = createLogger("env-validator");

interface EnvSpec {
  key: string;
  required: boolean;
  description: string;
}

const SPECS: EnvSpec[] = [
  // ── Core ────────────────────────────────────────────────────────────────────
  { key: "DATABASE_URL",         required: true,  description: "PostgreSQL connection string" },
  { key: "SESSION_SECRET",       required: true,  description: "Express session secret (min 32 chars)" },

  // ── AI ──────────────────────────────────────────────────────────────────────
  { key: "OPENAI_API_KEY",       required: false, description: "OpenAI API key — AI features degraded without it" },
  { key: "ANTHROPIC_API_KEY",    required: false, description: "Anthropic API key — Claude features unavailable without it" },

  // ── Google / YouTube ────────────────────────────────────────────────────────
  { key: "GOOGLE_CLIENT_ID",     required: false, description: "Google OAuth client ID — YouTube integration disabled without it" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret — YouTube integration disabled without it" },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warned: string[] = [];

  for (const spec of SPECS) {
    const val = process.env[spec.key];
    if (!val || val.trim() === "") {
      if (spec.required) {
        missing.push(`  ✗ ${spec.key} — ${spec.description}`);
      } else {
        warned.push(`  ⚠ ${spec.key} — ${spec.description}`);
      }
    }
  }

  if (warned.length > 0) {
    logger.warn(`Optional env vars not set (features will degrade):\n${warned.join("\n")}`);
  }

  if (missing.length > 0) {
    const msg = `Fatal: required environment variables are missing:\n${missing.join("\n")}\n\nCopy .env.example to .env and fill in the values.`;
    logger.error(msg);
    process.exit(1);
  }

  logger.info("Environment validation passed");
}
