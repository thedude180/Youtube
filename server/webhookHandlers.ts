import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { db } from './db';
import { users, webhookEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createLogger } from './lib/logger';

const logger = createLogger('webhook');

async function checkAndRecordWebhookEvent(eventId: string, source: string, eventType: string, payload: any): Promise<boolean> {
  const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.source, `${source}:${eventId}`)).limit(1);
  if (existing.length > 0 && existing[0].processed) {
    return false;
  }
  if (existing.length === 0) {
    await db.insert(webhookEvents).values({
      userId: 'system',
      source: `${source}:${eventId}`,
      eventType,
      payload,
      processed: false,
    });
  }
  return true;
}

async function markWebhookProcessed(eventId: string, source: string): Promise<void> {
  await db.update(webhookEvents)
    .set({ processed: true })
    .where(eq(webhookEvents.source, `${source}:${eventId}`));
}

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

async function handleTrialWillEnd(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    logger.warn('No customer ID on trial_will_end event');
    return;
  }

  const userId = await findUserByCustomerId(customerId);
  if (!userId) {
    logger.warn(`No user found for Stripe customer ${customerId} (trial_will_end)`);
    return;
  }

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toLocaleDateString()
    : 'soon';

  try {
    await storage.createNotification({
      userId,
      type: 'billing',
      title: 'Your trial is ending soon',
      message: `Your free trial ends on ${trialEnd}. Add a payment method to continue enjoying premium features without interruption.`,
      severity: 'warning',
      actionUrl: '/settings',
      metadata: { source: 'stripe' },
    });
    logger.info(`Trial ending notification created for user ${userId}`);
  } catch (err) {
    logger.error('Failed to create trial_will_end notification', { error: (err as Error).message });
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
      const eventId = jsonPayload?.id;

      if (eventId) {
        const shouldProcess = await checkAndRecordWebhookEvent(eventId, 'stripe', eventType, jsonPayload);
        if (!shouldProcess) {
          logger.info(`Skipping already processed webhook event ${eventId} (${eventType})`);
          return;
        }
      }

      switch (eventType) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          logger.info(`Processing ${eventType}`);
          await handleSubscriptionChange(jsonPayload);
          break;
        case 'customer.subscription.trial_will_end':
          logger.info(`Processing ${eventType}`);
          await handleTrialWillEnd(jsonPayload);
          break;
        case 'checkout.session.completed':
          logger.info(`Processing ${eventType}`);
          await handleCheckoutComplete(jsonPayload);
          break;
      }

      if (eventId) {
        await markWebhookProcessed(eventId, 'stripe');
      }
    } catch (err: any) {
      logger.error('Event processing error (non-fatal)', { error: err.message });
    }
  }
}
