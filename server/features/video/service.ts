import fs from "fs";
import path from "path";
import { videoRepo } from "./repository.js";
import { sseEmit } from "../../core/sse.js";
import { badRequest, notFound } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("video");

const VAULT_ROOT = process.env.VAULT_PATH ?? path.join(process.cwd(), "vault");
const MAX_VAULT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB per user

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "youtube.com" || u.hostname === "www.youtube.com" || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function getUserVaultDir(userId: string): string {
  return path.join(VAULT_ROOT, userId);
}

export class VideoService {
  async queueDownload(userId: string, url: string): Promise<{ downloadId: number }> {
    if (!isYouTubeUrl(url)) throw badRequest("Only YouTube URLs are supported");

    const youtubeId = extractYouTubeId(url) ?? undefined;
    const download = await videoRepo.createDownload({
      userId,
      youtubeUrl: url,
      youtubeId,
      status: "pending",
    });

    return { downloadId: download.id };
  }

  async processDownload(downloadId: number, userId: string): Promise<void> {
    const download = await videoRepo.findDownload(downloadId);
    if (!download || download.userId !== userId) throw notFound("Download");

    await videoRepo.updateDownload(downloadId, { status: "downloading" });
    sseEmit(userId, "video:download-start", { downloadId });

    try {
      const userDir = getUserVaultDir(userId);
      fs.mkdirSync(userDir, { recursive: true });

      // Dynamic import to avoid requiring ytdl-core at startup
      const ytdl = await import("@distube/ytdl-core");
      const info = await ytdl.default.getInfo(download.youtubeUrl);
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().substring(0, 80);
      const fileName = `${download.youtubeId ?? Date.now()}_${title}.mp4`;
      const filePath = path.join(userDir, fileName);

      await new Promise<void>((resolve, reject) => {
        const stream = ytdl.default(download.youtubeUrl, { quality: "highestvideo+bestaudio" });
        const fileStream = fs.createWriteStream(filePath);

        stream.on("progress", (_chunk, downloaded, total) => {
          const pct = Math.round((downloaded / total) * 100);
          sseEmit(userId, "video:download-progress", { downloadId, percent: pct });
        });

        stream.pipe(fileStream);
        fileStream.on("finish", resolve);
        stream.on("error", reject);
        fileStream.on("error", reject);
      });

      const stat = fs.statSync(filePath);
      await videoRepo.updateDownload(downloadId, {
        status: "complete",
        filePath,
        fileSizeBytes: stat.size,
        completedAt: new Date(),
        title,
      });

      await videoRepo.createVaultItem({
        userId,
        downloadId,
        fileName,
        filePath,
        fileSizeBytes: stat.size,
        mimeType: "video/mp4",
      });

      log.info("Download complete", { downloadId, filePath });
      sseEmit(userId, "video:download-complete", { downloadId, fileName, fileSizeBytes: stat.size });
    } catch (err: any) {
      log.error("Download failed", { downloadId, error: err.message });
      await videoRepo.updateDownload(downloadId, { status: "failed", error: err.message });
      sseEmit(userId, "video:download-failed", { downloadId, error: err.message });
      throw err;
    }
  }

  async deleteVaultItem(userId: string, vaultId: number): Promise<void> {
    const item = await videoRepo.findVaultItem(vaultId, userId);
    if (!item) throw notFound("Vault item");

    // Delete file from disk (non-fatal if already gone)
    try {
      if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
    } catch (err: any) {
      log.warn("File delete failed", { filePath: item.filePath, error: err.message });
    }

    await videoRepo.deleteVaultItem(vaultId, userId);
  }

  async clearVault(userId: string): Promise<void> {
    if (process.env.NODE_ENV === "production") return; // never auto-clear in prod
    const userDir = getUserVaultDir(userId);
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
      log.info("Vault cleared (dev)", { userId });
    }
  }
}

export const videoService = new VideoService();
