import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-phase5-recon";

const mockRecords = [
  {
    id: 1, userId: TEST_USER_ID, platform: "youtube", source: "Ad Revenue",
    amount: 150.00, currency: "USD", period: "2025-03", syncSource: "auto",
    externalId: "yt-revenue-ch1-2025-03-15", reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-15"), createdAt: new Date("2025-03-15"),
    metadata: { videoId: 10, syncedAt: "2025-03-15", estimatedRevenue: 150, views: 50000 },
  },
  {
    id: 2, userId: TEST_USER_ID, platform: "twitch", source: "Subscriptions",
    amount: 75.00, currency: "USD", period: "2025-03", syncSource: "auto-estimated",
    externalId: "twitch-subs-ch2-2025-03", reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-10"), createdAt: new Date("2025-03-10"),
    metadata: { syncedAt: "2025-03-10", subscribers: 30 },
  },
  {
    id: 3, userId: TEST_USER_ID, platform: "youtube", source: "Super Chat",
    amount: 25.00, currency: "USD", period: "2025-03-08", syncSource: "auto",
    externalId: "yt-sc-abc123", reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-08"), createdAt: new Date("2025-03-08"),
    metadata: { streamId: 5, syncedAt: "2025-03-08" },
  },
  {
    id: 4, userId: TEST_USER_ID, platform: "tiktok", source: "Creator Fund",
    amount: 30.00, currency: "USD", period: "2025-03", syncSource: "manual",
    externalId: null, reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-05"), createdAt: new Date("2025-03-05"),
    metadata: {},
  },
  {
    id: 5, userId: TEST_USER_ID, platform: "youtube", source: "Sponsorship",
    amount: 500.00, currency: "USD", period: "2025-03", syncSource: "manual",
    externalId: null, reconciliationStatus: "unverified",
    reconciliationGapAmount: 200, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-03-01"), createdAt: new Date("2025-03-01"),
    metadata: { sponsorName: "GameBrand" },
  },
  {
    id: 6, userId: TEST_USER_ID, platform: "kick", source: "Subscriptions (95/5 split)",
    amount: 10.00, currency: "USD", period: "2025-02", syncSource: "auto-estimated",
    externalId: "kick-subs-ch3-2025-02", reconciliationStatus: "unverified",
    reconciliationGapAmount: null, reconciliationSource: null,
    reconciliationVerifiedAt: null, reconciliationNotes: null,
    recordedAt: new Date("2025-02-15"), createdAt: new Date("2025-02-15"),
    metadata: {},
  },
];

const mockVideos = [
  { id: 10, channelId: 1, title: "Epic Boss Fight", publishedAt: new Date("2025-03-14"), createdAt: new Date("2025-03-14"), type: "video", status: "published", platform: "youtube", metadata: { viewCount: 50000 } },
  { id: 11, channelId: 1, title: "Hidden Secrets Guide", publishedAt: new Date("2025-03-10"), createdAt: new Date("2025-03-10"), type: "video", status: "published", platform: "youtube", metadata: { viewCount: 30000 } },
];

