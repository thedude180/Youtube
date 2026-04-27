import { sanitizeForPrompt, tokenBudget } from "./lib/ai-attack-shield";
import { getOpenAIClientBackground as getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { autopilotQueue, channels, linkedChannels } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { humanizeText } from "./ai-humanizer-engine";
import { PLATFORM_CONTENT_SPECS } from "@shared/platform-specs";

import { createLogger } from "./lib/logger";

const logger = createLogger("content-variation-engine");
const openai = getOpenAIClient();

let _rateLimitCooldownUntil = 0;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

export interface ChannelLinks {
  youtube?: string;
  twitch?: string;
  kick?: string;
  tiktok?: string;
  x?: string;
  discord?: string;
  website?: string;
  [key: string]: string | undefined;
}

interface VariationOptions {
  videoTitle: string;
  videoDescription: string;
  videoType: string;
  platform: string;
  contentType: "new-video" | "recycle" | "engagement" | "cross-promo" | "go-live" | "post-stream";
  creatorTone: string;
  userId: string;
  existingPosts?: string[];
  keywordContext?: string;
  trafficStrategyContext?: string;
  videoUrl?: string;
  channelLinks?: ChannelLinks;
}

const CREATOR_WEBSITE = "https://etgaming247.com";

function buildChannelUrl(platform: string, channelId: string, channelName: string): string {
  const name = channelName?.trim();
  const id = channelId?.trim();
  if (!name && !id) return "";
  switch (platform) {
    case "youtube": return name ? `https://youtube.com/@${name}` : "";
    case "twitch": return name ? `https://twitch.tv/${name}` : "";
    case "kick": return name ? `https://kick.com/${name}` : "";
    case "tiktok": return name ? `https://tiktok.com/@${name}` : "";
    case "discord": return id?.match(/^https?:\/\//) ? id : id ? `https://discord.gg/${id}` : "";
    default: return "";
  }
}

export async function getUserChannelLinks(userId: string): Promise<ChannelLinks> {
  // Start with the website
  const links: ChannelLinks = { website: CREATOR_WEBSITE };

  // Pull profile URLs explicitly saved by the user in linked_channels
  const manualLinks = await db.select({
    platform: linkedChannels.platform,
    username: linkedChannels.username,
    profileUrl: linkedChannels.profileUrl,
  }).from(linkedChannels).where(eq(linkedChannels.userId, userId));

  for (const lc of manualLinks) {
    if (lc.profileUrl) {
      links[lc.platform] = lc.profileUrl;
    } else if (lc.username) {
      const built = buildChannelUrl(lc.platform, "", lc.username);
      if (built) links[lc.platform] = built;
    }
  }

  // Also pull from connected channels table (OAuth-connected platforms)
  // Only fill in gaps not already set by manual links above
  const userChannels = await db.select({
    platform: channels.platform,
    channelName: channels.channelName,
    channelId: channels.channelId,
    platformData: channels.platformData,
  }).from(channels).where(eq(channels.userId, userId));

  for (const ch of userChannels) {
    if (links[ch.platform]) continue; // already set from manual entry — don't overwrite
    const pd = ch.platformData as any;
    const customUrl = pd?.customUrl || pd?.channelUrl || pd?.profileUrl || pd?.url;
    if (customUrl) {
      links[ch.platform] = customUrl;
    } else {
      const built = buildChannelUrl(ch.platform, ch.channelId, ch.channelName);
      if (built) links[ch.platform] = built;
    }
  }

  return links;
}

function appendCrosslinks(content: string, platform: string, contentType: string, videoUrl?: string, channelLinks?: ChannelLinks): string {
  const links = channelLinks || { website: CREATOR_WEBSITE };
  const hasVideoLink = videoUrl && (contentType === "new-video" || contentType === "recycle" || contentType === "cross-promo" || contentType === "post-stream");

  const otherPlatforms = Object.entries(links)
    .filter(([key, url]) => key !== platform && key !== "website" && url)
    .map(([key, url]) => ({ platform: key, url: url! }));

  if (platform === "youtube") {
    const lines: string[] = [];
    if (links.website) lines.push(`\n\n${links.website}`);
    const platformOrder = ["twitch", "tiktok", "discord", "kick", "rumble"];
    const ordered = platformOrder
      .map(p => otherPlatforms.find(op => op.platform === p))
      .filter(Boolean) as { platform: string; url: string }[];
    const rest = otherPlatforms.filter(op => !platformOrder.includes(op.platform));
    for (const p of [...ordered, ...rest].slice(0, 6)) {
      const label = getPlatformLabel(p.platform);
      lines.push(`\n${label}: ${p.url}`);
    }
    return content + lines.join("");
  }

  if (platform === "tiktok") {
    if (hasVideoLink) {
      return content + `\n\n${videoUrl}`;
    }
    const lines: string[] = [];
    if (links.youtube) lines.push(`\n\nyoutube: ${links.youtube}`);
    return content + lines.join("");
  }

  if (platform === "instagram") {
    if (hasVideoLink) {
      return content + `\n\n${videoUrl}`;
    }
    const lines: string[] = [];
    if (links.youtube) lines.push(`\n\nyoutube: ${links.youtube}`);
    else if (links.website) lines.push(`\n\n${links.website}`);
    return content + lines.join("");
  }

  if (platform === "rumble") {
    const lines: string[] = [];
    if (hasVideoLink) lines.push(`\n\n${videoUrl}`);
    if (links.youtube) lines.push(`\nYouTube: ${links.youtube}`);
    if (links.discord) lines.push(`\nDiscord: ${links.discord}`);
    if (links.website) lines.push(`\n${links.website}`);
    return content + lines.join("");
  }

  if (platform === "discord") {
    const lines: string[] = [];
    if (hasVideoLink) {
      lines.push(`\n\n${videoUrl}`);
    }
    const discordPriority = ["youtube", "twitch", "kick", "tiktok"];
    const prioritized = discordPriority
      .map(p => otherPlatforms.find(op => op.platform === p))
      .filter(Boolean) as { platform: string; url: string }[];
    const extras = otherPlatforms.filter(op => !discordPriority.includes(op.platform));
    for (const p of [...prioritized, ...extras].slice(0, 4)) {
      const label = getPlatformLabel(p.platform);
      lines.push(`\n${label}: ${p.url}`);
    }
    if (links.website && !lines.some(l => l.includes(links.website!))) {
      lines.push(`\n${links.website}`);
    }
    return content + lines.join("");
  }

  if (hasVideoLink) {
    const lines = [`\n\n${videoUrl}`];
    const extras = otherPlatforms.filter(op => op.platform !== "website").slice(0, 2);
    for (const p of extras) {
      lines.push(`\n${getPlatformLabel(p.platform)}: ${p.url}`);
    }
    return content + lines.join("");
  }

  const lines: string[] = [];
  if (links.youtube) lines.push(`\nYouTube: ${links.youtube}`);
  const remaining = otherPlatforms.filter(op => op.platform !== "youtube").slice(0, 2);
  for (const p of remaining) {
    lines.push(`\n${getPlatformLabel(p.platform)}: ${p.url}`);
  }
  if (links.website) lines.push(`\n${links.website}`);
  return content + (lines.length > 0 ? "\n" + lines.join("") : "");
}

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    youtube: "YouTube",
    twitch: "Twitch",
    kick: "Kick",
    tiktok: "TikTok",
    x: "X",
    discord: "Discord",
    rumble: "Rumble",
    instagram: "Instagram",
  };
  return labels[platform] || platform;
}

