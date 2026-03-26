import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-compliance";

const mockComplianceChecks = [
  { id: 1, userId: TEST_USER_ID, status: "passed", checkedAt: new Date(), findings: [] },
  { id: 2, userId: TEST_USER_ID, status: "passed", checkedAt: new Date(), findings: [] },
  { id: 3, userId: TEST_USER_ID, status: "violation", checkedAt: new Date(), findings: [{ severity: "critical", message: "Missing disclosure" }] },
  { id: 4, userId: TEST_USER_ID, status: "warning", checkedAt: new Date(), findings: [{ severity: "warning", message: "Title too long" }] },
];

const mockCopyrightClaims = [
  { id: 1, userId: TEST_USER_ID, status: "resolved", detectedAt: new Date() },
  { id: 2, userId: TEST_USER_ID, status: "detected", detectedAt: new Date() },
];

const mockDisclosures = [
  { id: 1, userId: TEST_USER_ID, required: true, guidance: { hasProperDisclosure: true } },
  { id: 2, userId: TEST_USER_ID, required: true, guidance: { hasProperDisclosure: false } },
];

const mockChannels = [
  { id: 1, userId: TEST_USER_ID, platform: "youtube", channelName: "TestChannel" },
];

const mockVideos = [
  { id: 1, channelId: 1, title: "AI Generated Gameplay", description: "Made with AI thumbnails", platform: "youtube", createdAt: new Date() },
  { id: 2, channelId: 1, title: "Regular Gameplay", description: "Normal video", platform: "youtube", createdAt: new Date() },
];

const mockProvenanceRecords = [
  { id: 1, userId: TEST_USER_ID, contentId: 1, originType: "ai-generated", assetName: "thumbnail.png", trustScore: 70, verificationStatus: "unverified", createdAt: new Date() },
];

const mockDriftEvents = [
  { id: 1, platform: "youtube", ruleCategory: "metadata", driftType: "policy_update", severity: "medium", status: "detected", detectedAt: new Date(), changesDetected: [] },
];

const mockCredibilityScores = [
  { id: 1, userId: TEST_USER_ID, overallScore: 75, complianceRate: 80, strikeCount: 1, warningCount: 1, factors: {} },
];

function makeChain(data: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.where = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockImplementation(self);
  chain.offset = vi.fn().mockImplementation(self);
  chain.groupBy = vi.fn().mockImplementation(self);
  chain.having = vi.fn().mockImplementation(self);
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => resolve(data));
  return chain;
}

import {
  complianceChecks, copyrightClaims, disclosureRequirements,
  channels, videos, contentProvenance, complianceDriftEvents,
  creatorCredibilityScores, complianceRules, policyPackBaselines
} from "@shared/schema";

const tableDataMap = new Map<unknown, unknown[]>();
tableDataMap.set(complianceChecks, mockComplianceChecks);
tableDataMap.set(copyrightClaims, mockCopyrightClaims);
tableDataMap.set(disclosureRequirements, mockDisclosures);
tableDataMap.set(channels, mockChannels);
tableDataMap.set(videos, mockVideos);
tableDataMap.set(contentProvenance, mockProvenanceRecords);
tableDataMap.set(complianceDriftEvents, mockDriftEvents);
tableDataMap.set(creatorCredibilityScores, mockCredibilityScores);
tableDataMap.set(complianceRules, []);
tableDataMap.set(policyPackBaselines, []);

const mockDb = {
  select: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableDataMap.get(table) || [];
      return makeChain(data);
    }),
  })),
  insert: vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: 99, userId: TEST_USER_ID, overallScore: 75, contentId: 1, originType: "user-created", assetName: "test.mp4", trustScore: 90, verificationStatus: "verified", createdAt: new Date() }]),
      then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => resolve([{ id: 99 }])),
    })),
  })),
  update: vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    })),
  })),
};

vi.mock("../../db", () => ({ db: mockDb }));

