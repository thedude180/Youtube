import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, parseNumericId, asyncHandler } from "./helpers";
import type { StudioVideo } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { fetchChannelCTR } from "../services/youtube-analytics";
import * as fs from "fs";
import * as path from "path";

const logger = createLogger("studio-routes");

const STUDIO_DIR = path.resolve(process.cwd(), "data", "studio");
if (!fs.existsSync(STUDIO_DIR)) {
  fs.mkdirSync(STUDIO_DIR, { recursive: true });
}

type StudioMeta = NonNullable<StudioVideo["metadata"]>;

function getMeta(video: StudioVideo): StudioMeta {
  return (video.metadata ?? {}) as StudioMeta;
}

function mergeMeta(existing: StudioMeta, partial: Partial<StudioMeta>): StudioMeta {
  return { ...existing, ...partial };
}

async function freshMergeMeta(studioVideoId: number, partial: Partial<StudioMeta>): Promise<StudioMeta> {
  const fresh = await storage.getStudioVideo(studioVideoId);
  const currentMeta = fresh ? getMeta(fresh) : {};
  return mergeMeta(currentMeta, partial);
}

async function verifyChannelOwnership(channelId: number, userId: string): Promise<boolean> {
  const channel = await storage.getChannel(channelId);
  return !!channel && channel.userId === userId;
}

const endScreenElementSchema = z.object({
  type: z.enum(["video", "playlist", "subscribe", "channel", "link"]),
  position: z.string(),
  timing: z.string(),
  text: z.string().optional(),
  enabled: z.boolean(),
});

const metadataUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  privacyStatus: z.string().optional(),
  customThumbnail: z.string().optional(),
  thumbnailPrompt: z.string().optional(),
  endScreen: z.object({
    enabled: z.boolean(),
    elements: z.array(endScreenElementSchema),
  }).optional(),
  seoScore: z.number().optional(),
  gameName: z.string().optional(),
}).strict();

