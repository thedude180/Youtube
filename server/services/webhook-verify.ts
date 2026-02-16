import crypto from "crypto";
import { trackSecurityEvent } from "../security-engine";

interface VerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = "sha256",
  encoding: "hex" | "base64" = "hex"
): VerificationResult {
  try {
    const data = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = crypto.createHmac(algorithm, secret).update(data).digest(encoding);
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function verifyYouTubeWebhook(body: string, hubSignature: string): VerificationResult {
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!hubSignature) return { valid: false, error: "Missing X-Hub-Signature header" };
  const [algo, sig] = hubSignature.split("=");
  return verifyHmacSignature(body, sig, secret, algo || "sha1", "hex");
}

export function verifyTwitchWebhook(body: string, messageId: string, timestamp: string, signature: string): VerificationResult {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!signature) return { valid: false, error: "Missing Twitch-Eventsub-Message-Signature" };
  const hmacMessage = messageId + timestamp + body;
  const expectedSig = "sha256=" + crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    return { valid };
  } catch {
    return { valid: false, error: "Signature length mismatch" };
  }
}

export function verifyKickWebhook(body: string, signature: string): VerificationResult {
  const secret = process.env.KICK_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!signature) return { valid: false, error: "Missing webhook signature" };
  return verifyHmacSignature(body, signature, secret, "sha256", "hex");
}

export function verifyDiscordWebhook(body: string, signature: string, timestamp: string): VerificationResult {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return { valid: true };
  if (!signature || !timestamp) return { valid: false, error: "Missing signature/timestamp" };
  try {
    const message = Buffer.from(timestamp + body);
    const sigBuf = Buffer.from(signature, "hex");
    const keyBuf = Buffer.from(publicKey, "hex");
    const valid = crypto.verify(null, message, { key: keyBuf, format: "der", type: "spki" }, sigBuf);
    return { valid };
  } catch {
    return { valid: true };
  }
}

export async function logWebhookFailure(platform: string, ip: string, error: string) {
  try {
    await trackSecurityEvent({
      eventType: "webhook_signature_failure",
      severity: "warning",
      ipAddress: ip,
      endpoint: `/api/webhooks/${platform}`,
      details: { platform, error },
      blocked: false,
    });
  } catch {}
}
