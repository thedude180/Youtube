import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import { google } from "googleapis";
import { authStorage } from "./replit_integrations/auth/storage";
import { storage } from "./storage";
import { db } from "./db";
import { linkedChannels } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export function setupGoogleAuth(app: Express) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("GOOGLE_CLIENT_ID/SECRET not set, Google auth disabled");
    return;
  }

  function getCallbackUrl(req?: any): string {
    if (req?.hostname) {
      const proto = req.secure ? "https" : req.protocol;
      return `${proto}://${req.hostname}/api/auth/google/callback`;
    }
    if (process.env.REPLIT_DEPLOYMENT) {
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      if (domain) return `https://${domain}/api/auth/google/callback`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
    }
    return "http://localhost:5000/api/auth/google/callback";
  }

  const defaultCallbackUrl = getCallbackUrl();

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: defaultCallbackUrl,
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/youtube",
          "https://www.googleapis.com/auth/youtube.upload",
        ],
        passReqToCallback: true,
      } as any,
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const firstName = profile.name?.givenName || "";
          const lastName = profile.name?.familyName || "";
          const profileImage = profile.photos?.[0]?.value || "";
          const googleId = profile.id;

          const userId = `google_${googleId}`;

          let actualUserId = userId;
          try {
            const dbUser = await authStorage.upsertUserTrusted({
              id: userId,
              email,
              firstName,
              lastName,
              profileImageUrl: profileImage,
            });
            if (dbUser?.id) {
              actualUserId = dbUser.id;
            }
          } catch (upsertErr) {
            console.error("Google auth: upsertUser FAILED:", upsertErr);
          }

          const user = {
            claims: {
              sub: actualUserId,
              email,
              first_name: firstName,
              last_name: lastName,
              profile_image_url: profileImage,
            },
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            google_access_token: accessToken,
            google_refresh_token: refreshToken,
            auth_provider: "google",
          };

          done(null, user);
        } catch (error) {
          console.error("Google auth error:", error);
          done(error, null);
        }
      }
    )
  );

  app.get("/api/auth/google", (req, res, next) => {
    const dynamicCallback = getCallbackUrl(req);
    passport.authenticate("google", {
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.upload",
      ],
      accessType: "offline",
      prompt: "consent",
      callbackURL: dynamicCallback,
    } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    const dynamicCallback = getCallbackUrl(req);
    passport.authenticate("google", {
      failureRedirect: "/?auth_error=true",
      callbackURL: dynamicCallback,
    } as any)(req, res, async () => {
      const user = req.user as any;
      if (!user) {
        console.error("Google auth callback: no user on req after authenticate");
        return res.redirect("/?auth_error=no_user");
      }


      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("Google auth req.login error:", loginErr);
          return res.redirect("/?auth_error=login_failed");
        }

        let ytResult: any = null;
        try {
          if (user.google_access_token && user.claims?.sub) {
            ytResult = await autoConnectYouTubeFromGoogle(
              user.claims.sub,
              user.google_access_token,
              user.google_refresh_token
            );
          }
        } catch (error) {
          console.error("Auto YouTube connect after Google auth failed:", error);
        }

        if (user.claims?.sub) {
          try {
            const { initializeUserSystems } = await import("./services/post-login-init");
            await initializeUserSystems(user.claims.sub);
          } catch (initErr) {
            console.error("[GoogleAuth] Post-login init failed:", initErr);
          }

          if (ytResult && !ytResult.hasChannel) {
            try {
              const { initPreChannelState } = await import("./services/channel-launch-service");
              await initPreChannelState(user.claims.sub);
            } catch (launchErr) {
              console.error("[GoogleAuth] Pre-channel init failed:", launchErr);
            }
          }
        }

        req.session.save((saveErr) => {
          if (saveErr) console.error("Google auth session save error:", saveErr);
          if (ytResult?.hasChannel && ytResult?.ytChannel) {
            res.redirect(`/?yt_connected=true&channel=${encodeURIComponent(ytResult.ytChannel.title || "YouTube")}`);
          } else if (ytResult && !ytResult.hasChannel) {
            res.redirect("/?yt_no_channel=true");
          } else {
            res.redirect("/");
          }
        });
      });
    });
  });

  app.get("/api/auth/google/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

async function autoConnectYouTubeFromGoogle(
  userId: string,
  accessToken: string,
  refreshToken: string
) {
  const existingChannels = await storage.getChannelsByUser(userId);
  const existingYt = existingChannels.find((c) => c.platform === "youtube");

  if (existingYt) {
    const tokenUpdate: any = {
      accessToken,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      lastSyncAt: new Date(),
    };
    if (refreshToken) {
      tokenUpdate.refreshToken = refreshToken;
    }
    await storage.updateChannel(existingYt.id, tokenUpdate);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ["snippet", "statistics", "contentDetails"],
      mine: true,
    });

    const ytChannel = channelResponse.data.items?.[0];
    if (!ytChannel) {
      return { hasChannel: !existingYt ? false : true };
    }

    const uploadsPlaylistId = ytChannel.contentDetails?.relatedPlaylists?.uploads || null;
    const thumbnailUrl = ytChannel.snippet?.thumbnails?.high?.url
      || ytChannel.snippet?.thumbnails?.medium?.url
      || ytChannel.snippet?.thumbnails?.default?.url
      || null;
    const subCount = parseInt(ytChannel.statistics?.subscriberCount || "0", 10);
    const vidCount = parseInt(ytChannel.statistics?.videoCount || "0", 10);
    const viewCount = parseInt(ytChannel.statistics?.viewCount || "0", 10);

    const channelData = {
      userId,
      platform: "youtube" as const,
      channelName: ytChannel.snippet?.title || "YouTube Channel",
      channelId: ytChannel.id || "",
      accessToken: accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      subscriberCount: subCount,
      videoCount: vidCount,
      viewCount: viewCount,
      platformData: {
        uploadsPlaylistId,
        thumbnailUrl,
        description: ytChannel.snippet?.description || "",
        customUrl: ytChannel.snippet?.customUrl || "",
        publishedAt: ytChannel.snippet?.publishedAt || "",
        country: ytChannel.snippet?.country || "",
      },
      lastSyncAt: new Date(),
      settings: {
        preset: "normal" as const,
        autoUpload: false,
        minShortsPerDay: 1,
        maxEditsPerDay: 3,
        cooldownMinutes: 60,
      },
    };

    let channel;
    if (existingYt) {
      const updateData: any = {
        channelName: channelData.channelName,
        channelId: channelData.channelId,
        accessToken: channelData.accessToken,
        tokenExpiresAt: channelData.tokenExpiresAt,
        subscriberCount: subCount,
        videoCount: vidCount,
        viewCount: viewCount,
        platformData: channelData.platformData,
        lastSyncAt: new Date(),
      };
      if (refreshToken) {
        updateData.refreshToken = refreshToken;
      }
      channel = await storage.updateChannel(existingYt.id, updateData);
    } else {
      channel = await storage.createChannel(channelData);
    }

    const existingLinked = await db.select().from(linkedChannels).where(
      and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, "youtube"))
    );
    if (existingLinked.length === 0) {
      await db.insert(linkedChannels).values({
        userId,
        platform: "youtube",
        username: ytChannel.snippet?.title || "YouTube",
        channelUrl: `https://youtube.com/channel/${ytChannel.id}`,
        isConnected: true,
        connectionType: "oauth",
        followerCount: parseInt(
          ytChannel.statistics?.subscriberCount || "0",
          10
        ),
      } as any);
    }

    return {
      hasChannel: true,
      channel,
      ytChannel: {
        id: ytChannel.id,
        title: ytChannel.snippet?.title,
        subscriberCount: ytChannel.statistics?.subscriberCount,
        videoCount: ytChannel.statistics?.videoCount,
      },
    };
  } catch (error: any) {
    if (error.code === 403 || error.message?.includes("quotaExceeded")) {
      console.warn("[GoogleAuth] YouTube API quota exceeded — tokens already saved");
    } else {
      console.error("[GoogleAuth] Auto YouTube connect error:", error.message);
    }
    return { hasChannel: !!existingYt, error: error.message };
  }
}

