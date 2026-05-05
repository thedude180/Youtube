/**
 * storage-adapter.ts
 *
 * Portable file-storage abstraction.  Concrete backends:
 *
 *   LocalDiskAdapter   — default; writes files to the local filesystem.
 *                        Works everywhere with zero configuration.
 *
 *   S3Adapter          — S3-compatible object storage (AWS S3, Cloudflare R2,
 *                        MinIO, Backblaze B2, etc.).  Activated automatically
 *                        when S3_ENDPOINT + S3_ACCESS_KEY_ID +
 *                        S3_SECRET_ACCESS_KEY + S3_BUCKET are all set.
 *
 * The factory `getStorageAdapter()` picks the right backend at runtime.
 * Callers never import a backend directly — they always call the factory.
 *
 * S3 environment variables:
 *   S3_ENDPOINT         full URL of the S3-compatible endpoint
 *                       e.g. "https://<account-id>.r2.cloudflarestorage.com"
 *   S3_ACCESS_KEY_ID    S3 / R2 access key ID
 *   S3_SECRET_ACCESS_KEY S3 / R2 secret access key
 *   S3_BUCKET           bucket name
 *   S3_REGION           optional; defaults to "auto" (correct for R2)
 *   S3_PUBLIC_URL       optional; public base URL for object links
 *                       e.g. "https://pub-<hash>.r2.dev"
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("storage-adapter");

// ── Interface ──────────────────────────────────────────────────────────────────

export interface StorageAdapter {
  /** Upload a local file to the store.  Returns the stored object key. */
  upload(localPath: string, objectKey: string, contentType?: string): Promise<string>;

  /** Download an object from the store to a local path. */
  download(objectKey: string, localDest: string): Promise<boolean>;

  /** Returns true if the object exists in the store. */
  exists(objectKey: string): Promise<boolean>;

  /** Delete an object from the store. */
  remove(objectKey: string): Promise<void>;

  /**
   * Generate a pre-signed URL valid for `ttlSeconds`.
   * Returns null if the backend does not support signed URLs.
   */
  signedUrl(objectKey: string, ttlSeconds: number): Promise<string | null>;

  /** Informational name used in log messages. */
  readonly name: string;
}

// ── Local Disk ─────────────────────────────────────────────────────────────────

