import { db } from "../db";
import { domainEvents } from "@shared/schema";
import { emitDomainEvent } from "./index";

export type ReconciliationStatus = "matched" | "mismatch" | "error" | "skipped";

export interface ReconciliationResult {
  domain: string;
  check: string;
  status: ReconciliationStatus;
  internalValue: any;
  externalValue: any;
  details?: string;
  timestamp: Date;
}

export interface ReconciliationReport {
  domain: string;
  results: ReconciliationResult[];
  summary: { matched: number; mismatched: number; errors: number; skipped: number };
  overallStatus: "consistent" | "inconsistent" | "error";
  ranAt: Date;
}

type ReconciliationChecker = () => Promise<ReconciliationResult[]>;

const reconciliationCheckers = new Map<string, ReconciliationChecker>();

export function registerReconciliationChecker(domain: string, checker: ReconciliationChecker): void {
  reconciliationCheckers.set(domain, checker);
}

export async function runReconciliation(domain: string): Promise<ReconciliationReport> {
  const checker = reconciliationCheckers.get(domain);
  if (!checker) {
    return {
      domain,
      results: [],
      summary: { matched: 0, mismatched: 0, errors: 0, skipped: 1 },
      overallStatus: "error",
      ranAt: new Date(),
    };
  }

  let results: ReconciliationResult[];
  try {
    results = await checker();
  } catch (err: any) {
    results = [{
      domain,
      check: "checker_execution",
      status: "error",
      internalValue: null,
      externalValue: null,
      details: err?.message || String(err),
      timestamp: new Date(),
    }];
  }

  const summary = { matched: 0, mismatched: 0, errors: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === "matched") summary.matched++;
    else if (r.status === "mismatch") summary.mismatched++;
    else if (r.status === "error") summary.errors++;
    else summary.skipped++;
  }

  const overallStatus: ReconciliationReport["overallStatus"] =
    summary.errors > 0 ? "error" : summary.mismatched > 0 ? "inconsistent" : "consistent";

  return { domain, results, summary, overallStatus, ranAt: new Date() };
}

export async function runAllReconciliations(userId?: string): Promise<ReconciliationReport[]> {
  const reports: ReconciliationReport[] = [];

  for (const domain of reconciliationCheckers.keys()) {
    const report = await runReconciliation(domain);
    reports.push(report);

    if (report.overallStatus !== "consistent" && userId) {
      try {
        await emitDomainEvent(userId, "reconciliation.inconsistency_detected", {
          domain,
          overallStatus: report.overallStatus,
          mismatches: report.summary.mismatched,
          errors: report.summary.errors,
        }, "state-reconciliation", domain);
      } catch (_) {}
    }
  }

  return reports;
}

export function getRegisteredDomains(): string[] {
  return Array.from(reconciliationCheckers.keys());
}

export function seedCoreReconciliationCheckers(): void {
  registerReconciliationChecker("feature_flags", async () => {
    const { featureFlags } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const flags = await db.select().from(featureFlags).limit(100);
    const results: ReconciliationResult[] = [];

    for (const flag of flags) {
      const isSunset = flag.lifecycleState && flag.lifecycleState !== "active";
      const isEnabled = flag.enabled;

      if (isSunset && isEnabled) {
        results.push({
          domain: "feature_flags",
          check: `flag_sunset_consistency:${flag.flagKey}`,
          status: "mismatch",
          internalValue: { enabled: isEnabled, sunsetState: flag.lifecycleState },
          externalValue: { expectedEnabled: false },
          details: `Flag '${flag.flagKey}' is sunset (${flag.lifecycleState}) but still enabled`,
          timestamp: new Date(),
        });
      } else {
        results.push({
          domain: "feature_flags",
          check: `flag_sunset_consistency:${flag.flagKey}`,
          status: "matched",
          internalValue: { enabled: isEnabled, sunsetState: flag.lifecycleState },
          externalValue: null,
          timestamp: new Date(),
        });
      }
    }

    return results;
  });

  registerReconciliationChecker("operating_mode", async () => {
    const { operatingModeHistory } = await import("@shared/schema");
    const { desc } = await import("drizzle-orm");

    const [latest] = await db.select().from(operatingModeHistory)
      .orderBy(desc(operatingModeHistory.changedAt)).limit(1);

    if (!latest) {
      return [{
        domain: "operating_mode",
        check: "mode_existence",
        status: "matched",
        internalValue: "no_mode_set",
        externalValue: "default",
        details: "No operating mode history — acceptable for fresh install",
        timestamp: new Date(),
      }];
    }

    return [{
      domain: "operating_mode",
      check: "mode_validity",
      status: ["demo", "live"].includes(latest.mode) ? "matched" : "mismatch",
      internalValue: latest.mode,
      externalValue: "demo|live",
      timestamp: new Date(),
    }];
  });
}
