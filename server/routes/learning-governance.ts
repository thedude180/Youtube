import { Router, Request, Response } from "express";
import { asyncHandler, requireAuth, requireAdmin, getUserId } from "./helpers";
import {
  ingestLearningSignal,
  getDecayedSignals,
  getMaturityScores,
  getGovernedConfidenceForDomain,
  getOpenContradictions,
  resolveContradiction,
  createNarrativePromise,
  updatePromiseProgress,
  checkAtRiskPromises,
  getUserPromises,
  recordOverrideLearning,
  getOverridePatterns,
  registerLicensingAsset,
  updateLicensingStatus,
  getLicensingReadiness,
  getSignalHalfLife,
  setSignalHalfLife,
} from "../services/learning-governance";

export function registerLearningGovernanceRoutes(app: any) {
  app.post("/api/learning-governance/signals", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { category, signalType, value, confidence, sourceAgent, bandClass, sampleSize } = req.body;
    if (!category || !signalType || confidence == null || !sourceAgent) {
      return res.status(400).json({ error: "category, signalType, confidence, and sourceAgent are required" });
    }
    const result = await ingestLearningSignal(userId, category, signalType, value || {}, confidence, sourceAgent, bandClass, sampleSize);
    res.json(result);
  }));

  app.get("/api/learning-governance/signals", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const signals = await getDecayedSignals(userId, category, limit);
    res.json({ signals });
  }));

  app.get("/api/learning-governance/maturity", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const scores = await getMaturityScores(userId);
    res.json({ scores });
  }));

  app.get("/api/learning-governance/confidence/:domain", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await getGovernedConfidenceForDomain(userId, req.params.domain);
    res.json(result);
  }));

  app.get("/api/learning-governance/contradictions", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const domain = req.query.domain as string | undefined;
    const contradictions = await getOpenContradictions(userId, domain);
    res.json({ contradictions });
  }));

  app.post("/api/learning-governance/contradictions/:id/resolve", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { resolution } = req.body;
    if (!resolution) return res.status(400).json({ error: "resolution is required" });
    const resolved = await resolveContradiction(parseInt(req.params.id), resolution);
    res.json({ resolved });
  }));

  app.post("/api/learning-governance/promises", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { promiseType, title, description, deadline, metadata } = req.body;
    if (!promiseType || !title) return res.status(400).json({ error: "promiseType and title are required" });
    const id = await createNarrativePromise(userId, promiseType, title, description, deadline ? new Date(deadline) : undefined, metadata);
    res.json({ id });
  }));

  app.patch("/api/learning-governance/promises/:id/progress", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { progress } = req.body;
    if (progress == null) return res.status(400).json({ error: "progress is required" });
    await updatePromiseProgress(parseInt(req.params.id), progress);
    res.json({ updated: true });
  }));

  app.get("/api/learning-governance/promises", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const promises = await getUserPromises(userId, status);
    res.json({ promises });
  }));

  app.get("/api/learning-governance/promises/at-risk", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const atRisk = await checkAtRiskPromises(userId);
    res.json({ atRisk });
  }));

  app.post("/api/learning-governance/overrides", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { actionType, originalValue, overrideValue, reason } = req.body;
    if (!actionType || !reason) return res.status(400).json({ error: "actionType and reason are required" });
    const id = await recordOverrideLearning(userId, actionType, originalValue || {}, overrideValue || {}, reason);
    res.json({ id });
  }));

  app.get("/api/learning-governance/overrides/patterns", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const patterns = await getOverridePatterns(userId);
    res.json({ patterns });
  }));

  app.post("/api/learning-governance/licensing/assets", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { assetType, assetId, title, metadata } = req.body;
    if (!assetType || !assetId || !title) return res.status(400).json({ error: "assetType, assetId, and title are required" });
    const id = await registerLicensingAsset(userId, assetType, assetId, title, metadata);
    res.json({ id });
  }));

  app.patch("/api/learning-governance/licensing/assets/:id/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { licensingStatus, rightsVerified } = req.body;
    if (!licensingStatus) return res.status(400).json({ error: "licensingStatus is required" });
    await updateLicensingStatus(parseInt(req.params.id), licensingStatus, rightsVerified ?? false);
    res.json({ updated: true });
  }));

  app.get("/api/learning-governance/licensing/readiness", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const readiness = await getLicensingReadiness(userId);
    res.json(readiness);
  }));

  app.get("/api/learning-governance/decay-config", asyncHandler(async (req: Request, res: Response) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    const categories = ["engagement", "content", "revenue", "audience", "distribution", "default"];
    const config: Record<string, number> = {};
    for (const c of categories) config[c] = getSignalHalfLife(c);
    res.json({ halfLives: config });
  }));

  app.post("/api/learning-governance/decay-config", asyncHandler(async (req: Request, res: Response) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    const { category, halfLifeMs } = req.body;
    if (!category || !halfLifeMs) return res.status(400).json({ error: "category and halfLifeMs are required" });
    setSignalHalfLife(category, halfLifeMs);
    res.json({ updated: true, category, halfLifeMs });
  }));
}
