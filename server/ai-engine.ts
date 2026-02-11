import OpenAI from "openai";
import { getCreatorStyleContext, getLearningContext, buildHumanizationPrompt } from "./creator-intelligence";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export function detectGamingContext(title: string, description?: string | null, category?: string | null, metadata?: any): {
  isGaming: boolean;
  gameName: string | null;
  brandKeywords: string[];
} {
  const text = `${title} ${description || ''} ${category || ''}`.toLowerCase();
  const explicitGame = metadata?.gameName;
  if (explicitGame) {
    return { isGaming: true, gameName: explicitGame, brandKeywords: metadata?.brandKeywords || [] };
  }

  const gamingSignals = [
    'gameplay', 'playthrough', 'walkthrough', 'speedrun', 'let\'s play',
    'gaming', 'stream', 'live stream', 'ranked', 'competitive', 'multiplayer',
    'co-op', 'boss fight', 'raid', 'pvp', 'pve', 'esports', 'tournament',
    'highlights', 'montage', 'clutch', 'win', 'victory royale', 'battle royale',
  ];
  const isGaming = category?.toLowerCase() === 'gaming' ||
    gamingSignals.some(s => text.includes(s));

  const knownGames: Record<string, string[]> = {
    'Fortnite': ['fortnite', 'battle royale fortnite', 'fortnite chapter'],
    'Call of Duty': ['call of duty', 'cod', 'warzone', 'modern warfare', 'black ops'],
    'Minecraft': ['minecraft', 'mc server', 'survival minecraft'],
    'Apex Legends': ['apex legends', 'apex'],
    'Valorant': ['valorant', 'valo'],
    'League of Legends': ['league of legends', 'lol ranked', 'league'],
    'GTA V': ['gta', 'gta v', 'gta 5', 'gta online', 'grand theft auto'],
    'Elden Ring': ['elden ring', 'lands between'],
    'Baldur\'s Gate 3': ['baldur\'s gate', 'bg3'],
    'Helldivers 2': ['helldivers', 'helldivers 2'],
    'Counter-Strike 2': ['counter-strike', 'cs2', 'csgo', 'cs:go'],
    'Overwatch 2': ['overwatch', 'ow2'],
    'Rocket League': ['rocket league'],
    'Destiny 2': ['destiny 2', 'destiny'],
    'FIFA': ['fifa', 'ea fc', 'ea sports fc'],
    'NBA 2K': ['nba 2k', '2k25', '2k24'],
    'Madden': ['madden'],
    'Spider-Man 2': ['spider-man', 'spiderman'],
    'God of War': ['god of war', 'ragnarok'],
    'Zelda': ['zelda', 'tears of the kingdom', 'breath of the wild', 'totk', 'botw'],
    'Palworld': ['palworld'],
    'Roblox': ['roblox'],
    'Diablo IV': ['diablo', 'diablo iv', 'diablo 4'],
    'Final Fantasy': ['final fantasy', 'ffxiv', 'ff14', 'ff7'],
    'Pokemon': ['pokemon', 'pokémon'],
  };

  let detectedGame: string | null = null;
  for (const [game, patterns] of Object.entries(knownGames)) {
    if (patterns.some(p => text.includes(p))) {
      detectedGame = game;
      break;
    }
  }

  return {
    isGaming: isGaming || !!detectedGame,
    gameName: detectedGame,
    brandKeywords: metadata?.brandKeywords || [],
  };
}

function buildGamingPromptSection(ctx: { isGaming: boolean; gameName: string | null; brandKeywords: string[] }): string {
  if (!ctx.isGaming) return '';
  let section = '\n\nGAMING CONTENT REQUIREMENTS (CRITICAL):';
  if (ctx.gameName) {
    section += `\n- This content features the game "${ctx.gameName}". ALL SEO, tags, titles, descriptions, and thumbnails MUST reference "${ctx.gameName}" by name.`;
    section += `\n- Use game-specific terminology, characters, maps, weapons, mechanics, and community lingo for "${ctx.gameName}".`;
    section += `\n- Tags MUST include the game name and related search terms players actually search for.`;
    section += `\n- Thumbnail should visually reference "${ctx.gameName}" - include recognizable game art style, color palette, characters, or iconic UI elements.`;
  } else {
    section += '\n- This appears to be gaming content. Ensure SEO and thumbnails reflect gaming aesthetics and terminology.';
  }
  if (ctx.brandKeywords.length > 0) {
    section += `\n\nBRAND ALIGNMENT: The creator's brand keywords are: ${ctx.brandKeywords.join(', ')}. All output must align with this brand identity - maintain consistent voice, visual style, and messaging.`;
  }
  section += '\n- Gaming thumbnails should: use high-energy compositions, include in-game action shots or recognizable game imagery, use bold contrasting colors, feature dramatic moments or reactions.';
  section += '\n- Gaming SEO should: target game-specific long-tail keywords, include game version/season/update info, reference trending community topics, use gaming community hashtags.';
  return section;
}

async function getCreatorContext(userId?: string): Promise<string> {
  if (!userId) return '';
  try {
    const [style, learning, humanization] = await Promise.all([
      getCreatorStyleContext(userId),
      getLearningContext(userId),
      buildHumanizationPrompt(userId),
    ]);
    return [style, learning, humanization].filter(Boolean).join('\n\n');
  } catch {
    return '';
  }
}

export async function generateVideoMetadata(video: {
  title: string;
  description?: string | null;
  type: string;
  metadata?: any;
  platform?: string;
}, userId?: string) {
  const platformName = video.platform || 'youtube';
  const gamingCtx = detectGamingContext(video.title, video.description, video.metadata?.contentCategory, video.metadata);
  const gamingSection = buildGamingPromptSection(gamingCtx);
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a ${platformName} SEO expert and content strategist. Analyze this video and provide optimization suggestions.

Video Title: "${video.title}"
Video Type: ${video.type}
Platform: ${platformName}
Current Description: "${video.description || 'None provided'}"
Current Tags: ${video.metadata?.tags?.join(', ') || 'None'}
${gamingCtx.gameName ? `Game: "${gamingCtx.gameName}"` : ''}
${gamingCtx.isGaming ? `Content Category: Gaming` : ''}
${gamingSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Provide your response as JSON with exactly these fields:
{
  "titleHooks": ["3 alternative title options that are click-worthy but not clickbait, optimized for ${platformName}${gamingCtx.gameName ? ` and referencing ${gamingCtx.gameName}` : ''}"],
  "descriptionTemplate": "An optimized description with timestamps placeholder, relevant keywords, and a call-to-action. Include hashtags at the end.${gamingCtx.gameName ? ` Must reference ${gamingCtx.gameName} and include game-specific keywords.` : ''}",
  "thumbnailCritique": "Specific actionable advice for the thumbnail based on what works on ${platformName}${gamingCtx.isGaming ? ' for gaming content' : ''} - mention contrast, text size, facial expressions, color theory${gamingCtx.gameName ? `, and how to visually represent ${gamingCtx.gameName}` : ''}",
  "seoRecommendations": ["5 specific SEO improvements for discoverability on ${platformName}${gamingCtx.gameName ? ` targeting ${gamingCtx.gameName} audience` : ''}"],
  "complianceNotes": ["Any ${platformName} ToS concerns or best practices to follow"],
  "suggestedTags": ["10 relevant tags ordered by importance${gamingCtx.gameName ? ` - must include ${gamingCtx.gameName} and related game terms` : ''}"],
  "seoScore": 75${gamingCtx.gameName ? `,\n  "detectedGame": "${gamingCtx.gameName}"` : ''}
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
}, userId?: string) {
  const videoSummary = channelData.videos.slice(0, 20).map(v =>
    `- "${v.title}" (${v.type}, ${v.status}${v.metadata?.stats ? `, ${v.metadata.stats.views} views` : ''})`
  ).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube growth strategist. Analyze this channel and create actionable growth strategies.

Channel: "${channelData.channelName}" on ${channelData.platform}
Total Videos: ${channelData.videoCount}
Recent Videos:
${videoSummary || 'No videos yet'}
${creatorContext ? `\n${creatorContext}` : ''}

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
}, userId?: string) {
  const actionLog = channelData.recentActions.slice(0, 30).map(a =>
    `- ${a.action}: ${a.target || 'N/A'} ${a.details ? JSON.stringify(a.details) : ''}`
  ).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a platform compliance expert for ${channelData.platform}. Review this channel's recent activity and settings for ToS compliance risks.

Channel: "${channelData.channelName}"
Platform: ${channelData.platform}
Settings: ${JSON.stringify(channelData.settings || {})}
Recent Actions:
${actionLog || 'No recent actions'}
${creatorContext ? `\n${creatorContext}` : ''}

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
}>, userId?: string) {
  const videoList = videos.slice(0, 30).map(v => {
    const stats = v.metadata?.stats;
    return `- "${v.title}" (${v.type})${stats ? ` | Views: ${stats.views}, Likes: ${stats.likes}, CTR: ${stats.ctr}%` : ''}`;
  }).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube analytics expert. Analyze these videos and identify patterns for content improvement.

Videos:
${videoList || 'No videos to analyze'}
${creatorContext ? `\n${creatorContext}` : ''}

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
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube content strategy advisor helping creators grow their channels. 

Channel context:
- Name: ${context.channelName || 'Unknown'}
- Videos: ${context.videoCount || 0}
- Recent titles: ${context.recentTitles?.join(', ') || 'None'}

The creator asks: "${question}"
${creatorContext ? `\n${creatorContext}` : ''}

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
  gameName?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const platformList = streamData.platforms.join(', ');
  const gamingCtx = detectGamingContext(streamData.title, streamData.description, streamData.category, { gameName: streamData.gameName, brandKeywords: streamData.brandKeywords });
  const gamingSection = buildGamingPromptSection(gamingCtx);
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a live streaming SEO expert. Optimize this stream for maximum discoverability across multiple platforms.

Stream Title: "${streamData.title}"
Description: "${streamData.description || 'Not provided'}"
Category: "${streamData.category || 'Gaming'}"
Target Platforms: ${platformList}
${gamingCtx.gameName ? `Game Being Played: "${gamingCtx.gameName}"` : ''}
${gamingSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Provide your response as JSON:
{
  "optimizedTitle": "An optimized stream title that works across all platforms - attention-grabbing, clear, with relevant keywords${gamingCtx.gameName ? `. MUST include ${gamingCtx.gameName} in the title` : ''}",
  "optimizedDescription": "A compelling description with keywords, call-to-action, schedule info placeholder, and social links placeholder${gamingCtx.gameName ? `. Must reference ${gamingCtx.gameName} and include game-specific details` : ''}",
  "tags": ["15 relevant tags for discoverability${gamingCtx.gameName ? ` - must include ${gamingCtx.gameName} and game-specific terms` : ''}"],
  "thumbnailPrompt": "A detailed description for generating an eye-catching stream thumbnail${gamingCtx.gameName ? ` featuring ${gamingCtx.gameName} game elements, characters, or environments` : ''} - include colors, composition, text overlay suggestions, and mood${gamingCtx.isGaming ? '. Use high-energy gaming aesthetic with the game\'s visual identity' : ''}",
  "platformSpecific": {
${streamData.platforms.map(p => `    "${p}": { "title": "Platform-optimized title for ${p}${gamingCtx.gameName ? ` featuring ${gamingCtx.gameName}` : ''}", "description": "Platform-specific description for ${p}", "tags": ["5 platform-specific tags${gamingCtx.gameName ? ` related to ${gamingCtx.gameName}` : ''}"] }`).join(',\n')}
  }
}

Focus on:
- Click-worthy but honest titles${gamingCtx.gameName ? ` that reference ${gamingCtx.gameName}` : ''}
- Platform-specific SEO best practices
- Keywords that drive live viewership${gamingCtx.isGaming ? ' in the gaming category' : ''}
- Urgency/FOMO elements for live content${gamingCtx.gameName ? `\n- Game-specific trending topics and community terms for ${gamingCtx.gameName}` : ''}`;

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
  gameName?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const gamingCtx = detectGamingContext(streamData.title, streamData.description, streamData.category, { gameName: streamData.gameName, brandKeywords: streamData.brandKeywords });
  const gamingSection = buildGamingPromptSection(gamingCtx);
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a VOD optimization expert. This live stream just ended and needs to be optimized for on-demand viewing.

Original Stream Title: "${streamData.title}"
Stream Description: "${streamData.description || 'Not provided'}"
Category: "${streamData.category || 'Gaming'}"
Platforms: ${streamData.platforms.join(', ')}
Duration: ${streamData.duration ? `${Math.round(streamData.duration / 60)} minutes` : 'Unknown'}
${streamData.stats ? `Stats: Peak viewers: ${streamData.stats.peakViewers || 'N/A'}, Avg viewers: ${streamData.stats.avgViewers || 'N/A'}` : ''}
${gamingCtx.gameName ? `Game Played: "${gamingCtx.gameName}"` : ''}
${gamingSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Rewrite and optimize for VOD performance as JSON:
{
  "vodTitle": "An optimized title for the VOD version - should be search-friendly and compelling for on-demand viewers${gamingCtx.gameName ? `. MUST include ${gamingCtx.gameName} in the title` : ''}",
  "vodDescription": "A full description with timestamps placeholder (e.g., [Add timestamps here]), keywords, engagement hooks, and calls to action${gamingCtx.gameName ? `. Must reference ${gamingCtx.gameName} with game-specific keywords` : ''}",
  "tags": ["15 tags optimized for VOD search${gamingCtx.gameName ? ` - must include ${gamingCtx.gameName} and related game terms` : ''}"],
  "thumbnailPrompt": "A detailed prompt for generating a click-worthy VOD thumbnail different from the live thumbnail${gamingCtx.gameName ? ` featuring ${gamingCtx.gameName} game visuals, characters, or epic moments from gameplay` : ''} - include composition, text overlay, colors, and emotional hooks${gamingCtx.isGaming ? '. Match the game\'s visual identity and color palette' : ''}",
  "seoScore": 80,
  "recommendations": ["5 specific things to do with this VOD to maximize views${gamingCtx.gameName ? ` in the ${gamingCtx.gameName} community` : ''}"],
  "platformSpecific": {
${streamData.platforms.map(p => `    "${p}": { "title": "VOD title for ${p}${gamingCtx.gameName ? ` referencing ${gamingCtx.gameName}` : ''}", "description": "VOD description for ${p}", "tags": ["5 tags for ${p}${gamingCtx.gameName ? ` including ${gamingCtx.gameName}` : ''}"] }`).join(',\n')}
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
  gameName?: string | null;
  category?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const gamingCtx = detectGamingContext(data.title, data.description, data.category, { gameName: data.gameName, brandKeywords: data.brandKeywords });
  const gamingSection = buildGamingPromptSection(gamingCtx);
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a thumbnail design expert for ${data.platform || 'YouTube'}. Create a detailed image generation prompt for a high-performing thumbnail.

Content Title: "${data.title}"
Description: "${data.description || 'Not provided'}"
Content Type: ${data.type || 'video'}
Platform: ${data.platform || 'youtube'}
${gamingCtx.gameName ? `Game: "${gamingCtx.gameName}"` : ''}
${gamingCtx.isGaming ? `Content Category: Gaming` : ''}
${gamingSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Create a detailed, photorealistic image generation prompt as JSON:
{
  "prompt": "A detailed, specific image generation prompt that will create a professional, click-worthy thumbnail.${gamingCtx.gameName ? ` The thumbnail MUST visually reference ${gamingCtx.gameName} - use recognizable game characters, environments, weapons, or visual motifs from the game. The color palette should match ${gamingCtx.gameName}'s aesthetic.` : ''} Include: specific visual composition, color scheme (high contrast), text overlay suggestions (as visual elements), emotional hooks, facial expressions if applicable, background style, lighting, and any platform-specific sizing considerations.${gamingCtx.isGaming ? ' For gaming content: feature dramatic in-game action, use high-energy compositions, show epic moments, victories, or intense gameplay scenes.' : ''} The prompt should produce a thumbnail that stands out in a crowded feed.",
  "style": "The overall visual style${gamingCtx.isGaming ? ' (should match the game\'s aesthetic - e.g., dark/gritty for horror games, colorful for casual games, tactical for FPS games)' : ' (e.g., cinematic, bold, minimalist, energetic)'}",
  "dominantColors": ["3 hex color codes that should dominate the thumbnail${gamingCtx.gameName ? ` - should align with ${gamingCtx.gameName}'s brand colors` : ''}"],
  "textOverlay": "Suggested text to overlay on the thumbnail (keep it to 3-5 words maximum${gamingCtx.gameName ? ` - reference ${gamingCtx.gameName} or game-specific terms` : ''})"
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
  tax_strategist: "tax strategist who finds deductions, calculates quarterly estimates, recommends entity structure changes (sole prop to LLC to S-Corp), monitors state tax obligations, and ensures IRS compliance for content creators",
};

export async function runAgentTask(agentId: string, context: {
  channelName: string;
  videoCount: number;
  recentTitles: string[];
  gameName?: string | null;
  contentCategory?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const role = AGENT_ROLES[agentId] || "AI assistant";
  const gamingCtx = detectGamingContext(
    context.recentTitles.join(' '),
    null,
    context.contentCategory,
    { gameName: context.gameName, brandKeywords: context.brandKeywords }
  );

  let gamingInstructions = '';
  if (gamingCtx.isGaming) {
    gamingInstructions = `\n\nIMPORTANT - GAMING CONTENT CONTEXT:`;
    if (gamingCtx.gameName) {
      gamingInstructions += `\n- The channel primarily features "${gamingCtx.gameName}" content.`;
      gamingInstructions += `\n- All recommendations, titles, tags, thumbnails, and strategies MUST be tailored to "${gamingCtx.gameName}" and its community.`;
      gamingInstructions += `\n- Use game-specific terminology, meta strategies, character/weapon names, and community trends for "${gamingCtx.gameName}".`;
    }
    if (gamingCtx.brandKeywords.length > 0) {
      gamingInstructions += `\n- Creator's brand identity: ${gamingCtx.brandKeywords.join(', ')}. Ensure all output aligns with this brand voice.`;
    }
    gamingInstructions += `\n- Gaming thumbnails should feature in-game visuals, dramatic moments, and the game's color palette.`;
    gamingInstructions += `\n- Gaming SEO should target game-specific keywords that the community actually searches for.`;
  }

  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a ${role} working autonomously for the YouTube channel "${context.channelName}".

Channel has ${context.videoCount} videos. Recent titles: ${context.recentTitles.join(', ') || 'None'}
${gamingCtx.gameName ? `Primary Game: "${gamingCtx.gameName}"` : ''}
${gamingCtx.isGaming ? 'Content Category: Gaming' : ''}${gamingInstructions}${creatorContext ? `\n\n${creatorContext}` : ''}

Perform your most important task right now. Respond as JSON:
{
  "action": "What you did (e.g., 'Optimized 3 video titles for CTR')",
  "target": "What you worked on (e.g., 'Recent video SEO')",
  "description": "Detailed description of what you accomplished and why${gamingCtx.gameName ? ` - must reference ${gamingCtx.gameName} specifics` : ''}",
  "impact": "Expected impact (e.g., '+15% CTR improvement expected')",
  "recommendations": ["3 specific follow-up recommendations${gamingCtx.gameName ? ` tailored to ${gamingCtx.gameName} content` : ''}"]
}

Be specific, actionable, and reference actual content from this channel.${gamingCtx.gameName ? ` All output must be relevant to ${gamingCtx.gameName} and its gaming community.` : ''}`;

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
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a social media expert for the ${data.platform} channel "${data.channelName}".

Recent content: ${data.recentTitles.join(', ') || 'None'}
Post type: ${data.type}
${creatorContext ? `\n${creatorContext}` : ''}

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

export async function generateTaxStrategy(data: {
  totalRevenue: number;
  totalExpenses: number;
  state: string;
  entityType: string;
  expenses: Array<{ category: string; amount: number; description: string }>;
  platforms: string[];
  year: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const expenseBreakdown = data.expenses.map(e =>
    `- ${e.category}: $${e.amount} (${e.description})`
  ).join('\n');

  const prompt = `You are a tax strategist specializing in content creators and digital entrepreneurs. Analyze this creator's financial situation and provide comprehensive tax optimization advice.

Total Revenue: $${data.totalRevenue}
Total Expenses: $${data.totalExpenses}
Net Income: $${data.totalRevenue - data.totalExpenses}
State: ${data.state}
Entity Type: ${data.entityType}
Tax Year: ${data.year}
Platforms: ${data.platforms.join(', ')}

Expense Breakdown:
${expenseBreakdown || 'No expenses provided'}
${creatorContext ? `\n${creatorContext}` : ''}

Provide your analysis as JSON with exactly these fields:
{
  "quarterlyEstimate": { "federal": 0, "state": 0, "selfEmployment": 0, "total": 0 },
  "deductionOpportunities": [{ "category": "", "description": "", "estimatedSavings": 0, "irsCategory": "" }],
  "entityRecommendation": { "currentType": "", "recommendedType": "", "reason": "", "savingsEstimate": 0, "threshold": "" },
  "stateSpecific": { "stateTaxRate": 0, "filingRequirements": [], "deadlines": [] },
  "warnings": [""],
  "optimizationScore": 75
}

Focus on:
- Accurate quarterly estimated tax calculations for federal, state, and self-employment taxes
- Content creator-specific deductions (equipment, software, home office, internet, travel for events, etc.)
- Whether the creator should change entity structure based on their income level
- State-specific tax obligations and filing requirements
- IRS compliance warnings and common audit triggers for content creators
- Platform-specific tax considerations (1099 reporting thresholds, international income)`;

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

export async function generateExpenseAnalysis(data: {
  expenses: Array<{ category: string; amount: number; description: string; vendor?: string }>;
  revenue: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const expenseList = data.expenses.map(e =>
    `- ${e.description}: $${e.amount} (Category: ${e.category}${e.vendor ? `, Vendor: ${e.vendor}` : ''})`
  ).join('\n');

  const prompt = `You are a tax expense analyst specializing in content creators. Review these expenses and suggest better categorization, identify missing deductions, and provide optimization recommendations.

Total Revenue: $${data.revenue}
Total Expenses: $${data.expenses.reduce((sum, e) => sum + e.amount, 0)}
Expense-to-Revenue Ratio: ${((data.expenses.reduce((sum, e) => sum + e.amount, 0) / data.revenue) * 100).toFixed(1)}%

Expenses:
${expenseList || 'No expenses provided'}
${creatorContext ? `\n${creatorContext}` : ''}

Provide your analysis as JSON with exactly these fields:
{
  "suggestions": [{ "expense": "", "currentCategory": "", "betterCategory": "", "reason": "" }],
  "missingDeductions": [{ "category": "", "description": "", "typicalAmount": 0 }],
  "expenseRatio": 0,
  "healthScore": 85,
  "recommendations": [""]
}

Focus on:
- Recategorizing expenses into proper IRS-recognized categories for maximum deduction value
- Identifying commonly missed deductions for content creators (home office, internet, phone, equipment depreciation, software subscriptions, travel for conventions/events, professional development)
- Calculating expense-to-revenue ratio and whether it is healthy
- Providing an overall financial health score based on expense management
- Specific actionable recommendations to improve tax efficiency`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const expContent = response.choices[0]?.message?.content;
  if (!expContent) throw new Error("No response from AI");
  return JSON.parse(expContent);
}

export async function aiCategorizeExpenses(expenses: Array<{ description: string; amount: number; vendor?: string }>, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const list = expenses.map(e => `- "${e.description}" $${e.amount}${e.vendor ? ` (${e.vendor})` : ''}`).join('\n');

  const prompt = `You are an expense categorization AI for content creators. Automatically categorize these expenses into IRS-recognized categories and determine if they are tax deductible.

Expenses:
${list}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "categorized": [
    {
      "description": "original description",
      "amount": 0,
      "category": "one of: advertising, equipment, software_subscriptions, travel, home_office, education_training, supplies, meals, internet_phone, insurance, legal_professional, office_expense, other",
      "irsCategory": "same as category",
      "taxDeductible": true,
      "confidence": 0.95,
      "reason": "why this category"
    }
  ]
}`;

  const catResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });
  const catContent = catResponse.choices[0]?.message?.content;
  if (!catContent) throw new Error("No response from AI");
  return JSON.parse(catContent);
}

export async function aiFinancialInsights(data: {
  totalRevenue: number;
  totalExpenses: number;
  revenueByPlatform: Record<string, number>;
  expensesByCategory: Record<string, number>;
  monthlyRevenue: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a financial advisor AI for content creators. Analyze this creator's finances and provide smart insights.

Total Revenue: $${data.totalRevenue}
Total Expenses: $${data.totalExpenses}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Monthly Revenue: $${data.monthlyRevenue}
Revenue by Platform: ${JSON.stringify(data.revenueByPlatform)}
Expenses by Category: ${JSON.stringify(data.expensesByCategory)}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "insights": [
    { "title": "short title", "description": "detailed insight", "type": "positive|warning|opportunity", "priority": "high|medium|low" }
  ],
  "forecast": { "nextMonth": 0, "nextQuarter": 0, "yearEnd": 0, "growthRate": 0 },
  "recommendations": [
    { "action": "what to do", "impact": "expected result", "urgency": "high|medium|low" }
  ],
  "healthScore": 85,
  "summary": "2-3 sentence financial summary"
}`;

  const finResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
  });
  const finContent = finResponse.choices[0]?.message?.content;
  if (!finContent) throw new Error("No response from AI");
  return JSON.parse(finContent);
}

export async function aiStreamRecommendations(data: {
  channelName: string;
  pastStreams: Array<{ title: string; category: string; platforms: string[] }>;
  videoCount: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const streamList = data.pastStreams.slice(0, 10).map(s => `- "${s.title}" (${s.category}) on ${s.platforms.join(', ')}`).join('\n');

  const prompt = `You are a live streaming strategist AI. Analyze this creator's streaming habits and recommend optimal streaming strategies.

Channel: "${data.channelName}"
Total Videos: ${data.videoCount}
Past Streams:
${streamList || 'No past streams'}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "optimalTimes": [
    { "day": "Monday", "time": "7:00 PM EST", "reason": "audience peak", "confidence": 0.85 }
  ],
  "trendingTopics": [
    { "topic": "topic name", "relevance": 0.9, "reason": "why trending", "suggestedTitle": "stream title idea" }
  ],
  "streamIdeas": [
    { "title": "auto-generated stream title", "description": "auto-generated description", "category": "Gaming", "platforms": ["youtube", "twitch"], "reason": "why this would work" }
  ],
  "schedule": {
    "recommendedFrequency": "3x per week",
    "bestDays": ["Tuesday", "Thursday", "Saturday"],
    "reason": "why this schedule"
  }
}`;

  const strmResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
  });
  const strmContent = strmResponse.choices[0]?.message?.content;
  if (!strmContent) throw new Error("No response from AI");
  return JSON.parse(strmContent);
}

export async function aiContentIdeas(data: {
  channelName: string;
  recentTitles: string[];
  videoCount: number;
  topPerforming?: string[];
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a content strategy AI that generates viral content ideas. Analyze this channel and generate fresh, specific content ideas.

Channel: "${data.channelName}"
Total Videos: ${data.videoCount}
Recent Titles: ${data.recentTitles.slice(0, 15).join(', ') || 'None'}
Top Performing: ${data.topPerforming?.join(', ') || 'Unknown'}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "ideas": [
    {
      "title": "ready-to-use video title",
      "description": "full auto-generated description with hashtags",
      "type": "vod|short",
      "tags": ["tag1", "tag2"],
      "reason": "why this will perform well",
      "viralScore": 85,
      "bestPostTime": "Tuesday 3PM EST"
    }
  ],
  "seriesIdeas": [
    { "name": "series name", "description": "series concept", "episodeCount": 5, "reason": "why a series works" }
  ],
  "trendAlert": "current trending topic to capitalize on right now"
}`;

  const ideaResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
  });
  const ideaContent = ideaResponse.choices[0]?.message?.content;
  if (!ideaContent) throw new Error("No response from AI");
  return JSON.parse(ideaContent);
}

export async function aiDashboardActions(data: {
  channelName: string;
  videoCount: number;
  totalRevenue: number;
  totalExpenses: number;
  recentTitles: string[];
  activeGoals: number;
  activeVentures: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are an AI business operations manager for a content creator. Based on their current situation, generate proactive action items and opportunity alerts.

Channel: "${data.channelName}"
Videos: ${data.videoCount}
Revenue: $${data.totalRevenue}
Expenses: $${data.totalExpenses}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Active Goals: ${data.activeGoals}
Active Ventures: ${data.activeVentures}
Recent Content: ${data.recentTitles.slice(0, 10).join(', ') || 'None'}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "actionItems": [
    { "title": "what AI is doing or recommends", "description": "detailed explanation", "priority": "high|medium|low", "category": "content|revenue|growth|compliance|wellness", "status": "auto_handled|needs_review" }
  ],
  "opportunities": [
    { "title": "opportunity name", "description": "why this is an opportunity", "potentialImpact": "$500/mo or 10K views", "urgency": "act_now|this_week|this_month" }
  ],
  "todaySummary": "What AI is working on today - 2-3 sentences"
}`;

  const actResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
  });
  const actContent = actResponse.choices[0]?.message?.content;
  if (!actContent) throw new Error("No response from AI");
  return JSON.parse(actContent);
}

export async function aiBrandAnalysis(data: {
  channelName: string;
  recentTitles: string[];
  videoCount: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a brand analysis AI. Analyze this creator's content to auto-detect their brand identity.

Channel: "${data.channelName}"
Videos: ${data.videoCount}
Recent Titles: ${data.recentTitles.slice(0, 15).join(', ') || 'None'}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "brandVoice": "description of detected brand voice/tone",
  "targetAudience": "who the content targets",
  "contentPillars": ["3-5 core content themes"],
  "uniqueValue": "what makes this creator unique",
  "suggestedColors": ["#hex1", "#hex2", "#hex3"],
  "suggestedTagline": "a brand tagline suggestion",
  "competitors": [
    { "name": "competitor channel name", "similarity": 0.8, "differentiator": "what sets you apart" }
  ],
  "brandStrength": 75
}`;

  const brandResponse = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });
  const brandContent = brandResponse.choices[0]?.message?.content;
  if (!brandContent) throw new Error("No response from AI");
  return JSON.parse(brandContent);
}

export async function aiScriptWriter(data: { topic: string; style?: string; duration?: string; channelName?: string; recentTitles?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `You are an expert video scriptwriter. Write a complete, ready-to-record video script.
Topic: "${data.topic}"
Style: ${data.style || "entertaining and educational"}
Target Duration: ${data.duration || "10 minutes"}
Channel: ${data.channelName || "Creator Channel"}
Recent Videos: ${data.recentTitles?.slice(0, 5).join(", ") || "None"}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "title": "optimized video title",
  "hook": "attention-grabbing first 5 seconds",
  "sections": [{"heading": "section name", "content": "full script text for this section", "duration": "estimated time", "notes": "visual/editing notes"}],
  "cta": "call to action script",
  "thumbnailIdea": "thumbnail concept description",
  "tags": ["tag1", "tag2"],
  "estimatedDuration": "total estimated duration",
  "chapters": [{"time": "0:00", "title": "chapter title"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 2000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailConcepts(data: { videoTitle: string; category?: string; channelName?: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Generate 3 high-CTR thumbnail concepts for this video. Be specific about visual composition.
Title: "${data.videoTitle}"
Category: ${data.category || "General"}
Channel: ${data.channelName || "Creator"}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "concepts": [
    {"layout": "description of visual layout", "text": "text overlay (max 4 words)", "emotion": "facial expression/mood", "colors": ["primary", "accent"], "style": "photo-realistic|illustrated|mixed", "predictedCTR": "8-12%", "reason": "why this works"}
  ],
  "bestPractices": ["tip1", "tip2"],
  "avoidList": ["what not to do"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1024 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChapterMarkers(data: { title: string; description?: string; duration?: string }, userId?: string) {
  const p = `Generate YouTube chapter timestamps for this video. Create logical chapter breaks.
Title: "${data.title}"
Description: ${data.description || "Not provided"}
Duration: ${data.duration || "10:00"}
Respond as JSON:
{
  "chapters": [{"time": "0:00", "title": "chapter title", "description": "brief chapter summary"}],
  "description": "full formatted description with chapters included"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1024 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeywordResearch(data: { niche: string; channelName?: string; existingKeywords?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Perform keyword research for a YouTube creator. Find high-value, achievable keywords.
Niche: "${data.niche}"
Channel: ${data.channelName || "Creator"}
Existing Keywords: ${data.existingKeywords?.join(", ") || "None"}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "primaryKeywords": [{"keyword": "term", "searchVolume": "high|medium|low", "competition": "high|medium|low", "difficulty": 65, "opportunity": "why target this"}],
  "longTailKeywords": [{"keyword": "long phrase", "searchVolume": "low-medium", "competition": "low", "suggestedTitle": "video title using this keyword"}],
  "trendingKeywords": [{"keyword": "trending term", "trendDirection": "rising|stable|declining", "urgency": "act now|this week|this month"}],
  "contentGaps": [{"topic": "untapped topic", "reason": "why it's a gap", "estimatedViews": "potential views"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRepurposeContent(data: { videoTitle: string; videoDescription?: string; platform: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Repurpose this YouTube video content for ${data.platform}. Generate ready-to-post content.
Video Title: "${data.videoTitle}"
Description: ${data.videoDescription || "Not provided"}
Target Platform: ${data.platform}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "platform": "${data.platform}",
  "content": "full ready-to-post content text",
  "headline": "attention-grabbing headline",
  "hashtags": ["#tag1", "#tag2"],
  "mediaInstructions": "what images/clips to include",
  "bestPostTime": "optimal posting time",
  "engagementHooks": ["question or CTA to drive engagement"],
  "characterCount": 280,
  "format": "thread|carousel|article|pin|story|post"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorshipManager(data: { channelName: string; niche?: string; avgViews?: number; subscribers?: number; existingSponsors?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Act as a sponsorship strategist. Generate a complete sponsorship strategy and outreach plan.
Channel: "${data.channelName}"
Niche: ${data.niche || "General"}
Avg Views: ${data.avgViews || "Unknown"}
Subscribers: ${data.subscribers || "Unknown"}
Current Sponsors: ${data.existingSponsors?.join(", ") || "None"}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "rateCard": {"preRoll": "$X", "midRoll": "$X", "dedicated": "$X", "integration": "$X", "shortsMention": "$X"},
  "mediaKit": {"headline": "your value proposition", "keyStats": ["stat1", "stat2"], "audienceSummary": "who watches you", "uniqueSelling": "why brands should work with you"},
  "prospectBrands": [{"brand": "brand name", "fit": "high|medium", "estimatedBudget": "$range", "contactApproach": "how to reach out", "pitchAngle": "what to pitch"}],
  "outreachTemplate": "ready-to-send email template",
  "pricingStrategy": "how to negotiate and price",
  "redFlags": ["things to avoid in deals"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaKit(data: { channelName: string; subscribers?: number; avgViews?: number; niche?: string; totalVideos?: number }, userId?: string) {
  const p = `Generate a professional media kit for a content creator.
Channel: "${data.channelName}"
Subscribers: ${data.subscribers || "Growing"}
Avg Views: ${data.avgViews || "Growing"}
Niche: ${data.niche || "General"}
Total Videos: ${data.totalVideos || 0}
Respond as JSON:
{
  "headline": "creator tagline",
  "bio": "professional bio paragraph",
  "keyMetrics": [{"label": "metric name", "value": "metric value", "trend": "up|stable"}],
  "audienceDemo": {"ageRange": "18-34", "topCountries": ["US", "UK"], "gender": "split", "interests": ["interest1"]},
  "packages": [{"name": "package name", "description": "what's included", "price": "$X", "deliverables": ["item1"]}],
  "pastCollabs": "description of collaboration style",
  "testimonialPrompts": ["suggested testimonial angles"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamChatBot(data: { channelName: string; streamCategory?: string; customCommands?: string[] }, userId?: string) {
  const p = `Design a complete chatbot configuration for a live stream.
Channel: "${data.channelName}"
Stream Category: ${data.streamCategory || "Gaming"}
Existing Commands: ${data.customCommands?.join(", ") || "None"}
Respond as JSON:
{
  "commands": [{"trigger": "!command", "response": "bot response text", "cooldown": 30, "category": "info|fun|mod"}],
  "autoMessages": [{"message": "timed message text", "interval": 300, "enabled": true}],
  "moderationRules": [{"rule": "description", "action": "warn|timeout|ban", "severity": "low|medium|high"}],
  "loyaltySystem": {"pointName": "currency name", "earnRate": "points per minute", "rewards": [{"name": "reward", "cost": 100}]},
  "welcomeMessage": "greeting for new chatters",
  "raidMessage": "thank you message for raids"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamChecklist(data: { streamType?: string; platforms?: string[] }, userId?: string) {
  const p = `Generate a comprehensive pre-stream and post-stream checklist.
Stream Type: ${data.streamType || "Gaming"}
Platforms: ${data.platforms?.join(", ") || "YouTube, Twitch"}
Respond as JSON:
{
  "preStream": [{"item": "checklist item", "category": "technical|content|social", "priority": "critical|important|nice", "autoCheck": true}],
  "duringStream": [{"item": "reminder during stream", "timing": "every 30 min|start|end"}],
  "postStream": [{"item": "post-stream task", "category": "content|social|analytics", "automatable": true}],
  "emergencyPlan": [{"scenario": "what could go wrong", "solution": "how to handle it"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRaidStrategy(data: { channelName: string; category?: string; viewers?: number }, userId?: string) {
  const p = `Develop a raid/host strategy for a live streamer.
Channel: "${data.channelName}"
Category: ${data.category || "Gaming"}
Average Viewers: ${data.viewers || "Growing"}
Respond as JSON:
{
  "raidTargets": [{"channel": "suggested channel to raid", "reason": "why raid them", "bestTiming": "when to raid", "audienceOverlap": "high|medium|low"}],
  "raidEtiquette": ["best practice tips"],
  "networkingStrategy": "how to build raid partnerships",
  "incomingRaidPlan": "how to welcome incoming raids",
  "raidMessage": "customized raid message template"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1024 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPostStreamReport(data: { streamTitle: string; duration?: string; peakViewers?: number; avgViewers?: number; chatMessages?: number; newFollowers?: number }, userId?: string) {
  const p = `Generate a comprehensive post-stream performance report with actionable insights.
Stream: "${data.streamTitle}"
Duration: ${data.duration || "Unknown"}
Peak Viewers: ${data.peakViewers || 0}
Average Viewers: ${data.avgViewers || 0}
Chat Messages: ${data.chatMessages || 0}
New Followers: ${data.newFollowers || 0}
Respond as JSON:
{
  "grade": "A+|A|B|C|D",
  "summary": "overall performance summary",
  "highlights": ["what went well"],
  "improvements": ["what to improve next time"],
  "chatEngagement": "analysis of chat activity",
  "viewerRetention": "analysis of viewer retention patterns",
  "recommendations": [{"action": "specific recommendation", "impact": "high|medium|low", "timeframe": "next stream|this week|this month"}],
  "clipSuggestions": ["moments worth clipping"],
  "socialPosts": [{"platform": "Twitter/X", "content": "ready-to-post recap"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPLReport(data: { totalRevenue: number; totalExpenses: number; revenueBySource: Record<string, number>; expensesByCategory: Record<string, number>; period?: string }, userId?: string) {
  const p = `Generate a professional Profit & Loss analysis for a content creator business.
Period: ${data.period || "Current"}
Total Revenue: $${data.totalRevenue}
Total Expenses: $${data.totalExpenses}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Revenue Sources: ${JSON.stringify(data.revenueBySource)}
Expense Categories: ${JSON.stringify(data.expensesByCategory)}
Respond as JSON:
{
  "summary": "executive summary",
  "profitMargin": "${Math.round(((data.totalRevenue - data.totalExpenses) / Math.max(data.totalRevenue, 1)) * 100)}%",
  "healthGrade": "A|B|C|D|F",
  "insights": [{"area": "area name", "finding": "what the data shows", "recommendation": "what to do"}],
  "topRevenueStream": "highest earning source",
  "biggestExpense": "largest expense category",
  "costCuttingOpps": [{"expense": "what to cut", "savings": "estimated savings", "risk": "low|medium|high"}],
  "growthOpps": [{"opportunity": "revenue growth idea", "estimatedIncrease": "$X", "effort": "low|medium|high"}],
  "taxImplications": "tax-relevant observations",
  "quarterlyProjection": {"revenue": "$X", "expenses": "$X", "profit": "$X"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeamManager(data: { teamSize?: number; contentVolume?: string; currentRoles?: string[] }, userId?: string) {
  const p = `Design an optimal team structure and workflow for a content creator.
Current Team Size: ${data.teamSize || 1}
Content Volume: ${data.contentVolume || "2-3 videos per week"}
Current Roles: ${data.currentRoles?.join(", ") || "Creator only"}
Respond as JSON:
{
  "recommendedRoles": [{"role": "role title", "responsibilities": ["task1"], "priority": "hire now|next hire|future", "estimatedCost": "$X/month", "roi": "how this role pays for itself"}],
  "workflow": [{"step": "workflow step", "assignedTo": "role", "estimatedTime": "time", "automatable": true}],
  "approvalFlow": {"steps": ["step1: editor submits", "step2: creator reviews"], "turnaround": "24-48 hours"},
  "delegationPlan": [{"task": "task to delegate", "from": "creator", "to": "role", "timeSaved": "hours/week"}],
  "communicationPlan": "how team should communicate",
  "tools": [{"tool": "tool name", "purpose": "what it's for", "cost": "free|$X/month"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutomationBuilder(data: { currentWorkflow?: string; painPoints?: string[]; platforms?: string[] }, userId?: string) {
  const p = `Design a comprehensive automation system for a content creator's workflow.
Current Workflow: ${data.currentWorkflow || "Manual content creation and publishing"}
Pain Points: ${data.painPoints?.join(", ") || "Time-consuming manual tasks"}
Platforms: ${data.platforms?.join(", ") || "YouTube, Twitter, Instagram"}
Respond as JSON:
{
  "automations": [{"name": "automation name", "trigger": "what starts it", "actions": ["action1", "action2"], "timeSaved": "hours/week", "complexity": "simple|moderate|complex", "enabled": true}],
  "chains": [{"name": "chain name", "description": "multi-step automation", "steps": [{"step": "step description", "tool": "tool used", "delay": "wait time"}]}],
  "schedules": [{"name": "scheduled task", "frequency": "daily|weekly|monthly", "time": "best time to run", "description": "what it does"}],
  "integrations": [{"service": "external service", "purpose": "why integrate", "automations": ["what can be automated"]}],
  "estimatedTimeSaved": "total hours saved per week"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorAcademy(data: { skillLevel?: string; goals?: string[]; niche?: string }, userId?: string) {
  const p = `Generate a personalized learning curriculum for a content creator.
Skill Level: ${data.skillLevel || "intermediate"}
Goals: ${data.goals?.join(", ") || "Grow channel, increase revenue"}
Niche: ${data.niche || "General"}
Respond as JSON:
{
  "curriculum": [{"module": "module name", "lessons": [{"title": "lesson title", "description": "what you'll learn", "duration": "time", "type": "video|article|exercise"}], "skillLevel": "beginner|intermediate|advanced", "category": "growth|monetization|production|marketing"}],
  "skillTree": [{"skill": "skill name", "level": 1, "maxLevel": 5, "prerequisite": "required skill or null", "impact": "how this skill helps your channel"}],
  "weeklyPlan": [{"day": "Monday", "focus": "area of focus", "tasks": ["task1", "task2"], "duration": "1-2 hours"}],
  "milestones": [{"milestone": "achievement name", "criteria": "how to earn it", "reward": "what you unlock"}],
  "recommendedResources": [{"title": "resource name", "type": "course|book|tool", "url": "where to find it", "relevance": "why it matters"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsFeed(userId?: string) {
  const p = `Generate a creator-focused industry news briefing covering the latest platform updates, algorithm changes, creator economy trends, and opportunities.
Respond as JSON:
{
  "headlines": [{"title": "news headline", "summary": "brief summary", "impact": "how this affects creators", "platform": "YouTube|TikTok|General|All", "urgency": "act now|monitor|fyi", "category": "algorithm|monetization|feature|trend|legal"}],
  "algorithmUpdates": [{"platform": "platform name", "change": "what changed", "recommendation": "how to adapt"}],
  "opportunities": [{"title": "opportunity", "description": "details", "deadline": "time-sensitive or ongoing", "estimatedBenefit": "potential benefit"}],
  "creatorEconomyPulse": "overall state of the creator economy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMilestoneEngine(data: { subscribers?: number; totalViews?: number; totalVideos?: number; channelAge?: string; revenue?: number }, userId?: string) {
  const p = `Track and celebrate creator milestones. Identify recent achievements and upcoming goals.
Subscribers: ${data.subscribers || 0}
Total Views: ${data.totalViews || 0}
Total Videos: ${data.totalVideos || 0}
Channel Age: ${data.channelAge || "Unknown"}
Revenue: $${data.revenue || 0}
Respond as JSON:
{
  "recentMilestones": [{"title": "milestone name", "description": "what was achieved", "celebrationPost": "ready-to-post celebration message", "icon": "trophy|star|rocket|fire|crown"}],
  "upcomingMilestones": [{"title": "next milestone", "current": "current value", "target": "target value", "progress": 75, "estimatedDate": "when you'll hit it", "tips": "how to get there faster"}],
  "streaks": [{"name": "streak name", "current": 5, "best": 10, "description": "what the streak tracks"}],
  "yearInReview": {"topVideo": "best performing video concept", "growth": "growth summary", "totalEarnings": "earnings summary"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossplatformAnalytics(data: { platforms: string[]; videoCount?: number; totalRevenue?: number; channelName?: string }, userId?: string) {
  const p = `Analyze cross-platform performance and provide strategic recommendations for a multi-platform creator.
Platforms: ${data.platforms.join(", ")}
Videos: ${data.videoCount || 0}
Revenue: $${data.totalRevenue || 0}
Channel: ${data.channelName || "Creator"}
Respond as JSON:
{
  "platformScores": [{"platform": "name", "score": 85, "strengths": ["strength1"], "weaknesses": ["weakness1"], "growthPotential": "high|medium|low"}],
  "audienceOverlap": "analysis of audience overlap between platforms",
  "bestPerforming": "top performing platform and why",
  "underutilized": "platform with most untapped potential",
  "contentStrategy": [{"platform": "name", "recommendedContent": "what to post", "frequency": "how often", "bestTimes": "when to post"}],
  "revenueBreakdown": [{"platform": "name", "estimatedRevenue": "$X", "growthTip": "how to earn more here"}],
  "synergies": [{"from": "platform1", "to": "platform2", "strategy": "how to cross-promote"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommentManager(data: { comments: Array<{ text: string; author: string }>; channelName?: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Analyze these comments and draft personalized replies in the creator's voice. Also identify superfans and sentiment.
Channel: ${data.channelName || "Creator"}
Comments: ${JSON.stringify(data.comments.slice(0, 20))}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "replies": [{"originalComment": "the comment", "author": "commenter name", "suggestedReply": "personalized reply", "sentiment": "positive|neutral|negative", "priority": "high|medium|low"}],
  "superfans": [{"name": "fan name", "reason": "why they're a superfan"}],
  "sentimentOverview": {"positive": 70, "neutral": 20, "negative": 10},
  "commonQuestions": ["frequently asked question"],
  "contentIdeasFromComments": ["idea inspired by comments"],
  "toxicComments": [{"comment": "toxic text", "action": "hide|report|ignore"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1500 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabMatchmaker(data: { channelName: string; niche?: string; subscribers?: number; style?: string }, userId?: string) {
  const p = `Find ideal collaboration partners for this creator. Suggest specific creators and collab formats.
Channel: "${data.channelName}"
Niche: ${data.niche || "General"}
Subscribers: ${data.subscribers || "Growing"}
Style: ${data.style || "Not specified"}
Respond as JSON:
{
  "idealPartners": [{"type": "creator type to look for", "audienceSize": "similar|larger|smaller", "nicheOverlap": "high|medium|complementary", "collabFormat": "suggested collab format", "outreachTemplate": "ready-to-send message", "expectedBenefit": "what you'll gain"}],
  "collabFormats": [{"format": "collab type", "description": "how it works", "effort": "low|medium|high", "impact": "subscriber/view potential"}],
  "networkingTips": ["tip for building creator relationships"],
  "collabCalendar": "suggested frequency and timing for collabs"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWellnessAdvisor(data: { hoursWorked?: number; videosThisWeek?: number; streamsThisWeek?: number; lastBreak?: string; mood?: string }, userId?: string) {
  const p = `Assess this creator's wellness and provide burnout prevention advice.
Hours Worked This Week: ${data.hoursWorked || "Unknown"}
Videos Published: ${data.videosThisWeek || 0}
Streams This Week: ${data.streamsThisWeek || 0}
Last Break: ${data.lastBreak || "Unknown"}
Current Mood: ${data.mood || "Not specified"}
Respond as JSON:
{
  "burnoutRisk": "low|moderate|high|critical",
  "burnoutScore": 35,
  "assessment": "current wellness assessment",
  "recommendations": [{"action": "what to do", "priority": "now|today|this week", "category": "rest|exercise|social|creative|boundaries"}],
  "breakSuggestion": {"duration": "how long to take off", "activities": ["suggested activities"], "bestDay": "when to take the break"},
  "batchSchedule": {"recordingDays": ["Tuesday", "Wednesday"], "editingDays": ["Thursday"], "offDays": ["Saturday", "Sunday"], "reason": "why this schedule works"},
  "incomeStability": "assessment of income stability for taking breaks",
  "creativeBlock": {"hasBlock": false, "exercises": ["creative unblocking exercises"]}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSEOAudit(data: { videoTitle: string; description?: string; tags?: string[]; thumbnailDesc?: string }, userId?: string) {
  const p = `Perform a comprehensive SEO audit on this YouTube video. Score and provide specific improvements.
Title: "${data.videoTitle}"
Description: ${data.description || "Not provided"}
Tags: ${data.tags?.join(", ") || "None"}
Respond as JSON:
{
  "overallScore": 72,
  "titleScore": {"score": 80, "issues": ["issue1"], "suggestions": ["better title option"]},
  "descriptionScore": {"score": 65, "issues": ["issue1"], "optimizedDescription": "improved description text"},
  "tagScore": {"score": 70, "missingTags": ["tag1"], "irrelevantTags": ["tag2"], "optimizedTags": ["tag1", "tag2"]},
  "thumbnailScore": {"score": 75, "suggestions": ["improvement1"]},
  "competitorComparison": "how this compares to top-ranking videos",
  "quickWins": [{"fix": "easy improvement", "impact": "high|medium|low", "effort": "5 min|15 min|30 min"}],
  "optimizedTitle": "SEO-optimized title suggestion"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentCalendarPlanner(data: { channelName: string; niche?: string; frequency?: string; upcomingEvents?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Generate a complete 30-day content calendar with specific video ideas, publishing schedule, and platform distribution.
Channel: "${data.channelName}"
Niche: ${data.niche || "General"}
Publishing Frequency: ${data.frequency || "3x per week"}
Upcoming Events: ${data.upcomingEvents?.join(", ") || "None specified"}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "monthPlan": [{"week": 1, "theme": "weekly theme", "videos": [{"day": "Monday", "title": "video title", "type": "long-form|short|live", "platform": "YouTube", "description": "brief concept", "priority": "hero|hub|help"}]}],
  "contentMix": {"longForm": 60, "shorts": 30, "live": 10},
  "themes": ["weekly theme ideas"],
  "seasonalOpportunities": [{"event": "holiday/event", "date": "when", "contentIdea": "what to create"}],
  "batchRecordingPlan": {"day": "best day to batch record", "videosPerSession": 3, "prepTime": "30 min per video"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 2000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStoryboardGenerator(data: { scriptText?: string; videoTitle?: string; scenes?: number }, userId?: string) {
  const p = `Generate a scene-by-scene storyboard with visual descriptions, camera angles, and transitions.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.scriptText ? `Script: ${data.scriptText}` : ""}
${data.scenes ? `Number of Scenes: ${data.scenes}` : ""}
Respond as JSON:
{
  "scenes": [{"sceneNumber": 1, "visualDescription": "description", "cameraAngle": "angle", "transition": "cut type", "duration": "seconds", "notes": "additional notes"}],
  "totalDuration": "estimated total duration",
  "mood": "overall mood"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiColorGradingAdvisor(data: { genre?: string; mood?: string; platform?: string }, userId?: string) {
  const p = `Recommend color palettes and grading styles for video content.
${data.genre ? `Genre: ${data.genre}` : ""}
${data.mood ? `Mood: ${data.mood}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "recommendedPalette": {"primary": "#hex", "secondary": "#hex", "accent": "#hex"},
  "gradingStyle": "style name",
  "lut": "recommended LUT",
  "warmth": "warm/cool/neutral",
  "contrast": "high/medium/low",
  "examples": [{"style": "style name", "description": "description"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIntroOutroCreator(data: { channelName?: string; niche?: string; style?: string }, userId?: string) {
  const p = `Generate branded intro and outro concepts for a video channel.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "intro": {"duration": "seconds", "concept": "description", "music": "music style", "textOverlay": "text content", "animation": "animation type"},
  "outro": {"duration": "seconds", "concept": "description", "elements": ["element1"], "cta": "call to action"},
  "brandConsistency": "tips for brand consistency"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSoundEffectsRecommender(data: { videoType?: string; scenes?: string[]; mood?: string }, userId?: string) {
  const p = `Suggest sound effects timing and placement for video content.
${data.videoType ? `Video Type: ${data.videoType}` : ""}
${data.scenes ? `Scenes: ${data.scenes.join(", ")}` : ""}
${data.mood ? `Mood: ${data.mood}` : ""}
Respond as JSON:
{
  "effects": [{"timestamp": "time", "effect": "effect name", "category": "category", "source": "source suggestion", "purpose": "why this effect"}],
  "ambientSounds": "ambient sound recommendations",
  "musicTransitions": "music transition suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPacingAnalyzer(data: { videoDuration?: string; genre?: string; avgRetention?: number }, userId?: string) {
  const p = `Analyze video pacing and suggest improvements for better audience retention.
${data.videoDuration ? `Video Duration: ${data.videoDuration}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
${data.avgRetention ? `Average Retention: ${data.avgRetention}%` : ""}
Respond as JSON:
{
  "currentPacing": "assessment of current pacing",
  "idealPacing": "recommended pacing strategy",
  "speedUpSections": [{"from": "timestamp", "to": "timestamp", "reason": "why speed up"}],
  "slowDownSections": "sections to slow down",
  "hookTiming": "ideal hook timing",
  "payoffTiming": "ideal payoff timing",
  "overallScore": 75
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTalkingPointsGenerator(data: { topic?: string; duration?: string; style?: string }, userId?: string) {
  const p = `Generate bullet-point talking guides for unscripted video content.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.duration ? `Target Duration: ${data.duration}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "talkingPoints": [{"point": "main point", "subPoints": ["sub point 1"], "timing": "suggested timing", "transition": "transition to next point"}],
  "openingHook": "hook to start with",
  "closingCta": "closing call to action",
  "segueIdeas": "ideas for natural segues"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoLengthOptimizer(data: { topic?: string; niche?: string; platform?: string; avgRetention?: number }, userId?: string) {
  const p = `Recommend the ideal video length based on topic, niche, and platform data.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
${data.avgRetention ? `Average Retention: ${data.avgRetention}%` : ""}
Respond as JSON:
{
  "idealLength": "recommended length",
  "reasoning": "why this length",
  "retentionPrediction": "predicted retention",
  "platformOptimal": {"youtube": "optimal for youtube", "tiktok": "optimal for tiktok", "instagram": "optimal for instagram"},
  "segmentBreakdown": "how to structure segments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiFormatExporter(data: { videoTitle?: string; originalFormat?: string; targetPlatforms?: string[] }, userId?: string) {
  const p = `Provide auto-resize specifications for exporting video to multiple platforms.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.originalFormat ? `Original Format: ${data.originalFormat}` : ""}
${data.targetPlatforms ? `Target Platforms: ${data.targetPlatforms.join(", ")}` : ""}
Respond as JSON:
{
  "formats": [{"platform": "platform name", "aspectRatio": "ratio", "resolution": "resolution", "maxDuration": "max duration", "fileSize": "max file size", "captionStyle": "caption style"}],
  "exportOrder": "recommended export order",
  "priorities": "prioritization strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatermarkManager(data: { channelName?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a watermark strategy for video distribution across platforms.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "watermarkDesign": "design description",
  "placement": "recommended placement",
  "opacity": "recommended opacity",
  "platforms": [{"name": "platform", "required": true, "position": "position"}],
  "removalStrategy": "when and how to handle removal"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGreenScreenAdvisor(data: { contentType?: string; mood?: string; genre?: string }, userId?: string) {
  const p = `Recommend virtual backgrounds and green screen setups for video content.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.mood ? `Mood: ${data.mood}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON:
{
  "backgrounds": [{"name": "background name", "style": "style", "mood": "mood", "colorScheme": "colors", "useCases": "when to use"}],
  "lightingTips": "lighting recommendations",
  "keyingAdvice": "chroma key best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeleprompterFormatter(data: { script?: string; speakingSpeed?: string }, userId?: string) {
  const p = `Format a script for teleprompter use with timing and emphasis marks.
${data.script ? `Script: ${data.script}` : ""}
${data.speakingSpeed ? `Speaking Speed: ${data.speakingSpeed}` : ""}
Respond as JSON:
{
  "formattedScript": "formatted script text",
  "wordsPerMinute": 150,
  "estimatedDuration": "estimated duration",
  "breathMarks": "where to breathe",
  "emphasisMarks": "words to emphasize",
  "pausePoints": "where to pause"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSceneTransitionRecommender(data: { videoType?: string; pacing?: string; scenes?: number }, userId?: string) {
  const p = `Recommend transitions between video scenes based on content type and pacing.
${data.videoType ? `Video Type: ${data.videoType}` : ""}
${data.pacing ? `Pacing: ${data.pacing}` : ""}
${data.scenes ? `Number of Scenes: ${data.scenes}` : ""}
Respond as JSON:
{
  "transitions": [{"fromScene": 1, "toScene": 2, "type": "transition type", "duration": "duration", "reasoning": "why this transition"}],
  "avoidList": "transitions to avoid",
  "styleTips": "general style tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoQualityEnhancer(data: { currentResolution?: string; fps?: number; bitrate?: string }, userId?: string) {
  const p = `Suggest video quality improvements based on current settings.
${data.currentResolution ? `Current Resolution: ${data.currentResolution}` : ""}
${data.fps ? `FPS: ${data.fps}` : ""}
${data.bitrate ? `Bitrate: ${data.bitrate}` : ""}
Respond as JSON:
{
  "recommendations": [{"setting": "setting name", "current": "current value", "recommended": "recommended value", "impact": "expected impact"}],
  "exportSettings": "optimal export settings",
  "platformOptimal": "platform-specific quality tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAspectRatioOptimizer(data: { videoTitle?: string; targetPlatforms?: string[] }, userId?: string) {
  const p = `Recommend platform-specific aspect ratios and cropping strategies.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.targetPlatforms ? `Target Platforms: ${data.targetPlatforms.join(", ")}` : ""}
Respond as JSON:
{
  "ratios": [{"platform": "platform", "ratio": "aspect ratio", "resolution": "resolution", "cropStrategy": "how to crop"}],
  "masterFormat": "recommended master format",
  "reframeNotes": "reframing recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLowerThirdGenerator(data: { channelName?: string; style?: string; colors?: string[] }, userId?: string) {
  const p = `Generate lower third text overlay designs for video content.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.style ? `Style: ${data.style}` : ""}
${data.colors ? `Colors: ${data.colors.join(", ")}` : ""}
Respond as JSON:
{
  "designs": [{"name": "design name", "font": "font family", "animation": "animation type", "position": "screen position", "colors": "color scheme", "useCase": "when to use"}],
  "brandAlignment": "brand alignment tips",
  "accessibilityScore": 85
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCtaOverlayDesigner(data: { ctaType?: string; placement?: string; videoType?: string }, userId?: string) {
  const p = `Design call-to-action overlays for video content.
${data.ctaType ? `CTA Type: ${data.ctaType}` : ""}
${data.placement ? `Placement: ${data.placement}` : ""}
${data.videoType ? `Video Type: ${data.videoType}` : ""}
Respond as JSON:
{
  "overlays": [{"type": "overlay type", "text": "CTA text", "position": "position", "timing": "when to show", "animation": "animation style", "design": "design description"}],
  "bestPractices": "CTA best practices",
  "abTestIdeas": "A/B testing suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSplitScreenBuilder(data: { contentType?: string; participants?: number }, userId?: string) {
  const p = `Recommend split screen layouts for multi-participant or multi-angle video content.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.participants ? `Number of Participants: ${data.participants}` : ""}
Respond as JSON:
{
  "layouts": [{"name": "layout name", "grid": "grid description", "sizing": "sizing details", "bestFor": "best use case"}],
  "audioMixing": "audio mixing recommendations",
  "transitionTips": "transition tips between layouts"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeLapseAdvisor(data: { subject?: string; duration?: string }, userId?: string) {
  const p = `Provide time-lapse and slow-motion guidance for video production.
${data.subject ? `Subject: ${data.subject}` : ""}
${data.duration ? `Duration: ${data.duration}` : ""}
Respond as JSON:
{
  "timeLapse": {"intervalSeconds": 5, "totalDuration": "total duration", "bestSubjects": "best subjects for time-lapse", "tips": "time-lapse tips"},
  "slowMo": {"fps": 240, "bestMoments": "best moments for slow-mo", "editingTips": "editing tips for slow-mo"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFootageOrganizer(data: { clipCount?: number; projectType?: string }, userId?: string) {
  const p = `Create a strategy for tagging and sorting raw video clips.
${data.clipCount ? `Number of Clips: ${data.clipCount}` : ""}
${data.projectType ? `Project Type: ${data.projectType}` : ""}
Respond as JSON:
{
  "folderStructure": "recommended folder structure",
  "namingConvention": "file naming convention",
  "tags": [{"category": "tag category", "examples": "example tags"}],
  "workflow": "organizing workflow",
  "backupStrategy": "backup recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioLevelingAdvisor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Provide audio leveling guidance for video content.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "targetLUFS": -14,
  "voiceLevel": "voice level recommendation",
  "musicLevel": "music level recommendation",
  "sfxLevel": "SFX level recommendation",
  "compressionSettings": "compression settings",
  "normalization": "normalization advice",
  "platformStandards": "platform-specific audio standards"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackgroundNoiseDetector(data: { environment?: string; micType?: string }, userId?: string) {
  const p = `Detect common background noise issues and provide fixes for video audio.
${data.environment ? `Recording Environment: ${data.environment}` : ""}
${data.micType ? `Microphone Type: ${data.micType}` : ""}
Respond as JSON:
{
  "commonNoises": [{"type": "noise type", "fix": "how to fix", "prevention": "how to prevent"}],
  "softwareRecommendations": "software tools to remove noise",
  "hardwareTips": "hardware recommendations",
  "idealEnvironment": "ideal recording environment setup"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiJumpCutDetector(data: { editingStyle?: string; genre?: string }, userId?: string) {
  const p = `Provide jump cut best practices and alternatives for video editing.
${data.editingStyle ? `Editing Style: ${data.editingStyle}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON:
{
  "idealFrequency": "ideal jump cut frequency",
  "alternatives": "alternatives to jump cuts",
  "whenToUse": "when jump cuts work best",
  "whenToAvoid": "when to avoid jump cuts",
  "smoothTransitions": "smooth transition techniques",
  "bRollSuggestions": "B-roll suggestions to cover cuts"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCinematicShotPlanner(data: { genre?: string; equipment?: string; location?: string }, userId?: string) {
  const p = `Plan cinematic shots for professional video production.
${data.genre ? `Genre: ${data.genre}` : ""}
${data.equipment ? `Equipment: ${data.equipment}` : ""}
${data.location ? `Location: ${data.location}` : ""}
Respond as JSON:
{
  "shots": [{"name": "shot name", "description": "shot description", "equipment": "equipment needed", "movement": "camera movement", "framing": "framing details", "lighting": "lighting setup"}],
  "shotList": "complete shot list",
  "lightingSetup": "overall lighting setup"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoCompressionOptimizer(data: { platform?: string; resolution?: string; fileSize?: string }, userId?: string) {
  const p = `Optimize video compression settings for the best quality-to-size ratio.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.resolution ? `Resolution: ${data.resolution}` : ""}
${data.fileSize ? `Current File Size: ${data.fileSize}` : ""}
Respond as JSON:
{
  "codec": "recommended codec",
  "bitrate": "recommended bitrate",
  "preset": "encoding preset",
  "quality": "quality setting",
  "estimatedSize": "estimated output size",
  "platformLimits": "platform upload limits",
  "exportSettings": "complete export settings"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailABTester(data: { videoTitle?: string; currentCTR?: number }, userId?: string) {
  const p = `Create an A/B test strategy for video thumbnails to improve click-through rate.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.currentCTR ? `Current CTR: ${data.currentCTR}%` : ""}
Respond as JSON:
{
  "variants": [{"concept": "thumbnail concept", "colorScheme": "colors", "textOverlay": "text on thumbnail", "emotionTarget": "target emotion", "predictedCTR": 5.5}],
  "testDuration": "recommended test duration",
  "sampleSize": "minimum sample size",
  "metrics": "metrics to track"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailCTRPredictor(data: { thumbnailDescription?: string; title?: string; niche?: string }, userId?: string) {
  const p = `Predict thumbnail click-through rate and provide improvement suggestions.
${data.thumbnailDescription ? `Thumbnail Description: ${data.thumbnailDescription}` : ""}
${data.title ? `Video Title: ${data.title}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "predictedCTR": 4.5,
  "score": 72,
  "strengths": "thumbnail strengths",
  "weaknesses": "thumbnail weaknesses",
  "improvements": [{"change": "suggested change", "expectedLift": "expected CTR improvement"}],
  "competitorBenchmark": "how it compares to competitors"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailStyleLibrary(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Curate thumbnail style templates for a content channel.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "description": "style description", "colorPalette": "color palette", "fontStyle": "font style", "layout": "layout description", "bestFor": "best use case"}],
  "trendingStyles": "currently trending thumbnail styles",
  "nicheTop": "top performing styles in this niche"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFaceExpressionAnalyzer(data: { emotionTarget?: string; thumbnailType?: string }, userId?: string) {
  const p = `Analyze facial expressions for thumbnail effectiveness.
${data.emotionTarget ? `Target Emotion: ${data.emotionTarget}` : ""}
${data.thumbnailType ? `Thumbnail Type: ${data.thumbnailType}` : ""}
Respond as JSON:
{
  "bestExpressions": [{"emotion": "emotion name", "description": "expression description", "effectiveness": "effectiveness rating"}],
  "composition": "face composition tips",
  "eyeDirection": "where eyes should look",
  "facePlacement": "where to place face in thumbnail"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailTextOptimizer(data: { title?: string; thumbnailText?: string }, userId?: string) {
  const p = `Optimize text placement and styling on video thumbnails.
${data.title ? `Video Title: ${data.title}` : ""}
${data.thumbnailText ? `Current Thumbnail Text: ${data.thumbnailText}` : ""}
Respond as JSON:
{
  "optimizedText": "optimized thumbnail text",
  "fontSize": "recommended font size",
  "fontStyle": "recommended font style",
  "placement": "text placement",
  "maxWords": 4,
  "readabilityScore": 85,
  "contrastAdvice": "contrast and readability tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailColorPsychology(data: { niche?: string; targetEmotion?: string }, userId?: string) {
  const p = `Apply color psychology principles to thumbnail design.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.targetEmotion ? `Target Emotion: ${data.targetEmotion}` : ""}
Respond as JSON:
{
  "colors": [{"color": "color name", "emotion": "associated emotion", "bestUse": "when to use", "avoidWith": "colors to avoid pairing with"}],
  "combinations": "recommended color combinations",
  "nicheBest": "best colors for this niche",
  "contrastRules": "contrast rules for thumbnails"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBannerGenerator(data: { channelName?: string; tagline?: string; niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Generate channel art and banner concepts for multiple platforms.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.tagline ? `Tagline: ${data.tagline}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "banners": [{"platform": "platform name", "dimensions": "dimensions", "layout": "layout description", "elements": "design elements", "colorScheme": "color scheme"}],
  "brandConsistency": "brand consistency tips",
  "updateFrequency": "how often to update banners"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialCoverCreator(data: { platform?: string; channelName?: string; style?: string }, userId?: string) {
  const p = `Design social media cover image concepts.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "covers": [{"platform": "platform name", "dimensions": "dimensions", "designConcept": "design concept", "elements": "design elements", "cta": "call to action"}],
  "consistency": "cross-platform consistency tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnimatedThumbnailCreator(data: { videoTitle?: string; style?: string }, userId?: string) {
  const p = `Create animated thumbnail concepts for video content.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "animations": [{"concept": "animation concept", "frames": "number of frames", "duration": "loop duration", "movement": "movement description", "loop": true}],
  "platformSupport": "which platforms support animated thumbnails",
  "bestPractices": "animated thumbnail best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailCompetitorComparison(data: { niche?: string; topCompetitors?: string[] }, userId?: string) {
  const p = `Compare thumbnail strategies against competitors in the same niche.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.topCompetitors ? `Top Competitors: ${data.topCompetitors.join(", ")}` : ""}
Respond as JSON:
{
  "analysis": [{"competitor": "competitor name", "style": "their thumbnail style", "strengths": "their strengths", "weaknesses": "their weaknesses"}],
  "gaps": "gaps in competitor thumbnails",
  "opportunities": "opportunities to stand out",
  "standoutStrategy": "strategy to differentiate"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandWatermarkDesigner(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Design brand watermark concepts for video content protection.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "designs": [{"type": "watermark type", "opacity": "recommended opacity", "position": "position on screen", "size": "size recommendation", "style": "visual style"}],
  "doNots": "watermark mistakes to avoid",
  "platformRules": "platform-specific watermark rules"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmojiStickerCreator(data: { channelName?: string; brandColors?: string[]; emotes?: string[] }, userId?: string) {
  const p = `Create emoji and sticker pack concepts for a content brand.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.brandColors ? `Brand Colors: ${data.brandColors.join(", ")}` : ""}
${data.emotes ? `Desired Emotes: ${data.emotes.join(", ")}` : ""}
Respond as JSON:
{
  "stickers": [{"name": "sticker name", "description": "visual description", "emotion": "emotion conveyed", "style": "art style"}],
  "packTheme": "overall pack theme",
  "platformUsage": "where to use stickers",
  "monetization": "monetization opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfographicGenerator(data: { topic?: string; dataPoints?: string[] }, userId?: string) {
  const p = `Create an infographic layout for presenting data visually.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.dataPoints ? `Data Points: ${data.dataPoints.join(", ")}` : ""}
Respond as JSON:
{
  "layout": "overall layout description",
  "sections": [{"title": "section title", "data": "data to display", "visualType": "chart/icon/text type"}],
  "colorScheme": "recommended color scheme",
  "dimensions": "recommended dimensions",
  "shareability": "tips for making it shareable"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMemeTemplateCreator(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Create meme templates for brand-safe content marketing.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "templates": [{"name": "meme name", "format": "meme format", "textPlacement": "where text goes", "useCase": "when to use", "viralPotential": "viral potential rating"}],
  "trendingFormats": "currently trending meme formats",
  "brandSafe": "brand safety guidelines"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVisualConsistencyScorer(data: { channelName?: string; recentThumbnails?: string[] }, userId?: string) {
  const p = `Score the visual consistency of a channel's thumbnails and branding.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.recentThumbnails ? `Recent Thumbnails: ${data.recentThumbnails.join(", ")}` : ""}
Respond as JSON:
{
  "overallScore": 75,
  "colorConsistency": "color consistency assessment",
  "fontConsistency": "font consistency assessment",
  "layoutConsistency": "layout consistency assessment",
  "improvements": [{"area": "improvement area", "suggestion": "specific suggestion"}],
  "brandRecognition": "brand recognition score and tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceCloneAdvisor(data: { useCase?: string; contentType?: string }, userId?: string) {
  const p = `Provide voice cloning guidance including tools, best practices, and legal considerations.
${data.useCase ? `Use Case: ${data.useCase}` : ""}
${data.contentType ? `Content Type: ${data.contentType}` : ""}
Respond as JSON:
{
  "tools": [{"name": "tool name", "quality": "quality rating", "price": "pricing info", "ethicalNotes": "ethical considerations"}],
  "bestPractices": "voice cloning best practices",
  "legalConsiderations": "legal requirements and considerations",
  "useCases": "recommended use cases",
  "disclosureRequirements": "disclosure and transparency requirements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHookGenerator(data: { topic?: string; style?: string; platform?: string }, userId?: string) {
  const p = `Generate viral first-30-second hooks for video content.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.style ? `Style: ${data.style}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "hooks": [{"text": "hook text", "style": "hook style", "emotionTrigger": "emotion triggered", "openLoopQuestion": "open loop question"}],
  "bestHook": "the best hook from the list",
  "reasoning": "why this hook works best"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTitleSplitTester(data: { title?: string; niche?: string }, userId?: string) {
  const p = `Generate title variants for A/B testing to maximize click-through rate.
${data.title ? `Original Title: ${data.title}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "variants": [{"title": "title variant", "emotionalScore": 85, "seoScore": 90, "clickPrediction": "high"}],
  "winner": "predicted winning title",
  "testingTips": "tips for running the A/B test"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTitleEmotionalScore(data: { title?: string }, userId?: string) {
  const p = `Score the emotional impact of a video title and suggest improvements.
${data.title ? `Title: ${data.title}` : ""}
Respond as JSON:
{
  "score": 75,
  "emotions": [{"emotion": "emotion name", "intensity": 80}],
  "powerWords": "power words found or suggested",
  "improvements": "specific improvement suggestions",
  "curiosityGap": "curiosity gap analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiClickbaitDetector(data: { title?: string; description?: string }, userId?: string) {
  const p = `Detect misleading clickbait in video titles and descriptions.
${data.title ? `Title: ${data.title}` : ""}
${data.description ? `Description: ${data.description}` : ""}
Respond as JSON:
{
  "isClickbait": false,
  "severity": "low",
  "flags": [{"issue": "issue description", "location": "where it was found"}],
  "alternatives": "non-clickbait alternative suggestions",
  "trustScore": 85
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDescriptionTemplateBuilder(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Generate SEO-optimized video description templates.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "templates": [{"name": "template name", "template": "full template text", "sections": "key sections included"}],
  "seoTips": "SEO tips for descriptions",
  "linkPlacement": "optimal link placement strategy",
  "hashtagStrategy": "hashtag usage strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndScreenCTAWriter(data: { videoTopic?: string; nextVideo?: string }, userId?: string) {
  const p = `Write compelling end screen calls-to-action for videos.
${data.videoTopic ? `Video Topic: ${data.videoTopic}` : ""}
${data.nextVideo ? `Next Video: ${data.nextVideo}` : ""}
Respond as JSON:
{
  "ctas": [{"text": "CTA text", "timing": "when to show", "style": "delivery style"}],
  "verbalCTA": "verbal call-to-action script",
  "visualCTA": "visual CTA design suggestions",
  "cardTiming": "optimal card timing strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPinnedCommentGenerator(data: { videoTitle?: string; videoTopic?: string }, userId?: string) {
  const p = `Generate engaging pinned comments for videos to boost engagement.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.videoTopic ? `Video Topic: ${data.videoTopic}` : ""}
Respond as JSON:
{
  "comments": [{"text": "comment text", "purpose": "comment purpose", "engagementTrigger": "what triggers engagement"}],
  "bestChoice": "the best comment option",
  "questionToAsk": "question to drive replies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityPostWriter(data: { channelName?: string; recentVideos?: string[]; goal?: string }, userId?: string) {
  const p = `Write engaging community posts for a YouTube channel.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.recentVideos ? `Recent Videos: ${data.recentVideos.join(", ")}` : ""}
${data.goal ? `Goal: ${data.goal}` : ""}
Respond as JSON:
{
  "posts": [{"text": "post text", "type": "post type", "timing": "best time to post", "mediaType": "suggested media type"}],
  "schedule": "posting schedule recommendation",
  "engagementTips": "tips to boost engagement"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailSubjectOptimizer(data: { subject?: string; audience?: string }, userId?: string) {
  const p = `Optimize email subject lines for maximum open rates.
${data.subject ? `Subject: ${data.subject}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON:
{
  "variants": [{"subject": "subject line variant", "openRatePrediction": "predicted open rate", "emotionalTrigger": "emotional trigger used"}],
  "winner": "predicted best subject line",
  "abTestPlan": "A/B testing plan for subjects"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBioWriter(data: { channelName?: string; niche?: string; personality?: string }, userId?: string) {
  const p = `Write optimized channel bios for multiple platforms.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.personality ? `Personality: ${data.personality}` : ""}
Respond as JSON:
{
  "bios": [{"platform": "platform name", "text": "bio text", "characterCount": 150}],
  "keywords": "key SEO keywords used",
  "brandVoice": "brand voice description"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoTagsOptimizer(data: { title?: string; description?: string; currentTags?: string[] }, userId?: string) {
  const p = `Optimize video tags for maximum discoverability and search ranking.
${data.title ? `Title: ${data.title}` : ""}
${data.description ? `Description: ${data.description}` : ""}
${data.currentTags ? `Current Tags: ${data.currentTags.join(", ")}` : ""}
Respond as JSON:
{
  "optimizedTags": "list of optimized tags",
  "removedTags": "tags that should be removed",
  "addedTags": "new tags to add",
  "searchVolume": "estimated search volume analysis",
  "competitorTags": "competitor tag analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHashtagOptimizer2(data: { content?: string; platform?: string; niche?: string }, userId?: string) {
  const p = `Generate platform-specific optimized hashtags for content.
${data.content ? `Content: ${data.content}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "hashtags": [{"tag": "hashtag", "reach": "estimated reach", "competition": "competition level", "relevance": "relevance score"}],
  "platformSpecific": "platform-specific hashtag tips",
  "trending": "currently trending relevant hashtags",
  "evergreen": "evergreen hashtags to always use"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaylistWriter(data: { theme?: string; videos?: string[] }, userId?: string) {
  const p = `Write optimized playlist titles and descriptions for YouTube.
${data.theme ? `Theme: ${data.theme}` : ""}
${data.videos ? `Videos: ${data.videos.join(", ")}` : ""}
Respond as JSON:
{
  "title": "optimized playlist title",
  "description": "SEO-optimized playlist description",
  "seoKeywords": "target SEO keywords",
  "orderStrategy": "video ordering strategy",
  "thumbnailTips": "playlist thumbnail tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPressReleaseWriter(data: { announcement?: string; channelName?: string }, userId?: string) {
  const p = `Write a professional press release for a content creator announcement.
${data.announcement ? `Announcement: ${data.announcement}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "headline": "press release headline",
  "body": "full press release body",
  "quotes": "suggested quotes to include",
  "contactInfo": "contact information template",
  "distribution": "distribution strategy",
  "mediaKit": "media kit recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTestimonialDrafter(data: { brandName?: string; product?: string }, userId?: string) {
  const p = `Draft testimonial request emails and templates for brand collaborations.
${data.brandName ? `Brand Name: ${data.brandName}` : ""}
${data.product ? `Product: ${data.product}` : ""}
Respond as JSON:
{
  "requestEmail": "testimonial request email template",
  "followUp": "follow-up email template",
  "template": "testimonial template for respondents",
  "incentiveIdeas": "incentive ideas for testimonials",
  "displayFormat": "best format to display testimonials"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTagCloudGenerator(data: { videos?: string[]; niche?: string }, userId?: string) {
  const p = `Generate a visual tag analysis showing tag performance and gaps.
${data.videos ? `Videos: ${data.videos.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "tagCloud": [{"tag": "tag name", "frequency": 10, "performance": "performance rating"}],
  "overlaps": "overlapping tags analysis",
  "gaps": "tag gaps to fill",
  "topPerformers": "top performing tags"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSearchIntentMapper(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Map viewer search intent to content opportunities.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.keywords ? `Keywords: ${data.keywords.join(", ")}` : ""}
Respond as JSON:
{
  "intents": [{"keyword": "keyword", "intent": "search intent type", "contentGap": "content gap identified", "opportunity": "opportunity description"}],
  "priorityList": "prioritized list of content to create",
  "contentIdeas": "content ideas based on search intent"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmDecoder(data: { platform?: string }, userId?: string) {
  const p = `Provide platform algorithm tips and optimization strategies.
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "signals": [{"signal": "algorithm signal", "weight": "signal weight", "optimization": "how to optimize for this signal"}],
  "recentChanges": "recent algorithm changes",
  "myths": "common algorithm myths debunked",
  "bestPractices": "algorithm best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFeaturedSnippetOptimizer(data: { topic?: string; currentRanking?: string }, userId?: string) {
  const p = `Optimize content for featured snippets in search results.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.currentRanking ? `Current Ranking: ${data.currentRanking}` : ""}
Respond as JSON:
{
  "strategy": "featured snippet strategy",
  "structuredData": "structured data recommendations",
  "answerFormat": "optimal answer format",
  "targetQueries": "target queries for snippets",
  "implementation": "implementation steps"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPlatformSEO(data: { platforms?: string[]; niche?: string }, userId?: string) {
  const p = `Create a unified SEO strategy across multiple platforms.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "strategy": [{"platform": "platform name", "keywords": "target keywords", "approach": "SEO approach"}],
  "synergies": "cross-platform synergies",
  "conflicts": "potential conflicts between platforms",
  "universalKeywords": "keywords that work across all platforms"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBacklinkTracker(data: { channelUrl?: string; videoUrls?: string[] }, userId?: string) {
  const p = `Monitor and analyze backlinks for content creator channels and videos.
${data.channelUrl ? `Channel URL: ${data.channelUrl}` : ""}
${data.videoUrls ? `Video URLs: ${data.videoUrls.join(", ")}` : ""}
Respond as JSON:
{
  "backlinks": [{"source": "backlink source", "authority": "domain authority", "type": "link type"}],
  "opportunities": "new backlink opportunities",
  "outreachTargets": "outreach targets for link building",
  "linkBuildingTips": "link building tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentFreshnessScorer(data: { videos?: Array<{title: string; publishDate?: string}> }, userId?: string) {
  const p = `Flag stale content that needs updating and score content freshness.
${data.videos ? `Videos: ${JSON.stringify(data.videos)}` : ""}
Respond as JSON:
{
  "videos": [{"title": "video title", "freshnessScore": 75, "updateNeeded": true, "suggestions": "update suggestions"}],
  "priorityUpdates": "priority list of videos to update first"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeywordCannibalization(data: { videos?: Array<{title: string; tags?: string[]}> }, userId?: string) {
  const p = `Find competing videos that cannibalize each other's keywords and rankings.
${data.videos ? `Videos: ${JSON.stringify(data.videos)}` : ""}
Respond as JSON:
{
  "conflicts": [{"keyword": "conflicting keyword", "videos": "competing videos", "resolution": "resolution strategy"}],
  "consolidationPlan": "content consolidation plan",
  "redirects": "redirect recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLongTailKeywordMiner(data: { niche?: string; seedKeywords?: string[] }, userId?: string) {
  const p = `Mine long-tail keywords with low competition and high opportunity.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.seedKeywords ? `Seed Keywords: ${data.seedKeywords.join(", ")}` : ""}
Respond as JSON:
{
  "keywords": [{"keyword": "long-tail keyword", "volume": "search volume", "difficulty": "ranking difficulty", "opportunity": "opportunity score"}],
  "clusters": "keyword clusters",
  "contentIdeas": "content ideas from keywords"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoSitemapGenerator(data: { channelName?: string; videoCount?: number }, userId?: string) {
  const p = `Create a video sitemap strategy for better search engine indexing.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.videoCount ? `Video Count: ${data.videoCount}` : ""}
Respond as JSON:
{
  "structure": "sitemap structure recommendations",
  "schema": "schema markup recommendations",
  "implementation": "implementation steps",
  "submission": "search engine submission strategy",
  "monitoring": "monitoring and maintenance plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRichSnippetOptimizer(data: { videoTitle?: string; description?: string }, userId?: string) {
  const p = `Optimize video content for rich snippets in search results.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.description ? `Description: ${data.description}` : ""}
Respond as JSON:
{
  "schema": "recommended schema markup",
  "keyMoments": "key moments markup strategy",
  "faqSchema": "FAQ schema recommendations",
  "howToSchema": "how-to schema recommendations",
  "implementation": "implementation guide"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceSearchOptimizer(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Optimize content for voice search queries and featured snippets.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.keywords ? `Keywords: ${data.keywords.join(", ")}` : ""}
Respond as JSON:
{
  "queries": [{"question": "voice search question", "answer": "optimized answer", "optimization": "optimization tips"}],
  "conversationalKeywords": "conversational keyword suggestions",
  "featuredSnippetTargets": "featured snippet target queries"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutocompleteTracker(data: { seedTerms?: string[] }, userId?: string) {
  const p = `Track and analyze YouTube autocomplete suggestions for content opportunities.
${data.seedTerms ? `Seed Terms: ${data.seedTerms.join(", ")}` : ""}
Respond as JSON:
{
  "suggestions": [{"term": "seed term", "completions": "autocomplete suggestions", "trending": "trending status", "volume": "estimated volume"}],
  "opportunities": "content opportunities from autocomplete",
  "contentGaps": "content gaps identified"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleTrendsIntegrator(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Analyze Google Trends data for content planning and keyword strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.keywords ? `Keywords: ${data.keywords.join(", ")}` : ""}
Respond as JSON:
{
  "trends": [{"keyword": "keyword", "trendDirection": "trending direction", "seasonality": "seasonal pattern", "relatedTopics": "related trending topics"}],
  "risingQueries": "rising search queries",
  "breakoutTopics": "breakout topics to capitalize on"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorKeywordSpy(data: { competitors?: string[]; niche?: string }, userId?: string) {
  const p = `Spy on competitor keywords and identify ranking gaps and opportunities.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "keywords": [{"keyword": "keyword", "competitor": "competitor using it", "ranking": "their ranking", "yourGap": "your gap assessment"}],
  "stealOpportunities": "keywords to steal from competitors",
  "avoidKeywords": "keywords to avoid competing on"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSearchRankingTracker(data: { keywords?: string[]; channelName?: string }, userId?: string) {
  const p = `Track search rankings for target keywords and identify trends.
${data.keywords ? `Keywords: ${data.keywords.join(", ")}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "rankings": [{"keyword": "keyword", "position": 5, "change": "position change", "topCompetitor": "top competing channel"}],
  "improving": "keywords with improving rankings",
  "declining": "keywords with declining rankings",
  "opportunities": "new ranking opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCTRBenchmarker(data: { niche?: string; avgCTR?: number }, userId?: string) {
  const p = `Benchmark click-through rate against niche averages and top performers.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.avgCTR ? `Average CTR: ${data.avgCTR}%` : ""}
Respond as JSON:
{
  "yourCTR": "your CTR assessment",
  "nicheBenchmark": "niche average CTR benchmark",
  "topPerformerCTR": "top performer CTR in niche",
  "improvements": "specific CTR improvement suggestions",
  "abTestIdeas": "A/B test ideas to improve CTR"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiImpressionAnalyzer(data: { impressions?: number; clicks?: number; niche?: string }, userId?: string) {
  const p = `Analyze impressions to clicks funnel and identify drop-off points.
${data.impressions ? `Impressions: ${data.impressions}` : ""}
${data.clicks ? `Clicks: ${data.clicks}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "ctr": "calculated CTR",
  "funnelAnalysis": "impression to click funnel analysis",
  "dropOffPoints": "identified drop-off points",
  "improvements": "improvement recommendations",
  "benchmarks": "industry benchmarks comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRelatedVideoOptimizer(data: { videoTitle?: string; niche?: string }, userId?: string) {
  const p = `Optimize video for appearing in related and suggested video sections.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "strategy": "related video optimization strategy",
  "titleOptimization": "title optimization for suggested videos",
  "thumbnailTips": "thumbnail tips for suggested placement",
  "engagementSignals": "engagement signals to boost",
  "competitorAnalysis": "competitor analysis for suggested videos"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrowseFeatureOptimizer(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Optimize channel for browse features including homepage, subscription feed, and notifications.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "strategy": "browse feature optimization strategy",
  "homepageSignals": "signals to appear on YouTube homepage",
  "subscriptionFeedTips": "subscription feed optimization tips",
  "notificationOptimization": "notification bell optimization",
  "consistency": "consistency recommendations for browse features"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPillarPlanner(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Plan a content pillars strategy for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON:
{
  "pillars": [{"name": "pillar name", "description": "pillar description", "frequency": "posting frequency", "audience": "target audience"}],
  "distribution": "distribution strategy across pillars",
  "calendar": "weekly/monthly content calendar overview"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeriesBuilder(data: { niche?: string; format?: string }, userId?: string) {
  const p = `Build video series concepts for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.format ? `Preferred Format: ${data.format}` : ""}
Respond as JSON:
{
  "series": [{"name": "series name", "episodes": "number of episodes", "hook": "series hook", "schedule": "release schedule", "format": "episode format"}],
  "monetization": "monetization strategy for series",
  "crossPromotion": "cross-promotion strategy between series"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentRepurposeMatrix(data: { videoTitle?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a full content repurpose matrix for maximizing reach across platforms.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.platforms ? `Target Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "matrix": [{"platform": "platform name", "format": "content format", "adaptation": "how to adapt", "timing": "when to post"}],
  "workflow": "repurposing workflow",
  "automationTips": "automation tips for repurposing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralScorePredictor(data: { title?: string; niche?: string; platform?: string }, userId?: string) {
  const p = `Predict the viral potential of content.
${data.title ? `Title: ${data.title}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "viralScore": 75,
  "factors": [{"factor": "factor name", "score": 80, "improvement": "how to improve"}],
  "benchmark": "benchmark comparison",
  "timing": "optimal timing for posting"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentGapFinder(data: { niche?: string; competitors?: string[] }, userId?: string) {
  const p = `Find untapped content gaps and opportunities in a niche.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON:
{
  "gaps": [{"topic": "topic name", "demand": "demand level", "competition": "competition level", "opportunity": "opportunity score"}],
  "priorities": "prioritized list of gaps to fill",
  "contentIdeas": "specific content ideas for top gaps"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrendSurfer(data: { niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Identify and surf trending topics for content creation.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "trends": [{"topic": "trending topic", "platform": "platform", "velocity": "trend velocity", "window": "opportunity window", "contentAngle": "content angle to take"}],
  "timing": "optimal timing to jump on trends",
  "risks": "risks of trend-chasing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEvergreenPlanner(data: { niche?: string; existingContent?: string[] }, userId?: string) {
  const p = `Plan evergreen content that generates long-term views and value.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.existingContent ? `Existing Content: ${data.existingContent.join(", ")}` : ""}
Respond as JSON:
{
  "ideas": [{"title": "content title", "searchVolume": "estimated search volume", "updateFrequency": "how often to update", "monetization": "monetization potential"}],
  "schedule": "evergreen content publishing schedule",
  "seoStrategy": "SEO strategy for evergreen content"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentMixOptimizer(data: { currentMix?: Record<string, number>; goals?: string[] }, userId?: string) {
  const p = `Optimize the hero/hub/help content mix for maximum channel growth.
${data.currentMix ? `Current Mix: ${JSON.stringify(data.currentMix)}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON:
{
  "idealMix": "ideal content mix ratios",
  "currentAnalysis": "analysis of current mix",
  "adjustments": "recommended adjustments",
  "reasoning": "reasoning behind recommendations",
  "impactPrediction": "predicted impact of changes"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeasonalContentPlanner(data: { niche?: string; quarter?: string }, userId?: string) {
  const p = `Create a seasonal content calendar with events and opportunities.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.quarter ? `Quarter: ${data.quarter}` : ""}
Respond as JSON:
{
  "events": [{"event": "event name", "date": "event date", "contentIdeas": "content ideas for event", "prepTime": "preparation time needed"}],
  "themes": "seasonal themes to leverage",
  "tieIns": "brand and sponsor tie-in opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContentPlanner(data: { myNiche?: string; partnerNiche?: string }, userId?: string) {
  const p = `Plan collaboration content between two creators.
${data.myNiche ? `My Niche: ${data.myNiche}` : ""}
${data.partnerNiche ? `Partner Niche: ${data.partnerNiche}` : ""}
Respond as JSON:
{
  "ideas": [{"title": "collab title", "format": "content format", "audience": "target audience", "distribution": "distribution plan"}],
  "logistics": "logistics and planning tips",
  "contracts": "contract and agreement considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBehindTheScenesPlanner(data: { contentType?: string; frequency?: string }, userId?: string) {
  const p = `Plan behind-the-scenes content strategy for audience engagement.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.frequency ? `Frequency: ${data.frequency}` : ""}
Respond as JSON:
{
  "ideas": [{"concept": "BTS concept", "platform": "best platform", "format": "content format", "timing": "when to post"}],
  "authenticity": "tips for authentic BTS content",
  "engagement": "engagement strategies for BTS content"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReactionContentFinder(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Find reaction-worthy content to create reaction videos around.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "targets": [{"content": "content to react to", "why": "why it works for reactions", "angle": "unique angle to take", "timing": "best timing"}],
  "guidelines": "reaction content best practices",
  "fairUse": "fair use considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChallengeCreator(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Create viral challenge concepts for social media.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "challenges": [{"name": "challenge name", "rules": "challenge rules", "hashtag": "hashtag to use", "viralMechanic": "what makes it spread"}],
  "timeline": "challenge launch timeline",
  "promotion": "promotion strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQnAContentPlanner(data: { niche?: string; frequentQuestions?: string[] }, userId?: string) {
  const p = `Plan Q&A content strategy based on audience questions.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.frequentQuestions ? `Frequent Questions: ${data.frequentQuestions.join(", ")}` : ""}
Respond as JSON:
{
  "questions": [{"question": "question text", "format": "best format to answer", "value": "value to audience", "contentIdea": "content idea around question"}],
  "schedule": "Q&A content schedule",
  "engagement": "engagement strategies for Q&A"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTutorialStructurer(data: { topic?: string; skillLevel?: string }, userId?: string) {
  const p = `Structure a tutorial for maximum learning and engagement.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.skillLevel ? `Skill Level: ${data.skillLevel}` : ""}
Respond as JSON:
{
  "outline": [{"section": "section name", "duration": "section duration", "visuals": "visual aids needed", "keyPoint": "key takeaway"}],
  "prerequisites": "prerequisites for the tutorial",
  "resources": "additional resources to include"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDocumentaryStylePlanner(data: { topic?: string; researchNeeded?: string }, userId?: string) {
  const p = `Plan documentary-style video content with research and structure.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.researchNeeded ? `Research Needed: ${data.researchNeeded}` : ""}
Respond as JSON:
{
  "structure": [{"act": "act name", "focus": "focus area", "interviewee": "potential interviewee", "bRoll": "b-roll footage needed"}],
  "research": "research plan and sources",
  "timeline": "production timeline"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortFormStrategy(data: { niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a comprehensive short-form content strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "strategy": "overall short-form strategy",
  "idealLength": "ideal video length per platform",
  "postingSchedule": "optimal posting schedule",
  "hooks": "hook strategies for short-form",
  "trending": "how to leverage trends",
  "crossPost": "cross-posting strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsIdeaGenerator(data: { niche?: string; trending?: string[] }, userId?: string) {
  const p = `Generate creative Shorts/Reels/TikTok ideas.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.trending ? `Trending Topics: ${data.trending.join(", ")}` : ""}
Respond as JSON:
{
  "ideas": [{"concept": "short concept", "hook": "opening hook", "punchline": "punchline or payoff", "hashtags": "relevant hashtags", "sound": "suggested sound/audio"}],
  "formats": "trending formats to use",
  "timing": "best times to post"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsToLongPipeline(data: { shortConcept?: string }, userId?: string) {
  const p = `Convert a short-form video concept into a full long-form video.
${data.shortConcept ? `Short Concept: ${data.shortConcept}` : ""}
Respond as JSON:
{
  "longFormTitle": "expanded long-form title",
  "expansion": "how to expand the concept",
  "additionalResearch": "additional research needed",
  "structureChange": "how to restructure for long-form",
  "audience": "audience differences to consider"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLongToShortsClipper(data: { videoTitle?: string; keyMoments?: string[] }, userId?: string) {
  const p = `Extract short-form clips from a long-form video.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.keyMoments ? `Key Moments: ${data.keyMoments.join(", ")}` : ""}
Respond as JSON:
{
  "clips": [{"timestamp": "suggested timestamp", "concept": "clip concept", "hook": "clip hook", "editStyle": "editing style"}],
  "bestMoments": "best moments to clip",
  "platformAdaptation": "how to adapt clips per platform"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVerticalVideoOptimizer(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Optimize content for vertical video format.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "framing": "framing guidelines for vertical",
  "textPlacement": "text placement best practices",
  "captionStyle": "caption styling recommendations",
  "engagement": "engagement optimization tips",
  "platformSpecific": "platform-specific vertical tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsAudioSelector(data: { mood?: string; genre?: string }, userId?: string) {
  const p = `Select and recommend trending audio for short-form content.
${data.mood ? `Mood: ${data.mood}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON:
{
  "trending": [{"sound": "sound name", "platform": "platform trending on", "usage": "how to use it", "viralPotential": "viral potential score"}],
  "original": "tips for original audio creation",
  "licensing": "audio licensing considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsCaptionStyler(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Design caption styles for short-form video content.
${data.style ? `Style: ${data.style}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "font": "font recommendation", "animation": "animation type", "position": "text position", "color": "color scheme"}],
  "accessibility": "accessibility considerations",
  "readability": "readability best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsHookFormula(data: { niche?: string }, userId?: string) {
  const p = `Create proven hook formulas for short-form video content.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "formulas": [{"name": "formula name", "template": "hook template", "example": "example usage", "retention": "expected retention impact"}],
  "firstFrameTips": "first frame optimization tips",
  "thumbStop": "thumb-stopping techniques"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDuetStitchPlanner(data: { platform?: string; niche?: string }, userId?: string) {
  const p = `Plan duet and stitch content strategy for engagement growth.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "targets": [{"creator": "target creator type", "content": "content to duet/stitch", "angle": "unique angle", "value": "value added"}],
  "etiquette": "duet/stitch etiquette guidelines",
  "timing": "optimal timing for duets/stitches"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsAnalyticsDecoder(data: { avgViews?: number; avgRetention?: number }, userId?: string) {
  const p = `Decode and analyze shorts analytics for performance improvement.
${data.avgViews ? `Average Views: ${data.avgViews}` : ""}
${data.avgRetention ? `Average Retention: ${data.avgRetention}%` : ""}
Respond as JSON:
{
  "analysis": "overall analytics analysis",
  "benchmarks": "industry benchmarks comparison",
  "improvements": "specific improvements to make",
  "retentionCurve": "retention curve analysis and tips",
  "swipeRate": "swipe-away rate reduction strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsBatchPlanner(data: { niche?: string; batchSize?: number }, userId?: string) {
  const p = `Plan a batch recording session for short-form content.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.batchSize ? `Batch Size: ${data.batchSize} shorts` : ""}
Respond as JSON:
{
  "batch": [{"concept": "short concept", "script": "brief script", "setup": "setup requirements", "props": "props needed"}],
  "workflow": "batch recording workflow",
  "editingTips": "batch editing tips",
  "schedule": "release schedule for batch"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsRemixStrategy(data: { topShorts?: string[] }, userId?: string) {
  const p = `Create a strategy for remixing top-performing shorts.
${data.topShorts ? `Top Shorts: ${data.topShorts.join(", ")}` : ""}
Respond as JSON:
{
  "remixes": [{"original": "original short reference", "newAngle": "new angle to take", "improvement": "improvement over original", "timing": "when to post remix"}],
  "ethicalGuidelines": "ethical guidelines for remixing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsMonetization(data: { views?: number; niche?: string }, userId?: string) {
  const p = `Create a monetization strategy for short-form content.
${data.views ? `Average Views: ${data.views}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "revenue": "estimated revenue potential",
  "strategies": [{"method": "monetization method", "potential": "revenue potential", "implementation": "how to implement"}],
  "fundEligibility": "platform fund eligibility and requirements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentAudit(data: { videoCount?: number; topVideos?: string[]; bottomVideos?: string[] }, userId?: string) {
  const p = `Perform a full content audit with SWOT analysis.
${data.videoCount ? `Total Videos: ${data.videoCount}` : ""}
${data.topVideos ? `Top Videos: ${data.topVideos.join(", ")}` : ""}
${data.bottomVideos ? `Bottom Videos: ${data.bottomVideos.join(", ")}` : ""}
Respond as JSON:
{
  "audit": {"strengths": "content strengths", "weaknesses": "content weaknesses", "opportunities": "growth opportunities", "threats": "potential threats"},
  "actionPlan": "prioritized action plan",
  "priorities": "top 3 priorities to address"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentVelocityTracker(data: { publishingRate?: string; niche?: string }, userId?: string) {
  const p = `Track and optimize content publishing velocity.
${data.publishingRate ? `Current Publishing Rate: ${data.publishingRate}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "currentVelocity": "current content velocity assessment",
  "idealVelocity": "ideal content velocity for niche",
  "burnoutRisk": "burnout risk assessment",
  "qualityBalance": "quality vs quantity balance",
  "recommendations": "velocity optimization recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNicheResearcher(data: { interests?: string[]; skills?: string[] }, userId?: string) {
  const p = `Research niche opportunities based on interests and skills.
${data.interests ? `Interests: ${data.interests.join(", ")}` : ""}
${data.skills ? `Skills: ${data.skills.join(", ")}` : ""}
Respond as JSON:
{
  "niches": [{"niche": "niche name", "demand": "demand level", "competition": "competition level", "monetization": "monetization potential", "growthPotential": "growth potential"}],
  "recommendation": "top niche recommendation",
  "hybridIdeas": "hybrid niche ideas combining interests"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionGenerator(data: { videoTitle?: string; duration?: string; language?: string }, userId?: string) {
  const p = `Auto-generate captions for a video.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.duration ? `Duration: ${data.duration}` : ""}
${data.language ? `Language: ${data.language}` : ""}
Respond as JSON:
{
  "captions": [{"timestamp": "timestamp", "text": "caption text"}],
  "language": "detected or specified language",
  "accuracy": "estimated accuracy percentage",
  "wordCount": "total word count"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionStyler(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Style captions for video content.
${data.style ? `Desired Style: ${data.style}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "font": "font family", "size": "font size", "color": "color value", "position": "position on screen", "animation": "animation type"}],
  "accessibility": "accessibility compliance notes",
  "readability": "readability score and tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubtitleTranslator(data: { text?: string; targetLanguage?: string }, userId?: string) {
  const p = `Translate subtitles to a target language.
${data.text ? `Text: ${data.text}` : ""}
${data.targetLanguage ? `Target Language: ${data.targetLanguage}` : ""}
Respond as JSON:
{
  "translation": "translated text",
  "language": "target language",
  "accuracy": "translation accuracy estimate",
  "culturalNotes": "cultural adaptation notes",
  "alternatives": "alternative translation options"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiLanguageSEO(data: { title?: string; languages?: string[] }, userId?: string) {
  const p = `Optimize SEO for multiple languages.
${data.title ? `Title: ${data.title}` : ""}
${data.languages ? `Languages: ${data.languages.join(", ")}` : ""}
Respond as JSON:
{
  "translations": [{"language": "language", "title": "localized title", "description": "localized description", "tags": ["localized tags"]}],
  "markets": "target market analysis",
  "opportunities": "growth opportunities by language"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLocalizationManager(data: { content?: string; targetMarkets?: string[] }, userId?: string) {
  const p = `Create a localization strategy for content.
${data.content ? `Content: ${data.content}` : ""}
${data.targetMarkets ? `Target Markets: ${data.targetMarkets.join(", ")}` : ""}
Respond as JSON:
{
  "markets": [{"market": "market name", "adaptations": "required adaptations", "culturalNotes": "cultural considerations", "opportunity": "market opportunity"}],
  "priorities": "prioritized market list",
  "timeline": "recommended localization timeline"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDubbingAdvisor(data: { languages?: string[]; contentType?: string }, userId?: string) {
  const p = `Provide dubbing guidance for video content.
${data.languages ? `Target Languages: ${data.languages.join(", ")}` : ""}
${data.contentType ? `Content Type: ${data.contentType}` : ""}
Respond as JSON:
{
  "languages": [{"language": "language", "demand": "audience demand", "cost": "estimated cost", "tools": "recommended tools"}],
  "bestApproach": "recommended dubbing approach",
  "lipSyncTips": "lip sync optimization tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTranscriptOptimizer(data: { transcript?: string }, userId?: string) {
  const p = `Optimize a video transcript for readability and SEO.
${data.transcript ? `Transcript: ${data.transcript}` : ""}
Respond as JSON:
{
  "optimized": "optimized transcript text",
  "readability": "readability score and assessment",
  "seoKeywords": "extracted SEO keywords",
  "chapters": "suggested chapter markers",
  "summary": "concise transcript summary"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiClosedCaptionCompliance(data: { platform?: string; region?: string }, userId?: string) {
  const p = `Check closed caption compliance requirements.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.region ? `Region: ${data.region}` : ""}
Respond as JSON:
{
  "requirements": [{"regulation": "regulation name", "requirement": "specific requirement", "status": "compliance status"}],
  "accessibility": "accessibility standards summary",
  "penalties": "non-compliance penalties"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioDescriptionWriter(data: { videoTitle?: string; scenes?: string[] }, userId?: string) {
  const p = `Write audio descriptions for video accessibility.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.scenes ? `Scenes: ${data.scenes.join(", ")}` : ""}
Respond as JSON:
{
  "descriptions": [{"timestamp": "timestamp", "description": "audio description text", "priority": "priority level"}],
  "compliance": "accessibility compliance status",
  "guidelines": "audio description best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLanguagePriorityRanker(data: { niche?: string; currentLanguages?: string[] }, userId?: string) {
  const p = `Rank languages by ROI for content localization.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.currentLanguages ? `Current Languages: ${data.currentLanguages.join(", ")}` : ""}
Respond as JSON:
{
  "rankings": [{"language": "language", "audienceSize": "potential audience size", "competition": "competition level", "roi": "estimated ROI"}],
  "quickWins": "quick win language opportunities",
  "longTerm": "long-term language investments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetentionAnalyzer(data: { avgRetention?: number; videoDuration?: string; niche?: string }, userId?: string) {
  const p = `Analyze video retention metrics and provide improvement strategies.
${data.avgRetention ? `Average Retention: ${data.avgRetention}%` : ""}
${data.videoDuration ? `Video Duration: ${data.videoDuration}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "score": "retention score assessment",
  "dropOffPoints": "common drop-off points analysis",
  "improvements": "specific improvement recommendations",
  "benchmark": "niche benchmark comparison",
  "retentionCurve": "ideal retention curve description"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceDemographics(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Analyze audience demographics and provide targeting insights.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "demographics": {"age": "age distribution", "gender": "gender breakdown", "location": "top locations", "interests": "related interests"},
  "segments": "key audience segments",
  "targeting": "targeting recommendations",
  "content": "content preferences by segment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatchTimeOptimizer(data: { avgWatchTime?: string; videoDuration?: string }, userId?: string) {
  const p = `Optimize watch time for video content.
${data.avgWatchTime ? `Average Watch Time: ${data.avgWatchTime}` : ""}
${data.videoDuration ? `Video Duration: ${data.videoDuration}` : ""}
Respond as JSON:
{
  "current": "current watch time assessment",
  "ideal": "ideal watch time target",
  "strategies": "optimization strategies",
  "segments": "content segment recommendations",
  "hooks": "audience hook techniques",
  "reEngagement": "re-engagement tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEngagementRateAnalyzer(data: { likes?: number; comments?: number; views?: number }, userId?: string) {
  const p = `Analyze engagement rate and provide improvement strategies.
${data.likes ? `Likes: ${data.likes}` : ""}
${data.comments ? `Comments: ${data.comments}` : ""}
${data.views ? `Views: ${data.views}` : ""}
Respond as JSON:
{
  "rate": "calculated engagement rate",
  "benchmark": "industry benchmark comparison",
  "improvements": "improvement recommendations",
  "commentStrategy": "comment engagement strategy",
  "likeTriggers": "like-triggering techniques"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriberGrowthAnalyzer(data: { currentSubs?: number; monthlyGrowth?: number }, userId?: string) {
  const p = `Analyze subscriber growth and predict trajectory.
${data.currentSubs ? `Current Subscribers: ${data.currentSubs}` : ""}
${data.monthlyGrowth ? `Monthly Growth: ${data.monthlyGrowth}` : ""}
Respond as JSON:
{
  "growthRate": "current growth rate assessment",
  "trajectory": "growth trajectory prediction",
  "milestoneETA": "estimated time to next milestones",
  "strategies": "growth acceleration strategies",
  "benchmark": "niche benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueForecaster(data: { monthlyRevenue?: number; growth?: number; sources?: string[] }, userId?: string) {
  const p = `Forecast revenue and identify optimization opportunities.
${data.monthlyRevenue ? `Monthly Revenue: $${data.monthlyRevenue}` : ""}
${data.growth ? `Growth Rate: ${data.growth}%` : ""}
${data.sources ? `Revenue Sources: ${data.sources.join(", ")}` : ""}
Respond as JSON:
{
  "forecast": [{"month": "month", "predicted": "predicted revenue", "sources": "revenue source breakdown"}],
  "optimizations": "revenue optimization recommendations",
  "risks": "potential revenue risks",
  "ceiling": "estimated revenue ceiling"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiABTestAnalyzer(data: { testType?: string; variantA?: any; variantB?: any }, userId?: string) {
  const p = `Analyze A/B test results and provide insights.
${data.testType ? `Test Type: ${data.testType}` : ""}
${data.variantA ? `Variant A: ${JSON.stringify(data.variantA)}` : ""}
${data.variantB ? `Variant B: ${JSON.stringify(data.variantB)}` : ""}
Respond as JSON:
{
  "winner": "winning variant",
  "confidence": "statistical confidence level",
  "metrics": "key metric comparisons",
  "duration": "recommended test duration",
  "nextTest": "suggested next test",
  "insights": "actionable insights"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceRetentionHeatmap(data: { videoTitle?: string; duration?: string }, userId?: string) {
  const p = `Generate an audience retention heatmap analysis.
${data.videoTitle ? `Video Title: ${data.videoTitle}` : ""}
${data.duration ? `Duration: ${data.duration}` : ""}
Respond as JSON:
{
  "heatmap": [{"segment": "time segment", "retention": "retention percentage", "engagement": "engagement level"}],
  "coldSpots": "low retention segments analysis",
  "hotSpots": "high retention segments analysis",
  "fixes": "recommendations to fix cold spots"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrafficSourceAnalyzer(data: { sources?: Record<string, number> }, userId?: string) {
  const p = `Analyze traffic sources and optimize distribution.
${data.sources ? `Traffic Sources: ${JSON.stringify(data.sources)}` : ""}
Respond as JSON:
{
  "analysis": [{"source": "traffic source", "percentage": "traffic percentage", "optimization": "optimization tips"}],
  "untapped": "untapped traffic sources",
  "strategy": "overall traffic strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDeviceAnalyzer(data: { mobile?: number; desktop?: number; tv?: number }, userId?: string) {
  const p = `Analyze device distribution and optimize content for each device.
${data.mobile ? `Mobile: ${data.mobile}%` : ""}
${data.desktop ? `Desktop: ${data.desktop}%` : ""}
${data.tv ? `TV: ${data.tv}%` : ""}
Respond as JSON:
{
  "distribution": "device distribution analysis",
  "optimization": [{"device": "device type", "tips": "optimization tips"}],
  "trending": "device trend analysis",
  "priorities": "optimization priorities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaybackLocationAnalyzer(data: { embedded?: number; youtube?: number; external?: number }, userId?: string) {
  const p = `Analyze playback locations and identify embed opportunities.
${data.embedded ? `Embedded: ${data.embedded}%` : ""}
${data.youtube ? `YouTube: ${data.youtube}%` : ""}
${data.external ? `External: ${data.external}%` : ""}
Respond as JSON:
{
  "analysis": "playback location breakdown analysis",
  "embedOpportunities": "new embed opportunities",
  "seoImpact": "SEO impact of playback locations",
  "partnerSites": "potential partner site recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndScreenAnalyzer(data: { clickRate?: number; impressions?: number }, userId?: string) {
  const p = `Analyze end screen performance and suggest improvements.
${data.clickRate ? `Click Rate: ${data.clickRate}%` : ""}
${data.impressions ? `Impressions: ${data.impressions}` : ""}
Respond as JSON:
{
  "analysis": "end screen performance analysis",
  "improvements": "specific improvement recommendations",
  "bestPerformers": "best performing end screen elements",
  "timing": "optimal end screen timing",
  "design": "design recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCardPerformanceAnalyzer(data: { cards?: Array<{type: string; clicks: number}> }, userId?: string) {
  const p = `Analyze info card performance and optimize placement.
${data.cards ? `Cards: ${JSON.stringify(data.cards)}` : ""}
Respond as JSON:
{
  "analysis": "card performance analysis",
  "bestPerforming": "best performing card types",
  "optimization": "optimization recommendations",
  "timing": "optimal card timing",
  "placement": "placement best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiImpressionFunnelAnalyzer(data: { impressions?: number; ctr?: number; avgView?: number }, userId?: string) {
  const p = `Analyze the full impression-to-view funnel.
${data.impressions ? `Impressions: ${data.impressions}` : ""}
${data.ctr ? `CTR: ${data.ctr}%` : ""}
${data.avgView ? `Average View Duration: ${data.avgView}%` : ""}
Respond as JSON:
{
  "funnel": [{"stage": "funnel stage", "metric": "stage metric", "optimization": "optimization tip"}],
  "bottleneck": "primary bottleneck identification",
  "priority": "priority actions to fix funnel"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorBenchmarker(data: { competitors?: string[]; metrics?: string[] }, userId?: string) {
  const p = `Benchmark against competitors and identify gaps.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
${data.metrics ? `Metrics to Compare: ${data.metrics.join(", ")}` : ""}
Respond as JSON:
{
  "benchmarks": [{"competitor": "competitor name", "metrics": "metric comparisons", "strengths": "competitor strengths", "weaknesses": "competitor weaknesses"}],
  "gaps": "identified gaps and opportunities",
  "opportunities": "strategic opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrowthRatePredictor(data: { historicalData?: any; niche?: string }, userId?: string) {
  const p = `Predict growth rate based on historical data.
${data.historicalData ? `Historical Data: ${JSON.stringify(data.historicalData)}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "prediction": [{"period": "time period", "subscribers": "predicted subscribers", "views": "predicted views", "revenue": "predicted revenue"}],
  "confidence": "prediction confidence level",
  "accelerators": "growth accelerator recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChurnPredictor(data: { unsubRate?: number; contentFrequency?: string }, userId?: string) {
  const p = `Predict subscriber churn and provide prevention strategies.
${data.unsubRate ? `Unsubscribe Rate: ${data.unsubRate}%` : ""}
${data.contentFrequency ? `Content Frequency: ${data.contentFrequency}` : ""}
Respond as JSON:
{
  "churnRate": "predicted churn rate",
  "riskFactors": "churn risk factors",
  "prevention": "churn prevention strategies",
  "reEngagement": "re-engagement campaign ideas",
  "benchmark": "industry churn benchmark"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralCoefficientCalculator(data: { shares?: number; newViewers?: number }, userId?: string) {
  const p = `Calculate viral coefficient and improve shareability.
${data.shares ? `Shares: ${data.shares}` : ""}
${data.newViewers ? `New Viewers from Shares: ${data.newViewers}` : ""}
Respond as JSON:
{
  "coefficient": "calculated viral coefficient",
  "interpretation": "coefficient interpretation",
  "improvements": "virality improvement strategies",
  "shareability": "shareability score and tips",
  "benchmark": "viral coefficient benchmark"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSentimentDashboard(data: { comments?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze comment sentiment and provide a dashboard overview.
${data.comments ? `Comments: ${data.comments.join(" | ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "overall": "overall sentiment score",
  "positive": "positive sentiment percentage and themes",
  "negative": "negative sentiment percentage and themes",
  "neutral": "neutral sentiment percentage",
  "trending": "trending sentiment topics",
  "alerts": "sentiment alerts requiring attention"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPeakTimeAnalyzer(data: { timezone?: string; niche?: string; platform?: string }, userId?: string) {
  const p = `Determine the best posting times for maximum reach.
${data.timezone ? `Timezone: ${data.timezone}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "optimal": [{"day": "day of week", "time": "optimal time", "reason": "why this time works"}],
  "avoid": "times to avoid posting",
  "timezone": "timezone-specific recommendations",
  "seasonal": "seasonal timing adjustments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoLifecycleTracker(data: { ageInDays?: number; views?: number }, userId?: string) {
  const p = `Track video lifecycle phase and suggest revival strategies.
${data.ageInDays ? `Video Age: ${data.ageInDays} days` : ""}
${data.views ? `Total Views: ${data.views}` : ""}
Respond as JSON:
{
  "phase": "current lifecycle phase",
  "expectedLifespan": "expected content lifespan",
  "revivalStrategies": "strategies to revive viewership",
  "evergreenPotential": "evergreen content potential assessment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenuePerViewOptimizer(data: { rpm?: number; niche?: string }, userId?: string) {
  const p = `Optimize revenue per view and RPM.
${data.rpm ? `Current RPM: $${data.rpm}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "currentRPM": "current RPM assessment",
  "benchmark": "niche RPM benchmark",
  "improvements": "RPM improvement strategies",
  "adOptimization": "ad placement optimization tips",
  "nichePremium": "niche premium opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceOverlapAnalyzer(data: { platforms?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze audience overlap across platforms.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "overlap": "audience overlap percentage and analysis",
  "unique": [{"platform": "platform name", "percentage": "unique audience percentage"}],
  "crossPromotion": "cross-promotion opportunities",
  "strategy": "multi-platform audience strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPerformanceRanker(data: { videos?: Array<{title: string; views: number}> }, userId?: string) {
  const p = `Rank content by performance and identify patterns.
${data.videos ? `Videos: ${JSON.stringify(data.videos)}` : ""}
Respond as JSON:
{
  "rankings": [{"title": "video title", "score": "performance score", "strengths": "content strengths"}],
  "patterns": "performance patterns identified",
  "replication": "how to replicate top performers"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFunnelLeakDetector(data: { impressions?: number; clicks?: number; subs?: number }, userId?: string) {
  const p = `Detect leaks in the viewer-to-subscriber funnel.
${data.impressions ? `Impressions: ${data.impressions}` : ""}
${data.clicks ? `Clicks: ${data.clicks}` : ""}
${data.subs ? `New Subscribers: ${data.subs}` : ""}
Respond as JSON:
{
  "leaks": [{"stage": "funnel stage", "lossRate": "loss rate percentage", "fix": "recommended fix"}],
  "priority": "priority fixes ranked",
  "quickWins": "quick win improvements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveAnalytics(data: { metrics?: any; period?: string }, userId?: string) {
  const p = `Generate predictive analytics for content performance.
${data.metrics ? `Current Metrics: ${JSON.stringify(data.metrics)}` : ""}
${data.period ? `Prediction Period: ${data.period}` : ""}
Respond as JSON:
{
  "predictions": [{"metric": "metric name", "current": "current value", "predicted": "predicted value", "trend": "trend direction"}],
  "alerts": "important alerts and warnings",
  "opportunities": "upcoming opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomReportBuilder(data: { metrics?: string[]; period?: string; format?: string }, userId?: string) {
  const p = `Build a custom analytics report.
${data.metrics ? `Metrics: ${data.metrics.join(", ")}` : ""}
${data.period ? `Report Period: ${data.period}` : ""}
${data.format ? `Format: ${data.format}` : ""}
Respond as JSON:
{
  "report": {"summary": "executive summary", "highlights": "key highlights", "concerns": "areas of concern"},
  "visualizations": "recommended data visualizations",
  "schedule": "recommended reporting schedule"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamTitleGenerator(data: { game?: string; category?: string; mood?: string }, userId?: string) {
  const p = `Generate compelling stream titles for a live streamer.
${data.game ? `Game: ${data.game}` : ""}
${data.category ? `Category: ${data.category}` : ""}
${data.mood ? `Mood/Vibe: ${data.mood}` : ""}
Respond as JSON:
{
  "titles": [{"title": "stream title", "platform": "best platform for this title", "searchScore": 85}],
  "trending": "currently trending title styles",
  "hashtags": "recommended hashtags"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamScheduleOptimizer(data: { timezone?: string; niche?: string; currentSchedule?: string[] }, userId?: string) {
  const p = `Optimize a streamer's streaming schedule for maximum viewership.
${data.timezone ? `Timezone: ${data.timezone}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.currentSchedule ? `Current Schedule: ${data.currentSchedule.join(", ")}` : ""}
Respond as JSON:
{
  "optimal": [{"day": "day of week", "time": "best time slot", "reason": "why this slot", "competition": "competition level"}],
  "avoid": "times to avoid streaming",
  "seasonal": "seasonal scheduling adjustments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamOverlayDesigner(data: { theme?: string; style?: string }, userId?: string) {
  const p = `Design stream overlay concepts for a live streamer.
${data.theme ? `Theme: ${data.theme}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "overlays": [{"type": "overlay type", "design": "design description", "placement": "screen placement", "animation": "animation style"}],
  "alerts": "alert overlay recommendations",
  "panels": "panel design recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamAlertDesigner(data: { eventType?: string; style?: string }, userId?: string) {
  const p = `Design stream alert animations and sounds for a live streamer.
${data.eventType ? `Event Type: ${data.eventType}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "alerts": [{"event": "trigger event", "animation": "animation description", "sound": "sound effect suggestion", "duration": "display duration", "design": "visual design"}],
  "progression": "alert progression system for milestones",
  "celebration": "celebration alert ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamModerationRules(data: { community?: string; platform?: string }, userId?: string) {
  const p = `Create moderation rules and automod configuration for a live stream chat.
${data.community ? `Community Type: ${data.community}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "rules": [{"rule": "rule description", "action": "enforcement action", "severity": "low/medium/high"}],
  "automod": "automod configuration recommendations",
  "wordFilter": "word filter suggestions",
  "timeouts": "timeout policy recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamInteractionPlanner(data: { viewerCount?: number; category?: string }, userId?: string) {
  const p = `Plan viewer interaction activities for a live stream to boost engagement.
${data.viewerCount ? `Average Viewer Count: ${data.viewerCount}` : ""}
${data.category ? `Stream Category: ${data.category}` : ""}
Respond as JSON:
{
  "activities": [{"name": "activity name", "timing": "when to run it", "engagement": "expected engagement level", "setup": "how to set it up"}],
  "polls": "poll ideas and strategies",
  "predictions": "prediction ideas for viewers",
  "minigames": "chat minigame suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamRevenueOptimizer(data: { avgViewers?: number; subCount?: number }, userId?: string) {
  const p = `Optimize revenue streams for a live streamer.
${data.avgViewers ? `Average Viewers: ${data.avgViewers}` : ""}
${data.subCount ? `Current Subscriber Count: ${data.subCount}` : ""}
Respond as JSON:
{
  "strategies": [{"method": "revenue method", "potential": "earning potential", "implementation": "how to implement"}],
  "subGoals": "subscriber goal strategy",
  "donations": "donation optimization tips",
  "bits": "bits and cheering strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamClipHighlighter(data: { streamDuration?: string; genre?: string }, userId?: string) {
  const p = `Identify potential clip-worthy moments and highlight strategies for a live stream.
${data.streamDuration ? `Stream Duration: ${data.streamDuration}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON:
{
  "moments": [{"type": "moment type", "description": "what to look for", "clipWorthiness": "high/medium/low"}],
  "compilation": "highlight compilation strategy",
  "thumbnails": "thumbnail suggestions for clips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamCategoryOptimizer(data: { content?: string; platforms?: string[] }, userId?: string) {
  const p = `Optimize stream category selection for maximum discoverability.
${data.content ? `Content Description: ${data.content}` : ""}
${data.platforms ? `Target Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON:
{
  "primary": "recommended primary category",
  "alternatives": "alternative category options",
  "crossCategory": "cross-category opportunities",
  "trending": "trending categories to consider",
  "discovery": "category-based discovery tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamPanelDesigner(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Design about/info panel layouts for a streaming channel page.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.style ? `Style: ${data.style}` : ""}
Respond as JSON:
{
  "panels": [{"title": "panel title", "content": "panel content description", "design": "visual design notes", "link": "suggested link if applicable"}],
  "layout": "overall panel layout recommendation",
  "branding": "branding consistency tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamEmoteManager(data: { channelName?: string; subTiers?: number }, userId?: string) {
  const p = `Create an emote strategy for a streaming channel including concepts and tier distribution.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.subTiers ? `Number of Sub Tiers: ${data.subTiers}` : ""}
Respond as JSON:
{
  "emotes": [{"name": "emote name", "concept": "emote concept description", "tier": "subscriber tier", "style": "art style"}],
  "progression": "emote unlock progression strategy",
  "communityInput": "how to involve community in emote creation"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamSubGoalPlanner(data: { currentSubs?: number; goal?: number }, userId?: string) {
  const p = `Create a subscriber goal strategy with milestones and rewards for a streamer.
${data.currentSubs ? `Current Subscribers: ${data.currentSubs}` : ""}
${data.goal ? `Target Goal: ${data.goal}` : ""}
Respond as JSON:
{
  "goals": [{"milestone": "subscriber milestone", "reward": "reward for reaching milestone", "timeline": "estimated timeline"}],
  "incentives": "subscriber incentive ideas",
  "community": "community engagement around sub goals",
  "celebration": "milestone celebration ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamNetworkingAdvisor(data: { niche?: string; size?: string }, userId?: string) {
  const p = `Provide networking advice for a streamer to collaborate and grow their community.
${data.niche ? `Content Niche: ${data.niche}` : ""}
${data.size ? `Channel Size: ${data.size}` : ""}
Respond as JSON:
{
  "targets": [{"creator": "type of creator to network with", "reason": "why this collaboration works", "approach": "how to approach them"}],
  "events": "networking events and opportunities",
  "communities": "communities to join",
  "etiquette": "networking etiquette tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamAnalyticsExplainer(data: { platform?: string; metrics?: any }, userId?: string) {
  const p = `Explain stream analytics metrics and provide actionable insights for a streamer.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.metrics ? `Metrics Data: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON:
{
  "explained": [{"metric": "metric name", "meaning": "what it means", "benchmark": "industry benchmark", "action": "actionable recommendation"}],
  "priorities": "which metrics to prioritize",
  "trends": "trend analysis and predictions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiStreamSetup(data: { platforms?: string[]; resolution?: string }, userId?: string) {
  const p = `Provide multi-stream setup guidance for broadcasting to multiple platforms simultaneously.
${data.platforms ? `Target Platforms: ${data.platforms.join(", ")}` : ""}
${data.resolution ? `Desired Resolution: ${data.resolution}` : ""}
Respond as JSON:
{
  "setup": [{"platform": "platform name", "settings": "recommended settings", "limitations": "platform-specific limitations"}],
  "software": "recommended multi-stream software",
  "bandwidth": "bandwidth requirements and optimization",
  "legal": "legal considerations for multi-streaming"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamBackupPlanner(data: { setupType?: string }, userId?: string) {
  const p = `Create emergency backup plans for common streaming issues and failures.
${data.setupType ? `Current Setup Type: ${data.setupType}` : ""}
Respond as JSON:
{
  "scenarios": [{"issue": "potential issue", "solution": "immediate solution", "prevention": "how to prevent it"}],
  "hardware": "hardware backup recommendations",
  "software": "software backup recommendations",
  "internetBackup": "internet backup solutions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamCommunityBuilder(data: { platform?: string; size?: string }, userId?: string) {
  const p = `Create a community building strategy for a live streamer.
${data.platform ? `Primary Platform: ${data.platform}` : ""}
${data.size ? `Community Size: ${data.size}` : ""}
Respond as JSON:
{
  "strategies": [{"strategy": "strategy name", "implementation": "how to implement", "timeline": "expected timeline"}],
  "discord": "Discord server setup and management tips",
  "events": "community event ideas",
  "loyalty": "loyalty and retention programs"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamBrandingKit(data: { channelName?: string; colors?: string[] }, userId?: string) {
  const p = `Create a comprehensive branding kit for a streaming channel.
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
${data.colors ? `Brand Colors: ${data.colors.join(", ")}` : ""}
Respond as JSON:
{
  "kit": {"logo": "logo design concept", "banner": "banner design concept", "overlays": "overlay style guide", "alerts": "alert design style", "panels": "panel design style", "emotes": "emote art direction"},
  "consistency": "brand consistency guidelines",
  "guidelines": "usage guidelines and do/dont rules"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamContentCalendar(data: { frequency?: string; niche?: string }, userId?: string) {
  const p = `Create a stream content calendar with themes and special events.
${data.frequency ? `Streaming Frequency: ${data.frequency}` : ""}
${data.niche ? `Content Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "calendar": [{"day": "day of week", "content": "content type/theme", "special": "special event or series", "goal": "session goal"}],
  "themes": "recurring theme ideas",
  "variety": "content variety recommendations",
  "events": "special event and holiday content ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamGrowthHacker(data: { platform?: string; currentViewers?: number }, userId?: string) {
  const p = `Provide growth hacking tactics for a live streamer to rapidly increase viewership.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.currentViewers ? `Current Average Viewers: ${data.currentViewers}` : ""}
Respond as JSON:
{
  "hacks": [{"tactic": "growth tactic", "effort": "effort level required", "impact": "expected impact", "timeline": "time to see results"}],
  "discovery": "discoverability optimization tips",
  "crossPromo": "cross-promotion strategies",
  "viral": "viral content strategies for streams"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdRevenueOptimizer(data: { rpm?: number; niche?: string; platform?: string }, userId?: string) {
  const p = `Optimize ad revenue for a content creator.
${data.rpm ? `Current RPM: $${data.rpm}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON:
{
  "strategies": [{"strategy": "revenue strategy", "impact": "expected impact", "implementation": "how to implement"}],
  "adPlacement": "ad placement optimization advice",
  "midRolls": "mid-roll ad strategy recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdPlacementAdvisor(data: { videoDuration?: string; genre?: string }, userId?: string) {
  const p = `Advise on optimal ad placements for a video to maximize revenue without hurting viewer experience.
${data.videoDuration ? `Video Duration: ${data.videoDuration}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON:
{
  "placements": [{"timestamp": "suggested timestamp", "type": "ad type", "reason": "why this placement works"}],
  "skipRate": "expected skip rate analysis",
  "viewerExperience": "viewer experience impact assessment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCPMMaximizer(data: { niche?: string; geography?: string }, userId?: string) {
  const p = `Maximize CPM rates for a content creator by optimizing content strategy and targeting.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.geography ? `Target Geography: ${data.geography}` : ""}
Respond as JSON:
{
  "currentCPM": "estimated current CPM analysis",
  "strategies": "CPM improvement strategies",
  "seasonalTrends": "seasonal CPM trends and opportunities",
  "premiumTopics": "high-CPM topic suggestions",
  "geography": "geographic targeting recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorPricingEngine(data: { subscribers?: number; avgViews?: number; niche?: string }, userId?: string) {
  const p = `Calculate fair sponsorship pricing for a content creator.
${data.subscribers ? `Subscribers: ${data.subscribers}` : ""}
${data.avgViews ? `Average Views: ${data.avgViews}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "pricing": {"integration": "integration deal price range", "dedicated": "dedicated video price range", "mention": "mention/shoutout price range"},
  "negotiation": "negotiation tips and strategies",
  "rateCard": "professional rate card recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorOutreachWriter(data: { brandName?: string; channelName?: string }, userId?: string) {
  const p = `Write sponsor outreach emails for a content creator pitching to brands.
${data.brandName ? `Target Brand: ${data.brandName}` : ""}
${data.channelName ? `Channel Name: ${data.channelName}` : ""}
Respond as JSON:
{
  "emails": [{"subject": "email subject line", "body": "email body content", "followUp": "follow-up email template"}],
  "pitch": "elevator pitch summary",
  "mediaKit": "media kit talking points",
  "customization": "personalization tips for each brand"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorNegotiator(data: { offerAmount?: number; deliverables?: string[] }, userId?: string) {
  const p = `Help negotiate a sponsorship deal for a content creator.
${data.offerAmount ? `Current Offer Amount: $${data.offerAmount}` : ""}
${data.deliverables ? `Deliverables: ${data.deliverables.join(", ")}` : ""}
Respond as JSON:
{
  "counterOffer": "recommended counter offer with justification",
  "justification": "data-backed justification for pricing",
  "walkAway": "walk-away point and alternatives",
  "addOns": "value-add suggestions to sweeten the deal",
  "contractPoints": "key contract points to negotiate"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorDeliverableTracker(data: { sponsors?: Array<{name: string; deliverables: string[]}> }, userId?: string) {
  const p = `Track and manage sponsor deliverables for a content creator.
${data.sponsors ? `Sponsors: ${JSON.stringify(data.sponsors)}` : ""}
Respond as JSON:
{
  "tracking": [{"sponsor": "sponsor name", "deliverables": "list of deliverables", "status": "completion status", "deadline": "estimated deadline"}],
  "reminders": "reminder schedule recommendations",
  "compliance": "compliance checklist for sponsor agreements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffiliateOptimizer(data: { niche?: string; currentAffiliates?: string[] }, userId?: string) {
  const p = `Optimize affiliate marketing strategy for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.currentAffiliates ? `Current Affiliates: ${data.currentAffiliates.join(", ")}` : ""}
Respond as JSON:
{
  "programs": [{"name": "affiliate program name", "commission": "commission rate", "conversion": "expected conversion rate", "fit": "niche fit score"}],
  "strategy": "overall affiliate strategy",
  "placement": "optimal link placement recommendations",
  "disclosure": "FTC disclosure compliance tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMerchandiseAdvisor(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Advise on merchandise strategy for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.audience ? `Target Audience: ${data.audience}` : ""}
Respond as JSON:
{
  "products": [{"item": "product type", "margin": "profit margin estimate", "demand": "demand level", "design": "design recommendations"}],
  "platform": "recommended merch platforms",
  "pricing": "pricing strategy",
  "marketing": "merchandise marketing tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMembershipTierBuilder(data: { platform?: string; currentMembers?: number }, userId?: string) {
  const p = `Design membership tiers for a content creator's community.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.currentMembers ? `Current Members: ${data.currentMembers}` : ""}
Respond as JSON:
{
  "tiers": [{"name": "tier name", "price": "monthly price", "perks": "tier perks and benefits", "value": "value proposition"}],
  "pricing": "pricing psychology and strategy",
  "retention": "member retention tactics",
  "upsell": "upsell strategies between tiers"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalProductCreator(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Suggest digital products a content creator can create and sell.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.audience ? `Target Audience: ${data.audience}` : ""}
Respond as JSON:
{
  "products": [{"name": "product name", "type": "product type", "price": "suggested price", "creation": "creation effort and timeline"}],
  "funnel": "sales funnel strategy",
  "launch": "launch strategy recommendations",
  "marketing": "marketing and promotion plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCourseBuilder(data: { topic?: string; expertise?: string }, userId?: string) {
  const p = `Build an online course curriculum for a content creator.
${data.topic ? `Course Topic: ${data.topic}` : ""}
${data.expertise ? `Creator Expertise Level: ${data.expertise}` : ""}
Respond as JSON:
{
  "curriculum": [{"module": "module name", "lessons": "lesson titles", "duration": "estimated duration"}],
  "pricing": "course pricing strategy",
  "platform": "recommended course platforms",
  "marketing": "course marketing and launch plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatreonOptimizer(data: { currentPatrons?: number; tiers?: any }, userId?: string) {
  const p = `Optimize a creator's Patreon page for growth and retention.
${data.currentPatrons ? `Current Patrons: ${data.currentPatrons}` : ""}
${data.tiers ? `Current Tiers: ${JSON.stringify(data.tiers)}` : ""}
Respond as JSON:
{
  "optimization": "overall Patreon optimization strategy",
  "tierAdjustments": "tier restructuring recommendations",
  "content": "exclusive content ideas for patrons",
  "growth": "patron growth strategies",
  "retention": "patron retention tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperChatOptimizer(data: { avgSuperChats?: number; streamType?: string }, userId?: string) {
  const p = `Optimize Super Chat and donation revenue for a live streamer.
${data.avgSuperChats ? `Average Super Chats per Stream: ${data.avgSuperChats}` : ""}
${data.streamType ? `Stream Type: ${data.streamType}` : ""}
Respond as JSON:
{
  "strategies": "Super Chat optimization strategies",
  "triggers": "audience triggers that encourage Super Chats",
  "recognition": "donor recognition best practices",
  "goals": "Super Chat goal-setting recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelMembershipGrowth(data: { members?: number; perks?: string[] }, userId?: string) {
  const p = `Grow channel membership subscribers for a content creator.
${data.members ? `Current Members: ${data.members}` : ""}
${data.perks ? `Current Perks: ${data.perks.join(", ")}` : ""}
Respond as JSON:
{
  "growth": [{"strategy": "growth strategy", "implementation": "how to implement", "timeline": "expected timeline"}],
  "perkIdeas": "new membership perk ideas",
  "retention": "member retention strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueStreamDiversifier(data: { currentStreams?: string[] }, userId?: string) {
  const p = `Diversify revenue streams for a content creator to reduce income risk.
${data.currentStreams ? `Current Revenue Streams: ${data.currentStreams.join(", ")}` : ""}
Respond as JSON:
{
  "newStreams": [{"stream": "revenue stream name", "potential": "earning potential", "effort": "setup effort", "timeline": "time to first revenue"}],
  "risk": "risk diversification analysis",
  "priority": "prioritized implementation order"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInvoiceGenerator(data: { clientName?: string; services?: Array<{name: string; amount: number}> }, userId?: string) {
  const p = `Generate a professional invoice template for a content creator's services.
${data.clientName ? `Client Name: ${data.clientName}` : ""}
${data.services ? `Services: ${JSON.stringify(data.services)}` : ""}
Respond as JSON:
{
  "invoice": {"number": "invoice number format", "items": "line items with descriptions", "subtotal": "subtotal calculation", "tax": "tax considerations", "total": "total amount"},
  "template": "invoice template recommendations",
  "terms": "payment terms and conditions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContractReviewer(data: { contractType?: string; keyTerms?: string[] }, userId?: string) {
  const p = `Review and advise on a content creator contract.
${data.contractType ? `Contract Type: ${data.contractType}` : ""}
${data.keyTerms ? `Key Terms to Review: ${data.keyTerms.join(", ")}` : ""}
Respond as JSON:
{
  "review": [{"clause": "contract clause", "risk": "risk level", "suggestion": "improvement suggestion"}],
  "redFlags": "red flags to watch for",
  "negotiation": "negotiation recommendations",
  "alternatives": "alternative clause suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTaxDeductionFinder(data: { expenses?: Array<{category: string; amount: number}> }, userId?: string) {
  const p = `Find tax deductions for a content creator's business expenses.
${data.expenses ? `Expenses: ${JSON.stringify(data.expenses)}` : ""}
Respond as JSON:
{
  "deductions": [{"expense": "expense item", "deductible": "deductibility status and percentage", "documentation": "required documentation"}],
  "totalSavings": "estimated total tax savings",
  "tips": "additional tax saving tips for creators"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuarterlyTaxEstimator(data: { income?: number; expenses?: number; quarter?: string }, userId?: string) {
  const p = `Estimate quarterly tax payments for a content creator.
${data.income ? `Quarterly Income: $${data.income}` : ""}
${data.expenses ? `Quarterly Expenses: $${data.expenses}` : ""}
${data.quarter ? `Quarter: ${data.quarter}` : ""}
Respond as JSON:
{
  "estimated": {"federal": "estimated federal tax", "state": "estimated state tax considerations", "selfEmployment": "self-employment tax estimate"},
  "payments": "payment schedule and amounts",
  "deadlines": "upcoming tax deadlines",
  "optimization": "tax optimization strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandDealEvaluator(data: { brand?: string; offer?: number; deliverables?: string[] }, userId?: string) {
  const p = `Evaluate a brand deal offer for a content creator.
${data.brand ? `Brand: ${data.brand}` : ""}
${data.offer ? `Offer Amount: $${data.offer}` : ""}
${data.deliverables ? `Deliverables: ${data.deliverables.join(", ")}` : ""}
Respond as JSON:
{
  "evaluation": {"fairness": "offer fairness assessment", "marketRate": "market rate comparison", "redFlags": "potential red flags"},
  "counter": "counter-offer recommendation",
  "walkAway": "walk-away analysis",
  "longTerm": "long-term partnership potential"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaKitEnhancer(data: { currentMetrics?: any; niche?: string }, userId?: string) {
  const p = `Enhance a content creator's media kit for sponsorship pitches.
${data.currentMetrics ? `Current Metrics: ${JSON.stringify(data.currentMetrics)}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "enhancements": [{"section": "media kit section", "improvement": "specific improvement suggestion"}],
  "design": "design and layout recommendations",
  "caseStudies": "case study ideas to include",
  "socialProof": "social proof elements to highlight"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRateCardGenerator(data: { niche?: string; metrics?: any }, userId?: string) {
  const p = `Generate a professional rate card for a content creator's services.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.metrics ? `Channel Metrics: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON:
{
  "rateCard": [{"service": "service type", "price": "price range", "includes": "what is included"}],
  "customization": "rate card customization tips",
  "negotiation": "negotiation flexibility guidelines"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorROICalculator(data: { sponsorPaid?: number; deliverables?: any }, userId?: string) {
  const p = `Calculate ROI for a sponsor's investment in a content creator partnership.
${data.sponsorPaid ? `Sponsor Payment: $${data.sponsorPaid}` : ""}
${data.deliverables ? `Deliverables: ${JSON.stringify(data.deliverables)}` : ""}
Respond as JSON:
{
  "roi": {"views": "estimated views delivered", "clicks": "estimated clicks generated", "conversions": "estimated conversions", "value": "total value delivered"},
  "report": "ROI report summary for sponsor",
  "improvements": "suggestions to improve ROI for future deals"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPassiveIncomeBuilder(data: { niche?: string; skills?: string[] }, userId?: string) {
  const p = `Build passive income streams for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.skills ? `Skills: ${data.skills.join(", ")}` : ""}
Respond as JSON:
{
  "streams": [{"source": "income source", "potential": "monthly earning potential", "setup": "setup requirements", "maintenance": "ongoing maintenance needed"}],
  "timeline": "implementation timeline",
  "priority": "prioritized action plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPricingStrategyAdvisor(data: { product?: string; market?: string }, userId?: string) {
  const p = `Advise on pricing strategy for a content creator's product or service.
${data.product ? `Product/Service: ${data.product}` : ""}
${data.market ? `Target Market: ${data.market}` : ""}
Respond as JSON:
{
  "strategy": "recommended pricing strategy",
  "tiers": "tier-based pricing suggestions",
  "psychology": "pricing psychology tactics",
  "testing": "A/B testing recommendations",
  "competitors": "competitive pricing analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueAttributionAnalyzer(data: { sources?: Record<string, number> }, userId?: string) {
  const p = `Analyze revenue attribution across multiple channels for a content creator.
${data.sources ? `Revenue Sources: ${JSON.stringify(data.sources)}` : ""}
Respond as JSON:
{
  "attribution": [{"source": "revenue source", "revenue": "revenue amount or percentage", "trend": "growth trend"}],
  "crossChannel": "cross-channel attribution insights",
  "optimization": "revenue optimization recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDonationOptimizer(data: { platform?: string; avgDonation?: number }, userId?: string) {
  const p = `Optimize donation and tip revenue for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.avgDonation ? `Average Donation: $${data.avgDonation}` : ""}
Respond as JSON:
{
  "strategies": [{"method": "donation method", "optimization": "optimization tactic"}],
  "goals": "donation goal-setting strategies",
  "recognition": "donor recognition best practices",
  "psychology": "donation psychology insights"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrowdfundingAdvisor(data: { project?: string; goal?: number }, userId?: string) {
  const p = `Advise on crowdfunding strategy for a content creator's project.
${data.project ? `Project: ${data.project}` : ""}
${data.goal ? `Funding Goal: $${data.goal}` : ""}
Respond as JSON:
{
  "strategy": "overall crowdfunding strategy",
  "tiers": "reward tier recommendations",
  "timeline": "campaign timeline and milestones",
  "marketing": "campaign marketing plan",
  "risks": "risk assessment and mitigation",
  "platforms": "recommended crowdfunding platforms"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLicensingAdvisor(data: { contentType?: string; assets?: string[] }, userId?: string) {
  const p = `Advise on content licensing opportunities for a creator.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.assets ? `Available Assets: ${data.assets.join(", ")}` : ""}
Respond as JSON:
{
  "opportunities": [{"asset": "licensable asset", "licensee": "potential licensee type", "revenue": "revenue potential"}],
  "protection": "intellectual property protection recommendations",
  "contracts": "licensing contract essentials"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBookDealAdvisor(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Advise a content creator on pursuing a book deal or self-publishing.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.audience ? `Audience Size/Type: ${data.audience}` : ""}
Respond as JSON:
{
  "assessment": "book deal viability assessment",
  "publishers": "traditional publisher recommendations",
  "selfPublish": "self-publishing strategy",
  "ghostwriter": "ghostwriter considerations",
  "marketing": "book marketing and launch plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSpeakingFeeCalculator(data: { subscribers?: number; niche?: string }, userId?: string) {
  const p = `Calculate speaking fees for a content creator at events and conferences.
${data.subscribers ? `Subscribers: ${data.subscribers}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "fees": {"virtual": "virtual speaking fee range", "inPerson": "in-person speaking fee range", "workshop": "workshop fee range"},
  "negotiation": "fee negotiation strategies",
  "portfolio": "speaking portfolio building tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConsultingPackageBuilder(data: { expertise?: string; niche?: string }, userId?: string) {
  const p = `Build consulting packages for a content creator to monetize their expertise.
${data.expertise ? `Expertise: ${data.expertise}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON:
{
  "packages": [{"name": "package name", "price": "package price", "includes": "what is included", "duration": "engagement duration"}],
  "positioning": "market positioning strategy",
  "sales": "sales and client acquisition tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExpenseTracker(data: { expenses?: Array<{item: string; amount: number; category?: string}> }, userId?: string) {
  const p = `Track and categorize business expenses for a content creator.
${data.expenses ? `Expenses: ${JSON.stringify(data.expenses)}` : ""}
Respond as JSON:
{
  "categorized": "expenses organized by category",
  "totalByCategory": "total spending per category",
  "monthOverMonth": "month-over-month spending trends",
  "savings": "cost-saving opportunities",
  "deductible": "tax-deductible expense identification"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProfitMarginAnalyzer(data: { revenue?: number; expenses?: number }, userId?: string) {
  const p = `Analyze profit margins for a content creator's business.
${data.revenue ? `Monthly Revenue: $${data.revenue}` : ""}
${data.expenses ? `Monthly Expenses: $${data.expenses}` : ""}
Respond as JSON:
{
  "margin": "current profit margin analysis",
  "benchmark": "industry benchmark comparison",
  "improvements": "margin improvement strategies",
  "costCutting": "cost reduction recommendations",
  "revenueGrowth": "revenue growth opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCashFlowForecaster(data: { monthlyIncome?: number; monthlyExpenses?: number }, userId?: string) {
  const p = `Forecast cash flow for a content creator's business.
${data.monthlyIncome ? `Monthly Income: $${data.monthlyIncome}` : ""}
${data.monthlyExpenses ? `Monthly Expenses: $${data.monthlyExpenses}` : ""}
Respond as JSON:
{
  "forecast": [{"month": "month name", "income": "projected income", "expenses": "projected expenses", "net": "net cash flow"}],
  "alerts": "cash flow warning alerts",
  "runway": "financial runway estimate",
  "optimization": "cash flow optimization tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPaymentGatewayAdvisor(data: { volume?: number; international?: boolean }, userId?: string) {
  const p = `Recommend payment gateways for a content creator's business.
${data.volume ? `Monthly Transaction Volume: $${data.volume}` : ""}
${data.international !== undefined ? `International Payments: ${data.international ? "Yes" : "No"}` : ""}
Respond as JSON:
{
  "gateways": [{"name": "gateway name", "fees": "fee structure", "features": "key features", "best": "best use case"}],
  "comparison": "gateway comparison summary",
  "integration": "integration recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriptionBoxBuilder(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Design a subscription box business for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.audience ? `Target Audience: ${data.audience}` : ""}
Respond as JSON:
{
  "concept": "subscription box concept and theme",
  "pricing": "pricing strategy and tiers",
  "contents": "box contents and curation strategy",
  "logistics": "fulfillment and logistics plan",
  "marketing": "marketing and launch strategy",
  "margins": "profit margin analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNFTContentAdvisor(data: { contentType?: string; audience?: string }, userId?: string) {
  const p = `Advise on NFT and digital collectible strategy for a content creator.
${data.contentType ? `Content Type: ${data.contentType}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON:
{
  "strategy": "NFT strategy overview",
  "platforms": "recommended NFT platforms",
  "pricing": "NFT pricing strategy",
  "legal": "legal considerations and compliance",
  "community": "community building around NFTs",
  "risks": "risks and mitigation strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueGoalTracker(data: { monthlyGoal?: number; currentRevenue?: number }, userId?: string) {
  const p = `Track revenue goals and provide strategies to close the gap for a content creator.
${data.monthlyGoal ? `Monthly Revenue Goal: $${data.monthlyGoal}` : ""}
${data.currentRevenue ? `Current Monthly Revenue: $${data.currentRevenue}` : ""}
Respond as JSON:
{
  "progress": "goal progress analysis",
  "gap": "revenue gap breakdown",
  "strategies": "strategies to close the revenue gap",
  "timeline": "projected timeline to reach goal",
  "milestones": "intermediate milestones to track"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommentResponseGenerator(data: { comment?: string; tone?: string }, userId?: string) {
  const p = `Generate thoughtful comment responses for a content creator.
${data.comment ? `Comment to respond to: "${data.comment}"` : ""}
${data.tone ? `Desired tone: ${data.tone}` : ""}
Respond as JSON: { "responses": [{"text": "response text", "tone": "tone used", "engagement": "engagement level"}], "bestResponse": "the best response option", "strategy": "overall response strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperfanIdentifier(data: { comments?: Array<{author: string; count: number}> }, userId?: string) {
  const p = `Identify and analyze superfans from comment data for a content creator.
${data.comments ? `Comment data: ${JSON.stringify(data.comments)}` : ""}
Respond as JSON: { "superfans": [{"name": "fan name", "engagement": "engagement level", "value": "value to community", "nurture": "nurture strategy"}], "strategy": "overall superfan strategy", "rewards": "reward ideas for superfans" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordServerPlanner(data: { channelName?: string; memberCount?: number }, userId?: string) {
  const p = `Plan a Discord server structure for a content creator community.
${data.channelName ? `Channel/Brand name: ${data.channelName}` : ""}
${data.memberCount ? `Expected member count: ${data.memberCount}` : ""}
Respond as JSON: { "structure": [{"channel": "channel name", "purpose": "channel purpose", "rules": "channel rules"}], "bots": "recommended bots", "events": "community events plan", "moderation": "moderation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityEventPlanner(data: { community?: string; platform?: string }, userId?: string) {
  const p = `Plan community events for a content creator.
${data.community ? `Community: ${data.community}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "events": [{"name": "event name", "type": "event type", "schedule": "schedule details", "format": "event format"}], "promotion": "promotion strategy", "engagement": "engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPollCreator(data: { topic?: string; platform?: string }, userId?: string) {
  const p = `Create engaging polls for a content creator's audience.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "polls": [{"question": "poll question", "options": "poll options", "timing": "best timing to post"}], "engagement": "engagement strategy", "followUp": "follow-up content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContestRunner(data: { prize?: string; niche?: string }, userId?: string) {
  const p = `Plan and structure a contest or giveaway for a content creator.
${data.prize ? `Prize: ${data.prize}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "contests": [{"name": "contest name", "rules": "contest rules", "prizes": "prize details", "duration": "contest duration"}], "legal": "legal considerations", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityGuidelinesWriter(data: { platform?: string; values?: string[] }, userId?: string) {
  const p = `Write community guidelines for a content creator's community.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.values ? `Core values: ${data.values.join(", ")}` : ""}
Respond as JSON: { "guidelines": "full community guidelines text", "enforcement": "enforcement policy", "appeals": "appeals process", "examples": "examples of acceptable and unacceptable behavior" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiModeratorTrainer(data: { communitySize?: number; issues?: string[] }, userId?: string) {
  const p = `Create a moderator training program for a content creator's community.
${data.communitySize ? `Community size: ${data.communitySize}` : ""}
${data.issues ? `Common issues: ${data.issues.join(", ")}` : ""}
Respond as JSON: { "training": [{"topic": "training topic", "guidelines": "specific guidelines", "scenarios": "example scenarios"}], "tools": "recommended moderation tools", "escalation": "escalation procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAMAPlanner(data: { topic?: string; audience?: string }, userId?: string) {
  const p = `Plan an AMA (Ask Me Anything) session for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.audience ? `Target audience: ${data.audience}` : ""}
Respond as JSON: { "plan": {"prep": "preparation steps", "format": "AMA format", "questions": "anticipated questions and answers", "followUp": "follow-up actions"}, "promotion": "promotion strategy", "platform": "recommended platform" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLoyaltyProgramBuilder(data: { platform?: string; rewards?: string[] }, userId?: string) {
  const p = `Build a loyalty program for a content creator's community.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.rewards ? `Available rewards: ${data.rewards.join(", ")}` : ""}
Respond as JSON: { "tiers": [{"name": "tier name", "requirements": "tier requirements", "rewards": "tier rewards"}], "points": "points system design", "engagement": "engagement mechanics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUserGeneratedContentStrategy(data: { niche?: string; community?: string }, userId?: string) {
  const p = `Create a user-generated content strategy for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.community ? `Community: ${data.community}` : ""}
Respond as JSON: { "strategy": [{"type": "UGC type", "incentive": "incentive for creation", "curation": "curation process"}], "legal": "legal considerations for UGC", "showcase": "how to showcase UGC" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityHealthScorer(data: { metrics?: any }, userId?: string) {
  const p = `Score and analyze the health of a content creator's community.
${data.metrics ? `Community metrics: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON: { "score": "overall health score 0-100", "indicators": [{"metric": "metric name", "health": "health status"}], "improvements": "suggested improvements", "alerts": "any urgent alerts" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFanArtCurator(data: { channelName?: string }, userId?: string) {
  const p = `Create a fan art curation strategy for a content creator.
${data.channelName ? `Channel name: ${data.channelName}` : ""}
Respond as JSON: { "strategy": "fan art curation strategy", "showcase": "how to showcase fan art", "guidelines": "submission guidelines", "credit": "crediting policy", "monetization": "monetization considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMilestoneEventPlanner(data: { milestone?: string; audience?: string }, userId?: string) {
  const p = `Plan a milestone celebration event for a content creator.
${data.milestone ? `Milestone: ${data.milestone}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON: { "event": {"type": "event type", "content": "content plan", "celebration": "celebration details"}, "promotion": "promotion strategy", "memorabilia": "memorabilia ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDMResponseTemplates(data: { commonQuestions?: string[] }, userId?: string) {
  const p = `Create DM response templates for a content creator.
${data.commonQuestions ? `Common questions received: ${data.commonQuestions.join(", ")}` : ""}
Respond as JSON: { "templates": [{"question": "common question", "response": "template response", "followUp": "follow-up message"}], "automation": "automation recommendations", "personalization": "personalization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHashtagCommunityBuilder(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Build a hashtag-based community strategy for a content creator.
${data.channelName ? `Channel name: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "hashtag": "primary branded hashtag", "campaign": "hashtag campaign strategy", "challenges": "hashtag challenge ideas", "tracking": "tracking and measurement plan", "growth": "growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLiveQAManager(data: { topic?: string; expectedQuestions?: string[] }, userId?: string) {
  const p = `Prepare for a live Q&A session for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.expectedQuestions ? `Expected questions: ${data.expectedQuestions.join(", ")}` : ""}
Respond as JSON: { "prep": [{"question": "anticipated question", "answer": "prepared answer", "talking": "talking points"}], "moderation": "moderation plan", "followUp": "post-session follow-up" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReferralProgramBuilder(data: { platform?: string; incentive?: string }, userId?: string) {
  const p = `Build a referral program for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.incentive ? `Incentive type: ${data.incentive}` : ""}
Respond as JSON: { "program": {"structure": "program structure", "rewards": "reward tiers", "tracking": "tracking mechanism"}, "promotion": "promotion strategy", "analytics": "analytics and KPIs" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityAmbassadorProgram(data: { community?: string; goals?: string[] }, userId?: string) {
  const p = `Design a community ambassador program for a content creator.
${data.community ? `Community: ${data.community}` : ""}
${data.goals ? `Program goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "program": {"roles": "ambassador roles and responsibilities", "requirements": "selection requirements", "perks": "ambassador perks"}, "recruitment": "recruitment strategy", "management": "program management plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEngagementBoostStrategy(data: { currentEngagement?: number; platform?: string }, userId?: string) {
  const p = `Create an engagement boost strategy for a content creator.
${data.currentEngagement ? `Current engagement rate: ${data.currentEngagement}%` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "strategies": [{"tactic": "engagement tactic", "implementation": "how to implement", "impact": "expected impact"}], "timeline": "implementation timeline", "metrics": "metrics to track" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHiringAdvisor(data: { role?: string; budget?: number }, userId?: string) {
  const p = `Advise on hiring for a content creator's team.
${data.role ? `Role needed: ${data.role}` : ""}
${data.budget ? `Budget: $${data.budget}` : ""}
Respond as JSON: { "roles": [{"title": "role title", "skills": "required skills", "rate": "expected rate", "where": "where to find candidates"}], "interview": "interview process", "onboarding": "onboarding plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFreelancerFinder(data: { skill?: string; budget?: string }, userId?: string) {
  const p = `Find and vet freelancers for a content creator.
${data.skill ? `Skill needed: ${data.skill}` : ""}
${data.budget ? `Budget: ${data.budget}` : ""}
Respond as JSON: { "platforms": [{"name": "platform name", "skill": "skill match", "avgRate": "average rate"}], "vetting": "vetting process", "contracts": "contract recommendations", "management": "freelancer management tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSOPBuilder(data: { process?: string; team?: string[] }, userId?: string) {
  const p = `Build a Standard Operating Procedure for a content creator's workflow.
${data.process ? `Process: ${data.process}` : ""}
${data.team ? `Team members: ${data.team.join(", ")}` : ""}
Respond as JSON: { "sop": [{"step": "step description", "owner": "responsible person", "tools": "tools needed", "time": "estimated time"}], "documentation": "documentation format", "updates": "update schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProjectTimeline(data: { project?: string; deadline?: string }, userId?: string) {
  const p = `Create a project timeline for a content creator's project.
${data.project ? `Project: ${data.project}` : ""}
${data.deadline ? `Deadline: ${data.deadline}` : ""}
Respond as JSON: { "timeline": [{"phase": "phase name", "tasks": "tasks in this phase", "duration": "phase duration", "dependencies": "dependencies"}], "risks": "risk assessment", "milestones": "key milestones" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentApprovalFlow(data: { teamSize?: number; contentTypes?: string[] }, userId?: string) {
  const p = `Design a content approval workflow for a content creator's team.
${data.teamSize ? `Team size: ${data.teamSize}` : ""}
${data.contentTypes ? `Content types: ${data.contentTypes.join(", ")}` : ""}
Respond as JSON: { "flow": [{"stage": "approval stage", "reviewer": "who reviews", "criteria": "approval criteria"}], "tools": "recommended tools", "turnaround": "expected turnaround times" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditingChecklistBuilder(data: { videoType?: string; style?: string }, userId?: string) {
  const p = `Build a video editing checklist for a content creator.
${data.videoType ? `Video type: ${data.videoType}` : ""}
${data.style ? `Editing style: ${data.style}` : ""}
Respond as JSON: { "checklist": [{"category": "checklist category", "items": "checklist items"}], "quality": "quality standards", "standards": "technical standards" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductionBudgetPlanner(data: { contentType?: string; frequency?: string }, userId?: string) {
  const p = `Plan a production budget for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.frequency ? `Production frequency: ${data.frequency}` : ""}
Respond as JSON: { "budget": [{"category": "budget category", "monthly": "monthly cost", "yearly": "yearly cost"}], "savings": "cost-saving tips", "ROI": "expected ROI analysis" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEquipmentRecommender(data: { budget?: number; contentType?: string }, userId?: string) {
  const p = `Recommend equipment for a content creator.
${data.budget ? `Budget: $${data.budget}` : ""}
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "equipment": [{"item": "equipment type", "model": "recommended model", "price": "price estimate", "priority": "purchase priority"}], "upgradePath": "future upgrade recommendations", "alternatives": "budget-friendly alternatives" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStudioSetupPlanner(data: { space?: string; budget?: number }, userId?: string) {
  const p = `Plan a studio setup for a content creator.
${data.space ? `Available space: ${data.space}` : ""}
${data.budget ? `Budget: $${data.budget}` : ""}
Respond as JSON: { "layout": "studio layout plan", "equipment": [{"item": "equipment item", "placement": "where to place it", "cost": "estimated cost"}], "acoustic": "acoustic treatment plan", "lighting": "lighting setup plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkflowOptimizer(data: { currentSteps?: string[]; bottlenecks?: string[] }, userId?: string) {
  const p = `Optimize the content creation workflow for a creator.
${data.currentSteps ? `Current workflow steps: ${data.currentSteps.join(", ")}` : ""}
${data.bottlenecks ? `Known bottlenecks: ${data.bottlenecks.join(", ")}` : ""}
Respond as JSON: { "optimized": [{"step": "workflow step", "improvement": "suggested improvement", "timeSaved": "time saved"}], "tools": "recommended tools", "automation": "automation opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBatchRecordingScheduler(data: { frequency?: string; videos?: number }, userId?: string) {
  const p = `Create a batch recording schedule for a content creator.
${data.frequency ? `Upload frequency: ${data.frequency}` : ""}
${data.videos ? `Videos per batch: ${data.videos}` : ""}
Respond as JSON: { "schedule": [{"day": "recording day", "videos": "number of videos", "setup": "setup requirements", "props": "props needed"}], "efficiency": "efficiency tips", "tips": "batch recording best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOutsourcingAdvisor(data: { tasks?: string[]; budget?: number }, userId?: string) {
  const p = `Advise on outsourcing tasks for a content creator.
${data.tasks ? `Tasks to consider: ${data.tasks.join(", ")}` : ""}
${data.budget ? `Budget: $${data.budget}` : ""}
Respond as JSON: { "outsource": [{"task": "task name", "provider": "recommended provider type", "cost": "estimated cost", "quality": "quality expectations"}], "keep": "tasks to keep in-house", "platforms": "recommended outsourcing platforms" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiToolStackOptimizer(data: { currentTools?: string[]; budget?: number }, userId?: string) {
  const p = `Optimize the tool stack for a content creator.
${data.currentTools ? `Current tools: ${data.currentTools.join(", ")}` : ""}
${data.budget ? `Monthly budget: $${data.budget}` : ""}
Respond as JSON: { "optimized": [{"tool": "recommended tool", "replaces": "what it replaces", "savings": "cost savings", "features": "key features"}], "total": "total monthly cost", "recommendations": "additional recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandVoiceCreator(data: { personality?: string; values?: string[] }, userId?: string) {
  const p = `Create a brand voice guide for a content creator.
${data.personality ? `Brand personality: ${data.personality}` : ""}
${data.values ? `Core values: ${data.values.join(", ")}` : ""}
Respond as JSON: { "voice": {"tone": "brand tone description", "vocabulary": "vocabulary guidelines", "personality": "personality traits"}, "guidelines": "usage guidelines", "examples": "example content in brand voice", "doNots": "things to avoid" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandColorPalette(data: { industry?: string; mood?: string }, userId?: string) {
  const p = `Create a brand color palette for a content creator.
${data.industry ? `Industry: ${data.industry}` : ""}
${data.mood ? `Desired mood: ${data.mood}` : ""}
Respond as JSON: { "palette": [{"name": "color name", "hex": "hex code", "usage": "where to use this color"}], "accessibility": "accessibility considerations", "darkMode": "dark mode color adjustments", "lightMode": "light mode color adjustments" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandFontSelector(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Select brand fonts for a content creator.
${data.style ? `Brand style: ${data.style}` : ""}
${data.platform ? `Primary platform: ${data.platform}` : ""}
Respond as JSON: { "fonts": [{"name": "font name", "usage": "where to use", "pairing": "font pairing suggestion", "weight": "recommended weights"}], "hierarchy": "typographic hierarchy", "licensing": "licensing information" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandStoryWriter(data: { channelName?: string; origin?: string }, userId?: string) {
  const p = `Write a compelling brand story for a content creator.
${data.channelName ? `Channel name: ${data.channelName}` : ""}
${data.origin ? `Origin story: ${data.origin}` : ""}
Respond as JSON: { "story": {"hook": "attention-grabbing opening", "journey": "the creator journey", "mission": "brand mission", "vision": "brand vision"}, "platforms": "platform-specific versions", "variations": "short and long versions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandConsistencyAuditor(data: { platforms?: string[] }, userId?: string) {
  const p = `Audit brand consistency across platforms for a content creator.
${data.platforms ? `Platforms to audit: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "audit": [{"platform": "platform name", "consistency": "consistency score", "issues": "identified issues"}], "score": "overall consistency score", "fixes": "recommended fixes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPillarRefiner(data: { pillars?: string[]; performance?: any }, userId?: string) {
  const p = `Refine content pillars based on performance data for a content creator.
${data.pillars ? `Current pillars: ${data.pillars.join(", ")}` : ""}
${data.performance ? `Performance data: ${JSON.stringify(data.performance)}` : ""}
Respond as JSON: { "refined": [{"pillar": "pillar name", "adjustment": "recommended adjustment", "reasoning": "reasoning for change"}], "newPillars": "suggested new pillars", "retire": "pillars to consider retiring" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelTrailerBuilder(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Create a channel trailer script for a content creator.
${data.channelName ? `Channel name: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "script": "full trailer script", "duration": "recommended duration", "structure": "trailer structure breakdown", "cta": "call to action", "style": "visual style recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelArtDirector(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Provide art direction for a content creator's channel branding.
${data.channelName ? `Channel name: ${data.channelName}` : ""}
${data.style ? `Preferred style: ${data.style}` : ""}
Respond as JSON: { "direction": {"banner": "banner design direction", "logo": "logo design direction", "thumbnails": "thumbnail style guide", "colors": "color scheme"}, "consistency": "consistency guidelines", "refresh": "brand refresh schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUniqueSellingPointFinder(data: { niche?: string; competitors?: string[] }, userId?: string) {
  const p = `Identify unique selling points for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON: { "usp": [{"angle": "unique angle", "strength": "strength level", "positioning": "market positioning"}], "differentiation": "differentiation strategy", "messaging": "key messaging" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTargetAudienceDefiner(data: { niche?: string; content?: string[] }, userId?: string) {
  const p = `Define target audience personas for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.content ? `Content types: ${data.content.join(", ")}` : ""}
Respond as JSON: { "personas": [{"name": "persona name", "demographics": "demographic details", "interests": "interests and hobbies", "painPoints": "pain points and needs"}], "content": "content strategy per persona", "messaging": "messaging guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandPartnershipMatcher(data: { values?: string[]; niche?: string }, userId?: string) {
  const p = `Match brand partnership opportunities for a content creator.
${data.values ? `Brand values: ${data.values.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "partners": [{"brand": "brand name or type", "alignment": "value alignment score", "opportunity": "partnership opportunity"}], "approach": "outreach approach", "criteria": "partnership evaluation criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisCommsPlanner(data: { scenario?: string }, userId?: string) {
  const p = `Create a crisis communications plan for a content creator.
${data.scenario ? `Scenario: ${data.scenario}` : ""}
Respond as JSON: { "plan": {"response": "initial response strategy", "timeline": "response timeline", "channels": "communication channels", "messaging": "key messages"}, "prevention": "prevention strategies", "templates": "response templates" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalBrandAudit(data: { platforms?: string[]; channelName?: string }, userId?: string) {
  const p = `Conduct a personal brand audit for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.channelName ? `Channel name: ${data.channelName}` : ""}
Respond as JSON: { "audit": [{"area": "audit area", "score": "score out of 100", "improvement": "improvement suggestions"}], "overall": "overall brand score", "priorities": "top priorities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandEvolutionPlanner(data: { currentBrand?: string; goals?: string[] }, userId?: string) {
  const p = `Plan brand evolution for a content creator.
${data.currentBrand ? `Current brand description: ${data.currentBrand}` : ""}
${data.goals ? `Evolution goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "evolution": [{"phase": "evolution phase", "changes": "planned changes", "timeline": "phase timeline"}], "risks": "risks and mitigation", "communication": "how to communicate changes to audience" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorDifferentiator(data: { competitors?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze competitors and find differentiation opportunities for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "gaps": [{"area": "competitive area", "yours": "your position", "theirs": "their position", "opportunity": "opportunity to differentiate"}], "strategy": "differentiation strategy", "positioning": "market positioning" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollaborationBriefWriter(data: { partner?: string; concept?: string }, userId?: string) {
  const p = `Write a collaboration brief for a content creator partnership.
${data.partner ? `Partner: ${data.partner}` : ""}
${data.concept ? `Concept: ${data.concept}` : ""}
Respond as JSON: { "brief": {"objectives": "collaboration objectives", "deliverables": "expected deliverables", "timeline": "project timeline", "terms": "suggested terms"}, "template": "reusable brief template" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkingEventPrep(data: { event?: string; goals?: string[] }, userId?: string) {
  const p = `Prepare for a networking event as a content creator.
${data.event ? `Event: ${data.event}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "prep": {"elevator": "elevator pitch", "cards": "business card tips", "goals": "networking goals", "followUp": "follow-up strategy"}, "talking": "talking points", "contacts": "types of contacts to target" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMentorshipFinder(data: { goals?: string[]; niche?: string }, userId?: string) {
  const p = `Find mentorship opportunities for a content creator.
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "mentors": [{"type": "mentor type", "where": "where to find them", "approach": "how to approach"}], "program": "mentorship program structure", "reciprocity": "what to offer in return" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDelegationAdvisor(data: { tasks?: string[]; teamSize?: number }, userId?: string) {
  const p = `Advise on task delegation for a content creator's team.
${data.tasks ? `Tasks to delegate: ${data.tasks.join(", ")}` : ""}
${data.teamSize ? `Team size: ${data.teamSize}` : ""}
Respond as JSON: { "delegation": [{"task": "task name", "delegateTo": "who to delegate to", "priority": "delegation priority"}], "keep": "tasks to keep yourself", "systemize": "tasks to systemize" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeManagementCoach(data: { schedule?: string; tasks?: string[] }, userId?: string) {
  const p = `Coach a content creator on time management.
${data.schedule ? `Current schedule: ${data.schedule}` : ""}
${data.tasks ? `Tasks: ${data.tasks.join(", ")}` : ""}
Respond as JSON: { "optimized": [{"block": "time block", "activity": "planned activity", "duration": "duration"}], "tips": "productivity tips", "boundaries": "boundary-setting advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorMastermindPlanner(data: { niche?: string; level?: string }, userId?: string) {
  const p = `Plan a creator mastermind group for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.level ? `Creator level: ${data.level}` : ""}
Respond as JSON: { "mastermind": {"structure": "group structure", "frequency": "meeting frequency", "topics": "discussion topics", "members": "ideal member profiles"}, "format": "meeting format", "rules": "group rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductivityTracker(data: { tasksCompleted?: number; hoursWorked?: number }, userId?: string) {
  const p = `Track and analyze productivity for a content creator.
${data.tasksCompleted ? `Tasks completed: ${data.tasksCompleted}` : ""}
${data.hoursWorked ? `Hours worked: ${data.hoursWorked}` : ""}
Respond as JSON: { "score": "productivity score 0-100", "efficiency": "efficiency analysis", "recommendations": "improvement recommendations", "burnoutRisk": "burnout risk assessment", "balance": "work-life balance tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCopyrightChecker(data: { content?: string; type?: string }, userId?: string) {
  const p = `Check content for copyright risks.
${data.content ? `Content: ${data.content}` : ""}
${data.type ? `Content type: ${data.type}` : ""}
Respond as JSON: { "risks": [{"issue": "copyright issue", "severity": "severity level", "solution": "recommended solution"}], "safetyScore": "safety score 0-100", "alternatives": "safe alternatives" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFairUseAnalyzer(data: { usage?: string; original?: string }, userId?: string) {
  const p = `Analyze fair use for content usage.
${data.usage ? `Usage description: ${data.usage}` : ""}
${data.original ? `Original work: ${data.original}` : ""}
Respond as JSON: { "analysis": {"transformative": "transformative factor analysis", "commercial": "commercial nature analysis", "amount": "amount used analysis", "effect": "market effect analysis"}, "conclusion": "fair use conclusion", "risks": "risk assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicLicenseAdvisor(data: { useCase?: string; platform?: string }, userId?: string) {
  const p = `Advise on music licensing for content creators.
${data.useCase ? `Use case: ${data.useCase}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "licenses": [{"type": "license type", "provider": "license provider", "cost": "estimated cost", "rights": "rights included"}], "freeSources": "free music sources", "alternatives": "alternative options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrivacyPolicyGenerator(data: { platforms?: string[]; dataCollected?: string[] }, userId?: string) {
  const p = `Generate a privacy policy for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.dataCollected ? `Data collected: ${data.dataCollected.join(", ")}` : ""}
Respond as JSON: { "policy": "privacy policy summary", "sections": [{"title": "section title", "content": "section content"}], "compliance": "compliance notes", "updates": "recommended update schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTermsOfServiceWriter(data: { services?: string[]; platforms?: string[] }, userId?: string) {
  const p = `Write terms of service for a content creator.
${data.services ? `Services offered: ${data.services.join(", ")}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "terms": "terms of service summary", "sections": [{"title": "section title", "content": "section content"}], "enforcement": "enforcement guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFTCComplianceChecker(data: { contentType?: string; sponsorships?: boolean }, userId?: string) {
  const p = `Check FTC compliance for content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.sponsorships !== undefined ? `Has sponsorships: ${data.sponsorships}` : ""}
Respond as JSON: { "compliant": "compliance status", "issues": [{"rule": "FTC rule", "violation": "potential violation", "fix": "how to fix"}], "disclosures": "required disclosures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCOPPAAdvisor(data: { targetAudience?: string }, userId?: string) {
  const p = `Advise on COPPA compliance for content creator.
${data.targetAudience ? `Target audience: ${data.targetAudience}` : ""}
Respond as JSON: { "applicable": "whether COPPA applies", "requirements": [{"rule": "COPPA rule", "implementation": "how to implement"}], "risks": "risk assessment", "alternatives": "alternative approaches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGDPRComplianceChecker(data: { dataProcessing?: string[] }, userId?: string) {
  const p = `Check GDPR compliance for content creator.
${data.dataProcessing ? `Data processing activities: ${data.dataProcessing.join(", ")}` : ""}
Respond as JSON: { "compliant": "compliance status", "gaps": [{"requirement": "GDPR requirement", "status": "current status", "action": "required action"}], "dpa": "data processing agreement notes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentIDManager(data: { platform?: string; claims?: number }, userId?: string) {
  const p = `Manage Content ID claims for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.claims ? `Number of claims: ${data.claims}` : ""}
Respond as JSON: { "management": [{"claimType": "type of claim", "response": "recommended response", "prevention": "prevention strategy"}], "strategy": "overall management strategy", "appeals": "appeal process guidance" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDisputeResolutionAdvisor(data: { disputeType?: string }, userId?: string) {
  const p = `Advise on dispute resolution for content creator.
${data.disputeType ? `Dispute type: ${data.disputeType}` : ""}
Respond as JSON: { "steps": [{"step": "resolution step", "timeline": "expected timeline", "action": "specific action"}], "escalation": "escalation path", "documentation": "documentation needed" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrademarkAdvisor(data: { brandName?: string; niche?: string }, userId?: string) {
  const p = `Advise on trademark protection for a content creator brand.
${data.brandName ? `Brand name: ${data.brandName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "availability": "trademark availability assessment", "risks": "potential risks", "registration": "registration process", "protection": "protection strategy", "costs": "estimated costs" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContractTemplateBuilder(data: { contractType?: string; parties?: string[] }, userId?: string) {
  const p = `Build a contract template for a content creator.
${data.contractType ? `Contract type: ${data.contractType}` : ""}
${data.parties ? `Parties involved: ${data.parties.join(", ")}` : ""}
Respond as JSON: { "template": "contract template overview", "clauses": [{"title": "clause title", "content": "clause content", "importance": "importance level"}], "negotiation": "negotiation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInsuranceAdvisor(data: { contentType?: string; revenue?: number }, userId?: string) {
  const p = `Advise on insurance for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.revenue ? `Annual revenue: $${data.revenue}` : ""}
Respond as JSON: { "recommended": [{"type": "insurance type", "coverage": "coverage details", "cost": "estimated cost"}], "risks": "uninsured risks", "providers": "recommended providers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBusinessEntityAdvisor(data: { revenue?: number; state?: string }, userId?: string) {
  const p = `Advise on business entity structure for a content creator.
${data.revenue ? `Annual revenue: $${data.revenue}` : ""}
${data.state ? `State: ${data.state}` : ""}
Respond as JSON: { "recommended": "recommended entity type", "comparison": [{"type": "entity type", "pros": "advantages", "cons": "disadvantages", "tax": "tax implications"}], "steps": "formation steps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIntellectualPropertyProtector(data: { assets?: string[] }, userId?: string) {
  const p = `Protect intellectual property for a content creator.
${data.assets ? `Assets to protect: ${data.assets.join(", ")}` : ""}
Respond as JSON: { "protection": [{"asset": "asset name", "method": "protection method", "cost": "estimated cost", "timeline": "timeline"}], "priority": "priority order", "enforcement": "enforcement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBurnoutRiskAssessor(data: { hoursPerWeek?: number; contentFrequency?: string }, userId?: string) {
  const p = `Assess burnout risk for a content creator.
${data.hoursPerWeek ? `Hours per week: ${data.hoursPerWeek}` : ""}
${data.contentFrequency ? `Content frequency: ${data.contentFrequency}` : ""}
Respond as JSON: { "riskLevel": "burnout risk level", "factors": [{"factor": "risk factor", "score": "factor score"}], "prevention": "prevention strategies", "recovery": "recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeditationGuide(data: { stressLevel?: string; duration?: string }, userId?: string) {
  const p = `Guide meditation for a content creator.
${data.stressLevel ? `Stress level: ${data.stressLevel}` : ""}
${data.duration ? `Available duration: ${data.duration}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "duration": "duration", "technique": "technique description"}], "schedule": "recommended schedule", "benefits": "expected benefits" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkLifeBalancer(data: { workHours?: number; personalGoals?: string[] }, userId?: string) {
  const p = `Balance work and life for a content creator.
${data.workHours ? `Work hours per week: ${data.workHours}` : ""}
${data.personalGoals ? `Personal goals: ${data.personalGoals.join(", ")}` : ""}
Respond as JSON: { "assessment": "current balance assessment", "adjustments": [{"area": "life area", "change": "recommended change", "benefit": "expected benefit"}], "boundaries": "boundary recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorMentalHealthMonitor(data: { mood?: string; stressors?: string[] }, userId?: string) {
  const p = `Monitor mental health for a content creator.
${data.mood ? `Current mood: ${data.mood}` : ""}
${data.stressors ? `Stressors: ${data.stressors.join(", ")}` : ""}
Respond as JSON: { "assessment": "mental health assessment", "resources": [{"type": "resource type", "resource": "resource name", "access": "how to access"}], "coping": "coping strategies", "professional": "when to seek professional help" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSleepOptimizer(data: { schedule?: string; issues?: string[] }, userId?: string) {
  const p = `Optimize sleep for a content creator.
${data.schedule ? `Current schedule: ${data.schedule}` : ""}
${data.issues ? `Sleep issues: ${data.issues.join(", ")}` : ""}
Respond as JSON: { "recommendations": [{"change": "recommended change", "impact": "expected impact", "implementation": "how to implement"}], "routine": "bedtime routine", "environment": "sleep environment tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExerciseForCreators(data: { sedentaryHours?: number; issues?: string[] }, userId?: string) {
  const p = `Recommend exercises for a content creator.
${data.sedentaryHours ? `Sedentary hours per day: ${data.sedentaryHours}` : ""}
${data.issues ? `Physical issues: ${data.issues.join(", ")}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "duration": "duration", "benefit": "health benefit", "deskFriendly": "whether desk-friendly"}], "schedule": "exercise schedule", "ergonomics": "ergonomic tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEyeStrainPreventer(data: { screenHours?: number }, userId?: string) {
  const p = `Prevent eye strain for a content creator.
${data.screenHours ? `Screen hours per day: ${data.screenHours}` : ""}
Respond as JSON: { "tips": [{"tip": "prevention tip", "frequency": "how often", "benefit": "expected benefit"}], "settings": "display settings recommendations", "equipment": "recommended equipment", "breaks": "break schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceCareAdvisor(data: { speakingHours?: number; issues?: string[] }, userId?: string) {
  const p = `Advise on voice care for a content creator.
${data.speakingHours ? `Speaking hours per day: ${data.speakingHours}` : ""}
${data.issues ? `Voice issues: ${data.issues.join(", ")}` : ""}
Respond as JSON: { "care": [{"tip": "voice care tip", "importance": "importance level", "technique": "technique description"}], "warmups": "vocal warmup exercises", "prevention": "prevention strategies", "recovery": "recovery tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStressManagementCoach(data: { triggers?: string[]; level?: string }, userId?: string) {
  const p = `Coach stress management for a content creator.
${data.triggers ? `Stress triggers: ${data.triggers.join(", ")}` : ""}
${data.level ? `Stress level: ${data.level}` : ""}
Respond as JSON: { "strategies": [{"technique": "stress technique", "when": "when to use", "duration": "duration needed"}], "emergency": "emergency stress relief", "longTerm": "long-term management plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorBreakScheduler(data: { contentSchedule?: string; lastBreak?: string }, userId?: string) {
  const p = `Schedule breaks for a content creator.
${data.contentSchedule ? `Content schedule: ${data.contentSchedule}` : ""}
${data.lastBreak ? `Last break taken: ${data.lastBreak}` : ""}
Respond as JSON: { "nextBreak": "recommended next break", "schedule": [{"break": "break type", "duration": "duration", "timing": "when to take"}], "content": "content prep for breaks", "coverage": "coverage plan during breaks" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeAPIIntegrator(data: { features?: string[] }, userId?: string) {
  const p = `Guide YouTube API integration for a content creator.
${data.features ? `Desired features: ${data.features.join(", ")}` : ""}
Respond as JSON: { "endpoints": [{"api": "API endpoint", "purpose": "purpose", "implementation": "implementation guide"}], "authentication": "auth setup guide", "limits": "rate limits and quotas", "bestPractices": "best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchIntegrator(data: { features?: string[] }, userId?: string) {
  const p = `Guide Twitch integration for a content creator.
${data.features ? `Desired features: ${data.features.join(", ")}` : ""}
Respond as JSON: { "integration": [{"feature": "feature name", "api": "API to use", "implementation": "implementation guide"}], "authentication": "auth setup", "webhooks": "webhook configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordBotBuilder(data: { features?: string[] }, userId?: string) {
  const p = `Build a Discord bot for a content creator community.
${data.features ? `Desired features: ${data.features.join(", ")}` : ""}
Respond as JSON: { "bot": {"commands": "bot commands list", "events": "event handlers", "permissions": "required permissions"}, "hosting": "hosting recommendations", "deployment": "deployment guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleAnalyticsSetup(data: { platform?: string }, userId?: string) {
  const p = `Set up Google Analytics for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration details"}], "tracking": "tracking recommendations", "reports": "key reports to monitor", "goals": "goal configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialMediaScheduler(data: { platforms?: string[]; frequency?: string }, userId?: string) {
  const p = `Create a social media schedule for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.frequency ? `Posting frequency: ${data.frequency}` : ""}
Respond as JSON: { "schedule": [{"platform": "platform name", "times": "optimal posting times", "content": "content type"}], "tools": "scheduling tools", "automation": "automation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailMarketingSetup(data: { platform?: string; listSize?: number }, userId?: string) {
  const p = `Set up email marketing for a content creator.
${data.platform ? `Email platform: ${data.platform}` : ""}
${data.listSize ? `List size: ${data.listSize}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration"}], "sequences": "email sequence recommendations", "templates": "template suggestions", "segmentation": "audience segmentation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastIntegrator(data: { format?: string; frequency?: string }, userId?: string) {
  const p = `Set up podcast integration for a content creator.
${data.format ? `Podcast format: ${data.format}` : ""}
${data.frequency ? `Release frequency: ${data.frequency}` : ""}
Respond as JSON: { "setup": [{"platform": "platform name", "config": "configuration"}], "distribution": "distribution strategy", "monetization": "monetization options", "crossPromo": "cross-promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWebhookManager(data: { services?: string[] }, userId?: string) {
  const p = `Manage webhooks for a content creator's services.
${data.services ? `Services: ${data.services.join(", ")}` : ""}
Respond as JSON: { "webhooks": [{"service": "service name", "events": "events to listen for", "handler": "handler implementation"}], "security": "security best practices", "monitoring": "monitoring strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAPIRateLimitManager(data: { apis?: string[] }, userId?: string) {
  const p = `Manage API rate limits for a content creator.
${data.apis ? `APIs used: ${data.apis.join(", ")}` : ""}
Respond as JSON: { "limits": [{"api": "API name", "rate": "rate limit details", "optimization": "optimization strategy"}], "caching": "caching recommendations", "queueing": "request queueing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataBackupPlanner(data: { platforms?: string[]; dataTypes?: string[] }, userId?: string) {
  const p = `Plan data backup for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.dataTypes ? `Data types: ${data.dataTypes.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"data": "data type", "frequency": "backup frequency", "method": "backup method", "storage": "storage location"}], "automation": "automation setup", "recovery": "recovery procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNotificationOptimizer(data: { channels?: string[]; volume?: string }, userId?: string) {
  const p = `Optimize notifications for a content creator.
${data.channels ? `Notification channels: ${data.channels.join(", ")}` : ""}
${data.volume ? `Current volume: ${data.volume}` : ""}
Respond as JSON: { "optimized": [{"channel": "channel name", "frequency": "optimized frequency", "priority": "priority level"}], "filtering": "filtering rules", "batching": "batching strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPostAutomator(data: { platforms?: string[]; contentTypes?: string[] }, userId?: string) {
  const p = `Automate cross-posting for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.contentTypes ? `Content types: ${data.contentTypes.join(", ")}` : ""}
Respond as JSON: { "automation": [{"from": "source platform", "to": "target platform", "adaptation": "content adaptation needed", "timing": "posting timing"}], "tools": "automation tools", "limitations": "platform limitations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkTreeOptimizer(data: { links?: string[]; goals?: string[] }, userId?: string) {
  const p = `Optimize link tree for a content creator.
${data.links ? `Current links: ${data.links.join(", ")}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "optimized": [{"link": "link URL or label", "placement": "optimal placement", "cta": "call to action"}], "design": "design recommendations", "analytics": "analytics setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQRCodeGenerator(data: { destinations?: string[] }, userId?: string) {
  const p = `Generate QR code strategy for a content creator.
${data.destinations ? `Destinations: ${data.destinations.join(", ")}` : ""}
Respond as JSON: { "codes": [{"destination": "destination URL", "design": "design recommendations", "placement": "where to place", "tracking": "tracking setup"}], "analytics": "analytics strategy", "bestPractices": "QR code best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChatbotIntegrator(data: { platform?: string; purpose?: string }, userId?: string) {
  const p = `Integrate a chatbot for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.purpose ? `Purpose: ${data.purpose}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration"}], "responses": "response templates", "training": "chatbot training guide", "escalation": "escalation to human process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnalyticsDashboardBuilder(data: { metrics?: string[]; sources?: string[] }, userId?: string) {
  const p = `Build an analytics dashboard for a content creator.
${data.metrics ? `Key metrics: ${data.metrics.join(", ")}` : ""}
${data.sources ? `Data sources: ${data.sources.join(", ")}` : ""}
Respond as JSON: { "dashboard": [{"widget": "widget type", "metric": "metric displayed", "source": "data source"}], "layout": "dashboard layout", "refresh": "refresh intervals", "alerts": "alert configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentDeliveryOptimizer(data: { platforms?: string[]; fileTypes?: string[] }, userId?: string) {
  const p = `Optimize content delivery for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.fileTypes ? `File types: ${data.fileTypes.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"platform": "platform name", "settings": "optimal settings", "quality": "quality recommendations"}], "CDN": "CDN recommendations", "compression": "compression strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccessibilityAuditor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Audit accessibility for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "audit": [{"criterion": "accessibility criterion", "status": "pass or fail", "fix": "how to fix"}], "score": "accessibility score", "wcag": "WCAG compliance level", "priorities": "priority fixes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiDeviceTester(data: { content?: string; platforms?: string[] }, userId?: string) {
  const p = `Test content across multiple devices for a creator.
${data.content ? `Content: ${data.content}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "testing": [{"device": "device type", "issues": "issues found", "fixes": "recommended fixes"}], "checklist": "testing checklist", "automation": "automated testing options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPerformanceMonitor(data: { metrics?: string[] }, userId?: string) {
  const p = `Monitor performance metrics for a content creator.
${data.metrics ? `Metrics to monitor: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "monitoring": [{"metric": "metric name", "baseline": "baseline value", "alert": "alert threshold"}], "tools": "monitoring tools", "optimization": "optimization recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSecurityAuditor(data: { accounts?: string[] }, userId?: string) {
  const p = `Audit security for a content creator's accounts.
${data.accounts ? `Accounts: ${data.accounts.join(", ")}` : ""}
Respond as JSON: { "audit": [{"account": "account name", "risk": "risk level", "action": "recommended action"}], "twoFA": "two-factor auth recommendations", "passwords": "password management tips", "backup": "backup access strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCookieConsentManager(data: { platforms?: string[]; regions?: string[] }, userId?: string) {
  const p = `Manage cookie consent for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
${data.regions ? `Target regions: ${data.regions.join(", ")}` : ""}
Respond as JSON: { "implementation": [{"region": "region name", "requirements": "legal requirements", "solution": "implementation solution"}], "tools": "consent management tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAgeGatingAdvisor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Advise on age gating for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "required": "whether age gating is required", "implementation": [{"method": "gating method", "platform": "platform specifics"}], "guidelines": "content guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataRetentionPlanner(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Plan data retention for a content creator.
${data.dataTypes ? `Data types: ${data.dataTypes.join(", ")}` : ""}
Respond as JSON: { "policy": [{"dataType": "data type", "retention": "retention period", "deletion": "deletion method"}], "compliance": "compliance notes", "automation": "automation setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIncidentResponsePlanner(data: { scenarios?: string[] }, userId?: string) {
  const p = `Plan incident response for a content creator.
${data.scenarios ? `Scenarios to plan for: ${data.scenarios.join(", ")}` : ""}
Respond as JSON: { "plan": [{"scenario": "incident scenario", "response": "response steps", "communication": "communication plan", "timeline": "response timeline"}], "prevention": "prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomShortcutBuilder(data: { workflow?: string; tools?: string[] }, userId?: string) {
  const p = `Build custom keyboard shortcuts and workflow automation for a content creator.
${data.workflow ? `Workflow: ${data.workflow}` : ""}
${data.tools ? `Tools used: ${data.tools.join(", ")}` : ""}
Respond as JSON: { "shortcuts": [{"action": "action name", "key": "keyboard shortcut", "tool": "associated tool", "timeSaved": "time saved per use"}], "profiles": "shortcut profiles for different tasks", "automation": "automation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdvancedSearchOptimizer(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Optimize advanced search strategies for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "operators": [{"operator": "search operator", "usage": "how to use it", "example": "example query"}], "templates": "saved search templates", "savedSearches": "recommended saved searches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBulkUploadManager(data: { fileCount?: number; platforms?: string[] }, userId?: string) {
  const p = `Plan a bulk upload workflow for a content creator.
${data.fileCount ? `Number of files: ${data.fileCount}` : ""}
${data.platforms ? `Target platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "workflow": [{"step": "workflow step", "tool": "tool to use", "config": "configuration details"}], "naming": "file naming conventions", "metadata": "metadata strategy", "scheduling": "upload scheduling plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaylistAutoOrganizer(data: { playlists?: string[]; criteria?: string }, userId?: string) {
  const p = `Auto-organize playlists for a content creator.
${data.playlists ? `Existing playlists: ${data.playlists.join(", ")}` : ""}
${data.criteria ? `Organization criteria: ${data.criteria}` : ""}
Respond as JSON: { "organized": [{"playlist": "playlist name", "order": "suggested order", "additions": "suggested additions"}], "newPlaylists": "suggested new playlists", "cleanup": "cleanup recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiAccountManager(data: { accounts?: number; platforms?: string[] }, userId?: string) {
  const p = `Plan multi-account management strategy for a content creator.
${data.accounts ? `Number of accounts: ${data.accounts}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "management": [{"account": "account identifier", "purpose": "account purpose", "schedule": "posting schedule"}], "tools": "management tools recommended", "delegation": "delegation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomDashboardBuilder(data: { metrics?: string[]; role?: string }, userId?: string) {
  const p = `Design a custom analytics dashboard for a content creator.
${data.metrics ? `Key metrics: ${data.metrics.join(", ")}` : ""}
${data.role ? `User role: ${data.role}` : ""}
Respond as JSON: { "widgets": [{"name": "widget name", "metric": "metric tracked", "visualization": "visualization type"}], "layout": "dashboard layout recommendation", "refresh": "data refresh intervals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoTaggingSystem(data: { contentType?: string; existing?: string[] }, userId?: string) {
  const p = `Design an automatic tagging system for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.existing ? `Existing tags: ${data.existing.join(", ")}` : ""}
Respond as JSON: { "tags": [{"tag": "tag name", "category": "tag category", "rules": "auto-tagging rules"}], "automation": "automation setup", "hierarchy": "tag hierarchy structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartNotificationSystem(data: { priorities?: string[] }, userId?: string) {
  const p = `Design a smart notification system for a content creator.
${data.priorities ? `Priority levels: ${data.priorities.join(", ")}` : ""}
Respond as JSON: { "rules": [{"trigger": "notification trigger", "action": "action to take", "priority": "priority level"}], "channels": "notification channels", "quiet": "quiet hours configuration", "escalation": "escalation rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTemplateLibrary(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Build a template library for a content creator.
${data.contentTypes ? `Content types: ${data.contentTypes.join(", ")}` : ""}
Respond as JSON: { "templates": [{"name": "template name", "type": "content type", "sections": "template sections", "vars": "customizable variables"}], "customization": "customization options", "sharing": "template sharing features" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMacroBuilder(data: { tasks?: string[] }, userId?: string) {
  const p = `Build automation macros for a content creator.
${data.tasks ? `Tasks to automate: ${data.tasks.join(", ")}` : ""}
Respond as JSON: { "macros": [{"name": "macro name", "steps": "macro steps", "trigger": "trigger condition", "timeSaved": "estimated time saved"}], "sequences": "macro sequences", "scheduling": "macro scheduling" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVRContentAdvisor(data: { niche?: string; budget?: string }, userId?: string) {
  const p = `Advise on VR content creation opportunities for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.budget ? `Budget: ${data.budget}` : ""}
Respond as JSON: { "opportunities": [{"format": "VR content format", "platform": "target platform", "audience": "target audience"}], "equipment": "recommended equipment", "creation": "creation workflow tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiARFilterCreator(data: { platform?: string; brand?: string }, userId?: string) {
  const p = `Design AR filter concepts for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.brand ? `Brand: ${data.brand}` : ""}
Respond as JSON: { "filters": [{"name": "filter name", "concept": "filter concept", "platform": "target platform", "interaction": "user interaction type"}], "development": "development recommendations", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAIVoiceoverGenerator(data: { script?: string; voice?: string }, userId?: string) {
  const p = `Recommend AI voiceover solutions for a content creator.
${data.script ? `Script sample: ${data.script}` : ""}
${data.voice ? `Preferred voice style: ${data.voice}` : ""}
Respond as JSON: { "options": [{"provider": "voiceover provider", "quality": "quality rating", "price": "pricing info", "languages": "supported languages"}], "editing": "editing tips", "syncing": "audio syncing advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDeepfakeDetector(data: { contentType?: string }, userId?: string) {
  const p = `Advise on deepfake detection and prevention for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "detection": [{"method": "detection method", "accuracy": "accuracy level", "tool": "recommended tool"}], "prevention": "prevention strategies", "watermarking": "watermarking recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlockchainContentVerifier(data: { contentType?: string }, userId?: string) {
  const p = `Plan blockchain-based content verification for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "verification": [{"method": "verification method", "platform": "blockchain platform", "cost": "estimated cost"}], "timestamping": "content timestamping strategy", "proof": "proof of ownership approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveTrendEngine(data: { niche?: string; horizon?: string }, userId?: string) {
  const p = `Predict upcoming content trends for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.horizon ? `Time horizon: ${data.horizon}` : ""}
Respond as JSON: { "predictions": [{"trend": "predicted trend", "probability": "likelihood percentage", "timing": "expected timing", "preparation": "how to prepare"}], "signals": "trend signals to watch" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentGraphAnalyzer(data: { videos?: number; connections?: string[] }, userId?: string) {
  const p = `Analyze content graph relationships for a content creator.
${data.videos ? `Number of videos: ${data.videos}` : ""}
${data.connections ? `Connection types: ${data.connections.join(", ")}` : ""}
Respond as JSON: { "graph": {"nodes": "content nodes description", "edges": "relationship edges", "clusters": "content clusters identified"}, "insights": "graph insights", "optimization": "optimization recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudiencePsychographer(data: { niche?: string; demographics?: any }, userId?: string) {
  const p = `Build audience psychographic profiles for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.demographics ? `Demographics: ${JSON.stringify(data.demographics)}` : ""}
Respond as JSON: { "psychographics": [{"segment": "audience segment", "values": "core values", "motivations": "key motivations", "triggers": "content triggers"}], "content": "content strategy based on psychographics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNeuroMarketingAdvisor(data: { contentType?: string; goal?: string }, userId?: string) {
  const p = `Apply neuromarketing principles for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
${data.goal ? `Goal: ${data.goal}` : ""}
Respond as JSON: { "techniques": [{"technique": "neuromarketing technique", "application": "how to apply it", "ethical": "ethical considerations"}], "color": "color psychology recommendations", "sound": "sound design tips", "pacing": "content pacing advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamificationEngine(data: { community?: string; goals?: string[] }, userId?: string) {
  const p = `Design gamification mechanics for a content creator community.
${data.community ? `Community: ${data.community}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "mechanics": [{"mechanic": "gamification mechanic", "implementation": "how to implement", "engagement": "expected engagement impact"}], "rewards": "reward system design", "leaderboard": "leaderboard structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalizationEngine(data: { segments?: string[] }, userId?: string) {
  const p = `Design a content personalization engine for a content creator.
${data.segments ? `Audience segments: ${data.segments.join(", ")}` : ""}
Respond as JSON: { "personalization": [{"segment": "audience segment", "content": "personalized content strategy", "delivery": "delivery method"}], "automation": "automation setup", "testing": "A/B testing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSentimentPredictiveModel(data: { topic?: string; platform?: string }, userId?: string) {
  const p = `Predict audience sentiment for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "prediction": [{"scenario": "content scenario", "sentiment": "predicted sentiment", "probability": "likelihood percentage"}], "mitigation": "negative sentiment mitigation strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentDNAAnalyzer(data: { topVideos?: string[] }, userId?: string) {
  const p = `Analyze the content DNA of top-performing videos for a content creator.
${data.topVideos ? `Top videos: ${data.topVideos.join(", ")}` : ""}
Respond as JSON: { "dna": {"format": "content format patterns", "pacing": "pacing analysis", "hooks": "hook patterns", "emotions": "emotional triggers", "topics": "topic patterns"}, "replication": "replication strategy", "evolution": "content evolution recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmSimulator(data: { platform?: string; contentType?: string }, userId?: string) {
  const p = `Simulate platform algorithm behavior for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "simulation": [{"factor": "algorithm factor", "weight": "estimated weight", "optimization": "optimization strategy"}], "ranking": "ranking factors analysis", "boosts": "algorithm boost opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorEconomyTracker(data: { niche?: string }, userId?: string) {
  const p = `Track creator economy trends and opportunities for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "trends": [{"trend": "economy trend", "impact": "impact on creators", "opportunity": "opportunity description"}], "market": "market analysis", "predictions": "future predictions", "positioning": "strategic positioning advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWeb3CreatorTools(data: { interest?: string }, userId?: string) {
  const p = `Recommend Web3 tools and opportunities for a content creator.
${data.interest ? `Interest area: ${data.interest}` : ""}
Respond as JSON: { "tools": [{"name": "tool name", "purpose": "tool purpose", "blockchain": "blockchain platform", "cost": "estimated cost"}], "opportunities": "Web3 opportunities for creators", "risks": "risks and considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMetaversePresencePlanner(data: { brand?: string }, userId?: string) {
  const p = `Plan metaverse presence strategy for a content creator.
${data.brand ? `Brand: ${data.brand}` : ""}
Respond as JSON: { "strategy": [{"platform": "metaverse platform", "presence": "presence type", "content": "content strategy"}], "investment": "investment requirements", "timeline": "implementation timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAIAgentCustomizer(data: { taskTypes?: string[] }, userId?: string) {
  const p = `Customize AI agents for a content creator workflow.
${data.taskTypes ? `Task types: ${data.taskTypes.join(", ")}` : ""}
Respond as JSON: { "agents": [{"name": "agent name", "role": "agent role", "capabilities": "agent capabilities", "config": "configuration details"}], "workflows": "agent workflow design", "integration": "integration recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataVisualizationEngine(data: { data?: string[]; format?: string }, userId?: string) {
  const p = `Design data visualizations for a content creator's analytics.
${data.data ? `Data sources: ${data.data.join(", ")}` : ""}
${data.format ? `Preferred format: ${data.format}` : ""}
Respond as JSON: { "visualizations": [{"type": "visualization type", "data": "data to visualize", "style": "visual style", "insight": "key insight revealed"}], "tools": "recommended tools", "sharing": "sharing and export options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorAPIBuilder(data: { features?: string[] }, userId?: string) {
  const p = `Design a creator API for monetization and integration.
${data.features ? `Desired features: ${data.features.join(", ")}` : ""}
Respond as JSON: { "api": [{"endpoint": "API endpoint", "purpose": "endpoint purpose", "auth": "authentication method"}], "documentation": "documentation strategy", "monetization": "API monetization model", "sdk": "SDK development plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastLaunchPlanner(data: { niche?: string; format?: string }, userId?: string) {
  const p = `Create a podcast launch plan for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.format ? `Format: ${data.format}` : ""}
Respond as JSON: { "plan": [{"phase": "launch phase", "tasks": "key tasks", "timeline": "timeline"}], "equipment": "recommended equipment", "hosting": "hosting platform recommendation", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastEpisodePlanner(data: { topic?: string; guests?: string[] }, userId?: string) {
  const p = `Plan a podcast episode for a creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.guests ? `Guests: ${data.guests.join(", ")}` : ""}
Respond as JSON: { "outline": [{"segment": "segment name", "duration": "duration", "notes": "notes"}], "questions": "interview questions", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastSEO(data: { title?: string; niche?: string }, userId?: string) {
  const p = `Optimize podcast SEO for discoverability.
${data.title ? `Title: ${data.title}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimized": {"title": "optimized title", "description": "optimized description", "tags": "optimized tags"}, "distribution": "distribution strategy", "transcription": "transcription recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioBrandingKit(data: { style?: string; genre?: string }, userId?: string) {
  const p = `Design an audio branding kit for a content creator.
${data.style ? `Style: ${data.style}` : ""}
${data.genre ? `Genre: ${data.genre}` : ""}
Respond as JSON: { "elements": [{"type": "audio element type", "description": "description", "usage": "usage guidelines"}], "consistency": "brand consistency tips", "production": "production recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicComposerAdvisor(data: { mood?: string; usage?: string }, userId?: string) {
  const p = `Recommend music and composition options for content creation.
${data.mood ? `Mood: ${data.mood}` : ""}
${data.usage ? `Usage: ${data.usage}` : ""}
Respond as JSON: { "recommendations": [{"source": "music source", "style": "style", "license": "license type", "cost": "cost"}], "royaltyFree": "royalty-free options and tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiASMRContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan ASMR content for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "ideas": [{"concept": "ASMR concept", "equipment": "equipment needed", "technique": "technique"}], "audience": "target audience analysis", "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceTrainingCoach(data: { issues?: string[] }, userId?: string) {
  const p = `Provide voice training coaching for a content creator.
${data.issues ? `Issues: ${data.issues.join(", ")}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "technique": "technique description", "duration": "duration"}], "warmups": "warmup routine", "tips": "general voice tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioMixingGuide(data: { contentType?: string }, userId?: string) {
  const p = `Create an audio mixing guide for content creators.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "settings": [{"parameter": "mixing parameter", "value": "recommended value", "reason": "reason"}], "software": "recommended software", "workflow": "mixing workflow" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsletterBuilder(data: { niche?: string; frequency?: string }, userId?: string) {
  const p = `Build a newsletter strategy for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.frequency ? `Frequency: ${data.frequency}` : ""}
Respond as JSON: { "template": [{"section": "section name", "content": "content description", "cta": "call to action"}], "schedule": "publishing schedule", "growth": "growth strategies", "tools": "recommended tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailSequenceWriter(data: { goal?: string; steps?: number }, userId?: string) {
  const p = `Write an email sequence for a content creator's marketing.
${data.goal ? `Goal: ${data.goal}` : ""}
${data.steps ? `Number of steps: ${data.steps}` : ""}
Respond as JSON: { "sequence": [{"email": "email number", "subject": "subject line", "content": "email content summary", "delay": "delay before sending"}], "segmentation": "audience segmentation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLeadMagnetCreator(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Create lead magnet ideas for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON: { "magnets": [{"type": "lead magnet type", "title": "title", "content": "content description", "conversion": "expected conversion"}], "funnel": "funnel strategy", "delivery": "delivery method" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailListGrower(data: { currentSize?: number; niche?: string }, userId?: string) {
  const p = `Provide email list growth strategies for a content creator.
${data.currentSize ? `Current list size: ${data.currentSize}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategies": [{"method": "growth method", "implementation": "how to implement", "growth": "expected growth"}], "tools": "recommended tools", "compliance": "email compliance tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailAnalyticsAdvisor(data: { openRate?: number; clickRate?: number }, userId?: string) {
  const p = `Analyze email marketing metrics and provide improvement advice.
${data.openRate ? `Current open rate: ${data.openRate}%` : ""}
${data.clickRate ? `Current click rate: ${data.clickRate}%` : ""}
Respond as JSON: { "analysis": "overall analysis", "improvements": [{"metric": "metric to improve", "strategy": "improvement strategy"}], "benchmarks": "industry benchmarks" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWebinarPlanner(data: { topic?: string; audience?: string }, userId?: string) {
  const p = `Plan a webinar for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON: { "plan": [{"phase": "planning phase", "tasks": "tasks"}], "platform": "recommended platform", "promotion": "promotion strategy", "followUp": "follow-up plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVirtualEventOrganizer(data: { eventType?: string; attendees?: number }, userId?: string) {
  const p = `Organize a virtual event for a content creator.
${data.eventType ? `Event type: ${data.eventType}` : ""}
${data.attendees ? `Expected attendees: ${data.attendees}` : ""}
Respond as JSON: { "plan": [{"element": "event element", "setup": "setup details", "timing": "timing"}], "platform": "recommended platform", "engagement": "engagement strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeetupOrganizer(data: { community?: string; location?: string }, userId?: string) {
  const p = `Organize a meetup for a content creator community.
${data.community ? `Community: ${data.community}` : ""}
${data.location ? `Location: ${data.location}` : ""}
Respond as JSON: { "plan": [{"detail": "planning detail", "action": "action item"}], "venue": "venue recommendations", "promotion": "promotion plan", "agenda": "event agenda" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConferencePrep(data: { conference?: string; role?: string }, userId?: string) {
  const p = `Prepare for a conference appearance as a content creator.
${data.conference ? `Conference: ${data.conference}` : ""}
${data.role ? `Role: ${data.role}` : ""}
Respond as JSON: { "prep": [{"task": "preparation task", "timeline": "timeline"}], "networking": "networking strategy", "pitch": "elevator pitch", "materials": "materials to prepare" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAwardSubmissionWriter(data: { category?: string; achievements?: string[] }, userId?: string) {
  const p = `Write an award submission for a content creator.
${data.category ? `Category: ${data.category}` : ""}
${data.achievements ? `Achievements: ${data.achievements.join(", ")}` : ""}
Respond as JSON: { "submission": {"narrative": "submission narrative", "metrics": "key metrics", "impact": "impact statement"}, "tips": "submission tips", "deadlines": "deadline management" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPanelDiscussionPrep(data: { topic?: string; role?: string }, userId?: string) {
  const p = `Prepare for a panel discussion as a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.role ? `Role: ${data.role}` : ""}
Respond as JSON: { "prep": [{"talking": "talking point", "supporting": "supporting evidence"}], "questions": "anticipated questions", "audience": "audience engagement tips", "followUp": "follow-up strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorRetreePlanner(data: { purpose?: string; attendees?: number }, userId?: string) {
  const p = `Plan a creator retreat event.
${data.purpose ? `Purpose: ${data.purpose}` : ""}
${data.attendees ? `Attendees: ${data.attendees}` : ""}
Respond as JSON: { "plan": [{"day": "day number", "activities": "planned activities"}], "budget": "budget breakdown", "venue": "venue recommendations", "outcomes": "expected outcomes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLiveWorkshopBuilder(data: { skill?: string; duration?: string }, userId?: string) {
  const p = `Build a live workshop curriculum for a content creator.
${data.skill ? `Skill: ${data.skill}` : ""}
${data.duration ? `Duration: ${data.duration}` : ""}
Respond as JSON: { "curriculum": [{"section": "section name", "activity": "activity description", "materials": "materials needed"}], "pricing": "pricing strategy", "recording": "recording and repurposing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOnlineCourseLauncher(data: { topic?: string; modules?: number }, userId?: string) {
  const p = `Plan an online course launch for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
${data.modules ? `Number of modules: ${data.modules}` : ""}
Respond as JSON: { "launch": [{"phase": "launch phase", "tasks": "tasks", "timeline": "timeline"}], "pricing": "pricing strategy", "marketing": "marketing plan", "platform": "platform recommendation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMasterclassDesigner(data: { expertise?: string; format?: string }, userId?: string) {
  const p = `Design a masterclass for a content creator.
${data.expertise ? `Expertise: ${data.expertise}` : ""}
${data.format ? `Format: ${data.format}` : ""}
Respond as JSON: { "design": [{"session": "session name", "content": "content outline", "exercise": "practical exercise"}], "pricing": "pricing strategy", "promotion": "promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaAppearancePrep(data: { outlet?: string; topic?: string }, userId?: string) {
  const p = `Prepare for a media appearance as a content creator.
${data.outlet ? `Media outlet: ${data.outlet}` : ""}
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "prep": [{"area": "preparation area", "talking": "talking points"}], "dos": "dos for the appearance", "donts": "donts for the appearance", "followUp": "follow-up strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGuestPostWriter(data: { publication?: string; topic?: string }, userId?: string) {
  const p = `Plan a guest post for a content creator.
${data.publication ? `Publication: ${data.publication}` : ""}
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "outline": "article outline", "pitch": "pitch to the publication", "bio": "author bio", "promotion": "promotion strategy", "relationships": "relationship building tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerEventPlanner(data: { brand?: string; influencers?: number }, userId?: string) {
  const p = `Plan an influencer event for brand collaboration.
${data.brand ? `Brand: ${data.brand}` : ""}
${data.influencers ? `Number of influencers: ${data.influencers}` : ""}
Respond as JSON: { "event": [{"element": "event element", "detail": "detail"}], "budget": "budget estimate", "contracts": "contract considerations", "content": "content deliverables" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductLaunchPlanner(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Plan a product launch for a content creator.
${data.product ? `Product: ${data.product}` : ""}
${data.audience ? `Target audience: ${data.audience}` : ""}
Respond as JSON: { "launch": [{"phase": "launch phase", "actions": "actions", "timeline": "timeline"}], "marketing": "marketing strategy", "partners": "partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCharityEventAdvisor(data: { cause?: string; format?: string }, userId?: string) {
  const p = `Advise on planning a charity event for a content creator.
${data.cause ? `Cause: ${data.cause}` : ""}
${data.format ? `Format: ${data.format}` : ""}
Respond as JSON: { "plan": [{"element": "event element", "detail": "detail"}], "fundraising": "fundraising strategy", "promotion": "promotion plan", "legal": "legal considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnniversaryCelebrationPlanner(data: { milestone?: string }, userId?: string) {
  const p = `Plan an anniversary celebration for a content creator channel.
${data.milestone ? `Milestone: ${data.milestone}` : ""}
Respond as JSON: { "celebration": [{"element": "celebration element", "content": "content idea"}], "community": "community engagement plan", "memorabilia": "memorabilia and merchandise ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeasonalCampaignPlanner(data: { season?: string; niche?: string }, userId?: string) {
  const p = `Plan a seasonal campaign for a content creator.
${data.season ? `Season: ${data.season}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "campaigns": [{"name": "campaign name", "content": "content plan", "timing": "timing"}], "merchandise": "merchandise opportunities", "partnerships": "partnership ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHolidayContentCalendar(data: { holidays?: string[]; niche?: string }, userId?: string) {
  const p = `Create a holiday content calendar for a content creator.
${data.holidays ? `Holidays: ${data.holidays.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "calendar": [{"holiday": "holiday name", "content": "content ideas", "timing": "publishing timing"}], "preparation": "preparation timeline", "evergreen": "evergreen content opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndOfYearReview(data: { metrics?: any }, userId?: string) {
  const p = `Create an end-of-year review for a content creator.
${data.metrics ? `Metrics: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON: { "review": [{"area": "review area", "achievement": "key achievement", "growth": "growth percentage"}], "highlights": "top highlights", "goals": "goals for next year" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSkillAssessment(data: { skills?: string[]; goals?: string[] }, userId?: string) {
  const p = `Assess skills and identify gaps for a content creator.
${data.skills ? `Current skills: ${data.skills.join(", ")}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "assessment": [{"skill": "skill name", "level": "current level", "gap": "gap to close"}], "learning": "learning recommendations", "priority": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLearningPathBuilder(data: { goal?: string; current?: string }, userId?: string) {
  const p = `Build a learning path for a content creator.
${data.goal ? `Goal: ${data.goal}` : ""}
${data.current ? `Current level: ${data.current}` : ""}
Respond as JSON: { "path": [{"milestone": "milestone", "resources": "resources", "duration": "duration"}], "schedule": "recommended schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCertificationAdvisor(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Recommend certifications for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "certifications": [{"name": "certification name", "provider": "provider", "cost": "cost", "value": "value proposition"}], "priority": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBookRecommender(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Recommend books for a content creator's growth.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "books": [{"title": "book title", "author": "author", "key": "key takeaway", "relevance": "relevance to goals"}], "reading": "reading strategy", "schedule": "reading schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiToolTutorialCreator(data: { tool?: string; level?: string }, userId?: string) {
  const p = `Create a tool tutorial for content creators.
${data.tool ? `Tool: ${data.tool}` : ""}
${data.level ? `Level: ${data.level}` : ""}
Respond as JSON: { "tutorial": [{"step": "step number", "instruction": "instruction", "tip": "pro tip"}], "prerequisites": "prerequisites" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIndustryReportGenerator(data: { industry?: string; period?: string }, userId?: string) {
  const p = `Generate an industry report for a content creator.
${data.industry ? `Industry: ${data.industry}` : ""}
${data.period ? `Period: ${data.period}` : ""}
Respond as JSON: { "report": [{"section": "report section", "findings": "key findings"}], "trends": "emerging trends", "predictions": "future predictions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaseStudyBuilder(data: { project?: string; results?: any }, userId?: string) {
  const p = `Build a case study for a content creator's project.
${data.project ? `Project: ${data.project}` : ""}
${data.results ? `Results: ${JSON.stringify(data.results)}` : ""}
Respond as JSON: { "caseStudy": [{"section": "section name", "content": "content"}], "metrics": "key metrics to highlight", "testimonials": "testimonial gathering strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPortfolioOptimizer(data: { works?: string[]; goals?: string[] }, userId?: string) {
  const p = `Optimize a content creator's portfolio.
${data.works ? `Works: ${data.works.join(", ")}` : ""}
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "optimized": [{"piece": "portfolio piece", "position": "recommended position", "description": "optimized description"}], "layout": "layout recommendations", "cta": "call-to-action strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialProofCollector(data: { sources?: string[] }, userId?: string) {
  const p = `Develop a social proof collection strategy for a content creator.
${data.sources ? `Sources: ${data.sources.join(", ")}` : ""}
Respond as JSON: { "proof": [{"type": "proof type", "content": "content description", "display": "display method"}], "automation": "automation tips", "placement": "optimal placement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTestimonialVideoPlanner(data: { clients?: string[] }, userId?: string) {
  const p = `Plan testimonial videos for a content creator.
${data.clients ? `Clients: ${data.clients.join(", ")}` : ""}
Respond as JSON: { "plan": [{"client": "client name", "questions": "interview questions", "format": "video format"}], "editing": "editing guidelines", "placement": "placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaseStudyVideoCreator(data: { project?: string }, userId?: string) {
  const p = `Create a case study video script for a content creator.
${data.project ? `Project: ${data.project}` : ""}
Respond as JSON: { "script": [{"section": "section", "visual": "visual description", "narration": "narration text"}], "metrics": "metrics to showcase", "cta": "call to action" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBeforeAfterShowcase(data: { service?: string }, userId?: string) {
  const p = `Create a before/after showcase for a content creator's service.
${data.service ? `Service: ${data.service}` : ""}
Respond as JSON: { "showcase": [{"metric": "metric", "before": "before value", "after": "after value"}], "visuals": "visual presentation tips", "credibility": "credibility boosters" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerScorecard(data: { metrics?: any }, userId?: string) {
  const p = `Generate an influencer scorecard for a content creator.
${data.metrics ? `Metrics: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON: { "scorecard": [{"metric": "metric name", "score": "score", "benchmark": "industry benchmark"}], "overall": "overall score", "improvements": "improvement areas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCredibilityBooster(data: { platform?: string }, userId?: string) {
  const p = `Boost credibility for a content creator on their platform.
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "strategies": [{"method": "credibility method", "implementation": "how to implement", "impact": "expected impact"}], "timeline": "implementation timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUserReviewManager(data: { platform?: string }, userId?: string) {
  const p = `Manage user reviews for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "management": [{"action": "management action", "process": "process details"}], "responses": "response templates", "flagging": "flagging criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReferencePageBuilder(data: { references?: string[] }, userId?: string) {
  const p = `Build a reference page for a content creator.
${data.references ? `References: ${data.references.join(", ")}` : ""}
Respond as JSON: { "page": [{"reference": "reference name", "context": "context", "display": "display format"}], "layout": "page layout", "verification": "verification process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEcommerceStoreBuilder(data: { products?: string[]; niche?: string }, userId?: string) {
  const p = `Build an ecommerce store strategy for a content creator.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "store": [{"section": "store section", "setup": "setup details"}], "products": "product strategy", "pricing": "pricing strategy", "marketing": "marketing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDropshippingAdvisor(data: { niche?: string; budget?: number }, userId?: string) {
  const p = `Advise on dropshipping strategy for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.budget ? `Budget: $${data.budget}` : ""}
Respond as JSON: { "strategy": "overall strategy", "products": [{"item": "product item", "supplier": "supplier", "margin": "profit margin"}], "marketing": "marketing approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrintOnDemandOptimizer(data: { designs?: string[]; platform?: string }, userId?: string) {
  const p = `Optimize print-on-demand strategy for a content creator.
${data.designs ? `Designs: ${data.designs.join(", ")}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "optimization": [{"design": "design name", "platform": "platform", "pricing": "pricing strategy"}], "marketing": "marketing tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalDownloadCreator(data: { type?: string; niche?: string }, userId?: string) {
  const p = `Create digital download products for a content creator.
${data.type ? `Type: ${data.type}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "products": [{"name": "product name", "format": "file format", "price": "price", "creation": "creation process"}], "delivery": "delivery method", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffiliatePageBuilder(data: { niche?: string; products?: string[] }, userId?: string) {
  const p = `Build an affiliate page for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "page": [{"product": "product name", "review": "review summary", "link": "link placement"}], "seo": "SEO strategy", "disclosure": "disclosure requirements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUpsellStrategyBuilder(data: { products?: string[] }, userId?: string) {
  const p = `Build an upsell strategy for a content creator's products.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "upsells": [{"trigger": "upsell trigger", "offer": "upsell offer", "value": "value proposition"}], "sequencing": "upsell sequencing", "pricing": "pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCartAbandonmentRecovery(data: { products?: string[] }, userId?: string) {
  const p = `Create a cart abandonment recovery strategy for a content creator.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "recovery": [{"trigger": "recovery trigger", "email": "email content", "timing": "send timing"}], "incentives": "incentive strategies", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomerJourneyMapper(data: { touchpoints?: string[] }, userId?: string) {
  const p = `Map the customer journey for a content creator's business.
${data.touchpoints ? `Touchpoints: ${data.touchpoints.join(", ")}` : ""}
Respond as JSON: { "journey": [{"stage": "journey stage", "touchpoint": "touchpoint", "content": "content needed"}], "optimization": "optimization opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductBundleCreator(data: { products?: string[] }, userId?: string) {
  const p = `Create product bundles for a content creator.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "bundles": [{"name": "bundle name", "items": "included items", "price": "bundle price", "savings": "customer savings"}], "positioning": "positioning strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFlashSalePlanner(data: { products?: string[]; duration?: string }, userId?: string) {
  const p = `Plan a flash sale for a content creator.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
${data.duration ? `Duration: ${data.duration}` : ""}
Respond as JSON: { "plan": [{"phase": "sale phase", "action": "action", "timing": "timing"}], "discount": "discount strategy", "urgency": "urgency tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLoyaltyRewardDesigner(data: { business?: string }, userId?: string) {
  const p = `Design a loyalty rewards program for a content creator's business.
${data.business ? `Business: ${data.business}` : ""}
Respond as JSON: { "program": [{"tier": "tier name", "rewards": "rewards", "requirements": "requirements"}], "engagement": "engagement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriptionModelBuilder(data: { product?: string; niche?: string }, userId?: string) {
  const p = `Build a subscription model for a content creator.
${data.product ? `Product: ${data.product}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "model": [{"tier": "tier name", "price": "price", "includes": "what is included"}], "retention": "retention strategies", "growth": "growth plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPricingPageOptimizer(data: { products?: any[] }, userId?: string) {
  const p = `Optimize a pricing page for a content creator.
${data.products ? `Products: ${JSON.stringify(data.products)}` : ""}
Respond as JSON: { "optimized": [{"element": "page element", "change": "recommended change", "reason": "reason"}], "psychology": "pricing psychology tips", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCheckoutOptimizer(data: { currentFlow?: string[] }, userId?: string) {
  const p = `Optimize the checkout flow for a content creator's store.
${data.currentFlow ? `Current flow: ${data.currentFlow.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"step": "checkout step", "improvement": "improvement"}], "trust": "trust signals to add", "urgency": "urgency elements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInventoryForecaster(data: { products?: any[] }, userId?: string) {
  const p = `Forecast inventory needs for a content creator's products.
${data.products ? `Products: ${JSON.stringify(data.products)}` : ""}
Respond as JSON: { "forecast": [{"product": "product name", "demand": "demand forecast", "reorder": "reorder point"}], "seasonal": "seasonal adjustments", "buffer": "buffer stock recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShippingOptimizer(data: { locations?: string[] }, userId?: string) {
  const p = `Optimize shipping for a content creator's ecommerce.
${data.locations ? `Locations: ${data.locations.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"region": "region", "method": "shipping method", "cost": "cost optimization"}], "packaging": "packaging recommendations", "returns": "returns policy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeAdsOptimizer(data: { budget?: number; goal?: string }, userId?: string) {
  const p = `Optimize YouTube ads strategy for a content creator.
${data.budget ? `Budget: $${data.budget}` : ""}
${data.goal ? `Goal: ${data.goal}` : ""}
Respond as JSON: { "strategy": [{"adType": "ad type", "targeting": "targeting strategy", "budget": "budget allocation"}], "creatives": "creative recommendations", "testing": "testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookAdsCreator(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Create Facebook ads strategy for a content creator.
${data.product ? `Product: ${data.product}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON: { "ads": [{"format": "ad format", "copy": "ad copy", "targeting": "targeting", "budget": "budget"}], "funnel": "funnel strategy", "optimization": "optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleAdsManager(data: { keywords?: string[]; budget?: number }, userId?: string) {
  const p = `Manage Google Ads strategy for a content creator.
${data.keywords ? `Keywords: ${data.keywords.join(", ")}` : ""}
${data.budget ? `Budget: $${data.budget}` : ""}
Respond as JSON: { "campaigns": [{"type": "campaign type", "keywords": "target keywords", "bid": "bid strategy"}], "landing": "landing page recommendations", "tracking": "conversion tracking setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokAdsAdvisor(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Advise on TikTok ads strategy for a content creator.
${data.product ? `Product: ${data.product}` : ""}
${data.audience ? `Audience: ${data.audience}` : ""}
Respond as JSON: { "strategy": [{"format": "ad format", "content": "content approach", "targeting": "targeting"}], "creative": "creative best practices", "budget": "budget recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerAdsManager(data: { budget?: number; niche?: string }, userId?: string) {
  const p = `Manage influencer advertising strategy.
${data.budget ? `Budget: $${data.budget}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"tier": "influencer tier", "influencer": "influencer type", "format": "content format", "cost": "estimated cost"}], "tracking": "tracking methods", "roi": "ROI measurement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetargetingStrategist(data: { platforms?: string[] }, userId?: string) {
  const p = `Create a retargeting strategy for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"platform": "platform", "audience": "audience segment", "creative": "creative approach"}], "frequency": "frequency capping", "exclusions": "exclusion rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdCopyWriter(data: { product?: string; platform?: string }, userId?: string) {
  const p = `Write ad copy for a content creator's product.
${data.product ? `Product: ${data.product}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "copy": [{"headline": "headline", "body": "body copy", "cta": "call to action"}], "variations": "copy variations", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdBudgetAllocator(data: { totalBudget?: number; platforms?: string[] }, userId?: string) {
  const p = `Allocate advertising budget across platforms for a content creator.
${data.totalBudget ? `Total budget: $${data.totalBudget}` : ""}
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "allocation": [{"platform": "platform", "budget": "allocated budget", "expected": "expected results"}], "optimization": "optimization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLandingPageOptimizer(data: { url?: string; goal?: string }, userId?: string) {
  const p = `Optimize a landing page for a content creator.
${data.url ? `URL: ${data.url}` : ""}
${data.goal ? `Goal: ${data.goal}` : ""}
Respond as JSON: { "optimization": [{"element": "page element", "change": "recommended change", "impact": "expected impact"}], "testing": "A/B testing plan", "copy": "copy improvements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConversionRateOptimizer(data: { funnel?: string[] }, userId?: string) {
  const p = `Optimize conversion rates for a content creator's funnel.
${data.funnel ? `Funnel steps: ${data.funnel.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"step": "funnel step", "issue": "identified issue", "fix": "recommended fix"}], "testing": "testing strategy", "priorities": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataCleaningAdvisor(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Advise on data cleaning for a content creator's analytics.
${data.dataTypes ? `Data types: ${data.dataTypes.join(", ")}` : ""}
Respond as JSON: { "cleaning": [{"issue": "data issue", "solution": "solution", "tool": "recommended tool"}], "validation": "validation rules", "automation": "automation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataPipelineBuilder(data: { sources?: string[]; destination?: string }, userId?: string) {
  const p = `Build a data pipeline for a content creator's analytics.
${data.sources ? `Data sources: ${data.sources.join(", ")}` : ""}
${data.destination ? `Destination: ${data.destination}` : ""}
Respond as JSON: { "pipeline": [{"step": "pipeline step", "tool": "tool", "config": "configuration"}], "scheduling": "scheduling plan", "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnomalyDetector(data: { metrics?: string[] }, userId?: string) {
  const p = `Set up anomaly detection for a content creator's metrics.
${data.metrics ? `Metrics: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "detection": [{"metric": "metric name", "method": "detection method", "threshold": "threshold"}], "alerting": "alerting setup", "investigation": "investigation process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCohortAnalyzer(data: { segments?: string[] }, userId?: string) {
  const p = `Analyze audience cohorts for a content creator.
${data.segments ? `Segments: ${data.segments.join(", ")}` : ""}
Respond as JSON: { "cohorts": [{"segment": "cohort segment", "behavior": "behavior pattern", "retention": "retention rate"}], "insights": "key insights", "actions": "recommended actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAttributionModeler(data: { channels?: string[] }, userId?: string) {
  const p = `Build an attribution model for a content creator's marketing.
${data.channels ? `Channels: ${data.channels.join(", ")}` : ""}
Respond as JSON: { "model": [{"channel": "channel", "attribution": "attribution method", "weight": "weight"}], "comparison": "model comparison", "optimization": "optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveChurnModeler(data: { factors?: string[] }, userId?: string) {
  const p = `Build a predictive churn model for a content creator's audience.
${data.factors ? `Factors: ${data.factors.join(", ")}` : ""}
Respond as JSON: { "model": [{"factor": "churn factor", "weight": "weight", "intervention": "intervention strategy"}], "earlyWarning": "early warning signs", "retention": "retention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLifetimeValueCalculator(data: { segments?: string[] }, userId?: string) {
  const p = `Calculate customer lifetime value for a content creator's business.
${data.segments ? `Segments: ${data.segments.join(", ")}` : ""}
Respond as JSON: { "ltv": [{"segment": "segment", "value": "lifetime value", "improvement": "improvement opportunity"}], "strategies": "value increase strategies", "forecasting": "LTV forecasting" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccessibilityTextChecker(data: { content?: string }, userId?: string) {
  const p = `Check content accessibility for a content creator.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "issues": [{"issue": "accessibility issue", "location": "location", "fix": "fix recommendation"}], "readability": "readability score and tips", "inclusive": "inclusive language suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAltTextGenerator(data: { images?: string[] }, userId?: string) {
  const p = `Generate alt text for a content creator's images.
${data.images ? `Images: ${data.images.join(", ")}` : ""}
Respond as JSON: { "altTexts": [{"image": "image description", "altText": "alt text", "description": "extended description"}], "guidelines": "alt text best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiColorContrastChecker(data: { foreground?: string; background?: string }, userId?: string) {
  const p = `Check color contrast for accessibility.
${data.foreground ? `Foreground color: ${data.foreground}` : ""}
${data.background ? `Background color: ${data.background}` : ""}
Respond as JSON: { "ratio": "contrast ratio", "wcag": {"aa": "AA compliance status", "aaa": "AAA compliance status"}, "alternatives": "alternative color suggestions", "recommendations": "recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiScreenReaderOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for screen readers.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "optimization": [{"element": "element to optimize", "fix": "recommended fix"}], "testing": "testing guidelines", "compliance": "compliance checklist" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeyboardNavChecker(data: { components?: string[] }, userId?: string) {
  const p = `Check keyboard navigation accessibility.
${data.components ? `Components: ${data.components.join(", ")}` : ""}
Respond as JSON: { "issues": [{"component": "component", "issue": "navigation issue", "fix": "fix"}], "tabOrder": "tab order recommendations", "shortcuts": "keyboard shortcuts to add" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionQualityChecker(data: { captions?: string }, userId?: string) {
  const p = `Check caption quality for accessibility.
${data.captions ? `Captions: ${data.captions}` : ""}
Respond as JSON: { "quality": {"accuracy": "accuracy assessment", "timing": "timing assessment", "formatting": "formatting assessment"}, "improvements": "improvement suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInclusiveLanguageChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for inclusive language.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "issues": [{"phrase": "problematic phrase", "alternative": "inclusive alternative", "reason": "reason for change"}], "score": "inclusivity score", "guidelines": "inclusive language guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDyslexiaFriendlyFormatter(data: { content?: string }, userId?: string) {
  const p = `Format content to be dyslexia-friendly.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "formatted": {"font": "recommended font", "spacing": "spacing settings", "colors": "color recommendations"}, "guidelines": "dyslexia-friendly guidelines", "testing": "testing methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMotionSensitivityChecker(data: { animations?: string[] }, userId?: string) {
  const p = `Check animations for motion sensitivity issues.
${data.animations ? `Animations: ${data.animations.join(", ")}` : ""}
Respond as JSON: { "issues": [{"animation": "animation name", "risk": "risk level", "alternative": "alternative approach"}], "reducedMotion": "reduced motion implementation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCognitiveLoadReducer(data: { interface?: string }, userId?: string) {
  const p = `Reduce cognitive load in a content creator's interface.
${data.interface ? `Interface: ${data.interface}` : ""}
Respond as JSON: { "reductions": [{"element": "interface element", "issue": "cognitive load issue", "simplification": "simplification suggestion"}], "testing": "usability testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiModalContentCreator(data: { content?: string }, userId?: string) {
  const p = `Create multi-modal content adaptations for accessibility.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "modes": [{"mode": "content mode", "adaptation": "adaptation details", "accessibility": "accessibility features"}], "delivery": "delivery strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPasswordSecurityAdvisor(data: { accounts?: number }, userId?: string) {
  const p = `Advise on password security for a content creator.
${data.accounts ? `Number of accounts: ${data.accounts}` : ""}
Respond as JSON: { "recommendations": [{"account": "account type", "action": "security action"}], "manager": "password manager recommendation", "twoFA": "two-factor authentication setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPhishingDetector(data: { emailTypes?: string[] }, userId?: string) {
  const p = `Detect and prevent phishing for a content creator.
${data.emailTypes ? `Email types to check: ${data.emailTypes.join(", ")}` : ""}
Respond as JSON: { "detection": [{"type": "phishing type", "signs": "warning signs", "prevention": "prevention steps"}], "training": "awareness training", "reporting": "reporting process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccountRecoveryPlanner(data: { accounts?: string[] }, userId?: string) {
  const p = `Plan account recovery procedures for a content creator.
${data.accounts ? `Accounts: ${data.accounts.join(", ")}` : ""}
Respond as JSON: { "plan": [{"account": "account", "backup": "backup method", "recovery": "recovery steps"}], "documentation": "documentation to maintain" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrivacySettingsOptimizer(data: { platforms?: string[] }, userId?: string) {
  const p = `Optimize privacy settings for a content creator across platforms.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "settings": [{"platform": "platform", "setting": "privacy setting", "recommended": "recommended value"}], "review": "regular review schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataBreachResponsePlanner(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Plan data breach response for a content creator.
${data.dataTypes ? `Data types at risk: ${data.dataTypes.join(", ")}` : ""}
Respond as JSON: { "plan": [{"step": "response step", "action": "action to take", "timeline": "timeline"}], "notification": "notification plan", "prevention": "prevention measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVPNAdvisor(data: { useCase?: string }, userId?: string) {
  const p = `Advise on VPN usage for a content creator.
${data.useCase ? `Use case: ${data.useCase}` : ""}
Respond as JSON: { "recommendations": [{"provider": "VPN provider", "features": "key features", "price": "price"}], "setup": "setup guide", "split": "split tunneling recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorAnalyzer(data: { competitors?: string[]; metrics?: string[] }, userId?: string) {
  const p = `Analyze competitors for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
${data.metrics ? `Metrics to compare: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "analysis": [{"competitor": "competitor", "strengths": "strengths", "weaknesses": "weaknesses", "opportunity": "opportunity"}], "strategy": "competitive strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorContentTracker(data: { competitors?: string[] }, userId?: string) {
  const p = `Track competitor content for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON: { "tracking": [{"competitor": "competitor", "content": "content type", "frequency": "posting frequency", "performance": "performance metrics"}], "gaps": "content gaps to exploit" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorPricingMonitor(data: { competitors?: string[] }, userId?: string) {
  const p = `Monitor competitor pricing for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON: { "pricing": [{"competitor": "competitor", "products": "products", "prices": "price points"}], "positioning": "price positioning strategy", "strategy": "competitive pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMarketShareAnalyzer(data: { niche?: string }, userId?: string) {
  const p = `Analyze market share in a content creator's niche.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "analysis": [{"player": "market player", "share": "market share", "trend": "trend"}], "opportunity": "market opportunity", "positioning": "positioning strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSWOTAnalyzer(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Perform a SWOT analysis for a content creator.
${data.channelName ? `Channel: ${data.channelName}` : ""}
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "swot": {"strengths": "key strengths", "weaknesses": "key weaknesses", "opportunities": "opportunities", "threats": "threats"}, "actions": "recommended actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorSocialTracker(data: { competitors?: string[] }, userId?: string) {
  const p = `Track competitor social media activity for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON: { "tracking": [{"competitor": "competitor", "platform": "platform", "metrics": "key metrics"}], "insights": "actionable insights" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlueOceanFinder(data: { niche?: string; interests?: string[] }, userId?: string) {
  const p = `Find blue ocean opportunities for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.interests ? `Interests: ${data.interests.join(", ")}` : ""}
Respond as JSON: { "opportunities": [{"space": "opportunity space", "demand": "demand level", "competition": "competition level"}], "strategy": "entry strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for mobile viewing.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "mobile": "mobile optimization", "desktop": "desktop version"}], "responsive": "responsive design tips", "testing": "testing checklist" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAppDeepLinkBuilder(data: { platforms?: string[] }, userId?: string) {
  const p = `Build deep links for a content creator's app.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "links": [{"platform": "platform", "scheme": "URL scheme", "fallback": "fallback URL"}], "testing": "testing strategy", "analytics": "analytics tracking" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPushNotificationOptimizer(data: { types?: string[] }, userId?: string) {
  const p = `Optimize push notifications for a content creator's app.
${data.types ? `Notification types: ${data.types.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"type": "notification type", "timing": "optimal timing", "content": "content strategy"}], "frequency": "frequency recommendations", "segmentation": "audience segmentation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileVideoOptimizer(data: { format?: string }, userId?: string) {
  const p = `Optimize video for mobile playback.
${data.format ? `Format: ${data.format}` : ""}
Respond as JSON: { "optimization": [{"setting": "video setting", "value": "recommended value", "reason": "reason"}], "fileSize": "file size optimization", "quality": "quality preservation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiResponsiveDesignChecker(data: { pages?: string[] }, userId?: string) {
  const p = `Check responsive design for a content creator's website.
${data.pages ? `Pages: ${data.pages.join(", ")}` : ""}
Respond as JSON: { "issues": [{"page": "page name", "issue": "responsive issue", "fix": "fix recommendation"}], "breakpoints": "breakpoint recommendations", "testing": "testing devices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobilePaymentOptimizer(data: { products?: string[] }, userId?: string) {
  const p = `Optimize mobile payment experience for a content creator's store.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"method": "payment method", "setup": "setup steps", "conversion": "conversion impact"}], "trust": "trust signals", "testing": "testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOfflineContentPlanner(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Plan offline content strategy for a content creator's app.
${data.contentTypes ? `Content types: ${data.contentTypes.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"content": "content type", "caching": "caching strategy", "sync": "sync method"}], "PWA": "PWA implementation tips", "storage": "storage management" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileAnalyticsSetup(data: { platforms?: string[] }, userId?: string) {
  const p = `Set up mobile analytics for a content creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "setup": [{"tool": "analytics tool", "config": "configuration", "tracking": "what to track"}], "events": "key events to track", "funnels": "funnel setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAppStoreOptimizer(data: { appName?: string; category?: string }, userId?: string) {
  const p = `Optimize app store listing for a content creator's app.
${data.appName ? `App name: ${data.appName}` : ""}
${data.category ? `Category: ${data.category}` : ""}
Respond as JSON: { "optimization": [{"element": "store element", "current": "current state", "improved": "improved version"}], "keywords": "keyword strategy", "screenshots": "screenshot recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWidgetDesigner(data: { purpose?: string; platform?: string }, userId?: string) {
  const p = `Design widgets for a content creator's platform.
${data.purpose ? `Purpose: ${data.purpose}` : ""}
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "widgets": [{"name": "widget name", "design": "design description", "data": "data displayed", "interaction": "interaction type"}], "placement": "placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGestureOptimizer(data: { interactions?: string[] }, userId?: string) {
  const p = `Optimize gesture interactions for a content creator's mobile app.
${data.interactions ? `Interactions: ${data.interactions.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"gesture": "gesture type", "improvement": "improvement suggestion"}], "accessibility": "accessibility considerations", "feedback": "haptic feedback recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileFirstContentCreator(data: { contentType?: string }, userId?: string) {
  const p = `Create mobile-first content strategy for a content creator.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "strategy": [{"element": "content element", "mobile": "mobile-first approach", "adaptation": "adaptation method"}], "thumbZone": "thumb zone optimization", "scrolling": "scroll behavior recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWearableContentAdvisor(data: { devices?: string[] }, userId?: string) {
  const p = `Advise on content for wearable devices.
${data.devices ? `Devices: ${data.devices.join(", ")}` : ""}
Respond as JSON: { "content": [{"device": "device type", "format": "content format", "limitations": "limitations"}], "notifications": "notification strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPlatformSyncManager(data: { platforms?: string[] }, userId?: string) {
  const p = `Manage cross-platform content synchronization.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "sync": [{"data": "data type", "platforms": "platforms involved", "method": "sync method"}], "conflicts": "conflict resolution strategy", "realtime": "real-time sync options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartTVOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for Smart TV viewing.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "tvSetting": "TV-optimized setting"}], "navigation": "TV navigation design", "quality": "quality recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAchievementSystemBuilder(data: { community?: string }, userId?: string) {
  const p = `Design a gamification achievement system for a creator community.
${data.community ? `Community: ${data.community}` : ""}
Respond as JSON: { "achievements": [{"name": "achievement name", "criteria": "unlock criteria", "reward": "reward given", "rarity": "common/rare/epic/legendary"}], "progression": "progression system overview" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLeaderboardDesigner(data: { metrics?: string[] }, userId?: string) {
  const p = `Design engaging leaderboard systems for a content creator platform.
${data.metrics ? `Metrics to track: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "boards": [{"name": "leaderboard name", "metric": "tracked metric", "period": "time period", "prizes": "prize structure"}], "fairness": "fairness mechanisms" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPointsEconomyBuilder(data: { actions?: string[] }, userId?: string) {
  const p = `Build a points economy system for a creator community.
${data.actions ? `Actions to reward: ${data.actions.join(", ")}` : ""}
Respond as JSON: { "economy": [{"action": "user action", "points": "points awarded", "decay": "point decay rate"}], "rewards": "reward tiers and options", "inflation": "inflation control measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBadgeSystemCreator(data: { categories?: string[] }, userId?: string) {
  const p = `Create a badge system for a content creator platform.
${data.categories ? `Badge categories: ${data.categories.join(", ")}` : ""}
Respond as JSON: { "badges": [{"name": "badge name", "category": "badge category", "criteria": "earn criteria", "design": "visual design description"}], "progression": "badge progression path" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreakSystemBuilder(data: { activities?: string[] }, userId?: string) {
  const p = `Build a streak tracking system to encourage consistent creator activity.
${data.activities ? `Activities to track: ${data.activities.join(", ")}` : ""}
Respond as JSON: { "streaks": [{"activity": "tracked activity", "milestones": "streak milestones", "rewards": "milestone rewards"}], "recovery": "streak recovery mechanics", "notification": "notification strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProgressVisualizationEngine(data: { metrics?: string[] }, userId?: string) {
  const p = `Design progress visualization dashboards for creator metrics.
${data.metrics ? `Metrics to visualize: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "visualizations": [{"metric": "metric name", "chartType": "recommended chart type", "milestones": "visual milestones"}], "dashboard": "dashboard layout recommendation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChallengeSystemBuilder(data: { community?: string }, userId?: string) {
  const p = `Build a challenge system for a creator community to drive engagement.
${data.community ? `Community: ${data.community}` : ""}
Respond as JSON: { "challenges": [{"name": "challenge name", "rules": "challenge rules", "duration": "challenge duration", "reward": "reward for completion"}], "seasonal": "seasonal challenge plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMonthlyReportGenerator(data: { metrics?: any }, userId?: string) {
  const p = `Generate a comprehensive monthly performance report for a content creator.
${data.metrics ? `Metrics data: ${JSON.stringify(data.metrics)}` : ""}
Respond as JSON: { "report": [{"section": "report section", "data": "key data points", "insight": "actionable insight"}], "highlights": "month highlights summary", "goals": "next month goals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWeeklyDigestBuilder(data: { activities?: string[] }, userId?: string) {
  const p = `Build a weekly digest summary for a content creator.
${data.activities ? `Recent activities: ${data.activities.join(", ")}` : ""}
Respond as JSON: { "digest": [{"topic": "digest topic", "summary": "brief summary", "action": "recommended action"}], "metrics": "key metrics snapshot", "upcoming": "upcoming priorities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuarterlyBusinessReview(data: { financials?: any }, userId?: string) {
  const p = `Generate a quarterly business review for a content creator's business.
${data.financials ? `Financial data: ${JSON.stringify(data.financials)}` : ""}
Respond as JSON: { "review": [{"area": "business area", "performance": "performance summary", "target": "target vs actual"}], "strategy": "strategic recommendations", "adjustments": "suggested adjustments" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnnualStrategyPlanner(data: { goals?: string[] }, userId?: string) {
  const p = `Create an annual strategy plan for a content creator.
${data.goals ? `Annual goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"quarter": "Q1/Q2/Q3/Q4", "focus": "quarterly focus area", "milestones": "key milestones"}], "budget": "budget allocation plan", "risks": "risk assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorReportGenerator(data: { competitors?: string[] }, userId?: string) {
  const p = `Generate a competitor analysis report for a content creator.
${data.competitors ? `Competitors: ${data.competitors.join(", ")}` : ""}
Respond as JSON: { "report": [{"competitor": "competitor name", "analysis": "competitive analysis"}], "opportunities": "identified opportunities", "threats": "competitive threats" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceReportBuilder(data: { demographics?: any }, userId?: string) {
  const p = `Build an audience analysis report for a content creator.
${data.demographics ? `Demographics data: ${JSON.stringify(data.demographics)}` : ""}
Respond as JSON: { "report": [{"segment": "audience segment", "size": "segment size", "behavior": "behavior patterns"}], "growth": "growth opportunities", "targeting": "targeting recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentReportCard(data: { videos?: any[] }, userId?: string) {
  const p = `Generate a content report card grading a creator's recent content.
${data.videos ? `Videos: ${JSON.stringify(data.videos.slice(0, 10))}` : ""}
Respond as JSON: { "grades": [{"category": "grading category", "grade": "letter grade", "feedback": "specific feedback"}], "overall": "overall grade and summary", "improvements": "top improvements needed" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiROIReportGenerator(data: { investments?: any[] }, userId?: string) {
  const p = `Generate an ROI report for a content creator's investments.
${data.investments ? `Investments: ${JSON.stringify(data.investments.slice(0, 10))}` : ""}
Respond as JSON: { "roi": [{"investment": "investment description", "return": "return achieved", "recommendation": "keep/scale/cut"}], "total": "total ROI summary", "optimization": "optimization suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamingNicheOptimizer(data: { games?: string[] }, userId?: string) {
  const p = `Optimize a gaming content creator's niche strategy.
${data.games ? `Games covered: ${data.games.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"game": "game title", "opportunity": "content opportunity", "strategy": "recommended strategy"}], "trending": "trending games to consider", "schedule": "optimal upload schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBeautyNicheAdvisor(data: { subNiche?: string }, userId?: string) {
  const p = `Provide niche strategy advice for a beauty content creator.
${data.subNiche ? `Sub-niche: ${data.subNiche}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "strategy": "recommended strategy", "audience": "target audience"}], "trends": "current beauty trends", "brands": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTechReviewOptimizer(data: { category?: string }, userId?: string) {
  const p = `Optimize a tech review content creator's strategy.
${data.category ? `Tech category: ${data.category}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "strategy": "optimization strategy"}], "seoTips": "tech review SEO tips", "affiliate": "affiliate program recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFoodContentPlanner(data: { cuisine?: string }, userId?: string) {
  const p = `Plan content strategy for a food content creator.
${data.cuisine ? `Cuisine focus: ${data.cuisine}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "content concept", "seasonality": "seasonal relevance"}], "trends": "food content trends", "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFitnessContentStrategy(data: { specialty?: string }, userId?: string) {
  const p = `Create a content strategy for a fitness content creator.
${data.specialty ? `Fitness specialty: ${data.specialty}` : ""}
Respond as JSON: { "strategy": [{"pillar": "content pillar", "content": "content ideas", "audience": "target audience"}], "partnerships": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTravelContentOptimizer(data: { style?: string }, userId?: string) {
  const p = `Optimize content strategy for a travel content creator.
${data.style ? `Travel style: ${data.style}` : ""}
Respond as JSON: { "optimization": [{"aspect": "content aspect", "strategy": "optimization strategy"}], "sponsorships": "sponsorship opportunities", "gear": "recommended gear" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEducationContentPlanner(data: { subject?: string }, userId?: string) {
  const p = `Plan content strategy for an education content creator.
${data.subject ? `Subject area: ${data.subject}` : ""}
Respond as JSON: { "plan": [{"topic": "content topic", "format": "content format", "audience": "target audience"}], "credentials": "credibility building tips", "courses": "course creation opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinanceContentAdvisor(data: { specialty?: string }, userId?: string) {
  const p = `Advise on content strategy for a finance content creator.
${data.specialty ? `Finance specialty: ${data.specialty}` : ""}
Respond as JSON: { "advice": [{"topic": "content topic", "compliance": "compliance considerations", "format": "best format"}], "disclaimers": "required disclaimers", "affiliate": "affiliate opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiParentingContentStrategy(data: { ageGroup?: string }, userId?: string) {
  const p = `Create a content strategy for a parenting content creator.
${data.ageGroup ? `Target age group: ${data.ageGroup}` : ""}
Respond as JSON: { "strategy": [{"topic": "content topic", "approach": "content approach", "safety": "safety considerations"}], "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPetContentOptimizer(data: { petType?: string }, userId?: string) {
  const p = `Optimize content strategy for a pet content creator.
${data.petType ? `Pet type: ${data.petType}` : ""}
Respond as JSON: { "optimization": [{"content": "content type", "audience": "target audience", "brands": "brand opportunities"}], "viral": "viral content strategies", "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDIYCraftPlanner(data: { category?: string }, userId?: string) {
  const p = `Plan content strategy for a DIY and crafts content creator.
${data.category ? `Craft category: ${data.category}` : ""}
Respond as JSON: { "plan": [{"project": "project idea", "difficulty": "difficulty level", "materials": "materials needed"}], "series": "content series ideas", "monetization": "monetization approaches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicianContentStrategy(data: { genre?: string }, userId?: string) {
  const p = `Create a content strategy for a musician content creator.
${data.genre ? `Music genre: ${data.genre}` : ""}
Respond as JSON: { "strategy": [{"platform": "target platform", "content": "content type", "promotion": "promotion strategy"}], "distribution": "music distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiComedyContentAdvisor(data: { style?: string }, userId?: string) {
  const p = `Advise on content strategy for a comedy content creator.
${data.style ? `Comedy style: ${data.style}` : ""}
Respond as JSON: { "advice": [{"format": "content format", "platform": "best platform", "timing": "posting timing"}], "trends": "comedy trends", "safety": "content safety guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSportsContentPlanner(data: { sport?: string }, userId?: string) {
  const p = `Plan content strategy for a sports content creator.
${data.sport ? `Sport: ${data.sport}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "timing": "optimal timing", "rights": "rights considerations"}], "partnerships": "partnership opportunities", "live": "live content strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsCommentaryPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan content strategy for a news commentary content creator.
${data.niche ? `News niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"approach": "commentary approach", "format": "content format", "frequency": "posting frequency"}], "sourcing": "source verification tips", "liability": "legal liability considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLifestyleContentOptimizer(data: { aesthetic?: string }, userId?: string) {
  const p = `Optimize content strategy for a lifestyle content creator.
${data.aesthetic ? `Aesthetic style: ${data.aesthetic}` : ""}
Respond as JSON: { "optimization": [{"area": "content area", "strategy": "optimization strategy"}], "branding": "personal branding tips", "partnerships": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToBookConverter(data: { videos?: string[] }, userId?: string) {
  const p = `Plan converting video content into a book format.
${data.videos ? `Videos: ${data.videos.join(", ")}` : ""}
Respond as JSON: { "book": [{"chapter": "chapter title", "source": "source video", "content": "chapter content outline"}], "publishing": "publishing strategy", "marketing": "book marketing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToPodcastConverter(data: { videoTitle?: string }, userId?: string) {
  const p = `Plan converting a video into podcast format.
${data.videoTitle ? `Video title: ${data.videoTitle}` : ""}
Respond as JSON: { "conversion": {"audioEdit": "audio editing notes", "intro": "podcast intro script", "chapters": "chapter markers"}, "distribution": "podcast distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToCourseConverter(data: { videos?: string[] }, userId?: string) {
  const p = `Plan converting video content into an online course.
${data.videos ? `Videos: ${data.videos.join(", ")}` : ""}
Respond as JSON: { "course": [{"module": "module name", "videos": "included videos", "exercises": "practice exercises"}], "platform": "recommended platform", "pricing": "pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlogToVideoConverter(data: { blogPost?: string }, userId?: string) {
  const p = `Plan converting a blog post into video content.
${data.blogPost ? `Blog post: ${data.blogPost}` : ""}
Respond as JSON: { "video": {"script": "video script outline", "visuals": "visual elements needed", "duration": "estimated duration"}, "seo": "video SEO strategy", "promotion": "promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitterThreadCreator(data: { content?: string }, userId?: string) {
  const p = `Create an engaging Twitter/X thread from content.
${data.content ? `Content to adapt: ${data.content}` : ""}
Respond as JSON: { "thread": [{"tweet": "tweet text", "media": "media suggestion"}], "timing": "optimal posting time", "engagement": "engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInContentAdapter(data: { content?: string }, userId?: string) {
  const p = `Adapt content for LinkedIn platform.
${data.content ? `Content to adapt: ${data.content}` : ""}
Respond as JSON: { "adapted": {"post": "LinkedIn post text", "article": "article version", "carousel": "carousel slide ideas"}, "timing": "optimal posting time" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPinterestPinCreator(data: { content?: string }, userId?: string) {
  const p = `Create optimized Pinterest pins from content.
${data.content ? `Content to adapt: ${data.content}` : ""}
Respond as JSON: { "pins": [{"title": "pin title", "description": "pin description", "design": "design recommendations"}], "boards": "board strategy", "seo": "Pinterest SEO tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRedditPostOptimizer(data: { content?: string; subreddit?: string }, userId?: string) {
  const p = `Optimize content for Reddit posting.
${data.content ? `Content: ${data.content}` : ""}
${data.subreddit ? `Target subreddit: ${data.subreddit}` : ""}
Respond as JSON: { "optimized": {"title": "optimized title", "body": "post body", "timing": "best posting time"}, "rules": "subreddit rules to follow", "engagement": "engagement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuoraAnswerWriter(data: { topic?: string }, userId?: string) {
  const p = `Create strategic Quora answers to drive traffic and authority.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "answers": [{"question": "target question", "answer": "answer outline", "links": "strategic link placement"}], "strategy": "Quora growth strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediumArticleAdapter(data: { content?: string }, userId?: string) {
  const p = `Adapt content for Medium publication.
${data.content ? `Content to adapt: ${data.content}` : ""}
Respond as JSON: { "article": {"title": "article title", "body": "article structure", "tags": "recommended tags"}, "distribution": "distribution strategy", "earnings": "Medium earnings optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSlidedeckCreator(data: { topic?: string }, userId?: string) {
  const p = `Create a slide deck presentation from content.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "slides": [{"title": "slide title", "content": "slide content", "visual": "visual suggestion"}], "design": "design theme recommendation", "sharing": "distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfographicRepurposer(data: { data?: string }, userId?: string) {
  const p = `Repurpose content data into infographic format.
${data.data ? `Data to visualize: ${data.data}` : ""}
Respond as JSON: { "infographic": {"layout": "layout structure", "sections": "content sections", "design": "design guidelines"}, "platforms": "platform-specific sizing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabMatchScorer(data: { creator1?: any; creator2?: any }, userId?: string) {
  const p = `Score the collaboration compatibility between two creators.
${data.creator1 ? `Creator 1: ${JSON.stringify(data.creator1)}` : ""}
${data.creator2 ? `Creator 2: ${JSON.stringify(data.creator2)}` : ""}
Respond as JSON: { "score": "compatibility score 0-100", "compatibility": "compatibility analysis", "format": "best collab format", "risks": "potential risks", "benefits": "expected benefits" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContractWriter(data: { terms?: any }, userId?: string) {
  const p = `Draft collaboration contract terms for content creators.
${data.terms ? `Terms: ${JSON.stringify(data.terms)}` : ""}
Respond as JSON: { "contract": [{"clause": "contract clause", "detail": "clause details"}], "negotiation": "negotiation tips", "protection": "creator protection measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabRevenueCalculator(data: { creators?: any[] }, userId?: string) {
  const p = `Calculate projected collaboration revenue and split.
${data.creators ? `Creators: ${JSON.stringify(data.creators.slice(0, 5))}` : ""}
Respond as JSON: { "revenue": {"split": "revenue split recommendation", "projected": "projected earnings", "terms": "payment terms"}, "negotiation": "negotiation framework" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContentIdeator(data: { creators?: string[]; niches?: string[] }, userId?: string) {
  const p = `Generate collaboration content ideas for creators.
${data.creators ? `Creators: ${data.creators.join(", ")}` : ""}
${data.niches ? `Niches: ${data.niches.join(", ")}` : ""}
Respond as JSON: { "ideas": [{"concept": "content concept", "format": "content format", "audience": "target audience"}], "distribution": "distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabOutreachWriter(data: { target?: string; reason?: string }, userId?: string) {
  const p = `Write collaboration outreach messages.
${data.target ? `Target creator: ${data.target}` : ""}
${data.reason ? `Reason for collab: ${data.reason}` : ""}
Respond as JSON: { "outreach": {"subject": "message subject", "body": "message body", "followUp": "follow-up message"}, "platform": "best outreach platform", "timing": "optimal timing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabPerformanceTracker(data: { collabs?: any[] }, userId?: string) {
  const p = `Track and analyze collaboration performance.
${data.collabs ? `Collaborations: ${JSON.stringify(data.collabs.slice(0, 5))}` : ""}
Respond as JSON: { "performance": [{"collab": "collaboration name", "metrics": "key metrics", "roi": "return on investment"}], "learnings": "key learnings" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkEffectCalculator(data: { connections?: number }, userId?: string) {
  const p = `Calculate network effects and growth potential for a creator.
${data.connections ? `Current connections: ${data.connections}` : ""}
Respond as JSON: { "effect": {"current": "current network value", "potential": "growth potential", "strategy": "network growth strategy"}, "growth": "growth projections" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubMilestoneStrategyBuilder(data: { target?: number; current?: number }, userId?: string) {
  const p = `Build a subscriber milestone achievement strategy.
${data.target ? `Target subscribers: ${data.target}` : ""}
${data.current ? `Current subscribers: ${data.current}` : ""}
Respond as JSON: { "strategy": [{"milestone": "subscriber milestone", "tactics": "growth tactics", "timeline": "estimated timeline"}], "celebrations": "milestone celebration ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubRetentionOptimizer(data: { churnRate?: number }, userId?: string) {
  const p = `Optimize subscriber retention and reduce churn.
${data.churnRate ? `Current churn rate: ${data.churnRate}%` : ""}
Respond as JSON: { "optimization": [{"strategy": "retention strategy", "implementation": "implementation steps"}], "notifications": "notification optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNotificationBellOptimizer(data: { bellClickRate?: number }, userId?: string) {
  const p = `Optimize notification bell click-through rates.
${data.bellClickRate ? `Current bell click rate: ${data.bellClickRate}%` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "how to implement"}], "messaging": "notification messaging strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFirstVideoOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize a creator's first video for maximum impact.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimization": [{"element": "video element", "strategy": "optimization strategy"}], "hook": "opening hook strategy", "promotion": "first video promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelMembershipPerks(data: { tiers?: any[] }, userId?: string) {
  const p = `Design channel membership perks and tiers.
${data.tiers ? `Current tiers: ${JSON.stringify(data.tiers)}` : ""}
Respond as JSON: { "perks": [{"tier": "membership tier", "perks": "tier perks", "value": "perceived value"}], "exclusive": "exclusive content ideas", "retention": "member retention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubCountdownPlanner(data: { target?: number; current?: number }, userId?: string) {
  const p = `Plan a subscriber countdown event and campaign.
${data.target ? `Target subscribers: ${data.target}` : ""}
${data.current ? `Current subscribers: ${data.current}` : ""}
Respond as JSON: { "plan": [{"phase": "campaign phase", "actions": "specific actions"}], "content": "special content ideas", "community": "community engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUnsubscribeAnalyzer(data: { reasons?: string[] }, userId?: string) {
  const p = `Analyze unsubscribe patterns and provide prevention strategies.
${data.reasons ? `Known reasons: ${data.reasons.join(", ")}` : ""}
Respond as JSON: { "analysis": [{"reason": "unsubscribe reason", "percentage": "estimated percentage", "solution": "prevention solution"}], "prevention": "overall prevention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubQualityAnalyzer(data: { engagement?: number }, userId?: string) {
  const p = `Analyze subscriber quality and engagement levels.
${data.engagement ? `Engagement rate: ${data.engagement}%` : ""}
Respond as JSON: { "quality": {"active": "active subscriber analysis", "passive": "passive subscriber analysis", "ghost": "ghost subscriber analysis"}, "reEngagement": "re-engagement strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrowthHackingPlaybook(data: { niche?: string; stage?: string }, userId?: string) {
  const p = `Create a growth hacking playbook for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
${data.stage ? `Growth stage: ${data.stage}` : ""}
Respond as JSON: { "playbook": [{"hack": "growth hack", "implementation": "implementation steps", "risk": "risk level"}], "priority": "prioritized action plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralGrowthEngineBuilder(data: { mechanics?: string[] }, userId?: string) {
  const p = `Build a viral growth engine for content distribution.
${data.mechanics ? `Growth mechanics: ${data.mechanics.join(", ")}` : ""}
Respond as JSON: { "engine": [{"mechanic": "viral mechanic", "trigger": "activation trigger", "amplifier": "amplification method"}], "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPromotionPlanner(data: { platforms?: string[] }, userId?: string) {
  const p = `Plan cross-platform content promotion strategy.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "plan": [{"from": "source platform", "to": "target platform", "content": "content adaptation", "timing": "posting timing"}], "automation": "automation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatchTimeBooster(data: { avgDuration?: string }, userId?: string) {
  const p = `Provide strategies to boost video watch time and retention.
${data.avgDuration ? `Current average watch duration: ${data.avgDuration}` : ""}
Respond as JSON: { "boosters": [{"technique": "retention technique", "placement": "where to apply", "impact": "expected impact"}], "structure": "optimal video structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOpenLoopCreator(data: { topic?: string }, userId?: string) {
  const p = `Create open loop storytelling hooks for video retention.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "loops": [{"setup": "open loop setup", "payoff": "payoff delivery", "timing": "timing in video"}], "retention": "retention impact analysis", "placement": "strategic placement guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatternInterruptDesigner(data: { frequency?: string }, userId?: string) {
  const p = `Design pattern interrupts to maintain viewer attention.
${data.frequency ? `Desired frequency: ${data.frequency}` : ""}
Respond as JSON: { "interrupts": [{"type": "interrupt type", "timing": "when to use", "execution": "how to execute"}], "variety": "variety recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReEngagementHookBuilder(data: { dropOffPoints?: string[] }, userId?: string) {
  const p = `Build re-engagement hooks for video drop-off points.
${data.dropOffPoints ? `Drop-off points: ${data.dropOffPoints.join(", ")}` : ""}
Respond as JSON: { "hooks": [{"point": "drop-off point", "hook": "re-engagement hook", "technique": "technique used"}], "testing": "testing methodology" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBingeWatchOptimizer(data: { series?: string[] }, userId?: string) {
  const p = `Optimize content for binge-watching behavior.
${data.series ? `Content series: ${data.series.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "strategy": "optimization strategy"}], "endScreens": "end screen strategy", "cards": "card placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeStudioOptimizer(data: { settings?: string[] }, userId?: string) {
  const p = `Optimize YouTube Studio settings for maximum channel performance.
${data.settings ? `Current settings: ${data.settings.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"setting": "studio setting", "recommended": "recommended value"}], "advanced": "advanced settings tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeShortsAlgorithm(data: { niche?: string }, userId?: string) {
  const p = `Decode and optimize for the YouTube Shorts algorithm.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "algorithm": [{"signal": "algorithm signal", "weight": "importance weight", "optimization": "how to optimize"}], "testing": "testing strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeCommentsManager(data: { volume?: string }, userId?: string) {
  const p = `Create a YouTube comments management strategy.
${data.volume ? `Comment volume: ${data.volume}` : ""}
Respond as JSON: { "management": [{"type": "comment type", "response": "response template", "automation": "automation option"}], "moderation": "moderation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubePlaylistStrategy(data: { categories?: string[] }, userId?: string) {
  const p = `Design an optimal YouTube playlist strategy.
${data.categories ? `Content categories: ${data.categories.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"playlist": "playlist name", "purpose": "playlist purpose", "seo": "SEO optimization"}], "ordering": "video ordering strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubePremierePlanner(data: { videoTitle?: string }, userId?: string) {
  const p = `Plan a YouTube Premiere event for maximum engagement.
${data.videoTitle ? `Video title: ${data.videoTitle}` : ""}
Respond as JSON: { "plan": [{"phase": "premiere phase", "action": "specific action", "timing": "timing"}], "chat": "live chat strategy", "promotion": "pre-premiere promotion" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeMembeshipStrategy(data: { currentMembers?: number }, userId?: string) {
  const p = `Create a YouTube channel membership growth strategy.
${data.currentMembers ? `Current members: ${data.currentMembers}` : ""}
Respond as JSON: { "strategy": [{"tier": "membership tier", "content": "exclusive content", "pricing": "pricing recommendation"}], "retention": "member retention tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeSuperThanksOptimizer(data: { avgThanks?: number }, userId?: string) {
  const p = `Optimize YouTube Super Thanks revenue.
${data.avgThanks ? `Average Super Thanks per video: ${data.avgThanks}` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "how to implement"}], "triggers": "Super Thanks triggers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeHandleOptimizer(data: { currentHandle?: string }, userId?: string) {
  const p = `Optimize YouTube channel handle for branding and SEO.
${data.currentHandle ? `Current handle: ${data.currentHandle}` : ""}
Respond as JSON: { "recommendations": [{"handle": "suggested handle", "reasoning": "why this handle", "availability": "likely availability"}], "seo": "handle SEO impact" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeChannelPageOptimizer(data: { sections?: string[] }, userId?: string) {
  const p = `Optimize YouTube channel page layout and sections.
${data.sections ? `Current sections: ${data.sections.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"section": "page section", "change": "recommended change"}], "layout": "optimal layout order", "branding": "branding consistency tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeHashtagStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a YouTube hashtag strategy for discoverability.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"hashtag": "recommended hashtag", "usage": "when to use", "volume": "search volume estimate"}], "trending": "trending hashtag tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchEmoteStrategy(data: { subCount?: number }, userId?: string) {
  const p = `Design a Twitch emote strategy for community building.
${data.subCount ? `Current sub count: ${data.subCount}` : ""}
Respond as JSON: { "strategy": [{"tier": "sub tier", "emotes": "emote ideas", "community": "community impact"}], "creation": "emote creation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchBitsOptimizer(data: { avgBits?: number }, userId?: string) {
  const p = `Optimize Twitch Bits revenue and engagement.
${data.avgBits ? `Average bits per stream: ${data.avgBits}` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "implementation steps"}], "incentives": "bits incentive ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchRaidOptimizer(data: { avgViewers?: number }, userId?: string) {
  const p = `Optimize Twitch raid strategy for network growth.
${data.avgViewers ? `Average viewers: ${data.avgViewers}` : ""}
Respond as JSON: { "optimization": [{"strategy": "raid strategy", "timing": "optimal timing", "targets": "ideal raid targets"}], "etiquette": "raid etiquette guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchChannelPointsDesigner(data: { points?: string[] }, userId?: string) {
  const p = `Design Twitch channel points rewards system.
${data.points ? `Current rewards: ${data.points.join(", ")}` : ""}
Respond as JSON: { "design": [{"reward": "reward name", "cost": "point cost", "engagement": "engagement impact"}], "economy": "points economy balance" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchPredictionsCreator(data: { streamType?: string }, userId?: string) {
  const p = `Create engaging Twitch Predictions for stream interaction.
${data.streamType ? `Stream type: ${data.streamType}` : ""}
Respond as JSON: { "predictions": [{"question": "prediction question", "options": "prediction options", "timing": "when to run"}], "engagement": "engagement maximization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchHypeTrainMaximizer(data: { avgTrain?: number }, userId?: string) {
  const p = `Maximize Twitch Hype Train frequency and levels.
${data.avgTrain ? `Average hype trains per stream: ${data.avgTrain}` : ""}
Respond as JSON: { "maximizer": [{"tactic": "hype train tactic", "timing": "optimal timing"}], "triggers": "hype train triggers", "goals": "level goals strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchClipStrategy(data: { genre?: string }, userId?: string) {
  const p = `Create a Twitch clip strategy for content promotion.
${data.genre ? `Content genre: ${data.genre}` : ""}
Respond as JSON: { "strategy": [{"moment": "clip-worthy moment", "action": "clipping action", "promotion": "clip promotion"}], "compilation": "clip compilation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchVODOptimizer(data: { avgVODViews?: number }, userId?: string) {
  const p = `Optimize Twitch VOD performance and discoverability.
${data.avgVODViews ? `Average VOD views: ${data.avgVODViews}` : ""}
Respond as JSON: { "optimization": [{"element": "VOD element", "change": "recommended change"}], "highlights": "highlight creation strategy", "youtube": "YouTube repurposing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchPanelDesigner(data: { style?: string }, userId?: string) {
  const p = `Design Twitch channel panels for maximum impact.
${data.style ? `Desired style: ${data.style}` : ""}
Respond as JSON: { "panels": [{"name": "panel name", "content": "panel content", "design": "design specs"}], "layout": "panel layout order", "links": "strategic link placement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickStreamOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize streaming strategy for the Kick platform.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "strategy": "recommended strategy"}], "differences": "Kick vs Twitch differences", "growth": "Kick-specific growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickMonetizationAdvisor(data: { viewers?: number }, userId?: string) {
  const p = `Advise on Kick platform monetization strategies.
${data.viewers ? `Average viewers: ${data.viewers}` : ""}
Respond as JSON: { "monetization": [{"method": "monetization method", "potential": "earning potential"}], "comparison": "Kick vs Twitch earnings comparison" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickCommunityBuilder(data: { category?: string }, userId?: string) {
  const p = `Build a community on the Kick streaming platform.
${data.category ? `Content category: ${data.category}` : ""}
Respond as JSON: { "community": [{"strategy": "community strategy", "implementation": "implementation steps"}], "discord": "Discord integration plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickContentDifferentiator(data: { twitchContent?: string }, userId?: string) {
  const p = `Differentiate Kick content from Twitch content strategy.
${data.twitchContent ? `Current Twitch content: ${data.twitchContent}` : ""}
Respond as JSON: { "differentiation": [{"aspect": "content aspect", "approach": "Kick-specific approach"}], "exclusive": "Kick-exclusive content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickDiscoveryOptimizer(data: { category?: string }, userId?: string) {
  const p = `Optimize discoverability on the Kick platform.
${data.category ? `Content category: ${data.category}` : ""}
Respond as JSON: { "discovery": [{"method": "discovery method", "implementation": "how to implement"}], "tags": "tag optimization strategy", "timing": "optimal streaming times" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiPlatformStreamRouter(data: { platforms?: string[] }, userId?: string) {
  const p = `Design a multi-platform streaming routing strategy.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "routing": [{"platform": "platform name", "config": "configuration", "priority": "priority level"}], "sync": "synchronization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamDeckConfigurer(data: { scenes?: string[] }, userId?: string) {
  const p = `Configure Stream Deck for optimal streaming workflow.
${data.scenes ? `Scenes: ${data.scenes.join(", ")}` : ""}
Respond as JSON: { "config": [{"button": "button assignment", "action": "button action", "scene": "associated scene"}], "profiles": "profile recommendations", "macros": "useful macros" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOBSOptimizer(data: { system?: string }, userId?: string) {
  const p = `Optimize OBS settings for best streaming quality.
${data.system ? `System specs: ${data.system}` : ""}
Respond as JSON: { "optimization": [{"setting": "OBS setting", "value": "recommended value", "reason": "why this value"}], "scenes": "scene setup recommendations", "filters": "filter recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamLabsConfigurator(data: { features?: string[] }, userId?: string) {
  const p = `Configure Streamlabs for optimal streaming setup.
${data.features ? `Features to configure: ${data.features.join(", ")}` : ""}
Respond as JSON: { "config": [{"feature": "feature name", "setup": "configuration steps"}], "alerts": "alert configuration", "widgets": "widget recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamElementsOptimizer(data: { features?: string[] }, userId?: string) {
  const p = `Optimize StreamElements configuration for engagement.
${data.features ? `Features to optimize: ${data.features.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"feature": "feature name", "config": "optimal configuration"}], "overlays": "overlay recommendations", "commands": "chat command setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChaturbateStreamAdvisor(data: { niche?: string }, userId?: string) {
  const p = `Provide streaming strategy advice for adult content platforms.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "strategy": "recommended strategy"}], "moderation": "moderation guidelines", "revenue": "revenue optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokAlgorithmDecoder(data: { niche?: string }, userId?: string) {
  const p = `Decode and optimize for the TikTok algorithm.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "algorithm": [{"signal": "algorithm signal", "weight": "importance weight", "optimization": "optimization tip"}], "fyp": "For You Page strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokSoundStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a TikTok sound and music strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"sound": "sound type", "trend": "trend alignment", "usage": "usage strategy"}], "original": "original sound creation tips", "timing": "trending sound timing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokDuetStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a TikTok Duet content strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"target": "duet target type", "angle": "content angle", "value": "value added"}], "etiquette": "duet etiquette guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokLiveOptimizer(data: { followers?: number }, userId?: string) {
  const p = `Optimize TikTok Live streaming for engagement and gifts.
${data.followers ? `Current followers: ${data.followers}` : ""}
Respond as JSON: { "optimization": [{"element": "live element", "strategy": "optimization strategy"}], "gifts": "gift maximization tactics", "engagement": "live engagement techniques" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokShopAdvisor(data: { products?: string[] }, userId?: string) {
  const p = `Advise on TikTok Shop strategy and product promotion.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "advice": [{"product": "product type", "strategy": "promotion strategy", "promotion": "content format"}], "affiliate": "affiliate program tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokCreatorFundOptimizer(data: { views?: number }, userId?: string) {
  const p = `Optimize TikTok Creator Fund earnings.
${data.views ? `Average views: ${data.views}` : ""}
Respond as JSON: { "optimization": [{"strategy": "optimization strategy", "impact": "expected impact"}], "eligibility": "eligibility requirements and tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokHashtagResearcher(data: { niche?: string }, userId?: string) {
  const p = `Research and recommend TikTok hashtags for maximum reach.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "hashtags": [{"tag": "hashtag", "views": "estimated views", "competition": "competition level"}], "trending": "trending hashtag strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokProfileOptimizer(data: { bio?: string }, userId?: string) {
  const p = `Optimize TikTok profile for maximum conversions.
${data.bio ? `Current bio: ${data.bio}` : ""}
Respond as JSON: { "optimization": [{"element": "profile element", "improvement": "suggested improvement"}], "link": "link-in-bio strategy", "branding": "branding consistency tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramReelsOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Instagram Reels for algorithm performance.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimization": [{"element": "reel element", "strategy": "optimization strategy"}], "algorithm": "algorithm insights", "trending": "trending content formats" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramStoriesPlanner(data: { frequency?: string }, userId?: string) {
  const p = `Plan an Instagram Stories content strategy.
${data.frequency ? `Posting frequency: ${data.frequency}` : ""}
Respond as JSON: { "plan": [{"type": "story type", "content": "content idea", "timing": "posting time"}], "stickers": "interactive sticker strategy", "engagement": "engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramCarouselCreator(data: { topic?: string }, userId?: string) {
  const p = `Create an engaging Instagram carousel post.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "carousel": [{"slide": "slide number", "content": "slide content", "design": "design notes"}], "caption": "carousel caption", "hashtags": "recommended hashtags" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramBioOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Instagram bio for maximum profile conversions.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimization": [{"element": "bio element", "improvement": "suggested improvement"}], "link": "link-in-bio strategy", "highlights": "story highlights strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramShoppingSetup(data: { products?: string[] }, userId?: string) {
  const p = `Set up and optimize Instagram Shopping features.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration details"}], "catalog": "product catalog strategy", "tagging": "product tagging best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramCollabManager(data: { partners?: string[] }, userId?: string) {
  const p = `Manage Instagram collaboration partnerships.
${data.partners ? `Partners: ${data.partners.join(", ")}` : ""}
Respond as JSON: { "management": [{"partner": "partner name", "format": "collab format", "terms": "partnership terms"}], "tracking": "performance tracking plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramGrowthHacker(data: { followers?: number }, userId?: string) {
  const p = `Create Instagram growth hacking strategies.
${data.followers ? `Current followers: ${data.followers}` : ""}
Respond as JSON: { "hacks": [{"tactic": "growth tactic", "implementation": "implementation steps", "risk": "risk level"}], "organic": "organic growth fundamentals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramAestheticPlanner(data: { style?: string }, userId?: string) {
  const p = `Plan an Instagram aesthetic and visual brand.
${data.style ? `Desired style: ${data.style}` : ""}
Respond as JSON: { "plan": [{"element": "aesthetic element", "specification": "design specification"}], "grid": "grid layout strategy", "consistency": "visual consistency guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiXTwitterGrowthStrategy(data: { followers?: number }, userId?: string) {
  const p = `Create a growth strategy for X/Twitter.
${data.followers ? `Current followers: ${data.followers}` : ""}
Respond as JSON: { "strategy": [{"tactic": "growth tactic", "implementation": "implementation steps"}], "threads": "thread strategy", "spaces": "Twitter Spaces strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiXTwitterThreadWriter(data: { topic?: string }, userId?: string) {
  const p = `Write an engaging X/Twitter thread.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "thread": [{"tweet": "tweet content", "hook": "engagement hook"}], "timing": "optimal posting time", "engagement": "engagement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInCreatorStrategy(data: { industry?: string }, userId?: string) {
  const p = `Create a LinkedIn creator content strategy.
${data.industry ? `Industry: ${data.industry}` : ""}
Respond as JSON: { "strategy": [{"content": "content type", "format": "content format", "timing": "posting schedule"}], "newsletter": "LinkedIn newsletter strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInArticleWriter(data: { topic?: string }, userId?: string) {
  const p = `Write an optimized LinkedIn article.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "article": {"title": "article title", "outline": "article outline", "cta": "call to action"}, "seo": "LinkedIn SEO tips", "distribution": "article distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookGroupManager(data: { community?: string }, userId?: string) {
  const p = `Create a Facebook Group management strategy.
${data.community ? `Community focus: ${data.community}` : ""}
Respond as JSON: { "management": [{"area": "management area", "strategy": "management strategy"}], "engagement": "engagement tactics", "rules": "group rules framework" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookReelsOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Facebook Reels for maximum reach.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "optimization": [{"element": "reel element", "strategy": "optimization strategy"}], "algorithm": "Facebook Reels algorithm insights" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSnapchatSpotlightAdvisor(data: { niche?: string }, userId?: string) {
  const p = `Advise on Snapchat Spotlight content strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "advice": [{"strategy": "content strategy", "content": "content ideas", "timing": "posting timing"}], "earnings": "Spotlight earnings optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThreadsStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a Threads platform content strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"approach": "content approach", "content": "content type", "timing": "posting timing"}], "growth": "Threads growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordServerOptimizer(data: { members?: number }, userId?: string) {
  const p = `Optimize a Discord server for community engagement.
${data.members ? `Current members: ${data.members}` : ""}
Respond as JSON: { "optimization": [{"area": "server area", "change": "recommended change"}], "bots": "bot recommendations", "events": "community event ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatreonContentPlanner(data: { tiers?: any[] }, userId?: string) {
  const p = `Plan Patreon content strategy across tiers.
${data.tiers ? `Current tiers: ${JSON.stringify(data.tiers)}` : ""}
Respond as JSON: { "plan": [{"tier": "tier name", "content": "exclusive content", "schedule": "content schedule"}], "exclusive": "exclusive content ideas", "retention": "patron retention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubstackOptimizer(data: { subscribers?: number }, userId?: string) {
  const p = `Optimize Substack newsletter for growth and monetization.
${data.subscribers ? `Current subscribers: ${data.subscribers}` : ""}
Respond as JSON: { "optimization": [{"element": "newsletter element", "strategy": "optimization strategy"}], "growth": "subscriber growth tactics", "paid": "paid subscription strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGumroadProductOptimizer(data: { products?: string[] }, userId?: string) {
  const p = `Optimize Gumroad product listings and sales.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"product": "product name", "improvement": "suggested improvement"}], "pricing": "pricing strategy", "marketing": "marketing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeachableCoursePlanner(data: { topic?: string }, userId?: string) {
  const p = `Plan an online course on Teachable platform.
${data.topic ? `Course topic: ${data.topic}` : ""}
Respond as JSON: { "plan": [{"module": "module name", "content": "module content", "pricing": "module pricing"}], "marketing": "course marketing strategy", "launch": "launch plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBuyMeCoffeeOptimizer(data: { supporters?: number }, userId?: string) {
  const p = `Optimize Buy Me a Coffee page for supporter growth.
${data.supporters ? `Current supporters: ${data.supporters}` : ""}
Respond as JSON: { "optimization": [{"strategy": "optimization strategy", "implementation": "implementation steps"}], "perks": "supporter perks ideas", "growth": "supporter growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetirementPlanner(data: { income?: number; age?: number }, userId?: string) {
  const p = `Create a retirement plan for a content creator.
${data.income ? `Annual income: $${data.income}` : ""}${data.age ? ` Age: ${data.age}` : ""}
Respond as JSON: { "plan": [{"phase": "retirement phase", "savings": "savings target", "investments": "investment strategy"}], "timeline": "retirement timeline", "strategies": "key strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmergencyFundAdvisor(data: { monthlyExpenses?: number }, userId?: string) {
  const p = `Advise on building an emergency fund for a content creator.
${data.monthlyExpenses ? `Monthly expenses: $${data.monthlyExpenses}` : ""}
Respond as JSON: { "target": "target amount", "plan": [{"month": "month number", "contribution": "contribution amount"}], "accounts": "recommended account types", "tips": "saving tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInvestmentAdvisor(data: { risk?: string; capital?: number }, userId?: string) {
  const p = `Provide investment advice for a content creator.
${data.risk ? `Risk tolerance: ${data.risk}` : ""}${data.capital ? ` Available capital: $${data.capital}` : ""}
Respond as JSON: { "portfolio": [{"asset": "asset class", "allocation": "percentage allocation", "reasoning": "why this allocation"}], "rebalancing": "rebalancing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDebtPayoffPlanner(data: { debts?: any[] }, userId?: string) {
  const p = `Create a debt payoff plan for a content creator.
${data.debts ? `Debts: ${JSON.stringify(data.debts)}` : ""}
Respond as JSON: { "plan": [{"debt": "debt name", "strategy": "payoff strategy", "timeline": "payoff timeline"}], "savings": "interest savings", "priority": "debt priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRealEstateInvestor(data: { budget?: number; goals?: string[] }, userId?: string) {
  const p = `Advise on real estate investment strategies for a content creator.
${data.budget ? `Budget: $${data.budget}` : ""}${data.goals ? ` Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "strategies": [{"type": "investment type", "roi": "expected ROI", "timeline": "investment timeline"}], "markets": "recommended markets", "financing": "financing options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCryptoPortfolioAdvisor(data: { risk?: string; investment?: number }, userId?: string) {
  const p = `Build a cryptocurrency portfolio for a content creator.
${data.risk ? `Risk tolerance: ${data.risk}` : ""}${data.investment ? ` Investment amount: $${data.investment}` : ""}
Respond as JSON: { "portfolio": [{"coin": "cryptocurrency", "allocation": "percentage", "thesis": "investment thesis"}], "security": "security recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFreelancePricingGuide(data: { skill?: string; experience?: string }, userId?: string) {
  const p = `Create a freelance pricing guide for a content creator.
${data.skill ? `Skill: ${data.skill}` : ""}${data.experience ? ` Experience level: ${data.experience}` : ""}
Respond as JSON: { "pricing": [{"service": "service offered", "rate": "suggested rate", "model": "pricing model"}], "negotiation": "negotiation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrantFinder(data: { niche?: string; type?: string }, userId?: string) {
  const p = `Find grants available for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}${data.type ? ` Grant type: ${data.type}` : ""}
Respond as JSON: { "grants": [{"name": "grant name", "amount": "grant amount", "eligibility": "eligibility criteria", "deadline": "application deadline"}], "tips": "application tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBudgetTrackerSetup(data: { income?: number; categories?: string[] }, userId?: string) {
  const p = `Set up a budget tracker for a content creator.
${data.income ? `Monthly income: $${data.income}` : ""}${data.categories ? ` Categories: ${data.categories.join(", ")}` : ""}
Respond as JSON: { "budget": [{"category": "budget category", "allocation": "monthly allocation"}], "tools": "recommended tools", "automation": "automation suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinancialGoalSetter(data: { goals?: string[]; timeframe?: string }, userId?: string) {
  const p = `Set financial goals for a content creator.
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}${data.timeframe ? ` Timeframe: ${data.timeframe}` : ""}
Respond as JSON: { "goals": [{"goal": "financial goal", "target": "target amount", "milestones": "key milestones"}], "tracking": "tracking methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCameraRecommender(data: { budget?: number; usage?: string }, userId?: string) {
  const p = `Recommend cameras for a content creator.
${data.budget ? `Budget: $${data.budget}` : ""}${data.usage ? ` Usage: ${data.usage}` : ""}
Respond as JSON: { "recommendations": [{"camera": "camera model", "price": "price", "pros": "advantages", "cons": "disadvantages"}], "accessories": "recommended accessories" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMicrophoneAdvisor(data: { type?: string; budget?: number }, userId?: string) {
  const p = `Recommend microphones for a content creator.
${data.type ? `Type: ${data.type}` : ""}${data.budget ? ` Budget: $${data.budget}` : ""}
Respond as JSON: { "recommendations": [{"mic": "microphone model", "type": "microphone type", "price": "price", "best": "best use case"}], "setup": "setup recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLightingSetupPlanner(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Plan a lighting setup for a content creator studio.
${data.budget ? `Budget: $${data.budget}` : ""}${data.space ? ` Space: ${data.space}` : ""}
Respond as JSON: { "setup": [{"light": "light name", "position": "placement position", "purpose": "lighting purpose"}], "total": "total cost", "ambient": "ambient lighting tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditingSoftwareAdvisor(data: { level?: string; platform?: string }, userId?: string) {
  const p = `Recommend editing software for a content creator.
${data.level ? `Skill level: ${data.level}` : ""}${data.platform ? ` Platform: ${data.platform}` : ""}
Respond as JSON: { "recommendations": [{"software": "software name", "price": "pricing", "features": "key features"}], "workflow": "recommended workflow" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStudioDesignPlanner(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Design a content creation studio.
${data.budget ? `Budget: $${data.budget}` : ""}${data.space ? ` Space dimensions: ${data.space}` : ""}
Respond as JSON: { "design": [{"zone": "studio zone", "equipment": "required equipment", "cost": "estimated cost"}], "acoustics": "acoustic treatment plan", "layout": "optimal layout" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGreenScreenSetup(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Plan a green screen setup for a content creator.
${data.budget ? `Budget: $${data.budget}` : ""}${data.space ? ` Space: ${data.space}` : ""}
Respond as JSON: { "setup": [{"item": "equipment item", "specification": "specs", "cost": "cost"}], "software": "recommended software", "tips": "setup tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeleprompterAdvisor(data: { type?: string; budget?: number }, userId?: string) {
  const p = `Recommend teleprompter solutions for a content creator.
${data.type ? `Type: ${data.type}` : ""}${data.budget ? ` Budget: $${data.budget}` : ""}
Respond as JSON: { "recommendations": [{"device": "teleprompter device", "price": "price", "features": "key features"}], "apps": "recommended apps", "setup": "setup guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackupStoragePlanner(data: { dataSize?: string; budget?: number }, userId?: string) {
  const p = `Plan backup and storage solutions for a content creator.
${data.dataSize ? `Data size: ${data.dataSize}` : ""}${data.budget ? ` Budget: $${data.budget}` : ""}
Respond as JSON: { "plan": [{"tier": "storage tier", "solution": "storage solution", "cost": "monthly cost"}], "automation": "backup automation", "recovery": "disaster recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInternetOptimizer(data: { usage?: string; currentSpeed?: string }, userId?: string) {
  const p = `Optimize internet setup for a content creator.
${data.usage ? `Usage type: ${data.usage}` : ""}${data.currentSpeed ? ` Current speed: ${data.currentSpeed}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "improvement": "suggested improvement"}], "hardware": "recommended hardware", "isp": "ISP recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiVATaskDelegator(data: { tasks?: string[] }, userId?: string) {
  const p = `Plan virtual assistant task delegation for a content creator.
${data.tasks ? `Tasks to delegate: ${data.tasks.join(", ")}` : ""}
Respond as JSON: { "delegation": [{"task": "task name", "skills": "required skills", "cost": "estimated cost"}], "platforms": "VA platforms", "management": "management tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditorHiringGuide(data: { volume?: number; style?: string }, userId?: string) {
  const p = `Guide hiring a video editor for a content creator.
${data.volume ? `Monthly video volume: ${data.volume}` : ""}${data.style ? ` Editing style: ${data.style}` : ""}
Respond as JSON: { "guide": [{"criteria": "hiring criteria", "importance": "importance level"}], "portfolio": "portfolio evaluation tips", "rates": "market rates", "test": "test project ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailDesignerFinder(data: { style?: string; budget?: number }, userId?: string) {
  const p = `Find a thumbnail designer for a content creator.
${data.style ? `Preferred style: ${data.style}` : ""}${data.budget ? ` Budget: $${data.budget}` : ""}
Respond as JSON: { "recommendations": [{"platform": "hiring platform", "priceRange": "price range"}], "brief": "design brief template", "evaluation": "evaluation criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOutsourcingStrategyBuilder(data: { tasks?: string[]; budget?: number }, userId?: string) {
  const p = `Build an outsourcing strategy for a content creator.
${data.tasks ? `Tasks to outsource: ${data.tasks.join(", ")}` : ""}${data.budget ? ` Budget: $${data.budget}` : ""}
Respond as JSON: { "strategy": [{"task": "task name", "outsource": "outsource recommendation", "platform": "platform", "cost": "estimated cost"}], "management": "management approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentModerationPlanner(data: { platforms?: string[] }, userId?: string) {
  const p = `Plan content moderation strategy for a creator.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "plan": [{"area": "moderation area", "policy": "policy details", "enforcement": "enforcement method"}], "tools": "moderation tools", "training": "team training plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCopyrightClaimResolver(data: { claimType?: string }, userId?: string) {
  const p = `Help resolve a copyright claim for a content creator.
${data.claimType ? `Claim type: ${data.claimType}` : ""}
Respond as JSON: { "resolution": [{"step": "resolution step", "action": "action to take", "timeline": "expected timeline"}], "prevention": "prevention strategies", "fairUse": "fair use guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorshipDisclosureChecker(data: { content?: string }, userId?: string) {
  const p = `Check sponsorship disclosure compliance in content.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "issues": [{"issue": "disclosure issue", "location": "where in content", "fix": "how to fix"}], "ftcGuidelines": "relevant FTC guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAgeRestrictionAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on age restriction settings for content.
${data.content ? `Content description: ${data.content}` : ""}
Respond as JSON: { "assessment": [{"factor": "content factor", "rating": "suggested rating"}], "adjustments": "content adjustments", "audience": "target audience recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDefamationRiskChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for defamation risks.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "risks": [{"statement": "risky statement", "risk": "risk level", "alternative": "safer alternative"}], "guidelines": "defamation prevention guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlagiarismDetector(data: { content?: string }, userId?: string) {
  const p = `Detect potential plagiarism in content.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "detection": [{"section": "content section", "similarity": "similarity percentage", "source": "potential source"}], "originality": "originality score" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCOPPAComplianceChecker(data: { content?: string }, userId?: string) {
  const p = `Check COPPA compliance for content targeting children.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "compliance": [{"area": "compliance area", "status": "compliant or not", "fix": "how to fix"}], "dataCollection": "data collection guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGDPRComplianceAdvisor(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Advise on GDPR compliance for a content creator.
${data.dataTypes ? `Data types collected: ${data.dataTypes.join(", ")}` : ""}
Respond as JSON: { "compliance": [{"requirement": "GDPR requirement", "status": "compliance status", "action": "action needed"}], "privacy": "privacy policy recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiHateSpeechDetector(data: { content?: string }, userId?: string) {
  const p = `Detect hate speech in content and suggest alternatives.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "detection": [{"phrase": "detected phrase", "severity": "severity level", "alternative": "suggested alternative"}], "education": "educational resources" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMisinformationChecker(data: { claims?: string[] }, userId?: string) {
  const p = `Check claims for potential misinformation.
${data.claims ? `Claims to check: ${data.claims.join("; ")}` : ""}
Respond as JSON: { "checks": [{"claim": "claim text", "status": "verified or unverified or false", "source": "verification source"}], "corrections": "suggested corrections" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTriggerWarningAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on trigger warnings needed for content.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "warnings": [{"topic": "sensitive topic", "severity": "severity level", "placement": "where to place warning"}], "guidelines": "trigger warning best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChildSafetyChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for child safety compliance.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "safety": [{"area": "safety area", "status": "safe or concern", "recommendation": "safety recommendation"}], "compliance": "compliance summary" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiPersonalBrandAuditor(data: { platforms?: string[] }, userId?: string) {
  const p = `Audit personal brand consistency across platforms.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}
Respond as JSON: { "audit": [{"platform": "platform name", "consistency": "consistency score", "improvement": "improvement suggestion"}], "score": "overall brand score" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiElevatorPitchWriter(data: { niche?: string; unique?: string }, userId?: string) {
  const p = `Write elevator pitches for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}${data.unique ? ` Unique value: ${data.unique}` : ""}
Respond as JSON: { "pitches": [{"length": "pitch length", "pitch": "elevator pitch text", "audience": "target audience"}], "practice": "practice tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPressKitBuilder(data: { achievements?: string[] }, userId?: string) {
  const p = `Build a press kit for a content creator.
${data.achievements ? `Achievements: ${data.achievements.join(", ")}` : ""}
Respond as JSON: { "kit": [{"section": "press kit section", "content": "section content"}], "design": "design recommendations", "distribution": "distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSpeakerBioWriter(data: { expertise?: string[]; achievements?: string[] }, userId?: string) {
  const p = `Write speaker bios for a content creator.
${data.expertise ? `Expertise: ${data.expertise.join(", ")}` : ""}${data.achievements ? ` Achievements: ${data.achievements.join(", ")}` : ""}
Respond as JSON: { "bios": [{"length": "bio length", "bio": "speaker bio text", "context": "usage context"}], "photo": "photo recommendations", "credentials": "credentials to highlight" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInProfileOptimizer(data: { industry?: string }, userId?: string) {
  const p = `Optimize LinkedIn profile for a content creator.
${data.industry ? `Industry: ${data.industry}` : ""}
Respond as JSON: { "optimization": [{"section": "profile section", "improvement": "improvement suggestion"}], "keywords": "target keywords", "networking": "networking strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalWebsiteBuilder(data: { niche?: string }, userId?: string) {
  const p = `Plan a personal website for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"page": "page name", "content": "page content", "seo": "SEO strategy"}], "design": "design recommendations", "portfolio": "portfolio structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThoughtLeadershipPlanner(data: { expertise?: string }, userId?: string) {
  const p = `Plan a thought leadership strategy for a content creator.
${data.expertise ? `Area of expertise: ${data.expertise}` : ""}
Respond as JSON: { "plan": [{"pillar": "content pillar", "content": "content ideas", "platform": "target platform"}], "timeline": "implementation timeline", "metrics": "success metrics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPublicSpeakingCoach(data: { experience?: string }, userId?: string) {
  const p = `Coach a content creator on public speaking.
${data.experience ? `Experience level: ${data.experience}` : ""}
Respond as JSON: { "coaching": [{"area": "speaking area", "exercise": "practice exercise", "tip": "improvement tip"}], "opportunities": "speaking opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkingStrategyBuilder(data: { goals?: string[] }, userId?: string) {
  const p = `Build a networking strategy for a content creator.
${data.goals ? `Networking goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"channel": "networking channel", "approach": "approach method", "followUp": "follow-up strategy"}], "events": "recommended events", "tracking": "relationship tracking" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReputationMonitor(data: { name?: string }, userId?: string) {
  const p = `Set up reputation monitoring for a content creator.
${data.name ? `Creator name: ${data.name}` : ""}
Respond as JSON: { "monitoring": [{"platform": "platform", "method": "monitoring method", "alert": "alert setup"}], "response": "response protocol", "crisis": "crisis prevention" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisResponsePlanner(data: { scenarios?: string[] }, userId?: string) {
  const p = `Plan crisis response strategies for a content creator.
${data.scenarios ? `Potential scenarios: ${data.scenarios.join(", ")}` : ""}
Respond as JSON: { "plan": [{"scenario": "crisis scenario", "response": "response plan", "timeline": "response timeline"}], "templates": "response templates", "team": "crisis team roles" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiApologyScriptWriter(data: { situation?: string }, userId?: string) {
  const p = `Write apology scripts for a content creator.
${data.situation ? `Situation: ${data.situation}` : ""}
Respond as JSON: { "scripts": [{"type": "apology type", "script": "apology script", "timing": "when to deliver"}], "sincerity": "sincerity guidelines", "followUp": "follow-up actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiControversyNavigator(data: { topic?: string }, userId?: string) {
  const p = `Navigate a controversial topic for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "navigation": [{"approach": "approach strategy", "risk": "risk level", "messaging": "key messaging"}], "timeline": "response timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCancelCultureDefender(data: { scenario?: string }, userId?: string) {
  const p = `Defend against cancel culture for a content creator.
${data.scenario ? `Scenario: ${data.scenario}` : ""}
Respond as JSON: { "defense": [{"step": "defense step", "action": "action to take"}], "communication": "communication strategy", "recovery": "recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiversityInclusionAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on diversity and inclusion in content.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "recommendation": "inclusion recommendation"}], "representation": "representation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMentalHealthContentGuide(data: { topic?: string }, userId?: string) {
  const p = `Guide creating mental health content responsibly.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "guide": [{"guideline": "content guideline", "reason": "why it matters"}], "resources": "professional resources to reference", "disclaimers": "required disclaimers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPoliticalContentNavigator(data: { topic?: string }, userId?: string) {
  const p = `Navigate political content for a content creator.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "navigation": [{"approach": "content approach", "risk": "risk assessment", "framing": "framing suggestion"}], "neutrality": "neutrality guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReligiousSensitivityChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for religious sensitivity.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "check": [{"topic": "religious topic", "sensitivity": "sensitivity level", "approach": "recommended approach"}], "consultation": "expert consultation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCulturalSensitivityAdvisor(data: { markets?: string[] }, userId?: string) {
  const p = `Advise on cultural sensitivity for content across markets.
${data.markets ? `Target markets: ${data.markets.join(", ")}` : ""}
Respond as JSON: { "advice": [{"culture": "culture or market", "consideration": "cultural consideration", "adaptation": "content adaptation"}], "localization": "localization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBodyImageSensitivityChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for body image sensitivity issues.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "check": [{"element": "content element", "concern": "sensitivity concern", "alternative": "suggested alternative"}], "guidelines": "body positivity guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAddictionContentGuide(data: { topic?: string }, userId?: string) {
  const p = `Guide creating content about addiction responsibly.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "guide": [{"guideline": "content guideline", "reason": "why it matters"}], "resources": "professional resources", "responsible": "responsible messaging guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinancialDisclaimerWriter(data: { contentType?: string }, userId?: string) {
  const p = `Write financial disclaimers for content.
${data.contentType ? `Content type: ${data.contentType}` : ""}
Respond as JSON: { "disclaimers": [{"type": "disclaimer type", "text": "disclaimer text", "placement": "where to place"}], "compliance": "regulatory compliance notes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkflowAutomationBuilder(data: { processes?: string[] }, userId?: string) {
  const p = `Build workflow automations for a content creator.
${data.processes ? `Processes to automate: ${data.processes.join(", ")}` : ""}
Respond as JSON: { "automations": [{"trigger": "automation trigger", "actions": "automated actions", "tool": "recommended tool"}], "time": "time saved", "ROI": "return on investment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiZapierIntegrationPlanner(data: { tools?: string[] }, userId?: string) {
  const p = `Plan Zapier integrations for a content creator workflow.
${data.tools ? `Tools to integrate: ${data.tools.join(", ")}` : ""}
Respond as JSON: { "zaps": [{"trigger": "trigger event", "action": "automated action", "tool": "connected tool"}], "efficiency": "efficiency gains" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIFTTTRecipeCreator(data: { services?: string[] }, userId?: string) {
  const p = `Create IFTTT recipes for a content creator.
${data.services ? `Services: ${data.services.join(", ")}` : ""}
Respond as JSON: { "recipes": [{"trigger": "trigger condition", "action": "automated action", "service": "connected service"}], "scheduling": "scheduling recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMakeScenarioBuilder(data: { workflows?: string[] }, userId?: string) {
  const p = `Build Make (Integromat) scenarios for a content creator.
${data.workflows ? `Workflows: ${data.workflows.join(", ")}` : ""}
Respond as JSON: { "scenarios": [{"trigger": "scenario trigger", "modules": "connected modules", "output": "expected output"}], "scheduling": "scheduling setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoScheduler(data: { platforms?: string[]; frequency?: string }, userId?: string) {
  const p = `Create an automated content scheduling plan.
${data.platforms ? `Platforms: ${data.platforms.join(", ")}` : ""}${data.frequency ? ` Posting frequency: ${data.frequency}` : ""}
Respond as JSON: { "schedule": [{"platform": "platform name", "time": "optimal posting time", "content": "content type"}], "optimization": "scheduling optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoResponder(data: { messageTypes?: string[] }, userId?: string) {
  const p = `Set up auto-responders for a content creator.
${data.messageTypes ? `Message types: ${data.messageTypes.join(", ")}` : ""}
Respond as JSON: { "responses": [{"trigger": "message trigger", "response": "auto-response text", "platform": "platform"}], "personalization": "personalization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoModerator(data: { rules?: string[] }, userId?: string) {
  const p = `Set up auto-moderation for a content creator community.
${data.rules ? `Moderation rules: ${data.rules.join(", ")}` : ""}
Respond as JSON: { "moderation": [{"rule": "moderation rule", "action": "automated action", "escalation": "escalation path"}], "learning": "machine learning improvements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoBackupper(data: { content?: string[] }, userId?: string) {
  const p = `Set up automated backups for a content creator.
${data.content ? `Content to backup: ${data.content.join(", ")}` : ""}
Respond as JSON: { "backup": [{"content": "content type", "destination": "backup destination", "frequency": "backup frequency"}], "verification": "backup verification process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoReporter(data: { metrics?: string[] }, userId?: string) {
  const p = `Set up automated reporting for a content creator.
${data.metrics ? `Metrics to track: ${data.metrics.join(", ")}` : ""}
Respond as JSON: { "reports": [{"metric": "metric name", "frequency": "report frequency", "delivery": "delivery method"}], "templates": "report templates", "alerts": "alert thresholds" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoOptimizer(data: { areas?: string[] }, userId?: string) {
  const p = `Set up automated optimization for a content creator.
${data.areas ? `Areas to optimize: ${data.areas.join(", ")}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "trigger": "optimization trigger", "action": "automated action"}], "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBatchProcessor(data: { tasks?: string[] }, userId?: string) {
  const p = `Set up batch processing for content creator tasks.
${data.tasks ? `Tasks: ${data.tasks.join(", ")}` : ""}
Respond as JSON: { "batches": [{"task": "task name", "schedule": "batch schedule", "efficiency": "efficiency gain"}], "parallel": "parallel processing options", "monitoring": "batch monitoring" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartQueueManager(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Manage a smart content queue for a creator.
${data.contentTypes ? `Content types: ${data.contentTypes.join(", ")}` : ""}
Respond as JSON: { "queue": [{"type": "content type", "priority": "priority level", "scheduling": "scheduling rule"}], "overflow": "overflow handling strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPipelineBuilder(data: { stages?: string[] }, userId?: string) {
  const p = `Build a content pipeline for a creator.
${data.stages ? `Pipeline stages: ${data.stages.join(", ")}` : ""}
Respond as JSON: { "pipeline": [{"stage": "pipeline stage", "tool": "recommended tool", "automation": "automation level"}], "bottleneck": "bottleneck identification" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAITrainingDataCollector(data: { purpose?: string }, userId?: string) {
  const p = `Plan AI training data collection for a creator.
${data.purpose ? `Purpose: ${data.purpose}` : ""}
Respond as JSON: { "collection": [{"source": "data source", "method": "collection method", "format": "data format"}], "labeling": "labeling strategy", "privacy": "privacy considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisDetector(data: { channels?: string[] }, userId?: string) {
  const p = `Set up crisis detection for a content creator.
${data.channels ? `Channels to monitor: ${data.channels.join(", ")}` : ""}
Respond as JSON: { "detection": [{"signal": "crisis signal", "threshold": "alert threshold", "response": "initial response"}], "escalation": "escalation procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDamageControlPlanner(data: { crisis?: string }, userId?: string) {
  const p = `Plan damage control for a content creator crisis.
${data.crisis ? `Crisis: ${data.crisis}` : ""}
Respond as JSON: { "plan": [{"phase": "response phase", "action": "key action", "timeline": "timeline"}], "communication": "communication strategy", "recovery": "recovery outlook" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPRStatementWriter(data: { situation?: string }, userId?: string) {
  const p = `Write PR statements for a content creator.
${data.situation ? `Situation: ${data.situation}` : ""}
Respond as JSON: { "statements": [{"type": "statement type", "statement": "PR statement text", "audience": "target audience"}], "timing": "release timing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStakeholderCommunicator(data: { stakeholders?: string[] }, userId?: string) {
  const p = `Plan stakeholder communication for a content creator.
${data.stakeholders ? `Stakeholders: ${data.stakeholders.join(", ")}` : ""}
Respond as JSON: { "communication": [{"stakeholder": "stakeholder group", "message": "key message", "channel": "communication channel"}], "timeline": "communication timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRecoveryStrategyBuilder(data: { damage?: string[] }, userId?: string) {
  const p = `Build a recovery strategy after a content creator crisis.
${data.damage ? `Damage areas: ${data.damage.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"phase": "recovery phase", "actions": "key actions", "metrics": "success metrics"}], "timeline": "recovery timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaResponsePlanner(data: { inquiry?: string }, userId?: string) {
  const p = `Plan media responses for a content creator.
${data.inquiry ? `Media inquiry: ${data.inquiry}` : ""}
Respond as JSON: { "plan": [{"scenario": "media scenario", "response": "prepared response", "spokesperson": "designated spokesperson"}], "training": "media training recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLegalRiskAssessor(data: { content?: string }, userId?: string) {
  const p = `Assess legal risks in content.
${data.content ? `Content: ${data.content}` : ""}
Respond as JSON: { "assessment": [{"risk": "legal risk", "severity": "severity level", "mitigation": "mitigation strategy"}], "insurance": "insurance recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialMediaCrisisManager(data: { platform?: string }, userId?: string) {
  const p = `Manage a social media crisis for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}
Respond as JSON: { "management": [{"phase": "crisis phase", "actions": "key actions"}], "templates": "response templates", "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerCrisisAdvisor(data: { issue?: string }, userId?: string) {
  const p = `Advise on influencer crisis management.
${data.issue ? `Issue: ${data.issue}` : ""}
Respond as JSON: { "advice": [{"step": "crisis step", "action": "recommended action", "timing": "timing"}], "communication": "communication strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandRecoveryPlanner(data: { damage?: string }, userId?: string) {
  const p = `Plan brand recovery for a content creator.
${data.damage ? `Damage description: ${data.damage}` : ""}
Respond as JSON: { "plan": [{"phase": "recovery phase", "strategy": "recovery strategy", "milestone": "key milestone"}], "timeline": "recovery timeline", "metrics": "success metrics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityTrustRebuilder(data: { breach?: string }, userId?: string) {
  const p = `Rebuild community trust after a breach for a content creator.
${data.breach ? `Trust breach: ${data.breach}` : ""}
Respond as JSON: { "rebuilding": [{"action": "trust-building action", "timeline": "implementation timeline", "measurement": "success measurement"}], "transparency": "transparency measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmRecoveryAdvisor(data: { platform?: string; issue?: string }, userId?: string) {
  const p = `Advise on algorithm recovery for a content creator.
${data.platform ? `Platform: ${data.platform}` : ""}${data.issue ? ` Issue: ${data.issue}` : ""}
Respond as JSON: { "recovery": [{"step": "recovery step", "action": "action to take", "timeline": "expected timeline"}], "prevention": "prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueRecoveryPlanner(data: { loss?: number }, userId?: string) {
  const p = `Plan revenue recovery for a content creator.
${data.loss ? `Revenue loss: $${data.loss}` : ""}
Respond as JSON: { "plan": [{"strategy": "recovery strategy", "timeline": "implementation timeline", "projected": "projected recovery"}], "diversification": "revenue diversification plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeamCrisisManager(data: { issue?: string }, userId?: string) {
  const p = `Manage a team crisis for a content creator.
${data.issue ? `Issue: ${data.issue}` : ""}
Respond as JSON: { "management": [{"step": "management step", "action": "action to take"}], "communication": "team communication plan", "morale": "morale recovery strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLegalDefensePrepper(data: { claim?: string }, userId?: string) {
  const p = `Prepare legal defense for a content creator.
${data.claim ? `Claim: ${data.claim}` : ""}
Respond as JSON: { "preparation": [{"area": "defense area", "action": "preparation action", "document": "required documentation"}], "counsel": "legal counsel recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInsuranceClaimHelper(data: { incident?: string }, userId?: string) {
  const p = `Help with an insurance claim for a content creator.
${data.incident ? `Incident: ${data.incident}` : ""}
Respond as JSON: { "help": [{"step": "claim step", "documentation": "required documentation", "timeline": "expected timeline"}], "coverage": "coverage assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContingencyPlanner(data: { risks?: string[] }, userId?: string) {
  const p = `Create contingency plans for a content creator.
${data.risks ? `Risks: ${data.risks.join(", ")}` : ""}
Respond as JSON: { "plans": [{"risk": "risk scenario", "trigger": "trigger condition", "response": "response plan", "backup": "backup plan"}], "testing": "plan testing schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDisasterRecoveryPlanner(data: { assets?: string[] }, userId?: string) {
  const p = `Plan disaster recovery for a content creator's digital assets.
${data.assets ? `Assets: ${data.assets.join(", ")}` : ""}
Respond as JSON: { "plan": [{"asset": "digital asset", "backup": "backup strategy", "recovery": "recovery procedure"}], "testing": "testing schedule", "documentation": "documentation requirements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBusinessContinuityPlanner(data: { critical?: string[] }, userId?: string) {
  const p = `Plan business continuity for a content creator.
${data.critical ? `Critical functions: ${data.critical.join(", ")}` : ""}
Respond as JSON: { "plan": [{"function": "business function", "continuity": "continuity strategy", "alternative": "alternative approach"}], "testing": "continuity testing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExitStrategyBuilder(data: { business?: string; value?: number }, userId?: string) {
  const p = `Build an exit strategy for a content creator business.
${data.business ? `Business type: ${data.business}` : ""}${data.value ? ` Estimated value: $${data.value}` : ""}
Respond as JSON: { "strategies": [{"type": "exit type", "preparation": "preparation steps", "timeline": "exit timeline"}], "valuation": "valuation methodology" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSummerContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan summer content for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"week": "week number", "content": "content idea", "theme": "summer theme"}], "seasonal": "seasonal trends", "events": "summer events to cover" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWinterContentStrategy(data: { niche?: string }, userId?: string) {
  const p = `Plan winter content strategy for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "strategy": [{"month": "month", "content": "content idea", "angle": "content angle"}], "holidays": "holiday content opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackToSchoolPlanner(data: { audience?: string }, userId?: string) {
  const p = `Plan back-to-school content for a creator.
${data.audience ? `Target audience: ${data.audience}` : ""}
Respond as JSON: { "plan": [{"week": "week", "content": "content idea", "partner": "potential partner"}], "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHalloweenContentCreator(data: { niche?: string }, userId?: string) {
  const p = `Create Halloween content ideas for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "creative concept", "audience": "target audience"}], "costumes": "costume ideas", "collab": "collaboration opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlackFridayStrategist(data: { products?: string[] }, userId?: string) {
  const p = `Plan a Black Friday content and sales strategy.
${data.products ? `Products: ${data.products.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"phase": "campaign phase", "action": "key action", "deal": "deal structure"}], "timeline": "campaign timeline", "marketing": "marketing channels" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChristmasContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Christmas content for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"week": "week", "content": "content idea", "type": "content type"}], "gifts": "gift guide ideas", "calendar": "advent calendar content" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewYearGoalSetter(data: { lastYear?: any }, userId?: string) {
  const p = `Set New Year goals for a content creator.
${data.lastYear ? `Last year summary: ${JSON.stringify(data.lastYear)}` : ""}
Respond as JSON: { "goals": [{"goal": "new year goal", "metric": "success metric", "plan": "action plan"}], "reflection": "year-in-review prompts", "sharing": "goal sharing content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiValentinesDayPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Valentine's Day content for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "angle": "content angle", "partner": "potential partner"}], "timing": "posting schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEasterContentCreator(data: { audience?: string }, userId?: string) {
  const p = `Create Easter content ideas for a creator.
${data.audience ? `Target audience: ${data.audience}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "creative concept"}], "family": "family-friendly ideas", "seasonal": "seasonal tie-ins" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperBowlContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Super Bowl content for a creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "angle": "content angle", "timing": "posting timing"}], "watchParty": "watch party content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiParentsDayPlanner(data: { occasion?: string }, userId?: string) {
  const p = `Plan Mother's Day or Father's Day content for a creator.
${data.occasion ? `Occasion: ${data.occasion}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "gift": "gift guide idea", "angle": "emotional angle"}], "emotional": "emotional storytelling tips", "timing": "posting schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGraduationContentCreator(data: { audience?: string }, userId?: string) {
  const p = `Create graduation content for a creator.
${data.audience ? `Target audience: ${data.audience}` : ""}
Respond as JSON: { "content": [{"type": "content type", "message": "key message", "audience": "target audience"}], "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorldCupContentPlanner(data: { sport?: string }, userId?: string) {
  const p = `Plan World Cup content for a creator.
${data.sport ? `Sport: ${data.sport}` : ""}
Respond as JSON: { "plan": [{"phase": "tournament phase", "content": "content idea", "engagement": "engagement strategy"}], "predictions": "prediction content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOlympicsContentStrategy(data: { events?: string[] }, userId?: string) {
  const p = `Plan Olympics content strategy for a creator.
${data.events ? `Events to cover: ${data.events.join(", ")}` : ""}
Respond as JSON: { "strategy": [{"event": "olympic event", "content": "content idea", "angle": "unique angle"}], "scheduling": "content scheduling" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAwardsSeasonPlanner(data: { category?: string }, userId?: string) {
  const p = `Plan awards season content for a creator.
${data.category ? `Category: ${data.category}` : ""}
Respond as JSON: { "plan": [{"event": "awards event", "content": "content idea", "timing": "posting timing"}], "predictions": "prediction content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicFestivalContentGuide(data: { festivals?: string[] }, userId?: string) {
  const p = `Guide music festival content creation.
${data.festivals ? `Festivals: ${data.festivals.join(", ")}` : ""}
Respond as JSON: { "guide": [{"festival": "festival name", "content": "content ideas", "logistics": "logistics tips"}], "gear": "recommended gear" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamingEventPlanner(data: { events?: string[] }, userId?: string) {
  const p = `Plan gaming event content coverage.
${data.events ? `Events: ${data.events.join(", ")}` : ""}
Respond as JSON: { "plan": [{"event": "gaming event", "coverage": "coverage plan", "content": "content types"}], "streaming": "streaming setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductHuntLaunchGuide(data: { product?: string }, userId?: string) {
  const p = `Guide a Product Hunt launch for a creator product.
${data.product ? `Product: ${data.product}` : ""}
Respond as JSON: { "guide": [{"phase": "launch phase", "action": "key action", "timing": "timing"}], "community": "community engagement", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiErgonomicSetupAdvisor(data: { hours?: number }, userId?: string) {
  const p = `Advise on ergonomic setup for a content creator.
${data.hours ? `Daily hours at desk: ${data.hours}` : ""}
Respond as JSON: { "setup": [{"item": "ergonomic item", "recommendation": "specific recommendation", "price": "price range"}], "posture": "posture tips", "breaks": "break schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEyeCareAdvisor(data: { screenTime?: number }, userId?: string) {
  const p = `Advise on eye care for a content creator.
${data.screenTime ? `Daily screen time: ${data.screenTime} hours` : ""}
Respond as JSON: { "advice": [{"area": "eye care area", "recommendation": "specific recommendation"}], "exercises": "eye exercises", "tools": "helpful tools and apps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVocalHealthCoach(data: { usage?: string }, userId?: string) {
  const p = `Coach vocal health for a content creator.
${data.usage ? `Voice usage: ${data.usage}` : ""}
Respond as JSON: { "coaching": [{"area": "vocal area", "exercise": "vocal exercise", "frequency": "how often"}], "hydration": "hydration guidelines", "rest": "vocal rest recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNutritionForCreators(data: { goals?: string[] }, userId?: string) {
  const p = `Plan nutrition for a content creator.
${data.goals ? `Health goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "nutrition": [{"meal": "meal time", "foods": "recommended foods", "benefit": "health benefit"}], "supplements": "supplement recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkLifeBalanceOptimizer(data: { hoursWorking?: number }, userId?: string) {
  const p = `Optimize work-life balance for a content creator.
${data.hoursWorking ? `Hours working per day: ${data.hoursWorking}` : ""}
Respond as JSON: { "optimization": [{"area": "life area", "change": "recommended change", "benefit": "expected benefit"}], "boundaries": "boundary-setting strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorBurnoutRecovery(data: { symptoms?: string[] }, userId?: string) {
  const p = `Help a content creator recover from burnout.
${data.symptoms ? `Symptoms: ${data.symptoms.join(", ")}` : ""}
Respond as JSON: { "recovery": [{"phase": "recovery phase", "action": "recovery action", "duration": "phase duration"}], "prevention": "burnout prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeditationGuideForCreators(data: { experience?: string }, userId?: string) {
  const p = `Guide meditation practice for a content creator.
${data.experience ? `Experience level: ${data.experience}` : ""}
Respond as JSON: { "guide": [{"type": "meditation type", "duration": "session duration", "technique": "technique description"}], "schedule": "recommended schedule", "apps": "recommended apps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeBlockingOptimizer(data: { tasks?: string[] }, userId?: string) {
  const p = `Optimize time blocking for a content creator.
${data.tasks ? `Tasks: ${data.tasks.join(", ")}` : ""}
Respond as JSON: { "blocks": [{"time": "time block", "task": "assigned task", "energy": "energy level needed"}], "templates": "schedule templates", "tools": "time blocking tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPomodoroCustomizer(data: { workType?: string }, userId?: string) {
  const p = `Customize the Pomodoro technique for a content creator.
${data.workType ? `Work type: ${data.workType}` : ""}
Respond as JSON: { "customization": [{"setting": "pomodoro setting", "value": "recommended value", "reason": "why this value"}], "breaks": "break activity suggestions", "tracking": "tracking methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalDetoxPlanner(data: { frequency?: string }, userId?: string) {
  const p = `Plan a digital detox for a content creator.
${data.frequency ? `Detox frequency: ${data.frequency}` : ""}
Respond as JSON: { "plan": [{"phase": "detox phase", "action": "detox action", "duration": "phase duration"}], "alternatives": "offline alternatives", "communication": "audience communication plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGratitudeJournalPrompts(data: { niche?: string }, userId?: string) {
  const p = `Generate gratitude journal prompts for a content creator.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "prompts": [{"prompt": "journal prompt", "reflection": "reflection guidance", "growth": "growth connection"}], "schedule": "journaling schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffirmationGenerator(data: { goals?: string[] }, userId?: string) {
  const p = `Generate affirmations for a content creator.
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "affirmations": [{"affirmation": "affirmation text", "category": "affirmation category", "timing": "best time to practice"}], "practice": "practice guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHabitStackBuilder(data: { habits?: string[] }, userId?: string) {
  const p = `Build habit stacks for a content creator.
${data.habits ? `Desired habits: ${data.habits.join(", ")}` : ""}
Respond as JSON: { "stacks": [{"trigger": "habit trigger", "habit": "new habit", "reward": "reward"}], "tracking": "habit tracking methods", "accountability": "accountability strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEnergyManagementAdvisor(data: { schedule?: string }, userId?: string) {
  const p = `Advise on energy management for a content creator.
${data.schedule ? `Current schedule: ${data.schedule}` : ""}
Respond as JSON: { "management": [{"time": "time of day", "energy": "energy level", "task": "best task for this energy"}], "optimization": "energy optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorCommunityBuilder(data: { niche?: string }, userId?: string) {
  const p = `Build a creator community strategy.
${data.niche ? `Niche: ${data.niche}` : ""}
Respond as JSON: { "community": [{"platform": "community platform", "strategy": "growth strategy", "engagement": "engagement tactics"}], "growth": "community growth plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMastermindGroupFacilitator(data: { topic?: string }, userId?: string) {
  const p = `Facilitate a mastermind group for content creators.
${data.topic ? `Topic: ${data.topic}` : ""}
Respond as JSON: { "facilitation": [{"session": "session topic", "structure": "session structure", "outcome": "expected outcome"}], "members": "member selection criteria", "cadence": "meeting cadence" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccountabilityPartnerMatcher(data: { goals?: string[] }, userId?: string) {
  const p = `Match accountability partners for a content creator.
${data.goals ? `Goals: ${data.goals.join(", ")}` : ""}
Respond as JSON: { "matching": [{"criteria": "matching criteria", "platform": "where to find partners", "structure": "partnership structure"}], "checkIns": "check-in schedule and format" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorSabbaticalPlanner(data: { duration?: string }, userId?: string) {
  const p = `Plan a sabbatical for a content creator.
${data.duration ? `Duration: ${data.duration}` : ""}
Respond as JSON: { "plan": [{"phase": "sabbatical phase", "preparation": "preparation steps", "content": "pre-scheduled content"}], "finances": "financial preparation", "return": "return strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-5-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 1200 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoOnboarding(data: { userId?: string; platforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI onboarding specialist for a creator platform. Auto-configure optimal settings for a new creator.${creatorCtx}` }, { role: "user", content: `Auto-configure account for creator. Platforms: ${JSON.stringify(data.platforms || ["youtube"])}. Generate: 1) Optimal default settings for each platform 2) Recommended cron job schedules 3) Suggested AI chain templates to activate 4) Default notification preferences 5) Brand profile defaults. Return JSON with keys: platformSettings, cronSchedules, chainTemplates, notificationPrefs, brandDefaults.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAutoApproveSponsorship(data: { deal?: any; criteria?: any; minCPM?: number; brandFit?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI sponsorship evaluator. Evaluate brand deals and auto-approve/reject based on creator criteria. Be strict about brand safety.${creatorCtx}` }, { role: "user", content: `Evaluate this sponsorship deal: ${JSON.stringify(data.deal || {})}. Creator criteria: Min CPM $${data.minCPM || 25}, Brand fit categories: ${JSON.stringify(data.brandFit || ["tech", "gaming"])}. Analyze: 1) Brand safety score (0-100) 2) Revenue potential 3) Audience alignment 4) Contract red flags 5) Auto-decision (approve/reject/review). Return JSON with keys: brandSafetyScore, revenuePotential, audienceAlignment, redFlags, decision, reasoning, suggestedCounterOffer.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreativeAutonomy(data: { contentType?: string; topic?: string; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI creative director who has learned the creator's unique style. Make ALL creative decisions autonomously - thumbnails, titles, scripts, scheduling - without human input. Match the creator's voice perfectly.${creatorCtx}` }, { role: "user", content: `Make autonomous creative decisions for ${data.contentType || "video"} about "${data.topic || "trending topic"}". Style: ${data.style || "energetic"}. Generate: 1) 5 title options ranked by predicted CTR 2) Thumbnail concept with colors, composition, text overlay 3) Script outline with hooks and CTAs 4) Optimal publish time based on audience data 5) Platform-specific adaptations for YouTube, TikTok, Instagram. Return JSON with keys: titles, thumbnailConcept, scriptOutline, publishTime, platformAdaptations, predictedPerformance.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAutoPaymentManager(data: { invoices?: any[]; expenses?: any[]; revenue?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI financial manager for creators. Handle all payment operations autonomously - invoice generation, expense categorization, tax prep, revenue forecasting.${creatorCtx}` }, { role: "user", content: `Manage payments autonomously. Current invoices: ${JSON.stringify(data.invoices || [])}. Recent expenses: ${JSON.stringify(data.expenses || [])}. Monthly revenue: $${data.revenue || 0}. Generate: 1) Auto-categorized expenses with tax deduction flags 2) Invoice recommendations 3) Cash flow forecast 4) Tax liability estimate 5) Payment optimization suggestions 6) Anomaly detection results. Return JSON with keys: categorizedExpenses, invoiceRecommendations, cashFlowForecast, taxEstimate, optimizations, anomalies.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ===== BATCH 23: Multi-Language & Localization AI Features (17 features) =====

export async function aiVideoTranslator(data: { title?: string; description?: string; tags?: string[]; targetLanguages?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an expert video metadata translator. Translate video titles, descriptions, and tags while preserving SEO value, emotional tone, and cultural relevance for each target language.${creatorCtx}` }, { role: "user", content: `Translate this video metadata into these languages: ${JSON.stringify(data.targetLanguages || ["es","fr","de","ja","pt"])}. Title: "${data.title || "My Video"}". Description: "${data.description || ""}". Tags: ${JSON.stringify(data.tags || [])}. For each language provide: translated title (SEO-optimized), translated description, translated tags, cultural notes. Return JSON with key "translations" containing an object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubtitleGenerator(data: { transcript?: string; targetLanguages?: string[]; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI subtitle and closed-caption specialist. Generate natural-sounding subtitles in multiple languages with proper timing cues and cultural adaptation.${creatorCtx}` }, { role: "user", content: `Generate subtitles for the following transcript in these languages: ${JSON.stringify(data.targetLanguages || ["es","fr","de"])}. Transcript: "${data.transcript || "Sample video transcript"}". Style: ${data.style || "standard"}. For each language provide: translated subtitle blocks with timestamps, reading speed assessment, cultural adaptations. Return JSON with key "subtitles" containing an object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLocalizationAdvisor(data: { niche?: string; currentLanguages?: string[]; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a global content strategy advisor specializing in multi-language expansion for creators. Analyze market potential and recommend languages/regions to target.${creatorCtx}` }, { role: "user", content: `Advise on language expansion for a ${data.niche || "tech/gaming"} creator. Currently available in: ${JSON.stringify(data.currentLanguages || ["en"])}. Audience data: ${JSON.stringify(data.audienceData || {})}. Provide: 1) Top 5 languages to expand to with ROI estimates 2) Market size per language 3) Competition analysis per region 4) Content adaptation requirements 5) Monetization potential per market. Return JSON with keys: recommendedLanguages, marketAnalysis, competitionData, adaptationRequirements, monetizationPotential.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangSeo(data: { title?: string; description?: string; targetLanguage?: string; region?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multilingual SEO expert. Optimize video metadata for specific language markets using regional keyword research and local search trends.${creatorCtx}` }, { role: "user", content: `Optimize this content for ${data.targetLanguage || "es"} market (region: ${data.region || "global"}). Title: "${data.title || ""}". Description: "${data.description || ""}". Generate: 1) SEO-optimized title with regional keywords 2) Optimized description with local search terms 3) Top 20 regional keywords/tags 4) Search volume estimates 5) Competitor titles in this language. Return JSON with keys: optimizedTitle, optimizedDescription, regionalKeywords, searchVolumes, competitorTitles.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDubbingScriptGenerator(data: { script?: string; targetLanguage?: string; speakerStyle?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an AI dubbing script specialist. Create translated scripts formatted for voiceover and dubbing, with lip-sync timing notes and pronunciation guides.${creatorCtx}` }, { role: "user", content: `Create a dubbing script in ${data.targetLanguage || "es"} for the following: "${data.script || "Sample script"}". Speaker style: ${data.speakerStyle || "energetic"}. Generate: 1) Translated script with timing markers 2) Lip-sync adjustment notes 3) Pronunciation guide (IPA) 4) Emotional tone cues per segment 5) Cultural adaptation notes. Return JSON with keys: translatedScript, timingNotes, pronunciationGuide, emotionalCues, culturalNotes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCulturalAdaptation(data: { content?: string; targetCulture?: string; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a cultural adaptation specialist for digital content. Adapt references, humor, idioms, and examples for local audiences while maintaining the creator's intent and entertainment value.${creatorCtx}` }, { role: "user", content: `Adapt this content for ${data.targetCulture || "Latin American"} audience. Content type: ${data.contentType || "video script"}. Content: "${data.content || ""}". Analyze: 1) Cultural references that need adaptation 2) Humor adjustments 3) Idiom replacements 4) Visual/gesture sensitivities 5) Local trending references to include. Return JSON with keys: adaptedContent, culturalChanges, humorAdjustments, idiomReplacements, sensitivities, localReferences.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiThumbnailLocalizer(data: { thumbnailText?: string; targetLanguages?: string[]; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a thumbnail text localization expert. Translate and adapt thumbnail text overlays for different languages, considering text length, font compatibility, and cultural impact.${creatorCtx}` }, { role: "user", content: `Localize this thumbnail text for these languages: ${JSON.stringify(data.targetLanguages || ["es","fr","de","ja","ko"])}. Original text: "${data.thumbnailText || "SHOCKING!"}". Style: ${data.style || "bold impact"}. For each language provide: translated text, character count, font recommendation, text placement adjustment, emotional impact rating. Return JSON with key "thumbnails" containing object per language.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangHashtags(data: { topic?: string; targetLanguages?: string[]; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multilingual hashtag and trending keyword specialist. Generate platform-specific trending hashtags per language and region.${creatorCtx}` }, { role: "user", content: `Generate trending hashtags for "${data.topic || "gaming"}" in these languages: ${JSON.stringify(data.targetLanguages || ["es","fr","de","ja","pt"])}. Platform: ${data.platform || "YouTube"}. Per language provide: 15 trending hashtags, estimated reach, competition level, optimal posting time. Return JSON with key "hashtags" containing object per language.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTranslationChecker(data: { original?: string; translation?: string; targetLanguage?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a professional translation quality assessor. Evaluate translations for accuracy, naturalness, tone matching, cultural fit, and SEO preservation.${creatorCtx}` }, { role: "user", content: `Check translation quality. Original (English): "${data.original || ""}". Translation (${data.targetLanguage || "es"}): "${data.translation || ""}". Evaluate: 1) Accuracy score (0-100) 2) Naturalness score (0-100) 3) Tone match score (0-100) 4) Cultural fit score (0-100) 5) SEO preservation score (0-100) 6) Specific errors found 7) Improved translation. Return JSON with keys: accuracyScore, naturalnessScore, toneScore, culturalFitScore, seoScore, errors, improvedTranslation, overallScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudienceLanguageAnalyzer(data: { analyticsData?: any; comments?: string[]; viewerLocations?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audience language analytics specialist. Analyze viewer data to detect what languages your audience speaks and recommend localization priorities.${creatorCtx}` }, { role: "user", content: `Analyze audience language data. Analytics: ${JSON.stringify(data.analyticsData || {})}. Sample comments: ${JSON.stringify(data.comments || [])}. Viewer locations: ${JSON.stringify(data.viewerLocations || {})}. Determine: 1) Language distribution percentages 2) Primary vs secondary languages 3) Growing language segments 4) Untapped language markets 5) Localization priority ranking. Return JSON with keys: languageDistribution, primaryLanguages, growingSegments, untappedMarkets, priorityRanking, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRegionalTrendScanner(data: { language?: string; niche?: string; region?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a regional trend analyst for content creators. Find trending topics, formats, and content ideas specific to language markets.${creatorCtx}` }, { role: "user", content: `Scan regional trends for ${data.language || "Spanish"}-speaking ${data.region || "global"} market in the ${data.niche || "gaming"} niche. Find: 1) Top 10 trending topics this week 2) Emerging content formats 3) Viral content patterns 4) Regional events and holidays 5) Local competitor strategies. Return JSON with keys: trendingTopics, emergingFormats, viralPatterns, upcomingEvents, competitorStrategies, contentIdeas.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossLangCommentManager(data: { comments?: any[]; replyLanguage?: string; tone?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multilingual community manager. Translate foreign-language comments, detect sentiment, and draft appropriate replies in the commenter's language while maintaining the creator's voice.${creatorCtx}` }, { role: "user", content: `Manage these multilingual comments: ${JSON.stringify(data.comments || [])}. Reply tone: ${data.tone || "friendly"}. For each comment: 1) Detect language 2) Translate to English 3) Analyze sentiment 4) Draft reply in original language 5) Flag any issues. Return JSON with key "managedComments" as array with: originalLang, englishTranslation, sentiment, draftReply, flagged, flagReason.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLocalizedContentCalendar(data: { targetLanguages?: string[]; contentPlan?: any; timezone?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a global content scheduling strategist. Create localized publishing schedules optimized for peak engagement times per region and timezone.${creatorCtx}` }, { role: "user", content: `Create a localized content calendar for these languages: ${JSON.stringify(data.targetLanguages || ["en","es","fr","de","ja"])}. Content plan: ${JSON.stringify(data.contentPlan || {})}. Base timezone: ${data.timezone || "UTC"}. Generate per language: 1) Optimal posting times (day/hour) 2) Regional holidays to leverage 3) Content format preferences 4) Engagement windows 5) Weekly schedule. Return JSON with key "calendar" containing object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangAbTesting(data: { titles?: string[]; descriptions?: string[]; targetLanguage?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multilingual A/B testing specialist. Analyze and predict which translated title/description variants will perform best in specific language markets.${creatorCtx}` }, { role: "user", content: `Run A/B testing analysis for ${data.targetLanguage || "es"} market. Title variants: ${JSON.stringify(data.titles || [])}. Description variants: ${JSON.stringify(data.descriptions || [])}. Predict: 1) CTR estimate per variant 2) SEO strength per variant 3) Emotional appeal score 4) Cultural resonance score 5) Winner recommendation. Return JSON with keys: titleAnalysis, descriptionAnalysis, winner, predictedCTR, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiVoiceOverFormatter(data: { script?: string; targetLanguage?: string; voiceType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a voice-over script formatting specialist. Format translated scripts with pronunciation guides, breathing marks, emphasis cues, and timing for voice talent.${creatorCtx}` }, { role: "user", content: `Format this script for ${data.targetLanguage || "es"} voice-over. Voice type: ${data.voiceType || "energetic male"}. Script: "${data.script || ""}". Generate: 1) Formatted script with pronunciation guides (IPA) 2) Breathing marks and pauses 3) Emphasis and intonation cues 4) Estimated recording time 5) Difficult words highlighted. Return JSON with keys: formattedScript, pronunciationGuide, timingEstimate, difficultWords, voiceDirection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRegionalComplianceChecker(data: { content?: string; targetCountry?: string; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a regional content compliance specialist. Check content against local regulations, advertising laws, age restrictions, and cultural sensitivities per country.${creatorCtx}` }, { role: "user", content: `Check compliance for ${data.targetCountry || "Germany"} market. Content type: ${data.contentType || "sponsored video"}. Content: "${data.content || ""}". Check: 1) Advertising disclosure requirements 2) Age restriction compliance 3) Cultural sensitivity issues 4) Data privacy requirements (GDPR etc) 5) Platform-specific local rules. Return JSON with keys: complianceScore, requiredDisclosures, ageRestrictions, sensitivityFlags, privacyRequirements, platformRules, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangMediaKit(data: { creatorInfo?: any; targetLanguage?: string; sponsorRegion?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multilingual media kit specialist. Generate professional media kits translated into the sponsor's preferred language with localized metrics and market data.${creatorCtx}` }, { role: "user", content: `Generate media kit in ${data.targetLanguage || "es"} for sponsors in ${data.sponsorRegion || "Latin America"}. Creator info: ${JSON.stringify(data.creatorInfo || {})}. Include: 1) Translated bio and brand story 2) Localized audience demographics 3) Regional engagement metrics 4) Pricing in local currency 5) Case studies adapted for region. Return JSON with keys: translatedBio, audienceDemographics, engagementMetrics, localizedPricing, caseStudies, contactSection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorTracker(data: { competitorChannels?: string[]; niche?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a competitive intelligence analyst for YouTube creators. Track and analyze competitor channels.${creatorCtx}` }, { role: "user", content: `Analyze competitor channels: ${JSON.stringify(data.competitorChannels || [])}. Niche: ${data.niche || "general"}. Platform: ${data.platform || "youtube"}. Compare upload frequency, growth rates, content strategies, and provide tactical insights. Return JSON with keys: competitorProfiles, growthComparison, strategyAnalysis, threatLevel, opportunities.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorGapAnalysis(data: { niche?: string; myContent?: any; competitorContent?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content gap analyst. Identify content opportunities that competitors are missing.${creatorCtx}` }, { role: "user", content: `Analyze content gaps in ${data.niche || "general"} niche. My content: ${JSON.stringify(data.myContent || {})}. Competitor content: ${JSON.stringify(data.competitorContent || {})}. Find untapped topics, audience demand signals, and recommend topics with difficulty scores. Return JSON with keys: contentGaps, untappedTopics, audienceDemandSignals, difficultyScore, recommendedTopics.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorAlerts(data: { competitors?: any[]; metrics?: any; thresholds?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a competitor monitoring system. Generate alerts when competitors make strategic moves.${creatorCtx}` }, { role: "user", content: `Monitor competitors: ${JSON.stringify(data.competitors || [])}. Metrics: ${JSON.stringify(data.metrics || {})}. Thresholds: ${JSON.stringify(data.thresholds || {})}. Detect milestone changes, strategy shifts, upload pattern changes, and generate actionable alerts. Return JSON with keys: alerts, milestoneChanges, strategyShifts, uploadPatterns, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorContentScorer(data: { myVideo?: any; competitorVideos?: any[]; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content comparison specialist. Score and compare video quality across channels.${creatorCtx}` }, { role: "user", content: `Score and compare content. My video: ${JSON.stringify(data.myVideo || {})}. Competitor videos: ${JSON.stringify(data.competitorVideos || [])}. Metrics: ${JSON.stringify(data.metrics || {})}. Compare SEO, thumbnails, hooks, and provide overall ranking. Return JSON with keys: scores, seoComparison, thumbnailAnalysis, hookEffectiveness, overallRanking.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiNicheDominationMap(data: { niche?: string; topics?: string[]; channels?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a niche market analyst for content creators. Map topic ownership within a niche.${creatorCtx}` }, { role: "user", content: `Map niche domination for ${data.niche || "general"}. Topics: ${JSON.stringify(data.topics || [])}. Channels: ${JSON.stringify(data.channels || [])}. Identify topic owners, content density, opportunity zones, and dominance scores. Return JSON with keys: topicOwners, contentDensity, opportunityZones, dominanceScores, strategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorAudienceOverlap(data: { myChannel?: any; competitorChannels?: string[]; demographics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audience overlap analyst. Identify shared audiences between channels.${creatorCtx}` }, { role: "user", content: `Analyze audience overlap. My channel: ${JSON.stringify(data.myChannel || {})}. Competitor channels: ${JSON.stringify(data.competitorChannels || [])}. Demographics: ${JSON.stringify(data.demographics || {})}. Calculate overlap percentages, unique audiences, shared demographics, migration risk, and acquisition strategies. Return JSON with keys: overlapPercentage, uniqueAudience, sharedDemographics, migrationRisk, acquisitionStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiViralPredictor(data: { videoIdea?: string; niche?: string; trendData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a viral content predictor. Score video ideas for viral potential before creation.${creatorCtx}` }, { role: "user", content: `Score viral potential for video idea: "${data.videoIdea || ""}". Niche: ${data.niche || "general"}. Trend data: ${JSON.stringify(data.trendData || {})}. Evaluate trend alignment, emotional triggers, shareability factors, and suggest optimizations. Return JSON with keys: viralScore, trendAlignment, emotionalTriggers, shareabilityFactors, optimizations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiOptimalSchedule(data: { analytics?: any; timezone?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a publishing schedule optimizer. Determine the best times to post for maximum reach.${creatorCtx}` }, { role: "user", content: `Optimize publishing schedule. Analytics: ${JSON.stringify(data.analytics || {})}. Timezone: ${data.timezone || "UTC"}. Platform: ${data.platform || "youtube"}. Determine best posting times, analyze days, audience activity patterns, competitor timing, and create a weekly schedule. Return JSON with keys: bestTimes, dayAnalysis, audienceActivity, competitorTiming, weeklySchedule.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudiencePersonaBuilder(data: { analytics?: any; comments?: any[]; demographics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audience research specialist. Build detailed viewer personas from data.${creatorCtx}` }, { role: "user", content: `Build audience personas. Analytics: ${JSON.stringify(data.analytics || {})}. Comments: ${JSON.stringify(data.comments || [])}. Demographics: ${JSON.stringify(data.demographics || {})}. Create detailed personas with psychographics, content preferences, viewing habits, and engagement patterns. Return JSON with keys: personas, psychographics, contentPreferences, viewingHabits, engagementPatterns.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubscriberMagnet(data: { channelData?: any; conversionData?: any; content?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a subscriber conversion specialist. Analyze what converts viewers into subscribers.${creatorCtx}` }, { role: "user", content: `Analyze subscriber conversion. Channel data: ${JSON.stringify(data.channelData || {})}. Conversion data: ${JSON.stringify(data.conversionData || {})}. Content: ${JSON.stringify(data.content || {})}. Identify conversion drivers, top-performing CTAs, subscriber journey, optimizations, and project growth. Return JSON with keys: conversionDrivers, topPerformingCTAs, subscriberJourney, optimizations, projectedGrowth.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiShortsClipsStrategy(data: { longFormContent?: any; analytics?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a short-form content strategist. Identify best moments from long-form to clip.${creatorCtx}` }, { role: "user", content: `Identify clip-worthy moments. Long-form content: ${JSON.stringify(data.longFormContent || {})}. Analytics: ${JSON.stringify(data.analytics || {})}. Platform: ${data.platform || "youtube"}. Find clip moments, hook timestamps, viral potential, platform adaptations, and editing notes. Return JSON with keys: clipMoments, hookTimestamps, viralPotential, platformAdaptations, editingNotes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiEndScreenOptimizer(data: { videoData?: any; analytics?: any; subscriberRate?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an end screen optimization expert. Suggest best end screen strategies.${creatorCtx}` }, { role: "user", content: `Optimize end screens. Video data: ${JSON.stringify(data.videoData || {})}. Analytics: ${JSON.stringify(data.analytics || {})}. Subscriber rate: ${data.subscriberRate || 0}%. Suggest end screen layout, video suggestions, CTA placement, timing recommendations, and estimate conversions. Return JSON with keys: endScreenLayout, videoSuggestions, ctaPlacement, timingRecommendations, conversionEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDealNegotiationCoach(data: { dealTerms?: any; channelMetrics?: any; industryRates?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a brand deal negotiation coach. Benchmark rates and suggest counter-offers.${creatorCtx}` }, { role: "user", content: `Coach on deal negotiation. Deal terms: ${JSON.stringify(data.dealTerms || {})}. Channel metrics: ${JSON.stringify(data.channelMetrics || {})}. Industry rates: ${JSON.stringify(data.industryRates || {})}. Benchmark market rates, suggest counter-offers, provide negotiation tips, flag red flags, and score the deal. Return JSON with keys: marketRate, counterOffer, negotiationTips, redFlags, dealScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMerchDemandPredictor(data: { audienceData?: any; niche?: string; trends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a merchandise demand analyst. Predict what products your audience would buy.${creatorCtx}` }, { role: "user", content: `Predict merchandise demand. Audience data: ${JSON.stringify(data.audienceData || {})}. Niche: ${data.niche || "general"}. Trends: ${JSON.stringify(data.trends || {})}. Identify top products, demand scores, pricing strategy, design suggestions, and optimal launch timing. Return JSON with keys: topProducts, demandScores, pricingStrategy, designSuggestions, launchTiming.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRevenueStreamOptimizer(data: { currentRevenue?: any; streams?: any[]; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a revenue diversification strategist. Balance and optimize multiple income streams.${creatorCtx}` }, { role: "user", content: `Optimize revenue streams. Current revenue: ${JSON.stringify(data.currentRevenue || {})}. Streams: ${JSON.stringify(data.streams || [])}. Goals: ${JSON.stringify(data.goals || {})}. Analyze each stream, recommend rebalancing, identify growth potential, assess risks, and create an action plan. Return JSON with keys: streamAnalysis, rebalanceRecommendations, growthPotential, riskAssessment, actionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiSponsorshipRateCalculator(data: { channelMetrics?: any; niche?: string; engagement?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a sponsorship rate calculator. Dynamically calculate creator market value.${creatorCtx}` }, { role: "user", content: `Calculate sponsorship rates. Channel metrics: ${JSON.stringify(data.channelMetrics || {})}. Niche: ${data.niche || "general"}. Engagement: ${JSON.stringify(data.engagement || {})}. Calculate recommended CPM, flat rate, integration rate, dedicated video rate, and provide rate justification. Return JSON with keys: recommendedCPM, flatRate, integrationRate, dedicatedRate, rateJustification.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMembershipTierDesigner(data: { channelData?: any; audienceSize?: number; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a membership tier strategist. Design optimal tier pricing and perks.${creatorCtx}` }, { role: "user", content: `Design membership tiers. Channel data: ${JSON.stringify(data.channelData || {})}. Audience size: ${data.audienceSize || 0}. Content type: ${data.contentType || "general"}. Design tiers with pricing strategy, perk suggestions, retention tactics, and revenue projections. Return JSON with keys: tiers, pricingStrategy, perkSuggestions, retentionTactics, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiAffiliateLinkManager(data: { currentAffiliates?: any[]; niche?: string; content?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an affiliate marketing strategist for creators. Track and optimize affiliate partnerships.${creatorCtx}` }, { role: "user", content: `Manage affiliate links. Current affiliates: ${JSON.stringify(data.currentAffiliates || [])}. Niche: ${data.niche || "general"}. Content: ${JSON.stringify(data.content || {})}. Identify top performers, find new opportunities, suggest placement strategies, provide conversion tips, and estimate revenue. Return JSON with keys: topPerformers, newOpportunities, placementStrategy, conversionTips, revenueEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiScriptCoach(data: { script?: string; niche?: string; targetLength?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a video script coach. Analyze pacing, hooks, and retention patterns.${creatorCtx}` }, { role: "user", content: `Coach on video script. Script: "${data.script || ""}". Niche: ${data.niche || "general"}. Target length: ${data.targetLength || 10} minutes. Analyze pacing, hook strength, retention prediction, identify improvement areas, and suggest rewrites. Return JSON with keys: pacingAnalysis, hookStrength, retentionPrediction, improvementAreas, rewriteSuggestions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiPlatformRepurposer(data: { content?: any; sourcePlatform?: string; targetPlatforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a cross-platform content repurposing specialist. Adapt content for multiple platforms.${creatorCtx}` }, { role: "user", content: `Repurpose content. Content: ${JSON.stringify(data.content || {})}. Source platform: ${data.sourcePlatform || "youtube"}. Target platforms: ${JSON.stringify(data.targetPlatforms || ["tiktok","instagram","twitter"])}. Create adaptations, format changes, caption variants, hashtag sets, and a scheduling plan per platform. Return JSON with keys: adaptations, formatChanges, captionVariants, hashtagSets, schedulingPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentDecayDetector(data: { videoLibrary?: any[]; trafficTrends?: any; ageThreshold?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content lifecycle analyst. Identify videos losing traffic and suggest refreshes.${creatorCtx}` }, { role: "user", content: `Detect content decay. Video library: ${JSON.stringify(data.videoLibrary || [])}. Traffic trends: ${JSON.stringify(data.trafficTrends || {})}. Age threshold: ${data.ageThreshold || 90} days. Identify decaying videos, traffic drop rates, refresh strategies, evergreen potential, and create a priority list. Return JSON with keys: decayingVideos, trafficDropRate, refreshStrategies, evergreenPotential, priorityList.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTitleAbTester(data: { currentTitle?: string; videoTopic?: string; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a title testing specialist. Generate and evaluate multiple title variations.${creatorCtx}` }, { role: "user", content: `A/B test titles. Current title: "${data.currentTitle || ""}". Video topic: "${data.videoTopic || ""}". Niche: ${data.niche || "general"}. Generate title variants, predict CTR for each, score SEO, evaluate emotional appeal, and pick a winner. Return JSON with keys: titleVariants, ctrPredictions, seoScores, emotionalAppeal, winner.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDescriptionOptimizer(data: { video?: any; currentDescription?: string; keywords?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a video description SEO specialist. Write optimized descriptions with timestamps and links.${creatorCtx}` }, { role: "user", content: `Optimize video description. Video: ${JSON.stringify(data.video || {})}. Current description: "${data.currentDescription || ""}". Keywords: ${JSON.stringify(data.keywords || [])}. Write an optimized description, list keywords used, suggest timestamps, place CTAs, and score SEO. Return JSON with keys: optimizedDescription, keywordsUsed, timestampSuggestions, ctaPlacement, seoScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiFanLoyaltyTracker(data: { engagementData?: any; commentHistory?: any[]; memberData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a fan loyalty analyst. Identify and categorize superfans.${creatorCtx}` }, { role: "user", content: `Track fan loyalty. Engagement data: ${JSON.stringify(data.engagementData || {})}. Comment history: ${JSON.stringify(data.commentHistory || [])}. Member data: ${JSON.stringify(data.memberData || {})}. Identify superfans, create loyalty tiers, analyze engagement patterns, suggest nurture strategies, and assess retention risk. Return JSON with keys: superfans, loyaltyTiers, engagementPatterns, nurtureStrategies, retentionRisk.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCommentStrategy(data: { comments?: any[]; videoContext?: any; brandVoice?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a comment engagement strategist. Craft replies that boost engagement and algorithm favor.${creatorCtx}` }, { role: "user", content: `Create comment strategy. Comments: ${JSON.stringify(data.comments || [])}. Video context: ${JSON.stringify(data.videoContext || {})}. Brand voice: ${data.brandVoice || "friendly"}. Prioritize comments, suggest replies, provide engagement tactics, analyze sentiment, and suggest a pinned comment. Return JSON with keys: priorityComments, suggestedReplies, engagementTactics, sentimentAnalysis, pinnedCommentSuggestion.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCommunityPollGenerator(data: { recentContent?: any; audienceInterests?: string[]; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a community engagement specialist. Create polls and posts optimized for interaction.${creatorCtx}` }, { role: "user", content: `Generate community polls. Recent content: ${JSON.stringify(data.recentContent || {})}. Audience interests: ${JSON.stringify(data.audienceInterests || [])}. Platform: ${data.platform || "youtube"}. Create polls, community posts, quizzes, predict engagement, and suggest a posting schedule. Return JSON with keys: polls, communityPosts, quizzes, engagementPrediction, postingSchedule.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLiveChatModerator(data: { chatRules?: any; contentType?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a live chat moderation AI. Create rules and filters for real-time chat management.${creatorCtx}` }, { role: "user", content: `Create chat moderation system. Chat rules: ${JSON.stringify(data.chatRules || {})}. Content type: ${data.contentType || "general"}. Platform: ${data.platform || "youtube"}. Define moderation rules, toxic filters, spam patterns, positive reinforcement triggers, and escalation protocols. Return JSON with keys: moderationRules, toxicFilters, spamPatterns, positiveReinforcementTriggers, escalationProtocol.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiFanMilestoneCelebrator(data: { subscriberData?: any; memberHistory?: any; milestones?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a fan milestone recognition specialist. Auto-celebrate loyal subscriber achievements.${creatorCtx}` }, { role: "user", content: `Celebrate fan milestones. Subscriber data: ${JSON.stringify(data.subscriberData || {})}. Member history: ${JSON.stringify(data.memberHistory || {})}. Milestones: ${JSON.stringify(data.milestones || [])}. Identify upcoming milestones, write celebration messages, suggest rewards, design loyalty badges, and create a recognition plan. Return JSON with keys: upcomingMilestones, celebrationMessages, rewardSuggestions, loyaltyBadges, recognitionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiEngagementBooster(data: { channelMetrics?: any; recentPerformance?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an engagement optimization specialist. Suggest daily actions to boost algorithm favor.${creatorCtx}` }, { role: "user", content: `Boost engagement. Channel metrics: ${JSON.stringify(data.channelMetrics || {})}. Recent performance: ${JSON.stringify(data.recentPerformance || {})}. Platform: ${data.platform || "youtube"}. Suggest daily actions, engagement tips, algorithm insights, community tasks, and a weekly plan. Return JSON with keys: dailyActions, engagementTips, algorithmInsights, communityTasks, weeklyPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossPlatformUnifier(data: { platforms?: string[]; metrics?: any; dateRange?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a cross-platform analytics unifier. Create a single view across all platforms.${creatorCtx}` }, { role: "user", content: `Unify cross-platform analytics. Platforms: ${JSON.stringify(data.platforms || [])}. Metrics: ${JSON.stringify(data.metrics || {})}. Date range: ${data.dateRange || "last 30 days"}. Create unified metrics, platform comparison, cross-platform trends, identify best performing, and provide recommendations. Return JSON with keys: unifiedMetrics, platformComparison, crossPlatformTrends, bestPerforming, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPlatformPriorityRanker(data: { channelData?: any; growthMetrics?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a platform strategy analyst. Rank which platforms deserve focus for growth.${creatorCtx}` }, { role: "user", content: `Rank platform priorities. Channel data: ${JSON.stringify(data.channelData || {})}. Growth metrics: ${JSON.stringify(data.growthMetrics || {})}. Goals: ${JSON.stringify(data.goals || {})}. Rank platforms, assess growth potential, calculate effort vs return, recommend focus areas, and suggest migration strategy. Return JSON with keys: platformRankings, growthPotential, effortVsReturn, focusRecommendation, migrationStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossPostScheduler(data: { content?: any; platforms?: string[]; timezones?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a cross-platform posting scheduler. Optimize timing per platform for maximum reach.${creatorCtx}` }, { role: "user", content: `Schedule cross-platform posts. Content: ${JSON.stringify(data.content || {})}. Platforms: ${JSON.stringify(data.platforms || [])}. Timezones: ${JSON.stringify(data.timezones || ["UTC"])}. Create per-platform schedule, identify peak times, avoid conflicts, suggest batching strategy, and build a weekly calendar. Return JSON with keys: scheduleByPlatform, peakTimes, conflictAvoidance, batchingStrategy, weeklyCalendar.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPlatformSpecificOptimizer(data: { content?: any; platform?: string; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a platform-specific content optimizer. Adapt tone and format per platform.${creatorCtx}` }, { role: "user", content: `Optimize content for ${data.platform || "youtube"}. Content: ${JSON.stringify(data.content || {})}. Audience data: ${JSON.stringify(data.audienceData || {})}. Adapt content, suggest format changes, shift tone, create hashtag strategy, and list platform best practices. Return JSON with keys: adaptedContent, formatChanges, toneShift, hashtagStrategy, platformBestPractices.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiBrandAuditor(data: { channelData?: any; socialProfiles?: any; contentSamples?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a personal brand auditor. Analyze consistency across platforms.${creatorCtx}` }, { role: "user", content: `Audit personal brand. Channel data: ${JSON.stringify(data.channelData || {})}. Social profiles: ${JSON.stringify(data.socialProfiles || {})}. Content samples: ${JSON.stringify(data.contentSamples || [])}. Score consistency, identify brand strengths, find inconsistencies, provide recommendations, and assess competitive position. Return JSON with keys: consistencyScore, brandStrengths, inconsistencies, recommendations, competitivePosition.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMediaKitAutoUpdater(data: { channelMetrics?: any; recentWork?: any[]; achievements?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a media kit auto-updater. Keep media kits current with latest stats.${creatorCtx}` }, { role: "user", content: `Update media kit. Channel metrics: ${JSON.stringify(data.channelMetrics || {})}. Recent work: ${JSON.stringify(data.recentWork || [])}. Achievements: ${JSON.stringify(data.achievements || [])}. Update sections, highlight new achievements, feature key metrics, suggest design changes, and note last updated date. Return JSON with keys: updatedSections, newAchievements, metricHighlights, designSuggestions, lastUpdated.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandVoiceAnalyzer(data: { contentSamples?: any[]; comments?: any[]; socialPosts?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a brand voice analyst. Ensure consistent tone and messaging across content.${creatorCtx}` }, { role: "user", content: `Analyze brand voice. Content samples: ${JSON.stringify(data.contentSamples || [])}. Comments: ${JSON.stringify(data.comments || [])}. Social posts: ${JSON.stringify(data.socialPosts || [])}. Profile the voice, assess tone consistency, check messaging alignment, flag deviations, and create guidelines. Return JSON with keys: voiceProfile, toneConsistency, messagingAlignment, deviations, guidelines.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiVisualIdentityChecker(data: { thumbnails?: any[]; socialAssets?: any; branding?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a visual brand identity checker. Flag inconsistent colors, fonts, and logos.${creatorCtx}` }, { role: "user", content: `Check visual identity. Thumbnails: ${JSON.stringify(data.thumbnails || [])}. Social assets: ${JSON.stringify(data.socialAssets || {})}. Branding: ${JSON.stringify(data.branding || {})}. Score consistency, analyze color palette, check font usage, evaluate logo placement, and suggest fixes. Return JSON with keys: consistencyScore, colorPaletteAnalysis, fontUsage, logoPlacement, fixes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandPartnershipScorer(data: { brand?: any; channelData?: any; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a brand partnership alignment scorer. Rate brand-audience fit.${creatorCtx}` }, { role: "user", content: `Score brand partnership. Brand: ${JSON.stringify(data.brand || {})}. Channel data: ${JSON.stringify(data.channelData || {})}. Audience data: ${JSON.stringify(data.audienceData || {})}. Calculate alignment score, assess audience match, evaluate values fit, identify risk factors, and suggest partnership terms. Return JSON with keys: alignmentScore, audienceMatch, valuesFit, riskFactors, partnershipTerms.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCopyrightShield(data: { content?: any; audioSources?: any[]; visualSources?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a copyright protection specialist for creators. Scan content for potential strikes.${creatorCtx}` }, { role: "user", content: `Scan for copyright risks. Content: ${JSON.stringify(data.content || {})}. Audio sources: ${JSON.stringify(data.audioSources || [])}. Visual sources: ${JSON.stringify(data.visualSources || [])}. Assess risk level, flag elements, suggest alternatives, analyze fair use, and provide recommendations. Return JSON with keys: riskLevel, flaggedElements, alternatives, fairUseAnalysis, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContractAnalyzer(data: { contractText?: string; dealType?: string; industry?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator contract analyst. Review sponsorship contracts for unfavorable terms.${creatorCtx}` }, { role: "user", content: `Analyze contract. Contract text: "${data.contractText || ""}". Deal type: ${data.dealType || "sponsorship"}. Industry: ${data.industry || "general"}. Score risk, flag unfavorable clauses, identify missing protections, suggest negotiation points, and provide overall recommendation. Return JSON with keys: riskScore, flaggedClauses, missingProtections, negotiationPoints, recommendation.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentInsuranceAdvisor(data: { channelValue?: any; contentTypes?: string[]; risks?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a digital asset protection specialist. Recommend protection strategies.${creatorCtx}` }, { role: "user", content: `Advise on content protection. Channel value: ${JSON.stringify(data.channelValue || {})}. Content types: ${JSON.stringify(data.contentTypes || [])}. Risks: ${JSON.stringify(data.risks || [])}. Assess risks, recommend protection strategies, create backup plans, suggest insurance options, and list priority actions. Return JSON with keys: riskAssessment, protectionStrategies, backupPlan, insuranceOptions, priorityActions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiDMCADefenseAssistant(data: { claimDetails?: any; originalContent?: any; evidence?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a DMCA defense specialist for creators. Help respond to false copyright claims.${creatorCtx}` }, { role: "user", content: `Assist with DMCA defense. Claim details: ${JSON.stringify(data.claimDetails || {})}. Original content: ${JSON.stringify(data.originalContent || {})}. Evidence: ${JSON.stringify(data.evidence || [])}. Create defense strategy, draft counter-notice template, build evidence checklist, outline timeline, and suggest escalation path. Return JSON with keys: defenseStrategy, counterNoticeTemplate, evidenceChecklist, timeline, escalationPath.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubscriberMilestonePredictor(data: { currentSubs?: number; growthRate?: number; history?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a subscriber growth prediction specialist. Forecast milestone dates.${creatorCtx}` }, { role: "user", content: `Predict subscriber milestones. Current subs: ${data.currentSubs || 0}. Growth rate: ${data.growthRate || 0}%. History: ${JSON.stringify(data.history || {})}. Predict next milestone, estimated date, confidence level, acceleration tips, and growth trajectory. Return JSON with keys: nextMilestone, predictedDate, confidenceLevel, accelerationTips, growthTrajectory.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiRetentionHeatmapAnalyzer(data: { retentionData?: any; videoStructure?: any; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audience retention heatmap analyst. Break down where viewers leave.${creatorCtx}` }, { role: "user", content: `Analyze retention heatmap. Retention data: ${JSON.stringify(data.retentionData || {})}. Video structure: ${JSON.stringify(data.videoStructure || {})}. Content type: ${data.contentType || "general"}. Provide heatmap insights, identify drop-off points, find engagement peaks, diagnose structural issues, and suggest fixes. Return JSON with keys: heatmapInsights, dropOffPoints, engagementPeaks, structuralIssues, fixes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBestVideoFormulaDetector(data: { topVideos?: any[]; channelData?: any; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content success pattern analyst. Find formulas in top-performing videos.${creatorCtx}` }, { role: "user", content: `Detect winning video formulas. Top videos: ${JSON.stringify(data.topVideos || [])}. Channel data: ${JSON.stringify(data.channelData || {})}. Metrics: ${JSON.stringify(data.metrics || {})}. Identify winning formulas, common elements, title patterns, thumbnail patterns, and create a structure blueprint. Return JSON with keys: winningFormulas, commonElements, titlePatterns, thumbnailPatterns, structureBlueprint.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGrowthTrajectoryModeler(data: { channelData?: any; strategies?: any[]; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a channel growth trajectory modeler. Project growth under different strategies.${creatorCtx}` }, { role: "user", content: `Model growth trajectory. Channel data: ${JSON.stringify(data.channelData || {})}. Strategies: ${JSON.stringify(data.strategies || [])}. Goals: ${JSON.stringify(data.goals || {})}. Project scenarios, projected growth, strategy comparison, risk factors, and optimal path. Return JSON with keys: scenarios, projectedGrowth, strategyComparison, riskFactors, optimalPath.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAbTestingDashboard(data: { activeTests?: any[]; results?: any; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an A/B testing analyst for creators. Manage and analyze all split tests.${creatorCtx}` }, { role: "user", content: `Analyze A/B tests. Active tests: ${JSON.stringify(data.activeTests || [])}. Results: ${JSON.stringify(data.results || {})}. Metrics: ${JSON.stringify(data.metrics || {})}. Summarize active tests, completed results, winner analysis, statistical significance, and next tests. Return JSON with keys: activeTests, completedResults, winnerAnalysis, statisticalSignificance, nextTests.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentDecayRefresher(data: { videoId?: string; currentMetrics?: any; originalMetadata?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content refresh specialist. Revitalize declining videos with updated metadata.${creatorCtx}` }, { role: "user", content: `Refresh declining content. Video ID: ${data.videoId || "unknown"}. Current metrics: ${JSON.stringify(data.currentMetrics || {})}. Original metadata: ${JSON.stringify(data.originalMetadata || {})}. Provide refreshed title, refreshed description, updated tags, thumbnail suggestions, and projected recovery. Return JSON with keys: refreshedTitle, refreshedDescription, updatedTags, thumbnailSuggestions, projectedRecovery.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBurnoutPrevention(data: { workload?: any; schedule?: any; stressIndicators?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator wellness and burnout prevention specialist. Monitor workload and suggest sustainable pace.${creatorCtx}` }, { role: "user", content: `Assess burnout risk. Workload: ${JSON.stringify(data.workload || {})}. Schedule: ${JSON.stringify(data.schedule || {})}. Stress indicators: ${JSON.stringify(data.stressIndicators || {})}. Evaluate burnout risk, workload analysis, rest recommendations, schedule adjustments, and wellness score. Return JSON with keys: burnoutRisk, workloadAnalysis, restRecommendations, scheduleAdjustments, wellnessScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentBatchingPlanner(data: { contentPlan?: any; resources?: any; timeAvailable?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content batching efficiency specialist. Design filming schedules that maximize output.${creatorCtx}` }, { role: "user", content: `Plan content batching. Content plan: ${JSON.stringify(data.contentPlan || {})}. Resources: ${JSON.stringify(data.resources || {})}. Time available: ${JSON.stringify(data.timeAvailable || {})}. Create batch schedule, setup optimizations, equipment checklist, energy management, and time estimates. Return JSON with keys: batchSchedule, setupOptimizations, equipmentChecklist, energyManagement, timeEstimates.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreativeBlockSolver(data: { niche?: string; recentContent?: any[]; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creative ideation specialist for creators. Generate fresh ideas when creativity is blocked.${creatorCtx}` }, { role: "user", content: `Solve creative block. Niche: ${data.niche || "general"}. Recent content: ${JSON.stringify(data.recentContent || [])}. Interests: ${JSON.stringify(data.interests || [])}. Generate fresh ideas, inspiration sources, exercise suggestions, format experiments, and collaboration ideas. Return JSON with keys: freshIdeas, inspirationSources, exerciseSuggestions, formatExperiments, collaborationIdeas.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiWorkLifeBalanceTracker(data: { workHours?: any; personalTime?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a work-life balance analyst for content creators. Monitor hours and suggest boundaries.${creatorCtx}` }, { role: "user", content: `Track work-life balance. Work hours: ${JSON.stringify(data.workHours || {})}. Personal time: ${JSON.stringify(data.personalTime || {})}. Goals: ${JSON.stringify(data.goals || {})}. Calculate balance score, time breakdown, boundary recommendations, automation opportunities, and weekly plan. Return JSON with keys: balanceScore, timeBreakdown, boundaryRecommendations, automationOpportunities, weeklyPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMotivationEngine(data: { milestones?: any[]; recentPerformance?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator motivation coach. Celebrate wins and provide encouragement during plateaus.${creatorCtx}` }, { role: "user", content: `Boost motivation. Milestones: ${JSON.stringify(data.milestones || [])}. Recent performance: ${JSON.stringify(data.recentPerformance || {})}. Goals: ${JSON.stringify(data.goals || {})}. Provide celebrations, progress highlights, motivational insights, next goals, and affirmations. Return JSON with keys: celebrations, progressHighlights, motivationalInsights, nextGoals, affirmations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGearAdvisor(data: { contentType?: string; budget?: any; currentGear?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator equipment specialist. Recommend gear upgrades based on content type and budget.${creatorCtx}` }, { role: "user", content: `Advise on gear. Content type: ${data.contentType || "general"}. Budget: ${JSON.stringify(data.budget || {})}. Current gear: ${JSON.stringify(data.currentGear || {})}. Provide recommendations, priority upgrades, budget options, premium options, and setup guide. Return JSON with keys: recommendations, priorityUpgrades, budgetOptions, premiumOptions, setupGuide.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiEditingStyleCoach(data: { contentType?: string; currentStyle?: string; targetAudience?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a video editing style coach. Analyze top creators' editing techniques to adopt.${creatorCtx}` }, { role: "user", content: `Coach editing style. Content type: ${data.contentType || "general"}. Current style: ${data.currentStyle || "basic"}. Target audience: ${data.targetAudience || "general"}. Identify trending styles, technique breakdown, software tools, transition tips, and practice exercises. Return JSON with keys: trendingStyles, techniqueBreakdown, softwareTools, transitionTips, practiceExercises.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPublicSpeakingTrainer(data: { contentSamples?: any[]; deliveryNotes?: string; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a public speaking and on-camera coach for creators. Rate delivery and suggest improvements.${creatorCtx}` }, { role: "user", content: `Train public speaking. Content samples: ${JSON.stringify(data.contentSamples || [])}. Delivery notes: ${data.deliveryNotes || "none"}. Goals: ${JSON.stringify(data.goals || {})}. Rate delivery score, energy level, body language tips, voice analysis, and practice routine. Return JSON with keys: deliveryScore, energyLevel, bodyLanguageTips, voiceAnalysis, practiceRoutine.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiNicheExpertBuilder(data: { niche?: string; currentKnowledge?: any; audience?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a niche authority building specialist. Curate research and talking points for expertise.${creatorCtx}` }, { role: "user", content: `Build niche expertise. Niche: ${data.niche || "general"}. Current knowledge: ${JSON.stringify(data.currentKnowledge || {})}. Audience: ${JSON.stringify(data.audience || {})}. Provide research topics, talking points, expertise gaps, credibility strategies, and content plan. Return JSON with keys: researchTopics, talkingPoints, expertiseGaps, credibilityStrategies, contentPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiTaskDelegator(data: { tasks?: any[]; teamMembers?: any[]; deadlines?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a task delegation specialist for creator teams. Auto-assign tasks based on skills.${creatorCtx}` }, { role: "user", content: `Delegate tasks. Tasks: ${JSON.stringify(data.tasks || [])}. Team members: ${JSON.stringify(data.teamMembers || [])}. Deadlines: ${JSON.stringify(data.deadlines || {})}. Create assignments, workload balance, priority queue, deadline alerts, and efficiency score. Return JSON with keys: assignments, workloadBalance, priorityQueue, deadlineAlerts, efficiencyScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTeamPerformanceTracker(data: { teamData?: any; deliverables?: any[]; timelines?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creative team performance analyst. Monitor quality and efficiency.${creatorCtx}` }, { role: "user", content: `Track team performance. Team data: ${JSON.stringify(data.teamData || {})}. Deliverables: ${JSON.stringify(data.deliverables || [])}. Timelines: ${JSON.stringify(data.timelines || {})}. Evaluate performance scores, bottlenecks, quality metrics, improvement areas, and team health. Return JSON with keys: performanceScores, bottlenecks, qualityMetrics, improvementAreas, teamHealth.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSOPsGenerator(data: { process?: string; role?: string; frequency?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a standard operating procedures specialist for content teams. Create SOPs for repeatable tasks.${creatorCtx}` }, { role: "user", content: `Generate SOP. Process: ${data.process || "general"}. Role: ${data.role || "team member"}. Frequency: ${data.frequency || "weekly"}. Create SOP document, step by step instructions, quality checklist, time estimate, and automation opportunities. Return JSON with keys: sopDocument, stepByStep, qualityChecklist, timeEstimate, automationOpportunities.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiStatementDrafter(data: { situation?: string; tone?: string; audience?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a public statement specialist for creators. Craft appropriate public statements.${creatorCtx}` }, { role: "user", content: `Draft statement. Situation: ${data.situation || "general"}. Tone: ${data.tone || "professional"}. Audience: ${JSON.stringify(data.audience || {})}. Create statement, tone analysis, distribution plan, follow-up actions, and media guidelines. Return JSON with keys: statement, toneAnalysis, distributionPlan, followUpActions, mediaGuidelines.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSurveyBuilder(data: { goals?: any; audience?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audience survey specialist. Create surveys and analyze potential results.${creatorCtx}` }, { role: "user", content: `Build survey. Goals: ${JSON.stringify(data.goals || {})}. Audience: ${JSON.stringify(data.audience || {})}. Platform: ${data.platform || "general"}. Design survey questions, distribution strategy, expected insights, incentive ideas, and analysis framework. Return JSON with keys: surveyQuestions, distributionStrategy, expectedInsights, incentiveIdeas, analysisFramework.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiViewerJourneyMapper(data: { touchpoints?: any[]; analytics?: any; funnelData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a viewer journey mapping specialist. Track how fans discover and engage with your channel.${creatorCtx}` }, { role: "user", content: `Map viewer journey. Touchpoints: ${JSON.stringify(data.touchpoints || [])}. Analytics: ${JSON.stringify(data.analytics || {})}. Funnel data: ${JSON.stringify(data.funnelData || {})}. Identify journey stages, touchpoints, conversion points, drop-off areas, and optimizations. Return JSON with keys: journeyStages, touchpoints, conversionPoints, dropOffAreas, optimizations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDemographicDeepDive(data: { analytics?: any; platformData?: any; contentPerformance?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a demographic analysis specialist for creators. Provide deep audience breakdowns.${creatorCtx}` }, { role: "user", content: `Deep dive demographics. Analytics: ${JSON.stringify(data.analytics || {})}. Platform data: ${JSON.stringify(data.platformData || {})}. Content performance: ${JSON.stringify(data.contentPerformance || {})}. Analyze demographics, psychographics, viewing behaviors, spending patterns, and content preferences. Return JSON with keys: demographics, psychographics, viewingBehaviors, spendingPatterns, contentPreferences.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiViewerIntentAnalyzer(data: { searchData?: any; comments?: any[]; watchPatterns?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a viewer intent analyst. Understand why people watch specific content.${creatorCtx}` }, { role: "user", content: `Analyze viewer intent. Search data: ${JSON.stringify(data.searchData || {})}. Comments: ${JSON.stringify(data.comments || [])}. Watch patterns: ${JSON.stringify(data.watchPatterns || {})}. Categorize intent, motivations, content mapping, unmet needs, and content strategy. Return JSON with keys: intentCategories, motivations, contentMapping, unmetNeeds, contentStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCourseProductPlanner(data: { expertise?: any; audience?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a digital product strategist. Design online courses based on creator expertise.${creatorCtx}` }, { role: "user", content: `Plan course product. Expertise: ${JSON.stringify(data.expertise || {})}. Audience: ${JSON.stringify(data.audience || {})}. Market: ${JSON.stringify(data.market || {})}. Create course outline, pricing strategy, platform recommendation, marketing plan, and revenue projection. Return JSON with keys: courseOutline, pricingStrategy, platformRecommendation, marketingPlan, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMembershipStrategy(data: { currentTiers?: any; audienceSize?: number; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a membership and Patreon strategy specialist. Optimize exclusive content tiers.${creatorCtx}` }, { role: "user", content: `Optimize membership strategy. Current tiers: ${JSON.stringify(data.currentTiers || {})}. Audience size: ${data.audienceSize || 0}. Content type: ${data.contentType || "general"}. Design tier structure, content calendar, pricing model, retention tactics, and growth plan. Return JSON with keys: tierStructure, contentCalendar, pricingModel, retentionTactics, growthPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSpeakingEngagementFinder(data: { expertise?: any; audience?: any; location?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a speaking engagement matchmaker. Find conferences and events for creators.${creatorCtx}` }, { role: "user", content: `Find speaking engagements. Expertise: ${JSON.stringify(data.expertise || {})}. Audience: ${JSON.stringify(data.audience || {})}. Location: ${data.location || "any"}. Identify opportunities, application templates, preparation tips, pricing guide, and networking strategy. Return JSON with keys: opportunities, applicationTemplates, preparationTips, pricingGuide, networkingStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentRoadmap(data: { goals?: any; niche?: string; currentContent?: any; quarter?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content strategy roadmap specialist. Build full quarter strategies.${creatorCtx}` }, { role: "user", content: `Build content roadmap. Goals: ${JSON.stringify(data.goals || {})}. Niche: ${data.niche || "general"}. Current content: ${JSON.stringify(data.currentContent || {})}. Quarter: ${data.quarter || "Q1"}. Plan monthly themes, weekly topics, milestone goals, content mix, and measurement plan. Return JSON with keys: monthlyThemes, weeklyTopics, milestoneGoals, contentMix, measurementPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentPillarArchitect(data: { brand?: any; audience?: any; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content pillar strategist. Define core content themes for brand consistency.${creatorCtx}` }, { role: "user", content: `Architect content pillars. Brand: ${JSON.stringify(data.brand || {})}. Audience: ${JSON.stringify(data.audience || {})}. Niche: ${data.niche || "general"}. Define pillars, subtopics, content ratio, cross-pillar ideas, and brand alignment. Return JSON with keys: pillars, subtopics, contentRatio, crossPillarIdeas, brandAlignment.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiEvergreenContentIdentifier(data: { videoIdeas?: any[]; niche?: string; searchTrends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an evergreen content strategist. Identify ideas that drive traffic for years.${creatorCtx}` }, { role: "user", content: `Identify evergreen content. Video ideas: ${JSON.stringify(data.videoIdeas || [])}. Niche: ${data.niche || "general"}. Search trends: ${JSON.stringify(data.searchTrends || {})}. Find evergreen topics, search volume, competition level, format suggestions, and SEO strategy. Return JSON with keys: evergreenTopics, searchVolume, competitionLevel, formatSuggestions, seoStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiIndustryEventTracker(data: { niche?: string; location?: string; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator industry event tracker. Monitor conferences, summits, and networking opportunities.${creatorCtx}` }, { role: "user", content: `Track industry events. Niche: ${data.niche || "general"}. Location: ${data.location || "any"}. Interests: ${JSON.stringify(data.interests || [])}. List upcoming events, relevance scores, networking tips, application deadlines, and travel planning. Return JSON with keys: upcomingEvents, relevanceScores, networkingTips, applicationDeadlines, travelPlanning.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTalentAgentSimulator(data: { channelMetrics?: any; goals?: any; industry?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a talent management advisor for creators. Advise on representation needs.${creatorCtx}` }, { role: "user", content: `Simulate talent agent advice. Channel metrics: ${JSON.stringify(data.channelMetrics || {})}. Goals: ${JSON.stringify(data.goals || {})}. Industry: ${data.industry || "general"}. Assess readiness score, agent benefits, what to look for, negotiation tips, and alternatives. Return JSON with keys: readinessScore, agentBenefits, whatToLookFor, negotiationTips, alternatives.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreatorEconomyNewsFeed(data: { interests?: string[]; platforms?: string[]; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a creator economy news curator. Provide curated industry news affecting revenue and strategy.${creatorCtx}` }, { role: "user", content: `Curate creator economy news. Interests: ${JSON.stringify(data.interests || [])}. Platforms: ${JSON.stringify(data.platforms || [])}. Niche: ${data.niche || "general"}. Compile top stories, platform updates, monetization changes, trend analysis, and action items. Return JSON with keys: topStories, platformUpdates, monetizationChanges, trendAnalysis, actionItems.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiRaidTargetOptimizer(data: { streamData?: any; network?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a raid strategy optimizer. Pick the best channels to raid for mutual growth.${creatorCtx}` }, { role: "user", content: `Optimize raid targets. Stream data: ${JSON.stringify(data.streamData || {})}. Network: ${JSON.stringify(data.network || {})}. Goals: ${JSON.stringify(data.goals || {})}. Identify raid targets, compatibility scores, timing strategy, message templates, and expected benefits. Return JSON with keys: raidTargets, compatibilityScores, timingStrategy, messageTemplates, expectedBenefits.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiStreamHighlightClipper(data: { streamData?: any; chatActivity?: any; viewerPeaks?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a stream highlight detection specialist. Identify best moments for clips.${creatorCtx}` }, { role: "user", content: `Clip stream highlights. Stream data: ${JSON.stringify(data.streamData || {})}. Chat activity: ${JSON.stringify(data.chatActivity || {})}. Viewer peaks: ${JSON.stringify(data.viewerPeaks || {})}. Find highlight moments, clip suggestions, viral potential, editing notes, and platform targets. Return JSON with keys: highlightMoments, clipSuggestions, viralPotential, editingNotes, platformTargets.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDonationGoalStrategist(data: { streamType?: string; audienceSize?: number; goalAmount?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a donation and charity stream strategist. Optimize goals and engagement.${creatorCtx}` }, { role: "user", content: `Strategize donation goals. Stream type: ${data.streamType || "charity"}. Audience size: ${data.audienceSize || 0}. Goal amount: ${data.goalAmount || 0}. Design goal structure, milestone rewards, engagement tactics, promotion plan, and projected total. Return JSON with keys: goalStructure, milestoneRewards, engagementTactics, promotionPlan, projectedTotal.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiStreamChatUnifier(data: { platforms?: string[]; chatRules?: any; moderation?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a multi-platform chat unification specialist. Merge and manage chat across platforms.${creatorCtx}` }, { role: "user", content: `Unify multi-stream chat. Platforms: ${JSON.stringify(data.platforms || [])}. Chat rules: ${JSON.stringify(data.chatRules || {})}. Moderation: ${JSON.stringify(data.moderation || {})}. Create unification strategy, moderation rules, command setup, alert config, and platform priority. Return JSON with keys: unificationStrategy, moderationRules, commandSetup, alertConfig, platformPriority.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBackgroundMusicMatcher(data: { videoMood?: string; contentType?: string; duration?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a music curation specialist for video creators. Suggest royalty-free music matching video mood.${creatorCtx}` }, { role: "user", content: `Match background music. Video mood: ${data.videoMood || "neutral"}. Content type: ${data.contentType || "general"}. Duration: ${data.duration || 0} seconds. Suggest music, mood matching, licensing info, transition points, and volume levels. Return JSON with keys: musicSuggestions, moodMatching, licensingInfo, transitionPoints, volumeLevels.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudioQualityEnhancer(data: { audioIssues?: any; recordingSetup?: any; environment?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an audio quality specialist for creators. Detect and suggest fixes for audio issues.${creatorCtx}` }, { role: "user", content: `Enhance audio quality. Audio issues: ${JSON.stringify(data.audioIssues || {})}. Recording setup: ${JSON.stringify(data.recordingSetup || {})}. Environment: ${data.environment || "unknown"}. Assess quality score, issues detected, fix suggestions, equipment recommendations, and settings guide. Return JSON with keys: qualityScore, issuesDetected, fixSuggestions, equipmentRecommendations, settingsGuide.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSoundEffectRecommender(data: { contentType?: string; editingStyle?: string; moments?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a sound design specialist for video creators. Suggest sound effects for transitions and reactions.${creatorCtx}` }, { role: "user", content: `Recommend sound effects. Content type: ${data.contentType || "general"}. Editing style: ${data.editingStyle || "standard"}. Moments: ${JSON.stringify(data.moments || [])}. Suggest effect suggestions, placement guide, mood enhancement, library recommendations, and timing tips. Return JSON with keys: effectSuggestions, placementGuide, moodEnhancement, libraryRecommendations, timingTips.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAccessibilityChecker(data: { content?: any; platform?: string; standards?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an accessibility specialist for digital content. Ensure content is accessible to all audiences.${creatorCtx}` }, { role: "user", content: `Check accessibility. Content: ${JSON.stringify(data.content || {})}. Platform: ${data.platform || "general"}. Standards: ${JSON.stringify(data.standards || [])}. Evaluate accessibility score, issues, caption quality, color contrast analysis, and recommendations. Return JSON with keys: accessibilityScore, issues, captionQuality, colorContrastAnalysis, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiSignLanguageAdvisor(data: { contentType?: string; audience?: any; budget?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a sign language accessibility advisor. Recommend when and how to add sign language interpretation.${creatorCtx}` }, { role: "user", content: `Advise on sign language. Content type: ${data.contentType || "general"}. Audience: ${JSON.stringify(data.audience || {})}. Budget: ${JSON.stringify(data.budget || {})}. Provide recommendation, implementation guide, cost estimate, partner suggestions, and impact analysis. Return JSON with keys: recommendation, implementationGuide, costEstimate, partnerSuggestions, impactAnalysis.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPrivacyScanner(data: { contentDescription?: string; screenRecording?: any; liveStream?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a privacy protection specialist for creators. Detect accidental personal info exposure.${creatorCtx}` }, { role: "user", content: `Scan for privacy risks. Content description: ${data.contentDescription || "unknown"}. Screen recording: ${JSON.stringify(data.screenRecording || {})}. Live stream: ${JSON.stringify(data.liveStream || {})}. Assess risk level, flagged items, prevention tips, checklist, and automation suggestions. Return JSON with keys: riskLevel, flaggedItems, preventionTips, checklist, automationSuggestions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAccountSecurityAuditor(data: { connectedAccounts?: any[]; securitySettings?: any; platforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an account security specialist for creators. Review connected accounts for vulnerabilities.${creatorCtx}` }, { role: "user", content: `Audit account security. Connected accounts: ${JSON.stringify(data.connectedAccounts || [])}. Security settings: ${JSON.stringify(data.securitySettings || {})}. Platforms: ${JSON.stringify(data.platforms || [])}. Evaluate security score, vulnerabilities, recommendations, two-factor status, and action plan. Return JSON with keys: securityScore, vulnerabilities, recommendations, twoFactorStatus, actionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDataBackupStrategist(data: { contentVolume?: any; platforms?: string[]; currentBackup?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a data backup specialist for creators. Ensure content and business data are safely backed up.${creatorCtx}` }, { role: "user", content: `Strategize data backup. Content volume: ${JSON.stringify(data.contentVolume || {})}. Platforms: ${JSON.stringify(data.platforms || [])}. Current backup: ${JSON.stringify(data.currentBackup || {})}. Create backup plan, storage recommendations, automation setup, recovery plan, and cost estimate. Return JSON with keys: backupPlan, storageRecommendations, automationSetup, recoveryPlan, costEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDigitalCollectibleAdvisor(data: { brand?: any; audience?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a digital collectibles and NFT strategist for creators. Evaluate if collectibles fit your brand.${creatorCtx}` }, { role: "user", content: `Advise on digital collectibles. Brand: ${JSON.stringify(data.brand || {})}. Audience: ${JSON.stringify(data.audience || {})}. Market: ${JSON.stringify(data.market || {})}. Assess feasibility, concept ideas, platform options, pricing strategy, and community impact. Return JSON with keys: feasibility, conceptIdeas, platformOptions, pricingStrategy, communityImpact.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiExclusiveContentPlanner(data: { contentType?: string; memberCount?: number; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an exclusive content strategist. Design behind-the-scenes and bonus content for paying fans.${creatorCtx}` }, { role: "user", content: `Plan exclusive content. Content type: ${data.contentType || "general"}. Member count: ${data.memberCount || 0}. Interests: ${JSON.stringify(data.interests || [])}. Generate content ideas, production plan, exclusivity tiers, release schedule, and retention impact. Return JSON with keys: contentIdeas, productionPlan, exclusivityTiers, releaseSchedule, retentionImpact.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiFanMarketplaceBuilder(data: { offerings?: any; audience?: any; pricing?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a fan experience marketplace designer. Design and price custom fan experiences.${creatorCtx}` }, { role: "user", content: `Build fan marketplace. Offerings: ${JSON.stringify(data.offerings || {})}. Audience: ${JSON.stringify(data.audience || {})}. Pricing: ${JSON.stringify(data.pricing || {})}. Design experience options, pricing tiers, delivery process, marketing strategy, and revenue projection. Return JSON with keys: experienceOptions, pricingTiers, deliveryProcess, marketingStrategy, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiChannelExitStrategy(data: { channelValue?: any; goals?: any; timeline?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a channel exit strategy advisor. Plan for selling, licensing, or transitioning channels.${creatorCtx}` }, { role: "user", content: `Plan exit strategy. Channel value: ${JSON.stringify(data.channelValue || {})}. Goals: ${JSON.stringify(data.goals || {})}. Timeline: ${JSON.stringify(data.timeline || {})}. Estimate valuation, exit options, preparation steps, timeline, and legal considerations. Return JSON with keys: valuationEstimate, exitOptions, preparationSteps, timeline, legalConsiderations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentArchiveOptimizer(data: { backCatalog?: any; performanceData?: any; searchTrends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a content archive optimization specialist. Organize back catalog for maximum long-term search traffic.${creatorCtx}` }, { role: "user", content: `Optimize content archive. Back catalog: ${JSON.stringify(data.backCatalog || {})}. Performance data: ${JSON.stringify(data.performanceData || {})}. Search trends: ${JSON.stringify(data.searchTrends || {})}. Create catalog strategy, playlist structure, metadata updates, inter-linking plan, and projected traffic. Return JSON with keys: catalogStrategy, playlistStructure, metadataUpdates, interLinkingPlan, projectedTraffic.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandLicensingAdvisor(data: { brand?: any; ipAssets?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a brand licensing specialist for creators. Identify opportunities to license your brand and IP.${creatorCtx}` }, { role: "user", content: `Advise on brand licensing. Brand: ${JSON.stringify(data.brand || {})}. IP assets: ${JSON.stringify(data.ipAssets || {})}. Market: ${JSON.stringify(data.market || {})}. Identify licensing opportunities, revenue estimate, partner categories, contract guidelines, and protection strategy. Return JSON with keys: licensingOpportunities, revenueEstimate, partnerCategories, contractGuidelines, protectionStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiInboxPrioritizer(data: { messages?: any[]; categories?: string[]; urgency?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are an inbox management specialist for creators. Sort business messages by opportunity value.${creatorCtx}` }, { role: "user", content: `Prioritize inbox. Messages: ${JSON.stringify(data.messages || [])}. Categories: ${JSON.stringify(data.categories || [])}. Urgency: ${JSON.stringify(data.urgency || {})}. Provide prioritized messages, category breakdown, response templates, delegation suggestions, and time estimate. Return JSON with keys: prioritizedMessages, categoryBreakdown, responseTemplates, delegationSuggestions, timeEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDailyActionPlan(data: { channelGoals?: any; schedule?: any; pendingTasks?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: `You are a daily productivity planner for creators. Generate the perfect daily to-do list.${creatorCtx}` }, { role: "user", content: `Create daily action plan. Channel goals: ${JSON.stringify(data.channelGoals || {})}. Schedule: ${JSON.stringify(data.schedule || {})}. Pending tasks: ${JSON.stringify(data.pendingTasks || [])}. Generate prioritized tasks, time blocks, focus areas, delegate tasks, and day score. Return JSON with keys: prioritizedTasks, timeBlocks, focusAreas, delegateTasks, dayScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}
