/**
 * Cross-Promotion Engine
 *
 * Generates platform-optimized post copy for every connected social channel,
 * with each post referencing other platforms to drive cross-channel growth.
 *
 * Strategy:
 * - YouTube:     full description with all platform links in the description
 * - YouTube Short: punchy hook + "full video on main channel" + social links
 * - TikTok:      viral hook + "YouTube link in bio" + hashtag block
 * - Discord:     community-first announcement with all links
 * - Twitter:     short punchy tweet + link + 2-3 hashtags
 * - Instagram:   visual caption + "link in bio" + hashtag block
 * - Reddit:      genuine community post with YouTube link (no hard sell)
 * - Facebook:    conversational post + link + tags
 * - Twitch/Kick: clip highlight post (stream-only platforms)
 */
import { channelRepo } from "../channels/repository.js";
import { aiRouteJSON, aiRoute } from "../../ai/router.js";
import { createLogger } from "../../core/logger.js";
import { z } from "zod";
import type { SocialPlatform } from "../../../shared/schema/index.js";

const log = createLogger("cross-promo");

export interface ContentContext {
  title: string;
  game: string;
  type: "livestream_clip" | "youtube_short" | "full_video" | "going_live";
  youtubeUrl?: string;
  tiktokHandle?: string;
  discordInvite?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  subreddit?: string;
  channelName?: string;
  streamStartTime?: string;
  clipDuration?: number;
}

export interface PlatformPost {
  platform: SocialPlatform;
  content: string;
  hashtagBlock: string;
  crossPromoLinks: string;
}

/** Build the cross-promo link footer for a given platform showing all OTHER active platforms. */
export function buildCrossPromoLinks(
  targetPlatform: SocialPlatform,
  connectedPlatforms: SocialPlatform[],
  ctx: ContentContext,
): string {
  const links: string[] = [];

  const add = (platform: SocialPlatform, label: string, url?: string) => {
    if (platform !== targetPlatform && connectedPlatforms.includes(platform) && url) {
      links.push(`▸ ${label}: ${url}`);
    }
  };

  add("youtube", "YouTube", ctx.youtubeUrl ?? `https://youtube.com/@${ctx.channelName ?? "etgaming247"}`);
  add("tiktok", "TikTok", ctx.tiktokHandle ? `https://tiktok.com/@${ctx.tiktokHandle}` : undefined);
  add("discord", "Discord Community", ctx.discordInvite);
  add("instagram", "Instagram", ctx.instagramHandle ? `https://instagram.com/${ctx.instagramHandle}` : undefined);
  add("twitter", "Twitter", ctx.twitterHandle ? `https://twitter.com/${ctx.twitterHandle}` : undefined);

  return links.join("\n");
}

/** Generate platform-specific hashtag blocks. */
function buildHashtags(platform: SocialPlatform, game: string, type: ContentContext["type"]): string {
  const base = [`#${game.replace(/\s+/g, "")}`, "#PS5", "#Gaming", "#NoCommentary"];

  if (platform === "youtube" && type.includes("short")) base.push("#Shorts", "#YouTubeShorts");
  if (platform === "tiktok") base.push("#GamingTikTok", "#PS5Gaming", "#FYP", "#GameClips");
  if (platform === "instagram") base.push("#Reels", "#GamingReels", "#PS5Clips", "#GameHighlights");
  if (platform === "twitter") return base.slice(0, 3).join(" "); // Twitter: fewer hashtags

  return base.join(" ");
}

/**
 * Generate AI-written post copy for every connected platform in one batch call.
 */
export async function generateAllPlatformPosts(
  userId: string,
  ctx: ContentContext,
): Promise<PlatformPost[]> {
  const channels = await channelRepo.findByUserId(userId);
  const connected = channels
    .filter((c) => c.isActive)
    .map((c) => c.platform as SocialPlatform);

  // Map channel platform names to social platforms (youtube_shorts is virtual)
  const targets: SocialPlatform[] = [];
  if (connected.includes("youtube")) {
    targets.push("youtube");
    if (ctx.type !== "going_live") targets.push("youtube_shorts");
  }
  if (connected.includes("tiktok")) targets.push("tiktok");
  if (connected.includes("discord")) targets.push("discord");
  if (connected.includes("twitter")) targets.push("twitter");
  if (connected.includes("instagram")) targets.push("instagram");
  if (connected.includes("reddit")) targets.push("reddit");
  if (connected.includes("facebook")) targets.push("facebook");

  if (targets.length === 0) {
    log.warn("No connected platforms for cross-promo", { userId });
    return [];
  }

  log.info("Generating cross-platform posts", { userId, platforms: targets, contentType: ctx.type });

  const crossPromoMap: Record<SocialPlatform, string> = {} as any;
  for (const p of targets) {
    crossPromoMap[p] = buildCrossPromoLinks(p, targets, ctx);
  }

  const result = await aiRouteJSON(
    {
      task: "stream-promote",
      system: "You are a social media expert for a PS5 gaming channel. Each platform has a distinct voice and format. Never use generic copy — make each post feel native to the platform.",
      prompt: `Write platform-native promotional posts for this content:

Title: "${ctx.title}"
Game: ${ctx.game}
Type: ${ctx.type}
${ctx.youtubeUrl ? `YouTube URL: ${ctx.youtubeUrl}` : ""}
${ctx.streamStartTime ? `Stream started: ${ctx.streamStartTime}` : ""}
${ctx.clipDuration ? `Clip duration: ${ctx.clipDuration}s` : ""}
Channel name: ${ctx.channelName ?? "etgaming247"}

Write one post for each of these platforms: ${targets.join(", ")}

Platform guidelines:
- youtube: Full description (3-4 paragraphs) with sections, links, timestamps placeholder
- youtube_shorts: Short hook (max 100 chars) + 1 sentence + "Full vid on main channel"
- tiktok: Ultra-punchy hook + 2 sentences, end with "Full clip on YouTube"
- discord: Friendly community announcement, all details, conversational tone
- twitter: Max 240 chars, punchy hook + link placeholder [URL], 2-3 hashtags
- instagram: Visual caption (2-3 sentences), end with "link in bio", strong hashtags
- reddit: Genuine community-style post for r/${ctx.subreddit ?? "PS5"}, no hard sell, value first
- facebook: Conversational, friendly, 2-3 sentences + link

Return JSON:
{
  "posts": {
    "platform_name": "post content here (no hashtags — those are added separately)"
  }
}`,
    },
    (raw) => z.object({
      posts: z.record(z.string()),
    }).parse(raw),
  );

  const output: PlatformPost[] = [];

  for (const platform of targets) {
    const content = result.posts[platform] ?? result.posts[platform.replace("_", "")] ?? "";
    if (!content) continue;

    output.push({
      platform,
      content,
      hashtagBlock: buildHashtags(platform, ctx.game, ctx.type),
      crossPromoLinks: crossPromoMap[platform] ?? "",
    });
  }

  return output;
}
