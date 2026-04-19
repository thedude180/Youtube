import { storage } from "../storage";

import { createLogger } from "./logger";

const logger = createLogger("audit");
export async function logSecurityEvent(params: {
  userId: string;
  action: string;
  details?: Record<string, any>;
  target?: string;
  riskLevel?: string;
}) {
  try {
    await storage.createAuditLog({
      userId: params.userId,
      action: params.action,
      target: params.target || null,
      details: params.details || null,
      riskLevel: params.riskLevel || "low",
    });
  } catch (err: any) {
    logger.error(`[Audit] Failed to log security event: ${params.action}`, err?.message);
  }
}
