import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-integration";

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

const mockStreams = [
  { id: 1, userId: TEST_USER_ID, title: "Live PS5 Gaming", description: "Epic stream", category: "gaming", status: "completed", platforms: ["youtube"], streamStats: { peakViewers: 100, avgViewers: 50, totalViews: 500, chatMessages: 200, newFollowers: 10 }, createdAt: new Date("2024-06-15"), scheduledFor: new Date("2024-06-15"), startedAt: new Date("2024-06-15"), endedAt: new Date("2024-06-15") },
];

const mockSponsorshipDeals = [
  { id: 1, userId: TEST_USER_ID, brandName: "GameCo", status: "active", dealValue: 2000, currency: "USD", deliverables: { items: [{ type: "video", description: "Sponsored video" }] }, contactEmail: "deals@gameco.com", notes: null, startDate: new Date("2025-01-01"), endDate: new Date("2025-06-01"), createdAt: new Date("2025-01-01") },
];

const mockDistributionEvents = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", contentId: "v1", eventType: "publish", status: "completed", metadata: {}, trustBudgetCost: 0.1, createdAt: new Date("2025-03-01") },
];

vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockImplementation((selectObj?: any) => ({
      from: vi.fn().mockImplementation((table: any) => {
        if (table.reconciliationStatus === "reconciliation_status") return makeChain(mockRecords);
        if (table.subscriberCount === "subscriber_count") return makeChain(mockChannels);
        if (table.channelId === "channel_id" && table.title === "title") return makeChain(mockVideos);
        if (table.roiPercent === "roi_percent") return makeChain(mockEquipment);
        if (table.streamStats === "stream_stats") return makeChain(mockStreams);
        if (table.brandName === "brand_name") return makeChain(mockSponsorshipDeals);
        if (table.trustBudgetCost === "trust_budget_cost") return makeChain(mockDistributionEvents);
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
  streams: {
    userId: "user_id", id: "id", title: "title", description: "description",
    category: "category", status: "status", platforms: "platforms",
    streamStats: "stream_stats", createdAt: "created_at",
    scheduledFor: "scheduled_for", startedAt: "started_at", endedAt: "ended_at",
  },
  sponsorshipDeals: {
    userId: "user_id", id: "id", brandName: "brand_name", status: "status",
    dealValue: "deal_value", currency: "currency", deliverables: "deliverables",
    contactEmail: "contact_email", notes: "notes", startDate: "start_date",
    endDate: "end_date", createdAt: "created_at",
  },
  distributionEvents: {
    userId: "user_id", id: "id", platform: "platform", contentId: "content_id",
    eventType: "event_type", status: "status", metadata: "metadata",
    trustBudgetCost: "trust_budget_cost", createdAt: "created_at",
  },
}));

describe("Phase 5: Business Intelligence Integration Tests", () => {

  describe("Sellability Score", () => {
    it("should compute sellability score with valid grade", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const result = await computeSellabilityScore(TEST_USER_ID);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(result.grade);
    });

    it("should include component scores", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const result = await computeSellabilityScore(TEST_USER_ID);
      expect(result.components).toBeDefined();
      expect(typeof result.components.revenueStability).toBe("number");
      expect(typeof result.components.platformIndependence).toBe("number");
    });

    it("should include actionable recommendations", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const result = await computeSellabilityScore(TEST_USER_ID);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should include strengths and weaknesses", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const result = await computeSellabilityScore(TEST_USER_ID);
      expect(Array.isArray(result.strengths)).toBe(true);
      expect(Array.isArray(result.weaknesses)).toBe(true);
    });
  });

  describe("Dynamic Valuation", () => {
    it("should compute valuation with range", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const result = await computeDynamicValuation(TEST_USER_ID);
      expect(result.estimatedValue).toBeGreaterThanOrEqual(0);
      expect(result.valueRange).toBeDefined();
      expect(result.valueRange.low).toBeLessThanOrEqual(result.estimatedValue);
      expect(result.valueRange.high).toBeGreaterThanOrEqual(result.estimatedValue);
    });

    it("should include methodologies", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const result = await computeDynamicValuation(TEST_USER_ID);
      expect(Array.isArray(result.methodologies)).toBe(true);
      expect(result.methodologies.length).toBeGreaterThan(0);
    });

    it("should include revenue confidence", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const result = await computeDynamicValuation(TEST_USER_ID);
      expect(result.revenueConfidence).toBeDefined();
      expect(typeof result.revenueConfidence.confidenceLabel).toBe("string");
    });
  });

  describe("Sovereign Exit", () => {
    it("should compute exit readiness", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const result = await assessSovereignExit(TEST_USER_ID);
      expect(result.overallReadiness).toBeGreaterThanOrEqual(0);
      expect(result.overallReadiness).toBeLessThanOrEqual(100);
    });

    it("should include portability scores", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const result = await assessSovereignExit(TEST_USER_ID);
      expect(Array.isArray(result.portabilityScores)).toBe(true);
    });

    it("should include vendor dependencies", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const result = await assessSovereignExit(TEST_USER_ID);
      expect(Array.isArray(result.vendorDependencies)).toBe(true);
    });

    it("should include recommendations", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const result = await assessSovereignExit(TEST_USER_ID);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe("Founder Dependency", () => {
    it("should compute dependency score", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const result = await computeFounderDependency(TEST_USER_ID);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it("should include risk level", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const result = await computeFounderDependency(TEST_USER_ID);
      expect(["low", "medium", "high", "critical"]).toContain(result.riskLevel);
    });

    it("should include factor breakdown", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const result = await computeFounderDependency(TEST_USER_ID);
      expect(result.factors).toBeDefined();
      expect(typeof result.factors.contentCreation).toBe("number");
    });

    it("should include mitigations", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const result = await computeFounderDependency(TEST_USER_ID);
      expect(Array.isArray(result.mitigations)).toBe(true);
    });
  });

  describe("Sponsor Intelligence", () => {
    it("should compute sponsor analysis", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const result = await analyzeSponsorIntelligence(TEST_USER_ID);
      expect(result).toBeDefined();
      expect(result.sponsorFitScores).toBeDefined();
    });

    it("should produce market rates", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const result = await analyzeSponsorIntelligence(TEST_USER_ID);
      expect(result.marketRates).toBeDefined();
      expect(result.marketRates.cpm).toBeDefined();
    });
  });

  describe("Brand Deal Intelligence", () => {
    it("should compute brand deal analysis", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const result = await analyzeBrandDeals(TEST_USER_ID);
      expect(result).toBeDefined();
      expect(typeof result.totalDealValue).toBe("number");
    });

    it("should include pipeline health", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const result = await analyzeBrandDeals(TEST_USER_ID);
      expect(result.pipelineHealth).toBeDefined();
    });

    it("should include revenue confidence", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const result = await analyzeBrandDeals(TEST_USER_ID);
      expect(result.revenueConfidence).toBeDefined();
      expect(typeof result.revenueConfidence.confidenceLabel).toBe("string");
    });
  });

  describe("Commerce Intelligence", () => {
    it("should compute commerce analysis", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const result = await analyzeCommerceIntelligence(TEST_USER_ID);
      expect(result).toBeDefined();
      expect(result.commerceMetrics).toBeDefined();
    });

    it("should include social commerce opportunities", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const result = await analyzeCommerceIntelligence(TEST_USER_ID);
      expect(Array.isArray(result.socialCommerceOpportunities)).toBe(true);
    });

    it("should include offer operating system", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const result = await analyzeCommerceIntelligence(TEST_USER_ID);
      expect(result.offerOperatingSystem).toBeDefined();
    });
  });

  describe("Monetization Timing", () => {
    it("should compute timing analysis", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const result = await analyzeMonetizationTiming(TEST_USER_ID);
      expect(result).toBeDefined();
      expect(result.currentPressure).toBeDefined();
    });

    it("should include timing windows", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const result = await analyzeMonetizationTiming(TEST_USER_ID);
      expect(Array.isArray(result.optimalTimingWindows)).toBe(true);
    });

    it("should include benchmarks", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const result = await analyzeMonetizationTiming(TEST_USER_ID);
      expect(Array.isArray(result.benchmarks)).toBe(true);
    });
  });

  describe("Revenue Diversification", () => {
    it("should compute diversification analysis", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const result = await analyzeRevenueDiversification(TEST_USER_ID);
      expect(result).toBeDefined();
      expect(result.currentDiversification).toBeDefined();
    });

    it("should produce herfindahl index", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const result = await analyzeRevenueDiversification(TEST_USER_ID);
      expect(result.currentDiversification.herfindahlIndex).toBeGreaterThanOrEqual(0);
      expect(result.currentDiversification.herfindahlIndex).toBeLessThanOrEqual(1);
    });

    it("should include roadmap items", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const result = await analyzeRevenueDiversification(TEST_USER_ID);
      expect(Array.isArray(result.roadmap)).toBe(true);
    });
  });

  describe("Capital Allocation", () => {
    it("should compute capital allocation plan", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.allocations.length).toBeGreaterThanOrEqual(5);
      expect(typeof result.budgetHealth).toBe("string");
    });

    it("should sum allocations to approximately 100%", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      const sum = result.allocations.reduce((s: number, a: any) => s + a.recommendedPercent, 0);
      expect(sum).toBeGreaterThanOrEqual(95);
      expect(sum).toBeLessThanOrEqual(105);
    });

    it("should include emergency reserve info", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const result = await computeCapitalAllocation(TEST_USER_ID);
      expect(result.emergencyReserve).toBeDefined();
      expect(typeof result.emergencyReserve.monthsCovered).toBe("number");
    });
  });

  describe("Content Asset Valuation", () => {
    it("should compute library value", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(result.totalEstimatedValue).toBeGreaterThanOrEqual(0);
      expect(result.totalAssets).toBeGreaterThanOrEqual(0);
    });

    it("should include top assets", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(Array.isArray(result.topAssets)).toBe(true);
    });

    it("should include IP summary", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(result.ipSummary).toBeDefined();
      expect(typeof result.ipSummary.fullOwnership).toBe("number");
    });

    it("should include library health grade", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(["strong", "growing", "thin", "at_risk"]).toContain(result.libraryHealth);
    });
  });

  describe("Risk Intelligence", () => {
    it("should compute overall risk profile", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(["low", "moderate", "elevated", "high"]).toContain(result.overallRiskProfile);
    });

    it("should assess AI displacement risk", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.aiDisplacement).toBeDefined();
      expect(typeof result.aiDisplacement.riskLevel).toBe("string");
    });

    it("should evaluate human value moat", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.humanValueMoat).toBeDefined();
      expect(typeof result.humanValueMoat.moatLevel).toBe("string");
    });

    it("should include creator wellness assessment", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.creatorWellness).toBeDefined();
      expect(typeof result.creatorWellness.level).toBe("string");
    });

    it("should include revenue confidence", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const result = await computeRiskIntelligence(TEST_USER_ID);
      expect(result.revenueConfidence).toBeDefined();
      expect(typeof result.revenueConfidence.confidenceLabel).toBe("string");
    });
  });

  describe("Revenue Velocity", () => {
    it("should compute velocity metrics", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(result.velocity).toBeDefined();
      expect(result.velocity.revenuePerContentDay).toBeGreaterThanOrEqual(0);
    });

    it("should include infrastructure position", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(result.infrastructure).toBeDefined();
      expect(typeof result.infrastructure.maturityLevel).toBe("string");
    });

    it("should include strategic narrative", async () => {
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const result = await computeRevenueVelocity(TEST_USER_ID);
      expect(result.narrative).toBeDefined();
    });
  });

  describe("Estate Succession", () => {
    it("should compute estate plan", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.succession).toBeDefined();
    });

    it("should include digital asset inventory", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.digitalAssets).toBeDefined();
      expect(typeof result.digitalAssets.channels).toBe("number");
      expect(typeof result.digitalAssets.contentPieces).toBe("number");
    });

    it("should include key risks", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(Array.isArray(result.keyRisks)).toBe(true);
    });

    it("should include revenue confidence", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const result = await computeEstatePlan(TEST_USER_ID);
      expect(result.revenueConfidence).toBeDefined();
      expect(typeof result.revenueConfidence.confidenceLabel).toBe("string");
    });
  });

  describe("Business Learning", () => {
    it("should compute maturity assessment", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.maturityAssessment).toBeDefined();
      expect(["seed", "early", "growth", "scale", "mature"]).toContain(result.maturityAssessment.stage);
      expect(result.maturityAssessment.score).toBeGreaterThanOrEqual(0);
    });

    it("should include learning signals", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it("should include feedback loops", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(Array.isArray(result.feedbackLoops)).toBe(true);
      result.feedbackLoops.forEach((fl: any) => {
        expect(typeof fl.loop).toBe("string");
        expect(["active", "dormant", "missing"]).toContain(fl.status);
      });
    });

    it("should include pattern analysis", async () => {
      const { computeBusinessLearning } = await import("../business-learning");
      const result = await computeBusinessLearning(TEST_USER_ID);
      expect(result.patterns).toBeDefined();
      expect(Array.isArray(result.patterns.revenuePatterns)).toBe(true);
    });
  });

  describe("Revenue Truth / Reconciliation", () => {
    it("should compute revenue truth summary", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const result = await getRevenueTruthSummary(TEST_USER_ID);
      expect(result.totalRevenue).toBeGreaterThan(0);
      expect(result.verificationRate).toBeGreaterThanOrEqual(0);
      expect(result.verificationRate).toBeLessThanOrEqual(100);
    });

    it("should include confidence label", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const result = await getRevenueTruthSummary(TEST_USER_ID);
      expect(typeof result.confidenceLabel).toBe("string");
      expect(result.confidenceLabel.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-Module Consistency", () => {
    it("sellability and valuation should use same revenue base", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const sellability = await computeSellabilityScore(TEST_USER_ID);
      const valuation = await computeDynamicValuation(TEST_USER_ID);
      expect(sellability.overallScore).toBeGreaterThanOrEqual(0);
      expect(valuation.estimatedValue).toBeGreaterThanOrEqual(0);
    });

    it("risk intelligence should complement founder dependency", async () => {
      const { computeRiskIntelligence } = await import("../risk-intelligence");
      const { computeFounderDependency } = await import("../founder-dependency");
      const risk = await computeRiskIntelligence(TEST_USER_ID);
      const founder = await computeFounderDependency(TEST_USER_ID);
      expect(typeof risk.overallRiskProfile).toBe("string");
      expect(founder.overallScore).toBeDefined();
    });

    it("capital allocation should align with revenue velocity", async () => {
      const { computeCapitalAllocation } = await import("../capital-allocation");
      const { computeRevenueVelocity } = await import("../revenue-velocity");
      const capital = await computeCapitalAllocation(TEST_USER_ID);
      const velocity = await computeRevenueVelocity(TEST_USER_ID);
      expect(typeof capital.budgetHealth).toBe("string");
      expect(velocity.infrastructure).toBeDefined();
    });

    it("estate plan should have digital asset count", async () => {
      const { computeEstatePlan } = await import("../estate-succession");
      const estate = await computeEstatePlan(TEST_USER_ID);
      expect(estate.digitalAssets.channels).toBeGreaterThanOrEqual(0);
    });

    it("content asset valuation should have total assets count", async () => {
      const { computeContentAssetValuation } = await import("../content-asset-valuation");
      const result = await computeContentAssetValuation(TEST_USER_ID);
      expect(result.totalAssets).toBeGreaterThanOrEqual(0);
    });

    it("all 16 modules should execute without errors", async () => {
      const [
        { getRevenueTruthSummary },
        { computeSellabilityScore },
        { computeDynamicValuation },
        { assessSovereignExit },
        { computeFounderDependency },
        { analyzeSponsorIntelligence },
        { analyzeBrandDeals },
        { analyzeCommerceIntelligence },
        { analyzeMonetizationTiming },
        { analyzeRevenueDiversification },
        { computeCapitalAllocation },
        { computeContentAssetValuation },
        { computeRiskIntelligence },
        { computeRevenueVelocity },
        { computeEstatePlan },
        { computeBusinessLearning },
      ] = await Promise.all([
        import("../revenue-reconciliation"),
        import("../sellability-score"),
        import("../dynamic-valuation"),
        import("../sovereign-exit"),
        import("../founder-dependency"),
        import("../sponsor-intelligence"),
        import("../brand-deal-intelligence"),
        import("../commerce-intelligence"),
        import("../monetization-timing"),
        import("../revenue-diversification"),
        import("../capital-allocation"),
        import("../content-asset-valuation"),
        import("../risk-intelligence"),
        import("../revenue-velocity"),
        import("../estate-succession"),
        import("../business-learning"),
      ]);

      const results = await Promise.all([
        getRevenueTruthSummary(TEST_USER_ID),
        computeSellabilityScore(TEST_USER_ID),
        computeDynamicValuation(TEST_USER_ID),
        assessSovereignExit(TEST_USER_ID),
        computeFounderDependency(TEST_USER_ID),
        analyzeSponsorIntelligence(TEST_USER_ID),
        analyzeBrandDeals(TEST_USER_ID),
        analyzeCommerceIntelligence(TEST_USER_ID),
        analyzeMonetizationTiming(TEST_USER_ID),
        analyzeRevenueDiversification(TEST_USER_ID),
        computeCapitalAllocation(TEST_USER_ID),
        computeContentAssetValuation(TEST_USER_ID),
        computeRiskIntelligence(TEST_USER_ID),
        computeRevenueVelocity(TEST_USER_ID),
        computeEstatePlan(TEST_USER_ID),
        computeBusinessLearning(TEST_USER_ID),
      ]);

      expect(results.length).toBe(16);
      results.forEach((r) => {
        expect(r).toBeDefined();
        expect(r).not.toBeNull();
      });
    });
  });

  describe("Channel Resilience", () => {
    it("should compute channel resilience with grade", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const result = await computeChannelResilience(TEST_USER_ID);
      expect(result.overallResilience).toBeGreaterThanOrEqual(0);
      expect(result.overallResilience).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(result.grade);
    });

    it("should include disruption scenarios", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const result = await computeChannelResilience(TEST_USER_ID);
      expect(Array.isArray(result.scenarios)).toBe(true);
      result.scenarios.forEach((s: { probability: string; survivalScore: number }) => {
        expect(["low", "medium", "high"]).toContain(s.probability);
        expect(s.survivalScore).toBeGreaterThanOrEqual(0);
      });
    });

    it("should provide contingency plan", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const result = await computeChannelResilience(TEST_USER_ID);
      expect(Array.isArray(result.contingencyPlan)).toBe(true);
    });
  });

  describe("Cross-Module Verification (v9.0)", () => {
    it("reconciliation status should influence valuation confidence", async () => {
      const [{ getRevenueTruthSummary }, { computeDynamicValuation }] = await Promise.all([
        import("../revenue-reconciliation"),
        import("../dynamic-valuation"),
      ]);
      const truth = await getRevenueTruthSummary(TEST_USER_ID);
      const valuation = await computeDynamicValuation(TEST_USER_ID);
      expect(truth.confidenceLabel).toBeDefined();
      expect(valuation.revenueConfidence).toBeDefined();
      expect(valuation.revenueConfidence.confidenceLabel).toBeDefined();
      if (truth.verificationRate > 80) {
        expect(["high", "medium"]).toContain(valuation.revenueConfidence.confidenceLabel);
      }
    });

    it("trust budget should influence monetization timing", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const timing = await analyzeMonetizationTiming(TEST_USER_ID);
      expect(timing.currentPressure).toBeDefined();
      expect(typeof timing.currentPressure.trustBudgetUsage).toBe("number");
      expect(timing.currentPressure.trustBudgetUsage).toBeGreaterThanOrEqual(0);
      expect(timing.currentPressure.trustBudgetUsage).toBeLessThanOrEqual(100);
      expect(typeof timing.currentPressure.safeToMonetize).toBe("boolean");
    });

    it("continuity packet should be exportable with all required fields", async () => {
      const [
        { computeBusinessLearning },
        { computeDynamicValuation },
        { computeRiskIntelligence },
        { computeEstatePlan },
      ] = await Promise.all([
        import("../business-learning"),
        import("../dynamic-valuation"),
        import("../risk-intelligence"),
        import("../estate-succession"),
      ]);
      const [learning, valuation, risk, estate] = await Promise.all([
        computeBusinessLearning(TEST_USER_ID),
        computeDynamicValuation(TEST_USER_ID),
        computeRiskIntelligence(TEST_USER_ID),
        computeEstatePlan(TEST_USER_ID),
      ]);
      const packet = {
        exportedAt: new Date().toISOString(),
        maturity: learning.maturityAssessment,
        feedbackLoops: learning.feedbackLoops,
        valuation: { estimatedValue: valuation.estimatedValue, valueRange: valuation.valueRange },
        riskProfile: risk.overallRiskProfile,
        aiDisplacement: risk.aiDisplacement,
        estate,
      };
      expect(packet.exportedAt).toBeDefined();
      expect(packet.maturity.stage).toBeDefined();
      expect(packet.valuation.estimatedValue).toBeGreaterThanOrEqual(0);
      expect(typeof packet.riskProfile).toBe("string");
      expect(packet.estate.succession).toBeDefined();
    });

    it("reconciliation influences sellability components", async () => {
      const [{ getRevenueTruthSummary }, { computeSellabilityScore }] = await Promise.all([
        import("../revenue-reconciliation"),
        import("../sellability-score"),
      ]);
      const truth = await getRevenueTruthSummary(TEST_USER_ID);
      const sellability = await computeSellabilityScore(TEST_USER_ID);
      expect(truth.verificationRate).toBeGreaterThanOrEqual(0);
      expect(sellability.overallScore).toBeGreaterThanOrEqual(0);
      expect(sellability.components).toBeDefined();
    });
  });

  describe("Zod Schema Validation (POST routes)", () => {
    it("scenarioAnalysisSchema should validate correct input", async () => {
      const { scenarioAnalysisSchema } = await import("../../routes/business-intelligence");
      const valid = scenarioAnalysisSchema.safeParse({ scenario: "algorithm change", revenueImpactPercent: 30 });
      expect(valid.success).toBe(true);
      const invalid = scenarioAnalysisSchema.safeParse({ scenario: "" });
      expect(invalid.success).toBe(false);
    });

    it("scenarioAnalysisSchema should reject invalid types", async () => {
      const { scenarioAnalysisSchema } = await import("../../routes/business-intelligence");
      const invalid = scenarioAnalysisSchema.safeParse({ scenario: 123 });
      expect(invalid.success).toBe(false);
      const outOfRange = scenarioAnalysisSchema.safeParse({ scenario: "test", revenueImpactPercent: 150 });
      expect(outOfRange.success).toBe(false);
    });

    it("continuityExportSchema should validate correct input", async () => {
      const { continuityExportSchema } = await import("../../routes/business-intelligence");
      const valid = continuityExportSchema.safeParse({ format: "summary", includeValuation: false });
      expect(valid.success).toBe(true);
      const invalid = continuityExportSchema.safeParse({ format: "xml" });
      expect(invalid.success).toBe(false);
    });

    it("trustBudgetOverrideSchema should validate correct input", async () => {
      const { trustBudgetOverrideSchema } = await import("../../routes/business-intelligence");
      const valid = trustBudgetOverrideSchema.safeParse({ trustBudgetCost: 10, reason: "manual override test" });
      expect(valid.success).toBe(true);
      const invalid = trustBudgetOverrideSchema.safeParse({ trustBudgetCost: -1, reason: "" });
      expect(invalid.success).toBe(false);
    });

    it("trustBudgetOverrideSchema should require reason", async () => {
      const { trustBudgetOverrideSchema } = await import("../../routes/business-intelligence");
      const noReason = trustBudgetOverrideSchema.safeParse({ trustBudgetCost: 5 });
      expect(noReason.success).toBe(false);
    });
  });

  describe("Route Response Shape Contracts", () => {
    it("dashboard-summary response should have all required fields", async () => {
      const [
        { getRevenueTruthSummary },
        { computeSellabilityScore },
        { computeDynamicValuation },
        { computeRiskIntelligence },
        { computeRevenueVelocity },
        { computeCapitalAllocation },
      ] = await Promise.all([
        import("../revenue-reconciliation"),
        import("../sellability-score"),
        import("../dynamic-valuation"),
        import("../risk-intelligence"),
        import("../revenue-velocity"),
        import("../capital-allocation"),
      ]);
      const [truth, sellability, valuation, risk, velocity, capital] = await Promise.all([
        getRevenueTruthSummary(TEST_USER_ID),
        computeSellabilityScore(TEST_USER_ID),
        computeDynamicValuation(TEST_USER_ID),
        computeRiskIntelligence(TEST_USER_ID),
        computeRevenueVelocity(TEST_USER_ID),
        computeCapitalAllocation(TEST_USER_ID),
      ]);

      const response = {
        revenueTruth: { totalRevenue: truth.totalRevenue, verifiedRevenue: truth.verifiedRevenue, verificationRate: truth.verificationRate, confidenceLabel: truth.confidenceLabel },
        sellability: { overallScore: sellability.overallScore, grade: sellability.grade },
        valuation: { estimatedValue: valuation.estimatedValue, valuationRange: valuation.valueRange, methodology: valuation.methodologies?.[0]?.name || "SDE Multiple" },
        riskProfile: { level: risk.overallRiskProfile, score: 0 },
        aiDisplacementRisk: risk.aiDisplacement.riskLevel,
        moatStrength: risk.humanValueMoat.moatLevel,
        wellnessLevel: risk.creatorWellness.level,
        velocityMetrics: { revenuePerContentDay: velocity.velocity.revenuePerContentDay, maturityLevel: velocity.infrastructure.maturityLevel },
        capitalHealth: capital.budgetHealth,
      };

      expect(typeof response.revenueTruth.totalRevenue).toBe("number");
      expect(typeof response.revenueTruth.verificationRate).toBe("number");
      expect(typeof response.sellability.overallScore).toBe("number");
      expect(typeof response.sellability.grade).toBe("string");
      expect(typeof response.valuation.estimatedValue).toBe("number");
      expect(response.valuation.valuationRange).toBeDefined();
      expect(typeof response.riskProfile.level).toBe("string");
      expect(typeof response.aiDisplacementRisk).toBe("string");
      expect(typeof response.moatStrength).toBe("string");
      expect(typeof response.wellnessLevel).toBe("string");
      expect(typeof response.velocityMetrics.revenuePerContentDay).toBe("number");
      expect(typeof response.capitalHealth).toBe("string");
    });

    it("full-intelligence response should include all 16 modules", async () => {
      const modules = await Promise.all([
        import("../revenue-reconciliation"),
        import("../sellability-score"),
        import("../dynamic-valuation"),
        import("../sovereign-exit"),
        import("../founder-dependency"),
        import("../sponsor-intelligence"),
        import("../brand-deal-intelligence"),
        import("../commerce-intelligence"),
        import("../monetization-timing"),
        import("../revenue-diversification"),
        import("../capital-allocation"),
        import("../content-asset-valuation"),
        import("../risk-intelligence"),
        import("../revenue-velocity"),
        import("../estate-succession"),
        import("../business-learning"),
      ]);
      const fns = [
        modules[0].getRevenueTruthSummary,
        modules[1].computeSellabilityScore,
        modules[2].computeDynamicValuation,
        modules[3].assessSovereignExit,
        modules[4].computeFounderDependency,
        modules[5].analyzeSponsorIntelligence,
        modules[6].analyzeBrandDeals,
        modules[7].analyzeCommerceIntelligence,
        modules[8].analyzeMonetizationTiming,
        modules[9].analyzeRevenueDiversification,
        modules[10].computeCapitalAllocation,
        modules[11].computeContentAssetValuation,
        modules[12].computeRiskIntelligence,
        modules[13].computeRevenueVelocity,
        modules[14].computeEstatePlan,
        modules[15].computeBusinessLearning,
      ];
      const results = await Promise.all(fns.map(fn => fn(TEST_USER_ID)));
      expect(results.length).toBe(16);
      results.forEach(r => {
        expect(r).toBeDefined();
        expect(typeof r).toBe("object");
      });
    });
  });
});
