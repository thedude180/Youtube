import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-sponsor-commerce";

const mockRecords = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", source: "Ad Revenue", amount: 500, currency: "USD", period: "2025-03", syncSource: "auto", externalId: "yt-001", reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: "auto", reconciliationVerifiedAt: new Date("2025-03-20"), reconciliationNotes: null, recordedAt: new Date("2025-03-15"), createdAt: new Date("2025-03-15"), metadata: {} },
  { id: 2, userId: TEST_USER_ID, platform: "youtube", source: "Sponsorship - GameBrand", amount: 1000, currency: "USD", period: "2025-03", syncSource: "manual", externalId: null, reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: new Date("2025-03-18"), reconciliationNotes: null, recordedAt: new Date("2025-03-10"), createdAt: new Date("2025-03-10"), metadata: {} },
  { id: 3, userId: TEST_USER_ID, platform: "twitch", source: "Subscriptions", amount: 200, currency: "USD", period: "2025-03", syncSource: "auto", externalId: "twitch-001", reconciliationStatus: "estimated", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-03-05"), createdAt: new Date("2025-03-05"), metadata: {} },
  { id: 4, userId: TEST_USER_ID, platform: "youtube", source: "Affiliate Commission", amount: 150, currency: "USD", period: "2025-02", syncSource: "manual", externalId: null, reconciliationStatus: "unverified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-02-15"), createdAt: new Date("2025-02-15"), metadata: {} },
  { id: 5, userId: TEST_USER_ID, platform: "youtube", source: "Merchandise", amount: 300, currency: "USD", period: "2025-01", syncSource: "manual", externalId: null, reconciliationStatus: "verified", reconciliationGapAmount: null, reconciliationSource: null, reconciliationVerifiedAt: null, reconciliationNotes: null, recordedAt: new Date("2025-01-20"), createdAt: new Date("2025-01-20"), metadata: {} },
];

const mockChannels = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", channelName: "GameMaster", channelId: "UC001", subscriberCount: 25000, viewCount: 2000000, videoCount: 150, contentNiche: "gaming", createdAt: new Date("2023-01-01") },
  { id: 2, userId: TEST_USER_ID, platform: "twitch", channelName: "GameMasterLive", channelId: "twitch001", subscriberCount: 5000, viewCount: 500000, videoCount: 0, contentNiche: "gaming", createdAt: new Date("2023-06-01") },
];

const mockVideos = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1, channelId: 1, title: `Video ${i + 1}`, type: "video", status: "published",
  platform: "youtube", createdAt: new Date(`2025-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, "0")}`),
  metadata: { viewCount: 10000 + i * 500, stats: { views: 10000 + i * 500, likes: 500 + i * 20 }, brandKeywords: i % 10 === 0 ? ["GameBrand"] : undefined },
}));

const mockDeals = [
  { id: 1, userId: TEST_USER_ID, brandName: "GameBrand", dealValue: 1500, status: "completed", deliverables: ["1 dedicated video"], notes: "", createdAt: new Date("2025-01-01") },
  { id: 2, userId: TEST_USER_ID, brandName: "EnergyDrink Co", dealValue: 800, status: "active", deliverables: ["2 mentions"], notes: "", createdAt: new Date("2025-02-01") },
  { id: 3, userId: TEST_USER_ID, brandName: "GearShop", dealValue: 500, status: "prospect", deliverables: [], notes: "", createdAt: new Date("2025-03-01") },
  { id: 4, userId: TEST_USER_ID, brandName: "GameBrand", dealValue: 2000, status: "renewed", deliverables: ["3 videos"], notes: "", createdAt: new Date("2025-03-10") },
];

