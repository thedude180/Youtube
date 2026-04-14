import { db } from "./db";
import { eq, and, gte, sql } from "drizzle-orm";
import { users, empireBuilds, notifications, autopilotQueue } from "@shared/schema";
import { buildEmpireFromIdea, autoLaunchEmpireContent } from "./idea-empire-engine";
import { sendSSEEvent } from "./routes/events";
import {
  generateHumanScheduledTime,
  addHumanMicroDelay,
  getAudienceDrivenTime,
} from "./human-behavior-engine";
import crypto from "crypto";

import { createLogger } from "./lib/logger";

const logger = createLogger("empire-launcher");
function generateBuildToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

async function updateBuildStage(
  buildId: number,
  stage: string,
  progress: number,
  message: string,
  extra?: Record<string, any>,
) {
  await db
    .update(empireBuilds)
    .set({
      stage,
      progress,
      stageMessage: message,
      ...extra,
    })
    .where(eq(empireBuilds.id, buildId));
}

async function createCatastrophicNotification(
  userId: string,
  buildId: number,
  failureReason: string,
  stage: string,
) {
  await db.insert(notifications).values({
    userId,
    type: "empire-catastrophic",
    title: "Empire Build Failed - Action Required",
    message: `Your empire build hit a critical failure during "${stage}": ${failureReason}. AI could not recover automatically. Please try again or contact support.`,
    severity: "critical",
    actionUrl: "/autopilot",
    metadata: {
      source: "empire-launcher",
      platformAffected: "all",
    },
  });

  await db
    .update(empireBuilds)
    .set({ notifiedAt: new Date() })
    .where(eq(empireBuilds.id, buildId));

  sendSSEEvent(userId, "empire-catastrophic", {
    buildId,
    stage,
    failureReason,
    message: "Your empire build encountered a critical issue. Check notifications.",
  });
}

async function seedAutopilotForUser(userId: string): Promise<number> {
  const [existingScheduled] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      gte(autopilotQueue.scheduledAt, new Date()),
    ));

  if ((existingScheduled?.count || 0) > 0) {
    return existingScheduled?.count || 0;
  }

  const platforms = ["discord"];
  const contentTypes = ["auto-clip", "content-recycle", "cross-promo"];
  let seeded = 0;
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    for (const platform of platforms) {
      const postsPerDay = 1;

      for (let postIdx = 0; postIdx < postsPerDay; postIdx++) {
        const contentType = contentTypes[seeded % contentTypes.length];

        const scheduledAt = await getAudienceDrivenTime({
          platform,
          userId,
          contentType: "new-video",
          urgency: "low",
        });

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        scheduledAt.setFullYear(targetDate.getFullYear());
        scheduledAt.setMonth(targetDate.getMonth());
        scheduledAt.setDate(targetDate.getDate());

        const microDelay = addHumanMicroDelay();
        let finalSchedule = new Date(scheduledAt.getTime() + microDelay);

        if (finalSchedule < now) {
          if (dayOffset === 0) {
            finalSchedule = new Date(now.getTime() + (30 + Math.random() * 90) * 60 * 1000);
          } else {
            continue;
          }
        }

        const content = `${contentType === "auto-clip" ? "New content" : contentType === "content-recycle" ? "Throwback" : "Cross-platform"}: Scheduled ${platform} post`;

        await db.insert(autopilotQueue).values({
          userId,
          type: contentType,
          targetPlatform: platform,
          content,
          caption: `${platform} - Autopilot scheduled post`,
          status: "scheduled",
          scheduledAt: finalSchedule,
          metadata: {
            style: "human",
            schedulingMethod: "empire-launcher-autopilot",
            aiModel: "seeded",
            humanScore: 0.95,
          },
        } as any);

        seeded++;
      }
    }
  }

  return seeded;
}

export async function launchEmpire(email: string, idea: string): Promise<{ buildToken: string; buildId: number }> {
  const buildToken = generateBuildToken();

  const [build] = await db.insert(empireBuilds).values({
    buildToken,
    email: email.trim().toLowerCase(),
    idea: idea.trim(),
    stage: "queued",
    progress: 0,
    stageMessage: "Empire build queued...",
  }).returning();

  runEmpireBuild(build.id, email.trim().toLowerCase(), idea.trim(), buildToken).catch(err => {
    logger.error(`[EmpireLauncher] Unhandled error in build ${build.id}:`, err.message);
  });

  return { buildToken, buildId: build.id };
}

