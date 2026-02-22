import { db } from "./db";
import { autopilotQueue, channels, videos } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, gte, isNotNull, inArray, desc, sql } from "drizzle-orm";
import { logger } from "./lib/logger";
import { storage } from "./storage";
import { OAUTH_CONFIGS } from "./oauth-config";

interface VerificationResult {
  confirmed: boolean;
  platformStatus?: string;
  platformUrl?: string;
  error?: string;
}

function diagnoseFailureReason(error: string | undefined, platform: string, platformStatus?: string): { reason: string; fixable: boolean; category: string } {
  const err = (error || "").toLowerCase();
  const status = (platformStatus || "").toLowerCase();

  if (err.includes("quota") || err.includes("quotaexceeded") || (err.includes("403") && platform === "youtube")) {
    return { reason: "YouTube API quota exceeded — the upload was blocked because the daily API limit was reached.", fixable: true, category: "quota_cap" };
  }
  if (err.includes("not found") || status === "not_found") {
    return { reason: `Content was not found on ${platform}. The upload may have been rejected by the platform, removed by a moderator, or failed during processing.`, fixable: false, category: "not_found" };
  }
  if (err.includes("copyright") || err.includes("claim")) {
    return { reason: `Content was removed or blocked due to a copyright claim on ${platform}. Review the content for copyrighted material (music, video clips, etc.).`, fixable: false, category: "copyright" };
  }
  if (err.includes("auth") || err.includes("unauthorized") || err.includes("401") || err.includes("invalid_grant")) {
    return { reason: `Your ${platform} account connection has expired. Please reconnect your ${platform} account in Settings to resume uploads.`, fixable: true, category: "auth_expired" };
  }
  if (err.includes("rate limit") || err.includes("429") || err.includes("too many")) {
    return { reason: `${platform} rate limit was hit. The system will automatically retry after a cooldown period.`, fixable: true, category: "rate_limit" };
  }
  if (err.includes("network") || err.includes("econnrefused") || err.includes("timeout") || err.includes("enotfound")) {
    return { reason: `A network error prevented the upload from being verified. The system will retry automatically.`, fixable: true, category: "network" };
  }
  if (err.includes("no post id") || err.includes("no url")) {
    return { reason: `The upload to ${platform} may have failed silently — no confirmation ID was returned by the platform.`, fixable: true, category: "no_id" };
  }
  if (err.includes("no") && err.includes("credentials")) {
    return { reason: `No ${platform} account is connected. Please connect your ${platform} account in Settings to enable uploads.`, fixable: false, category: "config_missing" };
  }
  if (status.includes("rejected") || status.includes("failed")) {
    return { reason: `${platform} rejected the upload. This could be due to content policy violations, format issues, or platform restrictions.`, fixable: false, category: "platform_rejected" };
  }
  if (err.includes("still processing") || err.includes("will check again")) {
    return { reason: `The content is still being processed by ${platform}. This is normal and the system will verify again shortly.`, fixable: true, category: "processing" };
  }

  return { reason: `Upload verification failed for ${platform}. The system could not confirm the content is live after multiple attempts. Error: ${error || "Unknown"}`, fixable: false, category: "unknown" };
}

