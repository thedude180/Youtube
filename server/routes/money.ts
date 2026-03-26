import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { expenseRecords, businessVentures, businessGoals, taxEstimates, sponsorshipDeals, affiliateLinks, channels, revenueRecords } from "@shared/schema";
import { requireAuth, requireTier, parseNumericId, asyncHandler, getUserEmail } from "./helpers";
import { cached } from "../lib/cache";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { generateTaxStrategy, generateExpenseAnalysis } from "../ai-engine";
import {
  suggestAdBreaks, generateRevenueForecast, trackFanFunnel,
  getFanFunnelData, calculateSponsorRates, getSponsorRates,
  trackEquipmentRoi, getEquipmentRoi, generateInvoice, getInvoices, analyzeDeal,
} from "../monetization-engine";
import { syncAllRevenue, syncPlatformRevenue } from "../revenue-sync-engine";
import {
  reconcileRevenueRecords, verifyRevenueRecord, generateReconciliationReport,
  getRevenueTruthSummary, flagDelayedReconciliation, getReconciliationHistory,
  RECONCILIATION_STATUSES,
} from "../business/revenue-reconciliation";
import {
  buildAttributionGraph, getTopRevenueContent, getRevenueByContent,
  getPlatformRevenueAttribution,
} from "../business/revenue-attribution";

function getAppBaseUrl(req: any): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const domains = process.env.REPLIT_DOMAINS?.split(',')[0];
  if (domains) return `https://${domains}`;
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost:5000';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

