import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import { google } from "googleapis";
import { authStorage } from "./replit_integrations/auth/storage";
import { storage } from "./storage";

export function setupGoogleAuth(app: Express) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("GOOGLE_CLIENT_ID/SECRET not set, Google auth disabled");
    return;
  }

  function getCallbackUrl(req?: any): string {
    if (process.env.REPLIT_DEPLOYMENT) {
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
      if (domain) return `https://${domain}/api/auth/google/callback`;
    }
    if (req?.hostname) {
      return `https://${req.hostname}/api/auth/google/callback`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
    }
    return "http://localhost:5000/api/auth/google/callback";
  }

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: getCallbackUrl(),
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

          await authStorage.upsertUser({
            id: userId,
            email,
            firstName,
            lastName,
            profileImageUrl: profileImage,
          });

          const user = {
            claims: {
              sub: userId,
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
    } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", {
      failureRedirect: "/?auth_error=true",
    })(req, res, async () => {
      const user = req.user as any;
      if (!user) {
        console.error("Google auth callback: no user on req after authenticate");
        return res.redirect("/?auth_error=no_user");
      }

      console.log("Google auth callback: user authenticated, sub:", user.claims?.sub);

      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("Google auth req.login error:", loginErr);
          return res.redirect("/?auth_error=login_failed");
        }

        try {
          if (user.google_access_token && user.claims?.sub) {
            await autoConnectYouTubeFromGoogle(
              user.claims.sub,
              user.google_access_token,
              user.google_refresh_token
            );
          }
        } catch (error) {
          console.error("Auto YouTube connect after Google auth failed:", error);
        }

        req.session.save((saveErr) => {
          if (saveErr) console.error("Google auth session save error:", saveErr);
          console.log("Google auth: session saved, redirecting to /");
          res.redirect("/");
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
      console.log(`User ${userId} has no YouTube channel - new creator flow`);
      return { hasChannel: false };
    }

    const existingChannels = await storage.getChannelsByUser(userId);
    const existingYt = existingChannels.find((c) => c.platform === "youtube");

    const channelData = {
      userId,
      platform: "youtube" as const,
      channelName: ytChannel.snippet?.title || "YouTube Channel",
      channelId: ytChannel.id || "",
      accessToken: accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
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
        lastSyncAt: new Date(),
      };
      if (refreshToken) {
        updateData.refreshToken = refreshToken;
      }
      channel = await storage.updateChannel(existingYt.id, updateData);
    } else {
      channel = await storage.createChannel(channelData);
    }

    const existingShortsChannel = existingChannels.find(
      (c) => c.platform === "youtubeshorts"
    );
    const shortsData = {
      userId,
      platform: "youtubeshorts" as const,
      channelName: `${ytChannel.snippet?.title || "YouTube"} Shorts`,
      channelId: ytChannel.id || "",
      accessToken: accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      settings: {
        preset: "normal" as const,
        autoUpload: false,
        minShortsPerDay: 1,
        maxEditsPerDay: 3,
        cooldownMinutes: 60,
      },
    };

    if (existingShortsChannel) {
      const shortsUpdate: any = {
        channelName: shortsData.channelName,
        channelId: shortsData.channelId,
        accessToken: shortsData.accessToken,
        tokenExpiresAt: shortsData.tokenExpiresAt,
        lastSyncAt: new Date(),
      };
      if (refreshToken) {
        shortsUpdate.refreshToken = refreshToken;
      }
      await storage.updateChannel(existingShortsChannel.id, shortsUpdate);
    } else {
      await storage.createChannel(shortsData);
    }

    const linkedChannels = await storage.getLinkedChannelsByUser(userId);
    const existingLinkedYt = linkedChannels.find(
      (c) => c.platform === "youtube"
    );
    if (!existingLinkedYt) {
      await storage.createLinkedChannel({
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
      });
    }

    const existingLinkedShorts = linkedChannels.find(
      (c) => c.platform === "youtubeshorts"
    );
    if (!existingLinkedShorts) {
      await storage.createLinkedChannel({
        userId,
        platform: "youtubeshorts",
        username: `${ytChannel.snippet?.title || "YouTube"} Shorts`,
        channelUrl: `https://youtube.com/channel/${ytChannel.id}`,
        isConnected: true,
        connectionType: "oauth",
        followerCount: parseInt(
          ytChannel.statistics?.subscriberCount || "0",
          10
        ),
      });
    }

    console.log(
      `Auto-connected YouTube for user ${userId}: ${ytChannel.snippet?.title}`
    );
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
      console.warn("YouTube API quota exceeded during auto-connect");
    } else {
      console.error("Auto YouTube connect error:", error.message);
    }
    return { hasChannel: false, error: error.message };
  }
}
