import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => {
  let nextId = 1;
  const mockInsertValues = (v: unknown) => ({
    returning: () => {
      const id = nextId++;
      return [{ ...(v as Record<string, unknown>), id, createdAt: new Date() }];
    },
    catch: () => Promise.resolve(),
    onConflictDoUpdate: () => ({
      returning: () => [{ ...(v as Record<string, unknown>), id: nextId++, createdAt: new Date() }],
    }),
  });
  return {
    db: {
      insert: () => ({ values: mockInsertValues }),
      select: () => ({
        from: (table: Record<string, unknown>) => ({
          where: () => ({
            limit: () => [],
            orderBy: () => ({ limit: () => [] }),
          }),
          orderBy: () => ({ limit: () => [] }),
        }),
      }),
    },
  };
});

vi.mock("../../kernel/index", () => ({
  emitDomainEvent: async () => {},
}));

vi.mock("../../kernel/trust-budget", () => ({
  checkTrustBudget: async () => ({
    remaining: 100, blocked: false, periodId: "test", deductionsCount: 0, totalDeducted: 0,
  }),
}));

vi.mock("../../kernel/capability-probe", () => ({
  probeCapability: async () => ({ probeResult: "ok", latencyMs: 50 }),
}));

vi.mock("../publishing-gates", () => ({
  checkPublishingGates: async () => ({ passed: true, issues: [] }),
}));

vi.mock("../connection-health", () => ({
  getConnectionHealth: () => ({ status: "closed", latencyMs: 100 }),
  recordConnectionSuccess: () => {},
  recordConnectionFailure: () => {},
}));

vi.mock("../distribution-learning", () => ({
  recordDistributionLearning: async () => {},
}));

vi.mock("../../platform-publisher", () => ({
  executePublish: async () => ({ success: true, platform: "youtube", postId: "p1", postUrl: "https://youtube.com/p1" }),
}));

vi.mock("../../content/brand-system", () => ({
  getBrandProfile: () => ({
    channelName: "TestChannel",
    contentPillars: ["gaming", "ps5"],
    tonalKeywords: ["cinematic", "immersive"],
    forbiddenWords: [],
    visualStyle: "dark",
    colorPalette: ["#000", "#fff"],
  }),
  checkBrandAlignment: () => ({ aligned: true, issues: [] }),
}));

describe("Platform Adapter Integration", () => {
  it("distributes content through full pipeline", async () => {
    const { distributeContent } = await import("../platform-adapter");
    const result = await distributeContent({
      userId: "user1",
      platform: "youtube",
      contentId: "v1",
      contentType: "video",
      title: "Elden Ring Boss",
      description: "No commentary",
      content: "video-content",
      tags: ["gaming"],
    });
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("eventId");
    expect(result).toHaveProperty("trustCheck");
    expect(result).toHaveProperty("policyCheck");
    expect(result).toHaveProperty("connectionHealth");
  });

  it("returns supported platforms", async () => {
    const { getSupportedPlatforms } = await import("../platform-adapter");
    const platforms = getSupportedPlatforms();
    expect(platforms.length).toBeGreaterThan(0);
    expect(platforms).toContain("youtube");
  });

  it("gets distribution stats", async () => {
    const { getDistributionStats } = await import("../platform-adapter");
    const stats = await getDistributionStats("user1");
    expect(stats).toHaveProperty("totalEvents");
    expect(stats).toHaveProperty("byPlatform");
  });

  it("gets distribution history", async () => {
    const { getDistributionHistory } = await import("../platform-adapter");
    const history = await getDistributionHistory("user1");
    expect(Array.isArray(history)).toBe(true);
  });
});

describe("Brand Recognition Integration", () => {
  it("scores brand consistency", async () => {
    const { scoreBrandConsistency } = await import("../brand-recognition");
    const result = await scoreBrandConsistency("user1");
    expect(result).toHaveProperty("overallScore");
    expect(typeof result.overallScore).toBe("number");
  });
});

describe("Cadence Intelligence Integration", () => {
  it("analyzes cadence", async () => {
    const { analyzeCadence } = await import("../cadence-intelligence");
    const result = await analyzeCadence("user1");
    expect(result).toHaveProperty("burnoutRisk");
    expect(typeof result.burnoutRisk).toBe("number");
  });
});

