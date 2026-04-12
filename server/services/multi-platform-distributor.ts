import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { withCreatorVoice } from "./creator-dna-builder";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";
import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { userAutonomousSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEngineKnowledgeForContext, recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";

const logger = createLogger("multi-platform-distributor");

export class MultiPlatformDistributor {
  /**
   * Generates platform-specific copy and enqueues distribution jobs.
   * @AUTONOMOUS: Drives cross-platform traffic.
   */
  async distribute(userId: string, clipPayload: any, platforms: string[]): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    try {
      // 1. Check approval requirement
      const [settings] = await db
        .select()
        .from(userAutonomousSettings)
        .where(eq(userAutonomousSettings.userId, userId))
        .limit(1);
      
      const requireApproval = settings?.requireApproval ?? false;

      logger.info(`[MultiPlatformDistributor] Distributing clip to ${platforms.join(", ")} for user ${userId}. Approval required: ${requireApproval}`);

      const platformKnowledge = await getEngineKnowledgeForContext("content-grinder", userId, 6);
      const masterWisdom = await getMasterKnowledgeForPrompt(userId, 4);
      const platformContext = platformKnowledge.length > 0
        ? "\n\nLEARNED PLATFORM INTELLIGENCE:\n" + platformKnowledge.map(k => `• [${k.confidence}%] ${k.insight.substring(0, 120)}`).join("\n")
        : "";

      const basePrompt = `Generate engaging, platform-specific captions for a highlight clip titled "${clipPayload.title}" from the game "${clipPayload.gameTitle}".
Platforms: ${platforms.join(", ")}
${masterWisdom ? "\n" + masterWisdom : ""}${platformContext}

Requirements:
- TikTok/Reels: Short, punchy, hashtags, loop-friendly.
- X (Twitter): Viral hook, thread-starter, driving traffic to the full VOD.
- Discord: Community-focused announcement.
- Instagram: Visually-driven, story-telling, strategic hashtags.
- Apply any platform-specific learnings from the intelligence above.

Return a JSON object where keys are platform names and values are the generated captions.`;

      const prompt = await withCreatorVoice(userId, basePrompt);
      
      const openai = getOpenAIClient();
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const captions = JSON.parse(response.choices[0].message.content || "{}");

      // 3. Run governance checks + enqueue jobs per platform
      for (const platform of platforms) {
        const caption = captions[platform] || "";
        
        let governanceAllowed = true;
        const trustCost = 5;
        try {
          const { checkPublishingGates } = await import("../distribution/publishing-gates");
          const { getConnectionHealth } = await import("../distribution/connection-health");
          const { recordDistributionLearning } = await import("../distribution/distribution-learning");

          const health = getConnectionHealth(platform);
          if (health.status === "open") {
            logger.warn(`[MultiPlatformDistributor] Skipping ${platform} — circuit breaker open`);
            await recordDistributionLearning(userId, platform, "distribute_blocked", {
              allowed: false, trustCost, policyIssues: ["circuit breaker open"], connectionStatus: "open",
            }).catch(() => {});
            governanceAllowed = false;
          }

          if (governanceAllowed) {
            try {
              const { checkTrustBudget } = await import("../kernel/trust-budget");
              const trustResult = await checkTrustBudget(userId, `distribution:${platform}`, trustCost);
              if (trustResult.blocked) {
                logger.warn(`[MultiPlatformDistributor] Trust budget blocked ${platform}`);
                await recordDistributionLearning(userId, platform, "distribute_trust_blocked", {
                  allowed: false, trustCost, policyIssues: ["trust budget exhausted"], connectionStatus: health.status,
                }).catch(() => {});
                governanceAllowed = false;
              }
            } catch (trustErr: any) {
              logger.warn(`[MultiPlatformDistributor] Trust budget check error for ${platform}: ${trustErr?.message}`);
              await recordDistributionLearning(userId, platform, "distribute_trust_error", {
                allowed: false, trustCost, policyIssues: ["trust budget check error"], connectionStatus: health.status,
              }).catch(() => {});
              governanceAllowed = false;
            }
          }

          if (governanceAllowed) {
            try {
              const { probeCapability } = await import("../kernel/capability-probe");
              const probe = await probeCapability(platform, `${platform}:publish`, undefined, userId);
              if (probe.probeResult === "error") {
                logger.warn(`[MultiPlatformDistributor] Capability probe failed for ${platform}`);
                await recordDistributionLearning(userId, platform, "distribute_capability_failed", {
                  allowed: false, trustCost, policyIssues: ["capability probe failed"], connectionStatus: health.status,
                }).catch(() => {});
                governanceAllowed = false;
              }
            } catch (probeErr: any) {
              logger.warn(`[MultiPlatformDistributor] Capability probe error for ${platform}: ${probeErr?.message}`);
              await recordDistributionLearning(userId, platform, "distribute_capability_error", {
                allowed: false, trustCost, policyIssues: ["capability probe error"], connectionStatus: health.status,
              }).catch(() => {});
              governanceAllowed = false;
            }
          }

          if (governanceAllowed) {
            const gateResult = await checkPublishingGates(userId, platform, {
              title: clipPayload.title || caption.slice(0, 100),
              description: caption,
              tags: clipPayload.tags,
            });
            if (!gateResult.passed) {
              logger.warn(`[MultiPlatformDistributor] Policy blocked ${platform}: ${gateResult.issues.join(", ")}`);
              await recordDistributionLearning(userId, platform, "distribute_policy_blocked", {
                allowed: false, trustCost, policyIssues: gateResult.issues, connectionStatus: health.status,
              }).catch(() => {});
              governanceAllowed = false;
            }
          }
        } catch (err: any) {
          logger.warn(`[MultiPlatformDistributor] Governance pipeline error for ${platform}, blocking: ${err.message}`);
          governanceAllowed = false;
        }

        if (!governanceAllowed) continue;

        await jobQueue.enqueue({
          type: requireApproval ? "queue_for_approval" : `publish_to_${platform}`,
          userId,
          priority: 7,
          payload: {
            ...clipPayload,
            platform,
            caption,
            requireApproval
          },
        });
      }

      // 4. Log autonomous action
      await logAutonomousAction({
        userId,
        engine: "multi-platform-distributor",
        action: "distribute_content",
        reasoning: `Generated platform-specific copy for ${platforms.length} platforms. ${requireApproval ? "Queued for approval." : "Enqueued for publishing."}`,
        payload: { clipTitle: clipPayload.title, platforms, requireApproval },
        prompt,
        response: response.choices[0].message.content || "",
      });

      for (const platform of platforms) {
        recordEngineKnowledge("content-grinder", userId, "distribution_action", `${platform}_distribution`, `Distributed "${clipPayload.title}" to ${platform}. ${requireApproval ? "Awaiting approval" : "Auto-published"}.`, `Game: ${clipPayload.gameTitle || "unknown"}, platforms: ${platforms.join(",")}`, 55).catch(() => {});
      }

    } catch (err: any) {
      logger.error(`[MultiPlatformDistributor] Error distributing clip: ${err.message}`);
    }
  }
}

export const multiPlatformDistributor = new MultiPlatformDistributor();
