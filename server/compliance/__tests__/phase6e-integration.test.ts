import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import {
  learningSignals,
  learningMaturityScores,
  narrativePromises,
  licensingExchangeAssets,
  signalContradictions,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "test-phase6e-user";

describe("Phase 6E: Learning Governance & Signal Intelligence", () => {
  beforeAll(async () => {
    const { seedApprovalMatrix } = await import("../../services/trust-governance");
    await seedApprovalMatrix();
  });

  describe("Signal Decay Engine", () => {
    it("should compute decay factor based on half-life", async () => {
      const { computeDecayFactor, getSignalHalfLife } = await import("../../services/learning-governance");

      const halfLife = getSignalHalfLife("engagement");
      expect(halfLife).toBe(7 * 24 * 60 * 60 * 1000);

      const atHalfLife = computeDecayFactor(halfLife, "engagement");
      expect(atHalfLife).toBeCloseTo(0.5, 2);

      const fresh = computeDecayFactor(0, "engagement");
      expect(fresh).toBe(1);

      const twoHalfLives = computeDecayFactor(halfLife * 2, "engagement");
      expect(twoHalfLives).toBeCloseTo(0.25, 2);
    });

    it("should have different half-lives per category", async () => {
      const { getSignalHalfLife } = await import("../../services/learning-governance");

      const engagement = getSignalHalfLife("engagement");
      const revenue = getSignalHalfLife("revenue");
      const content = getSignalHalfLife("content");

      expect(engagement).toBeLessThan(content);
      expect(content).toBeLessThan(revenue);
    });

    it("should allow runtime half-life configuration", async () => {
      const { getSignalHalfLife, setSignalHalfLife } = await import("../../services/learning-governance");

      const original = getSignalHalfLife("engagement");
      setSignalHalfLife("engagement", 3 * 24 * 60 * 60 * 1000);
      expect(getSignalHalfLife("engagement")).toBe(3 * 24 * 60 * 60 * 1000);

      setSignalHalfLife("engagement", original);
    });

    it("should return decayed signals with freshness", async () => {
      const { ingestLearningSignal, getDecayedSignals } = await import("../../services/learning-governance");

      await ingestLearningSignal(TEST_USER, "content", "video_performance", { views: 1000 }, 0.8, "test-agent");

      const signals = await getDecayedSignals(TEST_USER, "content");
      expect(signals.length).toBeGreaterThan(0);

      const recent = signals[0];
      expect(recent.decayFactor).toBeGreaterThan(0.9);
      expect(recent.fresh).toBe(true);
      expect(recent.rawConfidence).toBe(0.8);
      expect(recent.decayedConfidence).toBeGreaterThan(0);
    });
  });

  describe("Learning Governance Enforcement", () => {
    it("should reject signals without provenance", async () => {
      const { ingestLearningSignal } = await import("../../services/learning-governance");

      await expect(
        ingestLearningSignal(TEST_USER, "content", "test", {}, 0.8, "")
      ).rejects.toThrow("Source agent provenance is required");
    });

    it("should reject invalid confidence bounds", async () => {
      const { ingestLearningSignal } = await import("../../services/learning-governance");

      await expect(
        ingestLearningSignal(TEST_USER, "content", "test", {}, 1.5, "agent")
      ).rejects.toThrow("Confidence must be between 0 and 1");

      await expect(
        ingestLearningSignal(TEST_USER, "content", "test", {}, -0.1, "agent")
      ).rejects.toThrow("Confidence must be between 0 and 1");
    });

    it("should reject signals without category or type", async () => {
      const { ingestLearningSignal } = await import("../../services/learning-governance");

      await expect(
        ingestLearningSignal(TEST_USER, "", "test", {}, 0.8, "agent")
      ).rejects.toThrow("Category and signalType are required");
    });

    it("should store governed signals with full provenance", async () => {
      const { ingestLearningSignal } = await import("../../services/learning-governance");

      const result = await ingestLearningSignal(
        TEST_USER, "revenue", "ad_revenue_signal", { amount: 500 }, 0.9, "revenue-tracker", "GREEN", 10
      );

      expect(result.signalId).toBeGreaterThan(0);
      expect(result.governed).toBe(true);
      expect(typeof result.contradictions).toBe("number");

      const [signal] = await db.select().from(learningSignals)
        .where(eq(learningSignals.id, result.signalId));
      expect(signal.sourceAgent).toBe("revenue-tracker");
      expect(signal.confidence).toBe(0.9);
      expect(signal.sampleSize).toBe(10);
      expect(signal.bandClass).toBe("GREEN");
    });
  });

  describe("Learning Maturity Score", () => {
    it("should compute maturity score from signal volume, freshness, consistency", async () => {
      const { computeMaturityScore } = await import("../../services/learning-governance");

      const nascent = computeMaturityScore(2, 0.3, 0.5, 0.5);
      expect(nascent).toBeLessThan(40);

      const developing = computeMaturityScore(15, 0.7, 0.1, 0.8);
      expect(developing).toBeGreaterThanOrEqual(40);

      const mature = computeMaturityScore(30, 0.95, 0, 0.95);
      expect(mature).toBeGreaterThanOrEqual(70);
    });

    it("should update maturity per domain after signal ingestion", async () => {
      const { ingestLearningSignal, getMaturityScores } = await import("../../services/learning-governance");

      for (let i = 0; i < 5; i++) {
        await ingestLearningSignal(TEST_USER, "audience", `engagement_${i}`, { rate: 0.1 * i }, 0.8, "audience-agent");
      }

      const scores = await getMaturityScores(TEST_USER);
      expect(scores.audience).toBeDefined();
      expect(scores.audience.signalCount).toBeGreaterThanOrEqual(5);
      expect(typeof scores.audience.score).toBe("number");
      expect(["nascent", "developing", "mature"]).toContain(scores.audience.maturityLevel);
    });

    it("should affect governed confidence based on maturity", async () => {
      const { computeGovernedConfidence } = await import("../../services/learning-governance");

      const highMaturity = computeGovernedConfidence(0.9, 80, 1.0, 0);
      const lowMaturity = computeGovernedConfidence(0.9, 20, 1.0, 0);
      expect(highMaturity).toBeGreaterThan(lowMaturity);

      const withContradiction = computeGovernedConfidence(0.9, 80, 1.0, 0.3);
      expect(withContradiction).toBeLessThan(highMaturity);
    });

    it("should return governed confidence for a domain", async () => {
      const { getGovernedConfidenceForDomain } = await import("../../services/learning-governance");

      const result = await getGovernedConfidenceForDomain(TEST_USER, "audience");
      expect(typeof result.confidence).toBe("number");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.maturityScore).toBe("number");
      expect(typeof result.signalCount).toBe("number");
      expect(typeof result.freshSignalCount).toBe("number");
      expect(typeof result.contradictionCount).toBe("number");
      expect(["nascent", "developing", "mature"]).toContain(result.maturityLevel);
    });
  });

  describe("Contradiction Detection", () => {
    it("should detect contradicting signals", async () => {
      const { ingestLearningSignal, getOpenContradictions } = await import("../../services/learning-governance");

      await ingestLearningSignal(TEST_USER, "content", "increase_frequency", { target: "daily" }, 0.8, "growth-agent");
      const result = await ingestLearningSignal(TEST_USER, "content", "burnout_risk", { level: "high" }, 0.7, "health-agent");

      expect(result.contradictions).toBeGreaterThan(0);

      const contradictions = await getOpenContradictions(TEST_USER, "content");
      expect(contradictions.length).toBeGreaterThan(0);

      const c = contradictions[0];
      expect(c.description).toBeTruthy();
      expect(["high", "medium"]).toContain(c.severity);
    });

    it("should resolve contradictions", async () => {
      const { getOpenContradictions, resolveContradiction } = await import("../../services/learning-governance");

      const contradictions = await getOpenContradictions(TEST_USER, "content");
      if (contradictions.length > 0) {
        const resolved = await resolveContradiction(contradictions[0].id, "Prioritizing health — reducing frequency");
        expect(resolved).toBe(true);

        const [updated] = await db.select().from(signalContradictions)
          .where(eq(signalContradictions.id, contradictions[0].id));
        expect(updated.status).toBe("resolved");
        expect(updated.resolution).toBe("Prioritizing health — reducing frequency");
      }
    });

    it("should not flag contradictions for decayed signals", async () => {
      const { detectContradictions } = await import("../../services/learning-governance");

      const contradictions = await detectContradictions(
        "test-decay-user", "content", 99999, "increase_frequency", {}
      );
      expect(contradictions.length).toBe(0);
    });
  });

  describe("Narrative Promise Tracker", () => {
    let promiseId: number;

    it("should create narrative promises", async () => {
      const { createNarrativePromise } = await import("../../services/learning-governance");

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 5);

      promiseId = await createNarrativePromise(
        TEST_USER,
        "series",
        "Complete Dark Souls walkthrough series",
        "10-episode walkthrough series",
        deadline,
        { totalEpisodes: 10 }
      );

      expect(promiseId).toBeGreaterThan(0);

      const [promise] = await db.select().from(narrativePromises)
        .where(eq(narrativePromises.id, promiseId));
      expect(promise.promiseType).toBe("series");
      expect(promise.status).toBe("active");
      expect(promise.deliveryProgress).toBe(0);
    });

    it("should update promise progress", async () => {
      const { updatePromiseProgress } = await import("../../services/learning-governance");

      await updatePromiseProgress(promiseId, 0.3);

      const [promise] = await db.select().from(narrativePromises)
        .where(eq(narrativePromises.id, promiseId));
      expect(promise.deliveryProgress).toBe(0.3);
      expect(promise.riskLevel).toBe("high");
    });

    it("should detect at-risk promises near deadline with low progress", async () => {
      const { createNarrativePromise, checkAtRiskPromises } = await import("../../services/learning-governance");

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 2);
      await createNarrativePromise(TEST_USER, "schedule", "Weekly upload", "Upload every Sunday", deadline);

      const atRisk = await checkAtRiskPromises(TEST_USER);
      expect(atRisk.length).toBeGreaterThan(0);

      const risky = atRisk.find(p => p.promiseType === "schedule");
      expect(risky).toBeDefined();
      expect(risky!.daysUntilDeadline).toBeLessThanOrEqual(7);
    });

    it("should mark fulfilled promises", async () => {
      const { updatePromiseProgress } = await import("../../services/learning-governance");

      await updatePromiseProgress(promiseId, 1.0);

      const [promise] = await db.select().from(narrativePromises)
        .where(eq(narrativePromises.id, promiseId));
      expect(promise.status).toBe("fulfilled");
      expect(promise.riskLevel).toBe("low");
    });

    it("should list user promises by status", async () => {
      const { getUserPromises } = await import("../../services/learning-governance");

      const active = await getUserPromises(TEST_USER, "active");
      const fulfilled = await getUserPromises(TEST_USER, "fulfilled");
      const all = await getUserPromises(TEST_USER);

      expect(all.length).toBeGreaterThanOrEqual(active.length + fulfilled.length);
    });
  });

  describe("Override Learning Integration", () => {
    it("should record override as learning signal", async () => {
      const { recordOverrideLearning } = await import("../../services/learning-governance");

      const id = await recordOverrideLearning(
        TEST_USER,
        "content_schedule",
        { frequency: "daily" },
        { frequency: "3x_weekly" },
        "Avoiding burnout"
      );

      expect(id).toBeGreaterThan(0);
    });

    it("should detect override patterns and suggest adjustments", async () => {
      const { recordOverrideLearning, getOverridePatterns } = await import("../../services/learning-governance");

      for (let i = 0; i < 3; i++) {
        await recordOverrideLearning(
          TEST_USER,
          "content_title",
          { style: "clickbait" },
          { style: "descriptive" },
          "Prefer authentic titles"
        );
      }

      const patterns = await getOverridePatterns(TEST_USER);
      const titlePattern = patterns.find(p => p.actionType === "content_title");
      expect(titlePattern).toBeDefined();
      expect(titlePattern!.count).toBeGreaterThanOrEqual(3);
      expect(titlePattern!.suggestAutoAdjust).toBe(true);
    });
  });

  describe("Licensing Exchange Readiness", () => {
    let assetRecordId: number;

    it("should register licensing assets", async () => {
      const { registerLicensingAsset } = await import("../../services/learning-governance");

      assetRecordId = await registerLicensingAsset(
        TEST_USER,
        "video",
        "vid-001",
        "Dark Souls Boss Guide",
        { duration: "25:00", originalContent: true }
      );

      expect(assetRecordId).toBeGreaterThan(0);

      const [asset] = await db.select().from(licensingExchangeAssets)
        .where(eq(licensingExchangeAssets.id, assetRecordId));
      expect(asset.licensingStatus).toBe("unlicensed");
      expect(asset.rightsVerified).toBe(false);
      expect(asset.readinessScore).toBe(0);
    });

    it("should update licensing status and compute readiness", async () => {
      const { updateLicensingStatus } = await import("../../services/learning-governance");

      await updateLicensingStatus(assetRecordId, "fully_licensed", true);

      const [asset] = await db.select().from(licensingExchangeAssets)
        .where(eq(licensingExchangeAssets.id, assetRecordId));
      expect(asset.licensingStatus).toBe("fully_licensed");
      expect(asset.rightsVerified).toBe(true);
      expect(asset.readinessScore).toBe(100);
    });

    it("should compute overall licensing readiness", async () => {
      const { registerLicensingAsset, updateLicensingStatus, getLicensingReadiness } = await import("../../services/learning-governance");

      const id2 = await registerLicensingAsset(TEST_USER, "video", "vid-002", "Elden Ring Guide");
      await updateLicensingStatus(id2, "partially_licensed", false);

      const readiness = await getLicensingReadiness(TEST_USER);
      expect(readiness.totalAssets).toBeGreaterThanOrEqual(2);
      expect(typeof readiness.avgReadinessScore).toBe("number");
      expect(typeof readiness.exchangeReady).toBe("boolean");
      expect(readiness.byStatus).toBeDefined();
    });
  });

  describe("End-to-End Governance Flow", () => {
    it("should enforce governance across the full signal lifecycle", async () => {
      const {
        ingestLearningSignal,
        getDecayedSignals,
        getGovernedConfidenceForDomain,
      } = await import("../../services/learning-governance");

      const result1 = await ingestLearningSignal(
        TEST_USER, "distribution", "platform_reach", { views: 5000 }, 0.85, "dist-agent"
      );
      expect(result1.governed).toBe(true);

      const result2 = await ingestLearningSignal(
        TEST_USER, "distribution", "click_performance", { ctr: 0.05 }, 0.75, "dist-agent"
      );
      expect(result2.governed).toBe(true);

      const signals = await getDecayedSignals(TEST_USER, "distribution");
      expect(signals.length).toBeGreaterThanOrEqual(2);
      for (const s of signals) {
        expect(s.decayFactor).toBeGreaterThan(0);
        expect(s.decayedConfidence).toBeGreaterThan(0);
      }

      const governed = await getGovernedConfidenceForDomain(TEST_USER, "distribution");
      expect(governed.confidence).toBeGreaterThan(0);
      expect(governed.maturityLevel).toBeDefined();
    });
  });
});
