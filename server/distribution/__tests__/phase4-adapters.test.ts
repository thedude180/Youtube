import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => {
  const rows: any[] = [];
  let nextId = 1;
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          returning: () => {
            const id = nextId++;
            const row = { ...v, id, createdAt: new Date() };
            rows.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (n: number) => rows.slice(-n),
            orderBy: () => ({
              limit: (n: number) => rows.slice(-n),
            }),
          }),
          orderBy: () => ({
            limit: (n: number) => rows.slice(-n),
          }),
        }),
      }),
    },
  };
});

vi.mock("../../kernel/trust-budget", () => ({
  checkTrustBudget: async () => ({ remaining: 90, blocked: false }),
}));

vi.mock("../../kernel/capability-probe", () => ({
  probeCapability: async () => ({ probeResult: "verified" }),
}));

vi.mock("../../kernel/index", () => ({
  emitDomainEvent: async () => {},
}));

vi.mock("../../services/policy-preflight", () => ({
  runPolicyPreFlight: async () => ({ passed: true, blockers: [], recommendations: [], gatesChecked: ["policy_pack_check", "ai_disclosure_check", "credibility_check", "drift_check"], policyCheck: { compliant: true, violations: [], warnings: [] }, aiDisclosure: null, mediaTrust: null, credibility: null, activeDrifts: 0 }),
}));

vi.mock("../../services/compliance-drift-detector", () => ({
  detectComplianceDrift: async () => [],
}));

vi.mock("../../platform-publisher", () => ({
  executePublish: async (_userId: string, platform: string) => ({
    success: true,
    platform,
    postId: "mock-post-123",
  }),
}));

import {
  getConnectionHealth,
  recordConnectionSuccess,
  recordConnectionFailure,
  getAllConnectionHealth,
  resetCircuitBreaker,
  isPublishAllowed,
  getCircuitBreakerConfig,
} from "../connection-health";

import {
  checkPublishingGates,
  getPlatformPublishingRules,
} from "../publishing-gates";

import {
  recordDistributionLearning,
  getDistributionLearningContext,
} from "../distribution-learning";

import {
  distributeContent,
  getDistributionStats,
  getSupportedPlatforms,
} from "../platform-adapter";

describe("Connection Health Monitor", () => {
  it("returns closed circuit by default", () => {
    resetCircuitBreaker("youtube");
    const health = getConnectionHealth("youtube");
    expect(health.status).toBe("closed");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("records success and updates latency", () => {
    resetCircuitBreaker("youtube");
    recordConnectionSuccess("youtube", 150);
    const health = getConnectionHealth("youtube");
    expect(health.status).toBe("closed");
    expect(health.latencyMs).toBe(150);
    expect(health.lastSuccess).not.toBeNull();
  });

  it("opens circuit after threshold failures", () => {
    resetCircuitBreaker("tiktok");
    for (let i = 0; i < 5; i++) {
      recordConnectionFailure("tiktok", 5000);
    }
    const health = getConnectionHealth("tiktok");
    expect(health.status).toBe("open");
    expect(health.consecutiveFailures).toBe(5);
  });

  it("blocks publishing when circuit is open", () => {
    resetCircuitBreaker("twitch");
    for (let i = 0; i < 5; i++) recordConnectionFailure("twitch");
    expect(isPublishAllowed("twitch")).toBe(false);
  });

  it("allows publishing when circuit is closed", () => {
    resetCircuitBreaker("kick");
    recordConnectionSuccess("kick", 100);
    expect(isPublishAllowed("kick")).toBe(true);
  });

  it("resets circuit on success after failure", () => {
    resetCircuitBreaker("rumble");
    for (let i = 0; i < 3; i++) recordConnectionFailure("rumble");
    recordConnectionSuccess("rumble", 200);
    const health = getConnectionHealth("rumble");
    expect(health.status).toBe("closed");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("returns all platform health", () => {
    const all = getAllConnectionHealth();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.every(h => h.platform && h.status)).toBe(true);
  });

  it("returns circuit breaker config", () => {
    const config = getCircuitBreakerConfig();
    expect(config.failureThreshold).toBe(5);
    expect(config.recoveryTimeoutMs).toBe(60000);
  });
});

describe("Publishing Gates", () => {
  it("passes valid content", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "Elden Ring — No Commentary PS5 4K",
      description: "Full gameplay walkthrough",
      tags: ["elden ring", "ps5", "no commentary"],
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.gatesChecked.length).toBeGreaterThan(0);
  });

  it("blocks title exceeding platform limit", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "A".repeat(101),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes("limit"))).toBe(true);
  });

  it("blocks prohibited content", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "Free hack download link for game cheats",
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes("prohibited"))).toBe(true);
  });

  it("warns about clickbait", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "You won't believe this insane gameplay!!!",
    });
    expect(result.warnings.some(w => w.includes("clickbait"))).toBe(true);
  });

  it("blocks unresolved copyright", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "Test Video",
      copyrightCleared: false,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes("copyright"))).toBe(true);
  });

  it("blocks missing disclosure on sponsored content", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "Check out this sponsor deal",
      hasDisclosure: false,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes("disclosure"))).toBe(true);
  });

  it("returns platform publishing rules", () => {
    const rules = getPlatformPublishingRules("youtube");
    expect(rules.maxTitleLength).toBe(100);
    expect(rules.disclosureRequired).toBe(true);
  });

  it("blocks too-short titles", async () => {
    const result = await checkPublishingGates("user1", "youtube", {
      title: "Hi",
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes("short"))).toBe(true);
  });
});

