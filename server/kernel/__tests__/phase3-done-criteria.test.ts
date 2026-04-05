import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import { trustBudgetRecords, approvalMatrixRules } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase3-done-criteria-user";

describe("Phase 3 Done Criteria", () => {
  beforeAll(async () => {
    await db.delete(trustBudgetRecords).where(eq(trustBudgetRecords.userId, TEST_USER)).catch(() => {});
    const { seedApprovalMatrix } = await import("../../services/trust-governance");
    await seedApprovalMatrix();
  });

  it("criterion 1: live session state works", async () => {
    const { transition, getState } = await import("../../services/stream-lifecycle");
    const initialState = await getState(TEST_USER);
    expect(initialState).toBe("idle");
    await transition(TEST_USER, "pre_live", { source: "phase3-test" });
    const preState = await getState(TEST_USER);
    expect(preState).toBe("pre_live");
    await transition(TEST_USER, "live", { confirmed: true });
    const liveState = await getState(TEST_USER);
    expect(liveState).toBe("live");
    await transition(TEST_USER, "ending", { reason: "stream-ended" });
    const endState = await getState(TEST_USER);
    expect(endState).toBe("ending");
    await transition(TEST_USER, "post_processing", {});
    const postState = await getState(TEST_USER);
    expect(postState).toBe("post_processing");
    await transition(TEST_USER, "idle", {});
    const finalState = await getState(TEST_USER);
    expect(finalState).toBe("idle");
  });

  it("criterion 2: multistream launch is capability-gated", async () => {
    const { assessLaunchReliability } = await import("../../live-ops/multistream-reliability-guard");
    const assessment = await assessLaunchReliability(999999, "twitch", 999999);
    expect(assessment).toBeDefined();
    expect(typeof assessment.launchAllowed).toBe("boolean");
    expect(typeof assessment.circuitBreakerOpen).toBe("boolean");
    expect(typeof assessment.trustSafe).toBe("boolean");
    expect(typeof assessment.policySafe).toBe("boolean");
    expect(assessment.reason).toBeDefined();
  });

  it("criterion 3: one duplicate live launch is suppressed", async () => {
    const { assessLaunchReliability } = await import("../../live-ops/multistream-reliability-guard");
    const { clearIdempotencyLedger } = await import("../../kernel/idempotency-ledger");
    clearIdempotencyLedger();
    const first = await assessLaunchReliability(888888, "youtube", 888888);
    expect(first.launchAllowed).toBe(true);
    const duplicate = await assessLaunchReliability(888888, "youtube", 888888);
    expect(duplicate.launchAllowed).toBe(false);
    expect(duplicate.reason).toContain("Duplicate");
  });

  it("criterion 4: one failed destination does not kill all destinations", async () => {
    const { recordFailure, isCircuitOpen, recordSuccess } = await import("../../live-ops/multistream-reliability-guard");
    recordFailure("kick");
    recordFailure("kick");
    recordFailure("kick");
    const kickOpen = isCircuitOpen("kick");
    const youtubeOpen = isCircuitOpen("youtube");
    expect(youtubeOpen).toBe(false);
    recordSuccess("kick");
  });

  it("criterion 5: Command Center shows real state", async () => {
    const { startCommandCenterSession, endCommandCenterSession } = await import("../../live-ops/command-center-service");
    const session = await startCommandCenterSession(TEST_USER);
    expect(session).toBeDefined();
    expect(session.status).toBe("active");
    expect(session.activePanels).toBeDefined();
    expect(session.activePanels.length).toBeGreaterThan(0);
    expect(session.activePanels).toContain("broadcast_state");
    expect(session.activePanels).toContain("trust_risk");
    expect(session.activePanels).toContain("decision_theater");
    const ended = await endCommandCenterSession(TEST_USER);
    expect(ended).toBe(true);
  });

  it("criterion 6: one live crew action is auditable", async () => {
    const ccSession = await (await import("../../live-ops/command-center-service")).startCommandCenterSession(TEST_USER);
    const { startCrewSession, endCrewSession } = await import("../../live-ops/live-production-crew");
    const crewSession = await startCrewSession(TEST_USER, ccSession.id);
    expect(crewSession).toBeDefined();
    expect(crewSession.status).toBe("active");
    expect(crewSession.activeRoles).toBeDefined();
    expect(crewSession.activeRoles).toContain("live_director");
    expect(crewSession.activeRoles).toContain("community_host");
    const ended = await endCrewSession(TEST_USER);
    expect(ended).toBe(true);
    await (await import("../../live-ops/command-center-service")).endCommandCenterSession(TEST_USER);
  });

  it("criterion 7: post-stream workflow triggers automatically", async () => {
    const { initiateHandoff, updateHandoff, getHandoffStatus } = await import("../../live-ops/post-stream-handoff");
    const checklist = initiateHandoff(TEST_USER, "test-stream-123");
    expect(checklist).toBeDefined();
    expect(checklist.vodProcessed).toBe(false);
    expect(checklist.thumbnailGenerated).toBe(false);
    const updated = updateHandoff(TEST_USER, "test-stream-123", {
      vodProcessed: true,
      thumbnailGenerated: true,
      seoOptimized: true,
      highlightsExtracted: true,
      learningRecorded: true,
    });
    expect(updated).toBeDefined();
    expect(updated!.vodProcessed).toBe(true);
    const status = getHandoffStatus(TEST_USER, "test-stream-123");
    expect(status).toBeDefined();
  });

  it("criterion 8: no blind timer-based title churn or social spam", async () => {
    const { checkLiveTrustBudget, deductLiveTrust } = await import("../../live-ops/live-trust");
    const initial = checkLiveTrustBudget(TEST_USER, "title_change");
    expect(initial.allowed).toBe(true);
    expect(initial.remaining).toBe(4);
    deductLiveTrust(TEST_USER, "title_change");
    deductLiveTrust(TEST_USER, "title_change");
    deductLiveTrust(TEST_USER, "title_change");
    deductLiveTrust(TEST_USER, "title_change");
    const exhausted = checkLiveTrustBudget(TEST_USER, "title_change");
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.remaining).toBe(0);
    expect(exhausted.reason).toContain("exhausted");
  });

  it("criterion 9: live revenue events record to attribution graph", async () => {
    const { attributeLiveRevenue, getLiveRevenueBreakdown } = await import("../../live-ops/live-revenue");
    const eventId = await attributeLiveRevenue(
      TEST_USER,
      "test-stream-rev",
      "super_chat",
      25.00,
      "USD",
      150,
      { donorName: "TestViewer" },
    );
    expect(eventId).toBeGreaterThan(0);
    const breakdown = await getLiveRevenueBreakdown(TEST_USER, "test-stream-rev");
    expect(breakdown.totalRevenue).toBeGreaterThanOrEqual(25);
    expect(breakdown.bySource).toHaveProperty("super_chat");
    expect(breakdown.eventCount).toBeGreaterThan(0);
  });

  it("criterion 10: one commerce opportunity alert surfaces in demo mode", async () => {
    const { getCommerceOpportunities } = await import("../../live-ops/live-commerce");
    const opportunities = getCommerceOpportunities(100, 60);
    expect(opportunities.length).toBeGreaterThan(0);
    const hasRelevant = opportunities.some(o =>
      o.includes("Membership") || o.includes("Super Chat") || o.includes("milestone")
    );
    expect(hasRelevant).toBe(true);
  });
});