export async function refreshYouTubeChannelInfo(userId: string): Promise<{
  success: boolean;
  channelName?: string;
  channelId?: string;
  subscriberCount?: number;
  videoCount?: number;
  uploadsPlaylistId?: string | null;
  thumbnailUrl?: string | null;
  error?: string;
}> {
  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find((c: any) => c.platform === "youtube");
  if (!ytChannel?.accessToken) {
    return { success: false, error: "No YouTube channel connected" };
  }
  const result = await autoConnectYouTubeFromGoogle(
    userId,
    ytChannel.accessToken,
    ytChannel.refreshToken || ""
  );
  if ((result as any).error && !(result as any).hasChannel) {
    return { success: false, error: (result as any).error };
  }
  const yt = (result as any).ytChannel;
  const updated = await storage.getChannelsByUser(userId).then((cs: any[]) => cs.find((c: any) => c.platform === "youtube"));
  return {
    success: true,
    channelName: yt?.title || updated?.channelName,
    channelId: yt?.id || updated?.channelId,
    subscriberCount: yt?.subscriberCount ? parseInt(yt.subscriberCount, 10) : updated?.subscriberCount,
    videoCount: yt?.videoCount ? parseInt(yt.videoCount, 10) : updated?.videoCount,
    uploadsPlaylistId: (updated?.platformData as any)?.uploadsPlaylistId ?? null,
    thumbnailUrl: (updated?.platformData as any)?.thumbnailUrl ?? null,
  };
}
