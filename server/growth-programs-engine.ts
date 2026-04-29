import { sanitizeObjectForPrompt } from "./lib/ai-attack-shield";
import { db } from "./db";
import { platformGrowthPrograms, channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { callClaudeBackground, CLAUDE_MODELS } from "./lib/claude";
import { getCreatorStyleContext } from "./creator-intelligence";

import { createLogger } from "./lib/logger";

const logger = createLogger("growth-programs-engine");

interface ProgramDefinition {
  platform: string;
  programName: string;
  programType: string;
  requirements: { metric: string; target: number }[];
  benefits: string[];
  applicationUrl: string;
}

const KNOWN_PROGRAMS: ProgramDefinition[] = [
  {
    platform: "youtube",
    programName: "YouTube Partner Program (YPP)",
    programType: "monetization",
    requirements: [
      { metric: "Subscribers", target: 500 },
      { metric: "Public Watch Hours (12 months)", target: 3000 },
      { metric: "Public Shorts Views (90 days)", target: 3000000 },
      { metric: "Valid Uploads (90 days)", target: 3 },
    ],
    benefits: [
      "Ad revenue sharing",
      "Channel memberships",
      "Super Chat & Super Stickers",
      "Super Thanks",
      "YouTube Shopping",
      "YouTube Premium revenue",
    ],
    applicationUrl: "https://studio.youtube.com/channel/UC/monetization",
  },
  {
    platform: "youtube",
    programName: "YouTube Shorts Fund / Creativity Program",
    programType: "creator-fund",
    requirements: [
      { metric: "Shorts Views (90 days)", target: 10000000 },
      { metric: "Subscribers", target: 1000 },
    ],
    benefits: [
      "Monthly bonus payments for Shorts performance",
      "Shorts ad revenue sharing",
      "Priority in Shorts feed algorithm",
    ],
    applicationUrl: "https://studio.youtube.com/channel/UC/monetization",
  },
  {
    platform: "twitch",
    programName: "Twitch Affiliate Program",
    programType: "monetization",
    requirements: [
      { metric: "Followers", target: 50 },
      { metric: "Unique Broadcast Days (30 days)", target: 7 },
      { metric: "Average Concurrent Viewers", target: 3 },
      { metric: "Total Stream Hours (30 days)", target: 8 },
    ],
    benefits: [
      "Subscriptions revenue",
      "Bits & Cheering",
      "Game sales commission",
      "Ad revenue (limited)",
      "Custom emotes (up to 5)",
    ],
    applicationUrl: "https://dashboard.twitch.tv/achievements",
  },
  {
    platform: "twitch",
    programName: "Twitch Partner Program",
    programType: "partnership",
    requirements: [
      { metric: "Unique Broadcast Days (30 days)", target: 12 },
      { metric: "Average Concurrent Viewers", target: 75 },
      { metric: "Total Stream Hours (30 days)", target: 25 },
    ],
    benefits: [
      "Guaranteed ad revenue",
      "Custom subscription tiers",
      "Unlimited emote slots",
      "Squad Stream access",
      "Verified badge",
      "Priority support",
      "VOD storage (60 days)",
      "Transcoding priority",
    ],
    applicationUrl: "https://dashboard.twitch.tv/achievements",
  },
  {
    platform: "kick",
    programName: "Kick Creator Incentive Program",
    programType: "creator-fund",
    requirements: [
      { metric: "Followers", target: 75 },
      { metric: "Monthly Stream Hours", target: 20 },
      { metric: "Average Concurrent Viewers", target: 5 },
    ],
    benefits: [
      "95/5 revenue split (industry-best)",
      "Subscription revenue",
      "Direct creator payments",
      "Kick Creator Fund bonus",
      "Featured on platform",
    ],
    applicationUrl: "https://kick.com/dashboard/settings/creator",
  },
  {
    platform: "kick",
    programName: "Kick Refer-a-Creator Program",
    programType: "referral",
    requirements: [
      { metric: "Active Kick Account", target: 1 },
    ],
    benefits: [
      "Bonus for each creator referred",
      "Referred creators get welcome bonus",
      "Network growth incentives",
    ],
    applicationUrl: "https://kick.com/dashboard/referrals",
  },
  {
    platform: "tiktok",
    programName: "TikTok Creativity Program (Beta)",
    programType: "creator-fund",
    requirements: [
      { metric: "Followers", target: 10000 },
      { metric: "Video Views (30 days)", target: 100000 },
      { metric: "Account Age (days)", target: 30 },
      { metric: "Age (years)", target: 18 },
    ],
    benefits: [
      "Revenue per qualified view (higher than old Creator Fund)",
      "Videos must be 1+ minute for qualification",
      "Original content bonus multiplier",
      "Analytics dashboard for earnings",
    ],
    applicationUrl: "https://www.tiktok.com/creator-center/overview",
  },
  {
    platform: "tiktok",
    programName: "TikTok LIVE Subscription",
    programType: "monetization",
    requirements: [
      { metric: "Followers", target: 1000 },
      { metric: "LIVE Broadcasts (30 days)", target: 4 },
      { metric: "Account Age (days)", target: 30 },
    ],
    benefits: [
      "Monthly subscriber revenue from LIVE",
      "Exclusive LIVE-only content",
      "Subscriber badges and emotes",
      "LIVE gifts and diamonds",
    ],
    applicationUrl: "https://www.tiktok.com/creator-center/overview",
  },
  {
    platform: "tiktok",
    programName: "TikTok Refer-a-Creator",
    programType: "referral",
    requirements: [
      { metric: "Active TikTok Account", target: 1 },
    ],
    benefits: [
      "Cash bonus per referred creator",
      "Extra bonus when referrals hit milestones",
      "Special creator events access",
    ],
    applicationUrl: "https://www.tiktok.com/creator-center/referral",
  },
  {
    platform: "discord",
    programName: "Discord Server Subscriptions",
    programType: "monetization",
    requirements: [
      { metric: "Server Members", target: 500 },
      { metric: "Server Age (days)", target: 30 },
      { metric: "Active Members (weekly)", target: 50 },
    ],
    benefits: [
      "Paid subscription tiers for your server",
      "Custom roles and perks for subscribers",
      "Direct revenue from community",
      "Exclusive channels and content",
    ],
    applicationUrl: "https://discord.com/developers/servers",
  },
  {
    platform: "discord",
    programName: "Discord Partner Program",
    programType: "partnership",
    requirements: [
      { metric: "Server Members", target: 500 },
      { metric: "Weekly Communicators", target: 50 },
      { metric: "Server Age (days)", target: 56 },
    ],
    benefits: [
      "Partnered server badge",
      "Custom vanity URL",
      "VIP voice servers (better quality)",
      "Splash page for invite links",
      "Partner-only support",
      "Featured in Server Discovery",
    ],
    applicationUrl: "https://discord.com/partners",
  },
  {
    platform: "discord",
    programName: "Discord Activities & Apps",
    programType: "developer",
    requirements: [
      { metric: "Active Discord Account", target: 1 },
    ],
    benefits: [
      "Build custom Discord Activities",
      "Embedded apps in voice channels",
      "Premium app subscriptions revenue",
      "App directory listing",
    ],
    applicationUrl: "https://discord.com/developers/applications",
  },
];

export async function initializeGrowthPrograms(userId: string): Promise<void> {
  const existing = await db.select().from(platformGrowthPrograms)
    .where(eq(platformGrowthPrograms.userId, userId));

  const existingKeys = new Set(existing.map(e => `${e.platform}:${e.programName}`));

  const toInsert = KNOWN_PROGRAMS.filter(p => !existingKeys.has(`${p.platform}:${p.programName}`));

  if (toInsert.length === 0) return;

  await db.insert(platformGrowthPrograms).values(
    toInsert.map(p => ({
      userId,
      platform: p.platform,
      programName: p.programName,
      programType: p.programType,
      status: "not_started",
      eligibilityMet: false,
      requirements: p.requirements.map(r => ({
        metric: r.metric,
        current: 0,
        target: r.target,
        met: false,
      })),
      benefits: p.benefits,
      applicationUrl: p.applicationUrl,
      progress: 0,
    })),
  );
}

export async function getUserGrowthPrograms(userId: string) {
  let programs = await db.select().from(platformGrowthPrograms)
    .where(eq(platformGrowthPrograms.userId, userId));

  if (programs.length === 0) {
    await initializeGrowthPrograms(userId);
    programs = await db.select().from(platformGrowthPrograms)
      .where(eq(platformGrowthPrograms.userId, userId));
  }

  return programs;
}

export async function getGrowthProgramsByPlatform(userId: string, platform: string) {
  return db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.userId, userId),
      eq(platformGrowthPrograms.platform, platform),
    ));
}

