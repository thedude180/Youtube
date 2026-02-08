import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function generateVideoMetadata(video: {
  title: string;
  description?: string | null;
  type: string;
  metadata?: any;
  platform?: string;
}) {
  const platformName = video.platform || 'youtube';
  const prompt = `You are a ${platformName} SEO expert and content strategist. Analyze this video and provide optimization suggestions.

Video Title: "${video.title}"
Video Type: ${video.type}
Platform: ${platformName}
Current Description: "${video.description || 'None provided'}"
Current Tags: ${video.metadata?.tags?.join(', ') || 'None'}

Provide your response as JSON with exactly these fields:
{
  "titleHooks": ["3 alternative title options that are click-worthy but not clickbait, optimized for ${platformName}"],
  "descriptionTemplate": "An optimized description with timestamps placeholder, relevant keywords, and a call-to-action. Include hashtags at the end.",
  "thumbnailCritique": "Specific actionable advice for the thumbnail based on what works on ${platformName} - mention contrast, text size, facial expressions, color theory",
  "seoRecommendations": ["5 specific SEO improvements for discoverability on ${platformName}"],
  "complianceNotes": ["Any ${platformName} ToS concerns or best practices to follow"],
  "suggestedTags": ["10 relevant tags ordered by importance"],
  "seoScore": 75
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function analyzeChannelGrowth(channelData: {
  channelName: string;
  platform: string;
  videoCount: number;
  videos: Array<{ title: string; type: string; status: string; metadata?: any }>;
}) {
  const videoSummary = channelData.videos.slice(0, 20).map(v =>
    `- "${v.title}" (${v.type}, ${v.status}${v.metadata?.stats ? `, ${v.metadata.stats.views} views` : ''})`
  ).join('\n');

  const prompt = `You are a YouTube growth strategist. Analyze this channel and create actionable growth strategies.

Channel: "${channelData.channelName}" on ${channelData.platform}
Total Videos: ${channelData.videoCount}
Recent Videos:
${videoSummary || 'No videos yet'}

Create 5 growth strategies as JSON array. Each strategy should have:
{
  "strategies": [
    {
      "title": "Strategy name",
      "description": "Detailed explanation",
      "category": "one of: content, seo, engagement, consistency, cross-platform",
      "priority": "high/medium/low",
      "actionItems": ["Specific step 1", "Specific step 2", "Specific step 3"],
      "estimatedImpact": "Expected result in 30 days"
    }
  ]
}

Focus on:
- Content patterns that drive growth
- Upload consistency and scheduling
- SEO and discoverability
- Audience engagement tactics
- Cross-platform distribution opportunities
Be specific to THIS channel's content, not generic advice.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function runComplianceCheck(channelData: {
  channelName: string;
  platform: string;
  recentActions: Array<{ action: string; target?: string | null; details?: any }>;
  settings: any;
}) {
  const actionLog = channelData.recentActions.slice(0, 30).map(a =>
    `- ${a.action}: ${a.target || 'N/A'} ${a.details ? JSON.stringify(a.details) : ''}`
  ).join('\n');

  const prompt = `You are a platform compliance expert for ${channelData.platform}. Review this channel's recent activity and settings for ToS compliance risks.

Channel: "${channelData.channelName}"
Platform: ${channelData.platform}
Settings: ${JSON.stringify(channelData.settings || {})}
Recent Actions:
${actionLog || 'No recent actions'}

Analyze for compliance risks and provide your response as JSON:
{
  "checks": [
    {
      "checkType": "type of check (e.g., upload_frequency, metadata_changes, spam_detection, content_policy)",
      "status": "pass or warning or fail",
      "rule": "The specific platform rule being checked",
      "description": "What was found",
      "severity": "info or warning or critical",
      "recommendation": "What to do about it"
    }
  ],
  "overallScore": 85,
  "summary": "Brief overall compliance summary"
}

Check for:
- Upload frequency (too fast = bot-like)
- Metadata edit frequency (mass edits = suspicious)
- Comment patterns (spam-like behavior)
- Content repetition
- Keyword stuffing in tags/descriptions
- Community guidelines alignment`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function generateContentInsights(videos: Array<{
  title: string;
  type: string;
  metadata?: any;
}>) {
  const videoList = videos.slice(0, 30).map(v => {
    const stats = v.metadata?.stats;
    return `- "${v.title}" (${v.type})${stats ? ` | Views: ${stats.views}, Likes: ${stats.likes}, CTR: ${stats.ctr}%` : ''}`;
  }).join('\n');

  const prompt = `You are a YouTube analytics expert. Analyze these videos and identify patterns for content improvement.

Videos:
${videoList || 'No videos to analyze'}

Identify content patterns and provide insights as JSON:
{
  "insights": [
    {
      "insightType": "one of: title_pattern, pacing, upload_time, thumbnail_style, engagement_hook, audience_retention, topic_trend",
      "category": "one of: what_works, what_to_avoid, opportunity, trend",
      "finding": "What the data shows",
      "confidence": 0.85,
      "recommendation": "Specific actionable recommendation",
      "evidence": ["Supporting data point 1", "Supporting data point 2"]
    }
  ],
  "weeklyReport": "A 2-3 paragraph summary of what to focus on this week"
}

Focus on patterns that would help improve:
- Click-through rate (titles & thumbnails)
- Watch time (content pacing)
- Upload timing optimization
- Topic selection
- Format effectiveness (shorts vs longform)`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function getContentStrategyAdvice(question: string, context: {
  channelName?: string;
  videoCount?: number;
  recentTitles?: string[];
}) {
  const prompt = `You are a YouTube content strategy advisor helping creators grow their channels. 

Channel context:
- Name: ${context.channelName || 'Unknown'}
- Videos: ${context.videoCount || 0}
- Recent titles: ${context.recentTitles?.join(', ') || 'None'}

The creator asks: "${question}"

Provide a detailed, actionable response. Be specific to YouTube/content creation. Include examples where helpful. Keep your response focused and practical - no fluff.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "You are an expert YouTube growth strategist. You help creators optimize their content, grow their audience, and stay compliant with platform rules. Always give specific, actionable advice." },
      { role: "user", content: prompt }
    ],
    max_completion_tokens: 1500,
  });

  return response.choices[0]?.message?.content || "Unable to generate advice at this time.";
}

export async function generateStreamSeo(streamData: {
  title: string;
  description?: string | null;
  category?: string | null;
  platforms: string[];
}) {
  const platformList = streamData.platforms.join(', ');
  const prompt = `You are a live streaming SEO expert. Optimize this stream for maximum discoverability across multiple platforms.

Stream Title: "${streamData.title}"
Description: "${streamData.description || 'Not provided'}"
Category: "${streamData.category || 'Gaming'}"
Target Platforms: ${platformList}

Provide your response as JSON:
{
  "optimizedTitle": "An optimized stream title that works across all platforms - attention-grabbing, clear, with relevant keywords",
  "optimizedDescription": "A compelling description with keywords, call-to-action, schedule info placeholder, and social links placeholder",
  "tags": ["15 relevant tags for discoverability"],
  "thumbnailPrompt": "A detailed description for generating an eye-catching stream thumbnail - include colors, composition, text overlay suggestions, and mood",
  "platformSpecific": {
${streamData.platforms.map(p => `    "${p}": { "title": "Platform-optimized title for ${p}", "description": "Platform-specific description for ${p}", "tags": ["5 platform-specific tags"] }`).join(',\n')}
  }
}

Focus on:
- Click-worthy but honest titles
- Platform-specific SEO best practices
- Keywords that drive live viewership
- Urgency/FOMO elements for live content`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function postStreamOptimize(streamData: {
  title: string;
  description?: string | null;
  category?: string | null;
  platforms: string[];
  duration?: number;
  stats?: any;
}) {
  const prompt = `You are a VOD optimization expert. This live stream just ended and needs to be optimized for on-demand viewing.

Original Stream Title: "${streamData.title}"
Stream Description: "${streamData.description || 'Not provided'}"
Category: "${streamData.category || 'Gaming'}"
Platforms: ${streamData.platforms.join(', ')}
Duration: ${streamData.duration ? `${Math.round(streamData.duration / 60)} minutes` : 'Unknown'}
${streamData.stats ? `Stats: Peak viewers: ${streamData.stats.peakViewers || 'N/A'}, Avg viewers: ${streamData.stats.avgViewers || 'N/A'}` : ''}

Rewrite and optimize for VOD performance as JSON:
{
  "vodTitle": "An optimized title for the VOD version - should be search-friendly and compelling for on-demand viewers",
  "vodDescription": "A full description with timestamps placeholder (e.g., [Add timestamps here]), keywords, engagement hooks, and calls to action",
  "tags": ["15 tags optimized for VOD search"],
  "thumbnailPrompt": "A detailed prompt for generating a click-worthy VOD thumbnail different from the live thumbnail - include composition, text overlay, colors, and emotional hooks",
  "seoScore": 80,
  "recommendations": ["5 specific things to do with this VOD to maximize views"],
  "platformSpecific": {
${streamData.platforms.map(p => `    "${p}": { "title": "VOD title for ${p}", "description": "VOD description for ${p}", "tags": ["5 tags for ${p}"] }`).join(',\n')}
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function generateThumbnailPrompt(data: {
  title: string;
  description?: string | null;
  platform?: string;
  type?: string;
}) {
  const prompt = `You are a thumbnail design expert for ${data.platform || 'YouTube'}. Create a detailed image generation prompt for a high-performing thumbnail.

Content Title: "${data.title}"
Description: "${data.description || 'Not provided'}"
Content Type: ${data.type || 'video'}
Platform: ${data.platform || 'youtube'}

Create a detailed, photorealistic image generation prompt as JSON:
{
  "prompt": "A detailed, specific image generation prompt that will create a professional, click-worthy thumbnail. Include: specific visual composition, color scheme (high contrast), text overlay suggestions (as visual elements), emotional hooks, facial expressions if applicable, background style, lighting, and any platform-specific sizing considerations. The prompt should produce a thumbnail that stands out in a crowded feed.",
  "style": "The overall visual style (e.g., cinematic, bold, minimalist, energetic)",
  "dominantColors": ["3 hex color codes that should dominate the thumbnail"],
  "textOverlay": "Suggested text to overlay on the thumbnail (keep it to 3-5 words maximum)"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const thumbContent = response.choices[0]?.message?.content;
  if (!thumbContent) throw new Error("No response from AI");
  return JSON.parse(thumbContent);
}

const AGENT_ROLES: Record<string, string> = {
  editor: "video editor who cuts highlights, creates shorts, and optimizes VODs for maximum engagement",
  social_manager: "social media manager who cross-posts content, schedules uploads, and manages community engagement across platforms",
  seo_director: "SEO expert who optimizes titles, descriptions, tags, and metadata for maximum discoverability",
  analytics_director: "analytics expert who tracks performance metrics, identifies trends, and generates actionable insights",
  brand_strategist: "brand strategist who maintains voice consistency, evaluates sponsorship fit, and ensures brand guidelines",
  ad_buyer: "ad buying specialist who manages ad spend, targets audiences, and optimizes return on ad spend",
  legal_advisor: "legal advisor who handles copyright checks, compliance monitoring, DMCA protection, and ToS adherence",
  community_manager: "community manager who moderates comments, engages with fans, handles DMs, and builds community",
  business_manager: "business manager who tracks revenue, handles invoicing, negotiates sponsorships, and manages finances",
  growth_strategist: "growth strategist who designs A/B tests, plans collaborations, identifies viral content opportunities, and drives channel growth",
};

export async function runAgentTask(agentId: string, context: {
  channelName: string;
  videoCount: number;
  recentTitles: string[];
}) {
  const role = AGENT_ROLES[agentId] || "AI assistant";
  const prompt = `You are a ${role} working autonomously for the YouTube channel "${context.channelName}".

Channel has ${context.videoCount} videos. Recent titles: ${context.recentTitles.join(', ') || 'None'}

Perform your most important task right now. Respond as JSON:
{
  "action": "What you did (e.g., 'Optimized 3 video titles for CTR')",
  "target": "What you worked on (e.g., 'Recent video SEO')",
  "description": "Detailed description of what you accomplished and why",
  "impact": "Expected impact (e.g., '+15% CTR improvement expected')",
  "recommendations": ["3 specific follow-up recommendations"]
}

Be specific, actionable, and reference actual content from this channel.`;

  const agentResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const agentContent = agentResponse.choices[0]?.message?.content;
  if (!agentContent) throw new Error("No response from AI");
  return JSON.parse(agentContent);
}

export async function generateCommunityPost(data: {
  platform: string;
  channelName: string;
  recentTitles: string[];
  type: string;
}) {
  const prompt = `You are a social media expert for the ${data.platform} channel "${data.channelName}".

Recent content: ${data.recentTitles.join(', ') || 'None'}
Post type: ${data.type}

Create an engaging community post as JSON:
{
  "content": "The full post text, engaging and platform-appropriate. Include relevant hashtags. Write in a natural, authentic voice that feels human-written.",
  "bestTimeToPost": "Recommended posting time (e.g., 'Tuesday 3 PM EST')",
  "expectedEngagement": "Expected engagement level (high/medium/low)"
}`;

  const communityResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 512,
  });

  const communityContent = communityResponse.choices[0]?.message?.content;
  if (!communityContent) throw new Error("No response from AI");
  return JSON.parse(communityContent);
}
