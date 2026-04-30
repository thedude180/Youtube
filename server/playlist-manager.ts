import { db } from "./db";
import { videos, channels, managedPlaylists, playlistItems, notifications } from "@shared/schema";
import { eq, and, desc, sql, isNotNull, inArray } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClientBackground } from "./lib/openai";

const openai = getOpenAIClientBackground();

const logger = createLogger("playlist-manager");

type PlaylistType = "longform" | "shorts";

interface GamePlaylistMapping {
  gameName: string;
  playlistType: PlaylistType;
  playlistId: number;
  youtubePlaylistId: string | null;
}

const UNIDENTIFIED_GAMES = new Set(["general", "unknown", "uncategorized", "misc", "other", ""]);

function isJunkGameName(gameName: string): boolean {
  const lower = gameName.toLowerCase().trim();
  if (UNIDENTIFIED_GAMES.has(lower)) return true;
  const junkPrefixes = [
    "list of", "category:", "category of", "characters of", "history of",
    "timeline of", "overview of", "comparison of", "types of", "best of",
    "top list", "wikipedia", "list", "this is ",
  ];
  if (junkPrefixes.some(p => lower.startsWith(p))) return true;
  if (lower.includes(" list of ") || lower.startsWith("list of ")) return true;
  if (lower.length > 50) return true;
  return false;
}

async function detectGameFromVideo(video: any): Promise<string> {
  const meta = (video.metadata as any) || {};
  if (meta.gameName && meta.gameName !== "Unknown" && meta.gameName !== "Uncategorized") {
    const candidate = meta.gameName.trim().toLowerCase();
    if (!isJunkGameName(candidate)) return candidate;
  }

  const title = (video.title || "").toLowerCase();
  const desc = (video.description || "").toLowerCase();
  const tags = (meta.tags || []).map((t: string) => t.toLowerCase());
  const combined = `${sanitizeForPrompt(title)} ${desc} ${tags.join(" ")}`;

  try {
    const { detectGameFromLearned } = await import("./services/web-game-lookup");
    const learnedMatch = detectGameFromLearned(combined);
    if (learnedMatch && !isJunkGameName(learnedMatch)) return learnedMatch.toLowerCase();
  } catch (err: any) {
    logger.warn(`Learned game detection failed in playlist manager: ${sanitizeForPrompt(err.message)}`);
  }

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
    "destiny": ["destiny"],
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
    "assassin's creed": ["assassin's creed", "assassins creed"],
    "dragon age": ["dragon age", "inquisition", "veilguard"],
    "middle-earth": ["middle-earth", "shadow of mordor", "shadow of war"],
    "hitman": ["hitman"],
    "metal gear": ["metal gear"],
    "ratchet & clank": ["ratchet", "clank"],
    "sly cooper": ["sly cooper"],
    "fez": ["fez game"],
    "battlefield 6": ["battlefield 6", "bf6"],
  };

  for (const [game, patterns] of Object.entries(gamePatterns)) {
    if (patterns.some(p => combined.includes(p))) return game;
  }

  if (meta.contentCategory && !isJunkGameName(meta.contentCategory)) {
    return meta.contentCategory.toLowerCase();
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a gaming content classifier. Given a video title, description, and tags, identify the primary game or gaming franchise in 1-4 words. Return ONLY the game name in lowercase. Examples: "battlefield 6", "call of duty", "elden ring", "minecraft", "gta v". If it's not a game video or you cannot identify a specific real game, return "general". IMPORTANT: Never return Wikipedia article names like "list of X", "category:", "characters of", or non-game topics.`,
        },
        {
          role: "user",
          content: `Title: ${sanitizeForPrompt(video.title || "unknown")}\nDescription: ${sanitizeForPrompt((video.description || "").substring(0, 200))}\nTags: ${tags.slice(0, 10).join(", ")}`,
        },
      ],
      max_completion_tokens: 20,
    });
    const detected = (response.choices[0]?.message?.content?.trim() || "general").toLowerCase();
    if (!isJunkGameName(detected) && detected !== "general" && detected.length >= 2) {
      try {
        const { persistGameToDatabase } = await import("./services/web-game-lookup");
        await persistGameToDatabase(detected, "playlist-ai-detect");
      } catch (err: any) {
        logger.warn(`Playlist game persist failed for "${detected}": ${sanitizeForPrompt(err.message)}`);
      }
      return detected;
    }
    return "general";
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