export async function updateProgramMetrics(
  userId: string,
  programId: number,
  metrics: { metric: string; current: number }[],
) {
  const [program] = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.id, programId),
      eq(platformGrowthPrograms.userId, userId),
    ));

  if (!program) return null;

  const requirements = (program.requirements || []) as { metric: string; current: number; target: number; met: boolean }[];

  for (const update of metrics) {
    const req = requirements.find(r => r.metric === update.metric);
    if (req) {
      req.current = update.current;
      req.met = update.current >= req.target;
    }
  }

  const allMet = requirements.every(r => r.met);
  const progress = requirements.length > 0
    ? Math.round(requirements.reduce((sum, r) => sum + Math.min(100, (r.current / r.target) * 100), 0) / requirements.length)
    : 0;

  const [updated] = await db.update(platformGrowthPrograms)
    .set({
      requirements,
      eligibilityMet: allMet,
      progress,
      status: allMet ? "eligible" : (progress > 0 ? "in_progress" : "not_started"),
      lastChecked: new Date(),
    })
    .where(eq(platformGrowthPrograms.id, programId))
    .returning();

  return updated;
}

export async function generateGrowthRecommendations(userId: string) {
  const programs = await getUserGrowthPrograms(userId);
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const creatorCtx = await getCreatorStyleContext(userId).catch(() => "");

  const channelInfo = userChannels.map(c => ({
    platform: c.platform,
    name: c.channelName,
    subscribers: c.subscriberCount,
    videos: c.videoCount,
  }));

  const programSummary = programs.map(p => ({
    platform: p.platform,
    name: p.programName,
    type: p.programType,
    status: p.status,
    progress: p.progress,
    eligibilityMet: p.eligibilityMet,
    requirements: p.requirements,
  }));

  const prompt = `You are a creator growth strategist. Analyze this creator's current status across all platforms and provide actionable recommendations to qualify for and maximize earnings from each platform's creator programs.

CREATOR INFO:
${creatorCtx || "New creator"}

CONNECTED CHANNELS:
${JSON.stringify(sanitizeObjectForPrompt(channelInfo), null, 2)}

AVAILABLE PROGRAMS AND STATUS:
${JSON.stringify(sanitizeObjectForPrompt(programSummary), null, 2)}

For each program that the creator hasn't qualified for yet, provide specific strategies to reach eligibility. For programs they qualify for, provide optimization strategies.

Respond as JSON:
{
  "prioritizedPrograms": [
    {
      "programName": "name",
      "platform": "platform",
      "priority": "high/medium/low",
      "strategy": "2-3 sentence specific strategy",
      "estimatedTimeToEligible": "e.g. 2 weeks, 1 month, already eligible",
      "actionItems": ["specific step 1", "specific step 2", "specific step 3"],
      "potentialEarnings": "estimated monthly earnings range"
    }
  ],
  "crossPlatformStrategy": "Overall strategy for maximizing creator program earnings across all platforms",
  "quickWins": ["Programs closest to eligibility that can be achieved fastest"],
  "longTermGoals": ["Higher-tier programs to work toward"]
}`;

  try {
    const response = await callClaudeBackground({
      model: CLAUDE_MODELS.opus,
      prompt,
      maxTokens: 4000,
    });

    const content = response.content;
    if (!content) return null;

    const recommendations = JSON.parse(content);

    for (const rec of recommendations.prioritizedPrograms || []) {
      const matchingProgram = programs.find(
        p => p.programName === rec.programName && p.platform === rec.platform,
      );
      if (matchingProgram) {
        await db.update(platformGrowthPrograms)
          .set({
            aiRecommendations: {
              strategy: rec.strategy,
              priority: rec.priority,
              estimatedTimeToEligible: rec.estimatedTimeToEligible,
              actionItems: rec.actionItems,
            },
            lastChecked: new Date(),
          })
          .where(eq(platformGrowthPrograms.id, matchingProgram.id));
      }
    }

    return recommendations;
  } catch (err) {
    logger.error("[GrowthPrograms] AI error:", err);
    return null;
  }
}

