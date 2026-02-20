import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, sql, lte, isNotNull } from "drizzle-orm";
import { requireAuth, asyncHandler } from "./helpers";
import { cached } from "../lib/cache";
import {
  streamPipelines, vodCuts, lengthExperiments, audienceLengthPreferences,
  LIVE_PIPELINE_STEPS, VOD_PIPELINE_STEPS, LENGTH_CATEGORIES,
  streams, videos
} from "@shared/schema";

import { getOpenAIClient } from "../lib/openai";
import { getRetentionBeatsPromptContext } from "../retention-beats-engine";

function getOpenAI() {
  return getOpenAIClient();
}

function getStepsForType(pipelineType: string) {
  return pipelineType === "live"
    ? LIVE_PIPELINE_STEPS.map(s => s.id)
    : VOD_PIPELINE_STEPS.map(s => s.id);
}

function getStepDefinitions(pipelineType: string) {
  return pipelineType === "live" ? LIVE_PIPELINE_STEPS : VOD_PIPELINE_STEPS;
}

function gaussianRandom(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stddev + mean;
}

function calculateHumanVodDelay(): { delayMinutes: number; scheduledAt: Date } {
  const baseDelayHours = gaussianRandom(4, 2);
  const clampedHours = Math.max(1.5, Math.min(12, baseDelayHours));

  const now = new Date();
  const currentHour = now.getUTCHours();

  const isNighttime = currentHour >= 1 && currentHour <= 8;
  let extraHours = 0;
  if (isNighttime) {
    extraHours = 8 - currentHour + gaussianRandom(2, 1);
  }

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const weekendMultiplier = isWeekend ? 1.3 : 1.0;

  const totalMinutes = Math.round((clampedHours + extraHours) * weekendMultiplier * 60);
  const jitterMinutes = Math.round(gaussianRandom(0, 15));
  const finalMinutes = Math.max(90, totalMinutes + jitterMinutes);

  const scheduledAt = new Date(now.getTime() + finalMinutes * 60000);
  return { delayMinutes: finalMinutes, scheduledAt };
}

async function spawnVodPipelineAfterPublish(
  sourcePipelineId: number,
  userId: string,
  sourceTitle: string,
  sourceDuration: number | null,
  publishedContentType: string
) {
  const existing = await db.select().from(streamPipelines)
    .where(and(
      eq(streamPipelines.userId, userId),
      eq(streamPipelines.pipelineType, "vod"),
      eq(streamPipelines.sourcePipelineId, sourcePipelineId)
    ));

  if (existing.length > 0) {
    console.log(`[DualPipeline] VOD pipeline already exists for source ${sourcePipelineId}, skipping`);
    return existing[0];
  }

  const { delayMinutes, scheduledAt } = calculateHumanVodDelay();

  const [vodPipeline] = await db.insert(streamPipelines).values({
    userId,
    pipelineType: "vod",
    currentStep: "ingest",
    status: "waiting",
    completedSteps: [],
    stepResults: {},
    vodCutIds: [],
    sourceTitle: `[VOD] ${sourceTitle}`,
    sourceDuration: sourceDuration || null,
    mode: "vod",
    autoProcess: true,
    sourcePipelineId,
    publishedContentType,
    scheduledStartAt: scheduledAt,
    humanDelayMinutes: delayMinutes,
  }).returning();

  console.log(`[DualPipeline] VOD pipeline ${vodPipeline.id} queued for source ${sourcePipelineId} — starts in ${delayMinutes} min (${scheduledAt.toISOString()})`);
  return vodPipeline;
}

async function processWaitingVodPipelines() {
  const now = new Date();
  const waiting = await db.select().from(streamPipelines)
    .where(and(
      eq(streamPipelines.pipelineType, "vod"),
      eq(streamPipelines.status, "waiting"),
      isNotNull(streamPipelines.scheduledStartAt),
      lte(streamPipelines.scheduledStartAt, now)
    ));

  for (const pipeline of waiting) {
    if (pipeline.sourcePipelineId) {
      const [srcPipeline] = await db.select().from(streamPipelines)
        .where(eq(streamPipelines.id, pipeline.sourcePipelineId));
      if (!srcPipeline || srcPipeline.status !== "completed") {
        console.log(`[DualPipeline] VOD pipeline ${pipeline.id} source ${pipeline.sourcePipelineId} not completed — skipping`);
        continue;
      }
    }

    console.log(`[DualPipeline] VOD pipeline ${pipeline.id} delay elapsed — starting execution`);
    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, pipeline.id));

    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const completedSteps = [...(pipeline.completedSteps || [])];

    executeStreamPipelineInBackground(
      pipeline.id, pipeline.sourceTitle, "vod",
      currentResults, completedSteps,
      pipeline.sourceDuration, pipeline.userId
    ).catch(err => console.error(`[DualPipeline] Auto VOD pipeline ${pipeline.id} failed:`, err));
  }

  if (waiting.length > 0) {
    console.log(`[DualPipeline] Started ${waiting.length} waiting VOD pipeline(s)`);
  }
}

async function processQueuedPipelines() {
  const queued = await db.select().from(streamPipelines)
    .where(and(
      eq(streamPipelines.status, "queued"),
      eq(streamPipelines.autoProcess, true),
    ))
    .orderBy(streamPipelines.createdAt)
    .limit(5);

  for (const pipeline of queued) {
    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const completedSteps = [...(pipeline.completedSteps || [])];

    console.log(`[DualPipeline] Auto-starting queued pipeline ${pipeline.id}: "${pipeline.sourceTitle}"`);
    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: pipeline.startedAt || new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, pipeline.id));

    executeStreamPipelineInBackground(
      pipeline.id, pipeline.sourceTitle, pipeline.pipelineType,
      currentResults, completedSteps,
      pipeline.sourceDuration, pipeline.userId
    ).catch(err => console.error(`[DualPipeline] Auto-start failed for pipeline ${pipeline.id}:`, err));
  }

  if (queued.length > 0) {
    console.log(`[DualPipeline] Auto-started ${queued.length} queued pipeline(s)`);
  }
}

setInterval(() => {
  processWaitingVodPipelines().catch(err =>
    console.error("[DualPipeline] VOD waiting check error:", err)
  );
  processQueuedPipelines().catch(err =>
    console.error("[DualPipeline] Queued pipeline check error:", err)
  );
}, 60000);

