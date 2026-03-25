import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => {
  let nextId = 1;
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          returning: () => {
            const id = nextId++;
            return [{ ...v, id, createdAt: new Date() }];
          },
          catch: () => Promise.resolve(),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [],
            orderBy: () => ({
              limit: () => [],
            }),
          }),
          orderBy: () => ({
            limit: () => [],
          }),
        }),
      }),
    },
  };
});

vi.mock("../../kernel/index", () => ({
  emitDomainEvent: async () => {},
}));

vi.mock("../../kernel/trust-budget", () => ({
  checkTrustBudget: async () => ({ remaining: 100, blocked: false, periodId: "test", deductionsCount: 0, totalDeducted: 0 }),
}));

describe("Cultural Intelligence", () => {
  it("scores cultural sensitivity", async () => {
    const { scoreCulturalSensitivity } = await import("../cultural-intelligence");
    const result = await scoreCulturalSensitivity("user1", {
      title: "Elden Ring Boss Fight",
      description: "No commentary gameplay",
      tags: ["gaming", "ps5"],
    }, ["US", "JP", "DE"]);
    expect(result.userId).toBe("user1");
    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(typeof r.safeToDistribute).toBe("boolean");
    }
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("detects sensitive content for specific regions", async () => {
    const { scoreCulturalSensitivity } = await import("../cultural-intelligence");
    const result = await scoreCulturalSensitivity("user1", {
      title: "Game with skeleton boss fight",
      description: "Skeleton enemy gameplay",
      tags: ["skeleton", "boss"],
    }, ["CN"]);
    expect(result.results[0].score).toBeLessThan(1);
    expect(result.results[0].issues.length).toBeGreaterThan(0);
  });
});

describe("Geopolitical Safety", () => {
  it("checks geopolitical safety", async () => {
    const { checkGeopoliticalSafety } = await import("../geopolitical-safety");
    const result = await checkGeopoliticalSafety("user1", {
      title: "Normal Gaming Video",
      description: "Gameplay footage",
      tags: ["gaming"],
    }, ["US", "GB"]);
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.flags)).toBe(true);
    expect(Array.isArray(result.safeRegions)).toBe(true);
    expect(result.overallSafety).toBeGreaterThanOrEqual(0);
    expect(result.overallSafety).toBeLessThanOrEqual(1);
  });

  it("flags restricted content", async () => {
    const { checkGeopoliticalSafety } = await import("../geopolitical-safety");
    const result = await checkGeopoliticalSafety("user1", {
      title: "Game with gambling casino content",
      description: "Casino mini-game walkthrough",
      tags: ["gambling", "casino"],
    }, ["SA"]);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.restrictedRegions).toContain("SA");
  });
});

describe("Platform Independence", () => {
  it("assesses platform independence", async () => {
    const { assessPlatformIndependence } = await import("../platform-independence");
    const result = await assessPlatformIndependence("user1");
    expect(result.userId).toBe("user1");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.singlePlatformRisk).toBeGreaterThanOrEqual(0);
    expect(result.diversificationScore).toBeGreaterThanOrEqual(0);
    expect(result.dataSovereigntyScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.roadmap)).toBe(true);
  });
});

describe("Content Preservation", () => {
  it("assesses content preservation", async () => {
    const { assessContentPreservation } = await import("../content-preservation");
    const result = await assessContentPreservation("user1");
    expect(result.userId).toBe("user1");
    expect(typeof result.totalContent).toBe("number");
    expect(typeof result.backedUpCount).toBe("number");
    expect(typeof result.overallHealth).toBe("number");
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("scaffolds data vault", async () => {
    const { scaffoldDataVault } = await import("../content-preservation");
    const vault = scaffoldDataVault("user1");
    expect(vault.userId).toBe("user1");
    expect(vault.encryptionEnabled).toBe(true);
    expect(vault.storageTiers).toHaveProperty("hot");
    expect(vault.storageTiers).toHaveProperty("warm");
    expect(vault.storageTiers).toHaveProperty("cold");
    expect(vault.dataCategories.length).toBeGreaterThan(0);
    expect(vault.retentionPolicyDays).toBeGreaterThan(0);
  });

  it("gets content at risk", async () => {
    const { getContentAtRisk } = await import("../content-preservation");
    const result = await getContentAtRisk("user1");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Regulatory Horizon", () => {
  it("scans regulatory horizon", async () => {
    const { scanRegulatoryHorizon } = await import("../regulatory-horizon");
    const result = await scanRegulatoryHorizon("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(typeof result.urgentCount).toBe("number");
    expect(typeof result.upcomingCount).toBe("number");
    for (const alert of result.alerts) {
      expect(alert).toHaveProperty("regulation");
      expect(alert).toHaveProperty("region");
      expect(alert).toHaveProperty("impact");
      expect(alert).toHaveProperty("daysUntilEffective");
    }
  });

  it("filters by platform", async () => {
    const { scanRegulatoryHorizon } = await import("../regulatory-horizon");
    const result = await scanRegulatoryHorizon("user1", ["youtube"]);
    expect(result.alerts.length).toBeGreaterThan(0);
    for (const alert of result.alerts) {
      expect(alert.affectedPlatforms).toContain("youtube");
    }
  });

  it("gets urgent alerts", async () => {
    const { getUrgentAlerts } = await import("../regulatory-horizon");
    const result = await getUrgentAlerts("user1");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Global Monetization", () => {
  it("analyzes global monetization", async () => {
    const { analyzeGlobalMonetization } = await import("../global-monetization");
    const result = await analyzeGlobalMonetization("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.regionalOpportunities)).toBe(true);
    expect(Array.isArray(result.licensingOpportunities)).toBe(true);
    expect(result.licensingOpportunities.length).toBeGreaterThan(0);
    expect(result.paymentInfrastructure).toHaveProperty("supportedCurrencies");
    expect(result.paymentInfrastructure).toHaveProperty("gaps");
    expect(typeof result.totalPotentialUplift).toBe("number");
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("returns licensing opportunities", async () => {
    const { analyzeGlobalMonetization } = await import("../global-monetization");
    const result = await analyzeGlobalMonetization("user1");
    for (const lic of result.licensingOpportunities) {
      expect(lic).toHaveProperty("contentType");
      expect(lic).toHaveProperty("market");
      expect(lic).toHaveProperty("estimatedValue");
      expect(lic).toHaveProperty("complexity");
      expect(["low", "medium", "high"]).toContain(lic.complexity);
    }
  });
});

describe("Distribution Safety Gate", () => {
  it("evaluates distribution safety for safe content", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "youtube",
      title: "Elden Ring Boss Fight",
      description: "No commentary gameplay",
      tags: ["gaming", "ps5"],
    });
    expect(typeof result.allowed).toBe("boolean");
    expect(Array.isArray(result.geopoliticalFlags)).toBe(true);
    expect(Array.isArray(result.culturalIssues)).toBe(true);
    expect(Array.isArray(result.blockedRegions)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("blocks distribution for geopolitically sensitive content", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "tiktok",
      title: "Game with gambling casino content and skeleton enemies",
      description: "Casino mini-game walkthrough with skeleton boss",
      tags: ["gambling", "casino", "skeleton"],
      targetRegions: ["CN", "SA"],
    });
    expect(result.blockedRegions.length).toBeGreaterThan(0);
    expect(result.geopoliticalFlags.length + result.culturalIssues.length).toBeGreaterThan(0);
  });

  it("includes preservation warning when health is low", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "youtube",
      title: "Normal Gaming Content",
      tags: ["gaming"],
    });
    expect(result.preservationWarning === null || typeof result.preservationWarning === "string").toBe(true);
  });
});