describe("Cadence Resilience Integration", () => {
  it("enforces minimum cadence", async () => {
    const { enforceMinimumCadence } = await import("../cadence-resilience");
    const result = await enforceMinimumCadence("user1");
    expect(result).toHaveProperty("enforced");
    expect(typeof result.enforced).toBe("boolean");
  });
});

describe("Content Timing Integration", () => {
  it("analyzes content timing", async () => {
    const { analyzeContentTiming } = await import("../content-timing");
    const result = await analyzeContentTiming("user1", "youtube");
    expect(result).toHaveProperty("userId");
  });
});

describe("Competitor Intelligence Integration", () => {
  it("analyzes competitors", async () => {
    const { analyzeCompetitors } = await import("../competitor-intelligence");
    const result = await analyzeCompetitors("user1");
    expect(result).toHaveProperty("competitors");
    expect(Array.isArray(result.competitors)).toBe(true);
  });
});

describe("Algorithm Relationship Integration", () => {
  it("analyzes algorithm relationships", async () => {
    const { analyzeAlgorithmRelationships } = await import("../algorithm-relationship");
    const result = await analyzeAlgorithmRelationships("user1");
    expect(result).toHaveProperty("userId");
  });
});

describe("Trend Arbitrage Integration", () => {
  it("finds arbitrage opportunities", async () => {
    const { findArbitrageOpportunities } = await import("../trend-arbitrage");
    const result = await findArbitrageOpportunities("user1");
    expect(result).toHaveProperty("userId");
  });
});

describe("Format Innovation Integration", () => {
  it("analyzes format innovations", async () => {
    const { analyzeFormatInnovations } = await import("../format-innovation");
    const result = await analyzeFormatInnovations("user1");
    expect(result).toHaveProperty("userId");
  });
});

describe("Cross-Platform Packaging Integration", () => {
  it("packages for all platforms", async () => {
    const { packageForAllPlatforms } = await import("../cross-platform-packaging");
    const result = await packageForAllPlatforms(
      "user1",
      { title: "Test Video", description: "Gameplay", tags: ["gaming"], game: "Elden Ring" },
      ["youtube", "tiktok"]
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("gets packaging spec", async () => {
    const { getPackagingSpec } = await import("../cross-platform-packaging");
    const spec = getPackagingSpec("youtube");
    expect(spec).toHaveProperty("format");
  });
});

describe("Cultural Intelligence Integration", () => {
  it("scores safe content across regions", async () => {
    const { scoreCulturalSensitivity } = await import("../cultural-intelligence");
    const result = await scoreCulturalSensitivity("user1", {
      title: "Normal Gaming Content",
      description: "Regular gameplay",
      tags: ["gaming"],
    }, ["US", "GB", "JP"]);
    expect(result.results).toHaveLength(3);
    expect(result.blockedRegions).toHaveLength(0);
    expect(result.overallScore).toBe(1);
  });

  it("returns empty for blocked trust budget", async () => {
    const trustMod = await import("../../kernel/trust-budget");
    vi.spyOn(trustMod, "checkTrustBudget").mockResolvedValueOnce({
      remaining: 0, blocked: true, periodId: "t", deductionsCount: 10, totalDeducted: 100,
    });
    const { scoreCulturalSensitivity } = await import("../cultural-intelligence");
    const result = await scoreCulturalSensitivity("user1", { title: "test", description: "", tags: [] }, ["US"]);
    expect(result.results).toHaveLength(0);
    expect(result.overallScore).toBe(0);
  });
});

describe("Geopolitical Safety Integration", () => {
  it("flags gambling content for Saudi Arabia", async () => {
    const { checkGeopoliticalSafety } = await import("../geopolitical-safety");
    const result = await checkGeopoliticalSafety("user1", {
      title: "Casino Gambling Game",
      description: "Play casino games",
      tags: ["gambling"],
    }, ["SA"]);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.restrictedRegions).toContain("SA");
    expect(result.overallSafety).toBe(0);
  });

  it("passes safe content for US/GB", async () => {
    const { checkGeopoliticalSafety } = await import("../geopolitical-safety");
    const result = await checkGeopoliticalSafety("user1", {
      title: "Gaming Video",
      description: "Normal gameplay",
      tags: ["ps5"],
    }, ["US", "GB"]);
    expect(result.safeRegions).toContain("US");
    expect(result.safeRegions).toContain("GB");
    expect(result.overallSafety).toBe(1);
  });
});

describe("Platform Independence Integration", () => {
  it("assesses independence with no data", async () => {
    const { assessPlatformIndependence } = await import("../platform-independence");
    const result = await assessPlatformIndependence("user1");
    expect(result.dependencies).toHaveLength(0);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.roadmap)).toBe(true);
  });
});

