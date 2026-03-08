import { db } from "./db";
import { videos, channels, managedPlaylists, playlistItems, notifications } from "@shared/schema";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClient } from "./lib/openai";

const openai = getOpenAIClient();

const logger = createLogger("playlist-manager");

type PlaylistType = "longform" | "shorts";

interface GamePlaylistMapping {
  gameName: string;
  playlistType: PlaylistType;
  playlistId: number;
  youtubePlaylistId: string | null;
}

async function detectGameFromVideo(video: any): Promise<string> {
  const meta = (video.metadata as any) || {};
  if (meta.gameName) return meta.gameName.trim().toLowerCase();

  const title = (video.title || "").toLowerCase();
  const desc = (video.description || "").toLowerCase();
  const tags = (meta.tags || []).map((t: string) => t.toLowerCase());
  const combined = `${title} ${desc} ${tags.join(" ")}`;

  const gamePatterns: Record<string, string[]> = {
    "fortnite": ["fortnite"],
    "call of duty": ["call of duty", "cod", "warzone", "modern warfare", "black ops"],
    "battlefield": ["battlefield", "bf6", "bf 6", "bf2042", "bf 2042"],
    "minecraft": ["minecraft"],
    "gta v": ["gta", "grand theft auto"],
    "apex legends": ["apex legends", "apex"],
    "valorant": ["valorant"],
    "league of legends": ["league of legends", "lol"],
    "overwatch": ["overwatch"],
    "rocket league": ["rocket league"],
    "destiny 2": ["destiny 2", "destiny2"],
    "elden ring": ["elden ring"],
    "baldur's gate 3": ["baldur's gate", "baldurs gate", "bg3"],
    "helldivers 2": ["helldivers"],
    "palworld": ["palworld"],
    "lethal company": ["lethal company"],
    "roblox": ["roblox"],
    "fifa": ["fifa", "ea fc", "eafc"],
    "nba 2k": ["nba 2k", "nba2k"],
    "madden": ["madden"],
    "rainbow six": ["rainbow six", "r6"],
    "dead by daylight": ["dead by daylight", "dbd"],
    "escape from tarkov": ["tarkov"],
    "rust": ["rust game", "rust pvp"],
    "ark": ["ark survival"],
    "counter-strike": ["counter-strike", "cs2", "csgo", "cs:go"],
    "halo": ["halo infinite", "halo"],
    "starfield": ["starfield"],
    "diablo": ["diablo"],
    "cyberpunk 2077": ["cyberpunk", "cyberpunk 2077"],
    "spider-man": ["spider-man", "spiderman"],
    "god of war": ["god of war", "ragnarok"],
    "final fantasy": ["final fantasy", "ffxiv", "ff16", "ff7"],
    "pokemon": ["pokemon", "pokémon"],
    "zelda": ["zelda", "tears of the kingdom", "breath of the wild"],
    "resident evil": ["resident evil", "re4"],
    "the witcher": ["witcher"],
    "horizon": ["horizon forbidden", "horizon zero"],
    "monster hunter": ["monster hunter"],
    "street fighter": ["street fighter", "sf6"],
    "mortal kombat": ["mortal kombat"],
    "world of warcraft": ["world of warcraft", "wow"],
    "fall guys": ["fall guys"],
    "among us": ["among us"],
    "satisfactory": ["satisfactory"],
    "no man's sky": ["no man's sky"],
    "sea of thieves": ["sea of thieves"],
  };

  for (const [game, patterns] of Object.entries(gamePatterns)) {
    if (patterns.some(p => combined.includes(p))) return game;
  }

  if (meta.contentCategory) return meta.contentCategory.toLowerCase();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a content classifier. Given a video title, description, and tags, identify the primary topic/game/subject in 1-3 words. Return ONLY the topic name in lowercase. Examples: "battlefield 6", "cooking", "tech reviews", "fitness workout", "music production". If truly unidentifiable, return "general".`,
        },
        {
          role: "user",
          content: `Title: ${video.title || "unknown"}\nDescription: ${(video.description || "").substring(0, 200)}\nTags: ${tags.slice(0, 10).join(", ")}`,
        },
      ],
      max_completion_tokens: 4000,
    });
    const detected = response.choices[0]?.message?.content?.trim().toLowerCase() || "general";
    return detected.length > 0 && detected.length < 50 ? detected : "general";
  } catch {
    return "general";
  }
}

function generatePlaylistTitle(gameName: string, type: PlaylistType): string {
  const formattedGame = gameName
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return type === "longform"
    ? `${formattedGame} - Full Gameplay & Videos`
    : `${formattedGame} - Shorts & Highlights`;
}

function generatePlaylistDescription(gameName: string, type: PlaylistType): string {
  const formattedGame = gameName
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return type === "longform"
    ? `All full-length ${formattedGame} videos, sessions, and content. New videos added automatically.`
    : `${formattedGame} shorts, highlights, best moments, and clips. Updated automatically with new content.`;
}

async function getOrCreateGamePlaylist(
  userId: string,
  gameName: string,
  playlistType: PlaylistType,
  channelId: number
): Promise<GamePlaylistMapping> {
  const normalizedGame = gameName.toLowerCase().trim();
  const strategy = playlistType === "longform" ? "game-longform" : "game-shorts";

  const existing = await db.select().from(managedPlaylists)
    .where(and(
      eq(managedPlaylists.userId, userId),
      eq(managedPlaylists.autoManaged, true),
      eq(managedPlaylists.strategy, strategy),
    ));

  const match = existing.find(p => {
    const meta = (p.metadata as any) || {};
    return meta.gameName === normalizedGame && meta.channelId === channelId;
  });

  if (match) {
    return {
      gameName: normalizedGame,
      playlistType,
      playlistId: match.id,
      youtubePlaylistId: match.youtubePlaylistId,
    };
  }

  const title = generatePlaylistTitle(normalizedGame, playlistType);
  const description = generatePlaylistDescription(normalizedGame, playlistType);

  let youtubePlaylistId: string | null = null;
  try {
    youtubePlaylistId = await createYouTubePlaylist(channelId, title, description);
  } catch (err) {
    logger.warn("Could not create YouTube playlist (will track locally)", {
      gameName: normalizedGame, type: playlistType, error: String(err)
    });
  }

  const [created] = await db.insert(managedPlaylists).values({
    userId,
    youtubePlaylistId,
    title,
    description,
    strategy,
    videoCount: 0,
    autoManaged: true,
    lastUpdatedAt: new Date(),
    metadata: {
      gameName: normalizedGame,
      playlistType,
      channelId,
      rules: { autoAssign: true, gameMatch: normalizedGame },
    } as any,
  }).returning();

  logger.info("Created game playlist", {
    userId, gameName: normalizedGame, type: playlistType,
    playlistId: created.id, youtubePlaylistId
  });

  return {
    gameName: normalizedGame,
    playlistType,
    playlistId: created.id,
    youtubePlaylistId,
  };
}

async function createYouTubePlaylist(channelId: number, title: string, description: string): Promise<string> {
  const { getAuthenticatedClient } = await import("./youtube");
  const { google } = await import("googleapis");

  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
      },
      status: {
        privacyStatus: "public",
      },
    },
  });

  const playlistId = response.data.id || "";

  if (playlistId) {
    try {
      await generateAndSetPlaylistThumbnail(channelId, playlistId, title);
    } catch (err) {
      logger.warn("Playlist created but thumbnail failed (non-blocking)", {
        playlistId, error: String(err)
      });
    }
  }

  return playlistId;
}

async function generatePlaylistThumbnailPrompt(playlistTitle: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the world's best YouTube visual brand designer — you create playlist cover art that makes channels look like premium, professional brands worth subscribing to. You combine:

🎨 ELITE ART DIRECTOR: You design covers with cinematic composition, dramatic lighting, rich color palettes, and iconic scene positioning.

📊 BRAND STRATEGIST: Your playlist thumbnails create visual cohesion across a channel, making it look organized, professional, and worth binging. Each playlist cover is instantly recognizable as part of a unified brand.

🧠 VISUAL PSYCHOLOGIST: You understand that playlist thumbnails are a promise — they tell viewers "this collection is worth your time." You use color psychology, visual tension, and premium aesthetics to communicate quality.

RULES:
- Create CINEMATIC quality — dramatic lighting, rich shadows, depth of field
- Use the topic's iconic visual elements, color palette, and atmosphere
- Design for premium brand perception — this should look like a Netflix category banner
- Colors must be bold and saturated to stand out in YouTube's sidebar
- Include visual depth (foreground/midground/background layers)
- Never include text overlays — YouTube adds the playlist title automatically
- The image should make viewers think "I need to watch ALL of these"`,
        },
        {
          role: "user",
          content: `Create a thumbnail image prompt for this YouTube playlist: "${playlistTitle}"\n\nReturn ONLY the image generation prompt, nothing else. Design for a LANDSCAPE 16:9 frame (1280x720 YouTube playlist thumbnail). The composition must be wide and horizontal — fill the widescreen frame from edge to edge. No portrait or square framing.`,
        },
      ],
      max_completion_tokens: 4000,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    logger.error("Failed to generate playlist thumbnail prompt", { error: String(err) });
    return "";
  }
}