export function registerMoneyRoutes(app: Express) {
  app.post("/api/stripe/create-checkout-session", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const checkoutSchema = z.object({ priceId: z.string().min(1) });
      const { priceId } = checkoutSchema.parse(req.body);

      const user = await storage.getUser(userId);
      let customerId = user?.stripeCustomerId;

      if (!customerId) {
        const email = getUserEmail(req);
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
      }

      const baseUrl = getAppBaseUrl(req);
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        client_reference_id: userId,
        success_url: `${baseUrl}/settings?tab=subscription&status=success`,
        cancel_url: `${baseUrl}/pricing?status=cancelled`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      console.error("Stripe checkout error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stripe/verify-session", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.json({ tier: user?.tier || "free", synced: false, reason: "no_customer" });
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 5,
        expand: ["data.items.data.price.product"],
      });

      const validStatuses = ["active", "trialing", "past_due"];
      const activeSub = subscriptions.data.find(s => validStatuses.includes(s.status));
      if (!activeSub) {
        return res.json({ tier: user?.tier || "free", synced: false, reason: "no_active_subscription" });
      }

      let detectedTier: string | null = null;
      for (const item of activeSub.items.data) {
        const product = typeof item.price?.product === "object" ? item.price.product as any : null;
        if (product?.metadata?.tier) {
          detectedTier = product.metadata.tier;
          break;
        }
      }

      if (detectedTier && detectedTier !== user.tier) {
        const role = detectedTier === "free" ? "user" : "premium";
        await storage.updateUserRole(userId, role, detectedTier);
        await storage.updateUserStripeInfo(userId, {
          stripeSubscriptionId: activeSub.id,
          tier: detectedTier,
        });

        try {
          const { initializeUserSystems } = await import("../services/post-login-init");
          initializeUserSystems(userId).catch((e: any) => console.error("[VerifySession] Post-login init error:", e?.message));
        } catch (e: any) { console.error("[VerifySession] Post-login import error:", e?.message); }

        return res.json({ tier: detectedTier, synced: true, previousTier: user.tier });
      }

      res.json({ tier: user.tier || "free", synced: false, reason: "already_synced" });
    } catch (err: any) {
      console.error("[VerifySession] Error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stripe/customer-portal", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No subscription found" });

      const stripe = await getUncachableStripeClient();
      const baseUrl = getAppBaseUrl(req);
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/stripe/products-with-prices", asyncHandler(async (_req, res) => {
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
        res.status(500).json({ error: "An internal error occurred. Please try again." });
      }
    }
  }));

  app.get("/api/stripe/publishable-key", asyncHandler(async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error("Stripe key error:", error);
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  }));

  app.post("/api/stripe/create-payment-link", asyncHandler(async (req, res) => {
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
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/stripe/payments", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
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
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/stripe/balance", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const balance = await stripe.balance.retrieve();
      res.json(balance);
    } catch (error: any) {
      console.error("Balance error:", error);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.revenue.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const records = await storage.getRevenueRecords(userId, platform);
    res.json(records);
  }));

  app.post(api.revenue.create.path, asyncHandler(async (req, res) => {
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
  }));

  app.get("/api/revenue/summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getRevenueSummary(userId);
    const truthSummary = await getRevenueTruthSummary(userId);
    res.json({
      ...summary,
      truth: {
        verifiedRevenue: truthSummary.verifiedRevenue,
        estimatedRevenue: truthSummary.estimatedRevenue,
        verificationRate: truthSummary.verificationRate,
        confidenceLabel: truthSummary.confidenceLabel,
        byPlatform: truthSummary.byPlatform,
      },
    });
  }));

  app.get("/api/revenue/export.csv", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const records = await storage.getRevenueRecords(userId);
    const csvRows = [
      ["Date", "Source", "Platform", "Amount", "Currency", "ReconciliationStatus", "SyncSource"].join(",")
    ];

    for (const record of records) {
      const date = record.recordedAt ? new Date(record.recordedAt).toISOString().split('T')[0] : "";
      const source = `"${(record.source || "").replace(/"/g, '""')}"`;
      const platform = `"${(record.platform || "").replace(/"/g, '""')}"`;
      const amount = record.amount || 0;
      const currency = record.currency || "USD";
      const reconStatus = record.reconciliationStatus || "unverified";
      const syncSource = record.syncSource || "unknown";
      csvRows.push([date, source, platform, amount, currency, reconStatus, syncSource].join(","));
    }

    const csvContent = csvRows.join("\n");
    const now = new Date();
    const filename = `revenue-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  }));

  app.get("/api/expenses/summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await storage.getExpenseSummary(userId);
    res.json(summary);
  }));

  app.get("/api/expenses", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const records = await storage.getExpenseRecords(userId);
    res.json(records);
  }));

  app.get("/api/expenses/export.csv", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const records = await storage.getExpenseRecords(userId);
    const csvRows = [
      ["Date", "Category", "Description", "Amount", "Vendor"].join(",")
    ];

    for (const record of records) {
      const date = record.expenseDate ? new Date(record.expenseDate).toISOString().split('T')[0] : "";
      const category = `"${(record.category || "").replace(/"/g, '""')}"`;
      const description = `"${(record.description || "").replace(/"/g, '""')}"`;
      const amount = record.amount || 0;
      const vendor = `"${(record.vendor || "").replace(/"/g, '""')}"`;
      csvRows.push([date, category, description, amount, vendor].join(","));
    }

    const csvContent = csvRows.join("\n");
    const now = new Date();
    const filename = `expenses-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  }));

  app.post("/api/expenses", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const expenseSchema = z.object({ category: z.string(), description: z.string(), amount: z.number(), date: z.string().optional() }).passthrough();
      const parsed = expenseSchema.parse(req.body);
      const { date, ...rest } = parsed;
      const record = await storage.createExpenseRecord({ ...rest, userId, expenseDate: date ? new Date(date) : new Date() } as any);
      res.status(201).json(record);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      console.error("Error creating expense:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put("/api/expenses/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(expenseRecords).where(and(eq(expenseRecords.id, id), eq(expenseRecords.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateExpenseSchema = z.object({
      category: z.string().optional(),
      description: z.string().optional(),
      amount: z.number().optional(),
      date: z.string().optional(),
      vendor: z.string().optional(),
      taxDeductible: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateExpenseSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const record = await storage.updateExpenseRecord(id, parsed.data);
    res.json(record);
  }));

  app.delete("/api/expenses/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(expenseRecords).where(and(eq(expenseRecords.id, id), eq(expenseRecords.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteExpenseRecord(id);
    res.sendStatus(204);
  }));

  app.post("/api/expenses/import-csv", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const csvSchema = z.object({
        rows: z.array(z.object({
          description: z.string().optional(),
          amount: z.union([z.string(), z.number()]),
          category: z.string().optional(),
          date: z.string().optional(),
          vendor: z.string().optional(),
        }).passthrough()).min(1, "No rows provided"),
      });
      const csvParsed = csvSchema.safeParse(req.body || {});
      if (!csvParsed.success) {
        return res.status(400).json({ error: "Invalid input", details: csvParsed.error.flatten() });
      }
      const { rows } = csvParsed.data;

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
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/import-csv", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const rowsSchema = z.object({
        rows: z.array(z.object({
          date: z.string().optional(),
          source: z.string().optional(),
          platform: z.string().optional(),
          amount: z.union([z.string(), z.number()]),
          currency: z.string().optional(),
        }).passthrough()).min(1, "No rows provided"),
      });
      const parsed = rowsSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { rows } = parsed.data;
      const imported = [];
      for (const row of rows) {
        const amount = parseFloat(String(row.amount)) || 0;
        if (amount <= 0) continue;
        const record = await storage.createRevenueRecord({
          userId,
          platform: row.platform || "manual",
          source: row.source || "Historical Import",
          amount,
          currency: row.currency || "USD",
          syncSource: "csv-import",
          recordedAt: row.date ? new Date(row.date) : new Date(),
          metadata: { details: "Imported from CSV" },
        } as any);
        imported.push(record);
      }
      res.json({ imported: imported.length, records: imported });
    } catch (error: any) {
      console.error("Revenue CSV import error:", error);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/tax-analyze", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Tax Intelligence");
    if (!userId) return;
    try {
      const result = await generateTaxStrategy(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/expense-analyze", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Financial AI Tools");
    if (!userId) return;
    try {
      const result = await generateExpenseAnalysis(req.body, userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/ventures", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ventures = await storage.getBusinessVentures(userId);
    res.json(ventures);
  }));

  app.post("/api/ventures", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1),
      type: z.string().default("general"),
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
  }));

  app.put("/api/ventures/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(businessVentures).where(and(eq(businessVentures.id, id), eq(businessVentures.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateVentureSchema = z.object({
      name: z.string().min(1).optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      description: z.string().optional(),
      revenue: z.number().optional(),
      expenses: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateVentureSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const venture = await storage.updateBusinessVenture(id, parsed.data);
    res.json(venture);
  }));

  app.delete("/api/ventures/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(businessVentures).where(and(eq(businessVentures.id, id), eq(businessVentures.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteBusinessVenture(id);
    res.sendStatus(204);
  }));

  app.get("/api/goals", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const goals = await storage.getBusinessGoals(userId);
    res.json(goals);
  }));

  app.post("/api/goals", asyncHandler(async (req, res) => {
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
  }));

  app.put("/api/goals/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(businessGoals).where(and(eq(businessGoals.id, id), eq(businessGoals.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateGoalSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      targetAmount: z.number().optional(),
      currentAmount: z.number().optional(),
      deadline: z.string().optional(),
      status: z.string().optional(),
      category: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateGoalSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const goal = await storage.updateBusinessGoal(id, parsed.data);
    res.json(goal);
  }));

  app.delete("/api/goals/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(businessGoals).where(and(eq(businessGoals.id, id), eq(businessGoals.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteBusinessGoal(id);
    res.sendStatus(204);
  }));

  app.get("/api/tax-estimates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const year = req.query.year ? Number(req.query.year) : undefined;
    if (year !== undefined && (isNaN(year) || year < 2020 || year > 2100)) return res.status(400).json({ error: "Invalid year" });
    const estimates = await storage.getTaxEstimates(userId, year);
    res.json(estimates);
  }));

  app.post("/api/tax-estimates", asyncHandler(async (req, res) => {
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
  }));

  app.put("/api/tax-estimates/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(taxEstimates).where(and(eq(taxEstimates.id, id), eq(taxEstimates.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateTaxSchema = z.object({
      year: z.number().optional(),
      quarter: z.number().optional(),
      estimatedIncome: z.number().optional(),
      estimatedTax: z.number().optional(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateTaxSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const estimate = await storage.updateTaxEstimate(id, parsed.data);
    res.json(estimate);
  }));

  app.get("/api/sponsorship-deals", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const deals = await storage.getSponsorshipDeals(userId, status);
    res.json(deals);
  }));

  app.post("/api/sponsorship-deals", asyncHandler(async (req, res) => {
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
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.put("/api/sponsorship-deals/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(sponsorshipDeals).where(and(eq(sponsorshipDeals.id, id), eq(sponsorshipDeals.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateDealSchema = z.object({
      brandName: z.string().min(1).optional(),
      dealValue: z.number().optional(),
      status: z.string().optional(),
      contactEmail: z.string().optional(),
      deliverables: z.array(z.string()).optional(),
      deadline: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateDealSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const deal = await storage.updateSponsorshipDeal(id, parsed.data);
    res.json(deal);
  }));

  app.delete("/api/sponsorship-deals/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(sponsorshipDeals).where(and(eq(sponsorshipDeals.id, id), eq(sponsorshipDeals.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await db.delete(sponsorshipDeals).where(and(eq(sponsorshipDeals.id, id), eq(sponsorshipDeals.userId, userId)));
    res.json({ success: true });
  }));

  app.post("/api/sponsorship-deals/:id/outreach-draft", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [deal] = await db.select().from(sponsorshipDeals).where(and(eq(sponsorshipDeals.id, id), eq(sponsorshipDeals.userId, userId))).limit(1);
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const user = await storage.getUser(userId);
    const userChannels = await db.select({ channelName: channels.channelName, platform: channels.platform, subscriberCount: channels.subscriberCount })
      .from(channels).where(eq(channels.userId, userId)).limit(5);
    const channelCtx = userChannels.map(c => `${c.platform}: ${c.channelName} (${(c.subscriberCount || 0).toLocaleString()} subs)`).join(", ");

    const { getOpenAIClient } = await import("../lib/openai");
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: `Write a professional sponsorship outreach email from a gaming/PS5 content creator to a potential brand partner.
Brand: ${deal.brandName}
Deal value in mind: ${deal.dealValue ? `$${deal.dealValue}` : "to be negotiated"}
Creator channels: ${channelCtx || "gaming content creator"}
Notes about this deal: ${deal.notes || "none"}

