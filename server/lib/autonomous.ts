import { db } from "../db";
import { userAutonomousSettings, autonomousActionLog } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "./logger";

const logger = createLogger("autonomous-helper");

/**
 * Checks if autonomous mode is active for a given user.
 * Returns false if autonomous mode is off, or if it's currently paused.
 */
export async function isAutonomousMode(userId: string): Promise<boolean> {
  try {
    const [settings] = await db
      .select()
      .from(userAutonomousSettings)
      .where(eq(userAutonomousSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.autonomousMode) {
      return false;
    }

    if (settings.pausedUntil && settings.pausedUntil > new Date()) {
      logger.info(`Autonomous mode is paused for user ${userId} until ${settings.pausedUntil}`);
      return false;
    }

    return true;
  } catch (err: any) {
    logger.error(`Error checking autonomous mode for user ${userId}: ${err.message}`);
    return false;
  }
}

/**
 * Logs an autonomous action to the autonomousActionLog table.
 */
export async function logAutonomousAction(params: {
  userId: string;
  engine: string;
  action: string;
  reasoning?: string;
  payload?: any;
  prompt?: string;
  response?: string;
  publishedContent?: string;
}): Promise<void> {
  try {
    await db.insert(autonomousActionLog).values({
      userId: params.userId,
      engine: params.engine,
      action: params.action,
      reasoning: params.reasoning,
      payload: params.payload,
      prompt: params.prompt,
      response: params.response,
      publishedContent: params.publishedContent,
      createdAt: new Date(),
    });
    logger.info(`Logged autonomous action: ${params.action} by ${params.engine} for user ${params.userId}`);
  } catch (err: any) {
    logger.error(`Error logging autonomous action for user ${params.userId}: ${err.message}`);
  }
}
