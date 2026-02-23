import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { registerMap } from "./resilience-core";

interface PaymentFailure {
  customerId: string;
  invoiceId: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  userId?: string;
}

interface DunningRecord {
  userId: string;
  reason: string;
  startedAt: Date;
  stage: "warning" | "reminder" | "final_warning" | "downgraded";
  lastNotifiedAt: Date;
  originalTier: string;
}

interface PausedSubscription {
  userId: string;
  pausedAt: Date;
  reason?: string;
  originalTier: string;
}

interface PromoCode {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  expiresAt: Date;
  applicableTiers: string[];
}

interface TrialRecord {
  userId: string;
  tier: string;
  startedAt: Date;
  endsAt: Date;
  ended: boolean;
}

interface InvoiceRecord {
  id: string;
  userId: string;
  amount: number;
  status: string;
  description: string;
  createdAt: Date;
}

const paymentFailures = new Map<string, PaymentFailure>();
registerMap("paymentFailures", paymentFailures, 200);
const dunningRecords = new Map<string, DunningRecord>();
registerMap("dunningRecords", dunningRecords, 200);
const pausedSubscriptions = new Map<string, PausedSubscription>();
registerMap("pausedSubscriptions", pausedSubscriptions, 200);
const trialRecords = new Map<string, TrialRecord>();
registerMap("trialRecords", trialRecords, 200);
const trialHistory = new Set<string>();
const invoiceStore = new Map<string, InvoiceRecord[]>();
registerMap("invoiceStore", invoiceStore, 500);
const appliedPromos = new Map<string, string>();
registerMap("appliedPromos", appliedPromos, 200);

const GRACE_PERIOD_DAYS = 3;
const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_TIER = "starter";

const promoCodes: PromoCode[] = [
  { code: "CREATOR20", discountPercent: 20, maxUses: 100, currentUses: 0, expiresAt: new Date("2027-01-01"), applicableTiers: ["starter", "pro", "ultimate"] },
  { code: "LAUNCH50", discountPercent: 50, maxUses: 50, currentUses: 0, expiresAt: new Date("2026-06-01"), applicableTiers: ["starter", "pro"] },
  { code: "FRIEND10", discountPercent: 10, maxUses: 500, currentUses: 0, expiresAt: new Date("2027-12-31"), applicableTiers: ["youtube", "starter", "pro", "ultimate"] },
];

const MONTHLY_PRICES: Record<string, number> = { youtube: 999, starter: 4999, pro: 9999, ultimate: 14999 };

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    return user?.id || null;
  } catch (error) {
    console.error("[Stripe Hardening] findUserByCustomerId error:", error);
    return null;
  }
}

export async function handlePaymentFailed(customerId: string, invoiceId: string, attemptCount: number): Promise<void> {
  try {
    const existing = paymentFailures.get(customerId);
    const now = new Date();
    paymentFailures.set(customerId, {
      customerId, invoiceId, attemptCount,
      firstFailedAt: existing?.firstFailedAt || now,
      lastFailedAt: now,
      userId: existing?.userId,
    });

    const userId = existing?.userId || await findUserByCustomerId(customerId);
    if (userId) {
      paymentFailures.get(customerId)!.userId = userId;
      await storage.createNotification({
        userId, type: "payment_failed", severity: "critical",
        title: "Payment Failed",
        message: `Your payment attempt #${attemptCount} failed. Please update your payment method to avoid service interruption.`,
        metadata: { source: "billing" },
      });

      if (attemptCount === 1) {
        await startDunning(userId, "payment_failed");
      }

      const failure = paymentFailures.get(customerId)!;
      const daysSinceFirst = (now.getTime() - failure.firstFailedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst >= GRACE_PERIOD_DAYS) {
        await endDunning(userId, false);
      }
    }
    console.log(`[StripeHardening] Payment failed for customer ${customerId}, attempt ${attemptCount}`);
  } catch (err) {
    console.error("[StripeHardening] handlePaymentFailed error:", err);
  }
}

