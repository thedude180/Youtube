import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import {
  ownedContacts,
  sequenceEnrollments,
  contentCtaAttachments,
  offerRecommendations,
  packagingInsights,
  deliverabilityRecords,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase4-done-criteria-user";

describe("Phase 4 Done Criteria", () => {
  beforeAll(async () => {
    await db.delete(deliverabilityRecords).where(eq(deliverabilityRecords.userId, TEST_USER)).catch(() => {});
    await db.delete(sequenceEnrollments).where(eq(sequenceEnrollments.userId, TEST_USER)).catch(() => {});
    await db.delete(contentCtaAttachments).where(eq(contentCtaAttachments.userId, TEST_USER)).catch(() => {});
    await db.delete(packagingInsights).where(eq(packagingInsights.userId, TEST_USER)).catch(() => {});
    await db.delete(offerRecommendations).where(eq(offerRecommendations.userId, TEST_USER)).catch(() => {});
    await db.delete(ownedContacts).where(eq(ownedContacts.userId, TEST_USER)).catch(() => {});
  });

  it("criterion 1: content can generate platform-specific packages", async () => {
    const { packageForPlatform, packageForAllPlatforms } = await import("../../distribution/cross-platform-packaging");
    const ytPackage = await packageForPlatform(TEST_USER, "youtube", {
      title: "Elden Ring Full Walkthrough",
      description: "No commentary PS5 gameplay",
      tags: ["elden ring", "ps5", "walkthrough"],
      durationSeconds: 3600,
      game: "Elden Ring",
    });
    expect(ytPackage.platform).toBe("youtube");
    expect(ytPackage.format).toBe("landscape");
    expect(ytPackage.aspectRatio).toBe("16:9");
    expect(ytPackage.thumbnailRequired).toBe(true);
    expect(ytPackage.contentTypeLabel).toBe("Long-form Video");

    const allPackages = await packageForAllPlatforms(TEST_USER, {
      title: "Elden Ring Boss Fight",
      description: "No commentary PS5",
      tags: ["elden ring"],
      durationSeconds: 120,
    }, ["youtube", "tiktok", "x"]);
    expect(allPackages.length).toBe(3);
    expect(allPackages[0].platform).toBe("youtube");
    expect(allPackages[1].platform).toBe("tiktok");
    expect(allPackages[1].format).toBe("portrait");
    expect(allPackages[2].platform).toBe("x");
    expect(allPackages[2].format).toBe("text_only");
  });

  it("criterion 2: one owned contact can be captured end-to-end", async () => {
    const { captureContact } = await import("../../business/audience-ownership-engine");
    const result = await captureContact(
      TEST_USER,
      "viewer@example.com",
      "youtube_lead_magnet",
      true,
      "double_opt_in",
      { game: "Elden Ring" },
    );
    expect(result.contactId).toBeGreaterThan(0);
    expect(result.alreadyExists).toBe(false);

    const dup = await captureContact(TEST_USER, "viewer@example.com", "youtube_lead_magnet", true, "double_opt_in");
    expect(dup.alreadyExists).toBe(true);
    expect(dup.contactId).toBe(result.contactId);
  });

  it("criterion 3: one contact can be segmented", async () => {
    const { captureContact, segmentContact } = await import("../../business/audience-ownership-engine");
    const { contactId } = await captureContact(TEST_USER, "segment-test@example.com", "form", true, "explicit");
    const segmented = await segmentContact(TEST_USER, contactId, "hardcore_gamers");
    expect(segmented).toBe(true);

    const [contact] = await db.select()
      .from(ownedContacts)
      .where(eq(ownedContacts.id, contactId))
      .limit(1);
    expect(contact.segmentId).toBe("hardcore_gamers");
  });

  it("criterion 4: one sequence enrollment can occur", async () => {
    const { captureContact, enrollInSequence } = await import("../../business/audience-ownership-engine");
    const { contactId } = await captureContact(TEST_USER, "sequence-test@example.com", "form", true, "explicit");
    const enrollment = await enrollInSequence(TEST_USER, contactId, "welcome_series");
    expect(enrollment.enrollmentId).toBeGreaterThan(0);
    expect(enrollment.alreadyEnrolled).toBe(false);

    const dupEnroll = await enrollInSequence(TEST_USER, contactId, "welcome_series");
    expect(dupEnroll.alreadyEnrolled).toBe(true);

    const [row] = await db.select()
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.id, enrollment.enrollmentId))
      .limit(1);
    expect(row.status).toBe("enrolled");
    expect(row.step).toBe(0);
  });

  it("criterion 5: one CTA can be attached to one content asset", async () => {
    const { attachCtaToContent } = await import("../../business/audience-ownership-engine");
    const ctaId = await attachCtaToContent(
      TEST_USER,
      "video-elden-ring-001",
      "lead_magnet",
      "Download the Elden Ring Boss Strategy Guide",
      "https://etgaming247.com/guides/elden-ring",
      "end",
    );
    expect(ctaId).toBeGreaterThan(0);

    const [row] = await db.select()
      .from(contentCtaAttachments)
      .where(eq(contentCtaAttachments.id, ctaId))
      .limit(1);
    expect(row.contentId).toBe("video-elden-ring-001");
    expect(row.ctaType).toBe("lead_magnet");
    expect(row.ctaText).toContain("Elden Ring");
  });

  it("criterion 6: one offer recommendation is generated from actual signals", async () => {
    const { generateOfferRecommendation } = await import("../../business/audience-ownership-engine");
    const rec = await generateOfferRecommendation(TEST_USER, "video-elden-ring-001", {
      viewCount: 75000,
      engagementRate: 6.5,
      audienceSize: 25000,
      videoType: "walkthrough",
      game: "Elden Ring",
      watchTimeMinutes: 45,
    });
    expect(rec.recommendationId).toBeGreaterThan(0);
    expect(rec.offerType).toBe("premium_content");
    expect(rec.offerName).toContain("Elden Ring");
    expect(rec.reasoning).toContain("engagement rate");
    expect(rec.confidence).toBeGreaterThan(0.7);
  });

  it("criterion 7: one packaging-to-money insight changes a recommendation", async () => {
    const { generateOfferRecommendation, recordPackagingInsight, applyPackagingInsightToRecommendation } =
      await import("../../business/audience-ownership-engine");

    const rec = await generateOfferRecommendation(TEST_USER, "video-boss-fight-002", {
      viewCount: 60000,
      engagementRate: 4.0,
      audienceSize: 20000,
    });

    const insightId = await recordPackagingInsight(
      TEST_USER,
      "video-boss-fight-002",
      "tiktok",
      "platform_monetization_mismatch",
      "TikTok audience engages differently — short-form content needs different offer structure",
    );

    const result = await applyPackagingInsightToRecommendation(TEST_USER, insightId, rec.recommendationId);
    expect(result.changed).toBe(true);
    expect(result.newOffer).not.toBe(result.originalOffer);
    expect(result.reason).toContain("monetization");

    const [updatedRec] = await db.select()
      .from(offerRecommendations)
      .where(eq(offerRecommendations.id, rec.recommendationId))
      .limit(1);
    expect(updatedRec.offerName).toBe(result.newOffer);
  });

  it("criterion 8: deliverability / suppression logic is real, not mock-only", async () => {
    const { captureContact, recordDeliverability, isContactSuppressed, getSuppressionList } =
      await import("../../business/audience-ownership-engine");

    const { contactId: goodId } = await captureContact(TEST_USER, "good@example.com", "form", true, "explicit");
    const { contactId: badId } = await captureContact(TEST_USER, "bad@example.com", "form", true, "explicit");
    const { contactId: complainId } = await captureContact(TEST_USER, "complain@example.com", "form", true, "explicit");

    await recordDeliverability(TEST_USER, goodId, "email", "delivered");
    const goodSuppressed = await isContactSuppressed(TEST_USER, goodId);
    expect(goodSuppressed).toBe(false);

    await recordDeliverability(TEST_USER, badId, "email", "bounced", "hard", "Mailbox not found");
    const badSuppressed = await isContactSuppressed(TEST_USER, badId);
    expect(badSuppressed).toBe(true);

    await recordDeliverability(TEST_USER, complainId, "email", "complaint", undefined, "Marked as spam");
    const complainSuppressed = await isContactSuppressed(TEST_USER, complainId);
    expect(complainSuppressed).toBe(true);

    const suppressionList = await getSuppressionList(TEST_USER);
    expect(suppressionList.length).toBeGreaterThanOrEqual(2);
    const emails = suppressionList.map(s => s.email);
    expect(emails).toContain("bad@example.com");
    expect(emails).toContain("complain@example.com");
    expect(emails).not.toContain("good@example.com");
  });
});