async function runStreamPipelineStep(
  stepId: string,
  sourceTitle: string,
  pipelineType: string,
  existingResults: Record<string, any>,
  sourceDuration?: number | null,
  userId?: string | null
) {
  const openai = await getOpenAI();
  const ctx = (key: string) => JSON.stringify(existingResults[key] || {});
  const durStr = sourceDuration ? `${Math.round(sourceDuration / 60)} minutes` : "unknown duration";

  const typeLabel = pipelineType === "live" ? "live stream" : "video";
  const isVod = pipelineType === "vod";
  const originalLiveTitle = isVod ? sourceTitle.replace(/^\[VOD\]\s*/, "") : sourceTitle;
  const replayContext = isVod
    ? ` This is a VOD replay/highlight pulled from the original live stream "${originalLiveTitle}". All SEO, titles, descriptions, tags, and thumbnails MUST clearly indicate this is a replay of a live stream and link back to the original. Use phrases like "FULL STREAM REPLAY", "Live Highlight", "From the Live Stream", "Watch the Original Live" etc.`
    : "";

  const prompts: Record<string, string> = {
    detect: isVod
      ? `A VOD replay of the live stream "${originalLiveTitle}" (${durStr}) detected. This content was pulled from a completed live stream. Confirm detection, extract metadata, and note the original live stream reference. Return JSON: { detected: true, sourceType: "vod", isReplayOfLive: true, originalLiveTitle: "${originalLiveTitle}", title: string, estimatedDuration: number, platform: string, category: string }`
      : `A ${typeLabel} titled "${sourceTitle}" (${durStr}) detected. Confirm detection, extract metadata. Return JSON: { detected: true, sourceType: "${pipelineType}", title: string, estimatedDuration: number, platform: string, category: string }`,
    live_seo_boost: `Live stream "${sourceTitle}" just started. Context: ${ctx("detect")}. Optimize the live stream for discovery RIGHT NOW across YouTube, Twitch, Kick, TikTok, X, Discord. Generate SEO-optimized title rewrites, descriptions, and keyword strategies for each platform so viewers searching for this game/topic find the stream immediately. Return JSON: { platforms: array of {platform: string, optimizedTitle: string, liveDescription: string, topKeywords: array, searchTermsToTarget: array, categoryTags: array}, overallDiscoverabilityScore: number, urgentActions: array, trendingSearchTerms: array }`,
    live_thumbnail: `Live stream "${sourceTitle}" is active. Context: ${ctx("detect")}, ${ctx("live_seo_boost")}. Generate thumbnail concepts optimized for LIVE discovery on YouTube, Twitch, Kick, TikTok. Include "LIVE" badge placement, face-cam frame suggestions, game overlay text, and attention-grabbing colors. Thumbnails should make scrollers stop and click. Return JSON: { thumbnails: array of {platform: string, concept: string, textOverlay: string, liveBadgePlacement: string, colorScheme: array, emotionTarget: string, ctrEstimate: number}, pushPlan: array of {platform: string, method: string, timing: string}, midStreamUpdateStrategy: string }`,
    live_announce: `Live stream "${sourceTitle}" just went live. Context: ${ctx("detect")}, ${ctx("live_seo_boost")}. Generate unique "I'm live!" announcements for all 6 platforms (YouTube Community, Twitch, Kick, TikTok, X post, Discord). Each must match platform voice — casual for Discord, hype for TikTok, professional for YouTube, thread-style for X. Include links, hashtags, and engagement hooks. Return JSON: { announcements: array of {platform: string, message: string, hashtags: array, callToAction: string, tone: string, postType: string}, postingOrder: array of {platform: string, delaySeconds: number, reason: string}, crossPromotionLinks: object }`,
    live_discovery_tags: `Live stream "${sourceTitle}" is broadcasting. Context: ${ctx("detect")}, ${ctx("live_seo_boost")}. Research and generate trending tags, hashtags, and category labels for ALL live platforms right now. What are people searching for in this game/topic at this exact moment? Push trending tags to maximize live viewer discovery. Return JSON: { platforms: array of {platform: string, trendingTags: array, hashtags: array, categoryLabel: string, discoveryScore: number}, globalTrendingTopics: array of {topic: string, volume: number, relevance: number}, tagUpdateSchedule: array of {minutesFromNow: number, action: string, reason: string}, overallDiscoveryScore: number }`,
    ingest: isVod
      ? `Ingesting VOD replay of live stream "${originalLiveTitle}" (${durStr}). This is a replay pulled from a completed live stream. Extract format, resolution, audio tracks, chapters, and note original live stream reference. Return JSON: { ingested: true, format: string, resolution: string, audioTracks: number, chapters: array, fileSize: string, isReplayOfLive: true, originalLiveTitle: "${originalLiveTitle}" }`
      : `Ingesting ${typeLabel} "${sourceTitle}" (${durStr}). Extract format, resolution, audio tracks, chapters. Return JSON: { ingested: true, format: string, resolution: string, audioTracks: number, chapters: array, fileSize: string }`,
    analyze: `Analyze ${typeLabel} "${sourceTitle}" (${durStr}). Context: ${ctx("detect")}. Key moments, segments, clip opportunities, engagement peaks. Return JSON: { keyMoments: array of {timestamp: number, description: string, score: number}, segments: array, highlights: array, category: string, engagementPeaks: array, summary: string }`,
    chat_sentiment: `Analyze chat sentiment during ${typeLabel} "${sourceTitle}". Context: ${ctx("analyze")}. Score mood over time, toxicity levels, hype moments, emote patterns. Return JSON: { overallMood: string, moodScore: number, toxicityLevel: number, hypeMoments: array of {timestamp: number, intensity: number, trigger: string}, topEmotes: array, chatVelocityPeaks: array, recommendations: array }`,
    highlights: `Extract top highlights from ${typeLabel} "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. Identify kills, clutches, funny moments, epic plays. Return JSON: { highlights: array of {timestamp: number, endTime: number, type: string, description: string, viralScore: number, suggestedCaption: string}, totalHighlights: number, topMoment: object }`,
    trend_detect: `Detect trending topics matching "${sourceTitle}". Context: ${ctx("analyze")}. Find trending games, hashtags, topics, challenges. Return JSON: { trendingTopics: array of {topic: string, volume: number, relevance: number, platform: string}, trendScore: number, recommendations: array, risingTrends: array }`,
    niche_analyze: `Analyze competitive niche for "${sourceTitle}". Context: ${ctx("analyze")}. Market position, saturation, opportunity gaps, differentiators. Return JSON: { nicheScore: number, saturationLevel: string, topCompetitors: array, differentiators: array, opportunities: array, threatLevel: string, recommendations: array }`,
    content_dna: `Extract content DNA fingerprint from "${sourceTitle}". Context: ${ctx("analyze")}. Style markers, pacing, humor type, energy level, unique patterns. Return JSON: { styleMarkers: array, pacingScore: number, humorType: string, energyLevel: number, uniquePatterns: array, contentPersonality: string, dnaHash: string, recommendations: array }`,
    competitor_dive: `Deep competitor analysis for "${sourceTitle}" niche. Context: ${ctx("niche_analyze")}. Top 5 competitors, their strategies, gaps to exploit. Return JSON: { competitors: array of {name: string, subscribers: string, avgViews: string, strengths: array, weaknesses: array, strategy: string}, gaps: array, actionPlan: array }`,
    viral_predict: `Score viral potential for "${sourceTitle}". Context: ${ctx("analyze")}, ${ctx("trend_detect")}. Shareability, hook strength, emotional triggers, platform fit. Return JSON: { viralScore: number, shareabilityScore: number, hookStrength: number, emotionalTriggers: array, platformScores: object, viralFactors: array, boostRecommendations: array }`,
    audience_psycho: `Psychographic profile of target audience for "${sourceTitle}". Context: ${ctx("analyze")}. Motivations, values, pain points, content preferences. Return JSON: { primaryPersona: object, motivations: array, values: array, painPoints: array, contentPreferences: array, engagementDrivers: array, messagingAngles: array }`,
    title: isVod
      ? `Generate 5 optimized titles for the VOD replay of live stream "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Titles MUST clearly indicate this is a stream replay/highlight (e.g. "FULL STREAM REPLAY: ${originalLiveTitle}", "[STREAM HIGHLIGHT] ...", "Live Replay: ..."). Include the original stream name. Under 60 chars, click-worthy. Return JSON: { titles: array of {title: string, hookType: string, estimatedCTR: number, replayIndicator: string}, originalLiveTitle: "${originalLiveTitle}" }`
      : `Generate 5 optimized titles for "${sourceTitle}". Context: ${ctx("analyze")}. Click-worthy, under 60 chars, power words. Return JSON: { titles: array of {title: string, hookType: string, estimatedCTR: number} }`,
    title_ab: `A/B test the titles for "${sourceTitle}". Context: ${ctx("title")}. Pick best 2 titles, predict winner, analyze psychology. Return JSON: { variantA: object, variantB: object, predictedWinner: string, confidence: number, psychologyAnalysis: string, testDuration: string }`,
    hook_gen: isVod
      ? `Generate 5 first-3-second hooks for VOD replay of "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Hooks should acknowledge this is a replay and create urgency ("You missed this INSANE live moment...", "The stream that broke the internet — here's the replay"). Return JSON: { hooks: array of {text: string, type: string, emotionalTrigger: string, estimatedRetention: number}, bestHook: string }`
      : `Generate 5 first-3-second hooks for "${sourceTitle}". Context: ${ctx("analyze")}. Pattern interrupts, curiosity gaps, shock value. Return JSON: { hooks: array of {text: string, type: string, emotionalTrigger: string, estimatedRetention: number}, bestHook: string }`,
    description: isVod
      ? `Write SEO-optimized description for VOD replay of live stream "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. MUST include: (1) First line clearly stating this is a replay/highlight from a live stream, (2) Link placeholder "[LINK TO ORIGINAL LIVE STREAM]" in the first 3 lines, (3) "Watch the original live stream" CTA, (4) Timestamps of best moments, (5) Keywords including "stream replay", "live highlight", "full stream". Return JSON: { description: string, keywords: array, seoScore: number, originalStreamLink: "[LINK TO ORIGINAL LIVE STREAM]", replayIndicators: array }`
      : `Write SEO-optimized description for "${sourceTitle}". Context: ${ctx("analyze")}. Compelling first 2 lines, timestamps, keywords, CTA. Return JSON: { description: string, keywords: array, seoScore: number }`,
    tags: isVod
      ? `Generate optimized tags for VOD replay of live stream "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Tags MUST include replay/live-specific terms: "stream replay", "live highlight", "full stream", "live gaming", "${originalLiveTitle} replay". 15 YouTube tags, 5 hashtags, trending suggestions. Return JSON: { tags: array, hashtags: array, trendingTags: array, replayTags: array }`
      : `Generate optimized tags for "${sourceTitle}". Context: ${ctx("analyze")}. 15 YouTube tags, 5 hashtags, trending suggestions. Return JSON: { tags: array, hashtags: array, trendingTags: array }`,
    hashtag_strat: `Cross-platform hashtag strategy for "${sourceTitle}". Context: ${ctx("tags")}. Platform-specific hashtag sets, volume, competition. Return JSON: { platforms: object with youtube/tiktok/x/instagram keys each having hashtags array, volumeScores: object, competitionLevels: object, recommendations: array }`,
    caption_gen: `Generate captions & subtitles plan for "${sourceTitle}". Context: ${ctx("analyze")}. Key quotes, subtitle timing, accessibility notes. Return JSON: { captions: array of {timestamp: number, text: string, speaker: string}, keyQuotes: array, accessibilityNotes: array, languages: array }`,
    thumbnail: isVod
      ? `Suggest 3 thumbnail concepts for VOD replay of live stream "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Thumbnails MUST include a visible "REPLAY" or "STREAM REPLAY" or "FULL STREAM" badge/text overlay to clearly distinguish from original live thumbnails. Use different color treatment (e.g. blue/purple tint for replay vs red for live). Include the original stream title text. Return JSON: { concepts: array of {visual: string, textOverlay: string, replayBadge: string, colors: array, emotion: string, ctrImpact: string, differentiationFromLive: string} }`
      : `Suggest 3 thumbnail concepts for "${sourceTitle}". Context: ${ctx("analyze")}. Visual, text overlay, colors, emotion. Return JSON: { concepts: array of {visual: string, textOverlay: string, colors: array, emotion: string, ctrImpact: string} }`,
    thumb_ab: `A/B test thumbnail concepts for "${sourceTitle}". Context: ${ctx("thumbnail")}. Pick top 2, predict CTR difference, eye-tracking analysis. Return JSON: { variantA: object, variantB: object, predictedWinner: string, ctrDifference: number, eyeTrackingNotes: string, colorPsychology: string }`,
    retention_hooks: `Generate retention hooks for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}, ${ctx("retention_analyze") || "{}"}, retention_beats: ${ctx("retention_beats_scan") || "{}"}. Use the retention beats scan results to place hooks at scientifically-proven moments. Identify the exact moments where viewers are likely to drop off and create re-engagement hooks for each one. Include verbal hooks (things to say), visual hooks (things to show), and tease hooks (previewing what's coming). For live: real-time prompts the streamer can use. For VOD: edit markers for post-production. Return JSON: { dropOffPoints: array of {timestamp: number, retentionPct: number, severity: string}, hooks: array of {timestamp: number, type: string, hookText: string, visualSuggestion: string, teaseNext: string, expectedRetentionLift: number, beatReference: string}, overallRetentionScore: number, criticalSavePoints: array, openLoopStrategies: array of {description: string, setupTimestamp: number, payoffTimestamp: number} }`,
    pattern_interrupts: `Plan pattern interrupts for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}, ${ctx("retention_hooks")}. Design visual, audio, and pacing changes that reset viewer attention every 2-3 minutes. Include zoom cuts, music shifts, graphic overlays, text pop-ups, sound effects, camera angle changes, and energy shifts. For live: overlay triggers and alert suggestions. For VOD: edit timeline with exact cut points. Return JSON: { interrupts: array of {timestamp: number, type: string, description: string, duration: number, intensity: string, editInstruction: string}, pacingMap: array of {startTime: number, endTime: number, energy: string, suggestedTempo: string}, audioShifts: array of {timestamp: number, fromStyle: string, toStyle: string, reason: string}, visualEffects: array of {timestamp: number, effect: string, purpose: string}, intervalStrategy: string, totalInterrupts: number }`,
    engagement_inserts: `Design on-screen engagement elements for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}, ${ctx("retention_hooks")}, ${ctx("pattern_interrupts")}. Create polls, questions, subscribe reminders, comment prompts, teasers, countdown timers, and interactive CTAs placed at strategic moments throughout the content. For live: chat interaction prompts and overlay triggers. For VOD: lower-third graphics, pinned comments, and card placements. Return JSON: { inserts: array of {timestamp: number, type: string, content: string, duration: number, position: string, style: string, expectedEngagementLift: number}, subscribeCTAs: array of {timestamp: number, trigger: string, message: string}, commentPrompts: array of {timestamp: number, question: string, reason: string}, teasers: array of {timestamp: number, teaseContent: string, payoffTimestamp: number}, interactiveElements: array of {type: string, timestamp: number, options: array}, totalInserts: number }`,
    pacing_optimizer: `Optimize pacing for maximum watch-through on "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}, ${ctx("retention_hooks")}, ${ctx("pattern_interrupts")}, ${ctx("engagement_inserts")}. Analyze the entire content structure and suggest re-ordering, trimming dead air, accelerating slow sections, adding breather moments after intense sections, and creating a rhythm that keeps viewers locked in. For live: segment timing recommendations. For VOD: full edit timeline with trim/cut/speed suggestions. Return JSON: { pacingScore: number, segments: array of {startTime: number, endTime: number, currentPacing: string, suggestedPacing: string, action: string, reason: string}, trimSuggestions: array of {startTime: number, endTime: number, reason: string, timeSaved: number}, speedAdjustments: array of {startTime: number, endTime: number, speedMultiplier: number, reason: string}, deadAirMoments: array of {timestamp: number, duration: number, fix: string}, rhythmMap: string, estimatedRetentionImprovement: number, idealTotalLength: number }`,
    seo_audit: isVod
      ? `Full SEO audit for VOD replay of "${originalLiveTitle}".${replayContext} Context: ${ctx("title")}, ${ctx("description")}, ${ctx("tags")}. Verify that title, description, and tags all clearly indicate this is a replay/highlight from a live stream. Check for original stream link reference. Score replay-specific SEO signals. Return JSON: { overallScore: number, titleScore: number, descriptionScore: number, tagScore: number, replaySignalScore: number, originalStreamLinkPresent: boolean, recommendations: array, competitorGaps: array, replaySpecificImprovements: array }`
      : `Full SEO audit for "${sourceTitle}". Context: ${ctx("title")}, ${ctx("description")}, ${ctx("tags")}. Keyword density, search intent, competitor gaps. Return JSON: { overallScore: number, titleScore: number, descriptionScore: number, tagScore: number, recommendations: array, competitorGaps: array }`,
    seo_keywords: `Track & analyze keywords for "${sourceTitle}". Context: ${ctx("seo_audit")}. Target keywords, search volume, ranking difficulty, position tracking. Return JSON: { keywords: array of {keyword: string, volume: number, difficulty: number, currentRank: number, opportunity: string}, topKeyword: string, recommendations: array }`,
    seo_opportunities: `Find SEO gaps for "${sourceTitle}". Context: ${ctx("seo_audit")}, ${ctx("seo_keywords")}. Untapped keywords, competitor keywords to target, content gaps. Return JSON: { opportunities: array of {keyword: string, volume: number, competition: string, difficulty: number, estimatedTraffic: number}, quickWins: array, longTermPlays: array }`,
    retention_analyze: `Predict retention curve for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. Drop-off points, re-engagement hooks, optimal length. Return JSON: { retentionCurve: array of {timestamp: number, retentionPct: number}, dropOffPoints: array, avgViewDuration: number, optimalLength: number, recommendations: array }`,
    end_screen: `Optimize end screen for "${sourceTitle}". Context: ${ctx("analyze")}. Element placement, CTA timing, card suggestions. Return JSON: { endScreenElements: array of {type: string, position: string, timing: number, content: string}, cardSuggestions: array, ctaScript: string, optimalEndScreenStart: number }`,
    playlist_opt: `Optimize playlist placement for "${sourceTitle}". Context: ${ctx("analyze")}, ${ctx("seo_audit")}. Best playlist, position, series suggestions. Return JSON: { recommendedPlaylist: string, position: number, serieSuggestions: array, playlistSeoBoost: number, recommendations: array }`,
    clips: `Identify best 3-5 clip opportunities from "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. Start/end times, hook, caption, target platform. Return JSON: { clips: array of {startTime: number, endTime: number, duration: number, hook: string, caption: string, platform: string, estimatedViews: number} }`,
    cut_vods: `Optimal VOD cuts for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. Micro (30s), short (3min), medium (10min), long (20min). Return JSON: { cuts: array of {lengthCategory: string, targetLength: number, startTimestamp: number, endTimestamp: number, title: string, hook: string, reasoning: string, confidenceScore: number} }`,
    shorts_strat: `Shorts/TikTok strategy for "${sourceTitle}". Context: ${ctx("clips")}, ${ctx("analyze")}. Best vertical clips, trending audio, caption style. Return JSON: { shorts: array of {concept: string, duration: number, hook: string, trendingAudio: string, captionStyle: string, platform: string, estimatedReach: number}, postingOrder: array, recommendations: array }`,
    repurpose: isVod
      ? `Cross-platform repurpose plan for VOD replay of "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Each platform post MUST reference the original live stream and include a link back. Frame as "Missed the stream? Here's the replay" or "Best moments from the live stream". Return JSON: { posts: array of {platform: string, content: string, hashtags: array, tone: string, originalStreamReference: string}, originalLiveTitle: "${originalLiveTitle}" }`
      : `Cross-platform repurpose plan for "${sourceTitle}". Context: ${ctx("analyze")}. Unique posts for YouTube, Twitch, Kick, TikTok, X, Discord. Return JSON: { posts: array of {platform: string, content: string, hashtags: array, tone: string} }`,
    community_post: isVod
      ? `Generate community announcements for VOD replay of "${originalLiveTitle}".${replayContext} Context: ${ctx("analyze")}. Announcements should say the stream replay is now available, link to both the replay and original live stream, and create FOMO for people who missed it live. Return JSON: { youtubePost: string, discordAnnouncement: string, twitterThread: array, engagementQuestion: string, pollIdea: object, originalStreamLink: "[LINK TO ORIGINAL LIVE STREAM]" }`
      : `Generate community announcements for "${sourceTitle}". Context: ${ctx("analyze")}. YouTube community post, Discord announcement, engagement hooks. Return JSON: { youtubePost: string, discordAnnouncement: string, twitterThread: array, engagementQuestion: string, pollIdea: object }`,
    collab_pitch: `Draft collaboration pitches for "${sourceTitle}" niche. Context: ${ctx("competitor_dive")}. 3 outreach messages for different creator tiers. Return JSON: { pitches: array of {targetTier: string, subject: string, message: string, valueProposition: string, suggestedCollab: string}, tips: array }`,
    upload_time: `Calculate optimal upload times for "${sourceTitle}". Context: ${ctx("analyze")}. Per-platform peak hours, day of week, timezone considerations. Return JSON: { platforms: object with per-platform {bestTime: string, bestDay: string, timezone: string, reason: string}, globalOptimal: string, avoidTimes: array }`,
    schedule: `Posting schedule for "${sourceTitle}" across all platforms. Context: ${ctx("upload_time")}, ${ctx("analyze")}. Stagger strategy, human timing patterns. Return JSON: { schedule: array of {platform: string, suggestedTime: string, dayOfWeek: string, reason: string} }`,
    overlay_gen: `Generate stream overlay concepts for "${sourceTitle}". Context: ${ctx("analyze")}. Alert designs, info panels, branding elements. Return JSON: { overlays: array of {type: string, design: string, colors: array, animation: string, placement: string}, alertConcepts: array, brandingElements: array }`,
    raid_plan: `Plan raid targets after "${sourceTitle}". Context: ${ctx("analyze")}. Best streamers to raid, timing, mutual benefit analysis. Return JSON: { raidTargets: array of {streamer: string, reason: string, mutualBenefit: string, bestTiming: string, successProbability: number}, raidScript: string, networkingTips: array }`,
    audience_heatmap: `Generate watch-time heatmap for "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. Engagement intensity per segment, replay zones. Return JSON: { heatmap: array of {startTime: number, endTime: number, intensity: number, label: string}, hotZones: array, coldZones: array, replayZones: array, avgEngagement: number }`,
    audience_segments: `Segment viewers for "${sourceTitle}". Context: ${ctx("audience_psycho")}. Behavioral clusters, value segments, engagement tiers. Return JSON: { segments: array of {name: string, size: number, characteristics: array, value: string, engagementLevel: string}, recommendations: array }`,
    audience_sentiment: `Overall audience sentiment for "${sourceTitle}". Context: ${ctx("analyze")}, ${ctx("chat_sentiment") || "{}"}. Positive/negative ratio, key themes, improvement areas. Return JSON: { sentimentScore: number, positiveRatio: number, negativeRatio: number, neutralRatio: number, keyThemes: array, improvementAreas: array, topPraises: array }`,
    audience_retention: `Viewer retention patterns for "${sourceTitle}". Context: ${ctx("retention_analyze")}. Rewatch behavior, loyalty indicators, return probability. Return JSON: { retentionRate: number, rewatchRate: number, loyaltyScore: number, returnProbability: number, retentionDrivers: array, churnRisks: array }`,
    audience_growth: `30/60/90-day growth forecast based on "${sourceTitle}" performance. Context: ${ctx("analyze")}, ${ctx("viral_predict")}. Subscriber projections, view trajectory. Return JSON: { day30: object, day60: object, day90: object, growthRate: number, projectedSubscribers: number, projectedViews: number, confidenceLevel: number, accelerators: array }`,
    audience_churn: `Churn risk analysis for "${sourceTitle}" audience. Context: ${ctx("audience_retention")}. At-risk segments, warning signs, prevention strategies. Return JSON: { churnRisk: number, atRiskSegments: array, warningSignals: array, preventionStrategies: array, reEngagementIdeas: array }`,
    audience_geo: `Geographic distribution of "${sourceTitle}" audience. Context: ${ctx("analyze")}. Top countries, timezone implications, localization opportunities. Return JSON: { topCountries: array of {country: string, percentage: number}, timezoneDistribution: object, localizationOpportunities: array, recommendations: array }`,
    audience_devices: `Device breakdown for "${sourceTitle}" audience. Context: ${ctx("analyze")}. Mobile/desktop/TV split, platform preferences, optimization tips. Return JSON: { devices: object, platformSplit: object, mobilePercentage: number, optimizationTips: array, formatRecommendations: array }`,
    audience_engage: `Per-viewer engagement scoring for "${sourceTitle}". Context: ${ctx("analyze")}. Engagement tiers, top fan indicators, interaction patterns. Return JSON: { avgEngagementScore: number, tiers: array of {tier: string, percentage: number, characteristics: array}, topFanIndicators: array, interactionPatterns: array }`,
    community_polls: `Generate community polls based on "${sourceTitle}". Context: ${ctx("analyze")}. 3 engaging poll ideas with options. Return JSON: { polls: array of {question: string, options: array, platform: string, expectedEngagement: number, timing: string} }`,
    community_challenge: `Create viewer challenges from "${sourceTitle}". Context: ${ctx("analyze")}. Participation challenges, reward ideas, rules. Return JSON: { challenges: array of {name: string, description: string, rules: array, reward: string, duration: string, expectedParticipation: number}, tips: array }`,
    community_giveaway: `Plan giveaway campaign for "${sourceTitle}" audience. Context: ${ctx("audience_engage")}. Prize ideas, entry mechanics, promotion plan. Return JSON: { giveawayPlan: object, prizeIdeas: array, entryMechanics: array, promotionPlan: array, legalNotes: array, expectedROI: number }`,
    community_loyalty: `Design loyalty point awards for "${sourceTitle}" engagement. Context: ${ctx("audience_engage")}. Point values, reward tiers, gamification. Return JSON: { pointStructure: object, rewardTiers: array, gamificationElements: array, milestones: array, recommendations: array }`,
    community_mod: `Content moderation scan for "${sourceTitle}". Context: ${ctx("chat_sentiment") || ctx("analyze")}. Risk areas, auto-mod rules, safety score. Return JSON: { safetyScore: number, riskAreas: array, autoModRules: array, flaggedContent: array, recommendations: array }`,
    community_feedback: `Collect & analyze viewer feedback for "${sourceTitle}". Context: ${ctx("audience_sentiment")}. Feedback themes, improvement suggestions, praise highlights. Return JSON: { feedbackThemes: array, improvements: array, praises: array, actionItems: array, overallSatisfaction: number }`,
    prod_kanban: `Update production kanban for "${sourceTitle}". Context: ${ctx("analyze")}. Current stage, next actions, blockers, timeline. Return JSON: { currentStage: string, nextStage: string, actions: array, blockers: array, estimatedCompletion: string, priority: string }`,
    prod_upload_queue: `Queue upload plan for "${sourceTitle}" across platforms. Context: ${ctx("schedule")}. Upload order, format requirements, platform specs. Return JSON: { uploadQueue: array of {platform: string, format: string, resolution: string, maxFileSize: string, uploadOrder: number, status: string}, totalUploads: number, estimatedTime: string }`,
    prod_editing_notes: `Generate editing notes for "${sourceTitle}". Context: ${ctx("analyze")}, ${ctx("clips")}. Cut markers, transition suggestions, audio adjustments. Return JSON: { editingNotes: array of {timestamp: number, note: string, type: string, priority: string}, transitions: array, audioAdjustments: array, colorGradingTips: array }`,
    content_audit: `Full content audit for "${sourceTitle}" channel health. Context: ${ctx("seo_audit")}, ${ctx("analyze")}. Performance gaps, optimization opportunities, content strategy. Return JSON: { healthScore: number, performanceGaps: array, optimizationOpportunities: array, contentStrategyNotes: array, recommendations: array }`,
    security_audit: `Security audit for content pipeline of "${sourceTitle}". Access log review, session health, data integrity. Return JSON: { securityScore: number, accessLogSummary: object, sessionHealth: string, dataIntegrity: string, alerts: array, recommendations: array }`,
    security_backup: `Verify content backup status for "${sourceTitle}". Backup health, recovery readiness, redundancy check. Return JSON: { backupStatus: string, lastBackup: string, recoveryReadiness: number, redundancyLevel: string, recommendations: array }`,
    security_alerts: `Check security alerts for "${sourceTitle}" pipeline. Anomaly detection, unauthorized access, rate limit status. Return JSON: { activeAlerts: array, anomalies: array, unauthorizedAttempts: number, rateLimitStatus: string, overallThreatLevel: string, recommendations: array }`,
  };

  let prompt = prompts[stepId];

  if (stepId === "retention_beats_scan") {
    const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);
    prompt = `Apply proven retention beat patterns to "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}, ${ctx("retention_analyze") || "{}"}.

${retentionContext}

Using the REAL retention beats above (learned from top creators), map each beat to specific timestamps in this ${typeLabel}. For each beat, specify exactly when and how to apply it — hook placement, curiosity gaps, escalation points, pattern interrupts, and payoff moments.

For LIVE streams: Generate real-time overlay cues the streamer can trigger, chat engagement prompts timed to retention dips, and mid-stream pacing adjustments.
For VOD/edited content: Generate an edit timeline with exact cut points, re-ordering suggestions, and post-production beat insertions.

Return JSON: { beatsApplied: array of {beatType: string, beatName: string, timestamp: number, application: string, expectedRetentionLift: number, source: string}, liveOverlayCues: array of {timestamp: number, cueType: string, message: string, duration: number}, editTimeline: array of {timestamp: number, action: string, beatReference: string, instruction: string}, pacingAdjustments: array of {fromTimestamp: number, toTimestamp: number, currentPacing: string, suggestedPacing: string, beatReason: string}, overallRetentionScore: number, beatsFromCreators: array of string, totalBeatsApplied: number }`;
  }

  if (!prompt) return { error: `Unknown step: ${stepId}` };

  const retentionSystemBoost = stepId === "retention_beats_scan"
    ? " You have been given REAL retention beat data learned from studying top creators like MrBeast and The Fat Electrician. Use these specific patterns — do NOT make up generic advice. Every recommendation must reference a specific beat from the data provided."
    : "";

  const systemMsg = pipelineType === "live"
    ? `You are a gaming livestream content expert. Analyze live streams and generate optimized content.${retentionSystemBoost} Always respond with valid JSON only, no markdown.`
    : `You are a VOD content optimization expert specializing in live stream replays and highlights. This VOD was pulled from a completed live stream. All content (titles, descriptions, tags, thumbnails, announcements) MUST clearly indicate this is a replay/highlight of a live stream and reference the original.${retentionSystemBoost} Always respond with valid JSON only, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: stepId === "retention_beats_scan" ? 3000 : 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { error: "No AI response" };
  try {
    return JSON.parse(content);
  } catch {
    console.error("[DualPipeline] Failed to parse AI response:", content?.slice(0, 200));
    return {};
  }
}

async function executeStreamPipelineInBackground(
  pipelineId: number,
  sourceTitle: string,
  pipelineType: string,
  existingResults: Record<string, any>,
  existingCompleted: string[],
  sourceDuration?: number | null,
  userId?: string | null
) {
  const currentResults = { ...existingResults };
  const completedSteps = [...existingCompleted];
  const stepIds = getStepsForType(pipelineType);

  for (const step of stepIds) {
    if (completedSteps.includes(step)) continue;

    const [current] = await db.select().from(streamPipelines).where(eq(streamPipelines.id, pipelineId));
    if (current?.status === "paused" || current?.status === "cancelled") {
      console.log(`[DualPipeline] Pipeline ${pipelineId} is ${current.status}, stopping execution`);
      return;
    }

    try {
      await db.update(streamPipelines)
        .set({ currentStep: step, status: "processing" })
        .where(eq(streamPipelines.id, pipelineId));

      if (step === "cut_vods" && userId) {
        try {
          const cutResult = await generateVodCutsInternal(userId, pipelineId, sourceTitle, sourceDuration || 0, "gaming");
          currentResults[step] = cutResult;
        } catch (cutErr: any) {
          console.error(`[DualPipeline] VOD cutting failed, using AI fallback:`, cutErr.message);
          currentResults[step] = await runStreamPipelineStep(step, sourceTitle, pipelineType, currentResults, sourceDuration, userId);
        }
      } else {
        currentResults[step] = await runStreamPipelineStep(step, sourceTitle, pipelineType, currentResults, sourceDuration, userId);
      }

      completedSteps.push(step);

      await db.update(streamPipelines)
        .set({ completedSteps, stepResults: currentResults })
        .where(eq(streamPipelines.id, pipelineId));
    } catch (stepErr: any) {
      console.error(`[DualPipeline] Step "${step}" failed for pipeline ${pipelineId}:`, stepErr.message);
      await db.update(streamPipelines)
        .set({
          status: "error",
          errorMessage: `Step "${step}" failed: ${stepErr.message}`,
          completedSteps,
          stepResults: currentResults,
        })
        .where(eq(streamPipelines.id, pipelineId));

      if (userId) {
        try {
          const { storage } = await import("../storage");
          await storage.createNotification({
            userId,
            type: "system",
            title: `Pipeline error: "${sourceTitle}"`,
            message: `Step "${step}" failed during processing. The self-healing system will attempt to recover automatically. Error: ${stepErr.message?.slice(0, 200)}`,
          });
        } catch {}
      }
      return;
    }
  }

  await db.update(streamPipelines)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedSteps,
      stepResults: currentResults,
      currentStep: stepIds[stepIds.length - 1],
    })
    .where(eq(streamPipelines.id, pipelineId));
  console.log(`[DualPipeline] Pipeline ${pipelineId} completed all steps`);

  if (pipelineType === "live" && userId) {
    try {
      const [completedPipeline] = await db.select().from(streamPipelines)
        .where(eq(streamPipelines.id, pipelineId));
      if (completedPipeline) {
        await spawnVodPipelineAfterPublish(
          pipelineId, userId, completedPipeline.sourceTitle,
          completedPipeline.sourceDuration, "live_stream_completed"
        );
      }
    } catch (vodSpawnErr: any) {
      console.error(`[DualPipeline] Failed to spawn VOD pipeline after live ${pipelineId}:`, vodSpawnErr.message);
    }
  }

  if (pipelineType === "vod" && userId) {
    try {
      const videoDbId = currentResults?._videoDbId;
      if (videoDbId) {
        const { processNewVideoUpload } = await import("../autopilot-engine");
        await processNewVideoUpload(userId, videoDbId);
        console.log(`[DualPipeline] Triggered autopilot distribution for video ${videoDbId} after VOD pipeline ${pipelineId} completed`);
      } else {
        const cleanTitle = sourceTitle.replace(/^\[VOD\]\s*/i, "").trim();
        const videoMatch = await db.select().from(videos)
          .where(and(
            sql`(${videos.title} = ${cleanTitle} OR ${videos.title} = ${sourceTitle})`,
            sql`${videos.metadata} IS NOT NULL`,
          ))
          .orderBy(desc(videos.createdAt))
          .limit(1);
        if (videoMatch.length > 0) {
          const { processNewVideoUpload } = await import("../autopilot-engine");
          await processNewVideoUpload(userId, videoMatch[0].id);
          console.log(`[DualPipeline] Triggered autopilot distribution for matched video ${videoMatch[0].id} after VOD pipeline ${pipelineId}`);
        } else {
          console.log(`[DualPipeline] No video record found for pipeline ${pipelineId} ("${cleanTitle}") — autopilot distribution skipped`);
        }
      }
    } catch (autopilotErr: any) {
      console.error(`[DualPipeline] Autopilot trigger failed for pipeline ${pipelineId}:`, autopilotErr.message);
    }

    try {
      const { storage } = await import("../storage");
      await storage.createNotification({
        userId,
        type: "autopilot",
        title: `Pipeline completed: "${sourceTitle}"`,
        message: `Your content pipeline for "${sourceTitle}" has finished processing all ${stepIds.length} steps and autopilot distribution has been triggered.`,
      });
    } catch (notifErr: any) {
      console.error(`[DualPipeline] Notification failed for pipeline ${pipelineId}:`, notifErr.message);
    }
  }
}

async function generateVodCutsInternal(
  userId: string,
  pipelineId: number,
  sourceTitle: string,
  sourceDuration: number,
  contentCategory: string
) {
  const [preference] = await db.select().from(audienceLengthPreferences)
    .where(and(
      eq(audienceLengthPreferences.userId, userId),
      eq(audienceLengthPreferences.contentCategory, contentCategory)
    ));

  const hasGoodData = preference && (preference.confidence ?? 0) > 0.5 && (preference.sampleSize ?? 0) > 3;

  let targetLengths: { category: string; length: number }[];
  let experimentId: number | null = null;

  if (hasGoodData && preference.optimalLength) {
    targetLengths = [
      { category: "optimal", length: preference.optimalLength },
      { category: "micro", length: 30 },
    ];
  } else {
    const [experiment] = await db.insert(lengthExperiments).values({
      userId,
      experimentName: `Length test: ${sourceTitle}`,
      status: "running",
      lengthsToTest: [30, 180, 600, 1200],
      completedLengths: [],
      results: [],
      contentCategory,
    }).returning();
    experimentId = experiment.id;
    targetLengths = [
      { category: "micro", length: 30 },
      { category: "short", length: 180 },
      { category: "medium", length: 600 },
      { category: "long", length: 1200 },
    ];
  }

  const openai = await getOpenAI();
  const lengthDescriptions = targetLengths.map(t => `${t.category}: ${t.length}s`).join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a VOD cutting expert. You analyze stream content and suggest optimal cut points for different video lengths. Always respond with valid JSON only, no markdown.",
      },
      {
        role: "user",
        content: `Analyze the stream "${sourceTitle}" (total duration: ${sourceDuration}s / ${Math.round(sourceDuration / 60)} min) and suggest optimal VOD cuts for these target lengths: ${lengthDescriptions}.

