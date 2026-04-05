import { db } from "../db";
import {
  checkoutSessions,
  sponsorInvoices,
  operatorBriefs,
  revenueRecords,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export async function startCheckout(
  userId: string,
  offerType: string,
  amount: number,
  customerEmail: string,
  contentId?: string,
  ctaId?: number,
  metadata: Record<string, any> = {},
): Promise<{ sessionId: number; status: string }> {
  const [inserted] = await db.insert(checkoutSessions).values({
    userId,
    contentId,
    ctaId,
    offerType,
    amount,
    customerEmail,
    status: "pending",
    metadata,
  }).returning();

  return { sessionId: inserted.id, status: "pending" };
}

export async function completeCheckout(
  userId: string,
  sessionId: number,
): Promise<{ success: boolean; status: string; amount: number }> {
  const [session] = await db.select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.userId, userId)))
    .limit(1);

  if (!session) return { success: false, status: "not_found", amount: 0 };
  if (session.status === "completed") return { success: true, status: "already_completed", amount: session.amount };

  await db.update(checkoutSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(checkoutSessions.id, sessionId));

  return { success: true, status: "completed", amount: session.amount };
}

export async function reconcileMoneyEvent(
  userId: string,
  sessionId: number,
): Promise<{ reconciled: boolean; sessionStatus: string; revenueRecordId?: number }> {
  const [session] = await db.select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.userId, userId)))
    .limit(1);

  if (!session) return { reconciled: false, sessionStatus: "not_found" };
  if (session.status !== "completed") return { reconciled: false, sessionStatus: session.status! };

  const [rev] = await db.insert(revenueRecords).values({
    userId,
    platform: "direct",
    source: session.offerType!,
    amount: session.amount,
    currency: session.currency || "USD",
    period: new Date().toISOString().slice(0, 7),
    syncSource: "checkout",
    externalId: `checkout_${sessionId}`,
    metadata: { checkoutSessionId: sessionId, contentId: session.contentId },
  }).returning({ id: revenueRecords.id });

  return { reconciled: true, sessionStatus: "completed", revenueRecordId: rev.id };
}

export async function attributeRevenueToContent(
  userId: string,
  revenueRecordId: number,
  contentId: string,
): Promise<{ attributed: boolean; contentId: string }> {
  await db.update(revenueRecords)
    .set({ metadata: { attributedContentId: contentId } })
    .where(and(eq(revenueRecords.id, revenueRecordId), eq(revenueRecords.userId, userId)));

  return { attributed: true, contentId };
}

export async function createSponsorInvoice(
  userId: string,
  dealId: string,
  brandName: string,
  amount: number,
  dueInDays: number = 30,
): Promise<{ invoiceId: number; status: string }> {
  const now = new Date();
  const dueAt = new Date(now.getTime() + dueInDays * 24 * 60 * 60 * 1000);

  const [inserted] = await db.insert(sponsorInvoices).values({
    userId,
    dealId,
    brandName,
    amount,
    status: "draft",
    dueAt,
  }).returning();

  return { invoiceId: inserted.id, status: "draft" };
}

export async function issueSponsorInvoice(
  userId: string,
  invoiceId: number,
): Promise<boolean> {
  const [updated] = await db.update(sponsorInvoices)
    .set({ status: "issued", issuedAt: new Date() })
    .where(and(eq(sponsorInvoices.id, invoiceId), eq(sponsorInvoices.userId, userId)))
    .returning({ id: sponsorInvoices.id });
  return !!updated;
}

export async function markInvoicePaid(
  userId: string,
  invoiceId: number,
): Promise<boolean> {
  const [updated] = await db.update(sponsorInvoices)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(sponsorInvoices.id, invoiceId), eq(sponsorInvoices.userId, userId)))
    .returning({ id: sponsorInvoices.id });
  return !!updated;
}

export async function sendInvoiceReminder(
  userId: string,
  invoiceId: number,
): Promise<boolean> {
  const [updated] = await db.update(sponsorInvoices)
    .set({ reminderSentAt: new Date() })
    .where(and(eq(sponsorInvoices.id, invoiceId), eq(sponsorInvoices.userId, userId)))
    .returning({ id: sponsorInvoices.id });
  return !!updated;
}

export async function getInvoiceLifecycle(
  userId: string,
  invoiceId: number,
): Promise<{ id: number; status: string; amount: number; brandName: string; issuedAt: Date | null; paidAt: Date | null; reminderSentAt: Date | null } | null> {
  const [row] = await db.select()
    .from(sponsorInvoices)
    .where(and(eq(sponsorInvoices.id, invoiceId), eq(sponsorInvoices.userId, userId)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    status: row.status!,
    amount: row.amount,
    brandName: row.brandName,
    issuedAt: row.issuedAt,
    paidAt: row.paidAt,
    reminderSentAt: row.reminderSentAt,
  };
}

export async function generateOperatorBrief(
  userId: string,
  briefType: "daily" | "weekly",
  telemetry: {
    totalRevenue?: number;
    activeDeals?: number;
    pendingInvoices?: number;
    contentCount?: number;
    audienceSize?: number;
    engagementRate?: number;
    topContent?: string;
    recentMilestone?: string;
  },
): Promise<{ briefId: number; summary: string; nextBestMove: string; topActions: string[] }> {
  const topActions: string[] = [];
  let nextBestMove = "";

  if (telemetry.pendingInvoices && telemetry.pendingInvoices > 0) {
    topActions.push(`Follow up on ${telemetry.pendingInvoices} pending invoice(s)`);
  }
  if (telemetry.activeDeals && telemetry.activeDeals > 0) {
    topActions.push(`Advance ${telemetry.activeDeals} active sponsor deal(s)`);
  }
  if (telemetry.engagementRate && telemetry.engagementRate > 5) {
    topActions.push("Audience engagement is high — launch a monetization offer now");
  }
  if (telemetry.audienceSize && telemetry.audienceSize > 10000 && (!telemetry.activeDeals || telemetry.activeDeals === 0)) {
    topActions.push("Audience supports sponsorships — begin outreach to brands");
  }
  if (telemetry.topContent) {
    topActions.push(`Double down on content like "${telemetry.topContent}" — it drives the most revenue`);
  }

  if (topActions.length === 0) {
    topActions.push("Continue building content pipeline and growing audience");
  }

  nextBestMove = topActions[0];

  const revenueLine = telemetry.totalRevenue !== undefined ? `$${telemetry.totalRevenue.toFixed(2)} total revenue` : "No revenue data";
  const audienceLine = telemetry.audienceSize ? `${telemetry.audienceSize.toLocaleString()} audience` : "";
  const milestoneLine = telemetry.recentMilestone ? ` | Recent milestone: ${telemetry.recentMilestone}` : "";

  const summary = `${briefType === "daily" ? "Daily" : "Weekly"} Brief: ${revenueLine}${audienceLine ? ` | ${audienceLine}` : ""}${milestoneLine} | ${topActions.length} action(s) identified.`;

  const [inserted] = await db.insert(operatorBriefs).values({
    userId,
    briefType,
    summary,
    nextBestMove,
    topActions,
    telemetrySnapshot: telemetry as Record<string, any>,
  }).returning();

  return { briefId: inserted.id, summary, nextBestMove, topActions };
}
