import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-biz-intel";

const mockRecords = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", source: "Ad Revenue", amount: 500, currency: "USD", period: "2025-03", syncSource: "auto", externalId: "yt-001", reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: "auto", reconciliationVerifiedAt: new Date("2025-03-20"), reconciliationNotes: null, recordedAt: new Date("2025-03-15"), createdAt: new Date("2025-03-15"), metadata: {} },
  { id: 2, userId: TEST_USER_ID, platform: "youtube", source: "Sponsorship", amount: 1000, currency: "USD", period: "2025-03", syncSource: "manual", externalId: null, reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: new Date("2025-03-18"), reconciliationNotes: null, recordedAt: new Date("2025-03-10"), createdAt: new Date("2025-03-10"), metadata: {} },
  { id: 3, userId: TEST_USER_ID, platform: "twitch", source: "Subscriptions", amount: 200, currency: "USD", period: "2025-03", syncSource: "auto", externalId: "twitch-001", reconciliationStatus: "estimated", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-03-05"), createdAt: new Date("2025-03-05"), metadata: {} },
  { id: 4, userId: TEST_USER_ID, platform: "youtube", source: "Affiliate", amount: 150, currency: "USD", period: "2025-02", syncSource: "manual", externalId: null, reconciliationStatus: "unverified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-02-15"), createdAt: new Date("2025-02-15"), metadata: {} },
  { id: 5, userId: TEST_USER_ID, platform: "youtube", source: "Merchandise", amount: 300, currency: "USD", period: "2025-01", syncSource: "manual", externalId: null, reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-01-20"), createdAt: new Date("2025-01-20"), metadata: {} },
];

const mockChannels = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", channelName: "GameMaster", channelId: "UC001", subscriberCount: 25000, viewCount: 2000000, videoCount: 150, contentNiche: "gaming", createdAt: new Date("2023-01-01") },
  { id: 2, userId: TEST_USER_ID, platform: "twitch", channelName: "GameMasterLive", channelId: "twitch001", subscriberCount: 5000, viewCount: 500000, videoCount: 0, contentNiche: "gaming", createdAt: new Date("2023-06-01") },
];

const mockVideos = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1, channelId: 1, title: `Epic Gameplay Part ${i + 1}`, type: "video", status: "published",
  platform: "youtube", publishedAt: new Date(`2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}`),
  createdAt: new Date(`2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}`),
  metadata: {
    viewCount: 10000 + i * 500,
    likeCount: 500 + i * 20,
    commentCount: 50 + i * 3,
    stats: { views: 10000 + i * 500, likes: 500 + i * 20, comments: 50 + i * 3 },
    gameName: i % 3 === 0 ? "Elden Ring" : undefined,
  },
}));

const mockEquipment = [
  { id: 1, userId: TEST_USER_ID, itemName: "PS5 Console", category: "console", purchasePrice: 500, revenueAttributed: 2000, hoursUsed: 1000, roiPercent: 300, status: "paid-off", createdAt: new Date("2023-01-01") },
  { id: 2, userId: TEST_USER_ID, itemName: "Capture Card", category: "capture", purchasePrice: 200, revenueAttributed: 500, hoursUsed: 800, roiPercent: 150, status: "paid-off", createdAt: new Date("2023-03-01") },
];

function makeChain(data: unknown[]): any {
  const chain: any = {};
  const self = () => chain;
  chain.where = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockImplementation((lim: number) => makeChain(data.slice(0, lim)));
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.then = (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => Promise.resolve(data).then(resolve, reject);
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(data).catch(reject);
  return chain;
}

vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        if (table.reconciliationStatus === "reconciliation_status") return makeChain(mockRecords);
        if (table.subscriberCount === "subscriber_count") return makeChain(mockChannels);
        if (table.channelId === "channel_id" && table.title === "title") return makeChain(mockVideos);
        if (table.roiPercent === "roi_percent") return makeChain(mockEquipment);
        return makeChain([]);
      }),
    })),
  },
}));

vi.mock("../revenue-confidence", async () => {
  const actual = await vi.importActual("../revenue-confidence") as Record<string, unknown>;
  return actual;
});

