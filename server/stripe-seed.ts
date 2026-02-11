import { getUncachableStripeClient } from "./stripeClient";

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
    price: 2999,
    interval: "month" as const,
  },
  {
    name: "Pro Tier",
    description: "Connect up to 10 platforms with full AI suite",
    metadata: { tier: "pro" },
    price: 7999,
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
    const existingProducts = await stripe.products.list({ active: true, limit: 100 });
    const existingTiers = existingProducts.data.filter(
      (p) => p.metadata?.tier && ["youtube", "starter", "pro", "ultimate"].includes(p.metadata.tier)
    );

    if (existingTiers.length >= 4) {
      console.log("[Stripe Seed] Products already exist, skipping seed");
      return;
    }

    for (const tier of TIERS) {
      const existing = existingTiers.find((p) => p.metadata?.tier === tier.metadata.tier);
      if (existing) {
        console.log(`[Stripe Seed] ${tier.name} already exists, skipping`);
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

      console.log(`[Stripe Seed] Created ${tier.name} - $${tier.price / 100}/mo`);
    }

    console.log("[Stripe Seed] Seeding complete");
  } catch (e: any) {
    console.error("[Stripe Seed] Error:", e.message);
  }
}