export async function handlePaymentSucceeded(customerId: string, invoiceId: string): Promise<void> {
  try {
    const failure = paymentFailures.get(customerId);
    const userId = failure?.userId || await findUserByCustomerId(customerId);
    paymentFailures.delete(customerId);

    if (userId) {
      await endDunning(userId, true);
      await storage.createNotification({
        userId, type: "payment_success", severity: "info",
        title: "Payment Successful",
        message: "Your payment has been processed successfully. Thank you!",
        metadata: { source: "billing" },
      });

      const existing = invoiceStore.get(userId) || [];
      existing.push({ id: invoiceId, userId, amount: 0, status: "paid", description: "Subscription payment", createdAt: new Date() });
      invoiceStore.set(userId, existing);
    }
    console.log(`[StripeHardening] Payment succeeded for customer ${customerId}`);
  } catch (err) {
    console.error("[StripeHardening] handlePaymentSucceeded error:", err);
  }
}

export async function checkDunningStatus(userId: string): Promise<DunningRecord | null> {
  try {
    return dunningRecords.get(userId) || null;
  } catch (error) {
    console.error("[Stripe Hardening] checkDunningStatus error:", error);
    return null;
  }
}

export async function startDunning(userId: string, reason: string): Promise<void> {
  try {
    if (dunningRecords.has(userId)) return;
    const user = await storage.getUser(userId);
    dunningRecords.set(userId, {
      userId, reason, startedAt: new Date(), stage: "warning",
      lastNotifiedAt: new Date(), originalTier: user?.tier || "free",
    });
    await storage.createNotification({
      userId, type: "dunning_started", severity: "warning",
      title: "Payment Issue Detected",
      message: "We were unable to process your payment. Please update your payment method within 5 days to avoid losing access.",
      metadata: { source: "billing" },
    });
    console.log(`[StripeHardening] Dunning started for user ${userId}: ${reason}`);
  } catch (err) {
    console.error("[StripeHardening] startDunning error:", err);
  }
}

export async function endDunning(userId: string, resolved: boolean): Promise<void> {
  try {
    const record = dunningRecords.get(userId);
    if (!record) return;
    dunningRecords.delete(userId);

    if (resolved) {
      await storage.createNotification({
        userId, type: "dunning_resolved", severity: "info",
        title: "Payment Issue Resolved",
        message: "Your payment has been processed. Your subscription is fully active.",
        metadata: { source: "billing" },
      });
    } else {
      await storage.updateUserRole(userId, "user", "free");
      await storage.createNotification({
        userId, type: "subscription_downgraded", severity: "critical",
        title: "Subscription Downgraded",
        message: "Your subscription has been downgraded to Free due to payment failure. Upgrade anytime to restore access.",
        metadata: { source: "billing" },
      });
    }
    console.log(`[StripeHardening] Dunning ended for user ${userId}, resolved: ${resolved}`);
  } catch (err) {
    console.error("[StripeHardening] endDunning error:", err);
  }
}

export async function pauseSubscription(userId: string, reason?: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await storage.getUser(userId);
    if (!user || user.tier === "free") return { success: false, message: "No active subscription to pause" };
    if (pausedSubscriptions.has(userId)) return { success: false, message: "Subscription already paused" };

    pausedSubscriptions.set(userId, { userId, pausedAt: new Date(), reason, originalTier: user.tier || "free" });
    await storage.createNotification({
      userId, type: "subscription_paused", severity: "info",
      title: "Subscription Paused",
      message: `Your ${user.tier} subscription has been paused. Resume anytime to restore full access.`,
      metadata: { source: "billing" },
    });
    return { success: true, message: "Subscription paused successfully" };
  } catch (err) {
    console.error("[StripeHardening] pauseSubscription error:", err);
    return { success: false, message: "Failed to pause subscription" };
  }
}

export async function resumeSubscription(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const paused = pausedSubscriptions.get(userId);
    if (!paused) return { success: false, message: "No paused subscription found" };

    pausedSubscriptions.delete(userId);
    await storage.createNotification({
      userId, type: "subscription_resumed", severity: "info",
      title: "Subscription Resumed",
      message: `Your ${paused.originalTier} subscription is now active again.`,
      metadata: { source: "billing" },
    });
    return { success: true, message: "Subscription resumed successfully" };
  } catch (err) {
    console.error("[StripeHardening] resumeSubscription error:", err);
    return { success: false, message: "Failed to resume subscription" };
  }
}

