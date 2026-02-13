import { storage } from "./storage";
import { generateVideoMetadata, runAgentTask, generateCommunityPost, detectGamingContext } from "./ai-engine";
import { AI_AGENTS } from "@shared/schema";

type ProcessingState = "idle" | "processing" | "paused" | "stream_active";

interface BacklogSession {
  userId: string;
  state: ProcessingState;
  currentVideoId: number | null;
  currentAgentIndex: number;
  currentChainStep: number;
  totalVideos: number;
  processedVideos: number;
  jobId: number | null;
  startedAt: Date;
  lastActivityAt: Date;
  mode: "quick" | "deep";
  priority: "backlog" | "stream" | "post_stream";
  chainResults: Record<number, AgentChainResult>;
  errors: Array<{ videoId: number; error: string; timestamp: Date }>;
}

interface AgentChainResult {
  videoId: number;
  steps: Array<{
    agentId: string;
    status: "pending" | "running" | "completed" | "failed";
    result?: any;
    startedAt?: Date;
    completedAt?: Date;
  }>;
  optimizationScore: number;
  startedAt: Date;
  completedAt?: Date;
}

const AGENT_CHAIN = [
  { agentId: "seo_director", action: "SEO Optimization" },
  { agentId: "editor", action: "Content Refinement" },
  { agentId: "brand_strategist", action: "Brand Alignment Check" },
  { agentId: "legal_advisor", action: "Compliance Verification" },
  { agentId: "social_manager", action: "Social Distribution Plan" },
  { agentId: "analytics_director", action: "Performance Prediction" },
];

const STREAM_SUPPORT_AGENTS = [
  { agentId: "seo_director", action: "Live Stream SEO Optimization" },
  { agentId: "social_manager", action: "Live Social Engagement" },
  { agentId: "community_manager", action: "Live Chat Management" },
  { agentId: "analytics_director", action: "Real-time Analytics Monitoring" },
  { agentId: "growth_strategist", action: "Live Growth Tactics" },
];

const sessions = new Map<string, BacklogSession>();

export function getBacklogSession(userId: string): BacklogSession | null {
  return sessions.get(userId) || null;
}

export function calculateOptimizationScore(metadata: any): number {
  if (!metadata) return 0;
  let score = 0;
  if (metadata.aiOptimized) score += 15;
  if (metadata.seoScore) score += Math.min(metadata.seoScore * 0.2, 20);
  if (metadata.tags && metadata.tags.length >= 5) score += 10;
  if (metadata.tags && metadata.tags.length >= 10) score += 5;
  if (metadata.aiSuggestions?.titleHooks?.length > 0) score += 10;
  if (metadata.aiSuggestions?.descriptionTemplate) score += 10;
  if (metadata.aiSuggestions?.thumbnailCritique) score += 10;
  if (metadata.aiSuggestions?.seoRecommendations?.length > 0) score += 5;
  if (metadata.aiSuggestions?.complianceNotes?.length > 0) score += 5;
  if (metadata.chainCompleted) score += 10;
  return Math.min(score, 100);
}

