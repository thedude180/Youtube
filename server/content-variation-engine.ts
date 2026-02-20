import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";

const openai = getOpenAIClient();

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
}

const CREATOR_WEBSITE = "https://etgaming247.com";

const CROSSLINK_LINES: Record<string, string[]> = {
  youtube: [
    `\n\n${CREATOR_WEBSITE}`,
    `\nCatch the live streams on Twitch & Kick`,
    `\nClips & highlights on TikTok`,
    `\nUpdates & hot takes on X`,
    `\nJoin the community on Discord`,
  ],
  twitch: [
    `\n${CREATOR_WEBSITE}`,
    `\nFull videos & guides on YouTube`,
    `\nClips dropping on TikTok`,
    `\nJoin the Discord`,
  ],
  kick: [
    `\n${CREATOR_WEBSITE}`,
    `\nAlso live on Twitch`,
    `\nFull content on YouTube`,
    `\nJoin the Discord`,
  ],
  tiktok: [
    `\n${CREATOR_WEBSITE}`,
    `\nFull vid on YT`,
    `\nLive on Twitch & Kick`,
  ],
  x: [
    `\n${CREATOR_WEBSITE}`,
    `\nFull content on YouTube`,
    `\nLive streams on Twitch/Kick`,
  ],
  discord: [
    `\n${CREATOR_WEBSITE}`,
    `\nNew vid on YouTube`,
    `\nStreaming on Twitch & Kick`,
    `\nClips on TikTok`,
  ],
};

function appendCrosslinks(content: string, platform: string, contentType: string): string {
  const links = CROSSLINK_LINES[platform] || CROSSLINK_LINES.youtube;

  if (platform === "tiktok" || platform === "x") {
    const short = [links[0]];
    if (contentType === "go-live" || contentType === "new-video") {
      short.push(links[Math.floor(Math.random() * (links.length - 1)) + 1]);
    }
    return content + short.join("");
  }

  if (platform === "discord") {
    const pick = [links[0]];
    if (contentType === "new-video") pick.push(links[1]);
    if (contentType === "go-live") pick.push(links[2]);
    return content + pick.join("");
  }

  if (platform === "youtube") {
    return content + links.join("");
  }

  const pick = links.slice(0, Math.min(links.length, 3));
  return content + pick.join("");
}

const PLATFORM_VOICE: Record<string, string> = {
  tiktok: `PLATFORM: TikTok
- Ultra-casual, trending energy
- Short and punchy (under 150 chars ideal)
- Use viral hooks: "POV:", "This is why...", "No way this actually..."
- 2-3 hashtags MAX, mix trending + niche
- Never sound like you're promoting, sound like you're sharing something cool
- Use lowercase aesthetic when it fits
- Reference TikTok culture naturally`,

  x: `PLATFORM: X (Twitter)
- Conversational, opinion-driven
- Under 280 chars, make every word count
- Use rhetorical questions, hot takes, or observations
- 1-2 hashtags max, or none
- Thread hooks work great for gaming content
- React to your own content like you're a viewer
- Sound like you're tweeting from your couch
- STREAM ANNOUNCEMENTS: Hype up upcoming/active livestreams with urgency ("LIVE NOW", "Going live in 10")
- TRAFFIC DRIVING: Resurface older videos with fresh angles ("Still one of my best clips", "This aged well", "Y'all slept on this one")
- Mix new content posts with throwback/catalog posts to keep all content active
- Use quote tweets and reply threads to link older videos naturally`,

  discord: `PLATFORM: Discord
- Talking to your community, your people
- Warm, insider-vibe, like a group chat
- Can be slightly longer (2-4 sentences)
- No hashtags
- Reference the community ("y'all", "you guys", "the crew")
- Share behind-the-scenes energy
- Make people feel special for being in the server`,

  twitch: `PLATFORM: Twitch
- Stream-culture language
- Reference clips, highlights, funny moments
- Hype energy, community-focused
- Use Twitch-native phrases naturally
- Keep it about the experience, not just the content
- 1-2 sentences max for announcements`,

  kick: `PLATFORM: Kick
- Similar to Twitch but edgier
- More raw, unfiltered energy
- Community-first language
- Reference Kick culture specifically
- Keep announcements brief and punchy`,

  youtube: `PLATFORM: YouTube
- Can be more descriptive
- SEO-aware but natural
- Community tab post style
- Ask questions to drive engagement
- Reference the video naturally
- Can be 2-5 sentences`,
};

