/**
 * Social Publisher — dispatches posts to each platform's API.
 *
 * Each platform method:
 *   - Returns the platform post ID (string) on success
 *   - Throws with a clear message on failure
 *   - Uses OAuth tokens from the channels table (passed as accessToken)
 *   - Falls back to env vars where supported (Discord bot token)
 *
 * Platforms fully implemented:   Discord, Twitter, Reddit, Facebook, Instagram (basic)
 * Platforms stubbed (API needed): TikTok video upload, YouTube Shorts upload
 */
import { createLogger } from "../../core/logger.js";
import type { SocialPlatform } from "../../../shared/schema/index.js";

const log = createLogger("social-publisher");

export interface PostPayload {
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  subreddit?: string;       // Reddit only
  title?: string;           // Reddit / Facebook title
}

export interface PublishResult {
  postId: string | null;
  url: string | null;
}

export async function publishToplatform(
  platform: SocialPlatform,
  payload: PostPayload,
  accessToken: string,
  platformData?: Record<string, unknown>,
): Promise<PublishResult> {
  switch (platform) {
    case "discord":      return publishDiscord(payload, accessToken, platformData);
    case "twitter":      return publishTwitter(payload, accessToken);
    case "instagram":    return publishInstagram(payload, accessToken, platformData);
    case "reddit":       return publishReddit(payload, accessToken);
    case "facebook":     return publishFacebook(payload, accessToken, platformData);
    case "tiktok":       return publishTikTokText(payload, accessToken);
    case "youtube":
    case "youtube_shorts": return { postId: null, url: null }; // handled by YouTube upload pipeline
    case "twitch":
    case "kick":         return { postId: null, url: null }; // stream-only
    default:             throw new Error(`No publisher for platform: ${platform}`);
  }
}

// ─── Discord ──────────────────────────────────────────────────────────────────

async function publishDiscord(
  payload: PostPayload,
  _accessToken: string,
  platformData?: Record<string, unknown>,
): Promise<PublishResult> {
  const webhookUrl = (platformData?.webhookUrl as string) ?? null;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const body = JSON.stringify({
    content: payload.text,
    ...(payload.imageUrl ? { embeds: [{ image: { url: payload.imageUrl } }] } : {}),
  });

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return { postId: data.id ?? null, url: null };
  }

  if (channelId && botToken) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${botToken}` },
      body,
    });
    if (!res.ok) throw new Error(`Discord bot API failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return { postId: data.id ?? null, url: `https://discord.com/channels/${channelId}/${data.id}` };
  }

  throw new Error("Discord not configured: no webhook URL and no DISCORD_BOT_TOKEN set");
}

// ─── Twitter / X ──────────────────────────────────────────────────────────────

async function publishTwitter(payload: PostPayload, accessToken: string): Promise<PublishResult> {
  const text = payload.linkUrl
    ? `${payload.text.slice(0, 240 - payload.linkUrl.length - 1)} ${payload.linkUrl}`
    : payload.text.slice(0, 280);

  const body: any = { text };
  if (payload.imageUrl) {
    // Twitter requires uploading media first via v1.1 API — simplified: skip for now
    log.warn("Twitter image upload not yet implemented — posting text only");
  }

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter post failed: ${res.status} ${err}`);
  }

  const data: any = await res.json();
  const tweetId = data.data?.id;
  return {
    postId: tweetId ?? null,
    url: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : null,
  };
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function publishInstagram(
  payload: PostPayload,
  accessToken: string,
  platformData?: Record<string, unknown>,
): Promise<PublishResult> {
  const igUserId = platformData?.platformUserId as string;
  if (!igUserId) throw new Error("Instagram: platformUserId missing from channel data");

  // Instagram Graph API: create media container, then publish
  const caption = payload.imageUrl
    ? `${payload.text}\n\n${payload.linkUrl ?? ""}`
    : payload.text;

  const containerParams = new URLSearchParams({
    caption,
    access_token: accessToken,
    ...(payload.imageUrl
      ? { image_url: payload.imageUrl, media_type: "IMAGE" }
      : { media_type: "REELS" }), // Reels require video_url
  });

  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media?${containerParams}`,
    { method: "POST" },
  );
  if (!containerRes.ok) throw new Error(`Instagram media container failed: ${containerRes.status}`);
  const containerData: any = await containerRes.json();
  const creationId = containerData.id;

  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish?${publishParams}`,
    { method: "POST" },
  );
  if (!publishRes.ok) throw new Error(`Instagram publish failed: ${publishRes.status}`);
  const publishData: any = await publishRes.json();

  return { postId: publishData.id ?? null, url: null };
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

async function publishReddit(payload: PostPayload, accessToken: string): Promise<PublishResult> {
  const subreddit = payload.subreddit ?? "PS5";
  const title = payload.title ?? payload.text.slice(0, 300);
  const isLink = !!payload.linkUrl;

  const formData = new URLSearchParams({
    sr: subreddit,
    title,
    kind: isLink ? "link" : "self",
    ...(isLink ? { url: payload.linkUrl! } : { text: payload.text }),
    resubmit: "true",
    nsfw: "false",
    spoiler: "false",
  });

  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "CreatorOS/2.0",
    },
    body: formData.toString(),
  });

  if (!res.ok) throw new Error(`Reddit post failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  const postUrl = data.jquery?.find?.((x: any) => Array.isArray(x) && x[2] === "url")?.[3] ?? null;

  return { postId: data.json?.data?.id ?? null, url: postUrl };
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

async function publishFacebook(
  payload: PostPayload,
  accessToken: string,
  platformData?: Record<string, unknown>,
): Promise<PublishResult> {
  const pageId = platformData?.pageId as string ?? platformData?.platformUserId as string;
  if (!pageId) throw new Error("Facebook: pageId missing from channel data");

  const message = payload.linkUrl
    ? `${payload.text}\n\n${payload.linkUrl}`
    : payload.text;

  const body: Record<string, string> = {
    message,
    access_token: accessToken,
  };
  if (payload.linkUrl) body.link = payload.linkUrl;

  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Facebook post failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  return { postId: data.id ?? null, url: null };
}

// ─── TikTok ───────────────────────────────────────────────────────────────────

async function publishTikTokText(payload: PostPayload, accessToken: string): Promise<PublishResult> {
  // TikTok Direct Post API — text posts available for creator apps
  // Video upload requires a separate chunked upload flow
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/text/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      post_info: {
        title: payload.text.slice(0, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: { source: "PULL_FROM_URL" },
    }),
  });

  if (!res.ok) throw new Error(`TikTok text post failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  return { postId: data.data?.publish_id ?? null, url: null };
}
