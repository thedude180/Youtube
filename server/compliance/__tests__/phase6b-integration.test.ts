import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_USER_ID = "test-user-exception-desk";

const mockExceptionItems: any[] = [];
const mockDlqItems: any[] = [];
let nextId = 1;

function makeChain(data: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.where = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockImplementation(self);
  chain.offset = vi.fn().mockImplementation(self);
  chain.groupBy = vi.fn().mockImplementation(self);
  chain.returning = vi.fn().mockResolvedValue(data);
  chain.set = vi.fn().mockImplementation(self);
  chain.then = vi.fn().mockImplementation((resolve: (val: unknown) => void) => resolve(data));
  return chain;
}

import { exceptionDeskItems, deadLetterQueue } from "@shared/schema";

vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => {
        if (table === exceptionDeskItems) return makeChain(mockExceptionItems);
        if (table === deadLetterQueue) return makeChain(mockDlqItems);
        return makeChain([]);
      }),
    })),
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((vals: any) => {
        const item = { ...vals, id: nextId++, createdAt: new Date(), updatedAt: new Date() };
        if (table === exceptionDeskItems) mockExceptionItems.push(item);
        if (table === deadLetterQueue) mockDlqItems.push(item);
        return {
          returning: vi.fn().mockResolvedValue([item]),
        };
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

vi.mock("../../lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("Phase 6B: Exception Desk & Anomaly Hardening", () => {
  beforeEach(() => {
    mockExceptionItems.length = 0;
    mockDlqItems.length = 0;
    nextId = 1;
    vi.clearAllMocks();
  });

  describe("Exception Desk Core", () => {
    it("should create an exception item", async () => {
      const { createException } = await import("../../services/exception-desk");
      const item = await createException({
        severity: "high",
        category: "system_health",
        source: "test",
        title: "Test Exception",
        description: "Test description",
        userId: TEST_USER_ID,
      });

      expect(item).toBeDefined();
      expect(item.severity).toBe("high");
      expect(item.category).toBe("system_health");
      expect(item.status).toBe("open");
    });

    it("should get exception stats", async () => {
      const { getExceptionStats } = await import("../../services/exception-desk");
      const stats = await getExceptionStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("open");
      expect(stats).toHaveProperty("acknowledged");
      expect(stats).toHaveProperty("resolved");
      expect(stats).toHaveProperty("autoResolved");
      expect(stats).toHaveProperty("bySeverity");
      expect(stats).toHaveProperty("byCategory");
      expect(stats).toHaveProperty("bySource");
    });

    it("should get exceptions list", async () => {
      const { getExceptions } = await import("../../services/exception-desk");
      const items = await getExceptions({ limit: 10 });
      expect(Array.isArray(items)).toBe(true);
    });

    it("should get exception by id", async () => {
      const { getExceptionById } = await import("../../services/exception-desk");
      const item = await getExceptionById(999);
      expect(item).toBeNull();
    });
  });

  describe("DLQ to Exception Desk Feed", () => {
    it("should create exception from DLQ item", async () => {
      const { feedDlqToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedDlqToExceptionDesk({
        id: 42,
        jobType: "video_upload",
        error: "Network timeout after 30s",
        userId: TEST_USER_ID,
        priority: 3,
        payload: { videoId: 123 },
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("dlq_failure");
      expect(exception.source).toBe("dead_letter_queue");
      expect(exception.severity).toBe("high");
      expect(exception.title).toContain("video_upload");
    });

    it("should map DLQ priority to exception severity", async () => {
      const { feedDlqToExceptionDesk } = await import("../../services/exception-desk");

      const critical = await feedDlqToExceptionDesk({ id: 1, jobType: "critical_job", error: "error", priority: 1 });
      expect(critical.severity).toBe("critical");

      const high = await feedDlqToExceptionDesk({ id: 2, jobType: "high_job", error: "error", priority: 3 });
      expect(high.severity).toBe("high");

      const medium = await feedDlqToExceptionDesk({ id: 3, jobType: "medium_job", error: "error", priority: 5 });
      expect(medium.severity).toBe("medium");

      const low = await feedDlqToExceptionDesk({ id: 4, jobType: "low_job", error: "error", priority: 7 });
      expect(low.severity).toBe("low");
    });
  });

  describe("Anomaly Feed to Exception Desk", () => {
    it("should create exception from anomaly", async () => {
      const { feedAnomalyToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedAnomalyToExceptionDesk({
        type: "error_spike",
        description: "Error rate surged to 50 in 5 minutes",
        userId: TEST_USER_ID,
        risk: "high",
        recurring: false,
        occurrenceCount: 1,
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("anomaly_detection");
      expect(exception.source).toBe("anomaly_responder");
      expect(exception.severity).toBe("critical");
    });

    it("should escalate recurring anomalies to critical", async () => {
      const { feedAnomalyToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedAnomalyToExceptionDesk({
        type: "memory_leak",
        description: "Memory leak recurring",
        risk: "low",
        recurring: true,
        occurrenceCount: 5,
      });

      expect(exception.severity).toBe("critical");
    });
  });

  describe("System Health Feed", () => {
    it("should create exception from system health signal", async () => {
      const { feedSystemHealthToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedSystemHealthToExceptionDesk({
        source: "self_healing_agent",
        issue: "5 stuck jobs detected",
        severity: "medium",
        details: { stuckJobCount: 5 },
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("system_health");
      expect(exception.source).toBe("self_healing_agent");
    });
  });

  describe("Trust Decline Alerts", () => {
    it("should create exception for trust decline", async () => {
      const { feedTrustDeclineToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedTrustDeclineToExceptionDesk({
        userId: TEST_USER_ID,
        platform: "youtube",
        currentScore: 20,
        threshold: 60,
        decline: 35,
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("trust_decline");
      expect(exception.source).toBe("trust_monitor");
      expect(exception.severity).toBe("critical");
    });

    it("should map trust decline severity by threshold proximity", async () => {
      const { feedTrustDeclineToExceptionDesk } = await import("../../services/exception-desk");

      const critical = await feedTrustDeclineToExceptionDesk({
        userId: TEST_USER_ID, platform: "youtube",
        currentScore: 20, threshold: 60, decline: 40,
      });
      expect(critical.severity).toBe("critical");

      const high = await feedTrustDeclineToExceptionDesk({
        userId: TEST_USER_ID, platform: "tiktok",
        currentScore: 40, threshold: 60, decline: 20,
      });
      expect(high.severity).toBe("high");

      const medium = await feedTrustDeclineToExceptionDesk({
        userId: TEST_USER_ID, platform: "twitch",
        currentScore: 55, threshold: 60, decline: 5,
      });
      expect(medium.severity).toBe("medium");
    });
  });

  describe("Prompt Toxicity & Drift Monitor", () => {
    it("should detect toxic content", async () => {
      const { screenForToxicity } = await import("../../services/prompt-toxicity-monitor");
      const result = screenForToxicity("This is normal content about gaming");
      expect(result.toxic).toBe(false);
      expect(result.score).toBeLessThan(0.6);
    });

    it("should flag harmful content", async () => {
      const { screenForToxicity } = await import("../../services/prompt-toxicity-monitor");
      const result = screenForToxicity("kill murder violence attack assault bomb weapon abuse torture exploit children self-harm suicide");
      expect(result.toxic).toBe(true);
      expect(result.categories).toContain("harmful_content");
      expect(result.flaggedPhrases.length).toBeGreaterThan(0);
    });

    it("should detect hallucination indicators", async () => {
      const { screenForToxicity } = await import("../../services/prompt-toxicity-monitor");
      const result = screenForToxicity("As an AI, I cannot provide that. My training data says I was trained on...");
      expect(result.categories).toContain("hallucination_indicators");
    });

    it("should detect prompt drift for JSON format", async () => {
      const { detectPromptDrift } = await import("../../services/prompt-toxicity-monitor");
      const noJson = detectPromptDrift("This is just plain text, not JSON", "json");
      expect(noJson.drifted).toBe(false);

      const validJson = detectPromptDrift('{"key": "value"}', "json");
      expect(validJson.drifted).toBe(false);
      expect(validJson.score).toBeLessThan(0.5);
    });

    it("should detect off-topic drift", async () => {
      const { detectPromptDrift } = await import("../../services/prompt-toxicity-monitor");
      const result = detectPromptDrift(
        "The weather is beautiful today. Let me tell you about cooking recipes.",
        "markdown",
        ["gaming", "youtube", "PS5", "subscribers"]
      );
      expect(result.drifted).toBe(true);
    });

    it("should screen AI output and create exceptions for toxicity", async () => {
      const { screenAiOutput } = await import("../../services/prompt-toxicity-monitor");
      const result = await screenAiOutput(
        "kill murder violence attack assault bomb weapon abuse torture exploit children self-harm suicide",
        "gpt-4o-mini",
        { autoFeedExceptionDesk: true }
      );

      expect(result.toxicity.toxic).toBe(true);
      expect(result.exceptionsCreated).toBeGreaterThanOrEqual(1);
    });

    it("should get monitor config", async () => {
      const { getMonitorConfig } = await import("../../services/prompt-toxicity-monitor");
      const config = getMonitorConfig();

      expect(config.toxicityThreshold).toBeDefined();
      expect(config.driftThreshold).toBeDefined();
      expect(config.categories).toContain("harmful_content");
      expect(config.categories).toContain("hallucination_indicators");
    });
  });

  describe("Anomaly Detection Hardening", () => {
    it("should have configurable thresholds", async () => {
      const { configureAnomalyThresholds, getAnomalyThresholds } = await import("../../services/anomaly-responder");

      const defaults = getAnomalyThresholds();
      expect(defaults.errorSpikeMultiplier).toBe(3);
      expect(defaults.recurringCountThreshold).toBe(3);

      configureAnomalyThresholds({ errorSpikeMultiplier: 5, recurringCountThreshold: 5 });
      const updated = getAnomalyThresholds();
      expect(updated.errorSpikeMultiplier).toBe(5);
      expect(updated.recurringCountThreshold).toBe(5);

      configureAnomalyThresholds({ errorSpikeMultiplier: 3, recurringCountThreshold: 3 });
    });

    it("should track recurrence stats", async () => {
      const { getRecurrenceStats } = await import("../../services/anomaly-responder");
      const stats = getRecurrenceStats();
      expect(typeof stats).toBe("object");
    });
  });

  describe("Prompt Toxicity Exception Desk Feed", () => {
    it("should create prompt toxicity exception", async () => {
      const { feedPromptToxicityToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedPromptToxicityToExceptionDesk({
        outputText: "Harmful output text",
        toxicityScore: 0.85,
        categories: ["harmful_content"],
        model: "gpt-4o-mini",
        promptContext: "Test prompt",
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("prompt_toxicity");
      expect(exception.severity).toBe("high");
    });

    it("should map toxicity score to severity", async () => {
      const { feedPromptToxicityToExceptionDesk } = await import("../../services/exception-desk");

      const critical = await feedPromptToxicityToExceptionDesk({
        outputText: "Very toxic", toxicityScore: 0.95, categories: ["harmful_content"], model: "test",
      });
      expect(critical.severity).toBe("critical");

      const high = await feedPromptToxicityToExceptionDesk({
        outputText: "Somewhat toxic", toxicityScore: 0.75, categories: ["bias"], model: "test",
      });
      expect(high.severity).toBe("high");

      const medium = await feedPromptToxicityToExceptionDesk({
        outputText: "Mildly toxic", toxicityScore: 0.5, categories: ["manipulation"], model: "test",
      });
      expect(medium.severity).toBe("medium");
    });
  });

  describe("Prompt Drift Exception Desk Feed", () => {
    it("should create prompt drift exception", async () => {
      const { feedPromptDriftToExceptionDesk } = await import("../../services/exception-desk");
      const exception = await feedPromptDriftToExceptionDesk({
        model: "gpt-4o-mini",
        driftScore: 0.7,
        expectedPattern: "json_format",
        actualPattern: "plain_text",
        context: "Test context",
      });

      expect(exception).toBeDefined();
      expect(exception.category).toBe("prompt_drift");
      expect(exception.severity).toBe("medium");
    });

    it("should map drift score to severity", async () => {
      const { feedPromptDriftToExceptionDesk } = await import("../../services/exception-desk");

      const high = await feedPromptDriftToExceptionDesk({
        model: "test", driftScore: 0.9, expectedPattern: "json", actualPattern: "text",
      });
      expect(high.severity).toBe("high");

      const low = await feedPromptDriftToExceptionDesk({
        model: "test", driftScore: 0.3, expectedPattern: "json", actualPattern: "text",
      });
      expect(low.severity).toBe("low");
    });
  });

  describe("Bulk Resolution", () => {
    it("should bulk resolve exceptions", async () => {
      const { bulkResolve } = await import("../../services/exception-desk");
      const count = await bulkResolve([1, 2, 3], "Bulk resolved for testing");
      expect(count).toBe(3);
    });

    it("should return 0 for empty array", async () => {
      const { bulkResolve } = await import("../../services/exception-desk");
      const count = await bulkResolve([], "Nothing to resolve");
      expect(count).toBe(0);
    });
  });
});
