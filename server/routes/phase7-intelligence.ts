import { type Express } from "express";

function getUserId(req: any): string {
  return (req as any).userId || req.headers["x-user-id"] || "anonymous";
}

export function registerPhase7IntelligenceRoutes(app: Express) {
  app.get("/api/intelligence/graph/snapshot", async (_req, res) => {
    const { getGraphSnapshot } = await import("../kernel/creator-intelligence-graph");
    res.json(getGraphSnapshot());
  });

  app.get("/api/intelligence/graph/stats", async (_req, res) => {
    const { getGraphStats } = await import("../kernel/creator-intelligence-graph");
    res.json(getGraphStats());
  });

  app.post("/api/intelligence/graph/query/time-range", async (req, res) => {
    const { queryTimeRange } = await import("../kernel/temporal-graph-queries");
    const { start, end, domain, eventType } = req.body;
    res.json(queryTimeRange(new Date(start), new Date(end), domain, eventType));
  });

  app.post("/api/intelligence/graph/query/entity", async (req, res) => {
    const { queryEntityHistory } = await import("../kernel/temporal-graph-queries");
    const { domain, entityId } = req.body;
    res.json(queryEntityHistory(domain, entityId));
  });

  app.post("/api/intelligence/graph/query/trend", async (req, res) => {
    const { queryTrend } = await import("../kernel/temporal-graph-queries");
    const { domain, metric, windowMs } = req.body;
    res.json(queryTrend(domain, metric, windowMs));
  });

  app.post("/api/intelligence/graph/query/comparison", async (req, res) => {
    const { queryComparison } = await import("../kernel/temporal-graph-queries");
    const { domain, metric, period1Start, period1End, period2Start, period2End } = req.body;
    res.json(queryComparison(domain, metric, new Date(period1Start), new Date(period1End), new Date(period2Start), new Date(period2End)));
  });

  app.post("/api/intelligence/graph/query/anomalies", async (req, res) => {
    const { queryAnomalies } = await import("../kernel/temporal-graph-queries");
    const { domain, metric, windowMs, stdDevThreshold } = req.body;
    res.json(queryAnomalies(domain, metric, windowMs, stdDevThreshold));
  });

  app.get("/api/intelligence/experiments", async (_req, res) => {
    const { getAllExperiments } = await import("../kernel/experiment-engine");
    res.json(getAllExperiments());
  });

  app.get("/api/intelligence/experiments/active", async (_req, res) => {
    const { getActiveExperiments } = await import("../kernel/experiment-engine");
    res.json(getActiveExperiments());
  });

  app.post("/api/intelligence/experiments", async (req, res) => {
    const { createExperiment, startExperiment } = await import("../kernel/experiment-engine");
    const exp = createExperiment(req.body);
    if (req.body.autoStart) startExperiment(exp.id);
    res.json(exp);
  });

  app.post("/api/intelligence/experiments/:id/evaluate", async (req, res) => {
    const { evaluateExperiment } = await import("../kernel/experiment-engine");
    res.json(evaluateExperiment(req.params.id));
  });

  app.post("/api/intelligence/experiments/:id/conclude", async (req, res) => {
    const { concludeExperiment } = await import("../kernel/experiment-engine");
    res.json(concludeExperiment(req.params.id));
  });

  app.post("/api/intelligence/experiments/:id/promote", async (req, res) => {
    const { promoteExperiment } = await import("../kernel/experiment-engine");
    res.json({ promoted: promoteExperiment(req.params.id) });
  });

  app.get("/api/intelligence/learning/maturity", async (req, res) => {
    const { assessLearningMaturity } = await import("../kernel/learning-maturity-system");
    const domains = (req.query.domains as string || "content,audience,revenue,learning,brand").split(",");
    res.json(assessLearningMaturity(domains));
  });

  app.get("/api/intelligence/research/report", async (_req, res) => {
    const { getSwarmReport } = await import("../kernel/research-swarm");
    res.json(getSwarmReport());
  });

  app.post("/api/intelligence/research/spawn", async (req, res) => {
    const { spawnParallelResearch } = await import("../kernel/research-swarm");
    res.json(spawnParallelResearch(req.body.questions));
  });

  app.get("/api/intelligence/promotions/active", async (_req, res) => {
    const { getActivePromotions } = await import("../kernel/skill-promotions");
    res.json(getActivePromotions());
  });

  app.get("/api/intelligence/promotions/pending", async (_req, res) => {
    const { getPendingPromotions } = await import("../kernel/skill-promotions");
    res.json(getPendingPromotions());
  });

  app.get("/api/intelligence/predictive/state", async (_req, res) => {
    const { getPromotionState } = await import("../content/predictive-content-promotion");
    res.json(getPromotionState());
  });

  app.get("/api/intelligence/predictive/accuracy", async (_req, res) => {
    const { getPredictionAccuracy } = await import("../content/predictive-content-promotion");
    res.json(getPredictionAccuracy());
  });

  app.post("/api/intelligence/predictive/check-promotion", async (_req, res) => {
    const { checkPromotion } = await import("../content/predictive-content-promotion");
    res.json(checkPromotion());
  });

  app.get("/api/intelligence/adaptive/report", async (_req, res) => {
    const { getAdaptiveReport } = await import("../kernel/adaptive-operating-layer");
    res.json(getAdaptiveReport());
  });

  app.post("/api/intelligence/adaptive/adjust", async (req, res) => {
    const { adjustAutomationFromMaturity } = await import("../kernel/adaptive-operating-layer");
    const domains = req.body.domains || ["content", "audience", "revenue"];
    res.json(adjustAutomationFromMaturity(domains));
  });

  app.get("/api/intelligence/recovery/active", async (_req, res) => {
    const { getActivePlans } = await import("../kernel/recovery-mode");
    res.json(getActivePlans());
  });

  app.get("/api/intelligence/recovery/history", async (_req, res) => {
    const { getRecoveryHistory } = await import("../kernel/recovery-mode");
    res.json(getRecoveryHistory());
  });

  app.get("/api/intelligence/systems/report", async (_req, res) => {
    const { seedAllSystems, getActivationReport } = await import("../content/full-systems-activation");
    seedAllSystems();
    res.json(getActivationReport());
  });

  app.post("/api/intelligence/systems/activate-eligible", async (_req, res) => {
    const { seedAllSystems, activateAllEligible } = await import("../content/full-systems-activation");
    seedAllSystems();
    res.json(activateAllEligible());
  });

  app.get("/api/intelligence/feedback/report", async (_req, res) => {
    const { getAdaptiveFeedbackReport } = await import("../kernel/adaptive-feedback-loops");
    res.json(getAdaptiveFeedbackReport());
  });

  app.post("/api/intelligence/feedback/override", async (req, res) => {
    const { recordOverridePattern } = await import("../kernel/adaptive-feedback-loops");
    const { pattern, domain, impact } = req.body;
    res.json(recordOverridePattern(pattern, domain, impact));
  });

  app.post("/api/intelligence/feedback/feed-experiments", async (_req, res) => {
    const { feedOverridesToExperiments } = await import("../kernel/adaptive-feedback-loops");
    res.json(feedOverridesToExperiments());
  });

  app.get("/api/intelligence/cooperative/report", async (_req, res) => {
    const { getCooperativeReport } = await import("../kernel/cooperative-intelligence");
    res.json(getCooperativeReport());
  });

  app.post("/api/intelligence/cooperative/opt-in", async (req, res) => {
    const userId = getUserId(req);
    const { optIn } = await import("../kernel/cooperative-intelligence");
    const { sharingLevel, domains } = req.body;
    res.json(optIn(userId, sharingLevel, domains));
  });

  app.post("/api/intelligence/cooperative/opt-out", async (req, res) => {
    const userId = getUserId(req);
    const { optOut } = await import("../kernel/cooperative-intelligence");
    res.json({ optedOut: optOut(userId) });
  });

  app.get("/api/intelligence/capstone/self-assessment", async (_req, res) => {
    const { generateFullSelfAssessment } = await import("../kernel/v9-capstone");
    res.json(generateFullSelfAssessment());
  });

  app.get("/api/intelligence/capstone/full-check", async (_req, res) => {
    const { runFullV9CapstoneCheck } = await import("../kernel/v9-capstone");
    res.json(runFullV9CapstoneCheck());
  });

  app.post("/api/intelligence/capstone/continuity-staleness", async (req, res) => {
    const { checkContinuityStaleness } = await import("../kernel/v9-capstone");
    const { packetId, lastUpdated, staleThresholdMs } = req.body;
    res.json(checkContinuityStaleness(packetId, new Date(lastUpdated), staleThresholdMs));
  });

  app.post("/api/intelligence/capstone/execution-history", async (req, res) => {
    const { lookupExecutionHistory } = await import("../kernel/v9-capstone");
    const { domain, entityId } = req.body;
    res.json(lookupExecutionHistory(domain, entityId));
  });

  app.post("/api/intelligence/agent-eval/enforce", async (req, res) => {
    const { enforceAgentOutput } = await import("../kernel/agent-evals-enforcement");
    res.json(enforceAgentOutput(req.body));
  });

  app.post("/api/intelligence/agent-eval/check-block", async (req, res) => {
    const { shouldBlockOutput } = await import("../kernel/agent-evals-enforcement");
    res.json(shouldBlockOutput(req.body));
  });

  app.get("/api/intelligence/agent-eval/history", async (req, res) => {
    const { getEvalHistory } = await import("../kernel/agent-evals-enforcement");
    const agentId = req.query.agentId as string | undefined;
    res.json(getEvalHistory(agentId));
  });

  app.get("/api/intelligence/agent-eval/summary/:agentId", async (req, res) => {
    const { getAgentEvalSummary } = await import("../kernel/agent-evals-enforcement");
    res.json(getAgentEvalSummary(req.params.agentId));
  });

  app.post("/api/intelligence/audience-soul/build", async (req, res) => {
    const { buildAudienceSoulModel } = await import("../business/audience-soul-model");
    const { channelId, signals } = req.body;
    res.json(buildAudienceSoulModel(channelId, signals));
  });

  app.get("/api/intelligence/advanced-systems/report", async (_req, res) => {
    const { getAdvancedSystemsReport } = await import("../kernel/advanced-systems-integration");
    res.json(getAdvancedSystemsReport());
  });

  app.get("/api/intelligence/advanced-systems/capital-influences", async (_req, res) => {
    const { computeCapitalAllocationInfluences } = await import("../kernel/advanced-systems-integration");
    res.json(computeCapitalAllocationInfluences());
  });

  app.get("/api/intelligence/advanced-systems/buyer-readiness", async (_req, res) => {
    const { computeBuyerReadinessInfluences } = await import("../kernel/advanced-systems-integration");
    res.json(computeBuyerReadinessInfluences());
  });

  app.post("/api/intelligence/audience-soul/predict", async (req, res) => {
    const { buildAudienceSoulModel, makeBoundedPrediction } = await import("../business/audience-soul-model");
    const { channelId, signals, prediction, basis } = req.body;
    const model = buildAudienceSoulModel(channelId, signals);
    const pred = makeBoundedPrediction(model, prediction, basis);
    res.json(pred || { error: "No relevant dimensions for basis" });
  });
}
