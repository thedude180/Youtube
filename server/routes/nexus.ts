import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  creatorScores, missionControlSnapshots, streamCommandEvents, warRoomIncidents,
  audienceMindMapNodes, whatIfScenarios, timeMachineProjections, momentumSnapshots,
  peakTimeAnalysis, platformPriorityRanks, revenueAttribution, creatorMarketplaceListings,
  contentVaultBackups, contractAnalyses, watchParties, creatorNetworks, networkMemberships,
  creatorCloneConfig, aiPersonalityConfig, voiceCommandLog, aiLearningSnapshots,
  anomalyDetections, contentAtomizerJobs, viralChainEvents, hookScores, thumbnailAbTests,
  contentEmpireNodes, audienceOverlaps, sentimentTimeline, seoLabExperiments, cohortAnalysis,
  teamInboxMessages, assetLibrary, customReports, emailLists, emailSubscribers,
  discordBotConfig, merchStoreItems, tipDonations, growthCelebrations, contentLifeBalance,
  platformFailoverRules, scriptGenerations
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { getAutonomyStatus, getAutonomyDecisionLog, getRecentRuns, toggleEngine, forceRunEngine } from "../autonomy-controller";

const router = Router();

export function registerNexusRoutes(app: any) {
  app.use(router);
}

function getUserId(req: Request): string | null {
  return (req as any).user?.id || null;
}

function requireAuth(req: Request, res: Response): string | null {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  return userId;
}

router.get("/api/nexus/creator-score", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [score] = await db.select().from(creatorScores).where(eq(creatorScores.userId, userId)).orderBy(desc(creatorScores.createdAt)).limit(1);
    if (!score) {
      return res.json({ overallScore: 0, engagementScore: 0, consistencyScore: 0, growthScore: 0, monetizationScore: 0, reachScore: 0, contentQualityScore: 0, trend: "new", breakdownData: {} });
    }
    res.json(score);
  } catch (e) { res.status(500).json({ error: "Failed to fetch creator score" }); }
});

router.post("/api/nexus/creator-score/calculate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a creator analytics engine. Calculate a Creator Score (0-100) with sub-scores for engagement, consistency, growth, monetization, reach, and content quality. Return valid JSON with fields: overallScore, engagementScore, consistencyScore, growthScore, monetizationScore, reachScore, contentQualityScore, trend (up/down/stable), breakdownData (object with details)." }, { role: "user", content: `Calculate Creator Score for a creator. Consider all platforms and recent performance metrics. Provide realistic scores.` }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const [newScore] = await db.insert(creatorScores).values({ userId, overallScore: data.overallScore || 50, engagementScore: data.engagementScore || 50, consistencyScore: data.consistencyScore || 50, growthScore: data.growthScore || 50, monetizationScore: data.monetizationScore || 50, reachScore: data.reachScore || 50, contentQualityScore: data.contentQualityScore || 50, trend: data.trend || "stable", breakdownData: data.breakdownData || {} }).returning();
    res.json(newScore);
  } catch (e) { res.status(500).json({ error: "Failed to calculate score" }); }
});

router.get("/api/nexus/mission-control", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [snapshot] = await db.select().from(missionControlSnapshots).where(eq(missionControlSnapshots.userId, userId)).orderBy(desc(missionControlSnapshots.createdAt)).limit(1);
    if (!snapshot) {
      return res.json({ platformMetrics: {}, overallHealth: "healthy", activeStreams: 0, totalViewers: 0, alerts: [], systemStatus: { ai: "online", streaming: "standby", content: "online", analytics: "online", security: "online" } });
    }
    res.json(snapshot);
  } catch (e) { res.status(500).json({ error: "Failed to fetch mission control" }); }
});

router.post("/api/nexus/mission-control/refresh", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [snapshot] = await db.insert(missionControlSnapshots).values({
      userId,
      platformMetrics: { youtube: { subscribers: 0, views24h: 0, status: "connected" }, twitch: { followers: 0, viewers: 0, status: "standby" }, tiktok: { followers: 0, views24h: 0, status: "connected" } },
      overallHealth: "healthy",
      activeStreams: 0,
      totalViewers: 0,
      alerts: [],
      systemStatus: { ai: "online", streaming: "standby", content: "online", analytics: "online", security: "online", autopilot: "active" }
    }).returning();
    res.json(snapshot);
  } catch (e) { res.status(500).json({ error: "Failed to refresh" }); }
});