Write a short, confident, human-sounding outreach email (not stiff corporate language). Include subject line.
Return JSON: { "subject": "...", "body": "...", "followUpNote": "suggested follow-up timing" }`
      }],
      max_completion_tokens: 1000,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
    res.json(result);
  }));

  app.post("/api/monetization/ad-breaks/:videoId", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
      if (videoId === null) return;
      const result = await suggestAdBreaks(userId, videoId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/revenue-forecast", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const forecastSchema = z.object({ period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional().default("monthly") });
      const parsedForecast = forecastSchema.safeParse(req.body || {});
      if (!parsedForecast.success) return res.status(400).json({ error: "Invalid input", details: parsedForecast.error.flatten() });
      const result = await generateRevenueForecast(userId, parsedForecast.data.period);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/fan-funnel", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const funnelSchema = z.object({
        eventType: z.string().min(1).max(100),
        platform: z.string().min(1).max(50),
        count: z.number().optional(),
      });
      const parsedFunnel = funnelSchema.safeParse(req.body || {});
      if (!parsedFunnel.success) return res.status(400).json({ error: "Invalid input", details: parsedFunnel.error.flatten() });
      const result = await trackFanFunnel(userId, parsedFunnel.data.eventType, parsedFunnel.data.platform, parsedFunnel.data.count);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/monetization/fan-funnel", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getFanFunnelData(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/sponsor-rates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await calculateSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/monetization/sponsor-rates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getSponsorRates(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/equipment-roi", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const equipmentSchema = z.object({
        name: z.string().min(1).max(200),
        category: z.string().optional(),
        cost: z.number().optional(),
        purchaseDate: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }).passthrough();
      const parsedEquip = equipmentSchema.safeParse(req.body || {});
      if (!parsedEquip.success) return res.status(400).json({ error: "Invalid input", details: parsedEquip.error.flatten() });
      const result = await trackEquipmentRoi(userId, parsedEquip.data);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/monetization/equipment-roi", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getEquipmentRoi(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/invoice/:dealId", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const dealId = parseNumericId(req.params.dealId as string, res, "deal ID");
      if (dealId === null) return;
      const result = await generateInvoice(userId, dealId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/monetization/invoices", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getInvoices(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/monetization/analyze-deal/:dealId", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const dealId = parseNumericId(req.params.dealId as string, res, "deal ID");
      if (dealId === null) return;
      const result = await analyzeDeal(userId, dealId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/sync", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await syncAllRevenue(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Revenue sync error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/sync/:platform", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const allowedPlatforms = ["youtube", "twitch", "tiktok", "discord", "kick", "rumble", "patreon"];
      const platform = String(req.params.platform).toLowerCase().trim();
      if (!platform || !allowedPlatforms.includes(platform)) return res.status(400).json({ error: "Invalid platform" });
      const result = await syncPlatformRevenue(userId, platform);
      res.json(result);
    } catch (error: any) {
      console.error("Platform revenue sync error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/sync-status", asyncHandler(async (req, res) => {
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
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/breakdown", asyncHandler(async (req, res) => {
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

      const reconStatusCounts: Record<string, number> = {};
      for (const r of records) {
        const status = r.reconciliationStatus || "unverified";
        reconStatusCounts[status] = (reconStatusCounts[status] || 0) + 1;
      }

      const verifiedTotal = records
        .filter(r => r.reconciliationStatus === "verified")
        .reduce((s, r) => s + (r.amount || 0), 0);

      res.json({
        total: manualTotal + autoTotal + estimatedTotal,
        manualTotal,
        autoTotal,
        estimatedTotal,
        byPlatform,
        bySource,
        recordCount: { manual: manual.length, auto: autoSynced.length, estimated: autoEstimated.length, total: records.length },
        truth: {
          verifiedTotal,
          unverifiedTotal: (manualTotal + autoTotal + estimatedTotal) - verifiedTotal,
          reconciliationStatusCounts: reconStatusCounts,
          verificationRate: records.length > 0
            ? (records.filter(r => r.reconciliationStatus === "verified").length / records.length) * 100
            : 0,
        },
      });
    } catch (error: any) {
      console.error("Revenue breakdown error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/truth", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const summary = await getRevenueTruthSummary(userId);
      res.json(summary);
    } catch (error: unknown) {
      console.error("Revenue truth error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/reconcile", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const schema = z.object({
        platform: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

      const options: { platform?: string; startDate?: Date; endDate?: Date } = {};
      if (parsed.data.platform) options.platform = parsed.data.platform;
      if (parsed.data.startDate) options.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate) options.endDate = new Date(parsed.data.endDate);

      const results = await reconcileRevenueRecords(userId, options);
      res.json({
        reconciled: results.length,
        results,
        summary: {
          verified: results.filter(r => r.newStatus === "verified").length,
          estimated: results.filter(r => r.newStatus === "estimated").length,
          disputed: results.filter(r => r.newStatus === "disputed").length,
          unresolved: results.filter(r => r.newStatus === "unresolved").length,
        },
      });
    } catch (error: unknown) {
      console.error("Reconciliation error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/verify/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const recordId = parseNumericId(req.params.id as string, res);
    if (recordId === null) return;
    try {
      const schema = z.object({
        verifiedAmount: z.number(),
        source: z.string().min(1),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

      const result = await verifyRevenueRecord(userId, recordId, parsed.data);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Verification failed";
      if (message.includes("not found")) return res.status(404).json({ error: message });
      console.error("Revenue verify error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/reconciliation-report", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const period = req.query.period as string | undefined;
      const report = await generateReconciliationReport(userId, period);
      res.json(report);
    } catch (error: unknown) {
      console.error("Reconciliation report error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/reconciliation-history", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await getReconciliationHistory(userId, limit);
      res.json(history);
    } catch (error: unknown) {
      console.error("Reconciliation history error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/revenue/flag-delayed", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const days = parseInt(req.query.days as string) || 30;
      const count = await flagDelayedReconciliation(userId, days);
      res.json({ flagged: count, threshold: `${days} days` });
    } catch (error: unknown) {
      console.error("Flag delayed error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/attribution", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const graph = await buildAttributionGraph(userId);
      res.json(graph);
    } catch (error: unknown) {
      console.error("Attribution graph error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/attribution/top-content", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topContent = await getTopRevenueContent(userId, limit);
      res.json(topContent);
    } catch (error: unknown) {
      console.error("Top content error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/attribution/content/:type/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const contentType = req.params.type as "video" | "stream";
    if (!["video", "stream"].includes(contentType)) {
      return res.status(400).json({ error: "Content type must be 'video' or 'stream'" });
    }
    const contentId = parseNumericId(req.params.id as string, res);
    if (contentId === null) return;
    try {
      const result = await getRevenueByContent(userId, contentType, contentId);
      res.json(result);
    } catch (error: unknown) {
      console.error("Content attribution error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/attribution/platforms", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getPlatformRevenueAttribution(userId);
      res.json(result);
    } catch (error: unknown) {
      console.error("Platform attribution error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/revenue/opportunities", asyncHandler(async (req, res) => {
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
      const allPlatforms = ["youtube", "twitch", "kick", "tiktok", "discord"];
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
          audienceHook: "Kick's growing audience tends to be younger and very engaged with content.",
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
          description: `With ${videos.length} videos${avgViews > 0 ? ` averaging ${avgViews.toLocaleString()} views` : ""}, your channel is attractive to brands looking for creator partnerships.`,
          estimatedImpact: "$200-5,000 per deal",
          priority: "high",
          channelContext: `${videos.length} published videos demonstrate consistency, which brands value highly. ${totalSubs > 100 ? `Your ${totalSubs.toLocaleString()} subscribers represent a targetable audience for advertisers.` : "Even growing channels can land niche sponsorships."}`,
          audienceRelevance: "Engaged audiences are among the most valuable for brands in your niche. Brands pay premiums for authentic creator endorsements over traditional ads.",
          steps: ["Build a media kit with your channel stats and audience demographics", "Join creator marketplaces (e.g., Grin, AspireIQ, or direct outreach)", "Start with smaller brands to build sponsorship experience", "Use CreatorOS Sponsor Rates calculator to set fair pricing", "Negotiate long-term deals for better rates"],
        });
      }

      const hasAffiliate = records.some(r => r.source === "affiliate");
      if (!hasAffiliate) {
        opportunities.push({
          type: "affiliate",
          title: "Start Affiliate Marketing",
          description: "Add affiliate links to your gear, software, and tools you recommend. Earn commission on every purchase your audience makes through your links.",
          estimatedImpact: "$50-1,000/mo passive",
          priority: "medium",
          channelContext: totalVideos > 0
            ? `Your ${totalVideos} video${totalVideos !== 1 ? "s" : ""} are perfect vehicles for affiliate links in descriptions. Gear reviews, tutorials, and setup tours naturally include product recommendations.`
            : "Every video you publish is an opportunity to include affiliate links in the description. Start building passive income from day one.",
          audienceRelevance: "Your audience actively researches gear, software, and tools you recommend. When a trusted creator recommends a product, conversion rates are 3-5x higher than banner ads.",
          steps: ["Sign up for Amazon Associates and relevant affiliate programs in your niche", "Add affiliate links to all video descriptions", "Create dedicated gear/setup videos that naturally feature products", "Track which products convert best and double down", "Use CreatorOS to auto-insert affiliate links in cross-posted content"],
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
        const topSource = Array.from(platformSources.entries()).sort((a, b) => b[1] - a[1])[0];
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
        const topPlatform = Array.from(platformRevenues.entries()).sort((a, b) => b[1] - a[1])[0];
        const bottomPlatforms = Array.from(platformRevenues.entries()).filter(([p]) => p !== topPlatform?.[0]).sort((a, b) => a[1] - b[1]);
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
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/billing/history", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.json({ invoices: [] });
      const result = await cached(`billing-history:${userId}`, 30, async () => {
        const stripe = await getUncachableStripeClient();
        const invoices = await stripe.invoices.list({ customer: user.stripeCustomerId!, limit: 20 });
        return {
          invoices: invoices.data.map(inv => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amountDue: inv.amount_due,
            amountPaid: inv.amount_paid,
            currency: inv.currency,
            created: new Date(inv.created * 1000).toISOString(),
            hostedInvoiceUrl: inv.hosted_invoice_url,
            pdfUrl: inv.invoice_pdf,
            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
          })),
        };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch billing history" });
    }
  }));

  app.post("/api/billing/cancel", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) return res.status(400).json({ error: "No active subscription" });
      const stripe = await getUncachableStripeClient();
      const { reason, feedback } = req.body || {};
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
        metadata: { cancellationReason: reason || "not_specified", cancellationFeedback: feedback || "" },
      });
      res.json({ success: true, message: "Subscription will cancel at end of billing period" });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  }));

  app.post("/api/billing/reactivate", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) return res.status(400).json({ error: "No subscription to reactivate" });
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: false });
      res.json({ success: true, message: "Subscription reactivated" });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to reactivate subscription" });
    }
  }));

  app.get("/api/billing/portal", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No billing account" });
      const stripe = await getUncachableStripeClient();
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000";
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `https://${domain}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to create billing portal" });
    }
  }));

  app.get("/api/affiliate-links", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const links = await db.select().from(affiliateLinks).where(eq(affiliateLinks.userId, userId)).orderBy(desc(affiliateLinks.createdAt));
    res.json(links);
  }));

  app.post("/api/affiliate-links", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { name, originalUrl, platform } = req.body;
    if (!name || !originalUrl) return res.status(400).json({ error: "Name and URL required" });
    const trackingUrl = `https://etgaming247.com/go/${Buffer.from(name).toString("base64url").slice(0, 12)}`;
    await db.insert(affiliateLinks).values({ userId, name, originalUrl, trackingUrl, platform });
    res.json({ success: true });
  }));

  app.delete("/api/affiliate-links/:id", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await db.delete(affiliateLinks).where(and(eq(affiliateLinks.id, parseInt(req.params.id)), eq(affiliateLinks.userId, userId)));
    res.json({ success: true });
  }));
}