export async function autoDetectAndUpdateMetrics(userId: string) {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const programs = await getUserGrowthPrograms(userId);

  for (const channel of userChannels) {
    const platformPrograms = programs.filter(p => p.platform === channel.platform);
    const pd = (channel.platformData || {}) as Record<string, any>;

    for (const program of platformPrograms) {
      const metricUpdates: { metric: string; current: number }[] = [];

      const requirements = (program.requirements || []) as { metric: string; current: number; target: number; met: boolean }[];

      for (const req of requirements) {
        const metricLower = req.metric.toLowerCase();

        if (metricLower.includes("subscriber") || metricLower.includes("follower") || metricLower.includes("member")) {
          const count = channel.subscriberCount
            || pd.guildCount
            || pd.patronCount
            || 0;
          if (count > 0) {
            metricUpdates.push({ metric: req.metric, current: count });
          }
        }

        if ((metricLower.includes("video") && (metricLower.includes("count") || metricLower.includes("upload")))
            || metricLower.includes("valid uploads")) {
          if (channel.videoCount) {
            metricUpdates.push({ metric: req.metric, current: channel.videoCount });
          }
        }

        if (metricLower.includes("view") && !metricLower.includes("viewer")) {
          const views = channel.viewCount
            || pd.totalViewCount
            || pd.recentVideoViews
            || pd.likesCount
            || 0;
          if (views > 0) {
            metricUpdates.push({ metric: req.metric, current: views });
          }
        }

        if (metricLower.includes("impression")) {
          if (pd.totalImpressions) {
            metricUpdates.push({ metric: req.metric, current: Number(pd.totalImpressions) });
          }
        }

        if (metricLower.includes("active") && metricLower.includes("account")) {
          metricUpdates.push({ metric: req.metric, current: 1 });
        }

        if (metricLower.includes("subscription") || metricLower.includes("premium")) {
          if (pd.premiumType || pd.product === "premium") {
            metricUpdates.push({ metric: req.metric, current: 1 });
          }
        }

        if (metricLower.includes("server age") || metricLower.includes("account age")) {
          const createdAt = channel.createdAt ? new Date(channel.createdAt).getTime() : 0;
          if (createdAt > 0) {
            const ageDays = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
            metricUpdates.push({ metric: req.metric, current: ageDays });
          }
        }

        if (metricLower.includes("communicator") || metricLower.includes("active member")) {
          if (pd.guildCount) {
            metricUpdates.push({ metric: req.metric, current: Math.round(pd.guildCount * 0.1) });
          }
        }

        if (metricLower.includes("broadcast") || metricLower.includes("stream hour")) {
          if (pd.broadcasterType === "affiliate" || pd.broadcasterType === "partner") {
            metricUpdates.push({ metric: req.metric, current: req.target });
          }
        }

        if (metricLower.includes("concurrent") || metricLower.includes("avg") && metricLower.includes("viewer")) {
          if (pd.broadcasterType === "partner") {
            metricUpdates.push({ metric: req.metric, current: req.target });
          } else if (pd.broadcasterType === "affiliate") {
            metricUpdates.push({ metric: req.metric, current: Math.min(req.target, 10) });
          }
        }

        if (metricLower.includes("age") && metricLower.includes("year")) {
          // Age verification not available from platform APIs - user must confirm manually
        }
      }

      if (metricUpdates.length > 0) {
        await updateProgramMetrics(userId, program.id, metricUpdates);
      }
    }
  }

  await checkAndNotifyEligible(userId);
}

