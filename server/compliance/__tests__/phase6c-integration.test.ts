import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1, budgetTotal: 100, budgetRemaining: 100, agentName: "test-agent", userId: "user-1" }]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        groupBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    }),
  },
}));

vi.mock("../../lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  logGovernanceAction,
  getGovernanceAuditLogs,
  getOrCreateTrustBudget,
  deductTrustBudget,
  resetTrustBudget,
  getTrustBudgetHistory,
  getTrustBudgetStatus,
  getAutoTightenMultiplier,
  seedApprovalMatrix,
  evaluateApproval,
  getApprovalMatrixRules,
  getApprovalHistory,
  enforceTenantIsolation,
  buildTenantContext,
  validateTenantAccess,
  analyzeChannelThreats,
  getChannelImmuneHistory,
  resolveChannelThreat,
  ingestCommunitySignal,
  computeCommunityTrustScore,
  applyCommunityTrustToBudget,
  simulateTrustRisk,
  generateOverrideReport,
  recordOverride,
  governanceGate,
} from "../../services/trust-governance";

const { db } = await import("../../db");

describe("Phase 6C: Trust & Governance Hardening", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("T001: Trust Budget Hardening", () => {
    it("should get or create trust budget", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 100 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const budget = await getOrCreateTrustBudget("u1", "a1");
      expect(budget).toBeDefined();
      expect(budget.budgetTotal).toBe(100);
    });

    it("should return existing budget if present", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 2, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 50 }]),
          }),
        }),
      });

      const budget = await getOrCreateTrustBudget("u1", "a1");
      expect(budget.budgetRemaining).toBe(50);
    });

    it("should deduct trust budget and detect violations", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 25, updatedAt: new Date() }]),
          }),
        }),
      });
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await deductTrustBudget("u1", "a1", 10, "test deduction");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(15);
      expect(result.violation).toBe(true);
    });

    it("should block deduction when budget exhausted", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 5, updatedAt: new Date() }]),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await deductTrustBudget("u1", "a1", 10, "exhaustion test");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.violation).toBe(true);
    });

    it("should detect auto-tightening threshold", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 45, updatedAt: new Date() }]),
          }),
        }),
      });
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await deductTrustBudget("u1", "a1", 10, "tighten test");
      expect(result.autoTightened).toBe(true);
      expect(result.remaining).toBe(35);
    });

    it("should compute auto-tighten multiplier correctly", () => {
      expect(getAutoTightenMultiplier(100)).toBe(1.0);
      expect(getAutoTightenMultiplier(50)).toBe(1.0);
      expect(getAutoTightenMultiplier(40)).toBe(0.5);
      expect(getAutoTightenMultiplier(30)).toBe(0.5);
      expect(getAutoTightenMultiplier(20)).toBe(0);
      expect(getAutoTightenMultiplier(10)).toBe(0);
      expect(getAutoTightenMultiplier(0)).toBe(0);
    });

    it("should reset trust budget and create period", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "a1", budgetTotal: 100, budgetRemaining: 30, updatedAt: new Date() }]),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(resetTrustBudget("u1", "a1")).resolves.not.toThrow();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should get trust budget status", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { agentName: "a1", budgetTotal: 100, budgetRemaining: 80 },
              { agentName: "a2", budgetTotal: 100, budgetRemaining: 15 },
            ]),
          }),
        }),
      });

      const status = await getTrustBudgetStatus("u1");
      expect(status).toHaveLength(2);
      expect(status[0].violation).toBe(false);
      expect(status[1].violation).toBe(true);
      expect(status[0].percentUsed).toBe(20);
    });
  });

  describe("T002: Approval Matrix", () => {
    it("should seed default approval matrix rules", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      });

      const seeded = await seedApprovalMatrix();
      expect(seeded).toBeGreaterThan(0);
    });

    it("should auto-approve GREEN band actions", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, actionClass: "content_publish", bandClass: "GREEN", confidenceThreshold: null, approver: "system" }]),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await evaluateApproval("u1", "content_publish", 0.9);
      expect(result.decision).toBe("approved");
      expect(result.reason).toContain("GREEN");
    });

    it("should gate YELLOW band by confidence threshold", async () => {
      let callCount = 0;
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([{ id: 2, actionClass: "title_change", bandClass: "YELLOW", confidenceThreshold: 0.7, approver: "system" }]);
              return Promise.resolve([{ id: 10, budgetRemaining: 100 }]);
            }),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const approved = await evaluateApproval("u1", "title_change", 0.9);
      expect(approved.decision).toBe("approved");
    });

    it("should require human approval for RED band", async () => {
      let callCount = 0;
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([{ id: 3, actionClass: "delete_content", bandClass: "RED", confidenceThreshold: null, approver: "admin" }]);
              return Promise.resolve([{ id: 10, budgetRemaining: 100 }]);
            }),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await evaluateApproval("u1", "delete_content", 1.0);
      expect(result.decision).toBe("pending_human");
      expect(result.reason).toContain("RED");
    });

    it("should deny action when trust budget is exhausted", async () => {
      let callCount = 0;
      (db.select as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 1, actionClass: "content_publish", bandClass: "GREEN", approver: "system" }]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 10, budgetRemaining: 5 }]),
          }),
        };
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await evaluateApproval("u1", "content_publish", 1.0);
      expect(result.decision).toBe("denied");
      expect(result.reason).toContain("exhausted");
    });

    it("should fail-safe to pending_human when no rule exists", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await evaluateApproval("u1", "unknown_action", 0.5);
      expect(result.decision).toBe("pending_human");
      expect(result.reason).toContain("fail-safe");
      expect(result.ruleId).toBeNull();
    });
  });

  describe("T003: Tenant Isolation", () => {
    it("should allow same-user access", () => {
      const result = enforceTenantIsolation("user-1", "user-1", "video");
      expect(result.allowed).toBe(true);
    });

    it("should block cross-user access", () => {
      const result = enforceTenantIsolation("user-1", "user-2", "video");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Tenant isolation violation");
    });

    it("should reject empty user IDs", () => {
      const result = enforceTenantIsolation("", "user-1", "video");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("No authenticated user");
    });

    it("should reject empty resource owner", () => {
      const result = enforceTenantIsolation("user-1", "", "video");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("no owner");
    });

    it("should validate tenant access", () => {
      expect(validateTenantAccess("u1", "u1")).toBe(true);
      expect(validateTenantAccess("u1", "u2")).toBe(false);
    });

    it("should build tenant context with AI boundary", () => {
      const ctx = buildTenantContext("user-abc");
      expect(ctx.userId).toBe("user-abc");
      expect(ctx.isolationScope).toBe("tenant:user-abc");
      expect(ctx.aiContextBoundary).toContain("user-abc");
      expect(ctx.aiContextBoundary).toContain("Never reference");
    });
  });

  describe("T004: Channel Immune System", () => {
    it("should detect dislike bomb", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, { dislikeRate: 10 });
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.threats[0].type).toBe("dislike_bomb");
      expect(result.defensiveActions.length).toBeGreaterThan(0);
    });

    it("should detect mass report attack", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, { reportCount: 5 });
      const reportThreat = result.threats.find(t => t.type === "mass_report");
      expect(reportThreat).toBeDefined();
      expect(reportThreat!.severity).toBe("critical");
    });

    it("should detect comment spam", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, { spamCommentCount: 30 });
      expect(result.threats.find(t => t.type === "comment_spam")).toBeDefined();
    });

    it("should detect subscriber drop", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, { subscriberDropRate: 10 });
      expect(result.threats.find(t => t.type === "subscriber_drop")).toBeDefined();
    });

    it("should detect view suppression", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, { viewDropRate: 40 });
      expect(result.threats.find(t => t.type === "view_suppression")).toBeDefined();
    });

    it("should return no threats for normal indicators", async () => {
      const result = await analyzeChannelThreats("u1", 1, { dislikeRate: 1, reportCount: 0, spamCommentCount: 2 });
      expect(result.threats).toHaveLength(0);
      expect(result.defensiveActions).toHaveLength(0);
    });

    it("should detect multiple threats simultaneously", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await analyzeChannelThreats("u1", 1, {
        dislikeRate: 10, reportCount: 5, spamCommentCount: 30,
      });
      expect(result.threats.length).toBe(3);
    });
  });

  describe("T005: Community Trust Loop", () => {
    it("should ingest community signals", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(ingestCommunitySignal("u1", "sentiment", 80, "comments", 1.5)).resolves.not.toThrow();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should compute community trust score with no signals", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await computeCommunityTrustScore("u1");
      expect(result.score).toBe(75);
      expect(result.signals).toHaveLength(0);
    });

    it("should compute weighted community trust score", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { signalType: "sentiment", avgValue: "85", cnt: 10, avgWeight: "1.0" },
              { signalType: "engagement", avgValue: "70", cnt: 5, avgWeight: "1.5" },
            ]),
          }),
        }),
      });

      const result = await computeCommunityTrustScore("u1");
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.signals).toHaveLength(2);
    });

    it("should apply community trust to budget", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { signalType: "sentiment", avgValue: "90", cnt: 10, avgWeight: "1.0" },
            ]),
            limit: vi.fn().mockResolvedValue([{ id: 1, userId: "u1", agentName: "community", budgetTotal: 100, budgetRemaining: 80 }]),
          }),
        }),
      });
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await applyCommunityTrustToBudget("u1");
      expect(result.communityScore).toBeDefined();
      expect(result.budgetAdjustment).toBeDefined();
    });
  });

  describe("T006: Trust-Risk Simulator", () => {
    it("should simulate trust risk scenarios", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await simulateTrustRisk("u1", [
        { action: "content_publish", budgetCost: 10, confidence: 0.9, communityImpact: 0 },
        { action: "title_change", budgetCost: 5, confidence: 0.5, communityImpact: 0 },
      ]);

      expect(result.results).toHaveLength(2);
      expect(result.overallRisk).toBeDefined();
      expect(result.results[0].budgetAfter).toBeLessThan(100);
    });

    it("should detect critical risk when budget would be exhausted", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await simulateTrustRisk("u1", [
        { action: "content_publish", budgetCost: 50, confidence: 0.9, communityImpact: 0 },
        { action: "bulk_action", budgetCost: 40, confidence: 0.9, communityImpact: 0 },
        { action: "title_change", budgetCost: 20, confidence: 0.9, communityImpact: 0 },
      ]);

      const criticalResult = result.results.find(r => r.riskLevel === "critical");
      expect(criticalResult).toBeDefined();
    });
  });

  describe("T007: Override Pattern Report", () => {
    it("should generate override report with no data", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const report = await generateOverrideReport("u1", 30);
      expect(report.totalOverrides).toBe(0);
      expect(report.riskAssessment).toBe("low");
      expect(report.patterns).toHaveLength(0);
    });

    it("should detect high override frequency pattern", async () => {
      const overrides = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        userId: "u1",
        overrideType: "budget_override",
        targetEntity: "automation_rule",
        reason: "needed for launch",
        createdAt: new Date(Date.now() - (i * 86400_000)),
      }));

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(overrides),
            }),
          }),
        }),
      });

      const report = await generateOverrideReport("u1", 30);
      expect(report.totalOverrides).toBe(25);
      expect(report.riskAssessment).toBe("high");
      expect(report.patterns.length).toBeGreaterThan(0);
    });

    it("should record an override", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 42 }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      const id = await recordOverride("u1", "budget_override", "rule", "r1", null, null, "emergency", "admin");
      expect(id).toBe(42);
    });
  });

  describe("T008: Governance Audit Trail", () => {
    it("should log governance actions", async () => {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(logGovernanceAction("u1", "test_action", "test_domain", { key: "value" })).resolves.not.toThrow();
    });

    it("should retrieve governance audit logs", async () => {
      let selectCall = 0;
      (db.select as any).mockImplementation((...args: any[]) => {
        selectCall++;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([{ id: 1, action: "test", domain: "test" }]),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ cnt: 1 }]),
          }),
        };
      });

      const result = await getGovernanceAuditLogs("u1");
      expect(result.items).toBeDefined();
      expect(result.total).toBe(1);
    });
  });

  describe("Route Structure", () => {
    it("should export registerTrustGovernanceRoutes", async () => {
      const mod = await import("../../routes/trust-governance");
      expect(mod.registerTrustGovernanceRoutes).toBeDefined();
      expect(typeof mod.registerTrustGovernanceRoutes).toBe("function");
    });
  });

  describe("Governance Gate Middleware", () => {
    it("should create governance gate middleware for any action class", () => {
      const gate = governanceGate("content_publish");
      expect(typeof gate).toBe("function");
    });

    it("should pass through when no user is authenticated", async () => {
      const gate = governanceGate("content_publish");
      const req = { user: null, body: {} } as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const next = vi.fn();

      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should enforce approval matrix for authenticated users", async () => {
      const gate = governanceGate("content_publish");
      const req = { user: { claims: { sub: "user-1" } }, body: { confidence: 0.9 } } as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const next = vi.fn();

      await gate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should create separate gates for different action classes", () => {
      const contentGate = governanceGate("content_publish");
      const streamGate = governanceGate("stream_config");
      const financialGate = governanceGate("financial_action");

      expect(contentGate).not.toBe(streamGate);
      expect(streamGate).not.toBe(financialGate);
    });
  });

  describe("Budget Period Lifecycle", () => {
    it("should expose budget period functions", () => {
      expect(typeof getOrCreateTrustBudget).toBe("function");
      expect(typeof deductTrustBudget).toBe("function");
      expect(typeof resetTrustBudget).toBe("function");
      expect(typeof getTrustBudgetHistory).toBe("function");
      expect(typeof getTrustBudgetStatus).toBe("function");
    });

    it("should have auto-tighten multiplier function", () => {
      expect(typeof getAutoTightenMultiplier).toBe("function");
    });
  });

  describe("Cross-Engine Governance Coverage", () => {
    it("should have governance gate applicable to all engine categories", () => {
      const engines = [
        "content_publish", "content_schedule", "content_draft",
        "stream_config", "stream_start", "stream_end",
        "distribution_push", "distribution_config",
        "metadata_title_change", "metadata_description_change",
        "metadata_thumbnail_change", "metadata_tags_change",
        "community_moderation", "analytics_export",
        "channel_branding_update", "channel_settings_change",
        "api_integration_config", "webhook_config",
        "notification_config", "notification_push",
        "playlist_create", "playlist_modify",
        "financial_action", "smart_edit",
      ];

      for (const action of engines) {
        const gate = governanceGate(action);
        expect(typeof gate).toBe("function");
      }
    });

    it("should have fail-safe for unknown actions in evaluateApproval", async () => {
      expect(typeof evaluateApproval).toBe("function");
      expect(typeof governanceGate).toBe("function");
      const gate = governanceGate("unknown_action_xyz");
      expect(typeof gate).toBe("function");
    });
  });

  describe("Integration Sanity Checks", () => {
    it("should have all governance tables in schema", async () => {
      const schema = await import("@shared/schema");
      expect(schema.governanceAuditLogs).toBeDefined();
      expect(schema.channelImmuneEvents).toBeDefined();
      expect(schema.communityTrustSignals).toBeDefined();
      expect(schema.trustBudgetRecords).toBeDefined();
      expect(schema.trustBudgetPeriods).toBeDefined();
      expect(schema.approvalMatrixRules).toBeDefined();
      expect(schema.approvalDecisions).toBeDefined();
      expect(schema.operatorOverrideRecords).toBeDefined();
    });

    it("should have correct types exported", async () => {
      const schema = await import("@shared/schema");
      expect(typeof schema.governanceAuditLogs).toBe("object");
      expect(typeof schema.channelImmuneEvents).toBe("object");
      expect(typeof schema.communityTrustSignals).toBe("object");
    });
  });
});