async function sendUploadFailureEmail(userId: string, platform: string, title: string, reason: string, contentUrl?: string) {
  try {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const email = user[0]?.email;
    if (!email) return;

    const notifyEmail = user[0]?.notifyEmail ?? true;
    if (!notifyEmail) return;

    const { sendGmail } = await import("./services/gmail-client");
    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; border: 1px solid #2d2d4e;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="font-size: 22px; color: #f87171; margin: 0;">Upload Issue Detected</h1>
          <p style="font-size: 13px; color: #888; margin: 4px 0 0;">CreatorOS Auto-Verification</p>
        </div>
        <div style="background: #16213e; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #f87171;">
          <p style="font-size: 14px; margin: 0 0 8px; color: #a78bfa;"><strong>Platform:</strong> ${platformName}</p>
          <p style="font-size: 14px; margin: 0 0 8px; color: #e0e0e0;"><strong>Content:</strong> ${title || "Untitled"}</p>
          ${contentUrl ? `<p style="font-size: 14px; margin: 0 0 8px;"><strong>Link:</strong> <a href="${contentUrl}" style="color: #60a5fa;">${contentUrl}</a></p>` : ""}
        </div>
        <div style="background: #1e1e3a; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="font-size: 14px; color: #fbbf24; margin: 0 0 8px;">Why This Happened</h3>
          <p style="font-size: 14px; color: #ccc; margin: 0; line-height: 1.5;">${reason}</p>
        </div>
        <div style="background: #16213e; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="font-size: 14px; color: #34d399; margin: 0 0 8px;">What Happens Next</h3>
          <p style="font-size: 14px; color: #ccc; margin: 0; line-height: 1.5;">
            CreatorOS has already attempted to resolve this automatically. If the issue persists, you may need to check your account connections or review the content. Visit your dashboard for full details.
          </p>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 20px; text-align: center;">
          You're receiving this because upload verification is enabled. Manage preferences in Settings.
        </p>
      </div>
    `;

    await sendGmail(email, `[CreatorOS] Upload issue on ${platformName}: ${title || "Content"}`, htmlBody);
    logger.info("[Verifier] Failure email sent", { userId, platform, email: email.substring(0, 3) + "***" });
  } catch (err: any) {
    logger.warn("[Verifier] Failed to send failure email", { userId, error: err.message });
  }
}

const GOOGLE_PLATFORMS = new Set(["youtube", "youtubeshorts"]);

async function getValidToken(userId: string, platform: string): Promise<string | null> {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, platform)));
  const channel = userChannels.find(c => c.accessToken);
  if (!channel || !channel.accessToken) return null;

  if (channel.tokenExpiresAt && new Date(channel.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return channel.accessToken;
  }

  if (!channel.refreshToken) return channel.accessToken;

  try {
    let tokenUrl: string;
    let body: Record<string, string>;
    let headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

    if (GOOGLE_PLATFORMS.has(platform)) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return channel.accessToken;
      tokenUrl = "https://oauth2.googleapis.com/token";
      body = { grant_type: "refresh_token", refresh_token: channel.refreshToken, client_id: clientId, client_secret: clientSecret };
    } else {
      const config = OAUTH_CONFIGS[platform as keyof typeof OAUTH_CONFIGS];
      if (!config) return channel.accessToken;
      const clientId = process.env[config.clientIdEnv];
      const clientSecret = process.env[config.clientSecretEnv];
      if (!clientId || !clientSecret) return channel.accessToken;
      tokenUrl = config.tokenUrl;
      body = { grant_type: "refresh_token", refresh_token: channel.refreshToken };
      if (config.tokenAuthMethod === "header") {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        body.client_id = clientId;
      } else {
        body.client_id = clientId;
        body.client_secret = clientSecret;
      }
    }

    const res = await fetch(tokenUrl, { method: "POST", headers, body: new URLSearchParams(body).toString() });
    if (!res.ok) {
      logger.warn("[Verifier] Token refresh failed", { platform, status: res.status });
      return channel.accessToken;
    }

    const data = await res.json() as any;
    const newToken = data.access_token;
    const newRefresh = data.refresh_token || channel.refreshToken;
    const expiresIn = data.expires_in;
    const newExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await storage.updateChannel(channel.id, {
      accessToken: newToken,
      refreshToken: newRefresh,
      tokenExpiresAt: newExpiry,
    });

    return newToken;
  } catch (err: any) {
    logger.warn("[Verifier] Token refresh error", { platform, error: err.message });
    return channel.accessToken;
  }
}

async function verifyXPost(userId: string, postId: string): Promise<VerificationResult> {
  try {
    const token = await getValidToken(userId, "x");
    if (!token) return { confirmed: false, error: "No X credentials available for verification" };

    const res = await fetch(`https://api.twitter.com/2/tweets/${postId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data.data?.id === postId) {
        return {
          confirmed: true,
          platformStatus: "live",
          platformUrl: `https://x.com/i/status/${postId}`,
        };
      }
    }

    if (res.status === 404) {
      return { confirmed: false, platformStatus: "not_found", error: "Post not found on X — may have been deleted or failed to publish" };
    }

    if (res.status === 429) {
      return { confirmed: false, error: "X rate limit — will retry verification later" };
    }

    return { confirmed: false, error: `X API returned ${res.status}` };
  } catch (err: any) {
    return { confirmed: false, error: `X verification error: ${err.message}` };
  }
}

