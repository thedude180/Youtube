import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import {
  checkoutSessions,
  sponsorInvoices,
  operatorBriefs,
  revenueRecords,
  contentCtaAttachments,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase5-done-criteria-user";

describe("Phase 5 Done Criteria", () => {
  beforeAll(async () => {
    await db.delete(operatorBriefs).where(eq(operatorBriefs.userId, TEST_USER)).catch(() => {});
    await db.delete(sponsorInvoices).where(eq(sponsorInvoices.userId, TEST_USER)).catch(() => {});
    await db.delete(checkoutSessions).where(eq(checkoutSessions.userId, TEST_USER)).catch(() => {});
    await db.delete(contentCtaAttachments).where(eq(contentCtaAttachments.userId, TEST_USER)).catch(() => {});
    await db.delete(revenueRecords).where(eq(revenueRecords.userId, TEST_USER)).catch(() => {});
  });

  it("criterion 1: content can publish with CTA", async () => {
    const { attachCtaToContent } = await import("../../business/audience-ownership-engine");
    const ctaId = await attachCtaToContent(
      TEST_USER,
      "video-walkthrough-001",
      "lead_magnet",
      "Get the Boss Strategy Guide FREE",
      "https://etgaming247.com/guides/boss-strategy",
      "end",
    );
    expect(ctaId).toBeGreaterThan(0);
    const [row] = await db.select().from(contentCtaAttachments).where(eq(contentCtaAttachments.id, ctaId)).limit(1);
    expect(row.contentId).toBe("video-walkthrough-001");
    expect(row.ctaType).toBe("lead_magnet");
  });

  it("criterion 2: CTA can drive click -> opt-in -> follow-up", async () => {
    const { captureContact, segmentContact, enrollInSequence } = await import("../../business/audience-ownership-engine");
    const uniqueEmail = `cta-clicker-p5-${Date.now()}@example.com`;
    const { contactId } = await captureContact(
      TEST_USER,
      uniqueEmail,
      "cta_click",
      true,
      "double_opt_in",
      { ctaSource: "video-walkthrough-001" },
    );
    expect(contactId).toBeGreaterThan(0);

    const segmented = await segmentContact(TEST_USER, contactId, "engaged_viewers");
    expect(segmented).toBe(true);

    const enrollment = await enrollInSequence(TEST_USER, contactId, "p5_welcome_drip");
    expect(enrollment.enrollmentId).toBeGreaterThan(0);
    expect(enrollment.alreadyEnrolled).toBe(false);
  });

  it("criterion 3: checkout can start and complete", async () => {
    const { startCheckout, completeCheckout } = await import("../../business/monetization-orchestration-engine");
    const session = await startCheckout(
      TEST_USER,
      "premium_guide",
      9.99,
      "buyer@example.com",
      "video-walkthrough-001",
    );
    expect(session.sessionId).toBeGreaterThan(0);
    expect(session.status).toBe("pending");

    const completed = await completeCheckout(TEST_USER, session.sessionId);
    expect(completed.success).toBe(true);
    expect(completed.status).toBe("completed");
    expect(completed.amount).toBe(9.99);
  });

  it("criterion 4: one money event is reconciled with state", async () => {
    const { startCheckout, completeCheckout, reconcileMoneyEvent } =
      await import("../../business/monetization-orchestration-engine");

    const session = await startCheckout(TEST_USER, "membership", 4.99, "member@example.com");
    await completeCheckout(TEST_USER, session.sessionId);

    const reconciliation = await reconcileMoneyEvent(TEST_USER, session.sessionId);
    expect(reconciliation.reconciled).toBe(true);
    expect(reconciliation.sessionStatus).toBe("completed");
    expect(reconciliation.revenueRecordId).toBeGreaterThan(0);
  });

  it("criterion 5: money can attribute back to content", async () => {
    const { startCheckout, completeCheckout, reconcileMoneyEvent, attributeRevenueToContent } =
      await import("../../business/monetization-orchestration-engine");

    const session = await startCheckout(TEST_USER, "course", 29.99, "student@example.com", "video-tutorial-001");
    await completeCheckout(TEST_USER, session.sessionId);
    const rec = await reconcileMoneyEvent(TEST_USER, session.sessionId);
    expect(rec.revenueRecordId).toBeDefined();

    const attribution = await attributeRevenueToContent(TEST_USER, rec.revenueRecordId!, "video-tutorial-001");
    expect(attribution.attributed).toBe(true);
    expect(attribution.contentId).toBe("video-tutorial-001");
  });

  it("criterion 6: one sponsor opportunity flows through CRM stages", async () => {
    const { addDeal, updateDealStatus, getUserDeals } = await import("../../business/sponsor-operations-cloud");

    const deal = addDeal(TEST_USER, {
      brandName: "GamePad Pro",
      status: "prospect",
      dealValue: 2500,
      deliverables: ["Dedicated video", "Social post"],
      notes: "Gaming accessories brand",
    });
    expect(deal.id).toBeDefined();

    updateDealStatus(TEST_USER, deal.id, "outreach");
    updateDealStatus(TEST_USER, deal.id, "negotiating");
    updateDealStatus(TEST_USER, deal.id, "contracted");
    updateDealStatus(TEST_USER, deal.id, "in_progress");
    updateDealStatus(TEST_USER, deal.id, "completed");

    const deals = getUserDeals(TEST_USER);
    const completedDeal = deals.find(d => d.id === deal.id);
    expect(completedDeal).toBeDefined();
    expect(completedDeal!.status).toBe("completed");
  });

  it("criterion 7: one invoice lifecycle runs", async () => {
    const { createSponsorInvoice, issueSponsorInvoice, sendInvoiceReminder, markInvoicePaid, getInvoiceLifecycle } =
      await import("../../business/monetization-orchestration-engine");

    const inv = await createSponsorInvoice(TEST_USER, "deal_gamepad_001", "GamePad Pro", 2500, 30);
    expect(inv.invoiceId).toBeGreaterThan(0);
    expect(inv.status).toBe("draft");

    const issued = await issueSponsorInvoice(TEST_USER, inv.invoiceId);
    expect(issued).toBe(true);

    const reminded = await sendInvoiceReminder(TEST_USER, inv.invoiceId);
    expect(reminded).toBe(true);

    const paid = await markInvoicePaid(TEST_USER, inv.invoiceId);
    expect(paid).toBe(true);

    const lifecycle = await getInvoiceLifecycle(TEST_USER, inv.invoiceId);
    expect(lifecycle).not.toBeNull();
    expect(lifecycle!.status).toBe("paid");
    expect(lifecycle!.issuedAt).not.toBeNull();
    expect(lifecycle!.paidAt).not.toBeNull();
    expect(lifecycle!.reminderSentAt).not.toBeNull();
    expect(lifecycle!.amount).toBe(2500);
  });

  it("criterion 8: one operator brief is generated from real telemetry", async () => {
    const { generateOperatorBrief } = await import("../../business/monetization-orchestration-engine");

    const brief = await generateOperatorBrief(TEST_USER, "daily", {
      totalRevenue: 44.97,
      activeDeals: 1,
      pendingInvoices: 0,
      contentCount: 25,
      audienceSize: 15000,
      engagementRate: 6.2,
      topContent: "Elden Ring Full Walkthrough",
      recentMilestone: "10K subscribers",
    });

    expect(brief.briefId).toBeGreaterThan(0);
    expect(brief.summary).toContain("Daily Brief");
    expect(brief.summary).toContain("$44.97");
    expect(brief.nextBestMove).toBeDefined();
    expect(brief.nextBestMove.length).toBeGreaterThan(0);
    expect(brief.topActions.length).toBeGreaterThan(0);
  });

  it("criterion 9: the brief shows next best move without adding pages or clutter", async () => {
    const { generateOperatorBrief } = await import("../../business/monetization-orchestration-engine");

    const brief = await generateOperatorBrief(TEST_USER, "weekly", {
      totalRevenue: 150.00,
      activeDeals: 2,
      pendingInvoices: 1,
      audienceSize: 20000,
      engagementRate: 7.0,
      topContent: "God of War Ragnarok Boss Rush",
    });

    expect(brief.nextBestMove).toBeDefined();
    expect(brief.nextBestMove.length).toBeLessThan(200);
    expect(brief.topActions.length).toBeGreaterThanOrEqual(1);
    expect(brief.topActions.length).toBeLessThanOrEqual(5);
    expect(brief.summary.split("\n").length).toBe(1);
  });
});
