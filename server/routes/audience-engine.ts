import type { Express } from "express";
import { getUserId } from "./helpers";
import { createLogger } from "../lib/logger";

const logger = createLogger("audience-routes");

export function registerAudienceEngineRoutes(app: Express) {
  app.get("/api/audience/contacts", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { ownedContacts } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const contacts = await db.select().from(ownedContacts)
        .where(eq(ownedContacts.userId, userId))
        .orderBy(desc(ownedContacts.createdAt))
        .limit(200);
      res.json({ contacts, total: contacts.length });
    } catch (err: any) {
      logger.warn("Failed to fetch contacts", { error: err.message });
      res.json({ contacts: [], total: 0 });
    }
  });

  app.post("/api/audience/capture", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { email, source, consentGiven, consentMethod, metadata } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const { captureContact } = await import("../business/audience-ownership-engine");
      const result = await captureContact(userId, email, source || "manual", consentGiven ?? true, consentMethod || "form", metadata || {});
      res.json(result);
    } catch (err: any) {
      logger.warn("Failed to capture contact", { error: err.message });
      res.status(500).json({ error: "Failed to capture contact" });
    }
  });

  app.post("/api/audience/segment", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { contactId, segmentId } = req.body;
      const { segmentContact } = await import("../business/audience-ownership-engine");
      const ok = await segmentContact(userId, contactId, segmentId);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to segment contact" });
    }
  });

  app.post("/api/audience/enroll-sequence", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { contactId, sequenceName, metadata } = req.body;
      const { enrollInSequence } = await import("../business/audience-ownership-engine");
      const result = await enrollInSequence(userId, contactId, sequenceName, metadata || {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to enroll in sequence" });
    }
  });

  app.get("/api/audience/suppression-list", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { getSuppressionList } = await import("../business/audience-ownership-engine");
      const list = await getSuppressionList(userId);
      res.json({ suppressedContacts: list });
    } catch (err: any) {
      res.json({ suppressedContacts: [] });
    }
  });

  app.post("/api/audience/send-email", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { contactId, subject, body, templateType } = req.body;
      if (!subject || !body) return res.status(400).json({ error: "Subject and body required" });

      const { isContactSuppressed } = await import("../business/audience-ownership-engine");
      if (contactId) {
        const suppressed = await isContactSuppressed(userId, contactId);
        if (suppressed) return res.status(400).json({ error: "Contact is suppressed — cannot send email" });
      }

      const { db } = await import("../db");
      const { ownedContacts } = await import("@shared/schema");
      const { eq, and, ne } = await import("drizzle-orm");

      let recipients: { id: number; email: string }[] = [];
      if (contactId) {
        const [contact] = await db.select({ id: ownedContacts.id, email: ownedContacts.email })
          .from(ownedContacts)
          .where(and(eq(ownedContacts.id, contactId), eq(ownedContacts.userId, userId)))
          .limit(1);
        if (contact) recipients = [contact];
      } else {
        recipients = await db.select({ id: ownedContacts.id, email: ownedContacts.email })
          .from(ownedContacts)
          .where(and(eq(ownedContacts.userId, userId), ne(ownedContacts.status, "suppressed")))
          .limit(100);
      }

      if (!recipients.length) return res.json({ sent: 0, message: "No eligible contacts" });

      let sentCount = 0;
      try {
        const { sendGmail } = await import("../services/gmail-client");
        for (const r of recipients) {
          try {
            const ok = await sendGmail(r.email, subject, body);
            const { recordDeliverability } = await import("../business/audience-ownership-engine");
            if (ok) {
              await recordDeliverability(userId, r.id, "email", "delivered");
              sentCount++;
            } else {
              await recordDeliverability(userId, r.id, "email", "bounced", "soft", "Send returned false");
            }
          } catch (emailErr: any) {
            const { recordDeliverability } = await import("../business/audience-ownership-engine");
            await recordDeliverability(userId, r.id, "email", "bounced", "soft", emailErr.message);
          }
        }
      } catch (gmailErr: any) {
        return res.json({ sent: 0, message: "Gmail not configured — connect Google Mail in Settings to send emails" });
      }

      res.json({ sent: sentCount, total: recipients.length });
    } catch (err: any) {
      logger.warn("Failed to send audience email", { error: err.message });
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.post("/api/content/cta", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { contentId, ctaType, ctaText, ctaUrl, position, offerId } = req.body;
      if (!contentId || !ctaType || !ctaText) return res.status(400).json({ error: "contentId, ctaType, and ctaText required" });
      const { attachCtaToContent } = await import("../business/audience-ownership-engine");
      const id = await attachCtaToContent(userId, String(contentId), ctaType, ctaText, ctaUrl, position || "end", offerId);
      res.json({ ctaId: id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to attach CTA" });
    }
  });

  app.get("/api/content/:videoId/ctas", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { contentCtaAttachments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const ctas = await db.select().from(contentCtaAttachments)
        .where(and(eq(contentCtaAttachments.userId, userId), eq(contentCtaAttachments.contentId, req.params.videoId)));
      res.json({ ctas });
    } catch (err: any) {
      res.json({ ctas: [] });
    }
  });

  app.post("/api/content/:videoId/offer-recommendation", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { signals } = req.body;
      const { generateOfferRecommendation } = await import("../business/audience-ownership-engine");
      const rec = await generateOfferRecommendation(userId, req.params.videoId, signals || {});
      res.json(rec);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate offer recommendation" });
    }
  });

  app.get("/api/content/:videoId/offer-recommendations", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { offerRecommendations } = await import("@shared/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const recs = await db.select().from(offerRecommendations)
        .where(and(eq(offerRecommendations.userId, userId), eq(offerRecommendations.contentId, req.params.videoId)))
        .orderBy(desc(offerRecommendations.createdAt))
        .limit(5);
      res.json({ recommendations: recs });
    } catch (err: any) {
      res.json({ recommendations: [] });
    }
  });

  app.get("/api/content/revenue-attribution", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { videos, revenueRecords } = await import("@shared/schema");
      const { eq, desc, sql } = await import("drizzle-orm");

      const userVideos = await db.select({
        id: videos.id,
        title: videos.title,
        type: videos.type,
        status: videos.status,
        metadata: videos.metadata,
        publishedAt: videos.publishedAt,
      }).from(videos).where(eq(videos.channelId, sql`(SELECT id FROM channels WHERE user_id = ${userId} LIMIT 1)`))
        .orderBy(desc(videos.publishedAt)).limit(50);

      const revenue = await db.select().from(revenueRecords)
        .where(eq(revenueRecords.userId, userId))
        .orderBy(desc(revenueRecords.createdAt)).limit(100);

      const totalRevenue = revenue.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const attributedVideos = userVideos.map(v => {
        const meta = v.metadata as any;
        const nearbyRevenue = revenue.filter(r => {
          if (!v.publishedAt) return false;
          const pubTime = new Date(v.publishedAt).getTime();
          const revTime = new Date(r.createdAt || 0).getTime();
          return Math.abs(revTime - pubTime) < 14 * 24 * 60 * 60 * 1000;
        });
        const attributed = nearbyRevenue.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        return {
          videoId: v.id,
          title: v.title,
          type: v.type,
          views: Number(meta?.viewCount || 0),
          attributedRevenue: Math.round(attributed * 100) / 100,
          revenuePerView: Number(meta?.viewCount) > 0 ? Math.round((attributed / Number(meta.viewCount)) * 10000) / 10000 : 0,
          publishedAt: v.publishedAt,
        };
      }).filter(v => v.attributedRevenue > 0 || v.views > 100);

      res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        attributedVideos: attributedVideos.sort((a, b) => b.attributedRevenue - a.attributedRevenue),
        unattributed: Math.round((totalRevenue - attributedVideos.reduce((s, v) => s + v.attributedRevenue, 0)) * 100) / 100,
      });
    } catch (err: any) {
      res.json({ totalRevenue: 0, attributedVideos: [], unattributed: 0 });
    }
  });

  app.get("/api/content/:videoId/beat-map", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { videos } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [video] = await db.select().from(videos).where(eq(videos.id, parseInt(req.params.videoId))).limit(1);
      if (!video) return res.status(404).json({ error: "Video not found" });

      const meta = video.metadata as any;
      const durationSec = meta?.durationSec || 600;
      const videoType = meta?.videoType || video.type || "gameplay";
      const segmentCount = Math.min(20, Math.max(5, Math.floor(durationSec / 30)));
      const syntheticRetention = Array.from({ length: segmentCount }, (_, i) => {
        const pos = i / segmentCount;
        return Math.max(0.15, 0.95 - pos * 0.4 + (Math.sin(pos * Math.PI * 3) * 0.1));
      });

      const { analyzeBeatMap } = await import("../retention-beats-engine");
      const analysis = analyzeBeatMap(videoType, durationSec, syntheticRetention);
      res.json({ videoId: video.id, title: video.title, videoType, durationSec, analysis });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to analyze beat map" });
    }
  });

  app.get("/api/content/:contentId/lead-magnets", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { leadMagnets } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const magnets = await db.select().from(leadMagnets)
        .where(and(eq(leadMagnets.userId, userId), eq(leadMagnets.contentId, req.params.contentId)));
      res.json({ leadMagnets: magnets });
    } catch (err: any) {
      res.json({ leadMagnets: [] });
    }
  });

  app.post("/api/content/lead-magnet", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { name, type, contentId, description, downloadUrl, ctaAttachmentId } = req.body;
      if (!name || !type) return res.status(400).json({ error: "name and type required" });
      const { db } = await import("../db");
      const { leadMagnets } = await import("@shared/schema");
      const [magnet] = await db.insert(leadMagnets).values({
        userId, name, type, contentId: contentId || null, description: description || null,
        downloadUrl: downloadUrl || null, ctaAttachmentId: ctaAttachmentId || null,
      }).returning();
      res.json(magnet);
    } catch (err: any) {
      logger.warn("Failed to create lead magnet", { error: err.message });
      res.status(500).json({ error: "Failed to create lead magnet" });
    }
  });

  app.get("/api/lead-magnets", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { leadMagnets } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const magnets = await db.select().from(leadMagnets)
        .where(eq(leadMagnets.userId, userId))
        .orderBy(desc(leadMagnets.createdAt))
        .limit(50);
      res.json({ leadMagnets: magnets });
    } catch (err: any) {
      res.json({ leadMagnets: [] });
    }
  });

  app.get("/api/production/kanban", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { productionKanban } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const items = await db.select().from(productionKanban)
        .where(eq(productionKanban.userId, userId))
        .orderBy(desc(productionKanban.createdAt))
        .limit(200);
      res.json(items);
    } catch (err: any) {
      res.json([]);
    }
  });

  app.post("/api/production/kanban", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { title, stage, priority, platform, description, dueDate } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const { db } = await import("../db");
      const { productionKanban } = await import("@shared/schema");
      const [item] = await db.insert(productionKanban).values({
        userId, title, stage: stage || "idea", priority: priority || "medium",
        platform: platform || "youtube", description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      res.json(item);
    } catch (err: any) {
      logger.warn("Failed to create kanban item", { error: err.message });
      res.status(500).json({ error: "Failed to create kanban item" });
    }
  });

  app.patch("/api/production/kanban/:id/stage", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { stage } = req.body;
      if (!stage) return res.status(400).json({ error: "stage required" });
      const { db } = await import("../db");
      const { productionKanban } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(productionKanban)
        .set({ stage, updatedAt: new Date() })
        .where(and(eq(productionKanban.id, Number(req.params.id)), eq(productionKanban.userId, userId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Item not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update stage" });
    }
  });

  app.post("/api/checkout/create-product-link", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { productName, priceInCents, description, type } = req.body;
      if (!productName || !priceInCents) return res.status(400).json({ error: "productName and priceInCents required" });

      try {
        const { getUncachableStripeClient } = await import("../stripeClient");
        const stripe = await getUncachableStripeClient();
        if (!stripe) return res.json({ error: "Stripe not configured", link: null });

        const product = await stripe.products.create({
          name: productName,
          description: description || undefined,
          metadata: { creatorUserId: userId, type: type || "digital_product" },
        });

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: priceInCents,
          currency: "usd",
          ...(type === "membership" ? { recurring: { interval: "month" as const } } : {}),
        });

        const link = await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          metadata: { creatorUserId: userId, productName },
        });

        res.json({ link: link.url, productId: product.id, priceId: price.id });
      } catch (stripeErr: any) {
        res.json({ error: "Stripe not configured — connect Stripe in Settings", link: null });
      }
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.get("/api/monetization/missions", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { ownedContacts, videos, revenueRecords, sponsorshipDeals } = await import("@shared/schema");
      const { eq, sql } = await import("drizzle-orm");

      const [contactCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(ownedContacts).where(eq(ownedContacts.userId, userId));
      const [videoCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(videos).where(eq(videos.channelId, sql`(SELECT id FROM channels WHERE user_id = ${userId} LIMIT 1)`));
      const [revCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(revenueRecords).where(eq(revenueRecords.userId, userId));
      const [sponsorCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(sponsorshipDeals).where(eq(sponsorshipDeals.userId, userId));

      const contacts = contactCount?.count || 0;
      const vids = videoCount?.count || 0;
      const revs = revCount?.count || 0;
      const sponsors = sponsorCount?.count || 0;

      const missions = [
        { id: "first-video", name: "Upload your first video", completed: vids > 0, milestone: "1 video", current: vids, target: 1 },
        { id: "first-10-videos", name: "Build a 10-video library", completed: vids >= 10, milestone: "10 videos", current: Math.min(vids, 10), target: 10 },
        { id: "first-contact", name: "Capture your first audience contact", completed: contacts > 0, milestone: "1 contact", current: contacts, target: 1 },
        { id: "first-100-contacts", name: "Grow to 100 owned contacts", completed: contacts >= 100, milestone: "100 contacts", current: Math.min(contacts, 100), target: 100 },
        { id: "first-revenue", name: "Record your first revenue", completed: revs > 0, milestone: "1 sale", current: revs, target: 1 },
        { id: "first-sponsor", name: "Land your first sponsor deal", completed: sponsors > 0, milestone: "1 sponsor", current: sponsors, target: 1 },
        { id: "media-kit", name: "AI generates your media kit", completed: vids >= 5, milestone: "5+ videos", current: Math.min(vids, 5), target: 5 },
        { id: "repeat-buyer", name: "Get a repeat customer", completed: revs >= 3, milestone: "3+ sales", current: Math.min(revs, 3), target: 3 },
      ];

      const completedCount = missions.filter(m => m.completed).length;
      const readinessScore = Math.round((completedCount / missions.length) * 100);

      res.json({ missions, completedCount, totalMissions: missions.length, readinessScore });
    } catch (err: any) {
      res.json({ missions: [], completedCount: 0, totalMissions: 8, readinessScore: 0 });
    }
  });

  app.get("/api/operator/brief", async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (!userId) return;
      const { db } = await import("../db");
      const { videos, revenueRecords, aiAgentTasks, sponsorshipDeals } = await import("@shared/schema");
      const { eq, desc, gte, sql } = await import("drizzle-orm");

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [recentTasks] = await db.select({ count: sql<number>`count(*)::int` })
        .from(aiAgentTasks).where(gte(aiAgentTasks.createdAt, oneDayAgo));
      const [weeklyRevenue] = await db.select({ total: sql<number>`COALESCE(sum(amount::numeric), 0)::float` })
        .from(revenueRecords).where(eq(revenueRecords.userId, userId));
      const [activeSponsors] = await db.select({ count: sql<number>`count(*)::int` })
        .from(sponsorshipDeals).where(eq(sponsorshipDeals.userId, userId));

      const recentVideos = await db.select({ id: videos.id, title: videos.title, status: videos.status, metadata: videos.metadata })
        .from(videos)
        .where(eq(videos.channelId, sql`(SELECT id FROM channels WHERE user_id = ${userId} LIMIT 1)`))
        .orderBy(desc(videos.createdAt)).limit(5);

      const unpublished = recentVideos.filter(v => v.status !== "published");

      const actionItems = [];
      if (unpublished.length > 0) actionItems.push({ title: `${unpublished.length} video(s) ready to publish`, priority: "high" });
      if ((activeSponsors?.count || 0) > 0) actionItems.push({ title: `${activeSponsors.count} active sponsor deal(s) to track`, priority: "medium" });
      actionItems.push({ title: "Review AI agent activity for quality", priority: "low" });

      const blockers = [];
      if (recentVideos.length === 0) blockers.push("No videos in library — upload or connect YouTube");

      res.json({
        date: new Date().toISOString(),
        summary: `${recentTasks?.count || 0} AI tasks completed today. ${recentVideos.length} videos in pipeline. Revenue: $${(weeklyRevenue?.total || 0).toFixed(0)}.`,
        actionItems,
        blockers,
        topActions: actionItems.slice(0, 3),
        metrics: {
          aiTasksToday: recentTasks?.count || 0,
          totalRevenue: weeklyRevenue?.total || 0,
          activeSponsors: activeSponsors?.count || 0,
          videosInPipeline: recentVideos.length,
        },
      });
    } catch (err: any) {
      res.json({ date: new Date().toISOString(), summary: "Brief unavailable", actionItems: [], blockers: [], topActions: [], metrics: {} });
    }
  });
}