const PLATFORM_VOICE: Record<string, string> = {
  tiktok: `PLATFORM: TikTok
- Ultra-casual, trending energy
- Short and punchy (under 150 chars ideal)
- Use viral hooks: "POV:", "This is why...", "No way this actually..."
- 2-3 hashtags MAX, mix trending + niche
- Never sound like you're promoting, sound like you're sharing something cool
- Use lowercase aesthetic when it fits
- Reference TikTok culture naturally
- CROSS-PLATFORM FUNNEL (critical): Every post must bridge to YouTube. Use natural language like "full vid on youtube", "linked below if you want the full thing", or just the YouTube channel name. The goal is TikTok viewer → YouTube subscriber. Never post a clip without directing people to YouTube.`,

  discord: `PLATFORM: Discord
- Talking to your community, your inner circle
- Warm, insider-vibe, like a group chat with people who actually care
- Can be slightly longer (2-4 sentences)
- No hashtags
- Reference the community ("y'all", "you guys", "the squad")
- Share behind-the-scenes energy — Discord members get info first
- Make people feel special for being in the server
- CROSS-PLATFORM FUNNEL: Discord is where subscribers become super fans. Always link the YouTube video AND mention where else they can find you (Twitch stream nights, TikTok for clips). Discord members should feel like they're the most connected to you across all platforms.`,

  twitch: `PLATFORM: Twitch
- Stream-culture language
- Reference clips, highlights, funny moments from streams
- Hype energy, community-focused
- Use Twitch-native phrases naturally
- Keep it about the experience, not just the content
- 1-2 sentences max for announcements
- CROSS-PLATFORM FUNNEL: Twitch viewers should know about YouTube VODs and TikTok clips. During announcements, reference YouTube ("the full VOD is going up on YouTube") and Discord ("join Discord to see when we go live next").`,

  kick: `PLATFORM: Kick
- Similar to Twitch but edgier, more raw
- Unfiltered energy, community-first language
- Reference Kick culture specifically
- Keep announcements brief and punchy
- CROSS-PLATFORM FUNNEL: Drive Kick viewers to YouTube for VODs, Discord for community, TikTok for clips. Kick is part of the live streaming layer — bridge it to the broader ecosystem.`,

  youtube: `PLATFORM: YouTube
- Can be more descriptive and thoughtful
- SEO-aware but natural sounding
- Community tab post style — feels like a personal update
- Ask questions to drive comments and engagement
- Reference the video or upcoming content naturally
- Can be 2-5 sentences
- CROSS-PLATFORM FUNNEL: YouTube Community posts should push fans toward Discord (for exclusive stuff) and mention when you stream on Twitch/Kick. The Community tab is a retention tool — use it to bridge between uploads and funnel fans into the deeper ecosystem.`,

  rumble: `PLATFORM: Rumble
- Straightforward, authentic tone
- This audience values original content and creator independence
- Keep it clean and direct — no platform-specific slang
- Mirror the YouTube description tone but slightly more casual
- CROSS-PLATFORM FUNNEL: Rumble viewers may not know your other platforms. Always mention YouTube as the main hub and Discord for community.`,

  instagram: `PLATFORM: Instagram
- Visual-first, aspirational but authentic
- Caption starts with a strong first line (visible before "more")
- 5-10 relevant hashtags in first comment or end of caption
- Aesthetic and polished but still personal
- Save-worthy content performs best
- CROSS-PLATFORM FUNNEL: Instagram drives to YouTube via "link in bio" or YouTube channel name in caption. Every Reel caption should naturally mention the full video on YouTube.`,
};

