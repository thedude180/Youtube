import fs from "fs";
import path from "path";
import { createLogger } from "../lib/logger";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

const logger = createLogger("vault-object-storage");

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function isObjectStorageAvailable(): boolean {
  return !!(process.env.PRIVATE_OBJECT_DIR && process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);
}

function getBucketAndObjectName(youtubeId: string): { bucketName: string; objectName: string } | null {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) return null;
  const parts = privateDir.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  if (!bucketName) return null;
  return { bucketName, objectName: `vault/${youtubeId}.mp4` };
}

export async function uploadVaultFileToStorage(youtubeId: string, localFilePath: string): Promise<boolean> {
  if (!isObjectStorageAvailable()) return false;
  if (!fs.existsSync(localFilePath)) return false;

  const loc = getBucketAndObjectName(youtubeId);
  if (!loc) return false;

  try {
    const bucket = objectStorageClient.bucket(loc.bucketName);
    await bucket.upload(localFilePath, {
      destination: loc.objectName,
      metadata: { contentType: "video/mp4" },
    });
    logger.info(`[VaultStorage] Archived ${youtubeId} → gs://${loc.bucketName}/${loc.objectName}`);
    return true;
  } catch (err: any) {
    logger.warn(`[VaultStorage] Upload failed for ${youtubeId}: ${err.message}`);
    return false;
  }
}

export async function vaultFileExistsInStorage(youtubeId: string): Promise<boolean> {
  if (!isObjectStorageAvailable()) return false;
  const loc = getBucketAndObjectName(youtubeId);
  if (!loc) return false;
  try {
    const [exists] = await objectStorageClient.bucket(loc.bucketName).file(loc.objectName).exists();
    return exists;
  } catch {
    return false;
  }
}

export async function downloadVaultFileFromStorage(youtubeId: string, localDestPath: string): Promise<boolean> {
  if (!isObjectStorageAvailable()) return false;
  const loc = getBucketAndObjectName(youtubeId);
  if (!loc) return false;
  try {
    const file = objectStorageClient.bucket(loc.bucketName).file(loc.objectName);
    const [exists] = await file.exists();
    if (!exists) return false;

    const dir = path.dirname(localDestPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await file.download({ destination: localDestPath });
    const stat = fs.statSync(localDestPath);
    if (stat.size < 1000) {
      fs.unlinkSync(localDestPath);
      return false;
    }
    logger.info(`[VaultStorage] Restored ${youtubeId} from cloud (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    return true;
  } catch (err: any) {
    logger.warn(`[VaultStorage] Download from storage failed for ${youtubeId}: ${err.message}`);
    return false;
  }
}

export async function getVaultFileSignedUrl(youtubeId: string, ttlSeconds: number = 86400): Promise<string | null> {
  if (!isObjectStorageAvailable()) return null;
  const loc = getBucketAndObjectName(youtubeId);
  if (!loc) return null;
  try {
    const file = objectStorageClient.bucket(loc.bucketName).file(loc.objectName);
    const [exists] = await file.exists();
    if (!exists) return null;

    const request = {
      bucket_name: loc.bucketName,
      object_name: loc.objectName,
      method: "GET",
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) return null;
    const { signed_url } = await response.json() as { signed_url: string };
    return signed_url;
  } catch (err: any) {
    logger.warn(`[VaultStorage] Signed URL failed for ${youtubeId}: ${err.message}`);
    return null;
  }
}

export async function getVaultStorageStats(): Promise<{ totalFiles: number; totalBytes: number } | null> {
  if (!isObjectStorageAvailable()) return null;
  const loc = getBucketAndObjectName("_check");
  if (!loc) return null;
  try {
    const bucket = objectStorageClient.bucket(loc.bucketName);
    const [files] = await bucket.getFiles({ prefix: "vault/" });
    const totalBytes = files.reduce((sum, f) => sum + Number((f.metadata as any).size || 0), 0);
    return { totalFiles: files.length, totalBytes };
  } catch {
    return null;
  }
}