async function findExistingGamePlaylist(
  userId: string,
  gameName: string,
  playlistType: PlaylistType,
  channelId: number
): Promise<GamePlaylistMapping | null> {
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
    return meta.gameName === normalizedGame;
  });

  if (!match) return null;

  return {
    gameName: normalizedGame,
    playlistType,
    playlistId: match.id,
    youtubePlaylistId: match.youtubePlaylistId,
  };
}

async function createGamePlaylist(
  userId: string,
  gameName: string,
  playlistType: PlaylistType,
  channelId: number
): Promise<GamePlaylistMapping> {
  const normalizedGame = gameName.toLowerCase().trim();
  const strategy = playlistType === "longform" ? "game-longform" : "game-shorts";
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
    },
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

async function getOrCreateGamePlaylist(
  userId: string,
  gameName: string,
  playlistType: PlaylistType,
  channelId: number
): Promise<GamePlaylistMapping> {
  const existing = await findExistingGamePlaylist(userId, gameName, playlistType, channelId);
  if (existing) return existing;
  return createGamePlaylist(userId, gameName, playlistType, channelId);
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

export async function deleteYouTubePlaylist(channelId: number, youtubePlaylistId: string): Promise<boolean> {
  try {
    const { getAuthenticatedClient } = await import("./youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    await youtube.playlists.delete({ id: youtubePlaylistId });
    logger.info("Deleted YouTube playlist", { youtubePlaylistId });
    return true;
  } catch (err) {
    logger.warn("Could not delete YouTube playlist (may not exist)", { youtubePlaylistId, error: String(err) });
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

async function assignVideoToPlaylistRecord(
  mapping: GamePlaylistMapping,
  video: any,
  channelId: number
): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  const youtubeId = meta.youtubeId;
  if (!youtubeId) return false;

  if (await isVideoInPlaylist(mapping.playlistId, video.id)) {
    await db.update(videos).set({
      metadata: { ...meta, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
    }).where(eq(videos.id, video.id));
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
      videoId: video.id,
      position,
      addedAt: new Date(),
    });
  } catch (insertErr: any) {
    if (insertErr.code === "23505") {
      logger.info("Playlist item already exists (concurrent insert), skipping", { playlistId: mapping.playlistId, videoId: video.id });
    } else {
      throw insertErr;
    }
  }

  await db.update(managedPlaylists).set({
    videoCount: sql`${managedPlaylists.videoCount} + 1`,
    lastUpdatedAt: new Date(),
  }).where(eq(managedPlaylists.id, mapping.playlistId));

  await db.update(videos).set({
    metadata: { ...meta, detectedGame: mapping.gameName, playlistAssigned: true, assignedPlaylistId: mapping.playlistId },
  }).where(eq(videos.id, video.id));

  return true;
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

    const existingCountBefore = await db.select({ count: sql<number>`count(*)::int` })
      .from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));
    const beforeCount = existingCountBefore[0]?.count || 0;

    for (const channel of ytChannels) {
      const channelVids = await db.select().from(videos)
        .where(eq(videos.channelId, channel.id))
        .orderBy(desc(videos.createdAt))
        .limit(PLAYLIST_BATCH_LIMIT * 4);

      const unassigned = channelVids.filter(v => {
        const meta = (v.metadata as any) || {};
        return !meta.playlistAssigned && meta.youtubeId;
      });

      if (unassigned.length === 0) continue;

      type GroupEntry = { video: any; playlistType: PlaylistType };
      const groups = new Map<string, GroupEntry[]>();

      for (const video of unassigned) {
        const gameName = await detectGameFromVideo(video);
        if (isJunkGameName(gameName)) {
          logger.debug("Skipping junk game name — no playlist", { videoId: video.id, game: gameName });
          continue;
        }

        const meta = (video.metadata as any) || {};
        const isShort = video.type === "short" || video.type === "shorts" ||
          video.type === "short_video" ||
          (meta.duration && parseDuration(meta.duration) <= 60);
        const playlistType: PlaylistType = isShort ? "shorts" : "longform";
        const key = `${gameName}::${playlistType}`;

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ video, playlistType });
      }

      for (const [key, group] of groups) {
        if (assigned >= PLAYLIST_BATCH_LIMIT) break;

        const [gameName] = key.split("::");
        const playlistType = group[0].playlistType;

        const existingMapping = await findExistingGamePlaylist(userId, gameName, playlistType, channel.id);

        if (!existingMapping && group.length < 2) {
          logger.debug("Deferred playlist creation — only 1 video for game", {
            gameName, playlistType, videoId: group[0].video.id
          });
          continue;
        }

        let mapping: GamePlaylistMapping;
        if (existingMapping) {
          mapping = existingMapping;
        } else {
          mapping = await createGamePlaylist(userId, gameName, playlistType, channel.id);
        }

        for (const { video } of group) {
          if (assigned >= PLAYLIST_BATCH_LIMIT) break;
          const ok = await assignVideoToPlaylistRecord(mapping, video, channel.id);
          if (ok) {
            assigned++;
            logger.info("Assigned video to playlist", {
              videoId: video.id, title: video.title, game: gameName,
              type: playlistType, playlistId: mapping.playlistId
            });
          }
        }
      }
    }

    const existingCountAfter = await db.select({ count: sql<number>`count(*)::int` })
      .from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));
    playlistsCreated = (existingCountAfter[0]?.count || 0) - beforeCount;

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

    let gameName = meta.detectedGame || meta.gameName;
    if (!gameName || isJunkGameName(gameName)) {
      gameName = await detectGameFromVideo(video);
      await db.update(videos).set({
        metadata: { ...meta, detectedGame: gameName },
      }).where(eq(videos.id, videoId));
    }

    if (isJunkGameName((gameName || "").toLowerCase().trim())) {
      logger.info("Skipping junk/unidentified video — no playlist", { videoId, game: gameName });
      return false;
    }

    const isShort = video.type === "short" || video.type === "shorts" ||
      (meta.duration && parseDuration(meta.duration) <= 60);
    const playlistType: PlaylistType = isShort ? "shorts" : "longform";

    const existingMapping = await findExistingGamePlaylist(userId, gameName, playlistType, channelId);

    if (!existingMapping) {
      const strategy = playlistType === "longform" ? "game-longform" : "game-shorts";
      const sameGameVids = await db.select({ count: sql<number>`count(*)::int` })
        .from(videos)
        .where(and(
          eq(videos.channelId, channelId),
          sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
          sql`lower(trim(coalesce(${videos.metadata}->>'detectedGame', ${videos.metadata}->>'gameName', ''))) = ${gameName.toLowerCase().trim()}`,
        ));

      const existingVideoCount = sameGameVids[0]?.count || 0;
      if (existingVideoCount < 2) {
        logger.info("Deferred playlist creation — waiting for 2nd video", {
          videoId, gameName, playlistType, existingCount: existingVideoCount
        });
        return false;
      }
    }

    const mapping = await getOrCreateGamePlaylist(userId, gameName, playlistType, channelId);
    const ok = await assignVideoToPlaylistRecord(mapping, video, channelId);

    if (ok) {
      logger.info("Assigned new clip to playlist", {
        videoId, game: gameName, type: playlistType, playlistId: mapping.playlistId
      });
    }

    return ok;
  } catch (err) {
    logger.error("Single video playlist assignment failed", { videoId, error: String(err) });
    return false;
  }
}

