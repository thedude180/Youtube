import { db } from "../db";
import {
  ownedContacts,
  sequenceEnrollments,
  contentCtaAttachments,
  offerRecommendations,
  packagingInsights,
  deliverabilityRecords,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function captureContact(
  userId: string,
  email: string,
  source: string,
  consentGiven: boolean,
  consentMethod: string,
  metadata: Record<string, any> = {},
): Promise<{ contactId: number; alreadyExists: boolean }> {
  const existing = await db.select()
    .from(ownedContacts)
    .where(and(eq(ownedContacts.userId, userId), eq(ownedContacts.email, email)))
    .limit(1);

  if (existing.length > 0) {
    return { contactId: existing[0].id, alreadyExists: true };
  }

  const [inserted] = await db.insert(ownedContacts).values({
    userId,
    email,
    source,
    consentGiven,
    consentMethod,
    metadata,
  }).returning({ id: ownedContacts.id });

  return { contactId: inserted.id, alreadyExists: false };
}

export async function segmentContact(
  userId: string,
  contactId: number,
  segmentId: string,
): Promise<boolean> {
  const [updated] = await db.update(ownedContacts)
    .set({ segmentId })
    .where(and(eq(ownedContacts.id, contactId), eq(ownedContacts.userId, userId)))
    .returning({ id: ownedContacts.id });

  return !!updated;
}

export async function enrollInSequence(
  userId: string,
  contactId: number,
  sequenceName: string,
  metadata: Record<string, any> = {},
): Promise<{ enrollmentId: number; alreadyEnrolled: boolean }> {
  const existing = await db.select()
    .from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.userId, userId),
      eq(sequenceEnrollments.contactId, contactId),
      eq(sequenceEnrollments.sequenceName, sequenceName),
    ))
    .limit(1);

  if (existing.length > 0 && existing[0].status === "enrolled") {
    return { enrollmentId: existing[0].id, alreadyEnrolled: true };
  }

  const [inserted] = await db.insert(sequenceEnrollments).values({
    userId,
    contactId,
    sequenceName,
    step: 0,
    status: "enrolled",
    metadata,
  }).returning({ id: sequenceEnrollments.id });

  return { enrollmentId: inserted.id, alreadyEnrolled: false };
}

export async function attachCtaToContent(
  userId: string,
  contentId: string,
  ctaType: string,
  ctaText: string,
  ctaUrl?: string,
  position: string = "end",
  offerId?: number,
): Promise<number> {
  const [inserted] = await db.insert(contentCtaAttachments).values({
    userId,
    contentId,
    ctaType,
    ctaText,
    ctaUrl,
    position,
    offerId,
  }).returning({ id: contentCtaAttachments.id });

  return inserted.id;
}

export async function generateOfferRecommendation(
  userId: string,
  contentId: string,
  signals: {
    viewCount?: number;
    engagementRate?: number;
    audienceSize?: number;
    videoType?: string;
    game?: string;
    watchTimeMinutes?: number;
  },
): Promise<{ recommendationId: number; offerType: string; offerName: string; reasoning: string; confidence: number }> {
  let offerType = "membership";
  let offerName = "Channel Membership";
  let reasoning = "Default recommendation for audience engagement";
  let confidence = 0.5;

  if (signals.engagementRate && signals.engagementRate > 5) {
    offerType = "premium_content";
    offerName = "Exclusive Walkthrough Guide";
    reasoning = `High engagement rate (${signals.engagementRate.toFixed(1)}%) indicates audience willing to pay for premium content`;
    confidence = 0.8;
  } else if (signals.viewCount && signals.viewCount > 50000) {
    offerType = "merch";
    offerName = "Gaming Merch Collection";
    reasoning = `High view count (${signals.viewCount.toLocaleString()}) suggests strong brand recognition for merchandise`;
    confidence = 0.75;
  } else if (signals.watchTimeMinutes && signals.watchTimeMinutes > 30) {
    offerType = "course";
    offerName = "Game Mastery Course";
    reasoning = `Long watch time (${signals.watchTimeMinutes}min) indicates dedicated audience ready for educational content`;
    confidence = 0.7;
  } else if (signals.audienceSize && signals.audienceSize > 10000) {
    offerType = "membership";
    offerName = "VIP Community Access";
    reasoning = `Audience size (${signals.audienceSize.toLocaleString()}) supports a membership model`;
    confidence = 0.65;
  }

  if (signals.game) {
    offerName = `${signals.game} ${offerName}`;
    reasoning += ` — game-specific offer for ${signals.game}`;
    confidence = Math.min(1, confidence + 0.05);
  }

  const [inserted] = await db.insert(offerRecommendations).values({
    userId,
    contentId,
    offerType,
    offerName,
    reasoning,
    confidence,
    signals: signals as Record<string, any>,
  }).returning();

  return { recommendationId: inserted.id, offerType, offerName, reasoning, confidence: confidence };
}

