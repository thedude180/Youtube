import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import {
  agentInteropMessages,
  evalRuns,
  trustBudgetPeriods,
  platformCapabilityProbes,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const TEST_USER = "phase1-test-user-" + Date.now();

describe("Phase 1: Agent Interop Bus", () => {
  it("should write an agent-to-agent message and query it back", async () => {
    const { sendAgentMessage, getAgentMessages } = await import("../interop");

    const id = await sendAgentMessage(
      "smart-edit-engine",
      "performance-feedback-engine",
      TEST_USER,
      "job-completed",
      { videoId: 42, result: "success" }
    );
    expect(id).toBeGreaterThan(0);

    const [row] = await db
      .select()
      .from(agentInteropMessages)
      .where(eq(agentInteropMessages.id, id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row.fromAgent).toBe("smart-edit-engine");
    expect(row.toAgent).toBe("performance-feedback-engine");
    expect(row.messageType).toBe("job-completed");
    expect(row.status).toBe("delivered");

    const messages = await getAgentMessages("performance-feedback-engine", {
      direction: "to",
      userId: TEST_USER,
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].fromAgent).toBe("smart-edit-engine");
  });
});

describe("Phase 1: Eval Harness", () => {
  it("should create an eval run and retrieve it", async () => {
    const { runEval, getEvalResults } = await import("../eval");

    const evalResult = await runEval(TEST_USER, "smart-edit-engine", "smart-edit-quality", {
      inputSnapshot: { videoId: 42, segmentCount: 3 },
      evaluator: (input) => {
        const segCount = (input.segmentCount as number) ?? 0;
        const score = Math.min(1, segCount / 5);
        return { score, passed: score >= 0.4, notes: `${segCount} segments` };
      },
    });

    expect(evalResult.id).toBeGreaterThan(0);
    expect(evalResult.score).toBeCloseTo(0.6);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.evalType).toBe("smart-edit-quality");

    const results = await getEvalResults({ userId: TEST_USER, evalType: "smart-edit-quality" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((r) => r.id === evalResult.id);
    expect(found).toBeDefined();
    expect(found!.agentName).toBe("smart-edit-engine");
  });
});

describe("Phase 1: Trust Budget", () => {
  it("should block automation when budget is exhausted", async () => {
    const { checkTrustBudget } = await import("../trust-budget");
    const budgetUser = "trust-budget-test-" + Date.now();

    const first = await checkTrustBudget(budgetUser, "test-agent", 50);
    expect(first.blocked).toBe(false);
    expect(first.remaining).toBe(50);
    expect(first.deductionsCount).toBe(1);

    const second = await checkTrustBudget(budgetUser, "test-agent", 30);
    expect(second.blocked).toBe(false);
    expect(second.remaining).toBe(20);

    const exhausted = await checkTrustBudget(budgetUser, "test-agent", 25);
    expect(exhausted.blocked).toBe(true);
    expect(exhausted.remaining).toBe(0);

    const [period] = await db
      .select()
      .from(trustBudgetPeriods)
      .where(eq(trustBudgetPeriods.userId, budgetUser))
      .orderBy(desc(trustBudgetPeriods.createdAt))
      .limit(1);
    expect(period).toBeDefined();
    expect(period.startingBudget).toBe(100);
  });
});

describe("Phase 1: Capability Probe", () => {
  it("should write a probe result to platform_capability_probes", async () => {
    const { probeCapability } = await import("../capability-probe");

    const result = await probeCapability("youtube", "api-connectivity", async () => ({
      ok: true,
    }));

    expect(result.id).toBeGreaterThan(0);
    expect(result.platform).toBe("youtube");
    expect(result.capabilityName).toBe("api-connectivity");
    expect(result.probeResult).toBe("success");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);

    const [row] = await db
      .select()
      .from(platformCapabilityProbes)
      .where(eq(platformCapabilityProbes.id, result.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row.probeResult).toBe("success");
  });

  it("should record failure when probe function returns not ok", async () => {
    const { probeCapability } = await import("../capability-probe");

    const result = await probeCapability("youtube", "upload-api", async () => ({
      ok: false,
      error: "API quota exceeded",
    }));

    expect(result.probeResult).toBe("failure");
    expect(result.errorMessage).toBe("API quota exceeded");
  });
});