export async function autoAssignVideoToPlaylist(userId: string, videoId: number, gameName: string): Promise<boolean> {
  try {
    const userChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
    if (userChannels.length === 0) {
      logger.warn("No YouTube channel found for auto playlist assignment", { userId });
      return false;
    }
    const channelId = userChannels[0].id;

    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) return false;

    const meta = (video.metadata as any) || {};
    if (!meta.detectedGame || meta.detectedGame === "general" || isJunkGameName(meta.detectedGame)) {
      await db.update(videos).set({
        metadata: { ...meta, detectedGame: gameName },
      }).where(eq(videos.id, videoId));
    }

    return await assignSingleVideoToPlaylist(userId, videoId, channelId);
  } catch (err) {
    logger.error("Auto playlist assignment failed", { userId, videoId, gameName, error: String(err) });
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

export async function runPlaylistCleanupForAllUsers(): Promise<void> {
  const userRows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(and(eq(channels.platform, "youtube"), isNotNull(channels.userId)));

  for (const row of userRows) {
    if (!row.userId) continue;
    try {
      const result = await cleanupOrphanedPlaylists(row.userId);
      if (result.deleted > 0 || result.merged > 0) {
        logger.info("Playlist cleanup completed for user", { userId: row.userId, ...result });
      }
    } catch (err) {
      logger.error("Playlist cleanup failed for user", { userId: row.userId, error: String(err) });
    }
  }
}

export async function cleanupOrphanedPlaylists(userId: string): Promise<{
  deleted: number;
  merged: number;
  youtubeDeleted: number;
}> {
  let deleted = 0;
  let merged = 0;
  let youtubeDeleted = 0;

  logger.info("[PlaylistCleanup] Starting orphaned playlist cleanup", { userId });

  try {
    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.platform, "youtube"), eq(channels.userId, userId)));
    const channelId = ytChannels[0]?.id;

    const allPlaylists = await db.select().from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));

    const titleStrategyGroups = new Map<string, typeof allPlaylists>();
    for (const p of allPlaylists) {
      const key = `${p.title}::${p.strategy}`;
      if (!titleStrategyGroups.has(key)) titleStrategyGroups.set(key, []);
      titleStrategyGroups.get(key)!.push(p);
    }

    for (const [key, group] of titleStrategyGroups) {
      if (group.length <= 1) continue;

      group.sort((a, b) => (b.videoCount || 0) - (a.videoCount || 0));
      const canonical = group[0];
      const duplicates = group.slice(1);

      for (const dup of duplicates) {
        const existingItems = await db.select().from(playlistItems)
          .where(eq(playlistItems.playlistId, dup.id));

        for (const item of existingItems) {
          if (!item.videoId) continue;
          const alreadyInCanonical = await isVideoInPlaylist(canonical.id, item.videoId);
          if (!alreadyInCanonical) {
            const pos = await db.select({ count: sql<number>`count(*)::int` })
              .from(playlistItems)
              .where(eq(playlistItems.playlistId, canonical.id));
            await db.insert(playlistItems).values({
              playlistId: canonical.id,
              videoId: item.videoId,
              position: pos[0]?.count || 0,
              addedAt: new Date(),
            }).onConflictDoNothing();
            await db.update(managedPlaylists)
              .set({ videoCount: sql`${managedPlaylists.videoCount} + 1`, lastUpdatedAt: new Date() })
              .where(eq(managedPlaylists.id, canonical.id));
          }
        }

        await db.update(videos).set({
          metadata: sql`jsonb_set(metadata, '{assignedPlaylistId}', ${canonical.id}::text::jsonb)`,
        }).where(sql`${videos.metadata}->>'assignedPlaylistId' = ${String(dup.id)}`);

        if (dup.youtubePlaylistId && channelId) {
          const ytOk = await deleteYouTubePlaylist(channelId, dup.youtubePlaylistId);
          if (ytOk) youtubeDeleted++;
        }

        await db.delete(playlistItems).where(eq(playlistItems.playlistId, dup.id));
        await db.delete(managedPlaylists).where(eq(managedPlaylists.id, dup.id));
        merged++;
        logger.info("[PlaylistCleanup] Merged duplicate playlist", {
          duplicate: dup.id, canonical: canonical.id, title: dup.title
        });
      }
    }

    const remainingPlaylists = await db.select().from(managedPlaylists)
      .where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.autoManaged, true)));

    for (const playlist of remainingPlaylists) {
      const itemCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, playlist.id));
      const actualCount = itemCount[0]?.count || 0;

      const isJunkTitle = isJunkGameName((playlist.metadata as any)?.gameName || "");

      if (actualCount < 2 || isJunkTitle) {
        if (playlist.youtubePlaylistId && channelId) {
          const ytOk = await deleteYouTubePlaylist(channelId, playlist.youtubePlaylistId);
          if (ytOk) youtubeDeleted++;
        }

        await db.update(videos).set({
          metadata: sql`metadata - 'playlistAssigned' - 'assignedPlaylistId'`,
        }).where(sql`${videos.metadata}->>'assignedPlaylistId' = ${String(playlist.id)}`);

        await db.delete(playlistItems).where(eq(playlistItems.playlistId, playlist.id));
        await db.delete(managedPlaylists).where(eq(managedPlaylists.id, playlist.id));
        deleted++;
        logger.info("[PlaylistCleanup] Deleted thin/junk playlist", {
          id: playlist.id, title: playlist.title, actualCount, isJunkTitle
        });
      }
    }

    logger.info("[PlaylistCleanup] Complete", { userId, deleted, merged, youtubeDeleted });
  } catch (err) {
    logger.error("[PlaylistCleanup] Failed", { userId, error: String(err) });
  }

  return { deleted, merged, youtubeDeleted };
}
