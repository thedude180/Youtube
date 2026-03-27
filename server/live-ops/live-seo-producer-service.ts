import { db } from "../db";
import { liveSeoActions, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export async function proposeTitle(
  sessionId: number, userId: string, platform: string,
  currentTitle: string, proposedTitle: string,
  triggerSignal: string, signalSource?: string
): Promise<any> {
  const recentTitleChanges = await db.select()
    .from(liveSeoActions)
    .where(and(
      eq(liveSeoActions.sessionId, sessionId),
      eq(liveSeoActions.field, "title"),
      gte(liveSeoActions.proposedAt, new Date(Date.now() - 15 * 60 * 1000))
    ));

  const volatilityCheck = recentTitleChanges.length < 3;
  const approvalClass = !volatilityCheck ? "red" : recentTitleChanges.length > 0 ? "yellow" : "green";
  const trustCost = recentTitleChanges.length * 0.1;

  const [action] = await db.insert(liveSeoActions).values({
    sessionId, userId, platform,
    actionType: "title_update", field: "title",
    previousValue: currentTitle, newValue: proposedTitle,
    triggerSignal, signalSource,
    trustCost, approved: approvalClass === "green",
    approvalClass, volatilityCheck,
    status: approvalClass === "green" ? "applied" : "proposed",
    appliedAt: approvalClass === "green" ? new Date() : undefined,
  }).returning();

  appendEvent("seo_producer.title_proposed", "live", "seo_producer", {
    actionId: action.id, platform, approvalClass, triggerSignal,
  }, "live-seo-producer-service");

  return action;
}

export async function proposeTags(
  sessionId: number, userId: string, platform: string,
  currentTags: string[], proposedTags: string[],
  triggerSignal: string
): Promise<any> {
  const [action] = await db.insert(liveSeoActions).values({
    sessionId, userId, platform,
    actionType: "tags_update", field: "tags",
    previousValue: JSON.stringify(currentTags),
    newValue: JSON.stringify(proposedTags),
    triggerSignal, trustCost: 0.05,
    approved: true, approvalClass: "green",
    volatilityCheck: true, status: "applied",
    appliedAt: new Date(),
  }).returning();

  return action;
}

export async function proposeCategory(
  sessionId: number, userId: string, platform: string,
  currentCategory: string, proposedCategory: string,
  triggerSignal: string
): Promise<any> {
  const approvalClass = "yellow";

  const [action] = await db.insert(liveSeoActions).values({
    sessionId, userId, platform,
    actionType: "category_update", field: "category",
    previousValue: currentCategory, newValue: proposedCategory,
    triggerSignal, trustCost: 0.15,
    approved: false, approvalClass,
    volatilityCheck: true, status: "proposed",
  }).returning();

  return action;
}

export async function proposeDescription(
  sessionId: number, userId: string, platform: string,
  currentDesc: string, proposedDesc: string,
  triggerSignal: string
): Promise<any> {
  const [action] = await db.insert(liveSeoActions).values({
    sessionId, userId, platform,
    actionType: "description_update", field: "description",
    previousValue: currentDesc.substring(0, 500),
    newValue: proposedDesc.substring(0, 500),
    triggerSignal, trustCost: 0.08,
    approved: false, approvalClass: "yellow",
    volatilityCheck: true, status: "proposed",
  }).returning();

  return action;
}

export async function approveSeoAction(userId: string, actionId: number): Promise<boolean> {
  const actions = await db.select()
    .from(liveSeoActions)
    .where(and(eq(liveSeoActions.id, actionId), eq(liveSeoActions.userId, userId)))
    .limit(1);

  if (actions.length === 0 || actions[0].status !== "proposed") return false;

  await db.update(liveSeoActions)
    .set({ approved: true, status: "applied", appliedAt: new Date() })
    .where(eq(liveSeoActions.id, actionId));

  appendEvent("seo_producer.action_approved", "live", "seo_producer", {
    actionId, field: actions[0].field,
  }, "live-seo-producer-service");

  return true;
}

export async function rejectSeoAction(userId: string, actionId: number): Promise<boolean> {
  const actions = await db.select()
    .from(liveSeoActions)
    .where(and(eq(liveSeoActions.id, actionId), eq(liveSeoActions.userId, userId)))
    .limit(1);

  if (actions.length === 0 || actions[0].status !== "proposed") return false;

  await db.update(liveSeoActions)
    .set({ status: "rejected" })
    .where(eq(liveSeoActions.id, actionId));

  return true;
}

export async function getSeoVolatility(sessionId: number, userId?: string): Promise<any> {
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const conditions = [eq(liveSeoActions.sessionId, sessionId), gte(liveSeoActions.proposedAt, since)];
  if (userId) conditions.push(eq(liveSeoActions.userId, userId));

  const actions = await db.select()
    .from(liveSeoActions)
    .where(and(...conditions));

  const titleChanges = actions.filter(a => a.field === "title").length;
  const totalTrustCost = actions.reduce((s, a) => s + (a.trustCost || 0), 0);

  return {
    totalActions: actions.length,
    titleChanges,
    totalTrustCost,
    volatilityLevel: titleChanges > 5 ? "dangerous" : titleChanges > 3 ? "high" : titleChanges > 1 ? "moderate" : "low",
    recommendation: titleChanges > 3 ? "Stop title changes — trust budget at risk" :
      titleChanges > 1 ? "Reduce title change frequency" : "SEO posture healthy",
  };
}