function prioritizeVideos(videos: any[]): any[] {
  return videos.sort((a, b) => {
    const scoreA = calculateOptimizationScore(a.metadata);
    const scoreB = calculateOptimizationScore(b.metadata);
    if (scoreA !== scoreB) return scoreA - scoreB;
    const viewsA = a.metadata?.stats?.views || 0;
    const viewsB = b.metadata?.stats?.views || 0;
    if (viewsB !== viewsA) return viewsB - viewsA;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

export async function startBacklogProcessing(
  userId: string,
  mode: "quick" | "deep" = "deep"
): Promise<{ jobId: number; totalVideos: number; alreadyRunning: boolean }> {
  const existing = sessions.get(userId);
  if (existing && existing.state === "processing") {
    return { jobId: existing.jobId!, totalVideos: existing.totalVideos, alreadyRunning: true };
  }

  const allVideos = await storage.getVideosByUser(userId);
  const videosToProcess = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    return score < 80;
  });

  const prioritized = prioritizeVideos(videosToProcess);

  const job = await storage.createJob({
    type: "auto_backlog_processing",
    status: "processing",
    priority: 2,
    payload: {
      totalVideos: prioritized.length,
      mode,
      videoIds: prioritized.map(v => v.id),
      userId,
    },
  });

  const session: BacklogSession = {
    userId,
    state: "processing",
    currentVideoId: null,
    currentAgentIndex: 0,
    currentChainStep: 0,
    totalVideos: prioritized.length,
    processedVideos: 0,
    jobId: job.id,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    mode,
    priority: "backlog",
    chainResults: {},
    errors: [],
  };

  sessions.set(userId, session);

  processBacklogAsync(userId, prioritized, job.id, mode);

  return { jobId: job.id, totalVideos: prioritized.length, alreadyRunning: false };
}

async function processBacklogAsync(
  userId: string,
  videos: any[],
  jobId: number,
  mode: "quick" | "deep"
) {
  const session = sessions.get(userId);
  if (!session) return;

  let completed = 0;

  for (const video of videos) {
    const currentSession = sessions.get(userId);
    if (!currentSession || currentSession.state === "paused") {
      break;
    }
    if (currentSession.state === "stream_active") {
      await waitForStreamEnd(userId);
      const resumedSession = sessions.get(userId);
      if (!resumedSession || resumedSession.state === "paused") break;
    }

    currentSession.currentVideoId = video.id;
    currentSession.lastActivityAt = new Date();

    const chainResult: AgentChainResult = {
      videoId: video.id,
      steps: AGENT_CHAIN.map(step => ({
        agentId: step.agentId,
        status: "pending" as const,
      })),
      optimizationScore: calculateOptimizationScore(video.metadata),
      startedAt: new Date(),
    };

    currentSession.chainResults[video.id] = chainResult;

    try {
      const suggestions = await generateVideoMetadata({
        title: video.title,
        description: video.description,
        type: video.type,
        metadata: video.metadata,
        platform: video.platform || undefined,
      });

      const gamingCtx = detectGamingContext(video.title, video.description, video.metadata?.contentCategory, video.metadata);
      const newMetadata = {
        ...video.metadata,
        seoScore: suggestions.seoScore || 0,
        aiSuggestions: {
          titleHooks: suggestions.titleHooks || [],
          descriptionTemplate: suggestions.descriptionTemplate || "",
          thumbnailCritique: suggestions.thumbnailCritique || "",
          seoRecommendations: suggestions.seoRecommendations || [],
          complianceNotes: suggestions.complianceNotes || [],
        },
        tags: suggestions.suggestedTags || video.metadata?.tags || [],
        aiOptimized: true,
        aiOptimizedAt: new Date().toISOString(),
        gameName: video.metadata?.gameName || gamingCtx.gameName || null,
        contentCategory: video.metadata?.contentCategory || (gamingCtx.isGaming ? "gaming" : null),
        brandKeywords: video.metadata?.brandKeywords?.length ? video.metadata.brandKeywords : gamingCtx.brandKeywords,
      };

      chainResult.steps[0].status = "completed";
      chainResult.steps[0].completedAt = new Date();

      await storage.updateVideo(video.id, { metadata: newMetadata });

      await storage.createAgentActivity({
        userId,
        agentId: "seo_director",
        action: `Optimized SEO for "${video.title}"`,
        target: video.title,
        status: "completed",
        details: {
          description: `Generated optimized metadata with ${suggestions.suggestedTags?.length || 0} tags, SEO score: ${suggestions.seoScore}`,
          impact: `SEO score improved to ${suggestions.seoScore}/100`,
          recommendations: suggestions.seoRecommendations?.slice(0, 3),
        },
      });

      if (mode === "deep") {
        const chainAgents = AGENT_CHAIN.slice(1);
        for (let i = 0; i < chainAgents.length; i++) {
          const step = chainAgents[i];
          const stepIndex = i + 1;
          chainResult.steps[stepIndex].status = "running";
          chainResult.steps[stepIndex].startedAt = new Date();

          try {
            const userChannels = await storage.getChannelsByUser(userId);
            const allVids = await storage.getVideosByUser(userId);
            const result = await runAgentTask(step.agentId, {
              channelName: userChannels[0]?.channelName || "My Channel",
              videoCount: allVids.length,
              recentTitles: [video.title, ...allVids.slice(0, 4).map(v => v.title)],
              gameName: video.metadata?.gameName || null,
              contentCategory: video.metadata?.contentCategory || null,
              brandKeywords: video.metadata?.brandKeywords || [],
            });

            chainResult.steps[stepIndex].status = "completed";
            chainResult.steps[stepIndex].result = result;
            chainResult.steps[stepIndex].completedAt = new Date();

            await storage.createAgentActivity({
              userId,
              agentId: step.agentId,
              action: result.action || `${step.action} for "${video.title}"`,
              target: result.target || video.title,
              status: "completed",
              details: {
                description: result.description,
                impact: result.impact,
                recommendations: result.recommendations,
                humanized: true,
              },
            });
          } catch (err: any) {
            chainResult.steps[stepIndex].status = "failed";
            console.error(`Chain step ${step.agentId} failed for video ${video.id}:`, err.message);
          }

          const checkSession = sessions.get(userId);
          if (!checkSession || checkSession.state !== "processing") break;
        }
      }

      const allStepsFinished = chainResult.steps.every(s => s.status === "completed" || s.status === "failed");
      const updatedVideo = await storage.getVideo(video.id);
      const updatedMeta: any = {
        ...updatedVideo?.metadata,
        chainCompleted: allStepsFinished,
        chainCompletedAt: allStepsFinished ? new Date().toISOString() : null,
        optimizationScore: calculateOptimizationScore({
          ...updatedVideo?.metadata,
          chainCompleted: allStepsFinished,
        }),
      };
      await storage.updateVideo(video.id, { metadata: updatedMeta });

      chainResult.optimizationScore = updatedMeta.optimizationScore;
      chainResult.completedAt = new Date();

    } catch (err: any) {
      console.error(`Failed to process video ${video.id}:`, err.message);
      currentSession.errors.push({
        videoId: video.id,
        error: err.message,
        timestamp: new Date(),
      });
    }

    completed++;
    currentSession.processedVideos = completed;
    const progress = Math.round((completed / videos.length) * 100);
    await storage.updateJobProgress(jobId, progress);
  }

  const finalSession = sessions.get(userId);
  if (finalSession) {
    finalSession.state = "idle";
    finalSession.currentVideoId = null;
  }
  await storage.updateJobStatus(jobId, "completed", {
    optimized: completed,
    total: videos.length,
    mode,
  });

  await storage.createAuditLog({
    userId,
    action: "auto_backlog_completed",
    target: `${completed} of ${videos.length} videos processed`,
    riskLevel: "low",
  });
}

function waitForStreamEnd(userId: string): Promise<void> {
  return new Promise((resolve) => {
    const MAX_WAIT_MS = 12 * 60 * 60 * 1000;
    const startTime = Date.now();
    const check = setInterval(() => {
      const session = sessions.get(userId);
      if (!session || session.state !== "stream_active" || (Date.now() - startTime) > MAX_WAIT_MS) {
        clearInterval(check);
        resolve();
      }
    }, 5000);
  });
}

export async function pauseBacklog(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "processing") return false;
  session.state = "paused";
  session.lastActivityAt = new Date();
  return true;
}

