/**
 * server/lib/prompt-injection-guard.ts  (hardened v2)
 *
 * checkPromptInjection() — gaming false-positive suppression via 160-char context window.
 * checkSqlInjection()    — IP allowlist (DB-backed with hardcoded fallback), path + query + body.
 *
 * NOTE: The Express promptInjectionGuard() middleware already exists in ai-attack-shield.ts
 * and is wired at /api. This module provides the utility functions for use in:
 *   1. The SQL injection middleware in index.ts
 *   2. AI content generation pipelines where generated text must be scanned
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "./logger";

const log = createLogger("prompt-injection-guard");

// ─── Gaming context window ────────────────────────────────────────────────────
const GAMING_TERMS_PATTERN = new RegExp(
  [
    "assassin'?s creed",
    "assassins creed",
    "valhalla",
    "dragon age",
    "veilguard",
    "battlefield",
    "bf6",
    "ps5",
    "playstation",
    "xbox",
    "stealth",
    "assassin",
    "exploit",
    "glitch",
    "speedrun",
    "boss fight",
    "highlight",
    "montage",
    "walkthrough",
    "playthrough",
    "gameplay",
    "gaming",
    "no commentary",
    "et gaming",
  ].join("|"),
  "i",
);

const CONTEXT_WINDOW = 160;

function hasGamingContextNearMatch(input: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - CONTEXT_WINDOW);
  const end = Math.min(input.length, matchIndex + CONTEXT_WINDOW);
  return GAMING_TERMS_PATTERN.test(input.slice(start, end));
}

// ─── Patterns ─────────────────────────────────────────────────────────────────
type PatternDef = {
  pattern: RegExp;
  label: string;
  alwaysBlock: boolean;
  severity: "critical" | "warning";
};

const PATTERNS: PatternDef[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    label: "instruction_override",
    alwaysBlock: true,
    severity: "critical",
  },
  {
    pattern: /system\s+prompt|<\s*system\s*>/i,
    label: "system_prompt_leak",
    alwaysBlock: true,
    severity: "critical",
  },
  {
    pattern: /jailbreak|DAN\s+mode|developer\s+mode/i,
    label: "jailbreak_attempt",
    alwaysBlock: true,
    severity: "critical",
  },
  {
    pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>/i,
    label: "llm_token_injection",
    alwaysBlock: true,
    severity: "critical",
  },
  {
    pattern: /disregard\s+(your\s+)?(previous|prior|all)\s+(instructions|training)/i,
    label: "training_override",
    alwaysBlock: true,
    severity: "critical",
  },
  {
    pattern: /you\s+are\s+(now|a|an)\s+(?!creator|content)/i,
    label: "persona_injection",
    alwaysBlock: false,
    severity: "warning",
  },
  {
    pattern: /act\s+as\s+(if\s+you\s+are|a|an)\s+(?!my|the|a\s+creator)/i,
    label: "roleplay_injection",
    alwaysBlock: false,
    severity: "warning",
  },
  {
    pattern: /bypass\s+(your|the|all)?\s*(filter|safety|guard|restrict)/i,
    label: "filter_bypass",
    alwaysBlock: false,
    severity: "warning",
  },
];

// ─── IP allowlist (DB-backed with hardcoded fallback) ─────────────────────────
const HARDCODED_TRUSTED_PREFIXES = [
  "35.191.",   // GCP LB health checks
  "130.211.",  // GCP LB health checks
  "209.85.",   // Google crawlers
  "66.249.",   // Googlebot
  "127.",      // localhost
  "10.",       // private RFC 1918
  "192.168.",  // private RFC 1918
  "::1",       // IPv6 localhost
];

let dbAllowlistPrefixes: string[] = [];
let allowlistLoadedAt = 0;
const ALLOWLIST_TTL_MS = 5 * 60 * 1000;

async function isTrustedIp(ip: string): Promise<boolean> {
  if (Date.now() - allowlistLoadedAt > ALLOWLIST_TTL_MS) {
    try {
      const rows = await db.execute<{ ip_prefix: string }>(
        sql`SELECT ip_prefix FROM security_ip_allowlist`,
      );
      dbAllowlistPrefixes = rows.rows.map(r => r.ip_prefix);
      allowlistLoadedAt = Date.now();
    } catch {
      allowlistLoadedAt = Date.now();
      log.debug("[InjectionGuard] DB allowlist unavailable — using hardcoded fallback");
    }
  }

  const prefixes = dbAllowlistPrefixes.length > 0
    ? dbAllowlistPrefixes
    : HARDCODED_TRUSTED_PREFIXES;
  return prefixes.some(prefix => ip.startsWith(prefix));
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface InjectionResult {
  blocked: boolean;
  severity: "critical" | "warning" | "safe";
  label: string | null;
  gamingFalsePositive: boolean;
}

/**
 * Check a string for prompt injection patterns.
 * Critical patterns always block; warning patterns use gaming-context suppression.
 */
export function checkPromptInjection(input: string): InjectionResult {
  if (!input || input.trim().length === 0) {
    return { blocked: false, severity: "safe", label: null, gamingFalsePositive: false };
  }

  for (const { pattern, label, alwaysBlock, severity } of PATTERNS) {
    const match = pattern.exec(input);
    if (!match) continue;

    if (alwaysBlock) {
      return { blocked: true, severity, label, gamingFalsePositive: false };
    }

    if (hasGamingContextNearMatch(input, match.index)) {
      return { blocked: false, severity: "safe", label, gamingFalsePositive: true };
    }

    return { blocked: false, severity: "warning", label, gamingFalsePositive: false };
  }

  return { blocked: false, severity: "safe", label: null, gamingFalsePositive: false };
}

/**
 * Check request input for SQL injection.
 * Input should be: path + query + bounded body slice joined with spaces.
 * Trusted IPs (GCP LB, Google crawlers, localhost) are always allowed.
 */
export async function checkSqlInjection(
  input: string,
  clientIp: string,
): Promise<InjectionResult> {
  if (await isTrustedIp(clientIp)) {
    return { blocked: false, severity: "safe", label: null, gamingFalsePositive: false };
  }

  const SQL_PATTERNS = [
    /(\bor\b|\band\b)\s+\d+=\d+/i,
    /union\s+select/i,
    /;\s*drop\s+table/i,
    /'\s*or\s+'[^']*'\s*=\s*'/i,
    /xp_cmdshell|exec\s*\(/i,
  ];

  for (const p of SQL_PATTERNS) {
    if (p.test(input)) {
      return { blocked: true, severity: "critical", label: "sql_injection", gamingFalsePositive: false };
    }
  }

  return { blocked: false, severity: "safe", label: null, gamingFalsePositive: false };
}
