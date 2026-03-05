import { healthBrain } from "./health-brain";
import { jobQueue } from "./intelligent-job-queue";
import { db } from "../db";
import { securityEvents } from "@shared/schema";
import { routeNotification } from "./notification-system";
import { createLogger } from "../lib/logger";

const logger = createLogger("anomaly-responder");

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
          model: "gpt-4o-mini", // fallback to 4o-mini as gpt-5-mini doesn't exist yet
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
      const healthStatus = healthBrain.getStatus();
      
      const aiResponse = await this.callHealingAI(
        `Anomaly Detected:
Type: ${anomaly.type}
Description: ${anomaly.description}
Context: ${JSON.stringify({ healthStatus, anomalyData: anomaly.data })}`
      );

      if (!aiResponse) {
        logger.warn("[AnomalyResponder] Failed to get AI response for anomaly", anomaly);
        return;
      }

      logger.info(`[AnomalyResponder] AI Diagnosis: ${aiResponse.action} (${aiResponse.risk}) - ${aiResponse.reasoning}`);

      if (aiResponse.risk === "low") {
        await this.execute(aiResponse.action, aiResponse.target);
        await this.logResolution(anomaly, aiResponse);
      } else if (aiResponse.risk === "medium") {
        logger.info(`[AnomalyResponder] Scheduling medium-risk action '${aiResponse.action}' in 5 minutes`);
        setTimeout(async () => {
          await this.execute(aiResponse.action, aiResponse.target);
          await this.logResolution(anomaly, aiResponse);
        }, 5 * 60_000);
      } else if (aiResponse.risk === "high") {
        logger.warn(`[AnomalyResponder] High-risk anomaly detected. Notifying admin instead of auto-healing.`);
        await this.execute("notify_admin", aiResponse.reasoning);
        await this.logResolution(anomaly, aiResponse);
      }

      if (aiResponse.notify_user && aiResponse.user_message && anomaly.userId) {
        await routeNotification(anomaly.userId, {
          title: "System Maintenance",
          message: aiResponse.user_message,
          severity: aiResponse.risk === "high" ? "critical" : "info",
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
        description: `Self-healing action: ${response.action} for ${anomaly.type}`,
        details: { anomaly, response },
      });
    } catch (err: any) {
      logger.error(`[AnomalyResponder] Failed to log resolution: ${err.message}`);
    }
  }
}

export const anomalyResponder = new AnomalyResponder();
