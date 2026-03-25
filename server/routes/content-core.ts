import type { Express, Request, Response } from "express";
import { createContentAtom, getContentAtom, listContentAtoms, sealContentAtom, checkDuplicate } from "../content/atom";
import { createReplay, listReplays } from "../content/replay-factory";
import { enqueueClip, getClipQueue, dequeueClip, completeClip } from "../content/clip-queue";
import { tagProvenance, getProvenance } from "../content/provenance";
import { analyzeSEO, scoreSEOHealth } from "../content/seo-lab";
import { generateThumbnailVariants, selectBestThumbnail } from "../content/thumbnail-lab";
import { recordDecision, queryDecisions, getDecisionTrace } from "../kernel/decision-theater";
import { routeByConfidence, validateExplanationContract } from "../kernel/confidence-router";
import { checkAuthenticity } from "../content/authenticity-gate";
import { checkBrandAlignment, getBrandProfile } from "../content/brand-system";
import { checkVoiceConsistency, getVoiceProfile } from "../content/voice-guardian";
import { detectBrandDrift, getBrandDriftAlerts } from "../content/brand-drift";
import { calculateSafetyScore, getSafetyHistory } from "../content/safe-to-automate";
import { getLeakageReport } from "../content/revenue-leakage";
import { scoreBrandSafety, getBrandSafetyReport } from "../content/brand-safety";
import { simulateAudienceReaction } from "../content/shadow-audience";
import { scaffoldNarrativeArc, analyzeArcStructure, getArcs } from "../content/narrative-arc";
import { classifyMoment, getMomentTaxonomy, getMoments } from "../content/moment-genome";
import { measureVelocity, getVelocityTrend } from "../content/content-velocity";
import { queryDemand, seedDemandGraph } from "../content/demand-graph";
import { predictPerformance, getOracleRecommendation } from "../content/pre-creation-oracle";
import { checkAccessibility, generateAltText } from "../content/accessibility";
import { generateDisclosure, checkDisclosureCompliance } from "../content/ai-disclosure";
import { detectLanguage } from "../content/multilingual";
import { auditAgentEval, getEvalViolations } from "../kernel/agent-evals-cop";
import { getDecayStatus } from "../kernel/learning-decay";
import { getImmuneStatus } from "../kernel/channel-immune";
import { getSkillRegistry } from "../kernel/skill-compiler";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).user?.claims?.sub || null;
}

export function registerContentCoreRoutes(app: Express) {
  app.post("/api/content-core/atoms", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { atomType, title, body, sourceVideoId, metadata, provenance } = req.body;
      if (!atomType || !title) return res.status(400).json({ error: "atomType and title required" });

      const isDuplicate = await checkDuplicate(userId, atomType, title, body);
      if (isDuplicate) return res.status(409).json({ error: "Duplicate content detected" });

      const id = await createContentAtom(userId, atomType, title, body, sourceVideoId, metadata, provenance);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/atoms", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const atoms = await listContentAtoms(userId, {
        atomType: req.query.atomType as string,
        limit: Number(req.query.limit) || 50,
      });
      res.json(atoms);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/atoms/:id", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const atom = await getContentAtom(Number(req.params.id));
      if (!atom || atom.userId !== userId) return res.status(404).json({ error: "Not found" });
      res.json(atom);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/atoms/:id/seal", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const sealed = await sealContentAtom(Number(req.params.id), userId);
      res.json({ sealed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/replays", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { replayType, sourceAtomId, config } = req.body;
      const id = await createReplay(userId, replayType, sourceAtomId, config);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/replays", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const replays = await listReplays(userId, { status: req.query.status as string });
      res.json(replays);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/clips/enqueue", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const id = await enqueueClip(userId, req.body.clipType, req.body);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/clips", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const clips = await getClipQueue(userId, req.query.status as string);
      res.json(clips);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/seo/analyze", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { title, description, tags, gameTitle } = req.body;
      const analysis = analyzeSEO(title || "", description || "", tags || [], gameTitle);
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/thumbnails/generate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { videoTitle, gameTitle, count, style } = req.body;
      const variants = await generateThumbnailVariants(userId, videoTitle, gameTitle, { count, style });
      const best = selectBestThumbnail(variants);
      res.json({ variants, recommended: best });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/confidence/route", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const validation = validateExplanationContract(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: "Explanation contract violation", missing: validation.missing });
      }
      const result = await routeByConfidence(userId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/decisions", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const decisions = await queryDecisions(userId, {
        agentName: req.query.agentName as string,
        band: req.query.band as string,
        limit: Number(req.query.limit) || 50,
      });
      res.json(decisions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/decisions/:id/trace", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const trace = await getDecisionTrace(Number(req.params.id));
      if (!trace || trace.userId !== userId) return res.status(404).json({ error: "Decision not found" });
      res.json(trace);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/authenticity/check", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = await checkAuthenticity(userId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/brand/profile", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const profile = getBrandProfile(userId);
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/brand/check-alignment", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const profile = getBrandProfile(userId);
      const result = checkBrandAlignment(req.body, profile);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/voice/check", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { text, isTitle, isDescription } = req.body;
      const result = checkVoiceConsistency(userId, text, { isTitle, isDescription });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/voice/profile", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      res.json(getVoiceProfile(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/brand-drift", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const alerts = await getBrandDriftAlerts(userId);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/safety/score", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { actionType, factors } = req.body;
      const result = await calculateSafetyScore(userId, actionType, factors);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/brand-safety/check", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = scoreBrandSafety(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/oracle/predict", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const prediction = predictPerformance(userId, req.body);
      const recommendation = getOracleRecommendation(prediction);
      res.json({ ...prediction, recommendation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/shadow-audience/simulate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { contentAtomId, simulationType, content } = req.body;
      const result = await simulateAudienceReaction(userId, contentAtomId, simulationType || "pre-publish", content);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/moments/taxonomy", async (_req: Request, res: Response) => {
    res.json(getMomentTaxonomy());
  });

  app.get("/api/content-core/demand", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const nodes = await queryDemand(userId, { minGap: Number(req.query.minGap) || undefined });
      res.json(nodes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/demand/seed", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const count = await seedDemandGraph(userId);
      res.json({ seeded: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/velocity", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const trend = await getVelocityTrend(userId);
      res.json(trend);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/accessibility/check", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = checkAccessibility(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-core/disclosure/generate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = generateDisclosure(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-core/governance/summary", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const [violations, decayStatus, immuneStatus, skills] = await Promise.all([
        getEvalViolations(userId, { limit: 10 }),
        getDecayStatus(userId),
        Promise.resolve(getImmuneStatus(userId)),
        Promise.resolve(getSkillRegistry()),
      ]);

      res.json({
        evalViolations: violations.length,
        recentViolations: violations.slice(0, 5),
        decaySignals: decayStatus.length,
        channelImmunity: immuneStatus.immunityScore,
        activeThreats: immuneStatus.activeThreats.length,
        compiledSkills: skills.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