const BANNED_AI_PHRASES = [
  "check out", "don't miss", "link in bio", "smash that like",
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
  const { videoTitle, videoDescription, videoType, platform, contentType, creatorTone, userId, keywordContext, trafficStrategyContext } = options;

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

  const retentionContext = await getRetentionBeatsPromptContext(userId);

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
- NO marketing language whatsoever
- NO call-to-action phrasing (no "check out", "go watch", "link in bio")
- Vary your sentence structure from post to post
- Mix capitalization naturally (don't be perfectly consistent)
- Use contractions always (don't, can't, won't, it's)
- Occasional incomplete sentences are fine
- Reference the content indirectly sometimes, not always by exact title
- Sound like you just typed this in 10 seconds without thinking too hard
- NEVER use any of these phrases: ${BANNED_AI_PHRASES.slice(0, 10).join(", ")}

${recentTexts.length > 0 ? `\nIMPORTANT - Your recent posts on ${platform} (DO NOT repeat similar wording or structure):\n${recentTexts.slice(0, 5).map((t, i) => `${i + 1}. "${t}"`).join("\n")}` : ""}${keywordContext ? `\n\n${keywordContext}` : ""}${trafficStrategyContext ? `\n\n${trafficStrategyContext}` : ""}`;

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

  processed = appendCrosslinks(processed, platform, contentType);

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
  switch (contentType) {
    case "new-video":
      return `You just uploaded a new ${videoType} to YouTube called "${title}".
${description ? `It's about: ${description}` : ""}
Write a ${platform} post about it using the "${angle}" angle.
Sound like you literally just finished editing and are excited/relieved/proud.
Output ONLY the post text. No quotes around it.`;

    case "recycle":
      return `You have an older video called "${title}" that you want more people to see.
${description ? `It covers: ${description}` : ""}
Write a ${platform} post that makes this feel relevant RIGHT NOW using the "${angle}" angle.
Do NOT mention it's an old video. Frame it as if you're just thinking about this topic.
Output ONLY the post text. No quotes around it.`;

    case "cross-promo":
      return `Your content "${title}" is doing well and you want to drive more engagement.
Write a ${platform} post that references this content from the "${angle}" angle.
Don't be salesy. Sound like you're genuinely continuing a conversation about this topic.
Output ONLY the post text. No quotes around it.`;

    case "engagement":
      return `Write a ${platform} post related to the topic of "${title}" that drives engagement.
Use the "${angle}" approach. Ask a question, share an opinion, or start a discussion.
This should feel like an organic thought, not a content strategy post.
Output ONLY the post text. No quotes around it.`;

    case "go-live":
      return `You are ABOUT TO GO LIVE streaming "${title}" right now.
${description ? `The stream is about: ${description}` : ""}
Write a ${platform} post announcing you're going live using the "${angle}" angle.
Sound hyped but natural - like you literally just hit "go live" and are telling people.
Include urgency ("live rn", "get in here", "happening now") but keep it YOUR voice.
Output ONLY the post text. No quotes around it.`;

    case "post-stream":
      return `You just FINISHED a live stream called "${title}".
${description ? `The stream covered: ${description}` : ""}
Write a ${platform} post about highlights or moments from the stream using the "${angle}" angle.
Sound like you're decompressing after streaming - tired but satisfied energy.
Reference specific-sounding moments even if vague ("that clutch play", "the ending though").
Output ONLY the post text. No quotes around it.`;

    default:
      return `Write a natural ${platform} post about "${title}". Output ONLY the post text.`;
  }
}

async function generateWithAI(prompt: string, systemMsg: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 400,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("[ContentVariation] AI generation error:", err);
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
  if (platform === "x" && text.length > 280) score -= 0.2;

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
      issues.push(`Contains detectable phrase: "${phrase}"`);
    }
  }

  const recentPosts = await getRecentPostsForPlatform(userId, platform, 10);
  for (const post of recentPosts) {
    const similarity = 1 - calculateUniqueness(content, [post.content]);
    if (similarity > 0.6) {
      issues.push(`Too similar to recent post (${Math.round(similarity * 100)}% overlap)`);
    }
  }

  if (platform === "x" && content.length > 280) {
    issues.push("Exceeds X character limit");
  }

  const hashtags = (content.match(/#\w+/g) || []).length;
  if (hashtags > 5) issues.push("Too many hashtags (looks spammy)");
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
  const platforms = ["youtube", "tiktok", "x", "discord", "twitch", "kick"];
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
        allIssues.push(`[${platform}] Low stealth score on: "${post.content.substring(0, 50)}..."`);
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
      allIssues.push(`[${platform}] Posts are too similar to each other`);
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