describe("Distribution Learning", () => {
  it("records and retrieves learning context", async () => {
    await recordDistributionLearning("learn-user", "youtube", "publish_video", {
      allowed: true,
      trustCost: 10,
      policyIssues: [],
      connectionStatus: "closed",
    });
    await recordDistributionLearning("learn-user", "youtube", "publish_video", {
      allowed: false,
      trustCost: 10,
      policyIssues: ["title too long"],
      connectionStatus: "closed",
    });

    const context = getDistributionLearningContext("learn-user");
    expect(context.totalSignals).toBe(2);
    expect(context.successRate).toBe(0.5);
    expect(context.commonIssues).toContain("title too long");
    expect(context.platformBreakdown.youtube).toBeDefined();
    expect(context.platformBreakdown.youtube.total).toBe(2);
  });

  it("filters by platform", async () => {
    await recordDistributionLearning("learn-user2", "tiktok", "publish_short", {
      allowed: true,
      trustCost: 5,
      policyIssues: [],
      connectionStatus: "closed",
    });

    const context = getDistributionLearningContext("learn-user2", "tiktok");
    expect(context.totalSignals).toBe(1);
    expect(context.platformBreakdown.tiktok).toBeDefined();
  });
});

describe("Platform Adapter", () => {
  it("distributes content through governance pipeline and calls publisher", async () => {
    resetCircuitBreaker("youtube");
    recordConnectionSuccess("youtube", 100);

    const result = await distributeContent({
      userId: "adapter-user",
      platform: "youtube",
      contentId: "vid-123",
      contentType: "video",
      title: "Elden Ring Boss Fight — No Commentary PS5",
      content: "Full gameplay walkthrough of the boss fight",
      tags: ["elden ring", "boss fight"],
    });

    expect(result.allowed).toBe(true);
    expect(result.eventId).toBeGreaterThan(0);
    expect(result.trustCheck.blocked).toBe(false);
    expect(result.capabilityCheck.probeResult).toBe("verified");
    expect(result.policyCheck.passed).toBe(true);
    expect(result.connectionHealth.status).toBe("closed");
    expect(result.publishResult).not.toBeNull();
    expect(result.publishResult!.success).toBe(true);
    expect(result.publishResult!.postId).toBe("mock-post-123");
  });

  it("blocks distribution when circuit breaker is open", async () => {
    resetCircuitBreaker("tiktok");
    for (let i = 0; i < 5; i++) recordConnectionFailure("tiktok");

    const result = await distributeContent({
      userId: "adapter-user2",
      platform: "tiktok",
      contentId: "vid-456",
      contentType: "short",
      title: "Quick PS5 Clip",
    });

    expect(result.allowed).toBe(false);
    expect(result.connectionHealth.status).toBe("open");
  });

  it("blocks distribution when policy fails", async () => {
    resetCircuitBreaker("youtube");
    recordConnectionSuccess("youtube", 100);

    const result = await distributeContent({
      userId: "adapter-user3",
      platform: "youtube",
      contentId: "vid-789",
      contentType: "video",
      title: "Free hack download link for game cheats",
    });

    expect(result.allowed).toBe(false);
    expect(result.policyCheck.passed).toBe(false);
  });

  it("blocks distribution when copyright is unresolved", async () => {
    resetCircuitBreaker("youtube");
    recordConnectionSuccess("youtube", 100);

    const result = await distributeContent({
      userId: "adapter-user4",
      platform: "youtube",
      contentId: "vid-copy",
      contentType: "video",
      title: "Normal Valid Title Here",
      copyrightCleared: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.policyCheck.passed).toBe(false);
    expect(result.policyCheck.issues.some(i => i.includes("copyright"))).toBe(true);
  });

  it("blocks distribution when disclosure missing on sponsored content", async () => {
    resetCircuitBreaker("youtube");
    recordConnectionSuccess("youtube", 100);

    const result = await distributeContent({
      userId: "adapter-user5",
      platform: "youtube",
      contentId: "vid-sponsor",
      contentType: "video",
      title: "Great sponsor partner deal video",
      hasDisclosure: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.policyCheck.passed).toBe(false);
    expect(result.policyCheck.issues.some(i => i.includes("disclosure"))).toBe(true);
  });

  it("returns supported platforms", () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain("youtube");
    expect(platforms).toContain("tiktok");
    expect(platforms.length).toBeGreaterThanOrEqual(6);
  });
});
