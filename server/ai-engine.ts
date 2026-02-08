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
}) {
  const prompt = `You are a YouTube SEO expert and content strategist. Analyze this video and provide optimization suggestions.

Video Title: "${video.title}"
Video Type: ${video.type}
Current Description: "${video.description || 'None provided'}"
Current Tags: ${video.metadata?.tags?.join(', ') || 'None'}

Provide your response as JSON with exactly these fields:
{
  "titleHooks": ["3 alternative title options that are click-worthy but not clickbait, using proven YouTube title formulas"],
  "descriptionTemplate": "An optimized description with timestamps placeholder, relevant keywords, and a call-to-action. Include hashtags at the end.",
  "thumbnailCritique": "Specific actionable advice for the thumbnail based on what works on YouTube - mention contrast, text size, facial expressions, color theory",
  "seoRecommendations": ["5 specific SEO improvements for discoverability"],
  "complianceNotes": ["Any YouTube ToS concerns or best practices to follow"],
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
