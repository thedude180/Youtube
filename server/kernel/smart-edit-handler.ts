import { registerCommand, routeCommand, type CommandResult } from "./index";
import { createLogger } from "../lib/logger";

const logger = createLogger("kernel:smart-edit");

export function registerSmartEditCommand() {
  registerCommand("smart-edit", async (payload) => {
    const { userId, videoId, queueItemId } = payload;

    if (!videoId) {
      throw new Error("Missing videoId for smart-edit command");
    }

    const { runSmartEditJob } = await import("../smart-edit-engine");
    await runSmartEditJob(queueItemId || 0, userId, videoId);

    return {
      status: "completed",
      videoId,
      queueItemId,
      completedAt: new Date().toISOString(),
    };
  });

  logger.info("smart-edit command registered with kernel");
}

export async function submitSmartEditToKernel(
  userId: string,
  videoId: number,
  queueItemId: number,
  options: { confidence?: number; executionKey?: string } = {}
): Promise<CommandResult> {
  const executionKey = options.executionKey || `smart-edit:${userId}:${videoId}:${queueItemId}`;

  return routeCommand("smart-edit", {
    userId,
    videoId,
    queueItemId,
    executionKey,
  }, {
    confidence: options.confidence ?? 0.85,
    decisionTheater: {
      whatChanged: "smart-edit-highlight-reel",
      whyChanged: "automated-video-editing",
      outputType: "highlight-reel",
    },
    rollbackAvailable: false,
  });
}
