/**
 * incident-log.ts
 *
 * Living institutional memory for CreatorOS.
 *
 * Every structural bug, crash pattern, hot-loop, storm video, and schema quirk
 * gets a row here so the system remembers what broke and why — forever.
 *
 * Two public surfaces:
 *  1. logSystemIncident()               — called by any service when it detects
 *                                         and resolves a new issue
 *  2. promoteIncidentLessonsToKnowledge() — called by the learning brain's daily
 *                                         cycle; reads un-promoted high-severity
 *                                         lessons and writes them to masterKnowledgeBank
 *                                         so they flow into every AI prompt
 */

import { db } from "../db";
import { systemIncidentLog, masterKnowledgeBank } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createLogger } from "./logger";

const log = createLogger("incident-log");

// ── Category constants ────────────────────────────────────────────────────────
export const INCIDENT_CATEGORIES = [
  "oom_crash",        // container OOM-killed
  "hot_loop",         // tight CPU spin with no backoff
  "storm_video",      // yt-dlp storm from undownloadable video
  "db_saturation",    // too many DB queries blocking the event loop
  "boot_timing",      // services converging at the wrong startup time
  "schema_bug",       // wrong column name, missing constraint, bad query
  "vault_failure",    // vault download/processing failure
  "publisher_loop",   // publisher stuck in a loop
  "quota_breach",     // YouTube API quota exceeded
  "ai_queue",         // AI semaphore saturation
  "auth_failure",     // OAuth/token issues
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export interface NewIncident {
  incidentDate?: string;            // ISO "YYYY-MM-DD", defaults to today
  category: IncidentCategory;
  service: string;
  rootCause: string;
  fixDescription: string;
  lesson: string;
  migrationNumber?: number;
  severity?: "critical" | "high" | "medium" | "low";
  crashesPerDay?: number;
  status?: "resolved" | "monitoring" | "active";
  tags?: string[];
  autoDetected?: boolean;
}

// ── logSystemIncident ─────────────────────────────────────────────────────────

export async function logSystemIncident(incident: NewIncident): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(systemIncidentLog).values({
      incidentDate:    incident.incidentDate ?? today,
      category:        incident.category,
      service:         incident.service,
      rootCause:       incident.rootCause,
      fixDescription:  incident.fixDescription,
      lesson:          incident.lesson,
      migrationNumber: incident.migrationNumber ?? null,
      severity:        incident.severity ?? "high",
      crashesPerDay:   incident.crashesPerDay ?? null,
      status:          incident.status ?? "resolved",
      tags:            incident.tags ?? [],
      autoDetected:    incident.autoDetected ?? false,
      promotedToKnowledge: false,
    } as any);
    log.info(`[IncidentLog] Logged: ${incident.category} / ${incident.service}`);
  } catch (err: any) {
    log.warn(`[IncidentLog] Failed to log incident (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── logIncidentOnce ───────────────────────────────────────────────────────────
// Deduped variant of logSystemIncident for service-level auto-detection.
// Fires status="active" + autoDetected=true. Skips silently when:
//   1. In-memory: same service+category logged in last 24h (survives hot paths)
//   2. DB: an "active" incident with same service+category exists in last 7 days
//          (survives server restarts)
// Call with fire-and-forget from error paths: logIncidentOnce(...).catch(() => {})

const _onceCache = new Map<string, number>(); // key → Date.now() of last log
const ONCE_MEM_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export async function logIncidentOnce(incident: NewIncident): Promise<void> {
  const key = `${incident.service}:${incident.category}`;
  const now = Date.now();

  // Fast-path: in-memory dedup
  const last = _onceCache.get(key);
  if (last && now - last < ONCE_MEM_TTL_MS) return;

  // DB-level dedup: active same-type incident logged in the last 7 days?
  try {
    const cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const existing = await db
      .select({ id: systemIncidentLog.id })
      .from(systemIncidentLog)
      .where(
        and(
          eq(systemIncidentLog.service,  incident.service),
          eq(systemIncidentLog.category, incident.category),
          eq(systemIncidentLog.status,   "active"),
          sql`${systemIncidentLog.incidentDate} >= ${cutoff}`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      _onceCache.set(key, now); // sync memory with DB reality
      return;
    }
  } catch { /* non-fatal — fall through and log anyway */ }

  _onceCache.set(key, now);
  await logSystemIncident({
    autoDetected: true,
    status:       "active",
    severity:     "high",
    fixDescription: "Under investigation — auto-detected by runtime error handler.",
    ...incident,
  });
}

// ── logMigrationResolution ────────────────────────────────────────────────────
// Convenience wrapper for startup migrations that fix a known issue.
// Always writes status="resolved" — no dedup (migrations are one-time by flag).

export async function logMigrationResolution(opts: {
  migrationNumber: number;
  category: IncidentCategory;
  service: string;
  rootCause: string;
  fixDescription: string;
  lesson: string;
  severity?: NewIncident["severity"];
  crashesPerDay?: number;
  tags?: string[];
}): Promise<void> {
  await logSystemIncident({
    incidentDate:    new Date().toISOString().slice(0, 10),
    category:        opts.category,
    service:         opts.service,
    rootCause:       opts.rootCause,
    fixDescription:  opts.fixDescription,
    lesson:          opts.lesson,
    migrationNumber: opts.migrationNumber,
    severity:        opts.severity ?? "high",
    crashesPerDay:   opts.crashesPerDay,
    status:          "resolved",
    tags:            opts.tags ?? [],
    autoDetected:    false,
  });
}

// ── promoteIncidentLessonsToKnowledge ─────────────────────────────────────────
// Called by the learning brain's daily cycle.
// Reads all un-promoted resolved incidents with severity critical|high and writes
// their lessons into masterKnowledgeBank (category="system_lesson") so every AI
// generator and orchestrator agent gets smarter about the system's failure modes.

export async function promoteIncidentLessonsToKnowledge(userId: string): Promise<number> {
  try {
    const unpromoted = await db
      .select({
        id:       systemIncidentLog.id,
        category: systemIncidentLog.category,
        service:  systemIncidentLog.service,
        lesson:   systemIncidentLog.lesson,
        severity: systemIncidentLog.severity,
        crashesPerDay: systemIncidentLog.crashesPerDay,
      })
      .from(systemIncidentLog)
      .where(
        and(
          eq(systemIncidentLog.promotedToKnowledge, false),
          eq(systemIncidentLog.status, "resolved"),
          inArray(systemIncidentLog.severity, ["critical", "high"]),
        ),
      )
      .limit(20);

    if (unpromoted.length === 0) return 0;

    let promoted = 0;
    for (const inc of unpromoted) {
      try {
        const severityWeight = inc.severity === "critical" ? 95 : 85;
        const principle =
          `[System Lesson — ${inc.category}] Service: ${inc.service}. ` +
          `Rule: ${inc.lesson}`;

        await db.insert(masterKnowledgeBank).values({
          userId,
          category:          "system_lesson",
          principle,
          sourceEngines:     ["incident-log", inc.service],
          evidenceCount:     inc.crashesPerDay ?? 1,
          confidenceScore:   severityWeight,
          applicableEngines: ["all"],
          isActive:          true,
          metadata: {
            incidentId:    inc.id,
            incidentCat:   inc.category,
            service:       inc.service,
            promotedAt:    new Date().toISOString(),
          },
        } as any);

        await db
          .update(systemIncidentLog)
          .set({ promotedToKnowledge: true })
          .where(eq(systemIncidentLog.id, inc.id));

        promoted++;
      } catch {
        // duplicate principle or other non-fatal error — skip
      }
    }

    if (promoted > 0) {
      log.info(`[IncidentLog] Promoted ${promoted} system lessons → masterKnowledgeBank`);
    }
    return promoted;
  } catch (err: any) {
    log.warn(`[IncidentLog] promoteIncidentLessonsToKnowledge failed (non-fatal): ${err?.message?.slice(0, 120)}`);
    return 0;
  }
}