async function verifyYouTubePost(userId: string, postId: string): Promise<VerificationResult> {
  try {
    const token = await getValidToken(userId, "youtube");
    if (!token) return { confirmed: false, error: "No YouTube credentials for verification" };

    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${postId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json() as any;
      const video = data.items?.[0];
      if (video) {
        const uploadStatus = video.status?.uploadStatus;
        const privacyStatus = video.status?.privacyStatus;
        const isLive = uploadStatus === "processed" || uploadStatus === "uploaded";
        return {
          confirmed: isLive,
          platformStatus: `${uploadStatus}/${privacyStatus}`,
          platformUrl: `https://youtube.com/watch?v=${postId}`,
        };
      }
      return { confirmed: false, platformStatus: "not_found", error: "Video not found on YouTube" };
    }

    if (res.status === 404) {
      return { confirmed: false, platformStatus: "not_found", error: "Video not found on YouTube" };
    }

    return { confirmed: false, error: `YouTube API returned ${res.status}` };
  } catch (err: any) {
    return { confirmed: false, error: `YouTube verification error: ${err.message}` };
  }
}

async function verifyTikTokPost(userId: string, postId: string): Promise<VerificationResult> {
  try {
    const token = await getValidToken(userId, "tiktok");
    if (!token) return { confirmed: false, error: "No TikTok credentials for verification" };

    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: postId }),
    });

    if (res.ok) {
      const data = await res.json() as any;
      const status = data.data?.status;
      if (status === "PUBLISH_COMPLETE") {
        const videoIds = data.data?.publicly_available_post_id || [];
        return {
          confirmed: true,
          platformStatus: "published",
          platformUrl: videoIds.length > 0 ? `https://www.tiktok.com/video/${videoIds[0]}` : undefined,
        };
      }
      if (status === "PROCESSING_UPLOAD" || status === "PROCESSING_DOWNLOAD" || status === "SENDING_TO_USER_INBOX") {
        return { confirmed: false, platformStatus: `processing: ${status}`, error: "TikTok still processing — will check again" };
      }
      return { confirmed: false, platformStatus: status, error: `TikTok publish status: ${status}` };
    }

    return { confirmed: false, error: `TikTok API returned ${res.status}` };
  } catch (err: any) {
    return { confirmed: false, error: `TikTok verification error: ${err.message}` };
  }
}

async function verifyDiscordPost(userId: string, postId: string): Promise<VerificationResult> {
  if (postId.startsWith("webhook_")) {
    return {
      confirmed: true,
      platformStatus: "webhook_accepted",
    };
  }
  return { confirmed: false, platformStatus: "unverifiable", error: "Discord webhooks do not support read-back verification — marked as delivered based on 2xx response" };
}

async function verifyStreamOnlyPlatformPost(platform: string): Promise<VerificationResult> {
  return { confirmed: false, platformStatus: "not_applicable", error: `${platform} is configured for AI-driven streaming only — content posting is not supported` };
}

export async function verifyPost(userId: string, platform: string, postId: string): Promise<VerificationResult> {
  switch (platform) {
    case "x":
      return verifyXPost(userId, postId);
    case "youtube":
    case "youtubeshorts":
      return verifyYouTubePost(userId, postId);
    case "tiktok":
      return verifyTikTokPost(userId, postId);
    case "discord":
      return verifyDiscordPost(userId, postId);
    case "twitch":
      return verifyStreamOnlyPlatformPost("Twitch");
    case "kick":
      return verifyStreamOnlyPlatformPost("Kick");
    case "rumble":
      return verifyStreamOnlyPlatformPost("Rumble");
    default:
      return { confirmed: false, error: `Verification not supported for ${platform}` };
  }
}