export async function resumeBacklog(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "paused") return false;
  session.state = "processing";
  session.lastActivityAt = new Date();

  const allVideos = await storage.getVideosByUser(userId);
  const remaining = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    return score < 80;
  });
  const prioritized = prioritizeVideos(remaining);

  if (session.jobId) {
    processBacklogAsync(userId, prioritized, session.jobId, session.mode);
  }
  return true;
}

export async function pivotToStream(userId: string, streamId: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.state = "stream_active";
    session.priority = "stream";
    session.lastActivityAt = new Date();
  }

  for (const agent of STREAM_SUPPORT_AGENTS) {
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await runAgentTask(agent.agentId, {
        channelName: userChannels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: videos.slice(0, 5).map(v => v.title),
      });

      await storage.createAgentActivity({
        userId,
        agentId: agent.agentId,
        action: result.action || agent.action,
        target: `Stream #${streamId}`,
        status: "completed",
        details: {
          description: result.description || `${agent.action} activated for live stream`,
          impact: result.impact,
          recommendations: result.recommendations,
        },
      });
    } catch (err: any) {
      console.error(`Stream support agent ${agent.agentId} error:`, err.message);
    }
  }
}

export async function resumeFromStream(userId: string, streamId: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.priority = "post_stream";
    session.lastActivityAt = new Date();
  }

  const postStreamAgents = [
    { agentId: "editor", action: "VOD Processing & Highlights" },
    { agentId: "seo_director", action: "VOD SEO Optimization" },
    { agentId: "social_manager", action: "Post-Stream Social Posts" },
    { agentId: "analytics_director", action: "Stream Performance Report" },
  ];

  for (const agent of postStreamAgents) {
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await runAgentTask(agent.agentId, {
        channelName: userChannels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: videos.slice(0, 5).map(v => v.title),
      });

      await storage.createAgentActivity({
        userId,
        agentId: agent.agentId,
        action: result.action || agent.action,
        target: `Post-stream #${streamId}`,
        status: "completed",
        details: {
          description: result.description || `${agent.action} for stream VOD`,
          impact: result.impact,
          recommendations: result.recommendations,
        },
      });
    } catch (err: any) {
      console.error(`Post-stream agent ${agent.agentId} error:`, err.message);
    }
  }

  if (session) {
    session.state = "processing";
    session.priority = "backlog";
    session.lastActivityAt = new Date();
  }
}