const BANNED_AI_PHRASES = [
  "don't miss", "link in bio", "smash that like",
  "hit subscribe", "ring the bell", "in this video",
  "today we're going to", "without further ado", "let's dive in",
  "in today's", "it's worth noting", "furthermore", "leverage",
  "utilize", "in order to", "at the end of the day", "game-changer",
  "groundbreaking", "revolutionize", "seamlessly", "delve",
  "elevate your", "unlock the", "comprehensive guide",
  "in conclusion", "moving forward", "on another note",
  "that being said", "having said that", "needless to say",
  "it goes without saying", "last but not least", "first and foremost",
  "navigate the", "landscape", "paradigm", "synergy", "optimize",
  "streamline", "robust", "cutting-edge", "state-of-the-art",
  "take it to the next level", "deep dive", "unpack",
  "journey", "embark", "explore the world of", "realm of",
  "shed light on", "at its core", "when it comes to",
  "the fact of the matter", "it is important to note",
  "without a doubt", "rest assured", "each and every",
  "prior to", "in terms of", "with regards to", "in light of",
  "plays a crucial role", "is a testament to", "continues to",
  "has become increasingly", "offers a unique", "ensures a seamless",
  "provides a comprehensive", "delivers a", "marks a significant",
];

const NATURAL_IMPERFECTIONS = [
  { type: "casual-caps", apply: (text: string) => text.charAt(0).toLowerCase() + text.slice(1) },
  { type: "ellipsis", apply: (text: string) => text.replace(/\.\s/, "... ") },
  { type: "double-space", apply: (text: string) => { const words = text.split(" "); const idx = Math.floor(Math.random() * (words.length - 2)) + 1; words[idx] = words[idx] + " "; return words.join(" "); }},
  { type: "informal-ending", apply: (text: string) => text.replace(/\.$/, "") },
  { type: "add-lol", apply: (text: string) => text + " lol" },
  { type: "add-ngl", apply: (text: string) => "ngl " + text.charAt(0).toLowerCase() + text.slice(1) },
];

