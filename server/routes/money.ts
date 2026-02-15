import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, getUserId, requireTier } from "./helpers";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { generateTaxStrategy, generateExpenseAnalysis } from "../ai-engine";
import {
  suggestAdBreaks, generateRevenueForecast, trackFanFunnel,
  getFanFunnelData, calculateSponsorRates, getSponsorRates,
  trackEquipmentRoi, getEquipmentRoi, generateInvoice, getInvoices, analyzeDeal,
} from "../monetization-engine";
import { syncAllRevenue, syncPlatformRevenue } from "../revenue-sync-engine";

export function registerMoneyRoutes(app: Express) {
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const checkoutSchema = z.object({ priceId: z.string().min(1) });
      const { priceId } = checkoutSchema.parse(req.body);

      const user = await storage.getUser(userId);
      let customerId = user?.stripeCustomerId;

      if (!customerId) {
        const email = (req.user as any)?.claims?.email;
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/settings?tab=subscription&status=success`,
        cancel_url: `${baseUrl}/pricing?status=cancelled`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      console.error("Stripe checkout error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/customer-portal", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No subscription found" });

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stripe/products-with-prices", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id as product_id, p.name as product_name, p.description as product_description,
               p.metadata as product_metadata, p.active as product_active,
               pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        const r = row as any;
        if (!productsMap.has(r.product_id)) {
          productsMap.set(r.product_id, {
            id: r.product_id,
            name: r.product_name,
            description: r.product_description,
            metadata: r.product_metadata,
            prices: [],
          });
        }
        if (r.price_id) {
          productsMap.get(r.product_id)!.prices.push({
            id: r.price_id,
            unit_amount: r.unit_amount,
            currency: r.currency,
            recurring: r.recurring,
          });
        }
      }
      res.json(Array.from(productsMap.values()));
    } catch (e: any) {
      if (e.message?.includes("does not exist")) {
        res.json([]);
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error("Stripe key error:", error);
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  app.post("/api/stripe/create-payment-link", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      amount: z.number().min(100, "Amount must be at least $1.00 (100 cents)"),
      description: z.string().optional(),
      customerEmail: z.string().email().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const stripe = await getUncachableStripeClient();
      const { amount, description, customerEmail } = parsed.data;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || 'Payment',
              metadata: { creatorUserId: userId },
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: customerEmail || undefined,
        success_url: `${req.protocol}://${req.get('host')}/money?payment=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/money?payment=cancelled`,
        metadata: { creatorUserId: userId },
      });

      await storage.createAuditLog({
        userId,
        action: "payment_link_created",
        target: description || "Payment",
        details: { amount, sessionId: session.id },
        riskLevel: "low",
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Create payment link error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stripe/payments", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await db.execute(
        sql`SELECT * FROM stripe.payment_intents ORDER BY created DESC LIMIT 50`
      );
      res.json(result.rows || []);
    } catch (error: any) {
      if (error.message?.includes('relation "stripe.payment_intents" does not exist')) {
        return res.json([]);
      }
      console.error("Fetch payments error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stripe/balance", async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const balance = await stripe.balance.retrieve();
      res.json(balance);
    } catch (error: any) {
      console.error("Balance error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get(api.revenue.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const records = await storage.getRevenueRecords(userId, platform);
    res.json(records);
  });

  app.post(api.revenue.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      amount: z.number(),
      source: z.string().min(1),
      platform: z.string().optional(),
      date: z.string().optional(),
      description: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const input = { ...parsed.data, userId: userId };
    const record = await storage.createRevenueRecord(input as any);
    res.status(201).json(record);
  });

  app.get(api.revenue.summary.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getRevenueSummary(userId);
    res.json(summary);
  });

  app.get("/api/expenses/summary", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getExpenseSummary(userId);
    res.json(summary);
  });

  app.get("/api/expenses", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const records = await storage.getExpenseRecords(userId);
    res.json(records);
  });

  app.post("/api/expenses", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const expenseSchema = z.object({ category: z.string(), description: z.string(), amount: z.number(), date: z.string().optional() }).passthrough();
      const parsed = expenseSchema.parse(req.body);
      const record = await storage.createExpenseRecord({ ...parsed, userId } as any);
      res.status(201).json(record);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      throw err;
    }
  });

  app.put("/api/expenses/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const record = await storage.updateExpenseRecord(Number(req.params.id), req.body);
    res.json(record);
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteExpenseRecord(Number(req.params.id));
    res.sendStatus(204);
  });

  app.post("/api/expenses/import-csv", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No rows provided" });
      }

      const imported = [];
      for (const row of rows) {
        const record = await storage.createExpenseRecord({
          userId,
          description: row.description || "Imported expense",
          amount: Math.abs(parseFloat(row.amount) || 0),
          category: row.category || "other",
          expenseDate: row.date ? new Date(row.date) : new Date(),
          vendor: row.vendor || row.description || "",
          taxDeductible: true,
          metadata: { notes: "Imported from Chase CSV" },
        });
        imported.push(record);
      }

      await storage.createAuditLog({
        userId,
        action: "csv_imported",
        target: "Chase CSV",
        details: { count: imported.length },
        riskLevel: "low",
      });

      res.json({ imported: imported.length, records: imported });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tax-analyze", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Tax Intelligence");
    if (!userId) return;
    try {
      const result = await generateTaxStrategy(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Tax analysis failed" });
    }
  });

  app.post("/api/expense-analyze", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Financial AI Tools");
    if (!userId) return;
    try {
      const result = await generateExpenseAnalysis(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Expense analysis failed" });
    }
  });

  app.get("/api/ventures", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ventures = await storage.getBusinessVentures(userId);
    res.json(ventures);
  });

  app.post("/api/ventures", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1),
      type: z.string().optional(),
      status: z.string().optional(),
      description: z.string().optional(),
      revenue: z.number().optional(),
      expenses: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const venture = await storage.createBusinessVenture({ ...parsed.data, userId } as any);
    res.status(201).json(venture);
  });

  app.put("/api/ventures/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const venture = await storage.updateBusinessVenture(Number(req.params.id), req.body);
    res.json(venture);
  });

  app.delete("/api/ventures/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBusinessVenture(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get("/api/goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goals = await storage.getBusinessGoals(userId);
    res.json(goals);
  });

  app.post("/api/goals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      targetAmount: z.number().optional(),
      currentAmount: z.number().optional(),
      deadline: z.string().optional(),
      status: z.string().optional(),
      category: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const goal = await storage.createBusinessGoal({ ...parsed.data, userId } as any);
    res.status(201).json(goal);
  });

  app.put("/api/goals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goal = await storage.updateBusinessGoal(Number(req.params.id), req.body);
    res.json(goal);
  });

  app.delete("/api/goals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBusinessGoal(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get("/api/tax-estimates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const estimates = await storage.getTaxEstimates(userId, year);
    res.json(estimates);
  });

  app.post("/api/tax-estimates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      year: z.number().optional(),
      quarter: z.number().optional(),
      estimatedIncome: z.number().optional(),
      estimatedTax: z.number().optional(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const estimate = await storage.createTaxEstimate({ ...parsed.data, userId } as any);
    res.status(201).json(estimate);
  });

  app.put("/api/tax-estimates/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const estimate = await storage.updateTaxEstimate(Number(req.params.id), req.body);
    res.json(estimate);
  });

  app.get("/api/sponsorship-deals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const deals = await storage.getSponsorshipDeals(userId, status);
    res.json(deals);
  });

  app.post("/api/sponsorship-deals", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      brandName: z.string().min(1),
      dealValue: z.number().optional(),
      status: z.string().optional(),
      contactEmail: z.string().optional(),
      deliverables: z.array(z.string()).optional(),
      deadline: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const deal = await storage.createSponsorshipDeal({ ...parsed.data, userId } as any);
      res.status(201).json(deal);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/sponsorship-deals/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const deal = await storage.updateSponsorshipDeal(Number(req.params.id), req.body);
    res.json(deal);
  });

  app.post("/api/monetization/ad-breaks/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await suggestAdBreaks(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/revenue-forecast", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateRevenueForecast(userId, req.body.period || "monthly");
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/fan-funnel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackFanFunnel(userId, req.body.eventType, req.body.platform, req.body.count);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/fan-funnel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getFanFunnelData(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/sponsor-rates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await calculateSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/sponsor-rates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/equipment-roi", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackEquipmentRoi(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/equipment-roi", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getEquipmentRoi(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/invoice/:dealId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateInvoice(userId, Number(req.params.dealId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/monetization/invoices", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getInvoices(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/monetization/analyze-deal/:dealId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await analyzeDeal(userId, Number(req.params.dealId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/revenue/sync", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await syncAllRevenue(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Revenue sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/revenue/sync/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await syncPlatformRevenue(userId, req.params.platform);
      res.json(result);
    } catch (error: any) {
      console.error("Platform revenue sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/revenue/sync-status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const logs = await storage.getRevenueSyncLogs(userId);
      const lastSync = logs.length > 0 ? logs[0] : null;
      const platformStatuses: Record<string, { status: string; lastSynced: string | null; recordsSynced: number; totalAmount: number }> = {};
      for (const log of logs) {
        if (!platformStatuses[log.platform]) {
          platformStatuses[log.platform] = {
            status: log.status,
            lastSynced: log.syncedAt?.toISOString() || null,
            recordsSynced: log.recordsSynced || 0,
            totalAmount: log.totalAmount || 0,
          };
        }
      }
      res.json({ lastSync: lastSync?.syncedAt?.toISOString() || null, platformStatuses, recentLogs: logs.slice(0, 10) });
    } catch (error: any) {
      console.error("Sync status error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/revenue/breakdown", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const records = await storage.getRevenueRecords(userId);
      const manual = records.filter(r => r.syncSource === "manual" || !r.syncSource);
      const autoSynced = records.filter(r => r.syncSource === "auto");
      const autoEstimated = records.filter(r => r.syncSource === "auto-estimated");

      const manualTotal = manual.reduce((s, r) => s + (r.amount || 0), 0);
      const autoTotal = autoSynced.reduce((s, r) => s + (r.amount || 0), 0);
      const estimatedTotal = autoEstimated.reduce((s, r) => s + (r.amount || 0), 0);

      const byPlatform: Record<string, { manual: number; auto: number; estimated: number; total: number }> = {};
      for (const r of records) {
        if (!byPlatform[r.platform]) byPlatform[r.platform] = { manual: 0, auto: 0, estimated: 0, total: 0 };
        byPlatform[r.platform].total += r.amount || 0;
        if (r.syncSource === "auto") byPlatform[r.platform].auto += r.amount || 0;
        else if (r.syncSource === "auto-estimated") byPlatform[r.platform].estimated += r.amount || 0;
        else byPlatform[r.platform].manual += r.amount || 0;
      }

      const bySource: Record<string, number> = {};
      for (const r of records) {
        bySource[r.source] = (bySource[r.source] || 0) + (r.amount || 0);
      }

      res.json({
        total: manualTotal + autoTotal + estimatedTotal,
        manualTotal,
        autoTotal,
        estimatedTotal,
        byPlatform,
        bySource,
        recordCount: { manual: manual.length, auto: autoSynced.length, estimated: autoEstimated.length, total: records.length },
      });
    } catch (error: any) {
      console.error("Revenue breakdown error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/revenue/opportunities", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const records = await storage.getRevenueRecords(userId);
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);

      const totalRevenue = records.reduce((sum, r) => sum + (r.amount || 0), 0);
      const platformSources = new Map<string, number>();
      for (const r of records) {
        const key = `${r.platform}:${r.source}`;
        platformSources.set(key, (platformSources.get(key) || 0) + (r.amount || 0));
      }

      const channelsByPlatform = new Map<string, any[]>();
      for (const ch of channels) {
        const p = ch.platform || "unknown";
        if (!channelsByPlatform.has(p)) channelsByPlatform.set(p, []);
        channelsByPlatform.get(p)!.push(ch);
      }

      const totalVideos = videos.length;
      const totalSubs = channels.reduce((sum, ch) => sum + ((ch as any).subscriberCount || 0), 0);
      const avgViews = videos.length > 0
        ? Math.round(videos.reduce((sum, v) => sum + ((v.metadata as any)?.stats?.views || 0), 0) / videos.length)
        : 0;

      const connectedPlatforms = new Set(channels.map(c => c.platform));
      const allPlatforms = ["youtube", "twitch", "kick", "tiktok", "x", "discord"];
      const unmonetized = allPlatforms.filter(p => connectedPlatforms.has(p) && !records.some(r => r.platform === p));
      const notConnected = allPlatforms.filter(p => !connectedPlatforms.has(p));

      interface Opportunity {
        type: string;
        title: string;
        description: string;
        platform?: string;
        estimatedImpact: string;
        priority: "high" | "medium" | "low";
        channelContext: string;
        audienceRelevance: string;
        steps: string[];
      }

      const opportunities: Opportunity[] = [];

      const platformMonetizationInfo: Record<string, { methods: string[]; audienceHook: string; steps: string[] }> = {
        youtube: {
          methods: ["AdSense", "Super Chats", "Memberships", "Merch Shelf", "YouTube Premium revenue"],
          audienceHook: "Your YouTube subscribers watch long-form content, making them ideal for ad revenue and memberships.",
          steps: ["Enable monetization in YouTube Studio", "Set up Super Chats for live streams", "Create membership tiers with exclusive perks", "Add products to Merch Shelf"],
        },
        twitch: {
          methods: ["Subscriptions", "Bits", "Ads", "Bounties"],
          audienceHook: "Twitch viewers are live-stream natives who actively support creators through subs and bits.",
          steps: ["Apply for Twitch Affiliate/Partner", "Set up sub tiers and emotes", "Enable Bits and cheering", "Run ad breaks during natural pauses"],
        },
        kick: {
          methods: ["Subscriptions", "Tips", "Creator Fund"],
          audienceHook: "Kick's growing audience tends to be younger and very engaged with gaming content.",
          steps: ["Apply for Kick monetization", "Promote subscription benefits", "Set up tip alerts", "Cross-promote from other platforms"],
        },
        tiktok: {
          methods: ["Creator Fund", "Live Gifts", "Brand Partnerships", "TikTok Shop"],
          audienceHook: "TikTok's algorithm-driven discovery means even small accounts can reach millions of viewers.",
          steps: ["Join TikTok Creator Fund", "Go live regularly for gifts", "Create shoppable content", "Pitch brands with your engagement rate"],
        },
        x: {
          methods: ["Ad Revenue Sharing", "Subscriptions", "Tips", "Sponsored Posts"],
          audienceHook: "X audiences value real-time takes and authentic commentary, perfect for building thought leadership.",
          steps: ["Enable X Premium for ad revenue share", "Offer subscriber-only content", "Build a consistent posting schedule", "Engage in trending conversations"],
        },
        discord: {
          methods: ["Server Subscriptions", "Premium Roles", "Merchandise", "Exclusive Access"],
          audienceHook: "Discord is your community's home base — the most engaged fans willing to pay for close access.",
          steps: ["Set up Server Subscriptions", "Create premium role tiers", "Offer exclusive content channels", "Run paid events and workshops"],
        },
      };

      if (unmonetized.length > 0) {
        for (const p of unmonetized) {
          const pLabel = p.charAt(0).toUpperCase() + p.slice(1);
          const pChannels = channelsByPlatform.get(p) || [];
          const channelNames = pChannels.map((c: any) => c.channelName || c.platform).join(", ");
          const info = platformMonetizationInfo[p];
          opportunities.push({
            type: "monetize",
            title: `Monetize ${pLabel}`,
            description: `You're connected to ${pLabel}${channelNames ? ` (${channelNames})` : ""} but haven't earned from it yet. ${info?.methods?.length ? `Available methods: ${info.methods.join(", ")}.` : ""}`,
            platform: p,
            estimatedImpact: "New revenue stream",
            priority: "high",
            channelContext: channelNames
              ? `Your ${pLabel} channel "${channelNames}" is connected and active. ${pChannels.length > 1 ? `You have ${pChannels.length} channels on this platform.` : ""}`
              : `Your ${pLabel} account is connected but has no channel data yet.`,
            audienceRelevance: info?.audienceHook || `Your ${pLabel} audience is an untapped revenue source waiting to be activated.`,
            steps: info?.steps || [`Research ${pLabel} monetization options`, `Enable monetization features`, `Track performance and iterate`],
          });
        }
      }

      if (notConnected.length > 0 && notConnected.length <= 4) {
        for (const p of notConnected) {
          const pLabel = p.charAt(0).toUpperCase() + p.slice(1);
          const info = platformMonetizationInfo[p];
          opportunities.push({
            type: "expand",
            title: `Expand to ${pLabel}`,
            description: `Connect your ${pLabel} account to reach a new audience. ${info?.methods?.length ? `Revenue options include: ${info.methods.slice(0, 3).join(", ")}.` : ""}`,
            platform: p,
            estimatedImpact: "Audience growth + new revenue",
            priority: "medium",
            channelContext: totalVideos > 0
              ? `You have ${totalVideos} video${totalVideos !== 1 ? "s" : ""} across your connected platforms${totalSubs > 0 ? ` and ${totalSubs.toLocaleString()} total subscribers` : ""}. Repurposing this content for ${pLabel} requires minimal extra effort.`
              : `Adding ${pLabel} gives you another platform for content distribution with CreatorOS handling cross-posting automatically.`,
            audienceRelevance: info?.audienceHook || `${pLabel} has a distinct audience that could expand your reach and revenue potential.`,
            steps: [`Connect your ${pLabel} account in Settings`, `CreatorOS will auto-configure cross-posting`, `Review first cross-posted content`, `Monitor audience growth`],
          });
        }
      }

      const hasMemberships = records.some(r => r.source === "membership");
      if (!hasMemberships && videos.length >= 5) {
        opportunities.push({
          type: "membership",
          title: "Launch Channel Memberships",
          description: `With ${videos.length} videos in your library${totalSubs > 0 ? ` and ${totalSubs.toLocaleString()} subscribers` : ""}, you have enough content and audience to offer exclusive membership perks.`,
          platform: "youtube",
          estimatedImpact: "$50-500/mo recurring",
          priority: "high",
          channelContext: `Your YouTube channel has ${videos.length} video${videos.length !== 1 ? "s" : ""}${avgViews > 0 ? ` averaging ${avgViews.toLocaleString()} views each` : ""}. This signals an engaged audience ready for deeper connection.`,
          audienceRelevance: "Memberships convert your most loyal viewers into recurring supporters. Even a small percentage of your audience joining at $4.99/mo creates steady income independent of ad revenue fluctuations.",
          steps: ["Meet YouTube Partner Program requirements", "Design 3-5 membership tiers with clear perks", "Create members-only content (behind-the-scenes, early access)", "Promote memberships in your videos and community posts", "Use CreatorOS to auto-generate membership promotion posts"],
        });
      }

      const hasSponsors = records.some(r => r.source === "sponsorship");
      if (!hasSponsors && videos.length >= 10) {
        opportunities.push({
          type: "sponsorship",
          title: "Attract Brand Sponsorships",
          description: `With ${videos.length} videos${avgViews > 0 ? ` averaging ${avgViews.toLocaleString()} views` : ""}, your channel is attractive to brands looking for gaming creator partnerships.`,
          estimatedImpact: "$200-5,000 per deal",
          priority: "high",
          channelContext: `${videos.length} published videos demonstrate consistency, which brands value highly. ${totalSubs > 100 ? `Your ${totalSubs.toLocaleString()} subscribers represent a targetable audience for advertisers.` : "Even growing channels can land niche sponsorships."}`,
          audienceRelevance: "Gaming audiences are among the most valuable for tech, peripherals, energy drinks, and subscription services. Brands pay premiums for authentic creator endorsements over traditional ads.",
          steps: ["Build a media kit with your channel stats and audience demographics", "Join creator marketplaces (e.g., Grin, AspireIQ, or direct outreach)", "Start with smaller brands to build sponsorship experience", "Use CreatorOS Sponsor Rates calculator to set fair pricing", "Negotiate long-term deals for better rates"],
        });
      }

      const hasAffiliate = records.some(r => r.source === "affiliate");
      if (!hasAffiliate) {
        opportunities.push({
          type: "affiliate",
          title: "Start Affiliate Marketing",
          description: "Add affiliate links to your gaming gear, software, and recommended products. Earn commission on every purchase your audience makes through your links.",
          estimatedImpact: "$50-1,000/mo passive",
          priority: "medium",
          channelContext: totalVideos > 0
            ? `Your ${totalVideos} video${totalVideos !== 1 ? "s" : ""} are perfect vehicles for affiliate links in descriptions. Gear reviews, tutorials, and setup tours naturally include product recommendations.`
            : "Every video you publish is an opportunity to include affiliate links in the description. Start building passive income from day one.",
          audienceRelevance: "Your gaming audience actively researches gear, software, and peripherals. When a trusted creator recommends a product, conversion rates are 3-5x higher than banner ads.",
          steps: ["Sign up for Amazon Associates, gaming peripheral programs (Razer, SteelSeries, etc.)", "Add affiliate links to all video descriptions", "Create dedicated gear/setup videos that naturally feature products", "Track which products convert best and double down", "Use CreatorOS to auto-insert affiliate links in cross-posted content"],
        });
      }

      const hasSuperChat = records.some(r => r.source === "superchat");
      if (!hasSuperChat && connectedPlatforms.has("youtube")) {
        opportunities.push({
          type: "superchat",
          title: "Maximize Super Chat Revenue",
          description: "Live streams with Super Chats enabled let your most engaged viewers contribute directly during broadcasts.",
          platform: "youtube",
          estimatedImpact: "$20-500 per stream",
          priority: "medium",
          channelContext: `As a YouTube-connected creator${totalSubs > 0 ? ` with ${totalSubs.toLocaleString()} subscribers` : ""}, Super Chats turn your live streams into direct revenue events.`,
          audienceRelevance: "Live stream viewers are your most engaged fans. Super Chats give them a way to stand out and interact directly with you, and they're willing to pay for that spotlight.",
          steps: ["Enable Super Chat in YouTube Studio monetization settings", "Stream regularly to build a live audience habit", "Acknowledge and react to Super Chats during stream", "Set up incentives (reading messages, shoutouts)", "Use CreatorOS live stream advisor for optimal engagement"],
        });
      }

      if (totalRevenue > 0 && records.length > 5) {
        const topSource = [...platformSources.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topSource) {
          const [key, amount] = topSource;
          const [platform, source] = key.split(":");
          const pctOfTotal = totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0;
          opportunities.push({
            type: "optimize",
            title: `Double Down on ${source}`,
            description: `${source} from ${platform} is your top earner at $${amount.toFixed(0)} (${pctOfTotal}% of total revenue). Focused optimization could grow this stream significantly.`,
            platform,
            estimatedImpact: `+$${Math.round(amount * 0.5)}/mo potential`,
            priority: "medium",
            channelContext: `Your ${platform} ${source} revenue is $${amount.toFixed(2)} across ${records.filter(r => r.platform === platform && r.source === source).length} records. This is your strongest revenue channel.`,
            audienceRelevance: `Your audience is already responding well to ${source} on ${platform}. Doubling down means optimizing what's proven to work rather than experimenting with unknowns.`,
            steps: [`Analyze your top-performing ${source} content to find patterns`, `Create more content in the same style/format`, `Test different approaches to increase per-viewer ${source} revenue`, `Track growth weekly and adjust strategy`],
          });
        }
      }

      if (connectedPlatforms.size >= 2 && records.length > 0) {
        const platformRevenues = new Map<string, number>();
        for (const r of records) {
          platformRevenues.set(r.platform || "unknown", (platformRevenues.get(r.platform || "unknown") || 0) + (r.amount || 0));
        }
        const topPlatform = [...platformRevenues.entries()].sort((a, b) => b[1] - a[1])[0];
        const bottomPlatforms = [...platformRevenues.entries()].filter(([p]) => p !== topPlatform?.[0]).sort((a, b) => a[1] - b[1]);
        if (bottomPlatforms.length > 0 && topPlatform) {
          const weakest = bottomPlatforms[0];
          if (topPlatform[1] > weakest[1] * 3) {
            opportunities.push({
              type: "rebalance",
              title: `Grow ${weakest[0].charAt(0).toUpperCase() + weakest[0].slice(1)} Revenue`,
              description: `${topPlatform[0]} earns $${topPlatform[1].toFixed(0)} while ${weakest[0]} only earns $${weakest[1].toFixed(0)}. Balancing revenue across platforms reduces risk.`,
              platform: weakest[0],
              estimatedImpact: `Reduce platform dependency`,
              priority: "low",
              channelContext: `Your revenue is heavily concentrated on ${topPlatform[0]} (${Math.round((topPlatform[1] / totalRevenue) * 100)}% of total). If that platform changes its algorithm or policies, your income takes a direct hit.`,
              audienceRelevance: `Your ${weakest[0]} audience may respond to different content formats or monetization methods than what works on ${topPlatform[0]}. Experimenting here could unlock a significant secondary revenue stream.`,
              steps: [`Study what content performs best on ${weakest[0]}`, `Adapt your top-performing content for ${weakest[0]}'s audience`, `Enable all available monetization on ${weakest[0]}`, `Set a 90-day growth target and track weekly`],
            });
          }
        }
      }

      res.json({
        opportunities: opportunities.sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }),
        summary: {
          totalRevenue,
          totalVideos,
          totalSubscribers: totalSubs,
          avgViewsPerVideo: avgViews,
          platformCount: connectedPlatforms.size,
          revenueStreams: new Set(records.map(r => r.source)).size,
          unmonetizedPlatforms: unmonetized.length,
        },
      });
    } catch (error: any) {
      console.error("Revenue opportunities error:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