export function registerStudioRoutes(app: Express) {
  app.get("/api/studio/videos", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const studioVids = await storage.getStudioVideos(userId);
    res.json(studioVids);
  }));

  app.get("/api/studio/edit-copies", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getEditCopiesForUser } = await import("../services/stream-vod-copier");
    const copies = await getEditCopiesForUser(userId);
    res.json(copies);
  }));

  app.get("/api/studio/videos/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;
    const video = await storage.getStudioVideo(id);
    if (!video || video.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }
    res.json(video);
  }));

  app.get("/api/studio/videos/:id/stream", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;
    const video = await storage.getStudioVideo(id);
    if (!video || video.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }
    if (!video.filePath || !fs.existsSync(video.filePath)) {
      return res.status(404).json({ error: "Video file not available. Download it first." });
    }

    const stat = fs.statSync(video.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(video.filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      });
      fs.createReadStream(video.filePath).pipe(res);
    }
  }));

  app.post("/api/studio/videos/import", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      videoId: z.number(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const video = await storage.getVideo(parsed.data.videoId);
    if (!video) {
      return res.status(404).json({ error: "Source video not found" });
    }

    if (!video.channelId) {
      return res.status(403).json({ error: "Cannot import video without channel association" });
    }

    const isChannelOwner = await verifyChannelOwnership(video.channelId, userId);
    if (!isChannelOwner) {
      return res.status(404).json({ error: "Source video not found" });
    }

    const existingStudioVideos = await storage.getStudioVideos(userId);
    const alreadyImported = existingStudioVideos.find(sv => sv.videoId === video.id);
    if (alreadyImported) {
      return res.status(409).json({ error: "This video has already been imported to Studio", studioVideoId: alreadyImported.id });
    }

    const sourceMeta = (video.metadata as Record<string, unknown>) || {};
    const youtubeId = sourceMeta.youtubeId as string | undefined;

    const endScreenSource = sourceMeta.endScreen as StudioMeta["endScreen"] | undefined;
    const endScreen: StudioMeta["endScreen"] = endScreenSource || {
      enabled: true,
      elements: [
        { type: "video", position: "bottom-left", timing: "last 20 seconds", text: "Watch Next", enabled: true },
        { type: "playlist", position: "bottom-right", timing: "last 20 seconds", text: "More Videos", enabled: true },
        { type: "subscribe", position: "top-right", timing: "last 15 seconds", text: "Subscribe", enabled: true },
      ],
    };

    const endScreenWithEnabled: StudioMeta["endScreen"] = {
      ...endScreen!,
      elements: (endScreen!.elements || []).map((el) => ({
        ...el,
        enabled: el.enabled !== undefined ? el.enabled : true,
      })),
    };

    const studioVideo = await storage.createStudioVideo({
      userId,
      videoId: video.id,
      youtubeId: youtubeId || null,
      title: video.title,
      description: video.description || "",
      thumbnailUrl: video.thumbnailUrl || null,
      duration: (sourceMeta.duration as string) || null,
      status: "ready",
      filePath: null,
      fileSize: null,
      metadata: {
        tags: (sourceMeta.tags as string[]) || [],
        categoryId: (sourceMeta.categoryId as string) || "22",
        privacyStatus: (sourceMeta.privacyStatus as string) || "public",
        channelId: video.channelId || undefined,
        endScreen: endScreenWithEnabled,
        seoScore: (sourceMeta.seoScore as number) || (sourceMeta.optimizationScore as number) || undefined,
      },
    });

    res.json(studioVideo);
  }));

  app.post("/api/studio/videos/download", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const schema = z.object({
      studioVideoId: z.number(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const studioVideo = await storage.getStudioVideo(parsed.data.studioVideoId);
    if (!studioVideo || studioVideo.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    if (!studioVideo.youtubeId) {
      return res.status(400).json({ error: "No YouTube ID for download" });
    }

    const meta = getMeta(studioVideo);
    await storage.updateStudioVideo(studioVideo.id, {
      status: "downloading",
      metadata: mergeMeta(meta, { downloadProgress: 0 }),
    });

    (async () => {
      try {
        const { downloadSourceVideo } = await import("../clip-video-processor");
        const filePath = await downloadSourceVideo(studioVideo.youtubeId!, userId);
        const stats = fs.statSync(filePath);

        const persistentPath = path.join(STUDIO_DIR, `studio_${studioVideo.id}_${studioVideo.youtubeId}.mp4`);
        fs.copyFileSync(filePath, persistentPath);

        await storage.updateStudioVideo(studioVideo.id, {
          status: "ready",
          filePath: persistentPath,
          fileSize: stats.size,
          metadata: await freshMergeMeta(studioVideo.id, { downloadProgress: 100 }),
        });

        logger.info("Studio video downloaded", { studioVideoId: studioVideo.id, size: stats.size });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("Studio video download failed", { studioVideoId: studioVideo.id, error: errMsg });
        await storage.updateStudioVideo(studioVideo.id, {
          status: "error",
          metadata: await freshMergeMeta(studioVideo.id, { downloadProgress: 0, publishStatus: `Download failed: ${errMsg}` }),
        });
      }
    })();

    res.json({ message: "Download started", studioVideoId: studioVideo.id });
  }));

  app.put("/api/studio/videos/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;

    const existing = await storage.getStudioVideo(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      metadata: metadataUpdateSchema.optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const updates: Partial<Pick<StudioVideo, "title" | "description" | "metadata">> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.metadata !== undefined) {
      const existingMeta = getMeta(existing);
      updates.metadata = mergeMeta(existingMeta, parsed.data.metadata);
    }

    const updated = await storage.updateStudioVideo(id, updates);
    res.json(updated);
  }));

  app.post("/api/studio/videos/:id/thumbnail/upload", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;

    const studioVideo = await storage.getStudioVideo(id);
    if (!studioVideo || studioVideo.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    const schema = z.object({
      imageData: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid image data. Must be a base64 data URL (JPEG, PNG, or WebP)." });
    }

    const base64Data = parsed.data.imageData.split(",")[1];
    const thumbBuffer = Buffer.from(base64Data, "base64");

    if (thumbBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Thumbnail too large. Maximum 5MB." });
    }

    const sharp = (await import("sharp")).default;
    const jpegBuffer = await sharp(thumbBuffer)
      .resize(1280, 720, { fit: "cover", position: "center" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const thumbnailPath = path.join(STUDIO_DIR, `thumb_${id}_${Date.now()}.jpg`);
    fs.writeFileSync(thumbnailPath, jpegBuffer);

    const base64Result = jpegBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64Result}`;

    const meta = getMeta(studioVideo);
    await storage.updateStudioVideo(id, {
      metadata: mergeMeta(meta, { customThumbnail: dataUrl }),
    });

    res.json({ thumbnail: { url: dataUrl, source: "upload" } });
  }));

  app.post("/api/studio/videos/:id/thumbnail/generate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;

    const studioVideo = await storage.getStudioVideo(id);
    if (!studioVideo || studioVideo.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    const schema = z.object({
      prompt: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);

    try {
      const { generateThumbnailPrompt: genPrompt } = await import("../ai-engine");
      const promptToUse = parsed.data?.prompt || await genPrompt({
        title: studioVideo.title,
        description: studioVideo.description || undefined,
      });

      const { generateImageBuffer } = await import("../replit_integrations/image/client");
      const imageBuffer = await generateImageBuffer(promptToUse, "1536x1024");

      if (!imageBuffer || imageBuffer.length < 1000) {
        return res.status(500).json({ error: "Image generation failed" });
      }

      const sharp = (await import("sharp")).default;
      const jpegBuffer = await sharp(imageBuffer)
        .resize(1280, 720, { fit: "cover", position: "center" })
        .jpeg({ quality: 85 })
        .toBuffer();

      const thumbnailPath = path.join(STUDIO_DIR, `thumb_${id}_${Date.now()}.jpg`);
      fs.writeFileSync(thumbnailPath, jpegBuffer);

      const base64 = jpegBuffer.toString("base64");
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      const meta = getMeta(studioVideo);
      const existingOptions = meta.thumbnailOptions || [];

      const ctrData = await fetchChannelCTR(userId).catch(() => ({ ctr: null, impressions: 0, source: "none" as const }));
      const predictedCtr = ctrData.ctr ?? undefined;

      existingOptions.push({
        url: dataUrl,
        prompt: promptToUse,
        ...(predictedCtr != null ? { predictedCtr } : {}),
      });

      await storage.updateStudioVideo(id, {
        metadata: mergeMeta(meta, {
          thumbnailOptions: existingOptions,
          thumbnailPrompt: promptToUse,
        }),
      });

      res.json({
        thumbnail: {
          url: dataUrl,
          prompt: promptToUse,
          ...(predictedCtr != null ? { predictedCtr } : {}),
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("Thumbnail generation failed", { id, error: errMsg });
      res.status(500).json({ error: `Thumbnail generation failed: ${errMsg}` });
    }
  }));

  app.post("/api/studio/videos/:id/publish", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;

    const studioVideo = await storage.getStudioVideo(id);
    if (!studioVideo || studioVideo.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    const meta = getMeta(studioVideo);
    const channelId = meta.channelId;

    if (!channelId) {
      return res.status(400).json({ error: "No channel associated with this video" });
    }

    const isOwner = await verifyChannelOwnership(channelId, userId);
    if (!isOwner) {
      return res.status(403).json({ error: "You do not own this channel" });
    }

    const hasLocalFile = studioVideo.filePath && fs.existsSync(studioVideo.filePath);

    if (!studioVideo.youtubeId && !hasLocalFile) {
      return res.status(400).json({ error: "No YouTube video ID or local file to publish" });
    }

    await storage.updateStudioVideo(id, {
      status: "publishing",
      metadata: mergeMeta(meta, { publishProgress: 10, publishStatus: "Starting publish..." }),
    });

    res.json({ message: "Publish started", studioVideoId: id });

    (async () => {
      try {
        const { getAuthenticatedClient } = await import("../youtube");
        const { google } = await import("googleapis");

        const { oauth2Client } = await getAuthenticatedClient(channelId);
        const youtube = google.youtube({ version: "v3", auth: oauth2Client });

        const { removeBannedPhrases } = await import("../stealth-guardrails");
        const cleanTitle = removeBannedPhrases(studioVideo.title).slice(0, 100);
        const cleanDescription = removeBannedPhrases(studioVideo.description || "").slice(0, 5000);
        const cleanTags = (meta.tags || []).map((t: string) => removeBannedPhrases(t)).filter(Boolean).slice(0, 500);

        let publishedVideoId = studioVideo.youtubeId;

        if (hasLocalFile) {
          await storage.updateStudioVideo(id, {
            metadata: await freshMergeMeta(id, { publishProgress: 20, publishStatus: "Uploading video to YouTube..." }),
          });

          const fileStream = fs.createReadStream(studioVideo.filePath!);
          const uploadResponse = await youtube.videos.insert({
            part: ["snippet", "status"],
            requestBody: {
              snippet: {
                title: cleanTitle,
                description: cleanDescription,
                tags: cleanTags,
                categoryId: meta.categoryId || "22",
              },
              status: {
                privacyStatus: meta.privacyStatus || "public",
              },
            },
            media: {
              mimeType: "video/mp4",
              body: fileStream,
            },
          });

          publishedVideoId = uploadResponse.data.id || publishedVideoId;
          logger.info("Video uploaded to YouTube", { id, youtubeId: publishedVideoId });

          await storage.updateStudioVideo(id, {
            youtubeId: publishedVideoId,
            metadata: await freshMergeMeta(id, { publishProgress: 50, publishStatus: "Video uploaded, updating metadata..." }),
          });
        } else if (studioVideo.youtubeId) {
          await storage.updateStudioVideo(id, {
            metadata: await freshMergeMeta(id, { publishProgress: 30, publishStatus: "Updating metadata..." }),
          });

          await youtube.videos.update({
            part: ["snippet"],
            requestBody: {
              id: studioVideo.youtubeId,
              snippet: {
                title: cleanTitle,
                description: cleanDescription,
                tags: cleanTags,
                categoryId: meta.categoryId || "22",
              },
            },
          });
        }

        await storage.updateStudioVideo(id, {
          metadata: await freshMergeMeta(id, { publishProgress: 60, publishStatus: "Uploading thumbnail..." }),
        });

        const latestMeta = await freshMergeMeta(id, {});
        const selectedThumb = latestMeta.customThumbnail || (latestMeta.thumbnailOptions?.[0]?.url);
        if (selectedThumb && selectedThumb.startsWith("data:image") && publishedVideoId) {
          try {
            const base64Data = selectedThumb.split(",")[1];
            const thumbBuffer = Buffer.from(base64Data, "base64");

            const { setYouTubeThumbnail } = await import("../youtube");
            await setYouTubeThumbnail(channelId, publishedVideoId, thumbBuffer, "image/jpeg");
          } catch (thumbErr: unknown) {
            const thumbMsg = thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
            logger.warn("Thumbnail upload failed during publish", { id, error: thumbMsg });
          }
        }

        await storage.updateStudioVideo(id, {
          metadata: await freshMergeMeta(id, { publishProgress: 80, publishStatus: "Saving end screen config..." }),
        });

        if (latestMeta.endScreen && publishedVideoId) {
          logger.info("End screen configuration saved with publish", {
            id,
            youtubeId: publishedVideoId,
            elementCount: latestMeta.endScreen.elements?.length ?? 0,
            enabledCount: latestMeta.endScreen.elements?.filter(e => e.enabled).length ?? 0,
          });
        }

        await storage.updateStudioVideo(id, {
          metadata: await freshMergeMeta(id, { publishProgress: 90, publishStatus: "Finalizing..." }),
        });

        if (studioVideo.videoId) {
          const sourceVideo = await storage.getVideo(studioVideo.videoId);
          if (sourceVideo) {
            const sourceMeta = (sourceVideo.metadata as Record<string, unknown>) || {};
            const finalMeta = await freshMergeMeta(id, {});
            await storage.updateVideo(studioVideo.videoId, {
              title: studioVideo.title,
              description: studioVideo.description || undefined,
              metadata: {
                ...sourceMeta,
                tags: finalMeta.tags ?? [],
                endScreen: finalMeta.endScreen,
                studioPublishedAt: new Date().toISOString(),
              } as any,
            });
          }
        }

        await storage.updateStudioVideo(id, {
          status: "published",
          metadata: await freshMergeMeta(id, {
            publishProgress: 100,
            publishStatus: "Published successfully",
            publishedYoutubeId: publishedVideoId ?? undefined,
          }),
        });

        logger.info("Studio video published", { id, youtubeId: publishedVideoId });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("Publish failed", { id, error: errMsg });
        await storage.updateStudioVideo(id, {
          status: "error",
          metadata: await freshMergeMeta(id, { publishProgress: 0, publishStatus: `Publish failed: ${errMsg}` }),
        });
      }
    })();
  }));

  app.delete("/api/studio/videos/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (!id) return;

    const studioVideo = await storage.getStudioVideo(id);
    if (!studioVideo || studioVideo.userId !== userId) {
      return res.status(404).json({ error: "Studio video not found" });
    }

    if (studioVideo.filePath && fs.existsSync(studioVideo.filePath)) {
      try {
        fs.unlinkSync(studioVideo.filePath);
      } catch (unlinkErr: unknown) {
        const msg = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
        logger.warn("Failed to delete studio file", { id, filePath: studioVideo.filePath, error: msg });
      }
    }

    await storage.deleteStudioVideo(id);
    res.json({ message: "Studio video deleted" });
  }));
}