vi.mock("@shared/schema", () => ({
  revenueRecords: {
    userId: "user_id", id: "id", platform: "platform", source: "source",
    amount: "amount", recordedAt: "recorded_at", reconciliationStatus: "reconciliation_status",
    reconciliationSource: "reconciliation_source", reconciliationVerifiedAt: "reconciliation_verified_at",
    reconciliationGapAmount: "reconciliation_gap_amount", reconciliationNotes: "reconciliation_notes",
    syncSource: "sync_source", externalId: "external_id", currency: "currency",
    period: "period", metadata: "metadata", createdAt: "created_at",
  },
  channels: {
    userId: "user_id", id: "id", platform: "platform", channelName: "channel_name",
    channelId: "channel_id", subscriberCount: "subscriber_count", viewCount: "view_count",
    videoCount: "video_count", contentNiche: "content_niche", createdAt: "created_at",
  },
  videos: {
    channelId: "channel_id", id: "id", title: "title", type: "type",
    status: "status", platform: "platform", createdAt: "created_at", metadata: "metadata",
    publishedAt: "published_at",
  },
  equipmentRoi: {
    userId: "user_id", id: "id", itemName: "item_name", category: "category",
    purchasePrice: "purchase_price", revenueAttributed: "revenue_attributed",
    hoursUsed: "hours_used", roiPercent: "roi_percent", status: "status", createdAt: "created_at",
  },
}));

