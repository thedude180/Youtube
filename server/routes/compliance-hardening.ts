import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, asyncHandler } from "./helpers";
import { detectComplianceDrift, getDriftEvents, getDriftSummary, resolveDriftEvent } from "../services/compliance-drift-detector";
import { getAllPolicyPacks, getPolicyPack, checkContentAgainstPack, getSupportedPlatforms } from "../services/policy-packs";
import { checkAiDisclosure, scanUserContentForAiDisclosure, recordProvenance, getProvenance, verifyMediaTrust } from "../services/ai-disclosure-intelligence";
import { computeCreatorCredibility, getCredibilityScore } from "../services/creator-credibility";
import { runPolicyPreFlight } from "../services/policy-preflight";
import { requireYouTubeOnly } from "@shared/youtube-only";

const SUPPORTED_PLATFORMS = ["youtube"] as const;
const platformEnum = z.enum(SUPPORTED_PLATFORMS);

export function registerComplianceHardeningRoutes(app: Express) {

  app.get("/api/compliance-hardening/drift/summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await getDriftSummary();
    res.json(summary);
  }));

  app.get("/api/compliance-hardening/drift/events", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rawPlatform = req.body.platform ?? req.params.platform ?? (req.query.platform as string) ?? "youtube";
    const platform = requireYouTubeOnly(rawPlatform);
    const status = req.query.status as string | undefined;
    const events = await getDriftEvents({ platform, status, limit: 50 });
    res.json(events);
  }));

  app.post("/api/compliance-hardening/drift/detect", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const results = await detectComplianceDrift();
    res.json({ results, totalDrifts: results.reduce((sum, r) => sum + r.driftsDetected, 0) });
  }));

  app.post("/api/compliance-hardening/drift/resolve/:id", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const eventId = parseInt(req.params.id as string, 10);
    if (isNaN(eventId) || eventId <= 0) return res.status(400).json({ error: "Invalid event ID" });
    const resolved = await resolveDriftEvent(eventId);
    if (!resolved) return res.status(404).json({ error: "Drift event not found" });
    res.json({ resolved: true });
  }));

  app.get("/api/compliance-hardening/policy-packs", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rawPlatform = req.body.platform ?? req.params.platform ?? (req.query.platform as string) ?? "youtube";
    const platform = requireYouTubeOnly(rawPlatform);
    const pack = getPolicyPack(platform);
    if (!pack) return res.status(404).json({ error: `No policy pack for platform: ${platform}` });
    res.json(pack);
  }));

  app.post("/api/compliance-hardening/policy-check", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      platform: platformEnum,
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      hasAiContent: z.boolean().optional(),
      hasSponsoredContent: z.boolean().optional(),
      hasAffiliateLinks: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = checkContentAgainstPack({ ...parsed.data, platform: parsed.data.platform });
    res.json(result);
  }));

  app.get("/api/compliance-hardening/ai-disclosure/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const results = await scanUserContentForAiDisclosure(userId);
    res.json({
      totalScanned: results.length,
      missingDisclosure: results.filter(r => r.disclosureStatus === "missing").length,
      compliant: results.filter(r => r.disclosureStatus === "compliant").length,
      results,
    });
  }));

  app.post("/api/compliance-hardening/ai-disclosure/check", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      contentId: z.number(),
      title: z.string(),
      description: z.string(),
      platform: platformEnum,
      originTypes: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = await checkAiDisclosure(userId, parsed.data.contentId, parsed.data.title, parsed.data.description, parsed.data.platform, parsed.data.originTypes);
    res.json(result);
  }));

  app.post("/api/compliance-hardening/provenance", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      contentId: z.number().nullable(),
      contentType: z.string().min(1),
      assetName: z.string().min(1),
      originType: z.enum(["ai-generated", "ai-assisted", "ai-enhanced", "user-created", "licensed", "stock", "fair-use", "unknown"]),
      source: z.string().optional(),
      licenseType: z.string().optional(),
      licenseExpiry: z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const record = await recordProvenance(
      userId,
      parsed.data.contentId,
      parsed.data.contentType,
      parsed.data.assetName,
      parsed.data.originType,
      parsed.data.source,
      parsed.data.licenseType,
      parsed.data.licenseExpiry ? new Date(parsed.data.licenseExpiry) : undefined,
    );
    res.status(201).json(record);
  }));

  app.get("/api/compliance-hardening/provenance", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    let contentId: number | undefined;
    if (req.query.contentId) {
      contentId = parseInt(req.query.contentId as string, 10);
      if (isNaN(contentId) || contentId <= 0) return res.status(400).json({ error: "Invalid contentId" });
    }
    const records = await getProvenance(userId, contentId);
    res.json(records);
  }));

  app.get("/api/compliance-hardening/media-trust/:contentId", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const contentId = parseInt(req.params.contentId as string, 10);
    if (isNaN(contentId) || contentId <= 0) return res.status(400).json({ error: "Invalid content ID" });
    const result = await verifyMediaTrust(userId, contentId);
    res.json(result);
  }));

  app.get("/api/compliance-hardening/credibility", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const assessment = await computeCreatorCredibility(userId);
    res.json(assessment);
  }));

  app.get("/api/compliance-hardening/credibility/score", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const score = await getCredibilityScore(userId);
    if (!score) {
      const fresh = await computeCreatorCredibility(userId);
      return res.json(fresh);
    }
    res.json(score);
  }));

  app.post("/api/compliance-hardening/preflight", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      platform: platformEnum,
      contentId: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      hasAiContent: z.boolean().optional(),
      hasSponsoredContent: z.boolean().optional(),
      hasAffiliateLinks: z.boolean().optional(),
      originTypes: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = await runPolicyPreFlight(userId, parsed.data.platform, parsed.data);
    res.json(result);
  }));

  app.get("/api/compliance-hardening/summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const [driftSummary, credibility, aiDisclosures] = await Promise.all([
      getDriftSummary(),
      computeCreatorCredibility(userId),
      scanUserContentForAiDisclosure(userId),
    ]);

    res.json({
      drift: driftSummary,
      credibility: {
        score: credibility.overallScore,
        tier: credibility.tier,
        factors: credibility.factors,
      },
      aiDisclosure: {
        totalWithAiContent: aiDisclosures.length,
        missingDisclosure: aiDisclosures.filter(r => r.disclosureStatus === "missing").length,
        compliant: aiDisclosures.filter(r => r.disclosureStatus === "compliant").length,
      },
      platforms: getSupportedPlatforms(),
    });
  }));
}
