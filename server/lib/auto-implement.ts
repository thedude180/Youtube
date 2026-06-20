/**
 * Auto-Implement
 *
 * Shared implementation engine used by both the self-architect (autonomous path)
 * and the admin dashboard (manual override path).
 *
 * Given a serviceProposal, it:
 *   1. Calls Claude to expand the scaffold into a full production implementation
 *   2. Writes the TypeScript file to server/services/<name>.ts
 *   3. Registers the init function in server/services/_auto-init.ts
 *   4. Marks the proposal as "built" in the database
 *
 * The service becomes active on the next container restart / deployment.
 * No email. No human gate.
 */

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "../db";
import { serviceProposals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "./logger";
import { executeRoutedAICall } from "../services/ai-model-router";

const logger = createLogger("auto-implement");
const OWNER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

function toPascalCase(str: string): string {
  return str
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export interface ProposalInput {
  id:              number;
  title:           string;
  proposedService: string;
  scaffold:        string;
  problem:         string;
  rationale:       string;
}

export async function autoImplementProposal(proposal: ProposalInput): Promise<void> {
  const safeName = proposal.proposedService
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `auto-service-${proposal.id}`;

  const relPath = `server/services/${safeName}.ts`;
  const absPath = join(process.cwd(), "server", "services", `${safeName}.ts`);

  // ── 1. Generate full implementation with Claude ──────────────────────────────
  const result = await executeRoutedAICall(
    { taskType: "learning", userId: OWNER_ID, maxTokens: 4000 },
    `You are a senior TypeScript/Node.js engineer implementing a background service for CreatorOS.
CreatorOS is an autonomous YouTube content engine. Stack: Express.js, TypeScript, Drizzle ORM, PostgreSQL.

Strict rules:
- Import { db } from "../db" for database access
- Import table names from "@shared/schema"
- Import { createLogger } from "../lib/logger"
- Import { getState, setState } from "../lib/service-state" for persisting state across restarts
- Import { executeRoutedAICall } from "./ai-model-router" for any AI calls (taskType:"learning")
- Use operators (eq, and, sql, desc, gte, isNotNull) from "drizzle-orm"
- Export EXACTLY ONE init function: export function initXxx(userId: string): ReturnType<typeof setInterval>
  • Uses setTimeout for initial delay (10-20 min), then setInterval for a repeating cycle
  • All heavy work in an internal async run(userId) function
  • run() is wrapped in a top-level try/catch — errors are non-fatal (logger.debug)
- NEVER import from server/auth, server/stripe, server/kernel, or client/
- Return ONLY the raw TypeScript file. No markdown fences. No explanation. File starts with /**`,
    `Implement this service completely. Expand the scaffold into a production-ready implementation.

Title: ${proposal.title}
Problem: ${proposal.problem}
Rationale: ${proposal.rationale}

Scaffold to expand:
${proposal.scaffold}`,
  );

  // ── 2. Clean and validate the AI response ────────────────────────────────────
  let code = (result.content ?? "").trim();
  code = code.replace(/^```(?:typescript|ts)?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (!code || code.length < 150) throw new Error("AI returned empty or trivial implementation");

  // ── 3. Write the service file ─────────────────────────────────────────────────
  if (!existsSync(absPath)) {
    writeFileSync(absPath, code, "utf8");
    logger.info(`[AutoImpl] Wrote ${relPath}`);
  } else {
    logger.info(`[AutoImpl] ${relPath} already exists — skipping write`);
  }

  // ── 4. Register in _auto-init.ts ──────────────────────────────────────────────
  const autoInitPath = join(process.cwd(), "server", "services", "_auto-init.ts");
  if (existsSync(autoInitPath)) {
    const current  = readFileSync(autoInitPath, "utf8");
    const initName = `init${toPascalCase(safeName)}`;
    const MARKER   = "  // SERVICES_END";

    if (!current.includes(`./${safeName}`)) {
      const entry = [
        `  try {`,
        `    const { ${initName} } = await import("./${safeName}");`,
        `    ${initName}("${OWNER_ID}");`,
        `    logger.info("[AutoInit] ${initName} started");`,
        `  } catch (e: any) {`,
        `    logger.warn("[AutoInit] ${initName} failed: " + (e?.message ?? String(e)));`,
        `  }`,
        `  // SERVICES_END`,
      ].join("\n");
      writeFileSync(autoInitPath, current.replace(MARKER, entry), "utf8");
      logger.info(`[AutoImpl] Registered ${initName} in _auto-init.ts`);
    }
  }

  // ── 5. Mark proposal as built ──────────────────────────────────────────────────
  await db.update(serviceProposals)
    .set({ status: "built", reviewedAt: new Date() })
    .where(eq(serviceProposals.id, proposal.id));

  logger.info(`[AutoImpl] Proposal #${proposal.id} "${proposal.title}" → BUILT (${relPath})`);
}
