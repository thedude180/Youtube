import crypto from "crypto";
import nacl from 'tweetnacl';
import { trackSecurityEvent } from "../security-engine";

interface VerificationResult {
  valid: boolean;
  error?: string;
}

const isProd = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = "sha256",
  encoding: "hex" | "base64" = "hex"
): VerificationResult {
  try {
    const data = typeof payload === "string" ? payload : payload.toString("utf8");
    const expectedBuf = crypto.createHmac(algorithm, secret).update(data).digest();
    const sigBuf = encoding === 'base64' ? Buffer.from(signature, 'base64') : Buffer.from(signature, 'hex');

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, error: 'signature_length_mismatch' };
    }

    return { valid: crypto.timingSafeEqual(sigBuf, expectedBuf) };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function verifyYouTubeWebhook(body: string, hubSignature: string): VerificationResult {
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET;
  if (!secret) {
    if (isProd) {
      console.error('[WebhookVerify] MISSING YOUTUBE_WEBHOOK_SECRET IN PRODUCTION — blocking request');
      return { valid: false, error: 'webhook_secret_not_configured' };
    }
    return { valid: true };
  }
  if (!hubSignature) return { valid: false, error: "Missing X-Hub-Signature header" };
  const [algo, sig] = hubSignature.split("=");
  return verifyHmacSignature(body, sig, secret, algo || "sha1", "hex");
}

export function verifyTwitchWebhook(body: string, messageId: string, timestamp: string, signature: string): VerificationResult {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) {
    if (isProd) {
      console.error('[WebhookVerify] MISSING TWITCH_WEBHOOK_SECRET IN PRODUCTION — blocking request');
      return { valid: false, error: 'webhook_secret_not_configured' };
    }
    return { valid: true };
  }
  if (!signature) return { valid: false, error: "Missing Twitch-Eventsub-Message-Signature" };
  const hmacMessage = messageId + timestamp + body;
  const expectedBuf = crypto.createHmac("sha256", secret).update(hmacMessage).digest();
  
  try {
    const sigStr = signature.startsWith("sha256=") ? signature.substring(7) : signature;
    const sigBuf = Buffer.from(sigStr, "hex");

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, error: "Signature length mismatch" };
    }

    const valid = crypto.timingSafeEqual(sigBuf, expectedBuf);
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message || "Signature verification failed" };
  }
}

export function verifyKickWebhook(body: string, signature: string): VerificationResult {
  const secret = process.env.KICK_WEBHOOK_SECRET;
  if (!secret) {
    if (isProd) {
      console.error('[WebhookVerify] MISSING KICK_WEBHOOK_SECRET IN PRODUCTION — blocking request');
      return { valid: false, error: 'webhook_secret_not_configured' };
    }
    return { valid: true };
  }
  if (!signature) return { valid: false, error: "Missing webhook signature" };
  return verifyHmacSignature(body, signature, secret, "sha256", "hex");
}

export function verifyDiscordWebhook(body: string, signature: string, timestamp: string): VerificationResult {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    if (isProd) {
      console.error('[WebhookVerify] MISSING DISCORD_PUBLIC_KEY IN PRODUCTION — blocking request');
      return { valid: false, error: 'webhook_secret_not_configured' };
    }
    return { valid: true };
  }
  if (!signature || !timestamp) return { valid: false, error: "Missing signature/timestamp" };
  try {
    const valid = nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex')
    );
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
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
  } catch (err) {
    console.error(`[WebhookVerify] Failed to log webhook failure for ${platform}:`, err);
  }
}