export async function verifyRecentPublishedPosts() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const unverifiedPosts = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "published"),
      isNotNull(autopilotQueue.publishedAt),
      gte(autopilotQueue.publishedAt, twentyFourHoursAgo),
      inArray(autopilotQueue.verificationStatus, ["unverified", "pending"]),
    ))
    .limit(15);

  if (unverifiedPosts.length === 0) return;

  logger.info("[Verifier] Checking published posts", { count: unverifiedPosts.length });

  let verified = 0;
  let failed = 0;
  let pending = 0;

  for (const post of unverifiedPosts) {
    const meta = (post.metadata as any) || {};
    const publishResult = meta.publishResult || {};
    const postId = publishResult.postId;
    const existingVerification = meta.verification || { attempts: 0 };

    if (existingVerification.attempts >= 5) {
      const diagnosis = diagnoseFailureReason(existingVerification.error, post.targetPlatform, existingVerification.platformStatus);

      await db.update(autopilotQueue)
        .set({
          verificationStatus: "failed",
          metadata: {
            ...meta,
            verification: {
              ...existingVerification,
              lastAttempt: new Date().toISOString(),
              platformConfirmed: false,
              error: "Max verification attempts reached — post may not have been published successfully",
              failureReason: diagnosis.reason,
              failureCategory: diagnosis.category,
              fixable: diagnosis.fixable,
            },
          },
        })
        .where(eq(autopilotQueue.id, post.id));
      failed++;

      const { createNotification } = await import("./autopilot-engine");
      await createNotification(post.userId, "autopilot",
        `Upload failed: ${post.targetPlatform}`,
        diagnosis.reason,
        "warning");

      const contentTitle = post.content?.substring(0, 60) || "Content post";
      await sendUploadFailureEmail(post.userId, post.targetPlatform, contentTitle, diagnosis.reason, existingVerification.platformUrl);

      if (diagnosis.fixable) {
        try {
          const { classifyFailure, scheduleAutoFix } = await import("./auto-fix-engine");
          const category = classifyFailure(existingVerification.error || "", post.targetPlatform);
          await scheduleAutoFix(post, category, meta);
        } catch (fixErr: any) {
          logger.warn("[Verifier] Auto-fix scheduling failed", { postId: post.id, platform: post.targetPlatform, error: fixErr?.message });
        }
      }
      continue;
    }

    if (!postId) {
      if (publishResult.postUrl) {
        await db.update(autopilotQueue)
          .set({
            verificationStatus: "verified",
            verifiedAt: new Date(),
            metadata: {
              ...meta,
              verification: {
                attempts: 1,
                lastAttempt: new Date().toISOString(),
                platformConfirmed: true,
                platformStatus: "url_available",
                platformUrl: publishResult.postUrl,
              },
            },
          })
          .where(eq(autopilotQueue.id, post.id));
        verified++;
      } else {
        await db.update(autopilotQueue)
          .set({
            verificationStatus: "failed",
            metadata: {
              ...meta,
              verification: {
                attempts: existingVerification.attempts + 1,
                lastAttempt: new Date().toISOString(),
                platformConfirmed: false,
                error: "No post ID or URL stored — cannot verify",
              },
            },
          })
          .where(eq(autopilotQueue.id, post.id));
        failed++;
      }
      continue;
    }

    const timeSincePublish = Date.now() - (post.publishedAt?.getTime() || 0);
    if (timeSincePublish < 30_000) {
      pending++;
      continue;
    }

    const result = await verifyPost(post.userId, post.targetPlatform, postId);

    if (result.confirmed) {
      await db.update(autopilotQueue)
        .set({
          verificationStatus: "verified",
          verifiedAt: new Date(),
          metadata: {
            ...meta,
            verification: {
              attempts: existingVerification.attempts + 1,
              lastAttempt: new Date().toISOString(),
              platformConfirmed: true,
              platformStatus: result.platformStatus,
              platformUrl: result.platformUrl || publishResult.postUrl,
            },
          },
        })
        .where(eq(autopilotQueue.id, post.id));
      verified++;
      logger.info("[Verifier] Post confirmed on platform", {
        postId: post.id,
        platform: post.targetPlatform,
        platformStatus: result.platformStatus,
      });
    } else if (result.error?.includes("rate limit") || result.error?.includes("still processing") || result.error?.includes("will check again")) {
      await db.update(autopilotQueue)
        .set({
          verificationStatus: "pending",
          metadata: {
            ...meta,
            verification: {
              attempts: existingVerification.attempts + 1,
              lastAttempt: new Date().toISOString(),
              platformConfirmed: false,
              platformStatus: result.platformStatus,
              error: result.error,
            },
          },
        })
        .where(eq(autopilotQueue.id, post.id));
      pending++;
    } else {
      const isFinal = existingVerification.attempts + 1 >= 5;
      await db.update(autopilotQueue)
        .set({
          verificationStatus: isFinal ? "failed" : "pending",
          metadata: {
            ...meta,
            verification: {
              attempts: existingVerification.attempts + 1,
              lastAttempt: new Date().toISOString(),
              platformConfirmed: false,
              platformStatus: result.platformStatus,
              error: result.error,
            },
          },
        })
        .where(eq(autopilotQueue.id, post.id));

      if (isFinal) {
        const diagnosis = diagnoseFailureReason(result.error, post.targetPlatform, result.platformStatus);
        const { createNotification } = await import("./autopilot-engine");
        await createNotification(post.userId, "autopilot",
          `Upload failed: ${post.targetPlatform}`,
          diagnosis.reason,
          "warning");

        const contentTitle = post.content?.substring(0, 60) || "Content post";
        await sendUploadFailureEmail(post.userId, post.targetPlatform, contentTitle, diagnosis.reason, result.platformUrl);

        if (diagnosis.fixable) {
          try {
            const { classifyFailure, scheduleAutoFix } = await import("./auto-fix-engine");
            const category = classifyFailure(result.error || "", post.targetPlatform);
            await scheduleAutoFix(post, category, meta);
          } catch (fixErr: any) {
            logger.warn("[Verifier] Auto-fix scheduling failed for re-verify", { postId: post.id, platform: post.targetPlatform, error: fixErr?.message });
          }
        }
        failed++;
      } else {
        pending++;
      }
    }
  }

  logger.info("[Verifier] Verification sweep complete", { verified, failed, pending, total: unverifiedPosts.length });
}