router.get("/api/nexus/stream-command", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const events = await db.select().from(streamCommandEvents).where(eq(streamCommandEvents.userId, userId)).orderBy(desc(streamCommandEvents.createdAt)).limit(50);
    res.json(events);
  } catch (e) { res.status(500).json({ error: "Failed to fetch stream events" }); }
});

router.get("/api/nexus/war-room", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const incidents = await db.select().from(warRoomIncidents).where(eq(warRoomIncidents.userId, userId)).orderBy(desc(warRoomIncidents.createdAt)).limit(20);
    res.json(incidents);
  } catch (e) { res.status(500).json({ error: "Failed to fetch war room" }); }
});

router.post("/api/nexus/war-room/scan", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a crisis detection AI. Scan for potential issues (algorithm changes, content strikes, engagement drops, platform outages, drama/controversy). Return JSON with fields: hasIncident (boolean), incidents (array of {incidentType, severity, title, description, affectedPlatforms, recoveryPlan (array of {step, status}), automatedActions})." }, { role: "user", content: "Perform a threat scan for a multi-platform creator. Check for any potential crises or issues." }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    if (data.hasIncident && data.incidents?.length) {
      for (const inc of data.incidents) {
        await db.insert(warRoomIncidents).values({ userId, ...inc });
      }
    }
    res.json({ status: "scanned", incidents: data.incidents || [], hasIncident: data.hasIncident || false });
  } catch (e) { res.status(500).json({ error: "Failed to scan" }); }
});

router.get("/api/nexus/audience-mind-map", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const nodes = await db.select().from(audienceMindMapNodes).where(eq(audienceMindMapNodes.userId, userId));
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: "Failed to fetch mind map" }); }
});

router.post("/api/nexus/audience-mind-map/generate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Generate an audience mind map with segments. Return JSON with nodes array where each node has: nodeType (core/segment/interest/behavior), label, size (1-100), connections (array of indices), engagement (0-1), conversionRate (0-1), metadata (object)." }, { role: "user", content: "Create an audience mind map for a gaming/content creator with segments like hardcore fans, casual viewers, potential subscribers, etc." }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    await db.delete(audienceMindMapNodes).where(eq(audienceMindMapNodes.userId, userId));
    const nodes = [];
    for (const node of (data.nodes || [])) {
      const [n] = await db.insert(audienceMindMapNodes).values({ userId, ...node }).returning();
      nodes.push(n);
    }
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: "Failed to generate mind map" }); }
});

router.get("/api/nexus/what-if", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const scenarios = await db.select().from(whatIfScenarios).where(eq(whatIfScenarios.userId, userId)).orderBy(desc(whatIfScenarios.createdAt));
    res.json(scenarios);
  } catch (e) { res.status(500).json({ error: "Failed to fetch scenarios" }); }
});

router.post("/api/nexus/what-if/simulate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { name, variables, timeframeWeeks } = req.body;
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a content strategy simulator. Given scenario variables, project outcomes. Return JSON with: projectedOutcomes (subscribers, views, revenue, engagement as numbers), comparisonBaseline (same fields showing current trajectory), confidenceLevel (0-1), analysis (string)." }, { role: "user", content: `Simulate this scenario: ${name || "Custom scenario"}. Variables: ${JSON.stringify(variables || {})}. Timeframe: ${timeframeWeeks || 12} weeks.` }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const [scenario] = await db.insert(whatIfScenarios).values({ userId, name: name || "Custom Scenario", variables: variables || {}, projectedOutcomes: data.projectedOutcomes || {}, comparisonBaseline: data.comparisonBaseline || {}, confidenceLevel: data.confidenceLevel || 0.5, timeframeWeeks: timeframeWeeks || 12, status: "completed" }).returning();
    res.json(scenario);
  } catch (e) { res.status(500).json({ error: "Failed to simulate" }); }
});