describe("Phase 5: Business Intelligence Engines", () => {

  describe("Capital Allocation Engine", () => {
    it("should compute allocation plan with all budget categories", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.allocations.length).toBeGreaterThanOrEqual(5);
      expect(result.allocations.map(a => a.category)).toContain("Content Production");
      expect(result.allocations.map(a => a.category)).toContain("Emergency Reserve");
      expect(result.allocations.map(a => a.category)).toContain("Marketing & Growth");
    });

    it("should calculate emergency reserve adequacy", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.emergencyReserve).toHaveProperty("amount");
      expect(result.emergencyReserve).toHaveProperty("monthsCovered");
      expect(result.emergencyReserve).toHaveProperty("adequate");
    });

    it("should assess budget health based on revenue", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(["healthy", "stretched", "underfunded", "critical"]).toContain(result.budgetHealth);
    });

    it("should include revenue confidence from reconciliation", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.revenueConfidence.verifiedPercent).toBeGreaterThanOrEqual(0);
      expect(["high", "medium", "low", "unverified"]).toContain(result.revenueConfidence.confidenceLabel);
    });

    it("should provide actionable recommendations", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.reinvestmentRate).toBeGreaterThan(0);
    });
  });

  describe("Content Asset Valuation + IP Intelligence", () => {
    it("should score content library with asset scores", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(result.totalAssets).toBe(60);
      expect(result.topAssets.length).toBeGreaterThan(0);
      expect(result.topAssets[0].assetScore).toBeGreaterThanOrEqual(0);
    });

    it("should identify evergreen content", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(Array.isArray(result.evergreenContent)).toBe(true);
      for (const asset of result.evergreenContent) {
        expect(asset.evergreenScore).toBeGreaterThanOrEqual(60);
      }
    });

    it("should identify licensing candidates", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(Array.isArray(result.licensingCandidates)).toBe(true);
      for (const asset of result.licensingCandidates) {
        expect(["high", "medium"]).toContain(asset.licensingPotential);
      }
    });

    it("should track IP ownership across content", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(result.ipSummary).toHaveProperty("fullOwnership");
      expect(result.ipSummary).toHaveProperty("shared");
      expect(result.ipSummary.fullOwnership + result.ipSummary.shared + result.ipSummary.unclear).toBe(60);
    });

    it("should assess library health", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(["strong", "growing", "thin", "at_risk"]).toContain(result.libraryHealth);
      expect(result.totalEstimatedValue).toBeGreaterThan(0);
    });
  });

  describe("Risk + Moat Intelligence", () => {
    it("should compute AI displacement risk", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.aiDisplacement.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.aiDisplacement.overallRiskScore).toBeLessThanOrEqual(100);
      expect(["low", "moderate", "elevated", "high", "critical"]).toContain(result.aiDisplacement.riskLevel);
      expect(result.aiDisplacement.mitigations.length).toBeGreaterThan(0);
    });

    it("should compute human value moat", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.humanValueMoat.moatStrength).toBeGreaterThanOrEqual(0);
      expect(["fortress", "strong", "developing", "weak"]).toContain(result.humanValueMoat.moatLevel);
      expect(result.humanValueMoat.uniqueFactors.length).toBeGreaterThan(0);
      expect(result.humanValueMoat.irreplaceableElements.length).toBeGreaterThan(0);
    });

    it("should compute creator wellness score", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.creatorWellness.wellnessScore).toBeGreaterThanOrEqual(0);
      expect(["thriving", "sustainable", "strained", "burnout_risk"]).toContain(result.creatorWellness.level);
      expect(result.creatorWellness.indicators).toHaveProperty("contentCadence");
      expect(result.creatorWellness.indicators).toHaveProperty("workloadBalance");
    });

    it("should produce overall risk profile", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(["low", "moderate", "elevated", "high"]).toContain(result.overallRiskProfile);
      expect(result.revenueConfidence.confidenceLabel).toBeDefined();
    });
  });

  describe("Revenue Velocity + Strategic Positioning", () => {
    it("should measure content-to-revenue velocity", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(result.velocity).toHaveProperty("avgDaysToFirstRevenue");
      expect(result.velocity).toHaveProperty("revenuePerContentDay");
      expect(result.velocity).toHaveProperty("contentToRevenueRatio");
    });

    it("should build strategic asset narrative", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(result.narrative.headline.length).toBeGreaterThan(0);
      expect(result.narrative.valueProposition.length).toBeGreaterThan(0);
      expect(result.narrative.keyMetrics.length).toBeGreaterThan(0);
      expect(result.narrative.investorHighlights.length).toBeGreaterThan(0);
    });

    it("should assess infrastructure positioning", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(["pre_revenue", "early", "growing", "established", "scaling"]).toContain(result.infrastructure.maturityLevel);
      expect(result.infrastructure.gapAnalysis.length).toBeGreaterThan(0);
      expect(result.infrastructure.readinessScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Estate + Succession Planning", () => {
    it("should compute succession readiness", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.succession.readinessScore).toBeGreaterThanOrEqual(0);
      expect(["prepared", "partial", "unprepared", "at_risk"]).toContain(result.succession.level);
      expect(result.succession.checklist.length).toBeGreaterThan(0);
    });

    it("should estimate digital asset value", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.digitalAssets.channels).toBe(2);
      expect(result.digitalAssets.contentPieces).toBe(60);
      expect(result.digitalAssets.revenueStreams).toBeGreaterThan(0);
    });

    it("should identify key risks for estate planning", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.keyRisks.length).toBeGreaterThan(0);
      expect(result.succession.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Business Learning Signals", () => {
    it("should extract learning signals from business data", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.signals.length).toBeGreaterThan(0);
      for (const signal of result.signals) {
        expect(signal).toHaveProperty("category");
        expect(signal).toHaveProperty("signal");
        expect(["high", "medium", "low"]).toContain(signal.confidence);
        expect(signal).toHaveProperty("suggestedAction");
      }
    });

    it("should detect revenue and content patterns", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.patterns.revenuePatterns.length).toBeGreaterThan(0);
      expect(result.patterns.contentPatterns.length).toBeGreaterThan(0);
      expect(result.patterns.growthPatterns.length).toBeGreaterThan(0);
    });

    it("should assess business maturity stage", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(["seed", "early", "growth", "scale", "mature"]).toContain(result.maturityAssessment.stage);
      expect(result.maturityAssessment.score).toBeGreaterThanOrEqual(0);
      expect(result.maturityAssessment.nextMilestone.length).toBeGreaterThan(0);
    });

    it("should identify feedback loops", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.feedbackLoops.length).toBeGreaterThan(0);
      for (const loop of result.feedbackLoops) {
        expect(["active", "dormant", "missing"]).toContain(loop.status);
        expect(loop.impact.length).toBeGreaterThan(0);
      }
    });

    it("should include revenue confidence data", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.revenueConfidence.verifiedPercent).toBeGreaterThanOrEqual(0);
      expect(["high", "medium", "low", "unverified"]).toContain(result.revenueConfidence.confidenceLabel);
    });
  });
});