export async function toggleAutoApply(userId: string, programId: number, enabled: boolean) {
  const [program] = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.id, programId),
      eq(platformGrowthPrograms.userId, userId),
    ));
  if (!program) return null;

  const [updated] = await db.update(platformGrowthPrograms)
    .set({ autoApplyEnabled: enabled })
    .where(eq(platformGrowthPrograms.id, programId))
    .returning();

  if (enabled) {
    checkAndNotifyEligible(userId).catch(err =>
      logger.error("[GrowthPrograms] Background eligibility check error:", err)
    );
  }

  return updated;
}

export async function updateApplicationStatus(
  userId: string,
  programId: number,
  status: string,
) {
  const [program] = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.id, programId),
      eq(platformGrowthPrograms.userId, userId),
    ));
  if (!program) return null;

  if (status === "approved") {
    return activateMonetization(userId, programId);
  }

  const [updated] = await db.update(platformGrowthPrograms)
    .set({ applicationStatus: status })
    .where(eq(platformGrowthPrograms.id, programId))
    .returning();
  return updated;
}

async function checkAndNotifyEligible(userId: string) {
  const programs = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.userId, userId),
      eq(platformGrowthPrograms.eligibilityMet, true),
    ));

  for (const program of programs) {
    if (program.applicationStatus === "not_applied" && !program.notifiedAt && program.autoApplyEnabled) {
      const guide = await generateApplicationGuide(program.platform, program.programName, program.applicationUrl || "");

      await db.update(platformGrowthPrograms)
        .set({
          notifiedAt: new Date(),
          applicationStatus: "ready_to_apply",
          applicationGuide: guide,
        })
        .where(eq(platformGrowthPrograms.id, program.id));

      try {
        const { storage } = await import("./storage");
        await storage.createNotification({
          userId,
          title: `Ready to Apply: ${program.programName}`,
          message: `You now meet all requirements for ${program.programName} on ${program.platform}! Click Apply to open the official application page.`,
          type: "growth_program",
          priority: "high",
          actionUrl: program.applicationUrl || `/settings?tab=growth`,
        } as any);
      } catch (err) {
        logger.error("[GrowthPrograms] Notification error:", err);
      }
    }
  }
}