export async function getSubscriptionStatus(userId: string): Promise<{
  tier: string; active: boolean; paused: boolean; inDunning: boolean;
  inTrial: boolean; dunningStage?: string; pausedAt?: Date; trialEndsAt?: Date;
}> {
  try {
    const user = await storage.getUser(userId);
    const dunning = dunningRecords.get(userId);
    const paused = pausedSubscriptions.get(userId);
    const trial = trialRecords.get(userId);
    const isTrialActive = trial && !trial.ended && trial.endsAt > new Date();

    return {
      tier: user?.tier || "free",
      active: (user?.tier !== "free") && !paused && !dunning,
      paused: !!paused, inDunning: !!dunning, inTrial: !!isTrialActive,
      dunningStage: dunning?.stage, pausedAt: paused?.pausedAt,
      trialEndsAt: isTrialActive ? trial!.endsAt : undefined,
    };
  } catch (error) {
    console.error("[Stripe Hardening] getSubscriptionStatus error:", error);
    return { tier: "free", active: false, paused: false, inDunning: false, inTrial: false };
  }
}

export async function isSubscriptionActive(userId: string): Promise<boolean> {
  try {
    const status = await getSubscriptionStatus(userId);
    return status.active;
  } catch (error) {
    console.error("[Stripe Hardening] isSubscriptionActive error:", error);
    return false;
  }
}

export async function validatePromoCode(code: string): Promise<{ valid: boolean; discountPercent?: number; applicableTiers?: string[]; message: string }> {
  try {
    const promo = promoCodes.find(p => p.code.toUpperCase() === code.toUpperCase());
    if (!promo) return { valid: false, message: "Invalid promo code" };
    if (promo.currentUses >= promo.maxUses) return { valid: false, message: "Promo code has reached maximum uses" };
    if (new Date() > promo.expiresAt) return { valid: false, message: "Promo code has expired" };
    return { valid: true, discountPercent: promo.discountPercent, applicableTiers: promo.applicableTiers, message: "Promo code is valid" };
  } catch (error) {
    console.error("[Stripe Hardening] validatePromoCode error:", error);
    return { valid: false, message: "Error validating promo code" };
  }
}

export async function applyPromoCode(userId: string, code: string): Promise<{ success: boolean; discountPercent?: number; message: string }> {
  try {
    if (appliedPromos.has(userId)) return { success: false, message: "You have already used a promo code" };
    const validation = await validatePromoCode(code);
    if (!validation.valid) return { success: false, message: validation.message };

    const promo = promoCodes.find(p => p.code.toUpperCase() === code.toUpperCase())!;
    promo.currentUses++;
    appliedPromos.set(userId, code.toUpperCase());
    await storage.createNotification({
      userId, type: "promo_applied", severity: "info",
      title: "Promo Code Applied",
      message: `${promo.discountPercent}% discount has been applied to your account.`,
      metadata: { source: "billing" },
    });
    return { success: true, discountPercent: promo.discountPercent, message: `${promo.discountPercent}% discount applied` };
  } catch (error) {
    console.error("[Stripe Hardening] applyPromoCode error:", error);
    return { success: false, message: "Error applying promo code" };
  }
}

export async function getActivePromoCodes(): Promise<PromoCode[]> {
  try {
    const now = new Date();
    return promoCodes.filter(p => p.currentUses < p.maxUses && now < p.expiresAt);
  } catch (error) {
    console.error("[Stripe Hardening] getActivePromoCodes error:", error);
    return [];
  }
}

export async function startFreeTrial(userId: string, tier: string = DEFAULT_TRIAL_TIER, durationDays: number = DEFAULT_TRIAL_DAYS): Promise<{ success: boolean; message: string; endsAt?: Date }> {
  try {
    if (trialHistory.has(userId)) return { success: false, message: "You have already used your free trial" };
    const user = await storage.getUser(userId);
    if (user && user.tier !== "free") return { success: false, message: "You already have an active subscription" };

    const now = new Date();
    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    trialRecords.set(userId, { userId, tier, startedAt: now, endsAt, ended: false });
    trialHistory.add(userId);

    await storage.updateUserRole(userId, "premium", tier);
    await storage.createNotification({
      userId, type: "trial_started", severity: "info",
      title: "Free Trial Started",
      message: `Your ${durationDays}-day free trial of the ${tier} tier has started. Enjoy full access!`,
      metadata: { source: "billing" },
    });
    return { success: true, message: `${durationDays}-day trial started`, endsAt };
  } catch (err) {
    console.error("[StripeHardening] startFreeTrial error:", err);
    return { success: false, message: "Failed to start free trial" };
  }
}

