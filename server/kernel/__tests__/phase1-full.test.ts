import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("../../db", () => {
  const rows: any[] = [];
  let nextId = 1;
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          returning: (ret?: any) => {
            const id = nextId++;
            const row = { ...v, id };
            rows.push(row);
            return [row];
          },
        }),
      }),
      select: (cols?: any) => ({
        from: (table: any) => ({
          where: (...args: any[]) => ({
            limit: (n: number) => [],
            orderBy: (...o: any[]) => ({
              limit: (n: number) => rows.slice(-n),
            }),
          }),
          orderBy: (...o: any[]) => ({
            limit: (n: number) => rows.slice(-n),
          }),
        }),
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (...args: any[]) => ({
            returning: () => [{ ...vals, id: 1, budgetTotal: 100, budgetRemaining: vals.budgetRemaining ?? 100 }],
          }),
        }),
      }),
      execute: () => Promise.resolve([{ "?column?": 1 }]),
    },
  };
});

import { sendAgentMessage, getAgentMessages } from "../interop";
import { runEval, getEvalResults } from "../eval";
import { checkTrustBudget } from "../trust-budget";
import { probeCapability, getCapabilityStatus, checkCapabilityBeforeWrite } from "../capability-probe";
import { detectJurisdiction, isMonetizationRestricted, formatCurrency } from "../../adapters/payment";
import { detectLocale, formatDate, formatNumber, isRTL } from "../../adapters/localization";

describe("Agent Interop Bus", () => {
  it("sends an agent message and returns an id", async () => {
    const id = await sendAgentMessage("jordan-blake", "nia-okafor", "user1", "content_brief", { topic: "PS5 highlight" });
    expect(id).toBeGreaterThan(0);
  });

  it("returns messages for an agent", async () => {
    const msgs = await getAgentMessages("nia-okafor", "user1");
    expect(Array.isArray(msgs)).toBe(true);
  });
});

describe("Eval Harness", () => {
  it("creates an eval run", async () => {
    const run = await runEval(
      "user1",
      "smart-edit-engine",
      "highlight-quality",
      {
        inputSnapshot: { videoId: "v1" },
        evaluator: () => ({ score: 0.82, passed: true, notes: "Good highlight selection" }),
      }
    );
    expect(run.id).toBeGreaterThan(0);
  });

  it("fetches eval results", async () => {
    const results = await getEvalResults("user1", { agentName: "smart-edit-engine" });
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("Trust Budget", () => {
  it("returns default budget when no record exists", async () => {
    const status = await checkTrustBudget("user1", "title_volatility");
    expect(status.remaining).toBe(100);
    expect(status.blocked).toBe(false);
  });

  it("deducts trust budget and reports remaining", async () => {
    const status = await checkTrustBudget("user1", "cta_pressure", 25);
    expect(status.remaining).toBeDefined();
    expect(typeof status.blocked).toBe("boolean");
  });

  it("detects exhausted trust budget", async () => {
    const status = await checkTrustBudget("user1", "posting_pressure", 200);
    expect(status.remaining).toBe(0);
    expect(status.blocked).toBe(true);
  });
});

describe("Capability Probe", () => {
  it("probes a database capability", async () => {
    const result = await probeCapability("database", "database:read", undefined, "user1");
    expect(result.platform).toBe("database");
    expect(result.capabilityName).toBe("database:read");
    expect(["verified", "error", "success"]).toContain(result.probeResult);
  });

  it("probes storage capability (simulated)", async () => {
    const result = await probeCapability("storage", "storage:write", undefined, "user1");
    expect(result.probeResult).toBe("verified");
  });

  it("returns unknown status for unprobed capability", async () => {
    const status = await getCapabilityStatus("unknown-platform", "unknown:cap");
    expect(["unknown", "stale"]).toContain(status.status);
    expect(status.isStale).toBe(true);
  });

  it("checks capability before write", async () => {
    const result = await checkCapabilityBeforeWrite("storage", "storage:write", "user1");
    expect(typeof result.allowed).toBe("boolean");
    expect(result.reason).toBeDefined();
  });
});

describe("Payment Infrastructure Adapter", () => {
  it("detects US jurisdiction", () => {
    const j = detectJurisdiction("US");
    expect(j.countryCode).toBe("US");
    expect(j.currencyCode).toBe("USD");
    expect(j.monetizationAccess).toBe("full");
  });

  it("detects restricted jurisdiction", () => {
    const j = detectJurisdiction("NG");
    expect(j.monetizationAccess).toBe("restricted");
    expect(isMonetizationRestricted(j)).toBe(true);
  });

  it("returns default for unknown country", () => {
    const j = detectJurisdiction("XX");
    expect(j.monetizationAccess).toBe("limited");
  });

  it("formats currency correctly", () => {
    expect(formatCurrency(1234.56, "USD")).toContain("1,234.56");
    expect(formatCurrency(5000, "JPY")).toContain("5,000");
  });
});

describe("Localization Adapter", () => {
  it("detects locale from country code", () => {
    const locale = detectLocale(null, "JP");
    expect(locale.locale).toBe("ja-JP");
    expect(locale.direction).toBe("ltr");
  });

  it("detects RTL locale", () => {
    const locale = detectLocale(null, "SA");
    expect(isRTL(locale)).toBe(true);
    expect(locale.direction).toBe("rtl");
  });

  it("falls back to en-US for unknown", () => {
    const locale = detectLocale(null, null);
    expect(locale.locale).toBe("en-US");
  });

  it("formats dates", () => {
    const locale = detectLocale(null, "US");
    const date = new Date("2026-01-15");
    const formatted = formatDate(date, locale);
    expect(formatted).toBeTruthy();
  });

  it("formats numbers", () => {
    const locale = detectLocale(null, "DE");
    const formatted = formatNumber(1234.56, locale);
    expect(formatted).toBeTruthy();
  });
});