export async function enableAutoApplyForPlatform(userId: string, platform: string) {
  await initializeGrowthPrograms(userId);
  const programs = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.userId, userId),
      eq(platformGrowthPrograms.platform, platform),
    ));

  for (const program of programs) {
    if (!program.autoApplyEnabled) {
      await db.update(platformGrowthPrograms)
        .set({ autoApplyEnabled: true })
        .where(eq(platformGrowthPrograms.id, program.id));
    }
  }

}

export async function activateMonetization(userId: string, programId: number) {
  const [program] = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.id, programId),
      eq(platformGrowthPrograms.userId, userId),
    ));
  if (!program) return null;

  const [updated] = await db.update(platformGrowthPrograms)
    .set({
      monetizationActive: true,
      applicationStatus: "approved",
      complianceStatus: "compliant",
      lastComplianceCheck: new Date(),
    })
    .where(eq(platformGrowthPrograms.id, programId))
    .returning();

  try {
    const { storage } = await import("./storage");
    await storage.createNotification({
      userId,
      title: `Monetization Active: ${program.programName}`,
      message: `${program.programName} is now active! CreatorOS will monitor compliance to protect your monetization status.`,
      type: "growth_program",
      priority: "high",
      actionUrl: `/settings?tab=growth`,
    } as any);
  } catch (err) {
    logger.error("[GrowthPrograms] Activation notification error:", err);
  }

  return updated;
}

