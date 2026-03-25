import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => {
  let nextId = 1;
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          returning: () => {
            const id = nextId++;
            const row = { ...v, id, createdAt: new Date() };
            return [row];
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
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
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

describe("Competitor Intelligence", () => {
  it("analyzes competitors", async () => {
    const { analyzeCompetitors } = await import("../competitor-intelligence");
    const result = await analyzeCompetitors("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.competitors)).toBe(true);
    expect(Array.isArray(result.contentGaps)).toBe(true);
    expect(Array.isArray(result.publishingPatternInsights)).toBe(true);
    expect(Array.isArray(result.topicOpportunities)).toBe(true);
    expect(result.overallCompetitivePosition).toBeGreaterThanOrEqual(0);
    expect(result.overallCompetitivePosition).toBeLessThanOrEqual(1);
  });

  it("gets competitor blind spots", async () => {
    const { getCompetitorBlindSpots } = await import("../competitor-intelligence");
    const result = await getCompetitorBlindSpots("user1");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Algorithm Relationship", () => {
  it("analyzes algorithm relationships", async () => {
    const { analyzeAlgorithmRelationships } = await import("../algorithm-relationship");
    const result = await analyzeAlgorithmRelationships("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.platformRankings).toBeDefined();
    expect(Array.isArray(result.bestContentTypes)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("updates algorithm signal", async () => {
    const { updateAlgorithmSignal } = await import("../algorithm-relationship");
    await expect(updateAlgorithmSignal("user1", "youtube", "gameplay", {
      ctrResponse: 0.7,
      retentionResponse: 0.6,
    })).resolves.toBeUndefined();
  });
});

describe("Trend Arbitrage", () => {
  it("finds arbitrage opportunities", async () => {
    const { findArbitrageOpportunities } = await import("../trend-arbitrage");
    const result = await findArbitrageOpportunities("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(typeof result.totalOpportunities).toBe("number");
    expect(typeof result.avgWindowHours).toBe("number");
  });

  it("gets first-mover window", async () => {
    const { getFirstMoverWindow } = await import("../trend-arbitrage");
    const result = await getFirstMoverWindow("user1", "Elden Ring DLC", "youtube");
    expect(result.windowRemainingHours).toBeGreaterThanOrEqual(0);
    expect(result.saturationLevel).toBeGreaterThanOrEqual(0);
    expect(result.saturationLevel).toBeLessThanOrEqual(1);
    expect(["strong", "moderate", "closing", "expired"]).toContain(result.viability);
    expect(typeof result.competitorCount).toBe("number");
  });
});

describe("Format Innovation", () => {
  it("analyzes format innovations", async () => {
    const { analyzeFormatInnovations } = await import("../format-innovation");
    const result = await analyzeFormatInnovations("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(Array.isArray(result.emergingFormats)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("discovers emerging formats for YouTube", async () => {
    const { analyzeFormatInnovations } = await import("../format-innovation");
    const result = await analyzeFormatInnovations("user1", ["youtube"]);
    expect(result.emergingFormats.length).toBeGreaterThan(0);
    for (const f of result.emergingFormats) {
      expect(f.platform).toBe("youtube");
      expect(f.adoptionStage).toBe("emerging");
      expect(f.potentialScore).toBeGreaterThan(0);
    }
  });

  it("gets format recommendations for a platform", async () => {
    const { getFormatRecommendations } = await import("../format-innovation");
    const result = await getFormatRecommendations("user1", "youtube");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Regional Opportunity", () => {
  it("analyzes regional opportunities", async () => {
    const { analyzeRegionalOpportunities } = await import("../regional-opportunity");
    const result = await analyzeRegionalOpportunities("user1");
    expect(result.userId).toBe("user1");
    expect(Array.isArray(result.regions)).toBe(true);
    expect(typeof result.geoDiversity).toBe("number");
    expect(result.geoDiversity).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("gets regional trends", async () => {
    const { getRegionalTrends } = await import("../regional-opportunity");
    const result = await getRegionalTrends("user1", "US");
    expect(Array.isArray(result)).toBe(true);
  });
});