router.get("/api/nexus/time-machine", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const projections = await db.select().from(timeMachineProjections).where(eq(timeMachineProjections.userId, userId)).orderBy(desc(timeMachineProjections.createdAt)).limit(2);
    res.json(projections);
  } catch (e) { res.status(500).json({ error: "Failed to fetch projections" }); }
});

router.post("/api/nexus/time-machine/project", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Generate 6-month projections for a creator. Return JSON with TWO projections: withAI (following AI plan) and withoutAI (current trajectory). Each has: subscribers (array of 6 monthly values), revenue (6 values), views (6 values), engagement (6 values), milestones (array of {month, label})." }, { role: "user", content: "Project 6-month growth for a gaming creator with and without AI optimization." }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const results = [];
    for (const type of ["withAI", "withoutAI"]) {
      const proj = data[type] || {};
      const [p] = await db.insert(timeMachineProjections).values({ userId, projectionType: type === "withAI" ? "with_ai" : "without_ai", subscribers: proj.subscribers || [], revenue: proj.revenue || [], views: proj.views || [], engagement: proj.engagement || [], milestones: proj.milestones || [], timeframeMonths: 6 }).returning();
      results.push(p);
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: "Failed to project" }); }
});

router.get("/api/nexus/momentum", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [snap] = await db.select().from(momentumSnapshots).where(eq(momentumSnapshots.userId, userId)).orderBy(desc(momentumSnapshots.createdAt)).limit(1);
    res.json(snap || { score: 50, trend: "stable", platformBreakdown: {}, factors: [] });
  } catch (e) { res.status(500).json({ error: "Failed to fetch momentum" }); }
});

router.get("/api/nexus/peak-times", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const times = await db.select().from(peakTimeAnalysis).where(eq(peakTimeAnalysis.userId, userId));
    res.json(times);
  } catch (e) { res.status(500).json({ error: "Failed to fetch peak times" }); }
});

router.get("/api/nexus/platform-priority", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const ranks = await db.select().from(platformPriorityRanks).where(eq(platformPriorityRanks.userId, userId)).orderBy(platformPriorityRanks.rank);
    res.json(ranks);
  } catch (e) { res.status(500).json({ error: "Failed to fetch priorities" }); }
});

router.get("/api/nexus/revenue-attribution", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(revenueAttribution).where(eq(revenueAttribution.userId, userId)).orderBy(desc(revenueAttribution.createdAt)).limit(100);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch attribution" }); }
});

router.get("/api/nexus/marketplace", async (req, res) => {
  try {
    const listings = await db.select().from(creatorMarketplaceListings).where(eq(creatorMarketplaceListings.status, "active")).orderBy(desc(creatorMarketplaceListings.createdAt)).limit(50);
    res.json(listings);
  } catch (e) { res.status(500).json({ error: "Failed to fetch marketplace" }); }
});

router.post("/api/nexus/marketplace", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { title, description, category, price, deliveryDays, tags } = req.body;
    const [listing] = await db.insert(creatorMarketplaceListings).values({ userId, title, description, category, price, deliveryDays, tags }).returning();
    res.json(listing);
  } catch (e) { res.status(500).json({ error: "Failed to create listing" }); }
});

router.get("/api/nexus/content-vault", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const backups = await db.select().from(contentVaultBackups).where(eq(contentVaultBackups.userId, userId)).orderBy(desc(contentVaultBackups.createdAt)).limit(50);
    res.json(backups);
  } catch (e) { res.status(500).json({ error: "Failed to fetch vault" }); }
});

router.post("/api/nexus/contract-analyze", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { contractName, brandName, contractText } = req.body;
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a contract analysis AI for content creators. Analyze sponsorship/brand deal contracts and identify red flags, unfair terms, and suggest counter-offers. Return JSON: redFlags (array of {clause, risk, suggestion}), fairnessScore (0-100), suggestedCounterOffers (string array), summary (string)." }, { role: "user", content: `Analyze this contract from ${brandName}: ${contractText}` }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const [analysis] = await db.insert(contractAnalyses).values({ userId, contractName, brandName, contractText, redFlags: data.redFlags || [], fairnessScore: data.fairnessScore || 50, suggestedCounterOffers: data.suggestedCounterOffers || [], summary: data.summary || "", status: "completed" }).returning();
    res.json(analysis);
  } catch (e) { res.status(500).json({ error: "Failed to analyze contract" }); }
});