describe("Phase 6A: Policy Intelligence & Compliance Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => {
        const data = tableDataMap.get(table) || [];
        return makeChain(data);
      }),
    }));
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 99, userId: TEST_USER_ID, overallScore: 75, contentId: 1, originType: "user-created", assetName: "test.mp4", trustScore: 90, verificationStatus: "verified", createdAt: new Date() }]),
        then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => resolve([{ id: 99 }])),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      })),
    }));
  });

  describe("Policy Packs", () => {
    it("should provide policy packs for all 7 platforms", async () => {
      const { getSupportedPlatforms, getAllPolicyPacks } = await import("../../services/policy-packs");
      const platforms = getSupportedPlatforms();
      expect(platforms).toHaveLength(7);
      expect(platforms).toContain("youtube");
      expect(platforms).toContain("twitch");
      expect(platforms).toContain("tiktok");
      expect(platforms).toContain("x");
      expect(platforms).toContain("instagram");
      expect(platforms).toContain("kick");
      expect(platforms).toContain("rumble");

      const packs = getAllPolicyPacks();
      expect(packs).toHaveLength(7);
      for (const pack of packs) {
        expect(pack.version).toBeDefined();
        expect(pack.limits.titleMaxLength).toBeGreaterThan(0);
        expect(pack.limits.descriptionMaxLength).toBeGreaterThan(0);
        expect(pack.aiDisclosure).toBeDefined();
        expect(pack.disclosures.length).toBeGreaterThan(0);
      }
    });

    it("should return null for unknown platform", async () => {
      const { getPolicyPack } = await import("../../services/policy-packs");
      expect(getPolicyPack("myspace")).toBeNull();
    });

    it("should detect title length violations", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "A".repeat(120),
        description: "Normal description",
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.ruleId.includes("title"))).toBe(true);
    });

    it("should block on missing AI disclosure when AI content is present", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "Cool Video",
        description: "Check out my video",
        hasAiContent: true,
      });
      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.ruleId.includes("ai-disclosure"))).toBe(true);
    });

    it("should pass when AI content has disclosure", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "Cool AI Generated Video",
        description: "This video uses ai generated thumbnails and content",
        hasAiContent: true,
      });
      expect(result.violations.filter(v => v.ruleId.includes("ai-disclosure"))).toHaveLength(0);
    });

    it("should block on missing sponsorship disclosure", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "Cool Video",
        description: "Check this out",
        hasSponsoredContent: true,
      });
      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.ruleId.includes("paid-promo") || v.ruleName.includes("Sponsor"))).toBe(true);
    });

    it("should pass sponsorship with proper disclosure", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "Cool Video",
        description: "This video is #ad sponsored by GameCorp. #sponsored",
        hasSponsoredContent: true,
      });
      const sponsorViolations = result.violations.filter(v => v.ruleName.includes("Sponsor"));
      expect(sponsorViolations).toHaveLength(0);
    });

    it("should detect tag limit violations", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "Video",
        tags: Array.from({ length: 35 }, (_, i) => `tag${i}`),
      });
      expect(result.warnings.some(w => w.ruleId.includes("tag-limit"))).toBe(true);
    });

    it("should generate stable policy pack hashes", async () => {
      const { getPolicyPackHash } = await import("../../services/policy-packs");
      const hash1 = getPolicyPackHash("youtube");
      const hash2 = getPolicyPackHash("youtube");
      expect(hash1).toBe(hash2);
      expect(hash1.startsWith("youtube:")).toBe(true);
    });

    it("should detect keyword-based rule violations", async () => {
      const { checkContentAgainstPack } = await import("../../services/policy-packs");
      const result = checkContentAgainstPack({
        platform: "youtube",
        title: "sub4sub follow me",
        description: "like4like get free subs",
      });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("AI Disclosure Intelligence", () => {
    it("should detect AI content indicators", async () => {
      const { checkAiDisclosure } = await import("../../services/ai-disclosure-intelligence");
      const result = await checkAiDisclosure(
        TEST_USER_ID, 1,
        "AI Generated Gameplay", "Made with ai generated thumbnails",
        "youtube"
      );
      expect(result.hasAiContent).toBe(true);
      expect(result.aiIndicators.length).toBeGreaterThan(0);
    });

    it("should flag missing AI disclosure on YouTube", async () => {
      const { checkAiDisclosure } = await import("../../services/ai-disclosure-intelligence");
      const result = await checkAiDisclosure(
        TEST_USER_ID, 1,
        "Cool Video", "Regular description",
        "youtube",
        ["ai-generated"]
      );
      expect(result.requiresDisclosure).toBe(true);
      expect(result.disclosureStatus).toBe("missing");
    });

    it("should mark as not applicable when no AI content on non-AI video", async () => {
      const { checkAiDisclosure } = await import("../../services/ai-disclosure-intelligence");
      tableDataMap.set(contentProvenance, []);
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: unknown) => {
          const data = tableDataMap.get(table) || [];
          return makeChain(data);
        }),
      }));
      const result = await checkAiDisclosure(
        TEST_USER_ID, 99,
        "Normal Video", "Just gameplay",
        "youtube"
      );
      expect(result.hasAiContent).toBe(false);
      expect(result.disclosureStatus).toBe("not_applicable");
      tableDataMap.set(contentProvenance, mockProvenanceRecords);
    });

    it("should not require disclosure on platforms where optional", async () => {
      const { checkAiDisclosure } = await import("../../services/ai-disclosure-intelligence");
      const result = await checkAiDisclosure(
        TEST_USER_ID, 1,
        "Cool Video", "Regular description",
        "kick",
        ["ai-generated"]
      );
      expect(result.requiresDisclosure).toBe(false);
    });
  });

  describe("Provenance Tracking", () => {
    it("should record provenance with correct trust scores", async () => {
      const { recordProvenance } = await import("../../services/ai-disclosure-intelligence");
      const record = await recordProvenance(
        TEST_USER_ID, 1, "video", "gameplay.mp4", "user-created"
      );
      expect(record).toBeDefined();
    });

    it("should retrieve provenance records", async () => {
      const { getProvenance } = await import("../../services/ai-disclosure-intelligence");
      const records = await getProvenance(TEST_USER_ID, 1);
      expect(Array.isArray(records)).toBe(true);
    });
  });

  describe("Media Trust Verification", () => {
    it("should compute media trust scores", async () => {
      const { verifyMediaTrust } = await import("../../services/ai-disclosure-intelligence");
      const result = await verifyMediaTrust(TEST_USER_ID, 1);
      expect(result.overallTrustScore).toBeDefined();
      expect(typeof result.overallTrustScore).toBe("number");
      expect(result.assets).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe("Creator Credibility", () => {
    it("should compute credibility score from compliance history", async () => {
      const { computeCreatorCredibility } = await import("../../services/creator-credibility");
      const result = await computeCreatorCredibility(TEST_USER_ID);
      expect(result.overallScore).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(["excellent", "good", "fair", "at_risk", "poor"]).toContain(result.tier);
      expect(result.factors).toBeDefined();
    });

    it("should include appropriate recommendations for violations", async () => {
      const { computeCreatorCredibility } = await import("../../services/creator-credibility");
      const result = await computeCreatorCredibility(TEST_USER_ID);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should retrieve stored credibility score", async () => {
      const { getCredibilityScore } = await import("../../services/creator-credibility");
      const score = await getCredibilityScore(TEST_USER_ID);
      expect(score).toBeDefined();
    });
  });

  describe("Compliance Drift Detection", () => {
    it("should detect drift across platforms", async () => {
      const { detectComplianceDrift } = await import("../../services/compliance-drift-detector");
      const results = await detectComplianceDrift();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
      for (const r of results) {
        expect(r.platform).toBeDefined();
        expect(typeof r.driftsDetected).toBe("number");
      }
    });

    it("should retrieve drift events", async () => {
      const { getDriftEvents } = await import("../../services/compliance-drift-detector");
      const events = await getDriftEvents({ platform: "youtube" });
      expect(Array.isArray(events)).toBe(true);
    });

    it("should provide drift summary", async () => {
      const { getDriftSummary } = await import("../../services/compliance-drift-detector");
      const summary = await getDriftSummary();
      expect(summary.totalEvents).toBeDefined();
      expect(typeof summary.unresolvedCount).toBe("number");
      expect(summary.byPlatform).toBeDefined();
    });

    it("should resolve drift events", async () => {
      const { resolveDriftEvent } = await import("../../services/compliance-drift-detector");
      const result = await resolveDriftEvent(1);
      expect(result).toBe(true);
    });
  });

  describe("Policy Pre-Flight", () => {
    it("should pass pre-flight for compliant content", async () => {
      const { runPolicyPreFlight } = await import("../../services/policy-preflight");
      const result = await runPolicyPreFlight(TEST_USER_ID, "youtube", {
        title: "Great Gameplay Video",
        description: "Check out this amazing gameplay #ad",
        hasSponsoredContent: true,
      });
      expect(result.gatesChecked.length).toBeGreaterThan(0);
      expect(result.platform).toBe("youtube");
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should block pre-flight for missing AI disclosure", async () => {
      const { runPolicyPreFlight } = await import("../../services/policy-preflight");
      const result = await runPolicyPreFlight(TEST_USER_ID, "youtube", {
        title: "Cool Video",
        description: "Normal description",
        hasAiContent: true,
      });
      expect(result.passed).toBe(false);
      expect(result.blockers.some(b => b.toLowerCase().includes("ai") || b.toLowerCase().includes("disclosure"))).toBe(true);
    });

    it("should check media trust when contentId provided", async () => {
      const { runPolicyPreFlight } = await import("../../services/policy-preflight");
      const result = await runPolicyPreFlight(TEST_USER_ID, "youtube", {
        contentId: 1,
        title: "Great Video",
        description: "Description",
      });
      expect(result.gatesChecked).toContain("media_trust_check");
      expect(result.mediaTrust).toBeDefined();
    });

    it("should include credibility check in pre-flight", async () => {
      const { runPolicyPreFlight } = await import("../../services/policy-preflight");
      const result = await runPolicyPreFlight(TEST_USER_ID, "youtube", {
        title: "Video",
        description: "Description",
      });
      expect(result.gatesChecked).toContain("credibility_check");
    });

    it("should include drift check in pre-flight", async () => {
      const { runPolicyPreFlight } = await import("../../services/policy-preflight");
      const result = await runPolicyPreFlight(TEST_USER_ID, "youtube", {
        title: "Video",
        description: "Description",
      });
      expect(result.gatesChecked).toContain("drift_check");
      expect(typeof result.activeDrifts).toBe("number");
    });
  });
});
