import { db } from "../db";
import { storage } from "../storage";
import {
  channelLaunchStates, launchMissions, firstVideoPlans,
  firstTenVideoRoadmaps, brandSetupTasks, monetizationReadinessSnapshots,
  beginnerProgressMilestones, onboardingSessions, users,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const LAUNCH_STEPS = [
  { step: 1, title: "Define channel identity", description: "Choose your channel name, niche, and what makes you unique" },
  { step: 2, title: "Choose your first content pillar", description: "Pick the main type of content you'll create" },
  { step: 3, title: "Choose your game / category focus", description: "Select your primary game or content category" },
  { step: 4, title: "Build brand basics", description: "Set up your profile picture, banner idea, and channel description" },
  { step: 5, title: "Generate first 3 video plan", description: "AI creates concepts for your first 3 videos" },
  { step: 6, title: "Generate first 10 video roadmap", description: "Build a runway of 10 video ideas to keep you consistent" },
  { step: 7, title: "Create monetization readiness roadmap", description: "Understand the path from zero to first revenue" },
  { step: 8, title: "Create YouTube channel", description: "Go to YouTube and create your channel — we'll guide you" },
  { step: 9, title: "Reconnect and verify", description: "Link your new YouTube channel to CreatorOS" },
  { step: 10, title: "Publish first asset", description: "Your AI team publishes your first piece of content" },
];

const MONETIZATION_STAGES = [
  { stage: 0, name: "Pre-Channel" },
  { stage: 1, name: "Pre-Eligibility" },
  { stage: 2, name: "Eligibility Readiness" },
  { stage: 3, name: "Early Revenue Activation" },
  { stage: 4, name: "Revenue Expansion" },
];

export async function initPreChannelState(userId: string) {
  const existing = await db.select().from(channelLaunchStates).where(eq(channelLaunchStates.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [state] = await db.insert(channelLaunchStates).values({
    userId,
    state: "pre_channel",
    stateData: {},
    channelIdentity: {},
    brandBasics: {},
    launchReadinessScore: 0,
    firstPublishReadinessScore: 0,
    monetizationReadinessScore: 0,
    beginnerMomentumScore: 0,
  }).returning();

  await db.insert(onboardingSessions).values({
    userId,
    sessionType: "pre_channel_launch",
    currentStep: 1,
    totalSteps: 10,
    stepData: {},
    completed: false,
    resumable: true,
  });

  for (const step of LAUNCH_STEPS) {
    await db.insert(launchMissions).values({
      userId,
      step: step.step,
      title: step.title,
      description: step.description,
      status: "pending",
      stepData: {},
    });
  }

  await db.insert(monetizationReadinessSnapshots).values({
    userId,
    stage: 0,
    stageName: "Pre-Channel",
    subscriberCount: 0,
    watchHours: 0,
    eligibilityProgress: { yppEligible: false, watchHoursNeeded: 4000, subscribersNeeded: 1000 },
    nonPlatformRevenuePaths: ["Merchandise", "Sponsorships", "Affiliate links", "Community support"],
  });

  await db.update(users).set({ channelLaunchState: "pre_channel" }).where(eq(users.id, userId));

  return state;
}

export async function getLaunchState(userId: string) {
  const [state] = await db.select().from(channelLaunchStates).where(eq(channelLaunchStates.userId, userId)).limit(1);
  return state || null;
}

export async function getLaunchMissions(userId: string) {
  return db.select().from(launchMissions).where(eq(launchMissions.userId, userId)).orderBy(launchMissions.step);
}

export async function completeLaunchStep(userId: string, step: number, data: Record<string, any> = {}) {
  const [mission] = await db.select().from(launchMissions)
    .where(and(eq(launchMissions.userId, userId), eq(launchMissions.step, step))).limit(1);
  if (!mission) return null;

  await db.update(launchMissions)
    .set({ status: "completed", stepData: data, completedAt: new Date() })
    .where(eq(launchMissions.id, mission.id));

  const [session] = await db.select().from(onboardingSessions)
    .where(and(eq(onboardingSessions.userId, userId), eq(onboardingSessions.sessionType, "pre_channel_launch"))).limit(1);
  if (session && step >= session.currentStep) {
    await db.update(onboardingSessions)
      .set({ currentStep: step + 1, updatedAt: new Date() })
      .where(eq(onboardingSessions.id, session.id));
  }

  const allMissions = await getLaunchMissions(userId);
  const completed = allMissions.filter(m => m.status === "completed").length;
  const readiness = Math.round((completed / allMissions.length) * 100);

  let newState: string | undefined;
  if (step === 1 || step === 2 || step === 3) {
    newState = "pre_channel";
  } else if (step === 8) {
    newState = "channel_created_not_connected";
  } else if (step === 9) {
    newState = "channel_connected_no_uploads";
  } else if (step === 10) {
    newState = "launch_active";
  }

  await db.update(channelLaunchStates).set({
    launchReadinessScore: readiness,
    beginnerMomentumScore: Math.min(100, completed * 12),
    ...(newState ? { state: newState } : {}),
    updatedAt: new Date(),
  }).where(eq(channelLaunchStates.userId, userId));

  if (newState) {
    await db.update(users).set({ channelLaunchState: newState }).where(eq(users.id, userId));
  }

  await recordMilestone(userId, `step_${step}_completed`, LAUNCH_STEPS[step - 1]?.title || `Step ${step}`);

  return { step, status: "completed", readinessScore: readiness };
}

export async function updateChannelIdentity(userId: string, identity: { name?: string; niche?: string; category?: string; description?: string }) {
  await db.update(channelLaunchStates).set({
    channelIdentity: identity,
    updatedAt: new Date(),
  }).where(eq(channelLaunchStates.userId, userId));
  return identity;
}

export async function updateBrandBasics(userId: string, basics: { profileDone?: boolean; bannerDone?: boolean; aboutDone?: boolean; thumbnailStyle?: string }) {
  await db.update(channelLaunchStates).set({
    brandBasics: basics,
    updatedAt: new Date(),
  }).where(eq(channelLaunchStates.userId, userId));
  return basics;
}

export async function generateFirstVideoPlan(userId: string, niche: string, category: string) {
  const existing = await db.select().from(firstVideoPlans).where(eq(firstVideoPlans.userId, userId));
  if (existing.length > 0) return existing;

  const concepts = [
    { videoNumber: 1, title: `My First ${category} Video — Let's Go!`, concept: `Introduction to your channel and first gameplay/content in ${category}. Keep it authentic and show your personality.`, thumbnailIdea: `Clean split: you + ${category} key art, bold text "EP.1"` },
    { videoNumber: 2, title: `${category} Tips Nobody Tells Beginners`, concept: `Share 3-5 quick tips or discoveries from your first session. Viewers love "I wish I knew this" content.`, thumbnailIdea: `Surprised expression + tip text overlay, bright contrast colors` },
    { videoNumber: 3, title: `Is ${category} Actually Worth It?`, concept: `Honest review/reaction format. High search potential, builds trust with new viewers.`, thumbnailIdea: `Thinking pose + rating scale graphic, question mark accent` },
  ];

  const plans = [];
  for (const c of concepts) {
    const [plan] = await db.insert(firstVideoPlans).values({
      userId,
      videoNumber: c.videoNumber,
      title: c.title,
      concept: c.concept,
      thumbnailIdea: c.thumbnailIdea,
      tags: [niche, category, "gaming", "new creator"],
      status: "planned",
      aiGenerated: true,
    }).returning();
    plans.push(plan);
  }
  return plans;
}

export async function generateFirstTenRoadmap(userId: string, niche: string, category: string) {
  const existing = await db.select().from(firstTenVideoRoadmaps).where(eq(firstTenVideoRoadmaps.userId, userId));
  if (existing.length > 0) return existing;

  const roadmapConcepts = [
    { videoNumber: 1, title: `My First ${category} Video`, contentPillar: "introduction", estimatedDuration: "8-12 min" },
    { videoNumber: 2, title: `${category} Tips Nobody Tells You`, contentPillar: "tips", estimatedDuration: "6-10 min" },
    { videoNumber: 3, title: `Is ${category} Worth Playing?`, contentPillar: "review", estimatedDuration: "10-15 min" },
    { videoNumber: 4, title: `${category} Challenge Run`, contentPillar: "challenge", estimatedDuration: "12-18 min" },
    { videoNumber: 5, title: `Ranking Every ${category} Feature`, contentPillar: "tier list", estimatedDuration: "8-12 min" },
    { videoNumber: 6, title: `${category} vs The Community`, contentPillar: "community", estimatedDuration: "10-15 min" },
    { videoNumber: 7, title: `Hidden Secrets in ${category}`, contentPillar: "discovery", estimatedDuration: "8-12 min" },
    { videoNumber: 8, title: `${category} — 1 Week Progress`, contentPillar: "progress", estimatedDuration: "10-14 min" },
    { videoNumber: 9, title: `What I Got Wrong About ${category}`, contentPillar: "reflection", estimatedDuration: "8-10 min" },
    { videoNumber: 10, title: `My ${category} Story So Far`, contentPillar: "milestone", estimatedDuration: "12-18 min" },
  ];

  const items = [];
  for (const c of roadmapConcepts) {
    const [item] = await db.insert(firstTenVideoRoadmaps).values({
      userId,
      videoNumber: c.videoNumber,
      title: c.title,
      concept: `${c.contentPillar} video for ${category} in the ${niche} space`,
      publishOrder: c.videoNumber,
      estimatedDuration: c.estimatedDuration,
      contentPillar: c.contentPillar,
      status: "planned",
    }).returning();
    items.push(item);
  }
  return items;
}

export async function getMonetizationReadiness(userId: string) {
  const [snapshot] = await db.select().from(monetizationReadinessSnapshots)
    .where(eq(monetizationReadinessSnapshots.userId, userId)).limit(1);
  return snapshot || null;
}

export async function updateMonetizationStage(userId: string, stage: number) {
  const info = MONETIZATION_STAGES[stage] || MONETIZATION_STAGES[0];
  await db.update(monetizationReadinessSnapshots).set({
    stage: info.stage,
    stageName: info.name,
  }).where(eq(monetizationReadinessSnapshots.userId, userId));

  const stateMap: Record<number, string> = {
    0: "pre_channel",
    1: "pre_monetization",
    2: "pre_monetization",
    3: "monetization_eligible",
    4: "monetization_active",
  };
  const newState = stateMap[stage];
  if (newState) {
    await db.update(users).set({ channelLaunchState: newState }).where(eq(users.id, userId));
  }
  return info;
}

export async function recordMilestone(userId: string, key: string, title: string, description?: string) {
  const existing = await db.select().from(beginnerProgressMilestones)
    .where(and(eq(beginnerProgressMilestones.userId, userId), eq(beginnerProgressMilestones.milestoneKey, key))).limit(1);
  if (existing.length > 0 && existing[0].achieved) return existing[0];

  if (existing.length > 0) {
    await db.update(beginnerProgressMilestones)
      .set({ achieved: true, achievedAt: new Date() })
      .where(eq(beginnerProgressMilestones.id, existing[0].id));
    return { ...existing[0], achieved: true };
  }

  const [milestone] = await db.insert(beginnerProgressMilestones).values({
    userId,
    milestoneKey: key,
    title,
    description,
    achieved: true,
    achievedAt: new Date(),
  }).returning();
  return milestone;
}

export async function getMilestones(userId: string) {
  return db.select().from(beginnerProgressMilestones)
    .where(eq(beginnerProgressMilestones.userId, userId))
    .orderBy(beginnerProgressMilestones.createdAt);
}

export async function getOnboardingSession(userId: string) {
  const [session] = await db.select().from(onboardingSessions)
    .where(and(eq(onboardingSessions.userId, userId), eq(onboardingSessions.sessionType, "pre_channel_launch"))).limit(1);
  return session || null;
}

export async function transitionToConnected(userId: string) {
  await db.update(channelLaunchStates).set({
    state: "channel_connected_no_uploads",
    updatedAt: new Date(),
  }).where(eq(channelLaunchStates.userId, userId));
  await db.update(users).set({ channelLaunchState: "channel_connected_no_uploads" }).where(eq(users.id, userId));
  await completeLaunchStep(userId, 9, { connectedAt: new Date().toISOString() });
}

export async function getFirstVideoPlans(userId: string) {
  return db.select().from(firstVideoPlans).where(eq(firstVideoPlans.userId, userId)).orderBy(firstVideoPlans.videoNumber);
}

export async function getFirstTenRoadmap(userId: string) {
  return db.select().from(firstTenVideoRoadmaps).where(eq(firstTenVideoRoadmaps.userId, userId)).orderBy(firstTenVideoRoadmaps.videoNumber);
}

export async function getBrandTasks(userId: string) {
  return db.select().from(brandSetupTasks).where(eq(brandSetupTasks.userId, userId)).orderBy(brandSetupTasks.createdAt);
}

export async function completeBrandTask(userId: string, taskId: number) {
  await db.update(brandSetupTasks)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(brandSetupTasks.id, taskId), eq(brandSetupTasks.userId, userId)));
}

export async function createBrandTasks(userId: string) {
  const existing = await getBrandTasks(userId);
  if (existing.length > 0) return existing;

  const tasks = [
    { taskType: "profile_picture", title: "Design your profile picture", description: "Your channel avatar — keep it simple, recognizable, and on-brand" },
    { taskType: "banner", title: "Create your channel banner", description: "The first thing visitors see — show your niche and upload schedule" },
    { taskType: "about_section", title: "Write your About section", description: "Tell viewers what your channel is about in 2-3 sentences" },
    { taskType: "thumbnail_style", title: "Choose your thumbnail style", description: "Pick a consistent look for your thumbnails — colors, fonts, layout" },
  ];

  const results = [];
  for (const t of tasks) {
    const [task] = await db.insert(brandSetupTasks).values({
      userId,
      taskType: t.taskType,
      title: t.title,
      description: t.description,
      status: "pending",
    }).returning();
    results.push(task);
  }
  return results;
}
