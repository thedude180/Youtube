#!/usr/bin/env node
/**
 * CreatorOS AI Audit Script
 * Sends codebase sections to GPT for structured audit and writes audit-report.md
 * Usage: node scripts/audit.mjs
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const client = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-5-mini";
const MAX_CHARS_PER_FILE = 15_000;
const MAX_CHARS_PER_BUCKET = 60_000;
const DELAY_BETWEEN_CALLS_MS = 1000;

const AUDIT_SYSTEM_PROMPT = `You are a senior full-stack software engineer and security auditor performing a thorough code review of a production SaaS application called CreatorOS (an AI-powered content creator platform built with React/Vite frontend, Express.js backend, PostgreSQL via Drizzle ORM, and OpenAI integration).

Your job is to find REAL problems — not nitpicks. Focus on:

1. **BROKEN CODE** — Things that will throw errors, crash, return wrong results, or silently fail
2. **PRODUCTION RISKS** — Unhandled promise rejections, race conditions, missing error handling, data loss paths, infinite loops, missing null checks that will crash on real data
3. **SECURITY VULNERABILITIES** — Auth bypasses, SQL injection risk, exposed secrets, CSRF gaps, insecure direct object references, privilege escalation
4. **PERFORMANCE PROBLEMS** — N+1 queries, unbounded loops, missing pagination, memory leaks, heavy synchronous operations on the event loop
5. **LOGIC BUGS** — Wrong conditions, off-by-one errors, incorrect state transitions, missing edge cases

For each finding, output in this exact format:
---FINDING---
Severity: [CRITICAL | HIGH | MEDIUM | LOW]
File: [filename or "multiple files"]
Line: [line number or "N/A"]
Category: [Broken Code | Production Risk | Security | Performance | Logic Bug | Code Quality]
Problem: [clear description of what is wrong]
Impact: [what will actually happen because of this bug]
Fix: [specific, actionable recommendation]
---END---

After all findings, write a brief SUMMARY section with overall assessment.

Be direct and specific. If you don't find a real problem, say so — don't invent issues. Only report things that genuinely matter.`;

const SYNTHESIS_PROMPT = `You are a senior engineering lead reviewing the combined findings from a full codebase audit of CreatorOS (a production AI-powered SaaS app).

Below are all findings from every section of the codebase. Your job is to:
1. Identify and merge duplicate findings
2. Re-rank everything by actual risk/impact
3. Produce a final PRIORITY ISSUES LIST — all CRITICAL and HIGH severity items ranked from most dangerous to least
4. Then list MEDIUM items
5. Then list LOW items
6. End with an EXECUTIVE SUMMARY (3-5 sentences) about the overall health of the codebase

Format the priority list as:
## 🔴 CRITICAL
[numbered list]

## 🟠 HIGH  
[numbered list]

## 🟡 MEDIUM
[numbered list]

## 🟢 LOW
[numbered list]

## Executive Summary
[paragraph]`;

const BUCKETS = [
  {
    name: "Database Schema & Storage",
    description: "Drizzle ORM schema definitions, database configuration, and storage interface",
    files: [
      "shared/schema.ts",
      "server/db.ts",
      "server/storage.ts",
    ],
  },
  {
    name: "Authentication & Security",
    description: "Auth setup, security hardening, stealth guardrails, fortress routes",
    files: [
      "server/replit_integrations/auth/index.ts",
      "server/lib/security-hardening.ts",
      "server/stealth-guardrails.ts",
      "server/services/security-fortress.ts",
      "server/routes/fortress.ts",
      "server/routes/helpers.ts",
      "server/token-refresh.ts",
    ],
  },
  {
    name: "Payments & Subscriptions",
    description: "Stripe integration, subscription management, upgrade routes",
    files: [
      "server/stripeClient.ts",
      "server/stripe-seed.ts",
      "server/services/stripe-hardening.ts",
      "server/routes/upgrades.ts",
      "server/services/usage-metering.ts",
    ],
  },
  {
    name: "AI Engines & Orchestration",
    description: "Core AI engine, agent orchestrator, stream agent, autopilot engine",
    files: [
      "server/ai-engine.ts",
      "server/services/agent-orchestrator.ts",
      "server/services/stream-agent.ts",
      "server/autopilot-engine.ts",
      "server/lib/openai.ts",
    ],
  },
  {
    name: "Background Engines",
    description: "Content loop, daily content engine, VOD optimizer, auto-thumbnail, push scheduler",
    files: [
      "server/content-loop.ts",
      "server/daily-content-engine.ts",
      "server/vod-optimizer-engine.ts",
      "server/auto-thumbnail-engine.ts",
      "server/services/push-scheduler.ts",
      "server/services/cleanup-coordinator.ts",
      "server/services/performance-optimizer.ts",
    ],
  },
  {
    name: "Core Backend Routes",
    description: "Content, stream, money, settings, AI, and automation routes",
    files: [
      "server/routes/content.ts",
      "server/routes/stream.ts",
      "server/routes/money.ts",
      "server/routes/settings.ts",
      "server/routes/ai.ts",
      "server/routes/automation.ts",
      "server/routes/platform.ts",
    ],
  },
  {
    name: "Frontend Core",
    description: "App entry point, query client, auth hook, key page components",
    files: [
      "client/src/App.tsx",
      "client/src/lib/queryClient.ts",
      "client/src/hooks/use-auth.ts",
      "client/src/hooks/use-login-sync.ts",
      "client/src/lib/offline-engine.ts",
      "client/src/components/AuthForm.tsx",
      "client/src/pages/Settings.tsx",
      "client/src/pages/Pricing.tsx",
    ],
  },
  {
    name: "YouTube & Platform Integrations",
    description: "YouTube manager, OAuth handling, multistream, webhook handlers",
    files: [
      "server/youtube.ts",
      "server/youtube-manager.ts",
      "server/webhookHandlers.ts",
      "server/routes/multistream.ts",
      "server/services/webhook-verify.ts",
      "server/services/youtube-quota-tracker.ts",
    ],
  },
];

function readFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return null;
  try {
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.length > MAX_CHARS_PER_FILE) {
      return content.slice(0, MAX_CHARS_PER_FILE) + `\n\n... [TRUNCATED — file continues for ${content.length - MAX_CHARS_PER_FILE} more chars]`;
    }
    return content;
  } catch {
    return null;
  }
}

function buildBucketContent(bucket) {
  const parts = [];
  for (const file of bucket.files) {
    const content = readFile(file);
    if (!content) {
      parts.push(`// FILE: ${file}\n// [FILE NOT FOUND — skipped]\n`);
      continue;
    }
    parts.push(`${"=".repeat(80)}\n// FILE: ${file}\n${"=".repeat(80)}\n${content}\n`);
  }
  let combined = parts.join("\n");
  if (combined.length > MAX_CHARS_PER_BUCKET) {
    combined = combined.slice(0, MAX_CHARS_PER_BUCKET) + "\n\n... [BUCKET TRUNCATED due to size limit]";
  }
  return combined;
}

async function streamCompletion(messages, label) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_completion_tokens: 20_000,
    stream: true,
  });

  let result = "";
  let dotCount = 0;
  process.stdout.write("   ");
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    result += delta;
    if (delta && ++dotCount % 40 === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");
  return result;
}

async function auditBucket(bucket) {
  console.log(`\n🔍 Auditing: ${bucket.name}...`);
  const code = buildBucketContent(bucket);
  const userMessage = `Audit this section of the CreatorOS codebase.

Section: ${bucket.name}
Description: ${bucket.description}

Files included: ${bucket.files.join(", ")}

CODE:
${code}`;

  const result = await streamCompletion([
    { role: "system", content: AUDIT_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ], bucket.name);

  console.log(`   ✅ Done — ${result.length} chars of findings`);
  return result || "No findings returned for this section.";
}

async function synthesizeFindings(allFindings) {
  console.log("\n🧠 Synthesizing all findings into priority list...");
  const combined = allFindings
    .map((f, i) => `### Section ${i + 1}: ${BUCKETS[i].name}\n${f}`)
    .join("\n\n---\n\n");

  const result = await streamCompletion([
    { role: "system", content: SYNTHESIS_PROMPT },
    { role: "user", content: `Here are all audit findings from every section of the codebase:\n\n${combined.slice(0, 80_000)}` },
  ], "Synthesis");

  console.log(`   ✅ Synthesis complete`);
  return result || "No synthesis returned.";
}

function writeReport(synthesis, bucketFindings) {
  const now = new Date().toISOString();
  const lines = [
    `# CreatorOS — AI Audit Report`,
    `**Generated:** ${now}  `,
    `**Model:** ${MODEL}  `,
    `**Sections audited:** ${BUCKETS.length}  `,
    "",
    "---",
    "",
    "# PART 1: PRIORITY ISSUES",
    "",
    synthesis,
    "",
    "---",
    "",
    "# PART 2: DETAILED FINDINGS BY SECTION",
    "",
  ];

  for (let i = 0; i < BUCKETS.length; i++) {
    lines.push(`## Section ${i + 1}: ${BUCKETS[i].name}`);
    lines.push(`*Files: ${BUCKETS[i].files.join(", ")}*`);
    lines.push("");
    lines.push(bucketFindings[i]);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const report = lines.join("\n");
  const outPath = path.join(ROOT, "audit-report.md");
  fs.writeFileSync(outPath, report, "utf8");
  return outPath;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 CreatorOS AI Audit Starting...");
  console.log(`   Model: ${MODEL}`);
  console.log(`   Sections: ${BUCKETS.length}`);
  console.log(`   Output: audit-report.md`);

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.error("❌ AI_INTEGRATIONS_OPENAI_API_KEY not set. Cannot run audit.");
    process.exit(1);
  }

  const bucketFindings = [];

  for (let i = 0; i < BUCKETS.length; i++) {
    if (i > 0) await sleep(DELAY_BETWEEN_CALLS_MS);
    try {
      const findings = await auditBucket(BUCKETS[i]);
      bucketFindings.push(findings);
    } catch (err) {
      console.error(`   ❌ Error auditing ${BUCKETS[i].name}:`, err.message);
      bucketFindings.push(`**Error during audit of this section:** ${err.message}`);
    }
  }

  await sleep(DELAY_BETWEEN_CALLS_MS);
  let synthesis;
  try {
    synthesis = await synthesizeFindings(bucketFindings);
  } catch (err) {
    console.error("   ❌ Error during synthesis:", err.message);
    synthesis = `**Synthesis failed:** ${err.message}\n\nSee detailed findings below.`;
  }

  const outPath = writeReport(synthesis, bucketFindings);
  console.log(`\n✅ Audit complete! Report written to: ${outPath}`);
  console.log("   Open audit-report.md to view the full findings.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
