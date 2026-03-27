import { db } from "../db";
import { liveCommunityActions, liveEngagementPrompts, liveChatIntentClusters, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const BRAND_SAFE_GREETING_TEMPLATES = [
  "Welcome to the stream! Enjoy the gameplay.",
  "Hey there! Thanks for tuning in.",
  "Welcome! Sit back and enjoy the vibes.",
];

const LOW_RISK_ACTION_TYPES = [
  "greeting", "faq_reply", "poll_launch", "community_prompt",
  "milestone_acknowledgement", "clip_hype", "generic_thanks", "moment_chat_prompt"
] as const;

export async function executeGreeting(
  sessionId: number, userId: string, platform: string, targetUser?: string
): Promise<any> {
  const template = BRAND_SAFE_GREETING_TEMPLATES[Math.floor(Math.random() * BRAND_SAFE_GREETING_TEMPLATES.length)];

  const [action] = await db.insert(liveCommunityActions).values({
    sessionId, userId, actionType: "greeting", platform,
    content: targetUser ? `@${targetUser} ${template}` : template,
    targetUser, riskLevel: "low", approvalClass: "green",
    autoApproved: true, brandVoiceCompliant: true,
    triggerSignal: "viewer_join", status: "executed",
    executedAt: new Date(),
  }).returning();

  appendEvent("community_host.greeting", "live", "community_host", {
    actionId: action.id, platform, targetUser,
  }, "community-host-service");

  return action;
}

export async function executeFaqReply(
  sessionId: number, userId: string, platform: string,
  question: string, answer: string
): Promise<any> {
  const [action] = await db.insert(liveCommunityActions).values({
    sessionId, userId, actionType: "faq_reply", platform,
    content: answer, riskLevel: "low", approvalClass: "green",
    autoApproved: true, brandVoiceCompliant: true,
    triggerSignal: `faq:${question.substring(0, 50)}`, status: "executed",
    executedAt: new Date(),
  }).returning();

  appendEvent("community_host.faq_reply", "live", "community_host", {
    actionId: action.id, platform, question: question.substring(0, 100),
  }, "community-host-service");

  return action;
}

export async function launchPoll(
  sessionId: number, userId: string, platform: string,
  question: string, options: string[]
): Promise<any> {
  const [action] = await db.insert(liveCommunityActions).values({
    sessionId, userId, actionType: "poll_launch", platform,
    content: question, riskLevel: "low", approvalClass: "green",
    autoApproved: true, brandVoiceCompliant: true,
    triggerSignal: "engagement_dip", status: "executed",
    result: { question, options },
    executedAt: new Date(),
  }).returning();

  return action;
}

export async function acknowledgeMilestone(
  sessionId: number, userId: string, platform: string,
  milestoneType: string, details: string
): Promise<any> {
  const [action] = await db.insert(liveCommunityActions).values({
    sessionId, userId, actionType: "milestone_acknowledgement", platform,
    content: details, riskLevel: "low", approvalClass: "green",
    autoApproved: true, brandVoiceCompliant: true,
    triggerSignal: `milestone:${milestoneType}`, status: "executed",
    executedAt: new Date(),
  }).returning();

  return action;
}

export async function createEngagementPrompt(
  sessionId: number, userId: string, platform: string,
  promptType: string, content: string, autoDeployable: boolean = false
): Promise<any> {
  const riskLevel = autoDeployable ? "low" : "medium";

  const [prompt] = await db.insert(liveEngagementPrompts).values({
    sessionId, userId, promptType, content, platform,
    triggerSignal: "engagement_analysis",
    riskLevel, brandVoiceCompliant: true, autoDeployable,
    status: autoDeployable ? "deployed" : "ready",
    deployed: autoDeployable,
    deployedAt: autoDeployable ? new Date() : undefined,
  }).returning();

  return prompt;
}

export async function escalateHighRiskInteraction(
  sessionId: number, userId: string, platform: string,
  topic: string, content: string, targetUser?: string
): Promise<any> {
  const [action] = await db.insert(liveCommunityActions).values({
    sessionId, userId, actionType: "escalation", platform,
    content: `[ESCALATED] ${topic}: ${content}`,
    targetUser, riskLevel: "high", approvalClass: "red",
    autoApproved: false, brandVoiceCompliant: true,
    triggerSignal: `risky_topic:${topic}`, status: "pending",
  }).returning();

  appendEvent("community_host.escalation", "live", "community_host", {
    actionId: action.id, topic, platform,
  }, "community-host-service");

  return action;
}

export async function detectIntentClusters(
  sessionId: number, userId: string, platform: string,
  messages: Array<{ text: string; author: string }>
): Promise<any> {
  const clusters: Record<string, { count: number; users: Set<string>; samples: string[] }> = {};

  for (const msg of messages) {
    const intent = classifyBasicIntent(msg.text);
    if (!clusters[intent]) {
      clusters[intent] = { count: 0, users: new Set(), samples: [] };
    }
    clusters[intent].count++;
    clusters[intent].users.add(msg.author);
    if (clusters[intent].samples.length < 3) {
      clusters[intent].samples.push(msg.text.substring(0, 100));
    }
  }

  const results = [];
  for (const [intent, data] of Object.entries(clusters)) {
    if (data.count >= 2) {
      const [cluster] = await db.insert(liveChatIntentClusters).values({
        sessionId, userId, platform,
        clusterLabel: intent, intent,
        messageCount: data.count,
        uniqueUsers: data.users.size,
        actionable: data.count >= 5,
        autoResponseEligible: intent === "question" || intent === "greeting",
        sampleMessages: data.samples,
      }).returning();
      results.push(cluster);
    }
  }

  return results;
}

function classifyBasicIntent(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("?") || lower.startsWith("how") || lower.startsWith("what") || lower.startsWith("when") || lower.startsWith("why")) return "question";
  if (lower.includes("gg") || lower.includes("nice") || lower.includes("wow") || lower.includes("amazing")) return "hype";
  if (lower.includes("hi") || lower.includes("hello") || lower.includes("hey")) return "greeting";
  if (lower.includes("clip") || lower.includes("save") || lower.includes("highlight")) return "clip_request";
  if (lower.includes("lag") || lower.includes("buffer") || lower.includes("broken")) return "technical_issue";
  return "general";
}