async function runEmpireBuild(buildId: number, email: string, idea: string, buildToken: string) {
  let userId: string | null = null;

  try {
    await updateBuildStage(buildId, "creating_user", 5, "Setting up your creator account...");

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [newUser] = await db.insert(users).values({
        email,
        firstName: email.split("@")[0],
        role: "user",
        tier: "free",
      }).returning();
      userId = newUser.id;
    }

    await db
      .update(empireBuilds)
      .set({ userId })
      .where(eq(empireBuilds.id, buildId));

    await updateBuildStage(buildId, "building_blueprint", 15, "AI is analyzing your idea and building your empire blueprint...");

    sendSSEEvent(userId, "empire-build-status", { buildId, stage: "building_blueprint", progress: 15 });

    let blueprint: any;
    try {
      blueprint = await buildEmpireFromIdea(userId, idea);
    } catch (bpErr: any) {
      logger.error(`[EmpireLauncher] CATASTROPHIC: Blueprint generation failed for build ${buildId}:`, bpErr.message);
      await db.update(empireBuilds).set({
        stage: "failed",
        progress: -1,
        stageMessage: `Blueprint generation failed: ${bpErr.message}`,
        failureReason: bpErr.message,
        failureSeverity: "catastrophic",
      }).where(eq(empireBuilds.id, buildId));
      await createCatastrophicNotification(userId, buildId, bpErr.message, "building_blueprint");
      return;
    }

    if (!blueprint || !blueprint.niche) {
      const msg = "AI returned an empty or invalid blueprint";
      await db.update(empireBuilds).set({
        stage: "failed", progress: -1, stageMessage: msg,
        failureReason: msg, failureSeverity: "catastrophic",
      }).where(eq(empireBuilds.id, buildId));
      await createCatastrophicNotification(userId, buildId, msg, "building_blueprint");
      return;
    }

    const blueprintSummary = {
      niche: blueprint?.niche?.primary || idea,
      brandName: blueprint?.brandIdentity?.nameOptions?.[0]?.name || "Your Brand",
      platforms: Object.keys(blueprint?.platformStrategy || {}),
      pillarsCount: blueprint?.contentPillars?.length || 0,
      planDays: blueprint?.first30DaysPlan?.length || 0,
    };

    await updateBuildStage(buildId, "auto_launching_content", 50, "Creating AI-powered video content with human-authentic scripts...", { blueprintSummary });

    sendSSEEvent(userId, "empire-build-status", { buildId, stage: "auto_launching_content", progress: 50 });

    let videosLaunched = 0;
    try {
      const launchResult = await autoLaunchEmpireContent(userId, 3);
      videosLaunched = launchResult.totalLaunched;
    } catch (err: any) {
      logger.error(`[EmpireLauncher] Auto-launch failed for build ${buildId}:`, err.message);
    }

    await updateBuildStage(buildId, "seeding_autopilot", 80, "Seeding 14-day autopilot schedule across all platforms...", { videosLaunched });

    sendSSEEvent(userId, "empire-build-status", { buildId, stage: "seeding_autopilot", progress: 80 });

    let autopilotCount = 0;
    try {
      autopilotCount = await seedAutopilotForUser(userId);
    } catch (err: any) {
      logger.error(`[EmpireLauncher] Autopilot seed failure for build ${buildId}:`, err.message);
    }

    await db
      .update(empireBuilds)
      .set({
        stage: "completed",
        progress: 100,
        stageMessage: `Empire built! ${videosLaunched} videos launched, ${autopilotCount} autopilot posts scheduled.`,
        autopilotSeeded: autopilotCount > 0,
        completedAt: new Date(),
      })
      .where(eq(empireBuilds.id, buildId));

    sendSSEEvent(userId, "empire-build-status", {
      buildId,
      stage: "completed",
      progress: 100,
      videosLaunched,
      autopilotCount,
    });

  } catch (err: any) {
    logger.error(`[EmpireLauncher] CATASTROPHIC failure for build ${buildId}:`, err.message);

    const failureReason = err.message || "Unknown error during empire build";
    const currentStage = (await db.select().from(empireBuilds).where(eq(empireBuilds.id, buildId)).limit(1))?.[0]?.stage || "unknown";

    await db
      .update(empireBuilds)
      .set({
        stage: "failed",
        progress: -1,
        stageMessage: `Build failed: ${failureReason}`,
        failureReason,
        failureSeverity: "catastrophic",
      })
      .where(eq(empireBuilds.id, buildId));

    if (userId) {
      await createCatastrophicNotification(userId, buildId, failureReason, currentStage);
    }
  }
}

export async function getEmpireBuildStatus(buildToken: string) {
  const [build] = await db
    .select()
    .from(empireBuilds)
    .where(eq(empireBuilds.buildToken, buildToken))
    .limit(1);

  if (!build) return null;

  return {
    id: build.id,
    email: build.email,
    idea: build.idea,
    stage: build.stage,
    progress: build.progress,
    stageMessage: build.stageMessage,
    blueprintSummary: build.blueprintSummary,
    videosLaunched: build.videosLaunched,
    autopilotSeeded: build.autopilotSeeded,
    failureReason: build.failureReason,
    failureSeverity: build.failureSeverity,
    completedAt: build.completedAt,
    createdAt: build.createdAt,
  };
}