describe("Content Preservation Integration", () => {
  it("handles empty video list", async () => {
    const { assessContentPreservation } = await import("../content-preservation");
    const result = await assessContentPreservation("user1");
    expect(result.totalContent).toBe(0);
    expect(result.overallHealth).toBe(0);
  });

  it("scaffolds data vault with correct structure", async () => {
    const { scaffoldDataVault } = await import("../content-preservation");
    const vault = scaffoldDataVault("user1");
    expect(vault.backupFrequency).toBe("weekly");
    expect(vault.encryptionEnabled).toBe(true);
    expect(Object.keys(vault.storageTiers)).toHaveLength(3);
    expect(vault.dataCategories).toContain("raw-video");
    expect(vault.dataCategories).toContain("analytics-snapshots");
  });
});

describe("Regulatory Horizon Integration", () => {
  it("returns all known regulations", async () => {
    const { scanRegulatoryHorizon } = await import("../regulatory-horizon");
    const result = await scanRegulatoryHorizon("user1");
    expect(result.alerts.length).toBeGreaterThanOrEqual(5);
    const ids = result.alerts.map(a => a.id);
    expect(ids).toContain("eu-dsa-2024");
    expect(ids).toContain("uk-osa-2025");
  });

  it("filters by youtube platform", async () => {
    const { scanRegulatoryHorizon } = await import("../regulatory-horizon");
    const result = await scanRegulatoryHorizon("user1", ["youtube"]);
    for (const alert of result.alerts) {
      expect(alert.affectedPlatforms).toContain("youtube");
    }
  });

  it("returns urgent alerts", async () => {
    const { getUrgentAlerts } = await import("../regulatory-horizon");
    const alerts = await getUrgentAlerts("user1");
    expect(Array.isArray(alerts)).toBe(true);
  });
});

describe("Global Monetization Integration", () => {
  it("provides licensing templates", async () => {
    const { analyzeGlobalMonetization } = await import("../global-monetization");
    const result = await analyzeGlobalMonetization("user1");
    expect(result.licensingOpportunities.length).toBeGreaterThan(0);
    const types = result.licensingOpportunities.map(l => l.contentType);
    expect(types).toContain("highlight-reels");
    expect(types).toContain("full-playthroughs");
  });

  it("includes payment infrastructure info", async () => {
    const { analyzeGlobalMonetization } = await import("../global-monetization");
    const result = await analyzeGlobalMonetization("user1");
    expect(result.paymentInfrastructure).toHaveProperty("supportedCurrencies");
    expect(result.paymentInfrastructure).toHaveProperty("gaps");
  });
});

describe("Distribution Safety Gate Integration", () => {
  it("evaluates safe content", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "youtube",
      title: "PS5 Gaming",
      tags: ["gaming"],
    });
    expect(result.allowed).toBe(true);
    expect(result.blockedRegions).toHaveLength(0);
  });

  it("blocks dangerous content for restricted regions", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "tiktok",
      title: "Skeleton gambling casino game",
      tags: ["skeleton", "gambling", "casino"],
      targetRegions: ["CN", "SA"],
    });
    expect(result.blockedRegions.length).toBeGreaterThan(0);
  });

  it("returns recommendations", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "youtube",
      title: "Normal Content",
      tags: [],
    });
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});

describe("Connection Health Integration", () => {
  it("reports connection health", async () => {
    const { getConnectionHealth } = await import("../connection-health");
    const health = getConnectionHealth("youtube");
    expect(health).toHaveProperty("status");
    expect(health).toHaveProperty("latencyMs");
  });
});

describe("Adaptive Brand Integration", () => {
  it("adapts brand for platforms", async () => {
    const { adaptBrandForPlatform } = await import("../adaptive-brand");
    const result = await adaptBrandForPlatform("user1", "youtube", {
      title: "Test Gaming Video",
      description: "No commentary gameplay",
      tags: ["gaming", "ps5"],
    });
    expect(result).toHaveProperty("platform");
    expect(result.platform).toBe("youtube");
  });

  it("gets platform brand spec", async () => {
    const { getPlatformBrandSpec } = await import("../adaptive-brand");
    const spec = getPlatformBrandSpec("youtube");
    expect(spec).toHaveProperty("maxTitleLength");
  });
});

