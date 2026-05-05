import { Router, raw } from "express";
import { z } from "zod";
import { moneyRepo } from "./repository.js";
import { moneyService } from "./service.js";
import { unauthorized } from "../../core/errors.js";

export const moneyRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

// Stripe webhook — raw body needed for signature verification, no auth
moneyRouter.post(
  "/webhooks/stripe",
  raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      const sig = req.headers["stripe-signature"] as string;
      await moneyService.handleWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (err) { next(err); }
  },
);

moneyRouter.use(requireAuth);

moneyRouter.get("/dashboard", async (req, res, next) => {
  try {
    const data = await moneyService.getRevenueDashboard((req.user as any).id);
    res.json(data);
  } catch (err) { next(err); }
});

moneyRouter.get("/revenue", async (req, res, next) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const snapshots = await moneyRepo.listSnapshots(
      (req.user as any).id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    res.json(snapshots);
  } catch (err) { next(err); }
});

moneyRouter.post("/revenue", async (req, res, next) => {
  try {
    const data = z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      adRevenueCents: z.number().int().default(0),
      totalCents: z.number().int().default(0),
      source: z.string().default("manual"),
    }).parse(req.body);
    const snapshot = await moneyRepo.createSnapshot({
      ...data,
      userId: (req.user as any).id,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
    });
    res.status(201).json(snapshot);
  } catch (err) { next(err); }
});

moneyRouter.post("/checkout", async (req, res, next) => {
  try {
    const { tier } = z.object({ tier: z.string() }).parse(req.body);
    const origin = `${req.protocol}://${req.get("host")}`;
    const result = await moneyService.createCheckoutSession((req.user as any).id, tier, `${origin}/money`);
    res.json(result);
  } catch (err) { next(err); }
});

moneyRouter.get("/deals", async (req, res, next) => {
  try {
    const deals = await moneyRepo.listSponsorships((req.user as any).id);
    res.json(deals);
  } catch (err) { next(err); }
});

moneyRouter.post("/deals", async (req, res, next) => {
  try {
    const data = z.object({
      sponsorName: z.string().min(1),
      dealValueCents: z.number().int().optional(),
      notes: z.string().optional(),
      status: z.string().default("prospecting"),
    }).parse(req.body);
    const deal = await moneyRepo.createSponsorship({ ...data, userId: (req.user as any).id });
    res.status(201).json(deal);
  } catch (err) { next(err); }
});

moneyRouter.get("/insights", async (req, res, next) => {
  try {
    const insights = await moneyService.generateFinancialInsights((req.user as any).id);
    res.json({ insights });
  } catch (err) { next(err); }
});
