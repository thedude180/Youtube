/**
 * Storage adapter — abstracts file I/O behind a common interface.
 *
 * Backend is chosen at startup based on env vars:
 *   S3  — when S3_ENDPOINT + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET are set
 *   Local disk — otherwise (uses vault/ directory)
 *
 * Only the vault/video download pipeline uses this; the rest of the app talks
 * directly to the database.
 */

import fs from "fs/promises";
import path from "path";
import { createLogger } from "./logger.js";

const log = createLogger("storage-adapter");

export interface StorageAdapter {
  /** Write a buffer to storage. Returns the storage key/path. */
  put(key: string, data: Buffer, contentType?: string): Promise<string>;
  /** Read a file from storage. Returns null if not found. */
  get(key: string): Promise<Buffer | null>;
  /** Delete a file. No-op if not found. */
  del(key: string): Promise<void>;
  /** Returns a publicly accessible URL for the given key, or null if not applicable. */
  publicUrl(key: string): string | null;
}

// ─── Local disk adapter ───────────────────────────────────────────────────────

const vaultDir = path.resolve(process.cwd(), "vault");

const localAdapter: StorageAdapter = {
  async put(key, data) {
    const filePath = path.join(vaultDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return filePath;
  },

  async get(key) {
    try {
      return await fs.readFile(path.join(vaultDir, key));
    } catch {
      return null;
    }
  },

  async del(key) {
    try {
      await fs.unlink(path.join(vaultDir, key));
    } catch {
      // ignore ENOENT
    }
  },

  publicUrl(_key) {
    return null; // local files are not publicly addressable
  },
};

// ─── S3-compatible adapter ────────────────────────────────────────────────────

function buildS3Adapter(): StorageAdapter {
  const endpoint = process.env.S3_ENDPOINT!;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;
  const bucket = process.env.S3_BUCKET!;

  // Lazy-import the AWS SDK so the app doesn't crash when running without it.
  let s3: any;

  async function getS3() {
    if (!s3) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      s3 = new S3Client({
        endpoint,
        region: process.env.S3_REGION ?? "auto",
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    }
    return s3;
  }

  return {
    async put(key, data, contentType = "application/octet-stream") {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3();
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }));
      return key;
    },

    async get(key) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const client = await getS3();
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch {
        return null;
      }
    },

    async del(key) {
      try {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const client = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        // ignore
      }
    },

    publicUrl(key) {
      return `${endpoint}/${bucket}/${key}`;
    },
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createAdapter(): StorageAdapter {
  const useS3 =
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET;

  if (useS3) {
    log.info("Storage backend: S3", { endpoint: process.env.S3_ENDPOINT, bucket: process.env.S3_BUCKET });
    return buildS3Adapter();
  }

  log.info("Storage backend: local disk", { dir: vaultDir });
  return localAdapter;
}

export const storage = createAdapter();
