import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import { contentAtoms, replayFactoryJobs, trustBudgetRecords, approvalMatrixRules } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase2-done-criteria-user";

async function resetTestData() {
  await db.delete(trustBudgetRecords).where(eq(trustBudgetRecords.userId, TEST_USER)).catch(() => {});
}

describe("Phase 2 Done Criteria", () => {
  beforeAll(async () => {
    await resetTestData();
    const { seedApprovalMatrix } = await import("../../services/trust-governance");
    await seedApprovalMatrix();
  });

  it("criterion 1: YouTube can connect or mock-connect", async () => {
    const yt = await import("../../youtube");
    expect(typeof yt.getAuthUrl).toBe("function");
    expect(typeof yt.handleCallback).toBe("function");
    expect(typeof yt.fetchYouTubeVideos).toBe("function");
    const url = yt.getAuthUrl("test-state");
    expect(url).toContain("accounts.google.com");
  });

  it("criterion 2: replay workflow runs", async () => {
    const { createReplay, completeReplay, listReplays } = await import("../../content/replay-factory");
    const replayId = await createReplay(TEST_USER, "highlight-reel", undefined, { format: "shorts" });
    expect(replayId).toBeGreaterThan(0);
    const completed = await completeReplay(replayId, { outputUrl: "test://output.mp4" });
    expect(completed).toBe(true);
    const replays = await listReplays(TEST_USER, { status: "completed", limit: 1 });
    expect(replays.length).toBeGreaterThan(0);
    expect(replays[0].result).toHaveProperty("outputUrl");
  });

  it("criterion 3: semantic dedupe runs before publish", async () => {
    const { checkAuthenticity, semanticDedup } = await import("../../content/authenticity-gate");
    const crypto = await import("crypto");
    const title = `Phase2 Dedup Test ${Date.now()}`;
    const body = "Walkthrough gameplay content for dedup testing";
    const normalized = (title + body).toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const words = normalized.split(" ").sort();
    const fingerprint = crypto.createHash("sha256").update(words.join(" ")).digest("hex").slice(0, 16);
    await db.insert(contentAtoms).values({
      userId: TEST_USER,
      atomType: "video",
      title,
      body,
      fingerprint,
      metadata: {},
      provenance: {},
    });
    const isDup = await semanticDedup(TEST_USER, title, body);
    expect(isDup).toBe(true);
    const check = await checkAuthenticity(TEST_USER, { title, body, atomType: "video" });
    expect(check.isDuplicate).toBe(true);
    expect(check.passed).toBe(false);
  });

  it("criterion 4: confidence routing downgrades at least one output", async () => {
    const { routeByConfidence } = await import("../../kernel/confidence-router");
    const lowConfidenceResult = await routeByConfidence(TEST_USER, {
      agentName: "test-agent",
      actionType: "publish-video",
      payload: { videoId: "test-123" },
      confidence: 0.3,
      evidence: [{ type: "test", value: "low-confidence" }],
      risk: "medium",
    });
    expect(lowConfidenceResult.band).not.toBe("GREEN");
    expect(lowConfidenceResult.autoApproved).toBe(false);
  });

  it("criterion 5: Pre-Creation Oracle produces one scored recommendation", async () => {
    const { predictPerformance, getOracleRecommendation } = await import("../../content/pre-creation-oracle");
    const prediction = predictPerformance(TEST_USER, {
      title: "God of War Ragnarok Full Walkthrough Part 1 - No Commentary PS5 4K",
      description: "Complete walkthrough of God of War Ragnarok on PS5 with no commentary. All collectibles and boss fights included.",
      tags: ["god of war", "ps5", "walkthrough", "no commentary", "4k"],
      gameTitle: "God of War Ragnarok",
    });
    expect(prediction.overallScore).toBeGreaterThan(0);
    expect(prediction.overallScore).toBeLessThanOrEqual(1);
    expect(prediction.goNoGo).toBeDefined();
    expect(["go", "caution", "no-go"]).toContain(prediction.goNoGo);
    const recommendation = getOracleRecommendation(prediction);
    expect(recommendation.length).toBeGreaterThan(0);
  });

  it("criterion 6: one asset gets a beat map", async () => {
    const { analyzeBeatMap } = await import("../../retention-beats-engine");
    const retentionCurve = [0.95, 0.85, 0.70, 0.65, 0.55, 0.45, 0.35, 0.40, 0.50, 0.60, 0.55, 0.30];
    const analysis = analyzeBeatMap("walkthrough", 720, retentionCurve);
    expect(analysis.segments.length).toBe(12);
    expect(analysis.segments[0].segmentType).toBe("hook");
    expect(analysis.overallPacingScore).toBeGreaterThan(0);
    expect(analysis.benchmarkFamily).toBe("walkthrough");
    expect(analysis.videoType).toBe("walkthrough");
  });

  it("criterion 7: one asset gets detected video type", async () => {
    const { detectVideoType } = await import("../../content/video-type-detection");
    const result = detectVideoType(
      "God of War Ragnarok Full Walkthrough Part 1 - No Commentary",
      "Complete walkthrough of the entire game",
      ["walkthrough", "ps5", "no commentary"],
      3600,
    );
    expect(result.detectedType).toBe("walkthrough");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("criterion 8: one asset gets detected niche benchmark family", async () => {
    const { detectVideoType, getNicheBenchmarkFamily } = await import("../../content/video-type-detection");
    const result = detectVideoType(
      "Best Boss Fights Compilation",
      "All boss fight highlights",
      ["boss fight", "montage"],
    );
    const family = getNicheBenchmarkFamily(result.detectedType);
    expect(family).toBeDefined();
    expect(family.length).toBeGreaterThan(0);
  });

  it("criterion 9: one dead zone is detected", async () => {
    const { analyzeBeatMap } = await import("../../retention-beats-engine");
    const retentionCurve = [0.90, 0.80, 0.70, 0.25, 0.20, 0.22, 0.18, 0.60, 0.55, 0.50];
    const analysis = analyzeBeatMap("review", 600, retentionCurve);
    expect(analysis.deadZones.length).toBeGreaterThan(0);
    expect(analysis.deadZones[0].reason).toBeDefined();
    expect(analysis.deadZones[0].suggestedFix).toBeDefined();
    expect(["low", "medium", "high"]).toContain(analysis.deadZones[0].severity);
  });

  it("criterion 10: one pacing adjustment is recommended or applied", async () => {
    const { analyzeBeatMap } = await import("../../retention-beats-engine");
    const retentionCurve = [0.40, 0.35, 0.30, 0.25, 0.20, 0.18, 0.15, 0.12, 0.10, 0.08];
    const analysis = analyzeBeatMap("walkthrough", 900, retentionCurve);
    expect(analysis.pacingRecommendations.length).toBeGreaterThan(0);
    const rec = analysis.pacingRecommendations[0];
    expect(["insert-hook", "cut-segment", "add-transition", "shorten", "reorder"]).toContain(rec.type);
    expect(rec.reason.length).toBeGreaterThan(0);
  });

  it("criterion 11: Decision Theater explains pacing change", async () => {
    const { recordDecision } = await import("../../kernel/decision-theater");
    const decisionId = await recordDecision(TEST_USER, {
      agentName: "retention-beats-engine",
      actionType: "pacing-adjustment",
      evidence: [
        { type: "dead-zone", startTime: 180, endTime: 300, severity: "high" },
        { type: "benchmark", family: "walkthrough", targetRetention: 0.52 },
      ],
      confidence: 0.78,
      risk: "low",
      signalCount: 2,
      recency: Date.now(),
      reasoning: {
        method: "beat-map-analysis",
        whatChanged: "Recommended cutting dead zone at 3:00-5:00",
        whyChanged: "Retention dropped below 25% for 120s — exceeds walkthrough max valley threshold",
        benchmarkUsed: "walkthrough pacing benchmark",
      },
    });
    expect(decisionId).toBeGreaterThan(0);
  });

  it("criterion 12: AI disclosure surfaces one requirement", async () => {
    const { generateDisclosure, checkDisclosureCompliance } = await import("../../content/ai-disclosure");
    const disclosure = generateDisclosure({
      isAiGenerated: false,
      aiComponents: ["thumbnail", "description", "tags"],
      platform: "youtube",
    });
    expect(disclosure.required).toBe(true);
    expect(disclosure.disclosureText).toContain("AI");
    expect(disclosure.reason).toContain("thumbnail");

    const compliance = checkDisclosureCompliance(
      "Check out this awesome gameplay video",
      ["thumbnail", "description"],
    );
    expect(compliance.compliant).toBe(false);
    expect(compliance.missingDisclosures.length).toBeGreaterThan(0);
  });

  it("criterion 13: subtitle gap report renders", async () => {
    const { generateSubtitles, analyzeSubtitleGaps } = await import("../../content/subtitle-intelligence");
    const moments = [
      { timestamp: 0, duration: 5, description: "Opening scene" },
      { timestamp: 10, duration: 3, description: "First encounter" },
      { timestamp: 30, duration: 4, description: "Boss appears" },
    ];
    const subtitles = generateSubtitles(moments, "en");
    const gapReport = analyzeSubtitleGaps(subtitles, 60, ["en", "es"]);
    expect(gapReport.totalDuration).toBe(60);
    expect(gapReport.coveragePercent).toBeLessThan(100);
    expect(gapReport.gaps.length).toBeGreaterThan(0);
    expect(gapReport.missingLanguages).toContain("es");
    expect(gapReport.languages).toContain("en");
  });

  it("criterion 14: leakage detector identifies one signal", async () => {
    const { detectLeakage, getLeakageReport } = await import("../../content/revenue-leakage");
    const detectionId = await detectLeakage(
      TEST_USER,
      "missing-end-screen",
      "youtube-analytics",
      "Video has no end screen configured — losing potential click-through revenue",
      15.50,
    );
    expect(detectionId).toBeGreaterThan(0);
    const report = await getLeakageReport(TEST_USER);
    expect(report.count).toBeGreaterThan(0);
    expect(report.totalEstimatedLoss).toBeGreaterThan(0);
    expect(report.detections[0].leakageType).toBe("missing-end-screen");
  });
});
