import Stripe from "stripe";
import { moneyRepo } from "./repository.js";
import { authRepo } from "../auth/repository.js";
import { authService } from "../auth/service.js";
import { aiRoute } from "../../ai/router.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("money");

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key);
}

const TIER_PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  empire: process.env.STRIPE_PRICE_EMPIRE,
};

export class MoneyService {
  async createCheckoutSession(userId: string, tier: string, returnUrl: string): Promise<{ url: string }> {
    const priceId = TIER_PRICES[tier];
    if (!priceId) throw new Error(`No Stripe price configured for tier: ${tier}`);

    const user = await authRepo.findById(userId);
    if (!user) throw new Error("User not found");

    const stripe = getStripe();
    let customerId = user.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { userId } });
      customerId = customer.id;
      await authRepo.update(userId, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}?success=1&tier=${tier}`,
      cancel_url: `${returnUrl}?cancelled=1`,
      metadata: { userId, tier },
    });

    return { url: session.url! };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    log.info("Stripe webhook", { type: event.type, id: event.id });
    await moneyRepo.saveStripeEvent(event.id, event.type, null, event.data.object as any);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const tier = session.metadata?.tier;
      if (userId && tier) {
        await authService.updateTier(userId, tier, session.subscription as string);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const user = await authRepo.findByStripeCustomerId(sub.customer as string);
      if (user) await authService.updateTier(user.id, "free");
    }
  }

  async getRevenueDashboard(userId: string): Promise<{
    summary: { totalCents: number; adCents: number; sponsorCents: number };
    snapshots: any[];
  }> {
    const [summary, snapshots] = await Promise.all([
      moneyRepo.getRevenueSummary(userId),
      moneyRepo.listSnapshots(userId),
    ]);
    return { summary, snapshots };
  }

  async generateFinancialInsights(userId: string): Promise<string> {
    const dashboard = await this.getRevenueDashboard(userId);
    const totalUSD = (dashboard.summary.totalCents / 100).toFixed(2);

    return aiRoute({
      task: "business-insight",
      background: true,
      system: "You are a financial advisor for YouTube content creators.",
      prompt: `A YouTube gaming creator has earned $${totalUSD} total revenue. Ad revenue: $${(dashboard.summary.adCents / 100).toFixed(2)}. Sponsorship revenue: $${(dashboard.summary.sponsorCents / 100).toFixed(2)}. They have ${dashboard.snapshots.length} revenue records.\n\nProvide 3-5 actionable insights to grow their revenue.`,
    });
  }
}

export const moneyService = new MoneyService();