For each target length, provide:
1. The best start and end timestamps that capture the most engaging content
2. A compelling title for that specific cut
3. A hook for the first 3 seconds
4. Reasoning for why these cut points are optimal
5. A confidence score (0-1)

Return JSON: {
  "cuts": [
    {
      "category": string,
      "targetLength": number,
      "startTimestamp": number,
      "endTimestamp": number,
      "title": string,
      "suggestedHooks": [string, string, string],
      "reasoning": string,
      "confidenceScore": number,
      "highlights": [
        { "type": string, "timestamp": number, "duration": number, "score": number, "description": string }
      ]
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { cuts: [], error: "No AI response for VOD cuts" };
  let aiResult: any;
  try {
    aiResult = JSON.parse(content);
  } catch {
    console.error("[DualPipeline] Failed to parse VOD cuts response:", content?.slice(0, 200));
    aiResult = { cuts: [] };
  }

  const createdCuts: any[] = [];
  const vodCutIdsList: number[] = [];

  await db.transaction(async (tx) => {
    for (const cut of (aiResult.cuts || [])) {
      const lengthCategory = cut.category || "medium";
      const [vodCut] = await tx.insert(vodCuts).values({
        userId,
        pipelineId,
        title: cut.title || `${sourceTitle} - ${lengthCategory}`,
        targetLength: cut.targetLength,
        actualLength: cut.endTimestamp - cut.startTimestamp,
        lengthCategory,
        startTimestamp: cut.startTimestamp,
        endTimestamp: cut.endTimestamp,
        isExperiment: !hasGoodData,
        experimentGroup: experimentId ? `experiment_${experimentId}` : null,
        status: "pending",
        platform: "youtube",
        highlights: cut.highlights || [],
        aiSuggestion: {
          reasoning: cut.reasoning,
          confidenceScore: cut.confidenceScore,
          suggestedHooks: cut.suggestedHooks || [],
          cutPoints: [{ start: cut.startTimestamp, end: cut.endTimestamp, reason: cut.reasoning }],
        },
      }).returning();
      createdCuts.push(vodCut);
      vodCutIdsList.push(vodCut.id);
    }

    await tx.update(streamPipelines)
      .set({ vodCutIds: vodCutIdsList })
      .where(eq(streamPipelines.id, pipelineId));
  });

  return {
    cuts: createdCuts,
    experimentId,
    hasExistingPreferences: hasGoodData,
    targetLengths,
  };
}

export function registerDualPipelineRoutes(app: Express) {

  // ==================== STREAM PIPELINE ROUTES ====================

  app.get("/api/stream-pipeline/active", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const active = await db.select().from(streamPipelines)
      .where(and(
        eq(streamPipelines.userId, userId),
        sql`${streamPipelines.status} IN ('processing', 'queued')`
      ))
      .orderBy(desc(streamPipelines.createdAt));
    res.json(active);
  }));

  app.get("/api/stream-pipeline", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const pipelines = await db.select().from(streamPipelines)
      .where(eq(streamPipelines.userId, userId))
      .orderBy(desc(streamPipelines.createdAt))
      .limit(50);
    res.json(pipelines);
  }));

  app.post("/api/stream-pipeline", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamId, videoId, sourceTitle, sourceDuration, pipelineType, mode, autoProcess, sourcePipelineId } = req.body;
    if (!sourceTitle) return res.status(400).json({ error: "sourceTitle is required" });

    const type = pipelineType || "live";
    const firstStep = type === "live" ? "detect" : "ingest";

    if (type === "vod") {
      if (!sourcePipelineId) {
        return res.status(400).json({ error: "VOD pipelines require a sourcePipelineId — they only run on already-published content from a completed live pipeline" });
      }

      const [srcPipeline] = await db.select().from(streamPipelines)
        .where(and(eq(streamPipelines.id, sourcePipelineId), eq(streamPipelines.userId, userId)));
      if (!srcPipeline) return res.status(404).json({ error: "Source pipeline not found" });
      if (srcPipeline.status !== "completed") return res.status(400).json({ error: "Source pipeline must be completed first — VOD pipeline only runs on published content" });
      if (srcPipeline.pipelineType !== "live") return res.status(400).json({ error: "Source must be a live pipeline" });

      const { delayMinutes, scheduledAt } = calculateHumanVodDelay();
      const [pipeline] = await db.insert(streamPipelines).values({
        userId,
        streamId: streamId || srcPipeline.streamId || null,
        videoId: videoId || srcPipeline.videoId || null,
        pipelineType: "vod",
        currentStep: firstStep,
        status: "waiting",
        completedSteps: [],
        stepResults: {},
        vodCutIds: [],
        sourceTitle: `[VOD] ${srcPipeline.sourceTitle}`,
        sourceDuration: srcPipeline.sourceDuration || sourceDuration || null,
        mode: mode || "vod",
        autoProcess: autoProcess !== false,
        sourcePipelineId,
        scheduledStartAt: scheduledAt,
        humanDelayMinutes: delayMinutes,
        publishedContentType: "linked_from_live",
      }).returning();
      return res.json(pipeline);
    }

    const [pipeline] = await db.insert(streamPipelines).values({
      userId,
      streamId: streamId || null,
      videoId: videoId || null,
      pipelineType: type,
      currentStep: firstStep,
      status: "queued",
      completedSteps: [],
      stepResults: {},
      vodCutIds: [],
      sourceTitle,
      sourceDuration: sourceDuration || null,
      mode: mode || type,
      autoProcess: autoProcess !== false,
    }).returning();

    if (pipeline.autoProcess !== false) {
      executeStreamPipelineInBackground(
        pipeline.id, pipeline.sourceTitle, pipeline.pipelineType,
        {}, [], pipeline.sourceDuration, userId
      ).catch(err => console.error(`[DualPipeline] Auto-run failed for pipeline ${pipeline.id}:`, err));
    }

    res.json(pipeline);
  }));

  app.get("/api/stream-pipeline/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const stepDefs = getStepDefinitions(pipeline.pipelineType);
    res.json({ ...pipeline, stepDefinitions: stepDefs });
  }));

  app.post("/api/stream-pipeline/:id/run", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { step } = req.body;

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });

    const stepIds = getStepsForType(pipeline.pipelineType);
    const completedSteps = [...(pipeline.completedSteps || [])];
    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const targetStep = step || stepIds.find(s => !completedSteps.includes(s));

    if (!targetStep) return res.json({ message: "All steps completed", pipeline });

    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: pipeline.startedAt || new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, id));

    try {
      let result;
      if (targetStep === "cut_vods") {
        result = await generateVodCutsInternal(userId, id, pipeline.sourceTitle, pipeline.sourceDuration || 0, "gaming");
      } else {
        result = await runStreamPipelineStep(targetStep, pipeline.sourceTitle, pipeline.pipelineType, currentResults, pipeline.sourceDuration, userId);
      }

      currentResults[targetStep] = result;
      completedSteps.push(targetStep);

      const allDone = stepIds.every(s => completedSteps.includes(s));
      await db.update(streamPipelines)
        .set({
          currentStep: targetStep,
          status: allDone ? "completed" : "queued",
          completedSteps,
          stepResults: currentResults,
          completedAt: allDone ? new Date() : null,
        })
        .where(eq(streamPipelines.id, id));

      res.json({ message: `Step "${targetStep}" completed`, step: targetStep, result });
    } catch (err: any) {
      console.error(`[DualPipeline] Step "${targetStep}" failed for pipeline ${id}:`, err);
      await db.update(streamPipelines)
        .set({ status: "error", errorMessage: `Step "${targetStep}" failed: ${err.message}` })
        .where(eq(streamPipelines.id, id));
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stream-pipeline/:id/run-all", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });
    if (pipeline.status === "processing") return res.json({ message: "Already processing", pipeline });

    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: pipeline.startedAt || new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, id));

    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const completedSteps = [...(pipeline.completedSteps || [])];

    executeStreamPipelineInBackground(id, pipeline.sourceTitle, pipeline.pipelineType, currentResults, completedSteps, pipeline.sourceDuration, userId)
      .catch(err => console.error(`[DualPipeline] Background execution failed for ${id}:`, err));

    res.json({ message: "Pipeline started", status: "processing" });
  }));

  app.patch("/api/stream-pipeline/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { status } = req.body;

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const allowedTransitions: Record<string, string[]> = {
      queued: ["processing", "cancelled"],
      waiting: ["processing", "cancelled"],
      processing: ["paused", "cancelled"],
      paused: ["processing", "cancelled"],
      error: ["queued", "cancelled"],
    };

    const allowed = allowedTransitions[pipeline.status] || [];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from "${pipeline.status}" to "${status}"` });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (status === "processing") updates.errorMessage = null;

    const [updated] = await db.update(streamPipelines)
      .set(updates)
      .where(eq(streamPipelines.id, id))
      .returning();
    res.json(updated);
  }));

  // ==================== VOD CUTS ROUTES ====================

  app.get("/api/vod-cuts", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const cuts = await db.select().from(vodCuts)
      .where(eq(vodCuts.userId, userId))
      .orderBy(desc(vodCuts.createdAt))
      .limit(100);
    res.json(cuts);
  }));

  app.post("/api/vod-cuts/generate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamPipelineId, sourceTitle, sourceDuration, contentCategory } = req.body;

    if (!sourceTitle || !sourceDuration) {
      return res.status(400).json({ error: "sourceTitle and sourceDuration are required" });
    }

    const pipelineId = streamPipelineId || 0;
    const category = contentCategory || "gaming";

    const result = await generateVodCutsInternal(userId, pipelineId, sourceTitle, sourceDuration, category);
    res.json(result);
  }));

  app.get("/api/vod-cuts/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const [cut] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!cut) return res.status(404).json({ error: "VOD cut not found" });
    res.json(cut);
  }));

  app.patch("/api/vod-cuts/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { title, startTimestamp, endTimestamp, platform } = req.body;

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (startTimestamp !== undefined) updates.startTimestamp = startTimestamp;
    if (endTimestamp !== undefined) updates.endTimestamp = endTimestamp;
    if (platform !== undefined) updates.platform = platform;
    if (startTimestamp !== undefined && endTimestamp !== undefined) {
      updates.actualLength = endTimestamp - startTimestamp;
    }

    const [updated] = await db.update(vodCuts).set(updates).where(eq(vodCuts.id, id)).returning();
    res.json(updated);
  }));

  app.patch("/api/vod-cuts/:id/status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { status } = req.body;

    if (!status || !["pending", "approved", "published", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Valid status required: pending, approved, published, rejected" });
    }

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const updates: any = { status };
    if (status === "published") updates.publishedAt = new Date();

    const [updated] = await db.update(vodCuts).set(updates).where(eq(vodCuts.id, id)).returning();
    res.json(updated);
  }));

  app.post("/api/vod-cuts/:id/performance", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { views, likes, comments, watchTime, avgPercentWatched, ctr, retentionDropoffs } = req.body;

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const performance = {
      ...(existing.performance || {}),
      ...(views !== undefined && { views }),
      ...(likes !== undefined && { likes }),
      ...(comments !== undefined && { comments }),
      ...(watchTime !== undefined && { watchTime }),
      ...(avgPercentWatched !== undefined && { avgPercentWatched }),
      ...(ctr !== undefined && { ctr }),
      ...(retentionDropoffs !== undefined && { retentionDropoffs }),
    };

    const [updated] = await db.transaction(async (tx) => {
      const [updatedCut] = await tx.update(vodCuts)
        .set({ performance })
        .where(eq(vodCuts.id, id))
        .returning();

      if (existing.isExperiment && existing.experimentGroup) {
        const expIdMatch = existing.experimentGroup.match(/experiment_(\d+)/);
        if (expIdMatch) {
          const experimentIdNum = parseInt(expIdMatch[1]);
          const [exp] = await tx.select().from(lengthExperiments)
            .where(eq(lengthExperiments.id, experimentIdNum));
          if (exp) {
            const results = [...(exp.results || [])];
            const existingIdx = results.findIndex((r: any) => r.vodCutId === id);
            const resultEntry = {
              length: existing.targetLength,
              vodCutId: id,
              views: views || 0,
              avgPercentWatched: avgPercentWatched || 0,
              engagement: (likes || 0) + (comments || 0),
              score: ((views || 0) * 0.4) + ((avgPercentWatched || 0) * 0.3) + (((likes || 0) + (comments || 0)) * 0.3),
            };
            if (existingIdx >= 0) {
              results[existingIdx] = resultEntry;
            } else {
              results.push(resultEntry);
            }
            const completedLengths = Array.from(new Set(results.map((r: any) => r.length)));
            await tx.update(lengthExperiments)
              .set({ results, completedLengths })
              .where(eq(lengthExperiments.id, experimentIdNum));
          }
        }
      }

      return [updatedCut];
    });

    res.json(updated);
  }));

  // ==================== LENGTH EXPERIMENT ROUTES ====================

  app.get("/api/length-experiments/insights", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const experiments = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.userId, userId), eq(lengthExperiments.status, "completed")));

    const prefs = await db.select().from(audienceLengthPreferences)
      .where(eq(audienceLengthPreferences.userId, userId));

    const lengthStats: Record<string, { totalViews: number; totalEngagement: number; avgRetention: number; count: number }> = {};

    for (const exp of experiments) {
      for (const result of (exp.results || [])) {
        const r = result as any;
        const cat = Object.entries(LENGTH_CATEGORIES).find(([, v]) => r.length >= v.min && r.length <= v.max)?.[0] || "unknown";
        if (!lengthStats[cat]) lengthStats[cat] = { totalViews: 0, totalEngagement: 0, avgRetention: 0, count: 0 };
        lengthStats[cat].totalViews += r.views || 0;
        lengthStats[cat].totalEngagement += r.engagement || 0;
        lengthStats[cat].avgRetention += r.avgPercentWatched || 0;
        lengthStats[cat].count++;
      }
    }

    for (const cat of Object.keys(lengthStats)) {
      if (lengthStats[cat].count > 0) {
        lengthStats[cat].avgRetention /= lengthStats[cat].count;
      }
    }

    res.json({
      totalExperiments: experiments.length,
      completedExperiments: experiments.filter(e => e.status === "completed").length,
      preferences: prefs,
      lengthPerformance: lengthStats,
      bestPerformingLength: Object.entries(lengthStats).sort((a, b) => {
        const scoreA = a[1].totalViews * 0.4 + a[1].avgRetention * 0.3 + a[1].totalEngagement * 0.3;
        const scoreB = b[1].totalViews * 0.4 + b[1].avgRetention * 0.3 + b[1].totalEngagement * 0.3;
        return scoreB - scoreA;
      })[0]?.[0] || null,
    });
  }));

  app.get("/api/length-experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const experiments = await db.select().from(lengthExperiments)
      .where(eq(lengthExperiments.userId, userId))
      .orderBy(desc(lengthExperiments.createdAt))
      .limit(50);
    res.json(experiments);
  }));

  app.post("/api/length-experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { experimentName, lengthsToTest, contentCategory, platform } = req.body;

    if (!experimentName || !lengthsToTest?.length) {
      return res.status(400).json({ error: "experimentName and lengthsToTest are required" });
    }

    const [experiment] = await db.insert(lengthExperiments).values({
      userId,
      experimentName,
      status: "running",
      lengthsToTest,
      completedLengths: [],
      results: [],
      contentCategory: contentCategory || "gaming",
      platform: platform || "youtube",
    }).returning();

    res.json(experiment);
  }));

  app.get("/api/length-experiments/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    const relatedCuts = await db.select().from(vodCuts)
      .where(and(
        eq(vodCuts.userId, userId),
        eq(vodCuts.experimentGroup, `experiment_${id}`)
      ));

    res.json({ ...experiment, vodCuts: relatedCuts });
  }));

  app.post("/api/length-experiments/:id/record", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));
    const { length, vodCutId, views, avgPercentWatched, engagement } = req.body;

    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    const results = [...(experiment.results || [])];
    const score = (views || 0) * 0.4 + (avgPercentWatched || 0) * 0.3 + (engagement || 0) * 0.3;
    results.push({ length, vodCutId: vodCutId || 0, views: views || 0, avgPercentWatched: avgPercentWatched || 0, engagement: engagement || 0, score });

    const completedLengths = Array.from(new Set(results.map((r: any) => r.length)));

    const [updated] = await db.update(lengthExperiments)
      .set({ results, completedLengths })
      .where(eq(lengthExperiments.id, id))
      .returning();

    res.json(updated);
  }));

  app.post("/api/length-experiments/:id/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(String(req.params.id));

    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    if (!experiment.results || experiment.results.length < 2) {
      return res.status(400).json({ error: "Not enough results to analyze. Need at least 2 data points." });
    }

    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a data analyst specializing in video content performance. Analyze experiment results and determine the winning video length. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Analyze these video length experiment results and determine the winner:

Experiment: "${experiment.experimentName}"
Content Category: ${experiment.contentCategory || "general"}
Platform: ${experiment.platform || "youtube"}

Results by length:
${JSON.stringify(experiment.results, null, 2)}

Determine:
1. Which length performed best overall (considering views, retention, engagement)
2. Confidence level (0-1) in this determination
3. Reasoning for the winner
4. Recommendations for future content

Return JSON: {
  "winningLength": number,
  "confidence": number,
  "reasoning": string,
  "recommendations": [string],
  "lengthRanking": [{length: number, score: number, summary: string}]
}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return res.status(500).json({ error: "No AI response" });
    let analysis: any;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("[DualPipeline] Failed to parse length analysis:", content?.slice(0, 200));
      analysis = { winningLength: null, confidence: 0 };
    }

    const updated = await db.transaction(async (tx) => {
      const [updatedExp] = await tx.update(lengthExperiments)
        .set({
          status: "completed",
          winningLength: analysis.winningLength,
          confidence: analysis.confidence,
          completedAt: new Date(),
        })
        .where(eq(lengthExperiments.id, id))
        .returning();

      if (analysis.winningLength && analysis.confidence > 0.5) {
        const category = experiment.contentCategory || "gaming";
        const [existingPref] = await tx.select().from(audienceLengthPreferences)
          .where(and(
            eq(audienceLengthPreferences.userId, userId),
            eq(audienceLengthPreferences.contentCategory, category)
          ));

        const lengthPerf = (experiment.results || []).map((r: any) => ({
          length: r.length,
          avgViews: r.views,
          avgRetention: r.avgPercentWatched,
          avgEngagement: r.engagement,
          sampleCount: 1,
        }));

        if (existingPref) {
          const existingPerf = existingPref.lengthPerformance || [];
          const mergedPerf = [...existingPerf];
          for (const newP of lengthPerf) {
            const idx = mergedPerf.findIndex((p: any) => p.length === newP.length);
            if (idx >= 0) {
              mergedPerf[idx] = {
                ...mergedPerf[idx],
                avgViews: ((mergedPerf[idx] as any).avgViews + newP.avgViews) / 2,
                avgRetention: ((mergedPerf[idx] as any).avgRetention + newP.avgRetention) / 2,
                avgEngagement: ((mergedPerf[idx] as any).avgEngagement + newP.avgEngagement) / 2,
                sampleCount: ((mergedPerf[idx] as any).sampleCount || 0) + 1,
              };
            } else {
              mergedPerf.push(newP);
            }
          }
          await tx.update(audienceLengthPreferences)
            .set({
              optimalLength: analysis.winningLength,
              confidence: Math.min(1, (existingPref.confidence || 0) + analysis.confidence * 0.3),
              sampleSize: (existingPref.sampleSize || 0) + 1,
              lengthPerformance: mergedPerf,
              lastUpdated: new Date(),
            })
            .where(eq(audienceLengthPreferences.id, existingPref.id));
        } else {
          const catInfo = Object.entries(LENGTH_CATEGORIES).find(([, v]) => analysis.winningLength >= v.min && analysis.winningLength <= v.max);
          await tx.insert(audienceLengthPreferences).values({
            userId,
            platform: experiment.platform || "youtube",
            contentCategory: category,
            preferredMinLength: catInfo ? catInfo[1].min : analysis.winningLength - 60,
            preferredMaxLength: catInfo ? catInfo[1].max : analysis.winningLength + 60,
            optimalLength: analysis.winningLength,
            sampleSize: 1,
            confidence: analysis.confidence * 0.5,
            dataSource: "experiment",
            lengthPerformance: lengthPerf,
          });
        }
      }

      return updatedExp;
    });

    res.json({ experiment: updated, analysis });
  }));

  // ==================== LENGTH PREFERENCES ROUTES ====================

  app.get("/api/length-preferences", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const prefs = await db.select().from(audienceLengthPreferences)
      .where(eq(audienceLengthPreferences.userId, userId));
    res.json(prefs);
  }));

  app.get("/api/length-preferences/:category", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const category = String(req.params.category);
    const [pref] = await db.select().from(audienceLengthPreferences)
      .where(and(
        eq(audienceLengthPreferences.userId, userId),
        eq(audienceLengthPreferences.contentCategory, category)
      ));
    if (!pref) return res.status(404).json({ error: "No preferences found for this category" });
    res.json(pref);
  }));

  app.post("/api/length-preferences/learn", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const completedExperiments = await db.select().from(lengthExperiments)
      .where(and(
        eq(lengthExperiments.userId, userId),
        eq(lengthExperiments.status, "completed")
      ));

    if (completedExperiments.length === 0) {
      return res.json({ message: "No completed experiments to learn from", updated: 0 });
    }

    const categoryData: Record<string, { lengths: Record<number, { views: number; retention: number; engagement: number; count: number }> }> = {};

    for (const exp of completedExperiments) {
      const cat = exp.contentCategory || "general";
      if (!categoryData[cat]) categoryData[cat] = { lengths: {} };

      for (const result of (exp.results || [])) {
        const r = result as any;
        if (!categoryData[cat].lengths[r.length]) {
          categoryData[cat].lengths[r.length] = { views: 0, retention: 0, engagement: 0, count: 0 };
        }
        categoryData[cat].lengths[r.length].views += r.views || 0;
        categoryData[cat].lengths[r.length].retention += r.avgPercentWatched || 0;
        categoryData[cat].lengths[r.length].engagement += r.engagement || 0;
        categoryData[cat].lengths[r.length].count++;
      }
    }

    let updated = 0;
    await db.transaction(async (tx) => {
      for (const [category, data] of Object.entries(categoryData)) {
        const lengthPerf = Object.entries(data.lengths).map(([length, stats]) => ({
          length: parseInt(length),
          avgViews: stats.count > 0 ? stats.views / stats.count : 0,
          avgRetention: stats.count > 0 ? stats.retention / stats.count : 0,
          avgEngagement: stats.count > 0 ? stats.engagement / stats.count : 0,
          sampleCount: stats.count,
        }));

        const bestLength = lengthPerf.sort((a, b) => {
          const scoreA = a.avgViews * 0.4 + a.avgRetention * 0.3 + a.avgEngagement * 0.3;
          const scoreB = b.avgViews * 0.4 + b.avgRetention * 0.3 + b.avgEngagement * 0.3;
          return scoreB - scoreA;
        })[0];

        if (!bestLength) continue;

        const totalSamples = lengthPerf.reduce((sum, l) => sum + l.sampleCount, 0);
        const confidence = Math.min(1, totalSamples / 20);
        const catInfo = Object.entries(LENGTH_CATEGORIES).find(([, v]) => bestLength.length >= v.min && bestLength.length <= v.max);

        const [existingPref] = await tx.select().from(audienceLengthPreferences)
          .where(and(
            eq(audienceLengthPreferences.userId, userId),
            eq(audienceLengthPreferences.contentCategory, category)
          ));

        if (existingPref) {
          await tx.update(audienceLengthPreferences)
            .set({
              optimalLength: bestLength.length,
              preferredMinLength: catInfo ? catInfo[1].min : bestLength.length - 60,
              preferredMaxLength: catInfo ? catInfo[1].max : bestLength.length + 60,
              sampleSize: totalSamples,
              confidence,
              lengthPerformance: lengthPerf,
              lastUpdated: new Date(),
            })
            .where(eq(audienceLengthPreferences.id, existingPref.id));
        } else {
          await tx.insert(audienceLengthPreferences).values({
            userId,
            platform: "youtube",
            contentCategory: category,
            preferredMinLength: catInfo ? catInfo[1].min : bestLength.length - 60,
            preferredMaxLength: catInfo ? catInfo[1].max : bestLength.length + 60,
            optimalLength: bestLength.length,
            sampleSize: totalSamples,
            confidence,
            dataSource: "experiment",
            lengthPerformance: lengthPerf,
          });
        }
        updated++;
      }
    });

    res.json({ message: `Learned from ${completedExperiments.length} experiments`, updated, categories: Object.keys(categoryData) });
  }));

  app.get("/api/pipelines/command-center", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const result = await cached(`cmd-center:${userId}`, 3, async () => {

    const activePipelines = await db.select().from(streamPipelines)
      .where(and(
        eq(streamPipelines.userId, userId),
        sql`${streamPipelines.status} IN ('processing', 'queued', 'waiting')`
      ))
      .orderBy(desc(streamPipelines.createdAt))
      .limit(20);

    const recentCompleted = await db.select().from(streamPipelines)
      .where(and(
        eq(streamPipelines.userId, userId),
        eq(streamPipelines.status, "completed"),
      ))
      .orderBy(desc(streamPipelines.completedAt))
      .limit(5);

    const recentErrors = await db.select().from(streamPipelines)
      .where(and(
        eq(streamPipelines.userId, userId),
        eq(streamPipelines.status, "error"),
      ))
      .orderBy(desc(streamPipelines.createdAt))
      .limit(3);

    const totals = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      processing: sql<number>`count(*) filter (where status = 'processing')::int`,
      queued: sql<number>`count(*) filter (where status IN ('queued', 'waiting'))::int`,
      errored: sql<number>`count(*) filter (where status = 'error')::int`,
      liveCount: sql<number>`count(*) filter (where pipeline_type = 'live')::int`,
      vodCount: sql<number>`count(*) filter (where pipeline_type = 'vod')::int`,
    }).from(streamPipelines)
      .where(eq(streamPipelines.userId, userId));

    const enriched = activePipelines.map(p => {
      const steps = getStepDefinitions(p.pipelineType);
      const completedSteps = p.completedSteps || [];
      const totalSteps = steps.length;
      const completedCount = completedSteps.length;
      const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
      const currentStepDef = steps.find((s: any) => s.id === p.currentStep);
      const currentPhaseDef = currentStepDef
        ? { id: (currentStepDef as any).phase, label: (currentStepDef as any).phase?.replace(/_/g, " ").toUpperCase() }
        : null;
      const nextPendingStep = steps.find((s: any) => !completedSteps.includes((s as any).id));

      return {
        id: p.id,
        sourceTitle: p.sourceTitle,
        pipelineType: p.pipelineType,
        status: p.status,
        currentStep: p.currentStep,
        currentStepLabel: currentStepDef ? (currentStepDef as any).label : p.currentStep,
        currentStepDescription: currentStepDef ? (currentStepDef as any).description : "",
        currentPhase: currentPhaseDef,
        nextStep: nextPendingStep ? { id: (nextPendingStep as any).id, label: (nextPendingStep as any).label } : null,
        completedCount,
        totalSteps,
        progress,
        mode: p.mode,
        errorMessage: p.errorMessage,
        startedAt: p.startedAt,
        createdAt: p.createdAt,
        scheduledStartAt: p.scheduledStartAt,
        humanDelayMinutes: p.humanDelayMinutes,
      };
    });

    const recentCompletedEnriched = recentCompleted.map(p => {
      const steps = getStepDefinitions(p.pipelineType);
      return {
        id: p.id,
        sourceTitle: p.sourceTitle,
        pipelineType: p.pipelineType,
        completedCount: (p.completedSteps || []).length,
        totalSteps: steps.length,
        completedAt: p.completedAt,
        mode: p.mode,
      };
    });

    const recentErrorsEnriched = recentErrors.map(p => ({
      id: p.id,
      sourceTitle: p.sourceTitle,
      pipelineType: p.pipelineType,
      errorMessage: p.errorMessage,
      currentStep: p.currentStep,
      createdAt: p.createdAt,
    }));

    return {
      active: enriched,
      recentCompleted: recentCompletedEnriched,
      recentErrors: recentErrorsEnriched,
      totals: totals[0] || { total: 0, completed: 0, processing: 0, queued: 0, errored: 0, liveCount: 0, vodCount: 0 },
    };
    });

    res.json(result);
  }));
}
