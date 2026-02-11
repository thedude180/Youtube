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