router.get("/api/nexus/anomalies", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const anomalies = await db.select().from(anomalyDetections).where(eq(anomalyDetections.userId, userId)).orderBy(desc(anomalyDetections.createdAt)).limit(20);
    res.json(anomalies);
  } catch (e) { res.status(500).json({ error: "Failed to fetch anomalies" }); }
});

router.get("/api/nexus/sentiment-timeline", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(sentimentTimeline).where(eq(sentimentTimeline.userId, userId)).orderBy(desc(sentimentTimeline.date)).limit(30);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch sentiment" }); }
});

router.get("/api/nexus/audience-overlaps", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(audienceOverlaps).where(eq(audienceOverlaps.userId, userId)).orderBy(desc(audienceOverlaps.collabPotential));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch overlaps" }); }
});

router.get("/api/nexus/hook-scores", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(hookScores).where(eq(hookScores.userId, userId)).orderBy(desc(hookScores.createdAt)).limit(20);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch hook scores" }); }
});

router.get("/api/nexus/thumbnail-tests", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(thumbnailAbTests).where(eq(thumbnailAbTests.userId, userId)).orderBy(desc(thumbnailAbTests.createdAt));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch thumbnail tests" }); }
});

router.get("/api/nexus/content-empire", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const nodes = await db.select().from(contentEmpireNodes).where(eq(contentEmpireNodes.userId, userId));
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: "Failed to fetch empire map" }); }
});

router.get("/api/nexus/cohort", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(cohortAnalysis).where(eq(cohortAnalysis.userId, userId)).orderBy(desc(cohortAnalysis.cohortDate));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch cohort data" }); }
});

router.get("/api/nexus/seo-lab", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(seoLabExperiments).where(eq(seoLabExperiments.userId, userId)).orderBy(desc(seoLabExperiments.createdAt));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch SEO lab" }); }
});

router.get("/api/nexus/team-inbox", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const messages = await db.select().from(teamInboxMessages).where(eq(teamInboxMessages.userId, userId)).orderBy(desc(teamInboxMessages.receivedAt)).limit(50);
    res.json(messages);
  } catch (e) { res.status(500).json({ error: "Failed to fetch inbox" }); }
});

router.get("/api/nexus/asset-library", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const assets = await db.select().from(assetLibrary).where(eq(assetLibrary.userId, userId)).orderBy(desc(assetLibrary.createdAt));
    res.json(assets);
  } catch (e) { res.status(500).json({ error: "Failed to fetch assets" }); }
});

router.post("/api/nexus/asset-library", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { name, assetType, category, url, tags } = req.body;
    const [asset] = await db.insert(assetLibrary).values({ userId, name, assetType, category, url, tags }).returning();
    res.json(asset);
  } catch (e) { res.status(500).json({ error: "Failed to add asset" }); }
});

router.get("/api/nexus/reports", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const reports = await db.select().from(customReports).where(eq(customReports.userId, userId)).orderBy(desc(customReports.createdAt));
    res.json(reports);
  } catch (e) { res.status(500).json({ error: "Failed to fetch reports" }); }
});

router.get("/api/nexus/email-lists", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const lists = await db.select().from(emailLists).where(eq(emailLists.userId, userId));
    res.json(lists);
  } catch (e) { res.status(500).json({ error: "Failed to fetch lists" }); }
});

router.get("/api/nexus/discord-bot", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [config] = await db.select().from(discordBotConfig).where(eq(discordBotConfig.userId, userId)).limit(1);
    res.json(config || { botName: "CreatorBot", isActive: false, autoModeration: true, features: {} });
  } catch (e) { res.status(500).json({ error: "Failed to fetch bot config" }); }
});

router.get("/api/nexus/merch", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const items = await db.select().from(merchStoreItems).where(eq(merchStoreItems.userId, userId));
    res.json(items);
  } catch (e) { res.status(500).json({ error: "Failed to fetch merch" }); }
});

router.get("/api/nexus/tips", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(tipDonations).where(eq(tipDonations.userId, userId)).orderBy(desc(tipDonations.receivedAt)).limit(50);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch tips" }); }
});