describe("Regional Opportunity Integration", () => {
  it("analyzes regional opportunities", async () => {
    const { analyzeRegionalOpportunities } = await import("../regional-opportunity");
    const result = await analyzeRegionalOpportunities("user1");
    expect(result).toHaveProperty("userId");
  });
});

describe("Distribution Summary Integration", () => {
  it("aggregates all distribution intelligence modules", async () => {
    const { getDistributionStats } = await import("../platform-adapter");
    const stats = await getDistributionStats("user1");
    expect(typeof stats.totalEvents).toBe("number");
    expect(typeof stats.approved).toBe("number");
    expect(typeof stats.blocked).toBe("number");
  });

  it("brand scoring returns numeric overallScore", async () => {
    const { scoreBrandConsistency } = await import("../brand-recognition");
    const result = await scoreBrandConsistency("user1");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it("cadence analysis returns burnout risk in [0,1]", async () => {
    const { analyzeCadence } = await import("../cadence-intelligence");
    const result = await analyzeCadence("user1");
    expect(result.burnoutRisk).toBeGreaterThanOrEqual(0);
    expect(result.burnoutRisk).toBeLessThanOrEqual(1);
  });

  it("regulatory horizon sorts alerts by urgency", async () => {
    const { scanRegulatoryHorizon } = await import("../regulatory-horizon");
    const result = await scanRegulatoryHorizon("user1");
    for (let i = 1; i < result.alerts.length; i++) {
      expect(result.alerts[i].daysUntilEffective).toBeGreaterThanOrEqual(result.alerts[i - 1].daysUntilEffective);
    }
  });

  it("geopolitical safety returns overallSafety in [0,1]", async () => {
    const { checkGeopoliticalSafety } = await import("../geopolitical-safety");
    const result = await checkGeopoliticalSafety("user1", { title: "Test", description: "", tags: [] }, ["US"]);
    expect(result.overallSafety).toBeGreaterThanOrEqual(0);
    expect(result.overallSafety).toBeLessThanOrEqual(1);
  });
});

describe("v9.0 Verification", () => {
  it("distribution pipeline enforces circuit breaker before trust budget", async () => {
    const connHealthMod = await import("../connection-health");
    vi.spyOn(connHealthMod, "getConnectionHealth").mockReturnValueOnce({ status: "open", latencyMs: 0 });

    const { distributeContent } = await import("../platform-adapter");
    const result = await distributeContent({
      userId: "user1",
      platform: "youtube",
      contentId: "v1",
      contentType: "video",
      title: "Test",
      content: "test",
    });
    expect(result.allowed).toBe(false);
    expect(result.policyCheck.issues).toContain("circuit breaker open");
  });

  it("safety gate integrates geopolitical + cultural + preservation", async () => {
    const { runDistributionSafetyGate } = await import("../distribution-safety-gate");
    const result = await runDistributionSafetyGate({
      userId: "user1",
      platform: "youtube",
      title: "Safe Content",
      tags: ["gaming"],
    });
    expect(result).toHaveProperty("geopoliticalFlags");
    expect(result).toHaveProperty("culturalIssues");
    expect(result).toHaveProperty("preservationWarning");
    expect(result).toHaveProperty("allowed");
  });

  it("capability probe is checked in distribution pipeline", async () => {
    const capMod = await import("../../kernel/capability-probe");
    vi.spyOn(capMod, "probeCapability").mockResolvedValueOnce({ probeResult: "error", latencyMs: 0 } as ReturnType<typeof capMod.probeCapability> extends Promise<infer T> ? T : never);

    const connHealthMod = await import("../connection-health");
    vi.spyOn(connHealthMod, "getConnectionHealth").mockReturnValueOnce({ status: "closed", latencyMs: 100 });

    const { distributeContent } = await import("../platform-adapter");
    const result = await distributeContent({
      userId: "user1",
      platform: "twitch",
      contentId: "v2",
      contentType: "short",
      title: "Test Capability",
      content: "test",
    });
    expect(result.allowed).toBe(false);
    expect(result.capabilityCheck.probeResult).toBe("error");
  });
});