export async function verifyPostImmediately(postId: number, userId: string, platform: string, publishPostId: string): Promise<VerificationResult> {
  await new Promise(r => setTimeout(r, 5000));

  const result = await verifyPost(userId, platform, publishPostId);
  const post = await db.select().from(autopilotQueue).where(eq(autopilotQueue.id, postId)).limit(1);
  if (!post[0]) return result;

  const meta = (post[0].metadata as any) || {};

  await db.update(autopilotQueue)
    .set({
      verificationStatus: result.confirmed ? "verified" : "pending",
      verifiedAt: result.confirmed ? new Date() : undefined,
      metadata: {
        ...meta,
        verification: {
          attempts: 1,
          lastAttempt: new Date().toISOString(),
          platformConfirmed: result.confirmed,
          platformStatus: result.platformStatus,
          platformUrl: result.platformUrl,
          error: result.error,
        },
      },
    })
    .where(eq(autopilotQueue.id, postId));

  if (result.confirmed) {
    logger.info("[Verifier] Immediate verification confirmed", { postId, platform, status: result.platformStatus });
  } else {
    logger.info("[Verifier] Immediate verification pending, will retry in sweep", { postId, platform, error: result.error });
  }

  return result;
}

export async function verifyVideoUpload(videoDbId: number, userId: string, youtubeId: string, source: string): Promise<VerificationResult> {
  await new Promise(r => setTimeout(r, 10_000));

  const result = await verifyYouTubePost(userId, youtubeId);
  const video = await db.select().from(videos).where(eq(videos.id, videoDbId)).limit(1);
  if (!video[0]) return result;

  const meta = (video[0].metadata as any) || {};
  const existingVerification = meta.uploadVerification || { attempts: 0 };

  await db.update(videos)
    .set({
      metadata: {
        ...meta,
        uploadVerification: {
          attempts: existingVerification.attempts + 1,
          lastAttempt: new Date().toISOString(),
          confirmed: result.confirmed,
          platformStatus: result.platformStatus,
          platformUrl: result.platformUrl || `https://youtube.com/watch?v=${youtubeId}`,
          source,
          error: result.error,
        },
      },
    })
    .where(eq(videos.id, videoDbId));

  if (result.confirmed) {
    logger.info("[Verifier] Video upload verified", { videoDbId, youtubeId, source, status: result.platformStatus });
  } else {
    logger.info("[Verifier] Video upload verification pending", { videoDbId, youtubeId, source, error: result.error });
  }

  return result;
}

