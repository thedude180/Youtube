import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../db";
import { webhookDeliveryRecords } from "@shared/schema";
import { routeToDLQ } from "./index";
import { createLogger } from "../lib/logger";

const logger = createLogger("kernel:webhook-verify");

interface WebhookVerificationConfig {
  source: string;
  getSignature: (req: Request) => string | undefined;
  getSecret: () => string | undefined;
  verify: (body: string | Buffer, signature: string, secret: string) => boolean;
  extractEventType?: (req: Request) => string | undefined;
  extractDeliveryId?: (req: Request) => string | undefined;
}

function verifyStripeSignature(body: string | Buffer, signature: string, secret: string): boolean {
  const parts = signature.split(",");
  const tsPart = parts.find(p => p.startsWith("t="));
  const sigParts = parts.filter(p => p.startsWith("v1="));

  if (!tsPart || sigParts.length === 0) return false;

  const timestamp = tsPart.slice(2);
  const payload = typeof body === "string" ? body : body.toString("utf8");
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

  return sigParts.some(sp => {
    const sig = sp.slice(3);
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  });
}

function verifyYouTubeHubSignature(body: string | Buffer, hubSignature: string, secret: string): boolean {
  const [algo, sig] = hubSignature.split("=");
  if (!sig) return false;
  const data = typeof body === "string" ? body : body.toString("utf8");
  const expected = crypto.createHmac(algo || "sha1", secret).update(data).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

const isProd = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";

const WEBHOOK_CONFIGS: Record<string, WebhookVerificationConfig> = {
  stripe: {
    source: "stripe",
    getSignature: (req) => {
      const sig = req.headers["stripe-signature"];
      return Array.isArray(sig) ? sig[0] : sig;
    },
    getSecret: () => process.env.STRIPE_WEBHOOK_SECRET,
    verify: verifyStripeSignature,
    extractEventType: (req) => {
      try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        return body?.type;
      } catch { return undefined; }
    },
    extractDeliveryId: (req) => {
      try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        return body?.id;
      } catch { return undefined; }
    },
  },
  youtube: {
    source: "youtube",
    getSignature: (req) => {
      const sig = req.headers["x-hub-signature"];
      return Array.isArray(sig) ? sig[0] : sig;
    },
    getSecret: () => process.env.YOUTUBE_WEBHOOK_SECRET,
    verify: verifyYouTubeHubSignature,
    extractEventType: () => "youtube.push",
    extractDeliveryId: (req) => {
      const id = req.headers["x-goog-message-number"];
      return Array.isArray(id) ? id[0] : id;
    },
  },
};

export function createWebhookVerificationMiddleware(source: string) {
  const config = WEBHOOK_CONFIGS[source];
  if (!config) {
    throw new Error(`Unknown webhook source: ${source}`);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const bodyStr = typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

    const signature = config.getSignature(req);
    const secret = config.getSecret();
    const eventType = config.extractEventType?.(req) || "unknown";
    const deliveryId = config.extractDeliveryId?.(req) || crypto.randomUUID();
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    if (!secret) {
      if (isProd) {
        const dlqId = await routeToDLQ(
          `webhook-${source}`,
          { source, eventType, deliveryId, error: "webhook_secret_not_configured" },
          `${source} webhook secret not configured in production`,
        );
        await recordDelivery(source, eventType, deliveryId, {}, false, "webhook_secret_not_configured", "rejected", dlqId, ip);
        logger.error(`${source} webhook secret not configured in production`);
        return res.status(500).json({ error: "Webhook configuration error" });
      }
      await recordDelivery(source, eventType, deliveryId, {}, true, undefined, "received", undefined, ip);
      return next();
    }

    if (!signature) {
      const dlqId = await routeToDLQ(
        `webhook-${source}`,
        { source, eventType, deliveryId, error: "missing_signature" },
        `Missing signature header for ${source} webhook`,
      );
      await recordDelivery(source, eventType, deliveryId, {}, false, "missing_signature", "rejected", dlqId, ip);
      logger.warn(`${source} webhook rejected: missing signature`, { ip });
      return res.status(401).json({ error: "Missing webhook signature" });
    }

    const isValid = config.verify(bodyStr, signature, secret);

    if (!isValid) {
      const dlqId = await routeToDLQ(
        `webhook-${source}`,
        { source, eventType, deliveryId, error: "invalid_signature", ip },
        `Invalid ${source} webhook signature`,
      );
      await recordDelivery(source, eventType, deliveryId, {}, false, "invalid_signature", "rejected", dlqId, ip);
      logger.warn(`${source} webhook rejected: invalid signature`, { ip, deliveryId });
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    await recordDelivery(source, eventType, deliveryId, {}, true, undefined, "verified", undefined, ip);
    next();
  };
}

async function recordDelivery(
  source: string,
  eventType: string | undefined,
  deliveryId: string | undefined,
  payload: Record<string, any>,
  signatureValid: boolean,
  signatureError: string | undefined,
  status: string,
  dlqId: number | undefined,
  ipAddress: string
) {
  try {
    await db.insert(webhookDeliveryRecords).values({
      source,
      eventType: eventType || null,
      deliveryId: deliveryId || null,
      payload,
      signatureValid,
      signatureError: signatureError || null,
      status,
      dlqId: dlqId || null,
      ipAddress,
    });
  } catch (err) {
    logger.error("Failed to record webhook delivery", { source, error: String(err).substring(0, 200) });
  }
}

export { WEBHOOK_CONFIGS };