const mockDistEvents = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, userId: TEST_USER_ID, platform: "youtube", contentId: `v-${i}`,
  eventType: "publish_video", status: i % 5 === 0 ? "blocked" : "approved",
  trustBudgetCost: 10, createdAt: new Date(`2025-03-${String((i % 28) + 1).padStart(2, "0")}`),
}));

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
        if (table.brandName === "brand_name") return makeChain(mockDeals);
        if (table.trustBudgetCost === "trust_budget_cost") return makeChain(mockDistEvents);
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
  },
  streams: {
    userId: "user_id", id: "id", title: "title", status: "status", createdAt: "created_at",
  },
  sponsorshipDeals: {
    userId: "user_id", id: "id", brandName: "brand_name", dealValue: "deal_value",
    status: "status", deliverables: "deliverables", notes: "notes", createdAt: "created_at",
  },
  distributionEvents: {
    userId: "user_id", id: "id", platform: "platform", contentId: "content_id",
    eventType: "event_type", status: "status", trustBudgetCost: "trust_budget_cost",
    createdAt: "created_at",
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 5: Sponsorship + Commerce Intelligence", () => {
  describe("Sponsor Intelligence Engine", () => {
    it("analyzes sponsor fit with category scores", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const intel = await analyzeSponsorIntelligence(TEST_USER_ID);

      expect(intel.sponsorFitScores.length).toBeGreaterThan(0);
      for (const fit of intel.sponsorFitScores) {
        expect(fit.category).toBeDefined();
        expect(fit.fitScore.overallFit).toBeGreaterThanOrEqual(0);
        expect(fit.fitScore.overallFit).toBeLessThanOrEqual(100);
        expect(fit.fitScore.brandSafety).toBeGreaterThanOrEqual(0);
        expect(fit.estimatedDealRange.low).toBeLessThanOrEqual(fit.estimatedDealRange.high);
      }
    });

    it("provides market rates (CPM, flat rate, CPV)", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const intel = await analyzeSponsorIntelligence(TEST_USER_ID);

      expect(intel.marketRates.cpm.estimated).toBeGreaterThan(0);
      expect(intel.marketRates.cpm.marketAvg).toBe(25);
      expect(typeof intel.marketRates.cpm.premium).toBe("boolean");
      expect(intel.marketRates.flatRate.estimated).toBeGreaterThanOrEqual(0);
      expect(intel.marketRates.performanceBased.estimatedCpv).toBeGreaterThan(0);
    });

    it("includes audience profile and pipeline forecast", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const intel = await analyzeSponsorIntelligence(TEST_USER_ID);

      expect(intel.audienceProfile.totalSubscribers).toBe(30000);
      expect(intel.audienceProfile.platformBreakdown.length).toBe(2);
      expect(intel.pipelineForecast.estimatedQuarterlyValue).toBeGreaterThanOrEqual(0);
      expect(["high", "medium", "low"]).toContain(intel.pipelineForecast.confidence);
    });

    it("labels sponsorship revenue confidence", async () => {
      const { analyzeSponsorIntelligence } = await import("../sponsor-intelligence");
      const intel = await analyzeSponsorIntelligence(TEST_USER_ID);

      expect(["high", "medium", "low", "unverified"]).toContain(intel.revenueConfidence.confidenceLabel);
      expect(intel.revenueConfidence.sponsorshipRevenue).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Brand Deal Intelligence", () => {
    it("tracks deal performance with lifecycle stages", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const deals = await analyzeBrandDeals(TEST_USER_ID);

      expect(deals.dealPerformance.length).toBeGreaterThan(0);
      for (const d of deals.dealPerformance) {
        expect(d.performanceScore).toBeGreaterThanOrEqual(0);
        expect(d.performanceScore).toBeLessThanOrEqual(100);
        expect(["above", "at", "below"]).toContain(d.marketRateComparison);
      }
      expect(deals.lifecycleOverview.length).toBeGreaterThan(0);
    });

    it("provides pipeline health metrics", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const deals = await analyzeBrandDeals(TEST_USER_ID);

      expect(typeof deals.pipelineHealth.activeDeals).toBe("number");
      expect(typeof deals.pipelineHealth.pendingDeals).toBe("number");
      expect(typeof deals.pipelineHealth.totalPipelineValue).toBe("number");
      expect(deals.totalDealValue).toBeGreaterThan(0);
      expect(deals.avgDealValue).toBeGreaterThan(0);
    });

    it("calculates renewal rate and top brands", async () => {
      const { analyzeBrandDeals } = await import("../brand-deal-intelligence");
      const deals = await analyzeBrandDeals(TEST_USER_ID);

      expect(typeof deals.renewalRate).toBe("number");
      expect(typeof deals.completionRate).toBe("number");
      expect(deals.topBrands.length).toBeGreaterThan(0);
      expect(deals.topBrands[0].brand).toBeDefined();
    });
  });

  describe("Commerce Intelligence", () => {
    it("identifies social commerce opportunities per platform", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const commerce = await analyzeCommerceIntelligence(TEST_USER_ID);

      expect(commerce.socialCommerceOpportunities.length).toBeGreaterThan(0);
      for (const opp of commerce.socialCommerceOpportunities) {
        expect(opp.platform).toBeDefined();
        expect(["native", "link-based", "none"]).toContain(opp.checkoutCapability);
        expect(["ready", "setup-needed", "not-available"]).toContain(opp.readiness);
        expect(opp.setupSteps.length).toBeGreaterThan(0);
      }
    });

    it("provides offer operating system with active and recommended offers", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const commerce = await analyzeCommerceIntelligence(TEST_USER_ID);

      expect(Array.isArray(commerce.offerOperatingSystem.activeOffers)).toBe(true);
      expect(commerce.offerOperatingSystem.recommendedOffers.length).toBeGreaterThan(0);
      for (const offer of commerce.offerOperatingSystem.recommendedOffers) {
        expect(offer.offerType).toBeDefined();
        expect(offer.suitability).toBeGreaterThanOrEqual(0);
        expect(["low", "medium", "high"]).toContain(offer.implementationEffort);
      }
    });

    it("labels commerce revenue confidence", async () => {
      const { analyzeCommerceIntelligence } = await import("../commerce-intelligence");
      const commerce = await analyzeCommerceIntelligence(TEST_USER_ID);

      expect(["high", "medium", "low", "unverified"]).toContain(commerce.revenueConfidence.confidenceLabel);
      expect(typeof commerce.commerceMetrics.totalCommerceRevenue).toBe("number");
      expect(typeof commerce.nativeCheckoutReadiness).toBe("number");
    });
  });

  describe("Monetization Timing + Benchmarks", () => {
    it("analyzes monetization pressure with trust budget integration", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const timing = await analyzeMonetizationTiming(TEST_USER_ID);

      expect(timing.currentPressure.overallPressure).toBeGreaterThanOrEqual(0);
      expect(timing.currentPressure.overallPressure).toBeLessThanOrEqual(100);
      expect(["low", "moderate", "high", "critical"]).toContain(timing.currentPressure.pressureLevel);
      expect(typeof timing.currentPressure.safeToMonetize).toBe("boolean");
      expect(typeof timing.currentPressure.trustBudgetUsage).toBe("number");
    });

    it("provides benchmarks comparing against similar channels", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const timing = await analyzeMonetizationTiming(TEST_USER_ID);

      expect(timing.benchmarks.length).toBeGreaterThanOrEqual(3);
      for (const b of timing.benchmarks) {
        expect(b.metric).toBeDefined();
        expect(typeof b.yourValue).toBe("number");
        expect(typeof b.benchmarkValue).toBe("number");
        expect(["above", "at", "below"]).toContain(b.status);
        expect(b.recommendation).toBeDefined();
      }
    });

    it("provides optimal timing windows and fatigue signals", async () => {
      const { analyzeMonetizationTiming } = await import("../monetization-timing");
      const timing = await analyzeMonetizationTiming(TEST_USER_ID);

      expect(timing.optimalTimingWindows.length).toBeGreaterThan(0);
      expect(Array.isArray(timing.currentPressure.audienceFatigue.signals)).toBe(true);
      expect(typeof timing.recommendedMonthlyLimit).toBe("number");
    });
  });

  describe("Revenue Diversification + Income Acceleration", () => {
    it("computes diversification score with concentration risk", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const div = await analyzeRevenueDiversification(TEST_USER_ID);

      expect(div.currentDiversification.score).toBeGreaterThanOrEqual(0);
      expect(div.currentDiversification.score).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(div.currentDiversification.grade);
      expect(["low", "medium", "high", "critical"]).toContain(div.currentDiversification.concentrationRisk);
      expect(div.currentDiversification.herfindahlIndex).toBeGreaterThan(0);
      expect(div.currentDiversification.revenueStreams.length).toBeGreaterThan(0);
    });

    it("generates diversification roadmap with priorities", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const div = await analyzeRevenueDiversification(TEST_USER_ID);

      expect(div.roadmap.length).toBeGreaterThan(0);
      for (const item of div.roadmap) {
        expect(item.stream).toBeDefined();
        expect(typeof item.potentialRevenue).toBe("number");
        expect(["low", "medium", "high"]).toContain(item.implementationEffort);
        expect(item.steps.length).toBeGreaterThan(0);
        expect(typeof item.priority).toBe("number");
      }
    });

    it("identifies income acceleration actions sorted by ROI", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const div = await analyzeRevenueDiversification(TEST_USER_ID);

      expect(div.incomeAccelerationActions.length).toBeGreaterThan(0);
      for (const action of div.incomeAccelerationActions) {
        expect(action.action).toBeDefined();
        expect(["optimize", "expand", "launch", "scale"]).toContain(action.category);
        expect(typeof action.estimatedImpact).toBe("number");
        expect(typeof action.roi).toBe("number");
        expect(["easy", "moderate", "hard"]).toContain(action.difficulty);
      }

      for (let i = 1; i < div.incomeAccelerationActions.length; i++) {
        expect(div.incomeAccelerationActions[i - 1].roi).toBeGreaterThanOrEqual(div.incomeAccelerationActions[i].roi);
      }
    });

    it("labels revenue confidence from reconciliation", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const div = await analyzeRevenueDiversification(TEST_USER_ID);

      expect(["high", "medium", "low", "unverified"]).toContain(div.revenueConfidence.confidenceLabel);
      expect(div.revenueConfidence.totalRevenue).toBeGreaterThan(0);
      expect(div.revenueConfidence.verifiedPercent).toBeGreaterThanOrEqual(0);
      expect(div.revenueConfidence.note).toBeDefined();
    });

    it("projects diversified revenue and improved score", async () => {
      const { analyzeRevenueDiversification } = await import("../revenue-diversification");
      const div = await analyzeRevenueDiversification(TEST_USER_ID);

      expect(div.projectedDiversifiedRevenue).toBeGreaterThanOrEqual(div.revenueConfidence.totalRevenue);
      expect(div.projectedDiversificationScore).toBeGreaterThanOrEqual(div.currentDiversification.score);
    });
  });
});