export async function verifyAllRecentUploads() {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const recentUploads = await db.select().from(videos)
    .where(and(
      eq(videos.status, "published"),
      gte(videos.createdAt, sixHoursAgo),
    ))
    .orderBy(desc(videos.createdAt))
    .limit(30);

  if (recentUploads.length === 0) {
    await verifyRecentPublishedPosts();
    return;
  }

  let verified = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;

  for (const video of recentUploads) {
    const meta = (video.metadata as any) || {};
    const platform = video.platform || "youtube";
    const platformId = meta.youtubeId || meta.tiktokId || meta.platformId;
    if (!platformId) continue;

    const existing = meta.uploadVerification || {};
    if (existing.confirmed === true) {
      skipped++;
      continue;
    }
    if ((existing.attempts || 0) >= 6) {
      if (!existing.notified) {
        try {
          const channel = video.channelId ? await db.select().from(channels).where(eq(channels.id, video.channelId)).limit(1) : [];
          const userId = channel[0]?.userId;
          if (userId) {
            const diagnosis = diagnoseFailureReason(existing.error, platform, existing.platformStatus);
            const platformUrl = platform === "youtube" || platform === "youtubeshorts"
              ? `https://youtube.com/watch?v=${platformId}` : "";
            const { createNotification } = await import("./autopilot-engine");
            await createNotification(userId, "autopilot",
              `Upload failed: ${video.title?.substring(0, 40)}`,
              diagnosis.reason,
              "warning");

            await sendUploadFailureEmail(userId, platform, video.title || "Untitled", diagnosis.reason, platformUrl || undefined);

            await db.update(videos).set({
              metadata: {
                ...meta,
                uploadVerification: {
                  ...existing,
                  notified: true,
                  emailSent: true,
                  failureReason: diagnosis.reason,
                  failureCategory: diagnosis.category,
                  fixable: diagnosis.fixable,
                },
              },
            }).where(eq(videos.id, video.id));

            if (diagnosis.fixable) {
              logger.info("[Verifier] Fixable upload failure detected", {
                videoId: video.id,
                platform,
                category: diagnosis.category,
                reason: diagnosis.reason,
              });
            }
          }
        } catch (err: any) {
          logger.warn("[Verifier] Failed to process upload failure notification", { videoId: video.id, error: err.message });
        }
      }
      failed++;
      continue;
    }

    const timeSinceCreate = Date.now() - (video.createdAt?.getTime() || 0);
    if (timeSinceCreate < 30_000) {
      pending++;
      continue;
    }

    const channel = video.channelId ? await db.select().from(channels).where(eq(channels.id, video.channelId)).limit(1) : [];
    const userId = channel[0]?.userId;
    if (!userId) continue;

    const result = await verifyPost(userId, platform, platformId);

    const platformUrl = result.platformUrl
      || (platform === "youtube" || platform === "youtubeshorts" ? `https://youtube.com/watch?v=${platformId}` : undefined);

    await db.update(videos)
      .set({
        metadata: {
          ...meta,
          uploadVerification: {
            attempts: (existing.attempts || 0) + 1,
            lastAttempt: new Date().toISOString(),
            confirmed: result.confirmed,
            platform,
            platformStatus: result.platformStatus,
            platformUrl,
            source: existing.source || "unknown",
            error: result.error,
          },
        },
      })
      .where(eq(videos.id, video.id));

    if (result.confirmed) {
      verified++;
      logger.info("[Verifier] Upload confirmed in sweep", { videoId: video.id, platform, platformId, status: result.platformStatus });
    } else if (result.error?.includes("rate limit")) {
      pending++;
      break;
    } else {
      pending++;
    }
  }

  logger.info("[Verifier] Upload verification sweep complete", { verified, failed, pending, skipped, total: recentUploads.length });

  await verifyRecentPublishedPosts();
}
