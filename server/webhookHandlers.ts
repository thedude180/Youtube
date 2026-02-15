import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

const PRODUCT_TIER_MAP: Record<string, string> = {
  youtube: 'youtube',
  starter: 'starter',
  pro: 'pro',
  ultimate: 'ultimate',
};

async function resolveSubscriptionTier(stripe: Stripe, subscription: Stripe.Subscription): Promise<string | null> {
  try {
    for (const item of subscription.items.data) {
      const priceId = typeof item.price === 'string' ? item.price : item.price?.id;
      if (!priceId) continue;

      const price = typeof item.price === 'object' ? item.price : await stripe.prices.retrieve(priceId);
      const productId = typeof price.product === 'string' ? price.product : price.product?.id;
      if (!productId) continue;

      const product = typeof price.product === 'object' && 'metadata' in price.product
        ? price.product
        : await stripe.products.retrieve(productId);

      const tierMeta = (product as Stripe.Product).metadata?.tier;
      if (tierMeta && PRODUCT_TIER_MAP[tierMeta]) {
        return PRODUCT_TIER_MAP[tierMeta];
      }
    }
  } catch (err) {
    console.error('[TierSync] Error resolving subscription tier:', err);
  }
  return null;
}

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  try {
    const [user] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);
    return user?.id || null;
  } catch (err) {
    console.error('[TierSync] Error finding user by customer ID:', err);
    return null;
  }
}

async function applyTierChange(userId: string, newTier: string, subscriptionId: string): Promise<void> {
  try {
    const currentUser = await storage.getUser(userId);
    const currentTier = currentUser?.tier || 'free';

    if (currentTier === newTier) {
      console.log(`[TierSync] User ${userId} already on ${newTier} tier, no change needed`);
      return;
    }

    const role = newTier === 'free' ? 'user' : 'premium';
    await storage.updateUserRole(userId, role, newTier);
    await storage.updateUserStripeInfo(userId, { stripeSubscriptionId: subscriptionId, tier: newTier });

    console.log(`[TierSync] User ${userId} tier updated: ${currentTier} -> ${newTier}`);

    try {
      const { initializeUserSystems } = await import('./services/post-login-init');
      initializeUserSystems(userId).catch((err) =>
        console.error(`[TierSync] Post-tier-change system init error for ${userId}:`, err)
      );
    } catch (err) {
      console.error(`[TierSync] System init import error:`, err);
    }
  } catch (err) {
    console.error(`[TierSync] Error applying tier change for ${userId}:`, err);
  }
}

async function handleSubscriptionChange(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    console.warn('[TierSync] No customer ID on subscription event');
    return;
  }

  const userId = await findUserByCustomerId(customerId);
  if (!userId) {
    console.warn(`[TierSync] No user found for Stripe customer ${customerId}`);
    return;
  }

  const stripe = await getUncachableStripeClient();

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    const tier = await resolveSubscriptionTier(stripe, subscription);
    if (tier) {
      await applyTierChange(userId, tier, subscription.id);
    }
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due') {
    if (subscription.status === 'canceled') {
      await applyTierChange(userId, 'free', subscription.id);
    } else {
      console.log(`[TierSync] Subscription ${subscription.id} status: ${subscription.status}, monitoring`);
    }
  }
}

async function handleCheckoutComplete(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== 'subscription') return;

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : (session.customer as any)?.id;
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : (session.subscription as any)?.id;

  if (!customerId || !subscriptionId) return;

  let userId = await findUserByCustomerId(customerId);

  if (!userId && session.client_reference_id) {
    userId = session.client_reference_id;
    await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
  }

  if (!userId) {
    console.warn(`[TierSync] No user for checkout session customer ${customerId}`);
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const tier = await resolveSubscriptionTier(stripe, subscription);
    if (tier) {
      await applyTierChange(userId, tier, subscriptionId);
    }
  } catch (err) {
    console.error('[TierSync] Checkout complete tier resolve error:', err);
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const jsonPayload = JSON.parse(payload.toString()) as Stripe.Event;
      const eventType = jsonPayload?.type;

      switch (eventType) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          console.log(`[TierSync] Processing ${eventType}`);
          await handleSubscriptionChange(jsonPayload);
          break;
        case 'checkout.session.completed':
          console.log(`[TierSync] Processing ${eventType}`);
          await handleCheckoutComplete(jsonPayload);
          break;
      }
    } catch (err: any) {
      console.error('[TierSync] Event processing error (non-fatal):', err.message);
    }
  }
}