export async function generateUniqueContent(options: VariationOptions): Promise<{
  content: string;
  uniquenessScore: number;
  stealthScore: number;
  fingerprint: string;
}> {
  const { videoTitle, videoDescription, videoType, platform, contentType, creatorTone, userId, keywordContext, trafficStrategyContext, videoUrl, channelLinks } = options;

  const recentPosts = await getRecentPostsForPlatform(userId, platform, 20);
  const recentTexts = recentPosts.map(p => p.content);

  const platformVoice = PLATFORM_VOICE[platform] || PLATFORM_VOICE.x;

  const anglePool = [
    "reaction-to-own-content", "behind-the-scenes", "highlight-moment",
    "personal-opinion", "audience-question", "comparison",
    "hot-take", "storytelling", "casual-share", "hype-moment",
    "underrated-take", "nostalgia-angle", "challenge-reference",
    "community-callout", "self-deprecating-humor",
  ];
  const angle = anglePool[Math.floor(Math.random() * anglePool.length)];

  const retentionContext = await getRetentionBeatsPromptContext();

  const systemMsg = `You are the world's best social media ghostwriter — you've written viral posts for creators with 10M+ followers across every platform. You combine:

🎭 MASTER IMPERSONATOR: You become the creator. Every post sounds like THEM, not a marketer. You capture their unique voice, slang, rhythm, and energy so perfectly that even their best friends can't tell it's AI.

📊 VIRAL CONTENT ENGINEER: You understand why certain posts get 10M impressions while others get 10. You engineer shareability, emotional resonance, and platform-specific algorithmic triggers into every word.

🧠 SOCIAL PSYCHOLOGY EXPERT: You know exactly which emotional hooks make people stop scrolling, engage, and share. You weaponize curiosity gaps, relatability, and FOMO without it ever feeling forced.

You ARE the creator typing from their phone. First person ONLY.

${creatorTone}

${platformVoice}

CONTENT ANGLE FOR THIS POST: ${angle}
${retentionContext ? `\nAPPLY RETENTION SCIENCE TO THIS POST:
- Use hook_open beats: First line must stop the scroll
- Build curiosity — make people need to click/watch
- For video announcements: tease the best moment without spoiling it
- Structure your post like a mini retention curve: hook → tension → payoff` : ""}

CRITICAL ANTI-DETECTION RULES:
- You ARE the creator. First person only. Never third person.
- NO corporate marketing language (no "check out our latest", "don't miss this opportunity")
- Casual viewer-directing is fine ("linked it below", "go watch", "it's right there") — sound like a friend sharing, not a brand promoting
- Vary your sentence structure from post to post
- Mix capitalization naturally (don't be perfectly consistent)
- Use contractions always (don't, can't, won't, it's)
- Occasional incomplete sentences are fine
- Reference the content indirectly sometimes, not always by exact title
- Sound like you just typed this in 10 seconds without thinking too hard
- NEVER use any of these phrases: ${BANNED_AI_PHRASES.slice(0, 10).join(", ")}

VIDEO LINK STRATEGY:${videoUrl ? `
- The video link is: ${videoUrl}
- DO NOT put the URL in the post body — it will be appended automatically after your text.
- Instead, structure your post to BUILD CURIOSITY so people WANT to click the link below.
- Use one of these natural approaches (pick one, vary across posts):
  • Tease the best moment: "the ending of this one is insane" / "wait for the last 30 seconds"
  • Share a reaction: "I still can't believe this actually happened" / "this might be my best one yet"
  • Ask a question the video answers: "how many of you would've survived this?" / "bet you can't guess what happens next"
  • Drop a bold claim: "this is why I switched to..." / "proof that [topic] actually works"
  • Create FOMO: "everyone's been asking about this" / "finally dropped this"
- The post should make people NEED to watch — the link appears right after your words` : `
- No specific video link available — write a general post about this content
- Direct people to find it on YouTube or the relevant platform naturally`}

${recentTexts.length > 0 ? `\nIMPORTANT - Your recent posts on ${sanitizeForPrompt(platform)} (DO NOT repeat similar wording or structure):\n${recentTexts.slice(0, 5).map((t, i) => `${i + 1}. "${t}"`).join("\n")}` : ""}${keywordContext ? `\n\n${keywordContext}` : ""}${trafficStrategyContext ? `\n\n${trafficStrategyContext}` : ""}`;

  const prompt = buildPromptForType(contentType, videoTitle, videoDescription, videoType, platform, angle);

  const content = await generateWithAI(prompt, systemMsg);
  if (!content) {
    return { content: "", uniquenessScore: 0, stealthScore: 0, fingerprint: "" };
  }

  let processed = content;

  for (const phrase of BANNED_AI_PHRASES) {
    const regex = new RegExp(phrase, "gi");
    if (regex.test(processed)) {
      processed = processed.replace(regex, "").replace(/\s+/g, " ").trim();
    }
  }

  if (Math.random() < 0.25) {
    const imperfection = NATURAL_IMPERFECTIONS[Math.floor(Math.random() * NATURAL_IMPERFECTIONS.length)];
    processed = imperfection.apply(processed);
  }

  processed = processed.replace(/^["']|["']$/g, "").trim();

  if (videoUrl) {
    processed = processed.replace(/https?:\/\/(?:youtu\.be|(?:www\.)?youtube\.com)\S*/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  processed = appendCrosslinks(processed, platform, contentType, videoUrl, channelLinks);

  const humanized = humanizeText(processed, {
    aggressionLevel: "moderate",
    platform,
    preserveLinks: true,
    preserveHashtags: true,
    contentType: "social-post",
  });
  processed = humanized.humanized;

  const uniquenessScore = calculateUniqueness(processed, recentTexts);
  const stealthScore = calculateStealthScore(processed, platform);
  const fingerprint = generateFingerprint(processed);

  return { content: processed, uniquenessScore, stealthScore, fingerprint };
}

function buildPromptForType(
  contentType: string,
  title: string,
  description: string,
  videoType: string,
  platform: string,
  angle: string,
): string {
  const safeDescription = sanitizeForPrompt(description);
  switch (contentType) {
    case "new-video":
      return `You just uploaded a new ${videoType} to YouTube called "${sanitizeForPrompt(title)}".
${safeDescription ? `It's about: ${safeDescription}` : ""}
Write a ${sanitizeForPrompt(platform)} post about it using the "${sanitizeForPrompt(angle)}" angle.
Sound like you literally just finished editing and are excited/relieved/proud.
Your goal: make people curious enough to click the video link that will appear right below your post.
Tease, hint, or react — but don't summarize the whole video. Leave something for them to discover.
Output ONLY the post text. No quotes around it. Do NOT include any URL.`;

    case "recycle":
      return `You have an older video called "${sanitizeForPrompt(title)}" that you want more people to see.
${safeDescription ? `It covers: ${safeDescription}` : ""}
Write a ${sanitizeForPrompt(platform)} post that makes this feel relevant RIGHT NOW using the "${sanitizeForPrompt(angle)}" angle.
Do NOT mention it's an old video. Frame it as if you're just thinking about this topic.
Your goal: spark curiosity so people click the video link that will appear right below your post.
Output ONLY the post text. No quotes around it. Do NOT include any URL.`;

    case "cross-promo":
      return `Your content "${sanitizeForPrompt(title)}" is doing well and you want to drive more engagement.
Write a ${sanitizeForPrompt(platform)} post that references this content from the "${sanitizeForPrompt(angle)}" angle.
Don't be salesy. Sound like you're genuinely continuing a conversation about this topic.
Your goal: make people want to watch the video — the link will appear right below your post.
Output ONLY the post text. No quotes around it. Do NOT include any URL.`;

    case "engagement":
      return `Write a ${sanitizeForPrompt(platform)} post related to the topic of "${sanitizeForPrompt(title)}" that drives engagement.
Use the "${sanitizeForPrompt(angle)}" approach. Ask a question, share an opinion, or start a discussion.
This should feel like an organic thought, not a content strategy post.
Output ONLY the post text. No quotes around it.`;

    case "go-live":
      return `You are ABOUT TO GO LIVE streaming "${sanitizeForPrompt(title)}" right now.
${safeDescription ? `The stream is about: ${safeDescription}` : ""}
Write a ${sanitizeForPrompt(platform)} post announcing you're going live using the "${sanitizeForPrompt(angle)}" angle.
Sound hyped but natural - like you literally just hit "go live" and are telling people.
Include urgency ("live rn", "get in here", "happening now") but keep it YOUR voice.
Output ONLY the post text. No quotes around it.`;

    case "post-stream":
      return `You just FINISHED a live stream called "${sanitizeForPrompt(title)}".
${safeDescription ? `The stream covered: ${safeDescription}` : ""}
Write a ${sanitizeForPrompt(platform)} post about highlights or moments from the stream using the "${sanitizeForPrompt(angle)}" angle.
Sound like you're decompressing after streaming - tired but satisfied energy.
Reference specific-sounding moments even if vague ("that clutch play", "the ending though").
Your goal: make people who missed the stream want to watch the VOD — the link will appear below.
Output ONLY the post text. No quotes around it. Do NOT include any URL.`;

    default:
      return `Write a natural ${sanitizeForPrompt(platform)} post about "${sanitizeForPrompt(title)}". Output ONLY the post text.`;
  }
}

async function generateWithAI(prompt: string, systemMsg: string): Promise<string> {
  const now = Date.now();
  if (now < _rateLimitCooldownUntil) {
    logger.debug("[ContentVariation] Rate-limit cooldown active — skipping AI generation");
    return "";
  }
  if (!tokenBudget.checkBudget("content-variation", 1500)) {
    logger.debug("[ContentVariation] Token budget exhausted — skipping AI generation");
    return "";
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 1500,
    });
    const tokensUsed = response.usage?.total_tokens ?? 1500;
    tokenBudget.consumeBudget("content-variation", tokensUsed);
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    if (status === 429) {
      _rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      logger.warn("[ContentVariation] 429 rate limit — pausing for 10 minutes");
    } else {
      logger.error("[ContentVariation] AI generation error:", err);
    }
    return "";
  }
}

async function getRecentPostsForPlatform(userId: string, platform: string, limit: number) {
  return db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, platform),
    ))
    .orderBy(desc(autopilotQueue.createdAt))
    .limit(limit);
}

function calculateUniqueness(newText: string, existingTexts: string[]): number {
  if (existingTexts.length === 0) return 1.0;

  const newWords = new Set(newText.toLowerCase().split(/\s+/));
  let maxOverlap = 0;

  for (const existing of existingTexts) {
    const existingWords = new Set(existing.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const word of Array.from(newWords)) {
      if (existingWords.has(word) && word.length > 3) overlap++;
    }
    const overlapRatio = overlap / Math.max(newWords.size, 1);
    maxOverlap = Math.max(maxOverlap, overlapRatio);
  }

  return Math.max(0, 1 - maxOverlap);
}

function calculateStealthScore(text: string, platform: string): number {
  let score = 1.0;
  const lower = text.toLowerCase();

  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      score -= 0.15;
    }
  }

  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 0) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
    if (variance < 2 && sentences.length > 2) score -= 0.1;
  }

  if (/[A-Z]{2,}/.test(text) && Math.random() > 0.5) {
    // occasional caps is fine
  }

  const words = text.split(/\s+/);
  if (platform === "tiktok" && words.length > 40) score -= 0.1;
  const hashtags = (text.match(/#\w+/g) || []).length;
  if (hashtags > 5) score -= 0.15;
  if (platform === "discord" && hashtags > 0) score -= 0.1;

  if (/^[A-Z]/.test(text) && !/[.!?]$/.test(text.trim())) {
    // no ending punctuation is natural
  } else if (/\.$/.test(text.trim()) && sentences.length === 1) {
    // single sentence with period is slightly formal
    score -= 0.02;
  }

  return Math.max(0, Math.min(1, score));
}

function generateFingerprint(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).sort();
  const sample = words.filter((_, i) => i % 3 === 0).join("");
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function checkContentSafety(content: string, userId: string, platform: string): Promise<{
  safe: boolean;
  issues: string[];
  overallGrade: "A" | "B" | "C" | "D" | "F";
}> {
  const issues: string[] = [];
  const lower = content.toLowerCase();

  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      issues.push(`Contains detectable phrase: "${sanitizeForPrompt(phrase)}"`);
    }
  }

  const recentPosts = await getRecentPostsForPlatform(userId, platform, 10);
  for (const post of recentPosts) {
    const similarity = 1 - calculateUniqueness(content, [post.content]);
    if (similarity > 0.6) {
      issues.push(`Too similar to recent post (${Math.round(similarity * 100)}% overlap)`);
    }
  }

  const platformSpec = PLATFORM_CONTENT_SPECS[platform as keyof typeof PLATFORM_CONTENT_SPECS];
  const charLimit = platformSpec?.limits.postMaxLength || platformSpec?.limits.titleMaxLength;
  if (charLimit && content.length > charLimit) {
    issues.push(`Exceeds ${platformSpec?.label || platform} character limit (${charLimit} chars)`);
  }

  const hashtags = (content.match(/#\w+/g) || []).length;
  const maxHashtags = platformSpec?.limits.maxHashtags || 5;
  if (hashtags > maxHashtags) issues.push(`Too many hashtags for ${platformSpec?.label || platform} (max ${maxHashtags})`);
  if (platform === "discord" && hashtags > 0) issues.push("Hashtags on Discord look automated");

  if (/https?:\/\/\S+/g.test(content)) {
    const links = content.match(/https?:\/\/\S+/g) || [];
    if (links.length > 2) issues.push("Too many links (looks promotional)");
  }

  let grade: "A" | "B" | "C" | "D" | "F";
  if (issues.length === 0) grade = "A";
  else if (issues.length === 1) grade = "B";
  else if (issues.length === 2) grade = "C";
  else if (issues.length <= 4) grade = "D";
  else grade = "F";

  return {
    safe: issues.length <= 1,
    issues,
    overallGrade: grade,
  };
}

export async function getStealthReport(userId: string): Promise<{
  overallScore: number;
  platformGrades: Record<string, { grade: string; score: number; postCount: number }>;
  recentIssues: string[];
  recommendations: string[];
}> {
  const platforms = ["youtube", "tiktok", "discord"];
  const platformGrades: Record<string, { grade: string; score: number; postCount: number }> = {};
  const allIssues: string[] = [];

  for (const platform of platforms) {
    const posts = await getRecentPostsForPlatform(userId, platform, 20);
    if (posts.length === 0) {
      platformGrades[platform] = { grade: "-", score: 1.0, postCount: 0 };
      continue;
    }

    let totalScore = 0;
    for (const post of posts) {
      const score = calculateStealthScore(post.content, platform);
      totalScore += score;
      if (score < 0.7) {
        allIssues.push(`[${sanitizeForPrompt(platform)}] Low stealth score on: "${post.content.substring(0, 50)}..."`);
      }
    }

    const avgScore = totalScore / posts.length;
    let grade: string;
    if (avgScore >= 0.9) grade = "A";
    else if (avgScore >= 0.8) grade = "B";
    else if (avgScore >= 0.7) grade = "C";
    else if (avgScore >= 0.5) grade = "D";
    else grade = "F";

    const uniqueContents = posts.map(p => p.content);
    let pairwiseUniqueness = 1.0;
    for (let i = 0; i < uniqueContents.length; i++) {
      for (let j = i + 1; j < Math.min(i + 5, uniqueContents.length); j++) {
        const u = calculateUniqueness(uniqueContents[i], [uniqueContents[j]]);
        pairwiseUniqueness = Math.min(pairwiseUniqueness, u);
      }
    }
    if (pairwiseUniqueness < 0.5) {
      allIssues.push(`[${sanitizeForPrompt(platform)}] Posts are too similar to each other`);
      grade = String.fromCharCode(Math.min(grade.charCodeAt(0) + 1, 70));
    }

    platformGrades[platform] = { grade, score: avgScore, postCount: posts.length };
  }

  const scores = Object.values(platformGrades).filter(p => p.postCount > 0).map(p => p.score);
  const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1.0;

  const recommendations: string[] = [];
  if (overallScore < 0.8) recommendations.push("Increase content variation between posts");
  if (allIssues.some(i => i.includes("similar"))) recommendations.push("Use more diverse content angles");
  if (allIssues.some(i => i.includes("hashtags"))) recommendations.push("Reduce hashtag usage on some platforms");

  return {
    overallScore,
    platformGrades,
    recentIssues: allIssues.slice(0, 10),
    recommendations,
  };
}