async function generateAndSetPlaylistThumbnail(
  channelId: number,
  youtubePlaylistId: string,
  playlistTitle: string
): Promise<boolean> {
  try {
    const prompt = await generatePlaylistThumbnailPrompt(playlistTitle);
    if (!prompt) {
      logger.warn("Empty playlist thumbnail prompt", { youtubePlaylistId });
      return false;
    }

    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      logger.warn("Image generation not configured, skipping playlist thumbnail", { youtubePlaylistId });
      return false;
    }

    logger.info("Generating playlist thumbnail", { youtubePlaylistId, playlistTitle });

    let imageBuffer: Buffer;
    try {
      const { generateImageBuffer } = await import("./replit_integrations/image/client");
      // YouTube playlist thumbnails display in 16:9 — use landscape format
      imageBuffer = await generateImageBuffer(prompt, "1536x1024");
    } catch (imgErr) {
      logger.error("Image generation failed for playlist thumbnail", { error: String(imgErr) });
      return false;
    }

    if (!imageBuffer || imageBuffer.length < 1000) {
      logger.warn("Generated playlist thumbnail too small", { size: imageBuffer?.length });
      return false;
    }

    const { getAuthenticatedClient } = await import("./youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const { Readable } = await import("stream");
    const readable = new Readable();
    readable.push(imageBuffer);
    readable.push(null);

    await youtube.thumbnails.set({
      videoId: youtubePlaylistId,
      media: {
        mimeType: "image/png",
        body: readable,
      },
    });

    logger.info("Playlist thumbnail uploaded", { youtubePlaylistId, playlistTitle });
    return true;
  } catch (err) {
    logger.error("Playlist thumbnail generation/upload failed", {
      youtubePlaylistId, error: String(err)
    });
    return false;
  }
}