export async function getBacklogStatus(userId: string): Promise<{
  state: ProcessingState;
  totalVideos: number;
  optimizedVideos: number;
  pendingVideos: number;
  processingVideoId: number | null;
  processedCount: number;
  progress: number;
  mode: string;
  priority: string;
  errors: number;
  currentChain: AgentChainResult | null;
  scores: { excellent: number; good: number; fair: number; poor: number };
  estimatedTimeRemaining: string;
  activeJob: any;
}> {
  const session = sessions.get(userId);
  const allVideos = await storage.getVideosByUser(userId);

  const scores = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let totalScore = 0;
  allVideos.forEach(v => {
    const score = calculateOptimizationScore(v.metadata);
    totalScore += score;
    if (score >= 80) scores.excellent++;
    else if (score >= 60) scores.good++;
    else if (score >= 30) scores.fair++;
    else scores.poor++;
  });

  const optimized = allVideos.filter(v => calculateOptimizationScore(v.metadata) >= 80).length;
  const pending = allVideos.length - optimized;

  let activeJob = null;
  if (session?.jobId) {
    const jobs = await storage.getJobs();
    activeJob = jobs.find(j => j.id === session.jobId && j.status === "processing");
  }

  const avgProcessTime = 15;
  const remainingCount = session ? (session.totalVideos - session.processedVideos) : pending;
  const estimatedMinutes = remainingCount * avgProcessTime * (session?.mode === "deep" ? AGENT_CHAIN.length : 1);
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  const estimatedTimeRemaining = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const currentChain = session?.currentVideoId ? session.chainResults[session.currentVideoId] || null : null;

  return {
    state: session?.state || "idle",
    totalVideos: allVideos.length,
    optimizedVideos: optimized,
    pendingVideos: pending,
    processingVideoId: session?.currentVideoId || null,
    processedCount: session?.processedVideos || 0,
    progress: session ? Math.round((session.processedVideos / Math.max(session.totalVideos, 1)) * 100) : 0,
    mode: session?.mode || "deep",
    priority: session?.priority || "backlog",
    errors: session?.errors.length || 0,
    currentChain,
    scores,
    estimatedTimeRemaining,
    activeJob,
  };
}

