import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { copilotConversations, videos, channels, scheduleItems } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: { tool: string; args: Record<string, any>; result?: any }[];
}

const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "get_channel_stats",
      description: "Returns channel metrics including subscriber count, video count, view count, and niche",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "number", description: "Optional channel ID. If not provided, returns all channels for the user." }
        },
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_videos",
      description: "Returns the last 10 videos with their performance metrics including views, likes, comments, and CTR",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "number", description: "Optional channel ID to filter videos" }
        },
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedule",
      description: "Returns upcoming scheduled content items",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_video",
      description: "Analyzes a specific video's performance and provides insights",
      parameters: {
        type: "object",
        properties: {
          videoId: { type: "number", description: "The ID of the video to analyze" }
        },
        required: ["videoId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_content_ideas",
      description: "Generates content ideas based on the creator's niche and recent performance",
      parameters: {
        type: "object",
        properties: {
          niche: { type: "string", description: "Content niche to generate ideas for" },
          count: { type: "number", description: "Number of ideas to generate (default 5)" }
        },
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_performance_summary",
      description: "Returns overall performance metrics across all channels including total views, average engagement, and growth trends",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

async function executeGetChannelStats(userId: string, args: Record<string, any>) {
  const conditions = [eq(channels.userId, userId)];
  if (args.channelId) {
    conditions.push(eq(channels.id, args.channelId));
  }
  const userChannels = await db.select().from(channels).where(and(...conditions));
  return userChannels.map(ch => ({
    id: ch.id,
    platform: ch.platform,
    channelName: ch.channelName,
    subscriberCount: ch.subscriberCount ?? 0,
    videoCount: ch.videoCount ?? 0,
    viewCount: ch.viewCount ?? 0,
    niche: ch.contentNiche ?? "general",
    lastSyncAt: ch.lastSyncAt?.toISOString() ?? null
  }));
}

async function executeGetRecentVideos(userId: string, args: Record<string, any>) {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  if (userChannels.length === 0) return [];
  const channelIds = args.channelId ? [args.channelId] : userChannels.map(c => c.id);
  const recentVideos = await db.select().from(videos)
    .where(sql`${videos.channelId} IN (${sql.join(channelIds.map((id: number) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(videos.createdAt))
    .limit(10);
  return recentVideos.map(v => ({
    id: v.id,
    title: v.title,
    type: v.type,
    status: v.status,
    platform: v.platform,
    views: v.metadata?.stats?.views ?? v.metadata?.viewCount ?? 0,
    likes: v.metadata?.stats?.likes ?? v.metadata?.likeCount ?? 0,
    comments: v.metadata?.stats?.comments ?? v.metadata?.commentCount ?? 0,
    ctr: v.metadata?.stats?.ctr ?? 0,
    avgWatchTime: v.metadata?.stats?.avgWatchTime ?? 0,
    publishedAt: v.publishedAt?.toISOString() ?? v.createdAt?.toISOString() ?? null
  }));
}

async function executeGetSchedule(userId: string) {
  const upcoming = await db.select().from(scheduleItems)
    .where(and(
      eq(scheduleItems.userId, userId),
      eq(scheduleItems.status, "scheduled"),
      sql`${scheduleItems.scheduledAt} >= NOW()`
    ))
    .orderBy(scheduleItems.scheduledAt)
    .limit(20);
  return upcoming.map(item => ({
    id: item.id,
    title: item.title,
    type: item.type,
    platform: item.platform,
    scheduledAt: item.scheduledAt.toISOString(),
    status: item.status
  }));
}

async function executeAnalyzeVideo(userId: string, args: Record<string, any>) {
  const [video] = await db.select().from(videos).where(eq(videos.id, args.videoId));
  if (!video) return { error: "Video not found" };
  const stats = video.metadata?.stats;
  const views = stats?.views ?? video.metadata?.viewCount ?? 0;
  const likes = stats?.likes ?? video.metadata?.likeCount ?? 0;
  const comments = stats?.comments ?? video.metadata?.commentCount ?? 0;
  const ctr = stats?.ctr ?? 0;
  const avgWatchTime = stats?.avgWatchTime ?? 0;
  const engagementRate = views > 0 ? ((likes + comments) / views * 100).toFixed(2) : "0";
  return {
    id: video.id,
    title: video.title,
    type: video.type,
    status: video.status,
    platform: video.platform,
    views,
    likes,
    comments,
    ctr,
    avgWatchTime,
    engagementRate: `${engagementRate}%`,
    publishedAt: video.publishedAt?.toISOString() ?? null,
    seoScore: video.metadata?.seoScore ?? null,
    tags: video.metadata?.tags ?? [],
    description: video.description?.substring(0, 200) ?? null
  };
}

async function executeSuggestContentIdeas(userId: string, args: Record<string, any>) {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const niche = args.niche || userChannels[0]?.contentNiche || "general";
  const count = args.count || 5;
  const recentVids = await db.select().from(videos)
    .where(sql`${videos.channelId} IN (${sql.join(userChannels.map(c => sql`${c.id}`), sql`, `)})`)
    .orderBy(desc(videos.createdAt))
    .limit(5);
  const recentTitles = recentVids.map(v => v.title).join(", ");

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Generate ${count} content ideas for a ${niche} creator. Their recent videos: ${recentTitles || "none yet"}. Return as JSON array of objects with "title", "description", "format" (video/short/stream), and "estimatedEngagement" (high/medium/low).`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return { ideas: [] };
  try { return JSON.parse(content); } catch { return { ideas: [] }; }
}

async function executeGetPerformanceSummary(userId: string) {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  if (userChannels.length === 0) return { totalChannels: 0, totalSubscribers: 0, totalViews: 0, totalVideos: 0 };
  const channelIds = userChannels.map(c => c.id);
  const allVideos = await db.select().from(videos)
    .where(sql`${videos.channelId} IN (${sql.join(channelIds.map((id: number) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(videos.createdAt))
    .limit(50);

  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let videosWithStats = 0;
  for (const v of allVideos) {
    const views = v.metadata?.stats?.views ?? v.metadata?.viewCount ?? 0;
    const likes = v.metadata?.stats?.likes ?? v.metadata?.likeCount ?? 0;
    const comments = v.metadata?.stats?.comments ?? v.metadata?.commentCount ?? 0;
    totalViews += views;
    totalLikes += likes;
    totalComments += comments;
    if (views > 0) videosWithStats++;
  }

  return {
    totalChannels: userChannels.length,
    totalSubscribers: userChannels.reduce((sum, ch) => sum + (ch.subscriberCount ?? 0), 0),
    totalViews: userChannels.reduce((sum, ch) => sum + (ch.viewCount ?? 0), 0),
    totalVideos: userChannels.reduce((sum, ch) => sum + (ch.videoCount ?? 0), 0),
    recentVideoCount: allVideos.length,
    recentTotalViews: totalViews,
    recentTotalLikes: totalLikes,
    recentTotalComments: totalComments,
    avgEngagementRate: totalViews > 0 ? `${((totalLikes + totalComments) / totalViews * 100).toFixed(2)}%` : "0%",
    platforms: [...new Set(userChannels.map(ch => ch.platform))],
    niches: [...new Set(userChannels.map(ch => ch.contentNiche).filter(Boolean))]
  };
}

async function executeTool(userId: string, toolName: string, args: Record<string, any>): Promise<any> {
  switch (toolName) {
    case "get_channel_stats": return executeGetChannelStats(userId, args);
    case "get_recent_videos": return executeGetRecentVideos(userId, args);
    case "get_schedule": return executeGetSchedule(userId);
    case "analyze_video": return executeAnalyzeVideo(userId, args);
    case "suggest_content_ideas": return executeSuggestContentIdeas(userId, args);
    case "get_performance_summary": return executeGetPerformanceSummary(userId);
    default: return { error: `Unknown tool: ${toolName}` };
  }
}

async function buildSystemPrompt(userId: string): Promise<string> {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelInfo = userChannels.map(ch =>
    `- ${ch.channelName} (${ch.platform}): ${ch.subscriberCount ?? 0} subscribers, ${ch.videoCount ?? 0} videos, ${ch.viewCount ?? 0} total views, niche: ${ch.contentNiche ?? "general"}`
  ).join("\n");

  const channelIds = userChannels.map(c => c.id);
  let recentVideoInfo = "";
  if (channelIds.length > 0) {
    const recentVids = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map((id: number) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt))
      .limit(5);
    if (recentVids.length > 0) {
      recentVideoInfo = "\n\nRecent videos:\n" + recentVids.map(v => {
        const views = v.metadata?.stats?.views ?? v.metadata?.viewCount ?? 0;
        return `- "${v.title}" (${v.platform}, ${views} views)`;
      }).join("\n");
    }
  }

  const totalSubs = userChannels.reduce((s, ch) => s + (ch.subscriberCount ?? 0), 0);
  const totalViews = userChannels.reduce((s, ch) => s + (ch.viewCount ?? 0), 0);

  return `You are the CreatorOS AI Co-Pilot, an expert content strategy assistant. You help creators grow their channels, optimize content, and make data-driven decisions.

Current date/time: ${new Date().toISOString()}

Creator's channels:
${channelInfo || "No channels connected yet."}
${recentVideoInfo}

Overall stats: ${totalSubs} total subscribers, ${totalViews} total views across ${userChannels.length} channel(s).

You have access to tools that can fetch real-time data about the creator's channels, videos, schedule, and performance. Use them proactively when the creator asks questions about their content or performance.

Be concise, actionable, and data-driven. When suggesting improvements, reference specific metrics. Provide specific, implementable advice rather than generic tips.`;
}

export async function processCopilotMessage(userId: string, sessionId: string, message: string): Promise<{
  response: string;
  toolCalls: { tool: string; args: Record<string, any>; result?: any }[];
  suggestedActions: string[];
}> {
  try {
    const history = await db.select().from(copilotConversations)
      .where(and(eq(copilotConversations.userId, userId), eq(copilotConversations.sessionId, sessionId)))
      .orderBy(copilotConversations.createdAt)
      .limit(50);

    const systemPrompt = await buildSystemPrompt(userId);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    for (const msg of history) {
      messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }

    messages.push({ role: "user", content: message });

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: toolDefinitions,
      max_completion_tokens: 16000
    });

    const choice = completion.choices[0];
    const executedToolCalls: { tool: string; args: Record<string, any>; result?: any }[] = [];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const toolMessages: Array<any> = [
        ...messages,
        choice.message
      ];

      for (const tc of choice.message.tool_calls) {
        let args: any;
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
        let result: any;
        try {
          result = await executeTool(userId, tc.function.name, args);
        } catch (err: any) {
          result = { error: err.message || "Tool execution failed" };
        }
        executedToolCalls.push({ tool: tc.function.name, args, result });
        toolMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }

      const followUp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: toolMessages,
        max_completion_tokens: 16000
      });

      const responseContent = followUp.choices[0]?.message?.content || "I processed your request but couldn't generate a response.";

      await db.insert(copilotConversations).values({
        userId,
        sessionId,
        role: "user",
        content: message,
        tokensUsed: completion.usage?.total_tokens ?? 0
      });

      await db.insert(copilotConversations).values({
        userId,
        sessionId,
        role: "assistant",
        content: responseContent,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : null,
        tokensUsed: followUp.usage?.total_tokens ?? 0
      });

      const suggestedActions = generateSuggestedActions(message, executedToolCalls);

      return { response: responseContent, toolCalls: executedToolCalls, suggestedActions };
    }

    const responseContent = choice.message?.content || "I'm here to help with your content strategy. What would you like to know?";

    await db.insert(copilotConversations).values({
      userId,
      sessionId,
      role: "user",
      content: message,
      tokensUsed: completion.usage?.total_tokens ?? 0
    });

    await db.insert(copilotConversations).values({
      userId,
      sessionId,
      role: "assistant",
      content: responseContent,
      toolCalls: null,
      tokensUsed: completion.usage?.total_tokens ?? 0
    });

    const suggestedActions = generateSuggestedActions(message, []);

    return { response: responseContent, toolCalls: [], suggestedActions };
  } catch (err: any) {
    console.error("[CopilotEngine] Error processing message:", err);
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolCalls: [],
      suggestedActions: ["Try asking again", "Check your channel connections"]
    };
  }
}

function generateSuggestedActions(message: string, toolCalls: { tool: string; args: Record<string, any>; result?: any }[]): string[] {
  const suggestions: string[] = [];
  const lower = message.toLowerCase();

  if (lower.includes("video") || lower.includes("content")) {
    suggestions.push("Analyze my best performing video");
    suggestions.push("Suggest content ideas for this week");
  }
  if (lower.includes("schedule") || lower.includes("plan")) {
    suggestions.push("Show my upcoming schedule");
    suggestions.push("Suggest optimal posting times");
  }
  if (lower.includes("growth") || lower.includes("subscriber")) {
    suggestions.push("Show my channel stats");
    suggestions.push("Get performance summary");
  }
  if (lower.includes("performance") || lower.includes("analytics")) {
    suggestions.push("Compare my recent videos");
    suggestions.push("Identify my top performing content");
  }

  if (suggestions.length === 0) {
    suggestions.push("Show my channel stats");
    suggestions.push("Get recent video performance");
    suggestions.push("Suggest content ideas");
  }

  return suggestions.slice(0, 3);
}

export async function getCopilotHistory(userId: string, sessionId: string, limit?: number): Promise<CopilotMessage[]> {
  try {
    const rows = await db.select().from(copilotConversations)
      .where(and(eq(copilotConversations.userId, userId), eq(copilotConversations.sessionId, sessionId)))
      .orderBy(copilotConversations.createdAt)
      .limit(limit ?? 100);

    return rows.map(row => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      toolCalls: row.toolCalls ?? undefined
    }));
  } catch (err: any) {
    console.error("[CopilotEngine] Error fetching history:", err);
    return [];
  }
}

export async function clearCopilotSession(userId: string, sessionId: string): Promise<void> {
  try {
    await db.delete(copilotConversations).where(
      and(eq(copilotConversations.userId, userId), eq(copilotConversations.sessionId, sessionId))
    );
  } catch (err: any) {
    console.error("[CopilotEngine] Error clearing session:", err);
  }
}

export async function getCopilotSessions(userId: string): Promise<Array<{ sessionId: string; messageCount: number; lastMessageAt: string }>> {
  try {
    const rows = await db
      .select({
        sessionId: copilotConversations.sessionId,
        messageCount: sql<number>`count(*)::int`,
        lastMessageAt: sql<string>`max(${copilotConversations.createdAt})::text`
      })
      .from(copilotConversations)
      .where(eq(copilotConversations.userId, userId))
      .groupBy(copilotConversations.sessionId)
      .orderBy(desc(sql`max(${copilotConversations.createdAt})`));

    return rows.map(r => ({
      sessionId: r.sessionId,
      messageCount: r.messageCount,
      lastMessageAt: r.lastMessageAt
    }));
  } catch (err: any) {
    console.error("[CopilotEngine] Error fetching sessions:", err);
    return [];
  }
}
