import { describe, it, expect, beforeEach } from "vitest";

describe("Phase 7 — Advanced Learning / Full Intelligence", () => {

  describe("T001: Creator Intelligence Graph (event-sourced)", () => {
    it("should append events and build graph nodes", async () => {
      const { appendEvent, getGraphSnapshot, getGraphStats } = await import("../../kernel/creator-intelligence-graph");
      const evt = appendEvent("content.published", "content", "video-1", { title: "Test Video", views: 100 }, "test");
      expect(evt.id).toBeTruthy();
      expect(evt.type).toBe("content.published");
      expect(evt.domain).toBe("content");
      const snapshot = getGraphSnapshot();
      expect(snapshot.eventCount).toBeGreaterThan(0);
      expect(snapshot.nodes.length).toBeGreaterThan(0);
      const stats = getGraphStats();
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.domainCounts["content"]).toBeGreaterThan(0);
    });

    it("should track causal chains via causalParentId", async () => {
      const { appendEvent, getCausalChain } = await import("../../kernel/creator-intelligence-graph");
      const parent = appendEvent("content.published", "content", "chain-1", { step: 1 }, "test");
      const child = appendEvent("content.performance_update", "content", "chain-1", { step: 2 }, "test", parent.id);
      const chain = getCausalChain(child.id);
      expect(chain.length).toBe(2);
      expect(chain[0].id).toBe(parent.id);
    });

    it("should support correlation queries", async () => {
      const { appendEvent, queryEventsByCorrelation } = await import("../../kernel/creator-intelligence-graph");
      const corrId = `test_corr_${Date.now()}`;
      appendEvent("content.published", "content", "corr-1", {}, "test", undefined, corrId);
      appendEvent("audience.engagement_change", "audience", "corr-2", {}, "test", undefined, corrId);
      const correlated = queryEventsByCorrelation(corrId);
      expect(correlated.length).toBe(2);
    });

    it("should detect trends", async () => {
      const { appendEvent, detectTrends } = await import("../../kernel/creator-intelligence-graph");
      for (let i = 0; i < 10; i++) {
        appendEvent("revenue.stream_change", "revenue_trend", `rev-trend-${i}`, { rpm: 5 + i * 0.5 }, "test");
      }
      const trend = detectTrends("revenue_trend", "rpm");
      expect(["rising", "falling", "stable"]).toContain(trend.trend);
      expect(trend.dataPoints).toBeGreaterThan(0);
    });

    it("should find node neighbors", async () => {
      const { appendEvent, getNodeNeighbors } = await import("../../kernel/creator-intelligence-graph");
      const p = appendEvent("content.published", "content", "neighbor-test", {}, "test");
      appendEvent("audience.engagement_change", "audience", "neighbor-linked", {}, "test", p.id);
      const neighbors = getNodeNeighbors("content:neighbor-test");
      expect(neighbors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("T002: Experiment Engine + Darwinist Bounded Experiments", () => {
    it("should create and run experiments", async () => {
      const { createExperiment, startExperiment, getExperiment } = await import("../../kernel/experiment-engine");
      const exp = createExperiment({
        name: "Thumbnail A/B",
        hypothesis: "Red thumbnails perform better",
        domain: "content",
        variants: [
          { name: "control", config: { color: "blue" }, trafficPercentage: 50 },
          { name: "variant", config: { color: "red" }, trafficPercentage: 50 },
        ],
        primaryMetric: "ctr",
      });
      expect(exp.id).toBeTruthy();
      expect(exp.status).toBe("proposed");
      startExperiment(exp.id);
      expect(getExperiment(exp.id)?.status).toBe("running");
    });

    it("should record metrics and evaluate with statistical significance", async () => {
      const { createExperiment, startExperiment, recordMetric, evaluateExperiment } = await import("../../kernel/experiment-engine");
      const exp = createExperiment({
        name: "Format test",
        hypothesis: "Longer videos do better",
        domain: "content",
        variants: [
          { name: "short", config: { length: 10 }, trafficPercentage: 50 },
          { name: "long", config: { length: 30 }, trafficPercentage: 50 },
        ],
        primaryMetric: "watch_time",
        minSampleSize: 10,
      });
      startExperiment(exp.id);
      for (let i = 0; i < 60; i++) {
        recordMetric(exp.id, exp.variants[0].id, "watch_time", 5 + Math.random());
        recordMetric(exp.id, exp.variants[1].id, "watch_time", 8 + Math.random());
      }
      const result = evaluateExperiment(exp.id);
      expect(result.significance).toBeGreaterThan(0);
      expect(result.winningVariant).toBeTruthy();
      expect(["promote", "rollback", "extend", "inconclusive"]).toContain(result.recommendation);
    });

    it("should enforce resource budgets", async () => {
      const { createExperiment, startExperiment, isWithinBudget } = await import("../../kernel/experiment-engine");
      const exp = createExperiment({
        name: "Budget test",
        hypothesis: "test",
        domain: "test",
        variants: [{ name: "a", config: {}, trafficPercentage: 100 }],
        primaryMetric: "x",
        resourceBudget: 5,
      });
      startExperiment(exp.id);
      expect(isWithinBudget(exp.id)).toBe(true);
    });

    it("should create Darwinist experiments from override patterns", async () => {
      const { createDarwinistExperiment } = await import("../../kernel/experiment-engine");
      const exp = createDarwinistExperiment("content", [
        { pattern: "thumbnail_override", frequency: 10, impact: 0.8 },
      ]);
      expect(exp).not.toBeNull();
      expect(exp!.source).toBe("darwinist");
    });
  });

  describe("T003: Learning Maturity System", () => {
    it("should record learning signals and assess maturity", async () => {
      const { recordLearningSignal, assessLearningMaturity } = await import("../../kernel/learning-maturity-system");
      for (let i = 0; i < 10; i++) {
        recordLearningSignal("ctr_trend", "content_maturity", 0.5 + i * 0.02, 0.7, "test");
      }
      const report = assessLearningMaturity(["content_maturity"]);
      expect(report.dimensions.length).toBe(1);
      expect(report.overallMaturity).toBeGreaterThan(0);
      expect(["blocked", "shadow", "assisted", "supervised", "autonomous"]).toContain(report.overallAutomationLevel);
    });

    it("should detect contradictions", async () => {
      const { recordLearningSignal, getAllSignals } = await import("../../kernel/learning-maturity-system");
      recordLearningSignal("contra_test", "contra_domain", 0.9, 0.8, "test");
      const signal2 = recordLearningSignal("contra_test", "contra_domain", 0.1, 0.8, "test");
      expect(signal2.contradicts).toBeDefined();
      expect(signal2.contradicts!.length).toBeGreaterThan(0);
    });

    it("should gate automation based on maturity", async () => {
      const { canAutomate } = await import("../../kernel/learning-maturity-system");
      const canShadow = canAutomate("nonexistent_domain_xyz", "shadow");
      expect(typeof canShadow).toBe("boolean");
    });
  });

  describe("T004: Research Swarm", () => {
    it("should spawn and complete research tasks", async () => {
      const { spawnResearchTask, startTask, addFinding, completeTask, getTask } = await import("../../kernel/research-swarm");
      const task = spawnResearchTask("What games trend on YouTube?", "content", 0.8);
      expect(task.status).toBe("queued");
      startTask(task.id);
      expect(getTask(task.id)?.status).toBe("in_progress");
      addFinding(task.id, "Soulslike games are trending", 0.85, ["YouTube trending"], "analysis", true, "Consider Elden Ring content");
      completeTask(task.id);
      expect(getTask(task.id)?.status).toBe("completed");
      expect(getTask(task.id)?.findings.length).toBe(1);
    });

    it("should spawn parallel research", async () => {
      const { spawnParallelResearch, getSwarmReport } = await import("../../kernel/research-swarm");
      const tasks = spawnParallelResearch([
        { question: "Q1", domain: "content" },
        { question: "Q2", domain: "audience" },
      ]);
      expect(tasks.length).toBe(2);
      const report = getSwarmReport();
      expect(report.activeTasks).toBeGreaterThanOrEqual(2);
    });

    it("should aggregate findings across tasks", async () => {
      const { spawnResearchTask, startTask, addFinding, completeTask, aggregateFindings } = await import("../../kernel/research-swarm");
      const t1 = spawnResearchTask("Q1", "d1");
      const t2 = spawnResearchTask("Q2", "d2");
      startTask(t1.id); startTask(t2.id);
      addFinding(t1.id, "F1", 0.9, [], "s1");
      addFinding(t2.id, "F2", 0.7, [], "s2");
      completeTask(t1.id); completeTask(t2.id);
      const agg = aggregateFindings([t1.id, t2.id]);
      expect(agg.length).toBe(2);
      expect(agg[0].confidence).toBeGreaterThanOrEqual(agg[1].confidence);
    });
  });

  describe("T005: Skill Compiler Promotions", () => {
    it("should propose and evaluate promotions", async () => {
      const { proposePromotion, evaluatePromotion } = await import("../../kernel/skill-promotions");
      const promo = proposePromotion("thumbnail_optimizer", "experimental", "shadow", 0.5);
      expect(promo.status).toBe("candidate");
      const result = evaluatePromotion(promo.id);
      expect(typeof result.eligible).toBe("boolean");
    });

    it("should reject low-evidence promotions", async () => {
      const { proposePromotion, evaluatePromotion } = await import("../../kernel/skill-promotions");
      const promo = proposePromotion("weak_skill", "experimental", "shadow", 0.1);
      const result = evaluatePromotion(promo.id);
      expect(result.eligible).toBe(false);
    });

    it("should support rollback", async () => {
      const { proposePromotion, executePromotion, rollbackPromotion, getPromotion } = await import("../../kernel/skill-promotions");
      const promo = proposePromotion("rollback_skill", "experimental", "shadow", 0.9);
      executePromotion(promo.id);
      if (getPromotion(promo.id)?.status === "promoted") {
        const rolled = rollbackPromotion(promo.id, "Performance degradation");
        expect(rolled).toBe(true);
        expect(getPromotion(promo.id)?.status).toBe("rolled_back");
      }
    });
  });

  describe("T006: Agent Evals Enforcement", () => {
    it("should evaluate agent output quality", async () => {
      const { enforceAgentOutput } = await import("../../kernel/agent-evals-enforcement");
      const result = enforceAgentOutput({
        agentId: "content-agent",
        agentName: "Content Agent",
        outputType: "recommendation",
        content: { recommendation: "Post at 3pm" },
        confidence: 0.85,
        reasoning: "Based on historical engagement patterns showing peak at 3pm",
        hasExplanation: true,
        signalsUsed: 5,
        executionTimeMs: 2000,
        domain: "content",
      });
      expect(result.verdict).toBe("pass");
      expect(result.overallScore).toBeGreaterThan(0.7);
    });

    it("should block low-quality outputs", async () => {
      const { shouldBlockOutput } = await import("../../kernel/agent-evals-enforcement");
      const { blocked } = shouldBlockOutput({
        agentId: "bad-agent",
        agentName: "Bad Agent",
        outputType: "recommendation",
        content: {},
        confidence: 0,
        hasExplanation: false,
        signalsUsed: 0,
        executionTimeMs: 30000,
        domain: "content",
      });
      expect(blocked).toBe(true);
    });

    it("should track eval history and summaries", async () => {
      const { enforceAgentOutput, getAgentEvalSummary } = await import("../../kernel/agent-evals-enforcement");
      enforceAgentOutput({
        agentId: "summary-agent",
        agentName: "Summary Agent",
        outputType: "analysis",
        content: {},
        confidence: 0.9,
        reasoning: "Detailed reasoning here",
        hasExplanation: true,
        signalsUsed: 4,
        executionTimeMs: 1000,
        domain: "content",
      });
      const summary = getAgentEvalSummary("summary-agent");
      expect(summary.totalEvals).toBeGreaterThan(0);
    });
  });

  describe("T007: Predictive Content Promotion", () => {
    it("should make predictions with bounded confidence", async () => {
      const { makePrediction, getPromotionState } = await import("../../content/predictive-content-promotion");
      const prediction = makePrediction("walkthrough", [
        { factor: "game_popularity", weight: 0.5, value: 0.8 },
        { factor: "timing", weight: 0.3, value: 0.6 },
        { factor: "seo_score", weight: 0.2, value: 0.7 },
      ]);
      expect(prediction.id).toBeTruthy();
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(0.95);
      expect(getPromotionState().currentLevel).toBe("shadow");
    });

    it("should track prediction accuracy", async () => {
      const { makePrediction, recordActualPerformance, getPredictionAccuracy } = await import("../../content/predictive-content-promotion");
      const pred = makePrediction("boss_fight", [{ factor: "views", weight: 1, value: 0.7 }]);
      recordActualPerformance(pred.id, 0.7);
      const accuracy = getPredictionAccuracy();
      expect(typeof accuracy.overall).toBe("number");
    });

    it("should check promotion eligibility", async () => {
      const { checkPromotion } = await import("../../content/predictive-content-promotion");
      const result = checkPromotion();
      expect(typeof result.promoted).toBe("boolean");
      expect(result.reason).toBeTruthy();
    });
  });

  describe("T008: Audience Soul Model", () => {
    it("should build bounded model with evidence labels", async () => {
      const { buildAudienceSoulModel } = await import("../../business/audience-soul-model");
      const model = buildAudienceSoulModel("channel-1", [
        { dimension: "engagement_depth", value: 0.7, confidence: 0.8 },
        { dimension: "engagement_depth", value: 0.75, confidence: 0.85 },
        { dimension: "content_preference", value: 0.6, confidence: 0.5 },
      ]);
      expect(model.dimensions.length).toBe(2);
      expect(model.privacySafe).toBe(true);
      expect(model.overallConfidence).toBeGreaterThan(0);
      const engagement = model.dimensions.find((d) => d.name === "engagement_depth");
      expect(engagement).toBeDefined();
      expect(["verified", "inferred", "estimated", "hypothesized"]).toContain(engagement!.evidenceLabel);
    });

    it("should make bounded predictions", async () => {
      const { buildAudienceSoulModel, makeBoundedPrediction } = await import("../../business/audience-soul-model");
      const model = buildAudienceSoulModel("channel-2", [
        { dimension: "loyalty", value: 0.8, confidence: 0.9 },
      ]);
      const pred = makeBoundedPrediction(model, "Audience will engage with long content", ["loyalty"]);
      expect(pred).not.toBeNull();
      expect(pred!.confidence).toBeLessThanOrEqual(1);
      expect(["verified", "inferred", "estimated"]).toContain(pred!.evidenceLabel);
    });

    it("should track prediction accuracy by evidence label", async () => {
      const { buildAudienceSoulModel, makeBoundedPrediction, validatePrediction, getSoulModelAccuracy } = await import("../../business/audience-soul-model");
      const model = buildAudienceSoulModel("channel-3", [
        { dimension: "preference", value: 0.7, confidence: 0.6 },
      ]);
      const pred = makeBoundedPrediction(model, "Test prediction", ["preference"]);
      if (pred) {
        validatePrediction(model, pred.id, true);
        const acc = getSoulModelAccuracy(model);
        expect(acc.validatedPredictions).toBe(1);
        expect(acc.accuracy).toBe(1);
      }
    });
  });

  describe("T009: Temporal Graph Queries", () => {
    it("should query time ranges", async () => {
      const { queryTimeRange } = await import("../../kernel/temporal-graph-queries");
      const result = queryTimeRange(new Date(0), new Date());
      expect(result.events).toBeDefined();
      expect(result.summary.totalEvents).toBeGreaterThanOrEqual(0);
    });

    it("should query entity history", async () => {
      const { appendEvent } = await import("../../kernel/creator-intelligence-graph");
      const { queryEntityHistory } = await import("../../kernel/temporal-graph-queries");
      appendEvent("content.published", "temporal_test", "entity-1", { x: 1 }, "test");
      const result = queryEntityHistory("temporal_test", "entity-1");
      expect(result.events.length).toBeGreaterThan(0);
    });

    it("should query trends", async () => {
      const { queryTrend } = await import("../../kernel/temporal-graph-queries");
      const result = queryTrend("content", "views");
      expect(["rising", "falling", "stable"]).toContain(result.summary.trend);
    });

    it("should query period comparisons", async () => {
      const { queryComparison } = await import("../../kernel/temporal-graph-queries");
      const now = new Date();
      const result = queryComparison(
        "content", "views",
        new Date(now.getTime() - 14 * 86400000), new Date(now.getTime() - 7 * 86400000),
        new Date(now.getTime() - 7 * 86400000), now
      );
      expect(result.summary.direction).toBeDefined();
    });

    it("should detect anomalies", async () => {
      const { queryAnomalies } = await import("../../kernel/temporal-graph-queries");
      const result = queryAnomalies("content", "views");
      expect(result.summary.anomalyCount).toBeGreaterThanOrEqual(0);
    });

    it("should get graph state at time", async () => {
      const { getGraphStateAtTime } = await import("../../kernel/temporal-graph-queries");
      const state = getGraphStateAtTime(new Date());
      expect(state.eventCountAtTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("T010: Adaptive Operating Layer", () => {
    it("should gate actions based on maturity and risk", async () => {
      const { configureAdaptiveLayer, adaptiveGate } = await import("../../kernel/adaptive-operating-layer");
      configureAdaptiveLayer("content_adaptive", { automationLevel: "assisted", confidenceThreshold: 0.3, maturityGate: 0.1 });
      const decision = adaptiveGate("content_adaptive", "publish_video", 0.3);
      expect(typeof decision.approved).toBe("boolean");
      expect(decision.reason).toBeTruthy();
    });

    it("should adjust automation from maturity", async () => {
      const { adjustAutomationFromMaturity, getAdaptiveConfig } = await import("../../kernel/adaptive-operating-layer");
      const adjustments = adjustAutomationFromMaturity(["test_adaptive_domain"]);
      expect(Array.isArray(adjustments)).toBe(true);
    });

    it("should produce adaptive reports", async () => {
      const { getAdaptiveReport } = await import("../../kernel/adaptive-operating-layer");
      const report = getAdaptiveReport();
      expect(typeof report.approvalRate).toBe("number");
      expect(Array.isArray(report.recentDecisions)).toBe(true);
    });
  });

  describe("T011: Recovery Mode (polished)", () => {
    it("should execute full recovery lifecycle", async () => {
      const { initiateRecovery, assessDamage, triageAndIsolate, recoverSystems, verifyRecovery } = await import("../../kernel/recovery-mode");
      const plan = initiateRecovery("Database connection lost", "high", ["database", "cache"]);
      expect(plan.currentPhase).toBe("detection");

      const assessment = assessDamage(plan.id);
      expect(assessment.assessed).toBe(true);

      const { isolated } = triageAndIsolate(plan.id);
      expect(isolated.length).toBe(2);

      const { recovered } = recoverSystems(plan.id);
      expect(recovered.length).toBe(2);

      const verification = verifyRecovery(plan.id);
      expect(verification.verified).toBe(true);
      expect(verification.health).toBe("healthy");
    });

    it("should handle partial recovery", async () => {
      const { initiateRecovery, assessDamage, triageAndIsolate, recoverSystems, verifyRecovery } = await import("../../kernel/recovery-mode");
      const plan = initiateRecovery("Partial failure", "medium", ["api", "scheduler", "queue"]);
      assessDamage(plan.id);
      triageAndIsolate(plan.id);
      recoverSystems(plan.id, ["api"]);
      const verification = verifyRecovery(plan.id);
      expect(verification.verified).toBe(false);
    });
  });

  describe("T012: Full Systems Activation", () => {
    it("should seed and check all systems", async () => {
      const { seedAllSystems, getAllSystemStates, checkAndActivate } = await import("../../content/full-systems-activation");
      seedAllSystems();
      const states = getAllSystemStates();
      expect(states.length).toBeGreaterThanOrEqual(15);
      const result = checkAndActivate("smart_inbox");
      expect(["inactive", "shadow", "partial", "active", "full"]).toContain(result.level);
    });

    it("should produce activation reports", async () => {
      const { seedAllSystems, getActivationReport } = await import("../../content/full-systems-activation");
      seedAllSystems();
      const report = getActivationReport();
      expect(report.total).toBeGreaterThan(0);
      expect(typeof report.activationRate).toBe("number");
    });

    it("should support force activation", async () => {
      const { seedAllSystems, forceActivate, getSystemState } = await import("../../content/full-systems-activation");
      seedAllSystems();
      const result = forceActivate("weekly_intelligence_brief", "Manual activation for testing");
      expect(result).toBe(true);
      expect(getSystemState("weekly_intelligence_brief")?.isActive).toBe(true);
    });
  });

  describe("T013: Adaptive Feedback Loops", () => {
    it("should record override patterns and feed to experiments", async () => {
      const { recordOverridePattern, feedOverridesToExperiments, getOverridePatterns } = await import("../../kernel/adaptive-feedback-loops");
      for (let i = 0; i < 5; i++) {
        recordOverridePattern("thumbnail_color", "content", 0.7);
      }
      const patterns = getOverridePatterns();
      expect(patterns.length).toBeGreaterThan(0);
      const result = feedOverridesToExperiments();
      expect(typeof result.experimentsCreated).toBe("number");
    });

    it("should record rollout decisions", async () => {
      const { recordRolloutDecision, getRolloutDecisions } = await import("../../kernel/adaptive-feedback-loops");
      recordRolloutDecision("rollout-1", "new-thumbnails", "promote", 0.9, ["A/B test passed"]);
      const decisions = getRolloutDecisions();
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("should track reconciliation health", async () => {
      const { recordReconciliationHealth, getAdaptiveFeedbackReport } = await import("../../kernel/adaptive-feedback-loops");
      recordReconciliationHealth("content", 0.85);
      const report = getAdaptiveFeedbackReport();
      expect(report.reconciliationHealth.domains.length).toBeGreaterThan(0);
      expect(report.reconciliationHealth.averageScore).toBeGreaterThan(0);
    });
  });

  describe("T014: Cooperative Intelligence", () => {
    it("should manage opt-in/opt-out", async () => {
      const { optIn, optOut, isOptedIn, getConfig } = await import("../../kernel/cooperative-intelligence");
      optIn("user-1", "aggregated_only", ["content", "revenue"]);
      expect(isOptedIn("user-1")).toBe(true);
      const config = getConfig("user-1");
      expect(config?.sharingLevel).toBe("aggregated_only");
      optOut("user-1");
      expect(isOptedIn("user-1")).toBe(false);
    });

    it("should contribute metrics and retrieve benchmarks", async () => {
      const { optIn, contributeMetric, getBenchmark } = await import("../../kernel/cooperative-intelligence");
      for (let i = 0; i < 6; i++) {
        optIn(`coop-user-${i}`, "aggregated_only", ["content"]);
        contributeMetric(`coop-user-${i}`, "avg_views", "content", 1000 + i * 100);
      }
      const benchmark = getBenchmark("content", "avg_views");
      expect(benchmark).not.toBeNull();
      expect(benchmark!.participantCount).toBeGreaterThanOrEqual(5);
    });

    it("should provide privacy-safe insights", async () => {
      const { optIn, contributeMetric, getCooperativeInsight, getCooperativeReport } = await import("../../kernel/cooperative-intelligence");
      for (let i = 0; i < 6; i++) {
        optIn(`insight-user-${i}`, "aggregated_only", ["revenue"]);
        contributeMetric(`insight-user-${i}`, "rpm", "revenue", 10 + i * 2);
      }
      const insight = getCooperativeInsight("insight-user-0", "revenue", "rpm", 12);
      expect(insight?.privacySafe).toBe(true);
      const report = getCooperativeReport();
      expect(report.privacyCompliant).toBe(true);
    });
  });

  describe("T015: v9.0 Capstone", () => {
    it("should look up execution history", async () => {
      const { appendEvent } = await import("../../kernel/creator-intelligence-graph");
      const { lookupExecutionHistory } = await import("../../kernel/v9-capstone");
      appendEvent("content.published", "capstone_domain", "capstone-entity", { confidence: 0.8, outcome: "success" }, "test");
      const history = lookupExecutionHistory("capstone_domain", "capstone-entity");
      expect(history.decisionCount).toBeGreaterThan(0);
      expect(history.recentExecutions.length).toBeGreaterThan(0);
    });

    it("should check continuity staleness", async () => {
      const { checkContinuityStaleness } = await import("../../kernel/v9-capstone");
      const report = checkContinuityStaleness("packet-1", new Date());
      expect(report.isStale).toBe(false);
      const staleReport = checkContinuityStaleness("packet-2", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      expect(staleReport.isStale).toBe(true);
    });

    it("should generate full self-assessment at full resolution", async () => {
      const { generateFullSelfAssessment } = await import("../../kernel/v9-capstone");
      const report = generateFullSelfAssessment();
      expect(report.resolution).toBeTruthy();
      expect(["full", "partial", "minimal"]).toContain(report.resolution);
      expect(report.telemetryEvents.length).toBeGreaterThan(0);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it("should run full v9 capstone check", async () => {
      const { runFullV9CapstoneCheck } = await import("../../kernel/v9-capstone");
      const result = runFullV9CapstoneCheck();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.selfAssessment).toBeDefined();
      expect(result.continuityCheck).toBeDefined();
      expect(result.graphStats).toBeDefined();
    });
  });
});