async function addVideoToYouTubePlaylist(channelId: number, playlistId: string, youtubeVideoId: string): Promise<boolean> {
  try {
    const { getAuthenticatedClient } = await import("./youtube");
    const { google } = await import("googleapis");

    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId: youtubeVideoId,
          },
        },
      },
    });
    return true;
  } catch (err) {
    logger.error("Failed to add video to YouTube playlist", {
      playlistId, youtubeVideoId, error: String(err)
    });
    return false;
  }
}

async function isVideoInPlaylist(playlistId: number, videoId: number): Promise<boolean> {
  const existing = await db.select().from(playlistItems)
    .where(and(
      eq(playlistItems.playlistId, playlistId),
      eq(playlistItems.videoId, videoId),
    ))
    .limit(1);
  return existing.length > 0;
}

const PLAYLIST_BATCH_LIMIT = 20;

export async function organizePlaylistsForUser(userId: string): Promise<{ assigned: number; playlistsCreated: number }> {
  let assigned = 0;
  let playlistsCreated = 0;

  try {
    const ytChannels = await db.select().from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        eq(channels.userId, userId),
        sql`${channels.accessToken} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) return { assigned: 0, playlistsCreated: 0 };

    const existingPlaylistsBefore = await db.select({ id: managedPlaylists.id })
      .from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));
    const beforeCount = existingPlaylistsBefore.length;

    for (const channel of ytChannels) {
      if (assigned >= PLAYLIST_BATCH_LIMIT) break;
      const channelVids = await db.select().from(videos)
        .where(eq(videos.channelId, channel.id))
        .orderBy(desc(videos.createdAt))
        .limit(PLAYLIST_BATCH_LIMIT * 2);

      for (const video of channelVids) {
        if (assigned >= PLAYLIST_BATCH_LIMIT) break;
        const meta = (video.metadata as any) || {};
        const youtubeId = meta.youtubeId;
        if (!youtubeId) continue;

        if (meta.playlistAssigned) continue;

        const gameName = await detectGameFromVideo(video);
        const isShort = video.type === "short" || video.type === "shorts" ||
          video.type === "short_video" ||
          (meta.duration && parseDuration(meta.duration) <= 60);

        const playlistType: PlaylistType = isShort ? "shorts" : "longform";

        const mapping = await getOrCreateGamePlaylist(userId, gameName, playlistType, channel.id);

        if (await isVideoInPlaylist(mapping.playlistId, video.id)) {
          await db.update(videos).set({
            metadata: { ...meta, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
          }).where(eq(videos.id, video.id));
          continue;
        }

        if (mapping.youtubePlaylistId) {
          await addVideoToYouTubePlaylist(channel.id, mapping.youtubePlaylistId, youtubeId);
        }

        const currentItems = await db.select({ count: sql<number>`count(*)::int` })
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, mapping.playlistId));
        const position = (currentItems[0]?.count || 0);

        await db.insert(playlistItems).values({
          playlistId: mapping.playlistId,
          videoId: video.id,
          position,
          addedAt: new Date(),
        });

        await db.update(managedPlaylists).set({
          videoCount: sql`${managedPlaylists.videoCount} + 1`,
          lastUpdatedAt: new Date(),
        }).where(eq(managedPlaylists.id, mapping.playlistId));

        await db.update(videos).set({
          metadata: { ...meta, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
        }).where(eq(videos.id, video.id));

        assigned++;
        logger.info("Assigned video to playlist", {
          videoId: video.id, title: video.title, game: gameName,
          type: playlistType, playlistId: mapping.playlistId
        });
      }
    }

    const existingPlaylistsAfter = await db.select({ id: managedPlaylists.id })
      .from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));
    playlistsCreated = existingPlaylistsAfter.length - beforeCount;

    if (assigned > 0 || playlistsCreated > 0) {
      logger.info("Playlists organized", { userId, assigned, playlistsCreated });
    }
  } catch (err) {
    logger.error("Playlist organization failed", { userId, error: String(err) });
  }

  return { assigned, playlistsCreated };
}

export async function getPlaylistStats(userId: string): Promise<{
  totalPlaylists: number;
  longformPlaylists: number;
  shortsPlaylists: number;
  totalAssigned: number;
  playlists: Array<{ id: number; title: string; type: string; game: string; videoCount: number }>;
}> {
  const userPlaylists = await db.select().from(managedPlaylists)
    .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)))
    .orderBy(desc(managedPlaylists.lastUpdatedAt));

  const longform = userPlaylists.filter(p => p.strategy === "game-longform");
  const shorts = userPlaylists.filter(p => p.strategy === "game-shorts");

  return {
    totalPlaylists: userPlaylists.length,
    longformPlaylists: longform.length,
    shortsPlaylists: shorts.length,
    totalAssigned: userPlaylists.reduce((sum, p) => sum + (p.videoCount || 0), 0),
    playlists: userPlaylists.map(p => ({
      id: p.id,
      title: p.title || "",
      type: p.strategy === "game-longform" ? "longform" : "shorts",
      game: ((p.metadata as any)?.gameName || "unknown"),
      videoCount: p.videoCount || 0,
    })),
  };
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    const seconds = parseInt(duration, 10);
    return isNaN(seconds) ? 0 : seconds;
  }
  return (parseInt(match[1] || "0") * 3600) +
    (parseInt(match[2] || "0") * 60) +
    parseInt(match[3] || "0");
}

export async function assignSingleVideoToPlaylist(userId: string, videoId: number, channelId: number): Promise<boolean> {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) return false;

    const meta = (video.metadata as any) || {};
    if (meta.playlistAssigned) return true;

    const youtubeId = meta.youtubeId;
    if (!youtubeId) return false;

    let gameName = meta.detectedGame;
    if (!gameName) {
      gameName = await detectGameFromVideo(video);
      await db.update(videos).set({
        metadata: { ...meta, detectedGame: gameName },
      }).where(eq(videos.id, videoId));
    }

    const isShort = video.type === "short" || video.type === "shorts" ||
      (meta.duration && parseDuration(meta.duration) <= 60);
    const playlistType: PlaylistType = isShort ? "shorts" : "longform";

    const mapping = await getOrCreateGamePlaylist(userId, gameName, playlistType, channelId);

    if (await isVideoInPlaylist(mapping.playlistId, videoId)) {
      await db.update(videos).set({
        metadata: { ...meta, detectedGame: gameName, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
      }).where(eq(videos.id, videoId));
      return true;
    }

    if (mapping.youtubePlaylistId) {
      await addVideoToYouTubePlaylist(channelId, mapping.youtubePlaylistId, youtubeId);
    }

    const currentItems = await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, mapping.playlistId));
    const position = (currentItems[0]?.count || 0);

    try {
      await db.insert(playlistItems).values({
        playlistId: mapping.playlistId,
        videoId,
        position,
        addedAt: new Date(),
      });
    } catch (insertErr: any) {
      if (insertErr.code === "23505") {
        logger.info("Playlist item already exists (concurrent insert), skipping", { playlistId: mapping.playlistId, videoId });
      } else {
        throw insertErr;
      }
    }

    await db.update(managedPlaylists).set({
      videoCount: sql`${managedPlaylists.videoCount} + 1`,
      lastUpdatedAt: new Date(),
    }).where(eq(managedPlaylists.id, mapping.playlistId));

    await db.update(videos).set({
      metadata: { ...meta, detectedGame: gameName, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
    }).where(eq(videos.id, videoId));

    logger.info("Assigned new clip to playlist", {
      videoId, game: gameName, type: playlistType, playlistId: mapping.playlistId
    });

    return true;
  } catch (err) {
    logger.error("Single video playlist assignment failed", { videoId, error: String(err) });
    return false;
  }
}

export async function runPlaylistOrganizationForAllUsers(): Promise<number> {
  let usersProcessed = 0;

  const userRows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(and(eq(channels.platform, "youtube"), isNotNull(channels.userId)));

  for (const row of userRows) {
    if (!row.userId) continue;
    try {
      const { assigned } = await organizePlaylistsForUser(row.userId);
      if (assigned > 0) usersProcessed++;
    } catch (err) {
      logger.error("Playlist org failed for user", { userId: row.userId, error: String(err) });
    }
  }

  return usersProcessed;
}
