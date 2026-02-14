import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, getUserId } from "./helpers";
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateTaxStrategy(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Tax analysis failed" });
    }
  });

  app.post("/api/expense-analyze", async (req, res) => {
    const userId = requireAuth(req, res);
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

      const connectedPlatforms = new Set(channels.map(c => c.platform));
      const allPlatforms = ["youtube", "twitch", "kick", "tiktok", "x", "discord"];
      const unmonetized = allPlatforms.filter(p => connectedPlatforms.has(p) && !records.some(r => r.platform === p));
      const notConnected = allPlatforms.filter(p => !connectedPlatforms.has(p));

      const opportunities: Array<{
        type: string;
        title: string;
        description: string;
        platform?: string;
        estimatedImpact: string;
        priority: "high" | "medium" | "low";
      }> = [];

      if (unmonetized.length > 0) {
        for (const p of unmonetized) {
          opportunities.push({
            type: "monetize",
            title: `Monetize ${p.charAt(0).toUpperCase() + p.slice(1)}`,
            description: `You're active on ${p} but haven't recorded any revenue. Explore monetization options.`,
            platform: p,
            estimatedImpact: "New revenue stream",
            priority: "high",
          });
        }
      }

      if (notConnected.length > 0 && notConnected.length <= 3) {
        for (const p of notConnected) {
          opportunities.push({
            type: "expand",
            title: `Expand to ${p.charAt(0).toUpperCase() + p.slice(1)}`,
            description: `Connect your ${p} account to tap into a new audience and revenue source.`,
            platform: p,
            estimatedImpact: "Audience growth + revenue",
            priority: "medium",
          });
        }
      }

      const hasMemberships = records.some(r => r.source === "membership");
      if (!hasMemberships && videos.length >= 5) {
        opportunities.push({
          type: "membership",
          title: "Launch Channel Memberships",
          description: "With your content library, memberships can add recurring revenue.",
          platform: "youtube",
          estimatedImpact: "$50-500/mo recurring",
          priority: "high",
        });
      }

      const hasSponsors = records.some(r => r.source === "sponsorship");
      if (!hasSponsors && videos.length >= 10) {
        opportunities.push({
          type: "sponsorship",
          title: "Attract Brand Sponsorships",
          description: "Your content volume makes you attractive to sponsors. AI can help pitch.",
          estimatedImpact: "$200-5,000 per deal",
          priority: "high",
        });
      }

      const hasAffiliate = records.some(r => r.source === "affiliate");
      if (!hasAffiliate) {
        opportunities.push({
          type: "affiliate",
          title: "Start Affiliate Marketing",
          description: "Add affiliate links to your gaming gear, software, and recommended products.",
          estimatedImpact: "$50-1,000/mo passive",
          priority: "medium",
        });
      }

      if (totalRevenue > 0 && records.length > 5) {
        const topSource = [...platformSources.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topSource) {
          const [key, amount] = topSource;
          const [platform, source] = key.split(":");
          opportunities.push({
            type: "optimize",
            title: `Double Down on ${source}`,
            description: `${source} from ${platform} is your top earner at $${amount.toFixed(0)}. Focus on growing this stream.`,
            platform,
            estimatedImpact: `+$${Math.round(amount * 0.5)}/mo potential`,
            priority: "medium",
          });
        }
      }

      res.json({
        opportunities: opportunities.sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }),
        summary: {
          totalRevenue,
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