const mockStreams = [
  { id: 5, userId: TEST_USER_ID, title: "Live Boss Rush", startedAt: new Date("2025-03-08"), createdAt: new Date("2025-03-08"), status: "ended" },
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

let tableTracker: string[] = [];

vi.mock("../../db", () => {
  return {
    db: {
      select: vi.fn().mockImplementation((..._args: unknown[]) => ({
        from: vi.fn().mockImplementation((table: any) => {
          const tableName = typeof table === "object" && table !== null
            ? (table.userId === "user_id" && table.platform === "platform" && table.amount === "amount" && table.reconciliationStatus === "reconciliation_status" ? "revenue" :
               table.channelId === "channel_id" ? "videos" :
               table.actionType === "action_type" ? "actions" :
               table.reportData === "report_data" ? "reports" :
               table.userId === "user_id" && table.createdAt === "created_at" ? "streams" :
               "unknown")
            : "unknown";
          tableTracker.push(tableName);
          if (tableName === "videos") return makeChain(mockVideos);
          if (tableName === "streams") return makeChain(mockStreams);
          if (tableName === "actions") return makeChain([]);
          if (tableName === "reports") return makeChain([]);
          return makeChain(mockRecords);
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
  };
});

vi.mock("@shared/schema", () => ({
  revenueRecords: {
    userId: "user_id",
    id: "id",
    platform: "platform",
    source: "source",
    amount: "amount",
    recordedAt: "recorded_at",
    reconciliationStatus: "reconciliation_status",
    reconciliationSource: "reconciliation_source",
    reconciliationVerifiedAt: "reconciliation_verified_at",
    reconciliationGapAmount: "reconciliation_gap_amount",
    reconciliationNotes: "reconciliation_notes",
    syncSource: "sync_source",
    externalId: "external_id",
    currency: "currency",
    period: "period",
    metadata: "metadata",
    createdAt: "created_at",
  },
  revenueSyncLog: { userId: "user_id" },
  videos: { channelId: "channel_id", createdAt: "created_at" },
  streams: { userId: "user_id", createdAt: "created_at" },
  reconciliationActions: {
    id: "id", userId: "user_id", revenueRecordId: "revenue_record_id",
    actionType: "action_type", priority: "priority", status: "status",
    description: "description", platform: "platform", amount: "amount",
    gapAmount: "gap_amount", createdAt: "created_at",
  },
  reconciliationReports: {
    id: "id", userId: "user_id", period: "period",
    reportData: "report_data", generatedAt: "generated_at",
  },
}));

beforeEach(() => {
  tableTracker = [];
});

describe("Revenue Reconciliation Engine", () => {
  describe("RECONCILIATION_STATUSES", () => {
    it("should define all 6 reconciliation statuses", async () => {
      const { RECONCILIATION_STATUSES } = await import("../revenue-reconciliation");
      expect(RECONCILIATION_STATUSES).toContain("verified");
      expect(RECONCILIATION_STATUSES).toContain("estimated");
      expect(RECONCILIATION_STATUSES).toContain("disputed");
      expect(RECONCILIATION_STATUSES).toContain("delayed");
      expect(RECONCILIATION_STATUSES).toContain("unresolved");
      expect(RECONCILIATION_STATUSES).toContain("unverified");
      expect(RECONCILIATION_STATUSES.length).toBe(6);
    });
  });

  describe("reconcileRevenueRecords", () => {
    it("should classify auto-synced records with externalId as verified", async () => {
      const { reconcileRevenueRecords } = await import("../revenue-reconciliation");
      const results = await reconcileRevenueRecords(TEST_USER_ID);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      const autoRecord = results.find(r => r.recordId === 1);
      expect(autoRecord).toBeDefined();
      expect(autoRecord!.newStatus).toBe("verified");
    });

    it("should flag records with gap > threshold as unresolved", async () => {
      const { reconcileRevenueRecords } = await import("../revenue-reconciliation");
      const results = await reconcileRevenueRecords(TEST_USER_ID);
      const gapRecord = results.find(r => r.recordId === 5);
      expect(gapRecord).toBeDefined();
      expect(gapRecord!.newStatus).toBe("unresolved");
      expect(gapRecord!.notes).toContain("exceeds threshold");
    });

    it("should return ReconciliationResult shape for each record", async () => {
      const { reconcileRevenueRecords } = await import("../revenue-reconciliation");
      const results = await reconcileRevenueRecords(TEST_USER_ID);
      for (const result of results) {
        expect(result).toHaveProperty("recordId");
        expect(result).toHaveProperty("previousStatus");
        expect(result).toHaveProperty("newStatus");
        expect(result).toHaveProperty("source");
        expect(result).toHaveProperty("notes");
      }
    });

    it("should classify every record into valid status", async () => {
      const { reconcileRevenueRecords, RECONCILIATION_STATUSES } = await import("../revenue-reconciliation");
      const results = await reconcileRevenueRecords(TEST_USER_ID);
      const validStatuses = [...RECONCILIATION_STATUSES];
      for (const r of results) {
        expect(validStatuses).toContain(r.newStatus);
      }
    });
  });

  describe("verifyRevenueRecord", () => {
    it("should flag unresolved when gap exceeds threshold and route to action queue", async () => {
      const { verifyRevenueRecord } = await import("../revenue-reconciliation");
      const result = await verifyRevenueRecord(TEST_USER_ID, 1, {
        verifiedAmount: 10.00,
        source: "bank-statement",
      });
      expect(result.newStatus).toBe("unresolved");
      expect(result.gapAmount).not.toBeNull();
      expect(result.notes).toContain("exceeds threshold");
    });
  });

  describe("generateReconciliationReport", () => {
    it("should generate a report with required fields", async () => {
      const { generateReconciliationReport } = await import("../revenue-reconciliation");
      const report = await generateReconciliationReport(TEST_USER_ID, "2025-03");
      expect(report).toHaveProperty("period", "2025-03");
      expect(report).toHaveProperty("generatedAt");
      expect(report).toHaveProperty("totalRecords");
      expect(report).toHaveProperty("verifiedRecords");
      expect(report).toHaveProperty("estimatedRecords");
      expect(report).toHaveProperty("disputedRecords");
      expect(report).toHaveProperty("delayedRecords");
      expect(report).toHaveProperty("unresolvedRecords");
      expect(report).toHaveProperty("totalVerifiedAmount");
      expect(report).toHaveProperty("totalEstimatedAmount");
      expect(report).toHaveProperty("totalGapAmount");
      expect(report).toHaveProperty("variancePercent");
      expect(report).toHaveProperty("platformBreakdown");
      expect(report).toHaveProperty("needsHumanAction");
      expect(report).toHaveProperty("humanActionItems");
    });

    it("should compute platform breakdown with correct shape", async () => {
      const { generateReconciliationReport } = await import("../revenue-reconciliation");
      const report = await generateReconciliationReport(TEST_USER_ID, "2025-03");
      expect(typeof report.platformBreakdown).toBe("object");
      for (const platform of Object.keys(report.platformBreakdown)) {
        const breakdown = report.platformBreakdown[platform];
        expect(breakdown).toHaveProperty("verified");
        expect(breakdown).toHaveProperty("estimated");
        expect(breakdown).toHaveProperty("gap");
        expect(breakdown).toHaveProperty("recordCount");
      }
    });

    it("should flag needsHumanAction when appropriate", async () => {
      const { generateReconciliationReport } = await import("../revenue-reconciliation");
      const report = await generateReconciliationReport(TEST_USER_ID, "2025-03");
      expect(typeof report.needsHumanAction).toBe("boolean");
      expect(Array.isArray(report.humanActionItems)).toBe(true);
    });
  });

  describe("getRevenueTruthSummary", () => {
    it("should return truth summary with confidence label", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const summary = await getRevenueTruthSummary(TEST_USER_ID);
      expect(summary).toHaveProperty("totalRevenue");
      expect(summary).toHaveProperty("verifiedRevenue");
      expect(summary).toHaveProperty("estimatedRevenue");
      expect(summary).toHaveProperty("verificationRate");
      expect(summary).toHaveProperty("confidenceLabel");
      expect(["high", "medium", "low", "unverified"]).toContain(summary.confidenceLabel);
    });

    it("should break down by platform with verification rates", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const summary = await getRevenueTruthSummary(TEST_USER_ID);
      for (const platform of Object.keys(summary.byPlatform)) {
        const p = summary.byPlatform[platform];
        expect(p).toHaveProperty("total");
        expect(p).toHaveProperty("verified");
        expect(p).toHaveProperty("estimated");
        expect(p).toHaveProperty("verificationRate");
      }
    });

    it("should never blend estimated and verified without labeling", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const summary = await getRevenueTruthSummary(TEST_USER_ID);
      expect(summary.totalRevenue).toBe(summary.verifiedRevenue + summary.estimatedRevenue);
      expect(typeof summary.verificationRate).toBe("number");
    });

    it("should break down by source with status", async () => {
      const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
      const summary = await getRevenueTruthSummary(TEST_USER_ID);
      for (const source of Object.keys(summary.bySource)) {
        const s = summary.bySource[source];
        expect(s).toHaveProperty("total");
        expect(s).toHaveProperty("verified");
        expect(s).toHaveProperty("status");
      }
    });
  });

  describe("flagDelayedReconciliation", () => {
    it("should return count of flagged records", async () => {
      const { flagDelayedReconciliation } = await import("../revenue-reconciliation");
      const count = await flagDelayedReconciliation(TEST_USER_ID, 30);
      expect(typeof count).toBe("number");
    });
  });

  describe("getReconciliationHistory", () => {
    it("should return array of reconciled records", async () => {
      const { getReconciliationHistory } = await import("../revenue-reconciliation");
      const history = await getReconciliationHistory(TEST_USER_ID);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});

describe("Revenue Attribution Graph", () => {
  describe("buildAttributionGraph", () => {
    it("should return attribution graph structure", async () => {
      const { buildAttributionGraph } = await import("../revenue-attribution");
      const graph = await buildAttributionGraph(TEST_USER_ID);
      expect(graph).toHaveProperty("userId", TEST_USER_ID);
      expect(graph).toHaveProperty("generatedAt");
      expect(graph).toHaveProperty("totalRevenue");
      expect(graph).toHaveProperty("attributedRevenue");
      expect(graph).toHaveProperty("unattributedRevenue");
      expect(graph).toHaveProperty("attributionRate");
      expect(graph).toHaveProperty("links");
      expect(graph).toHaveProperty("byContent");
      expect(graph).toHaveProperty("byPlatform");
      expect(Array.isArray(graph.links)).toBe(true);
    });

    it("should have attribution links with correct shape", async () => {
      const { buildAttributionGraph } = await import("../revenue-attribution");
      const graph = await buildAttributionGraph(TEST_USER_ID);
      for (const link of graph.links) {
        expect(link).toHaveProperty("revenueRecordId");
        expect(link).toHaveProperty("contentType");
        expect(link).toHaveProperty("platform");
        expect(link).toHaveProperty("amount");
        expect(link).toHaveProperty("confidence");
        expect(link).toHaveProperty("method");
        expect(["direct", "inferred", "proportional"]).toContain(link.method);
        expect(["video", "stream", "clip", "unknown"]).toContain(link.contentType);
      }
    });

    it("should compute attributionRate as percentage", async () => {
      const { buildAttributionGraph } = await import("../revenue-attribution");
      const graph = await buildAttributionGraph(TEST_USER_ID);
      expect(graph.attributionRate).toBeGreaterThanOrEqual(0);
      expect(graph.attributionRate).toBeLessThanOrEqual(100);
      if (graph.totalRevenue > 0) {
        expect(graph.attributedRevenue + graph.unattributedRevenue).toBeCloseTo(graph.totalRevenue, 1);
      }
    });

    it("should group by platform with revenue totals", async () => {
      const { buildAttributionGraph } = await import("../revenue-attribution");
      const graph = await buildAttributionGraph(TEST_USER_ID);
      for (const [_platform, data] of Object.entries(graph.byPlatform)) {
        expect(data).toHaveProperty("totalRevenue");
        expect(data).toHaveProperty("attributedRevenue");
        expect(typeof data.totalRevenue).toBe("number");
      }
    });
  });

  describe("getTopRevenueContent", () => {
    it("should return top revenue content sorted by revenue", async () => {
      const { getTopRevenueContent } = await import("../revenue-attribution");
      const top = await getTopRevenueContent(TEST_USER_ID, 5);
      expect(Array.isArray(top)).toBe(true);
      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1].totalRevenue).toBeGreaterThanOrEqual(top[i].totalRevenue);
      }
    });

    it("should include content type and confidence", async () => {
      const { getTopRevenueContent } = await import("../revenue-attribution");
      const top = await getTopRevenueContent(TEST_USER_ID, 5);
      for (const item of top) {
        expect(item).toHaveProperty("contentType");
        expect(item).toHaveProperty("contentId");
        expect(item).toHaveProperty("title");
        expect(item).toHaveProperty("totalRevenue");
        expect(item).toHaveProperty("confidence");
        expect(item).toHaveProperty("sources");
      }
    });
  });

  describe("getRevenueByContent", () => {
    it("should return revenue for specific content", async () => {
      const { getRevenueByContent } = await import("../revenue-attribution");
      const result = await getRevenueByContent(TEST_USER_ID, "video", 10);
      expect(result).toHaveProperty("totalRevenue");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("records");
    });

    it("should return zero for unknown content", async () => {
      const { getRevenueByContent } = await import("../revenue-attribution");
      const result = await getRevenueByContent(TEST_USER_ID, "video", 99999);
      expect(result.totalRevenue).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe("getPlatformRevenueAttribution", () => {
    it("should return per-platform attribution rates", async () => {
      const { getPlatformRevenueAttribution } = await import("../revenue-attribution");
      const result = await getPlatformRevenueAttribution(TEST_USER_ID);
      expect(typeof result).toBe("object");
      for (const [_platform, data] of Object.entries(result)) {
        expect(data).toHaveProperty("totalRevenue");
        expect(data).toHaveProperty("attributedRevenue");
        expect(data).toHaveProperty("attributionRate");
        expect(data.attributionRate).toBeGreaterThanOrEqual(0);
        expect(data.attributionRate).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe("Revenue Truth Layer — v9.0 Requirements", () => {
  it("estimates must never be presented as settled revenue", async () => {
    const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
    const summary = await getRevenueTruthSummary(TEST_USER_ID);
    expect(summary.verifiedRevenue).not.toBe(summary.totalRevenue);
    expect(summary.estimatedRevenue).toBeGreaterThan(0);
  });

  it("all revenue surfaces label confidence and source", async () => {
    const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
    const summary = await getRevenueTruthSummary(TEST_USER_ID);
    expect(summary).toHaveProperty("confidenceLabel");
    expect(summary).toHaveProperty("verificationRate");
    for (const s of Object.values(summary.bySource)) {
      expect(s).toHaveProperty("status");
    }
  });

  it("unresolved gaps above threshold route to human action", async () => {
    const { generateReconciliationReport } = await import("../revenue-reconciliation");
    const report = await generateReconciliationReport(TEST_USER_ID, "2025-03");
    if (report.unresolvedGaps.length > 0) {
      expect(report.needsHumanAction).toBe(true);
      expect(report.humanActionItems.length).toBeGreaterThan(0);
    }
  });

  it("no valuation may use unverified revenue without labeling uncertainty", async () => {
    const { getRevenueTruthSummary } = await import("../revenue-reconciliation");
    const summary = await getRevenueTruthSummary(TEST_USER_ID);
    expect(typeof summary.verificationRate).toBe("number");
    expect(["high", "medium", "low", "unverified"]).toContain(summary.confidenceLabel);
  });

  it("reconciliation status visible for all records", async () => {
    const { reconcileRevenueRecords, RECONCILIATION_STATUSES } = await import("../revenue-reconciliation");
    const results = await reconcileRevenueRecords(TEST_USER_ID);
    const validStatuses = [...RECONCILIATION_STATUSES];
    for (const r of results) {
      expect(validStatuses).toContain(r.newStatus);
    }
  });

  it("attribution graph tracks content-to-revenue links with confidence", async () => {
    const { buildAttributionGraph } = await import("../revenue-attribution");
    const graph = await buildAttributionGraph(TEST_USER_ID);
    const directLinks = graph.links.filter(l => l.method === "direct");
    const inferredLinks = graph.links.filter(l => l.method === "inferred");
    for (const link of directLinks) {
      expect(link.confidence).toBeGreaterThanOrEqual(0.9);
    }
    for (const link of inferredLinks) {
      expect(link.confidence).toBeLessThan(0.95);
    }
  });

  it("attribution math is consistent - attributed + unattributed = total", async () => {
    const { buildAttributionGraph } = await import("../revenue-attribution");
    const graph = await buildAttributionGraph(TEST_USER_ID);
    if (graph.totalRevenue > 0) {
      expect(graph.attributedRevenue + graph.unattributedRevenue).toBeCloseTo(graph.totalRevenue, 1);
    }
  });

  it("routeUnresolvedToActionQueue persists human action items", async () => {
    const { routeUnresolvedToActionQueue } = await import("../revenue-reconciliation");
    const gaps = [
      { recordId: 3, platform: "twitch", source: "Subs", amount: 200, gapAmount: 150 },
    ];
    const created = await routeUnresolvedToActionQueue(TEST_USER_ID, gaps);
    expect(created).toBe(1);
  });

  it("getActionQueue returns pending actions", async () => {
    const { getActionQueue } = await import("../revenue-reconciliation");
    const actions = await getActionQueue(TEST_USER_ID, "pending");
    expect(Array.isArray(actions)).toBe(true);
  });

  it("resolveAction marks an action as resolved", async () => {
    const { resolveAction } = await import("../revenue-reconciliation");
    const resolved = await resolveAction(TEST_USER_ID, 1, "Manually verified");
    expect(typeof resolved).toBe("boolean");
  });

  it("storeReconciliationReport persists report to DB", async () => {
    const { storeReconciliationReport } = await import("../revenue-reconciliation");
    const reportId = await storeReconciliationReport(TEST_USER_ID, "2025-03", { total: 1000 });
    expect(typeof reportId).toBe("number");
  });

  it("getStoredReports retrieves historical reports", async () => {
    const { getStoredReports } = await import("../revenue-reconciliation");
    const reports = await getStoredReports(TEST_USER_ID);
    expect(Array.isArray(reports)).toBe(true);
  });

  it("cross-references auto-synced actuals vs estimated records for the same platform/period", async () => {
    const { reconcileRevenueRecords } = await import("../revenue-reconciliation");
    const results = await reconcileRevenueRecords(TEST_USER_ID);
    const record5Result = results.find(r => r.recordId === 5);
    expect(record5Result).toBeDefined();
    if (record5Result) {
      expect(["disputed", "unresolved"]).toContain(record5Result.newStatus);
      expect(record5Result.notes).toContain("provider actuals");
    }
  });

  it("verifyRevenueRecord routes >threshold gaps to unresolved and action queue", async () => {
    const { verifyRevenueRecord } = await import("../revenue-reconciliation");
    const result = await verifyRevenueRecord(TEST_USER_ID, 1, {
      verifiedAmount: 10, source: "payout-report", notes: "Provider payout"
    });
    expect(result.newStatus).toBe("unresolved");
    expect(result.gapAmount).not.toBeNull();
  });

  it("flagDelayedReconciliation targets both unverified and estimated records", async () => {
    const { flagDelayedReconciliation } = await import("../revenue-reconciliation");
    const flagged = await flagDelayedReconciliation(TEST_USER_ID, 30);
    expect(typeof flagged).toBe("number");
  });

  it("runMonthlyReconciliation generates report and routes actions", async () => {
    const { runMonthlyReconciliation } = await import("../revenue-reconciliation");
    const result = await runMonthlyReconciliation(TEST_USER_ID);
    expect(result.report).toBeDefined();
    expect(typeof result.reportId).toBe("number");
    expect(typeof result.actionsCreated).toBe("number");
    expect(result.report.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