export async function recordPackagingInsight(
  userId: string,
  contentId: string,
  platform: string,
  insightType: string,
  insight: string,
  impactedRecommendation?: string,
): Promise<number> {
  const [inserted] = await db.insert(packagingInsights).values({
    userId,
    contentId,
    platform,
    insightType,
    insight,
    impactedRecommendation,
  }).returning({ id: packagingInsights.id });

  return inserted.id;
}

export async function applyPackagingInsightToRecommendation(
  userId: string,
  insightId: number,
  recommendationId: number,
): Promise<{ changed: boolean; originalOffer: string; newOffer: string; reason: string }> {
  const [insightRow] = await db.select()
    .from(packagingInsights)
    .where(and(eq(packagingInsights.id, insightId), eq(packagingInsights.userId, userId)))
    .limit(1);

  const [recRow] = await db.select()
    .from(offerRecommendations)
    .where(and(eq(offerRecommendations.id, recommendationId), eq(offerRecommendations.userId, userId)))
    .limit(1);

  if (!insightRow || !recRow) {
    return { changed: false, originalOffer: "", newOffer: "", reason: "Not found" };
  }

  const originalOffer = recRow.offerName;
  let newOffer = originalOffer;
  let reason = "";

  if (insightRow.insightType === "platform_monetization_mismatch") {
    newOffer = `${insightRow.platform}-optimized ${recRow.offerType}`;
    reason = `Packaging insight revealed ${insightRow.platform} monetization patterns differ — adjusted offer to platform-specific format`;
  } else if (insightRow.insightType === "audience_overlap") {
    newOffer = `Cross-platform ${recRow.offerName}`;
    reason = `Audience overlap insight suggests cross-platform bundling opportunity`;
  } else {
    newOffer = `${recRow.offerName} (refined)`;
    reason = `Packaging insight applied: ${insightRow.insight}`;
  }

  await db.update(offerRecommendations)
    .set({ offerName: newOffer })
    .where(eq(offerRecommendations.id, recommendationId));

  await db.update(packagingInsights)
    .set({ impactedRecommendation: newOffer, appliedAt: new Date() })
    .where(eq(packagingInsights.id, insightId));

  return { changed: true, originalOffer, newOffer, reason };
}

export async function recordDeliverability(
  userId: string,
  contactId: number,
  channel: string,
  status: "delivered" | "bounced" | "suppressed" | "complaint",
  bounceType?: string,
  reason?: string,
): Promise<number> {
  const [inserted] = await db.insert(deliverabilityRecords).values({
    userId,
    contactId,
    channel,
    status,
    bounceType,
    reason,
    suppressedAt: status === "suppressed" ? new Date() : undefined,
  }).returning({ id: deliverabilityRecords.id });

  if (status === "bounced" && bounceType === "hard") {
    await db.update(ownedContacts)
      .set({ status: "suppressed" })
      .where(eq(ownedContacts.id, contactId));
  }

  if (status === "complaint") {
    await db.update(ownedContacts)
      .set({ status: "suppressed" })
      .where(eq(ownedContacts.id, contactId));
  }

  return inserted.id;
}

export async function getSuppressionList(userId: string): Promise<{ contactId: number; email: string; reason: string }[]> {
  const suppressed = await db.select({
    id: ownedContacts.id,
    email: ownedContacts.email,
    status: ownedContacts.status,
  })
    .from(ownedContacts)
    .where(and(eq(ownedContacts.userId, userId), eq(ownedContacts.status, "suppressed")));

  return suppressed.map(s => ({
    contactId: s.id,
    email: s.email,
    reason: "Hard bounce or complaint — automatically suppressed",
  }));
}

export async function isContactSuppressed(userId: string, contactId: number): Promise<boolean> {
  const [contact] = await db.select({ status: ownedContacts.status })
    .from(ownedContacts)
    .where(and(eq(ownedContacts.id, contactId), eq(ownedContacts.userId, userId)))
    .limit(1);

  return contact?.status === "suppressed";
}