router.get("/api/nexus/achievements", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(growthCelebrations).where(eq(growthCelebrations.userId, userId)).orderBy(desc(growthCelebrations.achievedAt));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch achievements" }); }
});

router.get("/api/nexus/balance-score", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [entry] = await db.select().from(contentLifeBalance).where(eq(contentLifeBalance.userId, userId)).orderBy(desc(contentLifeBalance.createdAt)).limit(1);
    res.json(entry || { balanceScore: 50, workHoursWeekly: 0, stressLevel: "normal", breakSuggested: false });
  } catch (e) { res.status(500).json({ error: "Failed to fetch balance" }); }
});

router.get("/api/nexus/failover-rules", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rules = await db.select().from(platformFailoverRules).where(eq(platformFailoverRules.userId, userId));
    res.json(rules);
  } catch (e) { res.status(500).json({ error: "Failed to fetch rules" }); }
});

router.get("/api/nexus/creator-clone", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [config] = await db.select().from(creatorCloneConfig).where(eq(creatorCloneConfig.userId, userId)).limit(1);
    res.json(config || { cloneName: "AI Assistant", personality: "friendly", isActive: false, totalInteractions: 0 });
  } catch (e) { res.status(500).json({ error: "Failed to fetch clone" }); }
});

router.get("/api/nexus/ai-personality", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const [config] = await db.select().from(aiPersonalityConfig).where(eq(aiPersonalityConfig.userId, userId)).limit(1);
    res.json(config || { aiName: "Nova", personality: "professional", traits: ["analytical", "encouraging", "direct"], isOpinionated: true });
  } catch (e) { res.status(500).json({ error: "Failed to fetch personality" }); }
});

router.post("/api/nexus/ai-personality", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { aiName, personality, traits, communicationStyle, isOpinionated } = req.body;
    const existing = await db.select().from(aiPersonalityConfig).where(eq(aiPersonalityConfig.userId, userId)).limit(1);
    if (existing.length) {
      const [updated] = await db.update(aiPersonalityConfig).set({ aiName, personality, traits, communicationStyle, isOpinionated, updatedAt: new Date() }).where(eq(aiPersonalityConfig.id, existing[0].id)).returning();
      return res.json(updated);
    }
    const [config] = await db.insert(aiPersonalityConfig).values({ userId, aiName, personality, traits, communicationStyle, isOpinionated }).returning();
    res.json(config);
  } catch (e) { res.status(500).json({ error: "Failed to save personality" }); }
});

router.post("/api/nexus/voice-command", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { command } = req.body;
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a voice command parser for a creator platform. Parse natural language commands into actions. Return JSON: parsedIntent, action (schedule_post, analyze_content, check_stats, generate_script, etc), parameters (object), result (string describing what was done)." }, { role: "user", content: command }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const [log] = await db.insert(voiceCommandLog).values({ userId, command, parsedIntent: data.parsedIntent, action: data.action, parameters: data.parameters || {}, result: data.result, status: "processed" }).returning();
    res.json(log);
  } catch (e) { res.status(500).json({ error: "Failed to process command" }); }
});

router.get("/api/nexus/ai-learning", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(aiLearningSnapshots).where(eq(aiLearningSnapshots.userId, userId)).orderBy(desc(aiLearningSnapshots.createdAt)).limit(20);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch learning data" }); }
});

router.post("/api/nexus/script-generate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { title, topic, targetLength, style } = req.body;
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a video script writer for content creators. Write engaging scripts with strong hooks. Return JSON: script (full script text), hookOptions (3 alternative hooks as array), callToAction (string), seoKeywords (array of 5-10 keywords)." }, { role: "user", content: `Write a ${targetLength || "medium"} length ${style || "educational"} video script about: ${topic || title}` }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const [script] = await db.insert(scriptGenerations).values({ userId, title: title || topic, topic, targetLength, style, script: data.script, hookOptions: data.hookOptions || [], callToAction: data.callToAction, seoKeywords: data.seoKeywords || [], status: "completed" }).returning();
    res.json(script);
  } catch (e) { res.status(500).json({ error: "Failed to generate script" }); }
});

