import { getUncachableStripeClient } from "./stripeClient";

import { createLogger } from "./lib/logger";

const logger = createLogger("stripe-seed");
const TIERS = [
  {
    name: "YouTube Tier",
    description: "Connect 1 platform with basic AI features",
    metadata: { tier: "youtube" },
    price: 999,
    interval: "month" as const,
  },
  {
    name: "Starter Tier",
    description: "Connect up to 3 platforms with core AI suite",
    metadata: { tier: "starter" },
    price: 4999,
    interval: "month" as const,
  },
  {
    name: "Pro Tier",
    description: "Connect up to 10 platforms with full AI suite",
    metadata: { tier: "pro" },
    price: 9999,
    interval: "month" as const,
  },
  {
    name: "Ultimate Tier",
    description: "All 25 platforms, 832 AI features, full automation",
    metadata: { tier: "ultimate" },
    price: 14999,
    interval: "month" as const,
  },
];

export async function seedStripeProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    // AUDIT FIX: Use auto-pagination to handle accounts with >100 products instead of silently truncating at 100
    const allProducts: any[] = [];
    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
      allProducts.push(product);
    }
    const existingTiers = allProducts.filter(
      (p) => p.metadata?.tier && ["youtube", "starter", "pro", "ultimate"].includes(p.metadata.tier)
    );

    if (existingTiers.length >= 4) {
      // AUDIT FIX: Remove unused pricesFixed flag
      for (const tier of TIERS) {
        const product = existingTiers.find((p) => p.metadata?.tier === tier.metadata.tier);
        if (!product) continue;
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
        const activePrice = prices.data.find((p) => p.recurring?.interval === "month");
        if (activePrice && activePrice.unit_amount !== tier.price) {
          await stripe.prices.update(activePrice.id, { active: false });
          await stripe.prices.create({
            product: product.id,
            unit_amount: tier.price,
            currency: "usd",
            recurring: { interval: tier.interval },
          });
        }
      }
      return;
    }

    for (const tier of TIERS) {
      const existing = existingTiers.find((p) => p.metadata?.tier === tier.metadata.tier);
      if (existing) {
        continue;
      }

      const product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: tier.metadata,
      });

      await stripe.prices.create({
        product: product.id,
        unit_amount: tier.price,
        currency: "usd",
        recurring: { interval: tier.interval },
      });

    }

  } catch (e: any) {
    logger.error("[Stripe Seed] Error:", e.message);
  }
}
