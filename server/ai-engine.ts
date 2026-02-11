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