export async function checkTrialStatus(userId: string): Promise<{ inTrial: boolean; daysRemaining?: number; tier?: string; endsAt?: Date }> {
  try {
    const trial = trialRecords.get(userId);
    if (!trial || trial.ended) return { inTrial: false };
    const now = new Date();
    if (now > trial.endsAt) {
      await endTrial(userId);
      return { inTrial: false };
    }
    const daysRemaining = Math.ceil((trial.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { inTrial: true, daysRemaining, tier: trial.tier, endsAt: trial.endsAt };
  } catch (error) {
    console.error("[Stripe Hardening] checkTrialStatus error:", error);
    return { inTrial: false };
  }
}

export async function endTrial(userId: string): Promise<void> {
  try {
    const trial = trialRecords.get(userId);
    if (!trial || trial.ended) return;
    trial.ended = true;
    await storage.updateUserRole(userId, "user", "free");
    await storage.createNotification({
      userId, type: "trial_ended", severity: "warning",
      title: "Free Trial Ended",
      message: "Your free trial has ended. Upgrade now to keep your premium features!",
      metadata: { source: "billing" },
    });
    console.log(`[StripeHardening] Trial ended for user ${userId}`);
  } catch (err) {
    console.error("[StripeHardening] endTrial error:", err);
  }
}

export async function hasUsedTrial(userId: string): Promise<boolean> {
  return trialHistory.has(userId);
}

export async function getInvoiceHistory(userId: string): Promise<InvoiceRecord[]> {
  try {
    return invoiceStore.get(userId) || [];
  } catch (error) {
    console.error("[Stripe Hardening] getInvoiceHistory error:", error);
    return [];
  }
}

export async function getNextBillingDate(userId: string): Promise<Date | null> {
  try {
    const invoices = invoiceStore.get(userId);
    if (!invoices || invoices.length === 0) return null;
    const last = invoices[invoices.length - 1];
    const next = new Date(last.createdAt);
    next.setMonth(next.getMonth() + 1);
    return next;
  } catch (error) {
    console.error("[Stripe Hardening] getNextBillingDate error:", error);
    return null;
  }
}

export async function getLifetimeSpend(userId: string): Promise<number> {
  try {
    const invoices = invoiceStore.get(userId) || [];
    return invoices.reduce((sum, inv) => sum + inv.amount, 0);
  } catch (error) {
    console.error("[Stripe Hardening] getLifetimeSpend error:", error);
    return 0;
  }
}

export async function getAnnualPricing(): Promise<{ tier: string; monthly: number; annual: number; savings: number }[]> {
  try {
    return Object.entries(MONTHLY_PRICES).map(([tier, monthly]) => {
      const annual = monthly * 10;
      const savings = monthly * 12 - annual;
      return { tier, monthly, annual, savings };
    });
  } catch (error) {
    console.error("[Stripe Hardening] getAnnualPricing error:", error);
    return [];
  }
}

export async function switchToAnnual(userId: string): Promise<{ success: boolean; message: string; annualPrice?: number }> {
  try {
    const user = await storage.getUser(userId);
    if (!user || user.tier === "free") return { success: false, message: "No active subscription to switch" };
    const monthly = MONTHLY_PRICES[user.tier || "starter"] || 4999;
    const annualPrice = monthly * 10;
    await storage.createNotification({
      userId, type: "billing_changed", severity: "info",
      title: "Switched to Annual Billing",
      message: `You've switched to annual billing and will save $${((monthly * 2) / 100).toFixed(2)} per year!`,
      metadata: { source: "billing" },
    });
    return { success: true, message: "Switched to annual billing", annualPrice };
  } catch (error) {
    console.error("[Stripe Hardening] switchToAnnual error:", error);
    return { success: false, message: "Failed to switch to annual billing" };
  }
}

export async function switchToMonthly(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await storage.getUser(userId);
    if (!user || user.tier === "free") return { success: false, message: "No active subscription to switch" };
    await storage.createNotification({
      userId, type: "billing_changed", severity: "info",
      title: "Switched to Monthly Billing",
      message: "You've switched back to monthly billing. Changes take effect at the next billing cycle.",
      metadata: { source: "billing" },
    });
    return { success: true, message: "Switched to monthly billing" };
  } catch (error) {
    console.error("[Stripe Hardening] switchToMonthly error:", error);
    return { success: false, message: "Failed to switch to monthly billing" };
  }
}