export async function runComplianceCheck(userId: string) {
  await autoDetectAndUpdateMetrics(userId);

  const programs = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.userId, userId),
      eq(platformGrowthPrograms.monetizationActive, true),
    ));

  if (programs.length === 0) return [];

  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const results: { programId: number; programName: string; platform: string; status: string; risks: any[] }[] = [];

  for (const program of programs) {
    const channel = userChannels.find(c => c.platform === program.platform);
    const requirements = (program.requirements || []) as { metric: string; current: number; target: number; met: boolean }[];
    const risks: { risk: string; severity: string; recommendation: string }[] = [];

    for (const req of requirements) {
      if (!req.met) {
        const pct = req.target > 0 ? (req.current / req.target) * 100 : 0;
        risks.push({
          risk: `${req.metric} below requirement (${req.current}/${req.target})`,
          severity: pct < 50 ? "critical" : pct < 80 ? "warning" : "info",
          recommendation: getComplianceRecommendation(req.metric, program.platform),
        });
      } else {
        const buffer = req.target > 0 ? ((req.current - req.target) / req.target) * 100 : 100;
        if (buffer < 10 && buffer >= 0) {
          risks.push({
            risk: `${req.metric} barely above minimum (${req.current}/${req.target}) - only ${buffer.toFixed(0)}% buffer`,
            severity: "warning",
            recommendation: `Grow your ${req.metric.toLowerCase()} to maintain a safe buffer above the minimum requirement.`,
          });
        }
      }
    }

    if (!channel) {
      risks.push({
        risk: "Channel not connected",
        severity: "critical",
        recommendation: "Reconnect your channel to maintain platform compliance.",
      });
    }

    const complianceStatus = risks.some(r => r.severity === "critical") ? "at_risk"
      : risks.some(r => r.severity === "warning") ? "warning"
      : "compliant";

    await db.update(platformGrowthPrograms)
      .set({
        complianceStatus,
        complianceRisks: risks.length > 0 ? risks : null,
        lastComplianceCheck: new Date(),
      })
      .where(eq(platformGrowthPrograms.id, program.id));

    if (complianceStatus === "at_risk") {
      try {
        const { storage } = await import("./storage");
        await storage.createNotification({
          userId,
          title: `Compliance Risk: ${program.programName}`,
          message: `Your ${program.programName} status is at risk. ${risks.filter(r => r.severity === "critical").map(r => r.risk).join(". ")}`,
          type: "growth_program",
          priority: "high",
          actionUrl: `/settings?tab=growth`,
        } as any);
      } catch (err) {
        logger.error("[GrowthPrograms] Compliance notification error:", err);
      }
    }

    results.push({
      programId: program.id,
      programName: program.programName,
      platform: program.platform,
      status: complianceStatus,
      risks,
    });
  }

  return results;
}

function getComplianceRecommendation(metric: string, platform: string): string {
  const m = metric.toLowerCase();
  if (m.includes("subscriber") || m.includes("follower")) {
    return `Increase ${platform} content frequency and cross-promote from other platforms to recover ${metric.toLowerCase()}.`;
  }
  if (m.includes("watch hour") || m.includes("view")) {
    return `Create more engaging long-form content and optimize titles/thumbnails to boost ${metric.toLowerCase()}.`;
  }
  if (m.includes("stream") || m.includes("broadcast")) {
    return `Maintain a consistent streaming schedule to meet the minimum ${metric.toLowerCase()} requirement.`;
  }
  if (m.includes("viewer") || m.includes("communicator")) {
    return `Engage your community more actively and use raids/hosts to maintain ${metric.toLowerCase()}.`;
  }
  return `Take action to maintain your ${metric.toLowerCase()} above the minimum threshold.`;
}

export async function generateApplicationGuide(
  platform: string,
  programName: string,
  applicationUrl: string,
) {
  const programDef = KNOWN_PROGRAMS.find(p => p.platform === platform && p.programName === programName);

  const prompt = `You are a creator monetization expert. Generate a step-by-step application guide for applying to "${programName}" on ${platform}.

APPLICATION URL: ${applicationUrl}

PROGRAM BENEFITS: ${programDef ? programDef.benefits.join(", ") : "Various monetization benefits"}

Provide practical, specific steps the creator should follow to apply. Include tips for getting approved and what to write/select during the application.

Respond as JSON:
{
  "steps": ["Step 1: Go to ${applicationUrl}", "Step 2: ...", "Step 3: ..."],
  "tips": ["Tip for getting approved faster", "What reviewers look for"],
  "estimatedTime": "e.g. 5 minutes",
  "whatToSay": "If there is a free-text field in the application, this is what to write (content creator focused on...)"
}`;

  try {
    const response = await callClaudeBackground({
      model: CLAUDE_MODELS.opus,
      prompt,
      maxTokens: 4000,
    });

    const content = response.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (err) {
    logger.error("[GrowthPrograms] Guide generation error:", err);
    return {
      steps: [
        `Go to ${applicationUrl}`,
        "Sign in with your creator account",
        "Follow the on-screen application steps",
        "Submit your application and wait for review",
      ],
      tips: [
        "Ensure your channel has original content",
        "Make sure your profile is complete with description and avatar",
        "Having consistent upload schedule helps approval",
      ],
      estimatedTime: "5-10 minutes",
      whatToSay: "I'm a content creator producing original, high-quality entertainment and educational content.",
    };
  }
}
