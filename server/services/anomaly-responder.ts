import { sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { healthBrain } from "./health-brain";
import { jobQueue } from "./intelligent-job-queue";
import { db } from "../db";
import { securityEvents } from "@shared/schema";
import { routeNotification } from "./notification-system";
import { createLogger } from "../lib/logger";
import { registerMap } from "./resilience-core";

const logger = createLogger("anomaly-responder");

interface AnomalyThresholds {
  errorSpikeMultiplier: number;
  minErrorsForSpike: number;
  recurringWindowMs: number;
  recurringCountThreshold: number;
  escalationAfterOccurrences: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  errorSpikeMultiplier: 3,
  minErrorsForSpike: 5,
  recurringWindowMs: 30 * 60_000,
  recurringCountThreshold: 3,
  escalationAfterOccurrences: 5,
};

let activeThresholds = { ...DEFAULT_THRESHOLDS };

export function configureAnomalyThresholds(overrides: Partial<AnomalyThresholds>) {
  activeThresholds = { ...activeThresholds, ...overrides };
}

export function getAnomalyThresholds(): AnomalyThresholds {
  return { ...activeThresholds };
}

const anomalyOccurrences = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
registerMap("anomalyOccurrences", anomalyOccurrences, 500);

function trackRecurrence(anomalyType: string): { recurring: boolean; count: number } {
  const now = Date.now();
  const existing = anomalyOccurrences.get(anomalyType);

  if (existing && (now - existing.firstSeen) < activeThresholds.recurringWindowMs) {
    existing.count++;
    existing.lastSeen = now;
    anomalyOccurrences.set(anomalyType, existing);
    return {
      recurring: existing.count >= activeThresholds.recurringCountThreshold,
      count: existing.count,
    };
  }

  anomalyOccurrences.set(anomalyType, { count: 1, firstSeen: now, lastSeen: now });
  return { recurring: false, count: 1 };
}

export function getRecurrenceStats(): Record<string, { count: number; firstSeen: number; lastSeen: number }> {
  const stats: Record<string, { count: number; firstSeen: number; lastSeen: number }> = {};
  for (const [k, v] of anomalyOccurrences) stats[k] = { ...v };
  return stats;
}

export class AnomalyResponder {
  async callHealingAI(prompt: string): Promise<any> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      logger.error("[AnomalyResponder] Missing AI_INTEGRATIONS_OPENAI_API_KEY");
      return null;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // fallback to 4o-mini as gpt-4o-mini doesn't exist yet
          messages: [
            {
              role: "system",
              content: `You are the CreatorOS Self-Healing AI. Your job is to analyze system anomalies and choose the best healing action.
Available actions:
- 'restart_engine': Restart a specific service (requires target engine name).
- 'clear_stuck_jobs': Clear jobs that are stuck in 'processing' status.
- 'notify_admin': Only notify an admin if the risk is high or the situation is complex.
- 'no_action': Use if the anomaly seems harmless or transient.

Response must be in JSON format:
{
  "action": "string",
  "target": "string | null",
  "risk": "low" | "medium" | "high",
  "reasoning": "string",
  "notify_user": boolean,
  "user_message": "string | null"
}`,
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API failed with status ${response.status}`);
      }

      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (err: any) {
      logger.error(`[AnomalyResponder] AI call failed: ${err.message}`);
      return null;
    }
  }

  async respond(anomaly: { type: string; description: string; userId?: string; data?: any }): Promise<void> {
    try {
      const recurrence = trackRecurrence(anomaly.type);

      const healthStatus = healthBrain.getStatus();
      
      const aiResponse = await this.callHealingAI(
        `Anomaly Detected:
Type: ${anomaly.type}
Description: ${anomaly.description}
Recurring: ${recurrence.recurring} (${recurrence.count} occurrences)
Context: ${JSON.stringify(sanitizeObjectForPrompt({ healthStatus, anomalyData: anomaly.data }))}`
      );

      if (!aiResponse) {
        logger.warn("[AnomalyResponder] Failed to get AI response for anomaly", anomaly);
        return;
      }

      const effectiveRisk = recurrence.count >= activeThresholds.escalationAfterOccurrences ? "high" : aiResponse.risk;

      logger.info(`[AnomalyResponder] AI Diagnosis: ${aiResponse.action} (${effectiveRisk}) - ${aiResponse.reasoning}`);

      try {
        const { feedAnomalyToExceptionDesk } = await import("./exception-desk");
        await feedAnomalyToExceptionDesk({
          type: anomaly.type,
          description: anomaly.description,
          userId: anomaly.userId,
          risk: effectiveRisk,
          recurring: recurrence.recurring,
          occurrenceCount: recurrence.count,
        });
      } catch (feedErr: any) {
        logger.error("[AnomalyResponder] Failed to feed anomaly to exception desk:", feedErr?.message);
      }

      if (effectiveRisk === "low") {
        await this.execute(aiResponse.action, aiResponse.target);
        await this.logResolution(anomaly, aiResponse);
      } else if (effectiveRisk === "medium") {
        logger.info(`[AnomalyResponder] Scheduling medium-risk action '${aiResponse.action}' in 5 minutes`);
        setTimeout(async () => {
          await this.execute(aiResponse.action, aiResponse.target);
          await this.logResolution(anomaly, aiResponse);
        }, 5 * 60_000);
      } else if (effectiveRisk === "high") {
        logger.warn(`[AnomalyResponder] High-risk anomaly detected. Notifying admin instead of auto-healing.`);
        await this.execute("notify_admin", aiResponse.reasoning);
        await this.logResolution(anomaly, aiResponse);
      }

      if (aiResponse.notify_user && aiResponse.user_message && anomaly.userId) {
        const notifSeverity = effectiveRisk === "high" ? "critical" : "warning";
        const { storage } = await import("../storage");
        await storage.createNotification({
          userId: anomaly.userId,
          type: "system",
          title: "System Maintenance",
          message: aiResponse.user_message,
          severity: notifSeverity,
        });
        await routeNotification(anomaly.userId, {
          title: "System Maintenance",
          message: aiResponse.user_message,
          severity: notifSeverity,
          category: "system",
        });
      }
    } catch (err: any) {
      logger.error(`[AnomalyResponder] Response cycle failed: ${err.message}`);
    }
  }

  async execute(action: string, target?: string): Promise<void> {
    switch (action) {
      case "restart_engine":
        if (target) {
          await healthBrain.forceRestart(target);
        } else {
          logger.warn("[AnomalyResponder] restart_engine called without target");
        }
        break;
      case "clear_stuck_jobs":
        await jobQueue.clearStuck();
        break;
      case "notify_admin":
        // In a real app, we'd find an admin user. For now, we log it clearly and could use a system-wide broadcast if available.
        logger.warn(`[AnomalyResponder] ADMIN NOTIFICATION: ${target || "Action required"}`);
        break;
      case "no_action":
        logger.info("[AnomalyResponder] AI recommended no action.");
        break;
      default:
        logger.warn(`[AnomalyResponder] Unsupported AI action: ${action}`);
    }
  }

  async logResolution(anomaly: any, response: any): Promise<void> {
    try {
      await db.insert(securityEvents).values({
        eventType: "self_healing_action",
        severity: response.risk === "high" ? "warning" : "info",
        details: { description: `Self-healing action: ${response.action} for ${anomaly.type}`, anomaly, response },
      });
    } catch (err: any) {
      logger.error(`[AnomalyResponder] Failed to log resolution: ${err.message}`);
    }
  }
}

export const anomalyResponder = new AnomalyResponder();
