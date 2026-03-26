import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-buyer-readiness";

const mockRecords = [
  {
    id: 1, userId: TEST_USER_ID, platform: "youtube", source: "Ad Revenue",
    amount: 500.00, currency: "USD", period: "2025-03", syncSource: "auto",
    externalId: "yt-ad-001", reconciliationStatus: "verified",
    reconciliationGapAmount: null, reconciliationSource: "auto",
    reconciliationVerifiedAt: new Date("2025-03-20"), reconciliationNotes: null,
    recordedAt: new Date("2025-03-15"), createdAt: new Date("2025-03-15"),
    metadata: {},
  },
  {
    id: 2, userId: TEST_USER_ID, platform: "twitch", source: "Subscriptions",
    amount: 200.00, currency: "USD", period: "2025-03", syncSource: "auto",
    externalId: "twitch-sub-001", reconciliationStatus: "verified",
    reconciliationGapAmount: null, reconciliationSource: "auto",
    reconciliationVerifiedAt: new Date("2025-03-18"), reconciliationNotes: null,
    recordedAt: new Date("2025-03-10"), createdAt: new Date("2025-03-10"),
    metadata: {},
  },
  {
    id: 3, userId: TEST_USER_ID, platform: "youtube", source: "Sponsorship",
    amount: 1000.00, currency: "USD", period: "2025-03", syncSource: "manual",
    externalId: null, reconciliationStatus: "estimated",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-05"), createdAt: new Date("2025-03-05"),
    metadata: { sponsorName: "GameBrand" },
  },
  {
    id: 4, userId: TEST_USER_ID, platform: "kick", source: "Subscriptions (95/5 split)",
    amount: 50.00, currency: "USD", period: "2025-02", syncSource: "auto-estimated",
    externalId: null, reconciliationStatus: "estimated",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-02-15"), createdAt: new Date("2025-02-15"),
    metadata: {},
  },
  {
    id: 5, userId: TEST_USER_ID, platform: "youtube", source: "Merchandise",
    amount: 150.00, currency: "USD", period: "2025-01", syncSource: "manual",
    externalId: null, reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-01-20"), createdAt: new Date("2025-01-20"),
    metadata: {},
  },
];

const mockChannels = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", channelName: "GameMaster", channelId: "UC001", subscriberCount: 25000, viewCount: 2000000, videoCount: 150, createdAt: new Date("2023-01-01") },
  { id: 2, userId: TEST_USER_ID, platform: "twitch", channelName: "GameMasterLive", channelId: "twitch001", subscriberCount: 5000, viewCount: 500000, videoCount: 0, createdAt: new Date("2023-06-01") },
  { id: 3, userId: TEST_USER_ID, platform: "kick", channelName: "GameMasterKick", channelId: "kick001", subscriberCount: 1000, viewCount: 100000, videoCount: 0, createdAt: new Date("2024-01-01") },
];

const mockVideos = [
  ...Array.from({ length: 50 }, (_, i) => ({
    id: i + 1, channelId: 1, title: `Video ${i + 1}`, type: "video", status: "published",
    platform: "youtube", createdAt: new Date(`2025-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, "0")}`),
    metadata: { viewCount: 10000 + i * 500 },
  })),
];

const mockStreams = [
  ...Array.from({ length: 15 }, (_, i) => ({
    id: i + 1, userId: TEST_USER_ID, title: `Stream ${i + 1}`, status: "ended",
    createdAt: new Date(`2025-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, "0")}`),
  })),
];

function makeChain(data: unknown[]): any {
  const chain: any = {};
  const self = () => chain;
  chain.where = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockImplementation((lim: number) => makeChain(data.slice(0, lim)));
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.then = (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
    return Promise.resolve(data).then(resolve, reject);
  };
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(data).catch(reject);
  return chain;
}

vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        if (table.reconciliationStatus === "reconciliation_status") return makeChain(mockRecords);
        if (table.channelId === "channel_id" && table.subscriberCount === "subscriber_count") return makeChain(mockChannels);
        if (table.channelId === "channel_id") return makeChain(mockVideos);
        if (table.userId === "user_id" && table.title === "title") return makeChain(mockStreams);
        return makeChain([]);
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue(makeChain([{ id: 1 }])),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 100 }]),
      }),
    }),
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
    videoCount: "video_count", createdAt: "created_at",
  },
  videos: {
    channelId: "channel_id", id: "id", title: "title", type: "type",
    status: "status", platform: "platform", createdAt: "created_at", metadata: "metadata",
  },
  streams: {
    userId: "user_id", id: "id", title: "title", status: "status", createdAt: "created_at",
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 5: Buyer Readiness + Valuation Intelligence", () => {
  describe("Sellability Score Engine", () => {
    it("computes sellability score with all required components", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const score = await computeSellabilityScore(TEST_USER_ID);

      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(score.grade);
      expect(score.components).toHaveProperty("revenueStability");
      expect(score.components).toHaveProperty("revenueDiversification");
      expect(score.components).toHaveProperty("platformIndependence");
      expect(score.components).toHaveProperty("contentLibraryValue");
      expect(score.components).toHaveProperty("audienceLoyalty");
      expect(score.components).toHaveProperty("operationalMaturity");
      expect(score.components).toHaveProperty("revenueVerification");
    });

    it("labels revenue confidence from reconciliation status", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const score = await computeSellabilityScore(TEST_USER_ID);

      expect(score.revenueConfidence).toBeDefined();
      expect(["high", "medium", "low", "unverified"]).toContain(score.revenueConfidence.label);
      expect(score.revenueConfidence.verifiedPercent + score.revenueConfidence.estimatedPercent).toBe(100);
    });

    it("generates strengths, weaknesses, and recommendations", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const score = await computeSellabilityScore(TEST_USER_ID);

      expect(Array.isArray(score.strengths)).toBe(true);
      expect(Array.isArray(score.weaknesses)).toBe(true);
      expect(Array.isArray(score.recommendations)).toBe(true);
    });

    it("component scores are all between 0 and 100", async () => {
      const { computeSellabilityScore } = await import("../sellability-score");
      const score = await computeSellabilityScore(TEST_USER_ID);

      for (const [, value] of Object.entries(score.components)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Dynamic Valuation Engine", () => {
    it("produces valuation with multiple methodologies", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const val = await computeDynamicValuation(TEST_USER_ID);

      expect(val.estimatedValue).toBeGreaterThanOrEqual(0);
      expect(val.valueRange.low).toBeLessThanOrEqual(val.valueRange.high);
      expect(val.methodologies.length).toBeGreaterThanOrEqual(3);

      const methods = val.methodologies.map(m => m.method);
      expect(methods).toContain("Revenue Multiple");
      expect(methods).toContain("Content Asset Valuation");
      expect(methods).toContain("Audience Valuation");
    });

    it("labels revenue confidence and applies uncertainty discount", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const val = await computeDynamicValuation(TEST_USER_ID);

      expect(val.revenueConfidence).toBeDefined();
      expect(["high", "medium", "low", "unverified"]).toContain(val.revenueConfidence.confidenceLabel);
      expect(val.revenueConfidence.uncertaintyDiscount).toBeGreaterThanOrEqual(0);
      expect(val.revenueConfidence.uncertaintyDiscount).toBeLessThanOrEqual(0.5);
    });

    it("each methodology includes revenue confidence note", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const val = await computeDynamicValuation(TEST_USER_ID);

      for (const m of val.methodologies) {
        expect(m.revenueConfidenceNote).toBeDefined();
        expect(typeof m.revenueConfidenceNote).toBe("string");
        expect(m.revenueConfidenceNote.length).toBeGreaterThan(0);
      }
    });

    it("computes content and audience values independently", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const val = await computeDynamicValuation(TEST_USER_ID);

      expect(val.contentAssetValue).toBeGreaterThan(0);
      expect(val.audienceValue).toBeGreaterThan(0);
    });

    it("provides growth rate and annualized revenue", async () => {
      const { computeDynamicValuation } = await import("../dynamic-valuation");
      const val = await computeDynamicValuation(TEST_USER_ID);

      expect(typeof val.growthRate).toBe("number");
      expect(typeof val.annualizedRevenue).toBe("number");
      expect(typeof val.monthlyRecurringRevenue).toBe("number");
      expect(val.valuationDate).toMatch(/^\d{4}-\d{2}/);
    });
  });

  describe("Sovereign Exit + Continuity Packet", () => {
    it("assesses sovereign exit readiness with portability scores", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const exit = await assessSovereignExit(TEST_USER_ID);

      expect(exit.overallReadiness).toBeGreaterThanOrEqual(0);
      expect(exit.overallReadiness).toBeLessThanOrEqual(100);
      expect(Array.isArray(exit.portabilityScores)).toBe(true);
      expect(exit.portabilityScores.length).toBeGreaterThan(0);
      expect(Array.isArray(exit.vendorDependencies)).toBe(true);
      expect(typeof exit.exitTimeline).toBe("string");
    });

    it("portability scores include platform-specific details", async () => {
      const { assessSovereignExit } = await import("../sovereign-exit");
      const exit = await assessSovereignExit(TEST_USER_ID);

      for (const p of exit.portabilityScores) {
        expect(p.platform).toBeDefined();
        expect(typeof p.dataExportReady).toBe("boolean");
        expect(typeof p.contentPortable).toBe("boolean");
        expect(typeof p.audiencePortable).toBe("boolean");
        expect(typeof p.revenuePortable).toBe("boolean");
        expect(p.readinessScore).toBeGreaterThanOrEqual(0);
        expect(p.readinessScore).toBeLessThanOrEqual(100);
      }
    });

    it("generates v9.0 continuity operations packet", async () => {
      const { generateContinuityPacket } = await import("../sovereign-exit");
      const packet = await generateContinuityPacket(TEST_USER_ID);

      expect(packet.version).toBe("9.0");
      expect(packet.generatedAt).toBeDefined();
      expect(packet.sections.businessOverview).toBeDefined();
      expect(packet.sections.revenueOperations).toBeDefined();
      expect(packet.sections.contentLibrary).toBeDefined();
      expect(packet.sections.platformAccess).toBeDefined();
      expect(packet.sections.operationalPlaybook).toBeDefined();
      expect(packet.sections.riskFactors).toBeDefined();
    });

    it("continuity packet labels revenue confidence", async () => {
      const { generateContinuityPacket } = await import("../sovereign-exit");
      const packet = await generateContinuityPacket(TEST_USER_ID);

      expect(packet.sections.businessOverview.revenueConfidenceNote).toBeDefined();
      expect(typeof packet.sections.businessOverview.verifiedRevenue).toBe("number");
    });

    it("generates living prospectus with revenue confidence warning", async () => {
      const { generateLivingProspectus } = await import("../sovereign-exit");
      const prospectus = await generateLivingProspectus(TEST_USER_ID);

      expect(prospectus.title).toBeDefined();
      expect(prospectus.executiveSummary).toBeDefined();
      expect(prospectus.keyMetrics).toBeDefined();
      expect(typeof prospectus.keyMetrics.totalRevenue).toBe("number");
      expect(typeof prospectus.keyMetrics.verifiedRevenue).toBe("number");
      expect(prospectus.assetInventory.length).toBeGreaterThan(0);
      expect(prospectus.investmentHighlights.length).toBeGreaterThan(0);
      expect(prospectus.risks.length).toBeGreaterThan(0);
    });
  });

  describe("Founder Dependency + Channel Resilience", () => {
    it("computes founder dependency score with risk factors", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const dep = await computeFounderDependency(TEST_USER_ID);

      expect(dep.overallScore).toBeGreaterThanOrEqual(0);
      expect(dep.overallScore).toBeLessThanOrEqual(100);
      expect(["low", "medium", "high", "critical"]).toContain(dep.riskLevel);
      expect(dep.factors.contentCreation).toBeGreaterThanOrEqual(0);
      expect(dep.factors.revenueGeneration).toBeGreaterThanOrEqual(0);
      expect(dep.factors.audienceRelationship).toBeGreaterThanOrEqual(0);
      expect(dep.factors.operationalControl).toBeGreaterThanOrEqual(0);
      expect(dep.factors.brandIdentity).toBeGreaterThanOrEqual(0);
    });

    it("provides mitigations and delegation opportunities", async () => {
      const { computeFounderDependency } = await import("../founder-dependency");
      const dep = await computeFounderDependency(TEST_USER_ID);

      expect(Array.isArray(dep.mitigations)).toBe(true);
      expect(dep.mitigations.length).toBeGreaterThan(0);
      expect(Array.isArray(dep.delegationOpportunities)).toBe(true);
      expect(dep.delegationOpportunities.length).toBeGreaterThan(0);
    });

    it("computes channel resilience with disruption scenarios", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const res = await computeChannelResilience(TEST_USER_ID);

      expect(res.overallResilience).toBeGreaterThanOrEqual(0);
      expect(res.overallResilience).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(res.grade);
      expect(res.scenarios.length).toBeGreaterThanOrEqual(4);
    });

    it("disruption scenarios include required fields", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const res = await computeChannelResilience(TEST_USER_ID);

      for (const sc of res.scenarios) {
        expect(sc.scenario).toBeDefined();
        expect(["low", "medium", "high"]).toContain(sc.probability);
        expect(sc.revenueImpact).toBeGreaterThanOrEqual(0);
        expect(sc.revenueImpact).toBeLessThanOrEqual(100);
        expect(sc.recoveryTime).toBeDefined();
        expect(sc.survivalScore).toBeGreaterThanOrEqual(0);
        expect(sc.mitigations.length).toBeGreaterThan(0);
      }
    });

    it("channel resilience produces strengths and vulnerabilities", async () => {
      const { computeChannelResilience } = await import("../founder-dependency");
      const res = await computeChannelResilience(TEST_USER_ID);

      expect(Array.isArray(res.strengths)).toBe(true);
      expect(Array.isArray(res.vulnerabilities)).toBe(true);
      expect(Array.isArray(res.contingencyPlan)).toBe(true);
      expect(res.contingencyPlan.length).toBeGreaterThan(0);
    });
  });
});