export class LocalDiskAdapter implements StorageAdapter {
  readonly name = "local-disk";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  private fullPath(key: string): string {
    const normalized = key
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .join("/");

    if (!normalized || normalized.includes("..") || normalized.includes("\x00") || path.isAbsolute(key)) {
      throw new Error(`Unsafe storage key: ${key}`);
    }

    const resolved = path.resolve(this.root, normalized);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Storage path escape rejected: ${key}`);
    }

    return resolved;
  }

  async upload(localPath: string, objectKey: string): Promise<string> {
    const dest = this.fullPath(objectKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (path.resolve(localPath) !== dest) {
      fs.copyFileSync(localPath, dest);
    }
    return objectKey;
  }

  async download(objectKey: string, localDest: string): Promise<boolean> {
    const src = this.fullPath(objectKey);
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(localDest), { recursive: true });
    fs.copyFileSync(src, localDest);
    return true;
  }

  async exists(objectKey: string): Promise<boolean> {
    return fs.existsSync(this.fullPath(objectKey));
  }

  async remove(objectKey: string): Promise<void> {
    const p = this.fullPath(objectKey);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  async signedUrl(): Promise<null> {
    return null; // local disk has no signed URLs
  }
}

// ── S3-compatible ──────────────────────────────────────────────────────────────

/**
 * Lightweight S3-compatible adapter built on native `fetch`.
 * No AWS SDK dependency — uses the S3 REST API directly so the image stays slim.
 *
 * Supports: Cloudflare R2, AWS S3, MinIO, Backblaze B2.
 * Limitations: no server-side encryption params; presigned URL generation
 *              uses AWS Signature Version 4 which all S3-compatible services support.
 */
export class S3Adapter implements StorageAdapter {
  readonly name = "s3";
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicUrl: string | null;

  constructor(opts: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
    publicUrl?: string;
  }) {
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.accessKeyId = opts.accessKeyId;
    this.secretAccessKey = opts.secretAccessKey;
    this.bucket = opts.bucket;
    this.region = opts.region || "auto";
    this.publicUrl = opts.publicUrl || null;
  }

  // ── AWS SigV4 helpers ────────────────────────────────────────────────────────

  private sign(
    method: string,
    key: string,
    headers: Record<string, string>,
    payload: string | Buffer,
  ): string {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");

    const payloadHash = crypto
      .createHash("sha256")
      .update(payload)
      .digest("hex");

    headers["x-amz-date"] = amzDate;
    headers["x-amz-content-sha256"] = payloadHash;

    const signedHeaders = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .join(";");
    const canonicalHeaders = Object.entries(headers)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
      .join("\n") + "\n";

    const canonicalUri = `/${key}`;
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = [
      `AWS4${this.secretAccessKey}`,
      dateStamp,
      this.region,
      "s3",
      "aws4_request",
    ].reduce<Buffer | string>((key, data) => {
      return crypto.createHmac("sha256", key).update(data).digest();
    }, "");

    const signature = crypto
      .createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    return (
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope},` +
      `SignedHeaders=${signedHeaders},Signature=${signature}`
    );
  }

  private objectUrl(objectKey: string): string {
    return `${this.endpoint}/${this.bucket}/${objectKey}`;
  }

  async upload(localPath: string, objectKey: string, contentType = "application/octet-stream"): Promise<string> {
    const body = fs.readFileSync(localPath);
    const url = this.objectUrl(objectKey);
    const { hostname } = new URL(url);
    const headers: Record<string, string> = {
      "host": hostname,
      "content-type": contentType,
    };
    const auth = this.sign("PUT", `${this.bucket}/${objectKey}`, headers, body);
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, Authorization: auth },
      body,
    });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
    logger.info(`[S3] Uploaded ${objectKey} to ${this.bucket}`);
    return objectKey;
  }

  async download(objectKey: string, localDest: string): Promise<boolean> {
    const url = this.objectUrl(objectKey);
    const { hostname } = new URL(url);
    const headers: Record<string, string> = { "host": hostname };
    const auth = this.sign("GET", `${this.bucket}/${objectKey}`, headers, "");
    const res = await fetch(url, { headers: { ...headers, Authorization: auth } });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`S3 download failed: ${res.status}`);
    fs.mkdirSync(path.dirname(localDest), { recursive: true });
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localDest, buf);
    return true;
  }

  async exists(objectKey: string): Promise<boolean> {
    const url = this.objectUrl(objectKey);
    const { hostname } = new URL(url);
    const headers: Record<string, string> = { "host": hostname };
    const auth = this.sign("HEAD", `${this.bucket}/${objectKey}`, headers, "");
    const res = await fetch(url, { method: "HEAD", headers: { ...headers, Authorization: auth } });
    return res.ok;
  }

  async remove(objectKey: string): Promise<void> {
    const url = this.objectUrl(objectKey);
    const { hostname } = new URL(url);
    const headers: Record<string, string> = { "host": hostname };
    const auth = this.sign("DELETE", `${this.bucket}/${objectKey}`, headers, "");
    await fetch(url, { method: "DELETE", headers: { ...headers, Authorization: auth } });
  }

  async signedUrl(objectKey: string, ttlSeconds: number): Promise<string> {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;

    const baseUrl = this.publicUrl
      ? `${this.publicUrl}/${objectKey}`
      : `${this.endpoint}/${this.bucket}/${objectKey}`;

    const params = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(ttlSeconds),
      "X-Amz-SignedHeaders": "host",
    });

    const { hostname } = new URL(baseUrl);
    const canonicalRequest = [
      "GET",
      `/${objectKey}`,
      params.toString(),
      `host:${hostname}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = [
      `AWS4${this.secretAccessKey}`,
      dateStamp,
      this.region,
      "s3",
      "aws4_request",
    ].reduce<Buffer | string>((key, data) => {
      return crypto.createHmac("sha256", key).update(data).digest();
    }, "");

    const signature = crypto
      .createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    params.append("X-Amz-Signature", signature);
    return `${baseUrl}?${params.toString()}`;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

let _adapter: StorageAdapter | null = null;

/**
 * Returns the configured StorageAdapter singleton.
 *
 * Backend selection:
 *   S3      if S3_ENDPOINT + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET are set
 *   Local   otherwise (vault/ directory relative to process.cwd())
 */
export function getStorageAdapter(): StorageAdapter {
  if (_adapter) return _adapter;

  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3KeyId = process.env.S3_ACCESS_KEY_ID;
  const s3Secret = process.env.S3_SECRET_ACCESS_KEY;
  const s3Bucket = process.env.S3_BUCKET;

  if (s3Endpoint && s3KeyId && s3Secret && s3Bucket) {
    _adapter = new S3Adapter({
      endpoint: s3Endpoint,
      accessKeyId: s3KeyId,
      secretAccessKey: s3Secret,
      bucket: s3Bucket,
      region: process.env.S3_REGION || "auto",
      publicUrl: process.env.S3_PUBLIC_URL,
    });
    logger.info(`Storage backend: S3 (${s3Endpoint}/${s3Bucket})`);
  } else {
    const root = path.join(process.cwd(), "vault");
    _adapter = new LocalDiskAdapter(root);
    logger.info(`Storage backend: local disk (${root})`);
  }

  return _adapter;
}

/** Reset the singleton — used in tests. */
export function resetStorageAdapter(): void {
  _adapter = null;
}