router.get("/api/nexus/scripts", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(scriptGenerations).where(eq(scriptGenerations.userId, userId)).orderBy(desc(scriptGenerations.createdAt));
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch scripts" }); }
});

router.get("/api/nexus/content-atomizer", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const jobs = await db.select().from(contentAtomizerJobs).where(eq(contentAtomizerJobs.userId, userId)).orderBy(desc(contentAtomizerJobs.createdAt));
    res.json(jobs);
  } catch (e) { res.status(500).json({ error: "Failed to fetch atomizer jobs" }); }
});

router.post("/api/nexus/content-atomizer", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { sourceTitle, sourcePlatform } = req.body;
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are a content atomizer. Take one piece of content and split it into optimized versions for multiple platforms. Return JSON: outputs (array of {platform, contentType, title, description, status: 'ready'})." }, { role: "user", content: `Atomize this content for all platforms: "${sourceTitle}" from ${sourcePlatform}. Create versions for YouTube, TikTok, X/Twitter, Instagram, Discord.` }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    const outputs = data.outputs || [];
    const [job] = await db.insert(contentAtomizerJobs).values({ userId, sourceTitle, sourcePlatform, outputs, totalOutputs: outputs.length, completedOutputs: outputs.length, status: "completed" }).returning();
    res.json(job);
  } catch (e) { res.status(500).json({ error: "Failed to atomize content" }); }
});

router.get("/api/nexus/viral-chains", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const data = await db.select().from(viralChainEvents).where(eq(viralChainEvents.userId, userId)).orderBy(desc(viralChainEvents.createdAt)).limit(30);
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to fetch viral chains" }); }
});

router.get("/api/nexus/networks", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const memberships = await db.select().from(networkMemberships).where(eq(networkMemberships.userId, userId));
    const networkIds = memberships.map(m => m.networkId);
    let networks: any[] = [];
    if (networkIds.length) {
      for (const nid of networkIds) {
        const [n] = await db.select().from(creatorNetworks).where(eq(creatorNetworks.id, nid));
        if (n) networks.push(n);
      }
    }
    res.json(networks);
  } catch (e) { res.status(500).json({ error: "Failed to fetch networks" }); }
});

router.post("/api/nexus/networks", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { name, description, category } = req.body;
    const [network] = await db.insert(creatorNetworks).values({ name, description, ownerId: userId, category }).returning();
    await db.insert(networkMemberships).values({ networkId: network.id, userId, role: "owner" });
    res.json(network);
  } catch (e) { res.status(500).json({ error: "Failed to create network" }); }
});

router.post("/api/nexus/daily-briefing/generate", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Generate a morning briefing for a content creator. Include: overnight summary (what happened while they slept), today's action items, key metrics changes, content scheduled, opportunities spotted, and a motivational note. Return JSON: title, overnightSummary, actionItems (array of strings), metricsChanges (object), contentScheduled (array), opportunities (array of strings), motivation (string)." }, { role: "user", content: "Generate today's morning briefing for a multi-platform gaming creator." }],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(response.choices[0].message.content || "{}");
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Failed to generate briefing" }); }
});

router.get("/api/nexus/autonomy/status", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const status = await getAutonomyStatus(userId);
    res.json(status);
  } catch (e) { res.status(500).json({ error: "Failed to get autonomy status" }); }
});

router.get("/api/nexus/autonomy/decisions", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const log = await getAutonomyDecisionLog(userId, 50);
    res.json(log);
  } catch (e) { res.status(500).json({ error: "Failed to get decision log" }); }
});

router.get("/api/nexus/autonomy/runs", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const runs = await getRecentRuns(userId, 50);
    res.json(runs);
  } catch (e) { res.status(500).json({ error: "Failed to get engine runs" }); }
});

router.post("/api/nexus/autonomy/toggle-engine", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { engineName, enabled } = req.body;
    const result = await toggleEngine(userId, engineName, enabled);
    res.json(result);
  } catch (e) { res.status(500).json({ error: "Failed to toggle engine" }); }
});

router.post("/api/nexus/autonomy/force-run", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const { engineName } = req.body;
    const result = await forceRunEngine(userId, engineName);
    res.json(result);
  } catch (e) { res.status(500).json({ error: "Failed to force run engine" }); }
});

