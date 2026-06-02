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

  // ── Required vars — checked immediately; missing = fatal ──────────────────
  for (const spec of SPECS.filter(s => s.required)) {
    if (!process.env[spec.key]?.trim()) {
      missing.push(`  ✗ ${spec.key} — ${spec.description}`);
    }
  }

  if (missing.length > 0) {
    const msg = `Fatal: required environment variables are missing:\n${missing.join("\n")}\n\nCopy .env.example to .env and fill in the values.`;
    logger.error(msg);
    process.exit(1);
  }

  // ── Optional vars — deferred check at T+10 s ────────────────────────────
  // Replit injects secrets asynchronously during container cold-boot; on a fresh
  // start they can arrive 2–5 s after the Node process begins.  Checking them
  // immediately produces false "key missing" warnings.  Scheduling the check
  // at T+10 s ensures secrets have been fully injected before we log anything.
  const optionalMissing = SPECS.filter(
    s => !s.required && !process.env[s.key]?.trim()
  );

  if (optionalMissing.length > 0) {
    setTimeout(() => {
      const stillMissing = optionalMissing.filter(s => !process.env[s.key]?.trim());
      if (stillMissing.length > 0) {
        logger.warn(
          `Optional env vars not set (features will degrade):\n` +
          stillMissing.map(s => `  ⚠ ${s.key} — ${s.description}`).join("\n")
        );
      }
      // If stillMissing.length === 0, keys arrived via Replit secret injection — all good
    }, 10_000);
  }

  logger.info("Environment validation passed");
}