export async function getVideosWithScores(userId: string): Promise<Array<{
  id: number;
  title: string;
  platform: string;
  type: string;
  optimizationScore: number;
  isOptimized: boolean;
  needsReoptimization: boolean;
  lastOptimizedAt: string | null;
  chainCompleted: boolean;
}>> {
  const allVideos = await storage.getVideosByUser(userId);
  return allVideos.map(v => {
    const score = calculateOptimizationScore(v.metadata);
    const lastOpt = v.metadata?.aiOptimizedAt || null;
    const daysSinceOpt = lastOpt ? (Date.now() - new Date(lastOpt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

    return {
      id: v.id,
      title: v.title,
      platform: v.platform || "youtube",
      type: v.type,
      optimizationScore: score,
      isOptimized: score >= 80,
      needsReoptimization: daysSinceOpt > 30 && score < 90,
      lastOptimizedAt: lastOpt,
      chainCompleted: !!v.metadata?.chainCompleted,
    };
  });
}

export async function bulkOptimize(
  userId: string,
  videoIds: number[],
  agentIds: string[]
): Promise<{ jobId: number; count: number }> {
  const job = await storage.createJob({
    type: "bulk_agent_optimize",
    status: "processing",
    priority: 1,
    payload: {
      videoIds,
      agentIds,
      userId,
    },
  });

  (async () => {
    let completed = 0;
    for (const videoId of videoIds) {
      const video = await storage.getVideo(videoId);
      if (!video) continue;

      for (const agentId of agentIds) {
        try {
          const userChannels = await storage.getChannelsByUser(userId);
          const allVids = await storage.getVideosByUser(userId);
          const result = await runAgentTask(agentId, {
            channelName: userChannels[0]?.channelName || "My Channel",
            videoCount: allVids.length,
            recentTitles: [video.title, ...allVids.slice(0, 4).map(v => v.title)],
            gameName: video.metadata?.gameName || null,
            contentCategory: video.metadata?.contentCategory || null,
            brandKeywords: video.metadata?.brandKeywords || [],
          });

          await storage.createAgentActivity({
            userId,
            agentId,
            action: result.action || `Bulk optimized "${video.title}"`,
            target: video.title,
            status: "completed",
            details: {
              description: result.description,
              impact: result.impact,
              recommendations: result.recommendations,
            },
          });
        } catch (err: any) {
          console.error(`Bulk optimize agent ${agentId} failed for video ${videoId}:`, err.message);
        }
      }

      completed++;
      const progress = Math.round((completed / videoIds.length) * 100);
      await storage.updateJobProgress(job.id, progress);
    }

    await storage.updateJobStatus(job.id, "completed", {
      optimized: completed,
      total: videoIds.length,
      agents: agentIds,
    });
  })();

  return { jobId: job.id, count: videoIds.length };
}

export async function autoScheduleOptimizedContent(userId: string): Promise<number> {
  const allVideos = await storage.getVideosByUser(userId);
  const fullyOptimized = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    const meta = v.metadata as any;
    return score >= 80 && meta?.chainCompleted && !meta?.autoScheduled;
  });

  let scheduled = 0;
  for (const video of fullyOptimized) {
    const platforms = ["youtube", "tiktok", "x", "instagram"];
    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() + 2 + scheduled * 4);

    for (const platform of platforms) {
      try {
        await storage.createScheduleItem({
          userId,
          title: `Share: ${video.title}`,
          type: "social_post",
          platform,
          scheduledAt: new Date(baseTime.getTime() + platforms.indexOf(platform) * 3600000),
          status: "scheduled",
          videoId: video.id,
          metadata: {
            description: `Auto-scheduled social post for optimized video`,
            tags: video.metadata?.tags || [],
            autoPublish: true,
            crossPost: platforms,
            aiOptimized: true,
          },
        });
        scheduled++;
      } catch (err: any) {
        console.error(`Failed to auto-schedule for video ${video.id} on ${platform}:`, err.message);
      }
    }

    const updatedAutoMeta: any = { ...video.metadata, autoScheduled: true, autoScheduledAt: new Date().toISOString() };
    await storage.updateVideo(video.id, { metadata: updatedAutoMeta });

    await storage.createAgentActivity({
      userId,
      agentId: "social_manager",
      action: `Auto-scheduled "${video.title}" across ${platforms.length} platforms`,
      target: video.title,
      status: "completed",
      details: {
        description: `Automatically scheduled social media posts for fully optimized video across ${platforms.join(", ")}`,
        impact: `${platforms.length} posts scheduled for optimal engagement times`,
      },
    });
  }

  return scheduled;
}

export async function getStaleVideos(userId: string): Promise<any[]> {
  const allVideos = await storage.getVideosByUser(userId);
  return allVideos.filter(v => {
    const lastOpt = v.metadata?.aiOptimizedAt;
    if (!lastOpt) return true;
    const daysSince = (Date.now() - new Date(lastOpt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 30;
  }).map(v => ({
    id: v.id,
    title: v.title,
    platform: v.platform || "youtube",
    lastOptimized: v.metadata?.aiOptimizedAt || null,
    daysSinceOptimization: v.metadata?.aiOptimizedAt
      ? Math.floor((Date.now() - new Date(v.metadata.aiOptimizedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    optimizationScore: calculateOptimizationScore(v.metadata),
  }));
}
