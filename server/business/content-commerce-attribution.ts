import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface CommerceEvent {
  id: string;
  contentId: string;
  contentType: "video" | "stream" | "short" | "community_post";
  commerceType: "affiliate_click" | "affiliate_purchase" | "merch_sale" | "digital_product" | "course_enrollment" | "donation" | "subscription" | "sponsor_conversion";
  amount: number;
  currency: string;
  platform: string;
  timestamp: Date;
  attributionWindow: "direct" | "first_touch" | "last_touch" | "multi_touch";
  touchpointCount: number;
  metadata?: Record<string, unknown>;
}

export interface ContentCommerceProfile {
  contentId: string;
  title: string;
  totalCommerce: number;
  eventCount: number;
  avgOrderValue: number;
  topCommerceType: string;
  conversionRate: number;
  attributionConfidence: number;
}

export interface ContentCommerceReport {
  totalCommerceRevenue: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  attributionRate: number;
  topContent: ContentCommerceProfile[];
  byCommerceType: Record<string, { revenue: number; count: number; avgValue: number }>;
  byAttributionWindow: Record<string, { revenue: number; count: number }>;
  recommendations: string[];
  reportedAt: Date;
}

const commerceEvents: CommerceEvent[] = [];
let eventCounter = 0;

export function recordCommerceEvent(
  contentId: string,
  contentType: CommerceEvent["contentType"],
  commerceType: CommerceEvent["commerceType"],
  amount: number,
  platform: string,
  attributionWindow: CommerceEvent["attributionWindow"] = "direct",
  touchpointCount: number = 1,
  metadata?: Record<string, unknown>
): CommerceEvent {
  const event: CommerceEvent = {
    id: `commerce-${++eventCounter}`,
    contentId, contentType, commerceType, amount,
    currency: "USD", platform,
    timestamp: new Date(),
    attributionWindow, touchpointCount, metadata,
  };

  commerceEvents.push(event);
  if (commerceEvents.length > 10000) commerceEvents.splice(0, commerceEvents.length - 10000);

  appendEvent("commerce.attribution_recorded", "revenue", contentId, {
    commerceType, amount, attributionWindow, platform,
  }, "content-commerce-attribution");

  return event;
}

export function getContentCommerceProfile(contentId: string): ContentCommerceProfile | null {
  const events = commerceEvents.filter(e => e.contentId === contentId);
  if (events.length === 0) return null;

  const totalCommerce = events.reduce((sum, e) => sum + e.amount, 0);
  const avgOrderValue = totalCommerce / events.length;

  const typeMap = new Map<string, number>();
  for (const e of events) {
    typeMap.set(e.commerceType, (typeMap.get(e.commerceType) || 0) + e.amount);
  }
  const topCommerceType = Array.from(typeMap.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] || "unknown";

  const directCount = events.filter(e => e.attributionWindow === "direct").length;
  const attributionConfidence = events.length > 0 ? directCount / events.length * 0.5 + 0.5 : 0;
  const conversionRate = Math.min(1, events.length / 100);

  return {
    contentId, title: `Content ${contentId}`,
    totalCommerce, eventCount: events.length,
    avgOrderValue, topCommerceType, conversionRate, attributionConfidence,
  };
}

export function generateCommerceReport(): ContentCommerceReport {
  const totalCommerceRevenue = commerceEvents.reduce((sum, e) => sum + e.amount, 0);
  const directRevenue = commerceEvents.filter(e => e.attributionWindow === "direct").reduce((sum, e) => sum + e.amount, 0);
  const attributedRevenue = commerceEvents.filter(e => e.attributionWindow !== "multi_touch" || e.touchpointCount <= 3).reduce((sum, e) => sum + e.amount, 0);

  const contentMap = new Map<string, CommerceEvent[]>();
  for (const e of commerceEvents) {
    const arr = contentMap.get(e.contentId) || [];
    arr.push(e);
    contentMap.set(e.contentId, arr);
  }

  const topContent = Array.from(contentMap.entries())
    .map(([contentId]) => getContentCommerceProfile(contentId)!)
    .filter(Boolean)
    .sort((a, b) => b.totalCommerce - a.totalCommerce)
    .slice(0, 20);

  const byCommerceType: ContentCommerceReport["byCommerceType"] = {};
  for (const e of commerceEvents) {
    if (!byCommerceType[e.commerceType]) byCommerceType[e.commerceType] = { revenue: 0, count: 0, avgValue: 0 };
    byCommerceType[e.commerceType].revenue += e.amount;
    byCommerceType[e.commerceType].count++;
  }
  for (const key of Object.keys(byCommerceType)) {
    byCommerceType[key].avgValue = byCommerceType[key].count > 0 ? byCommerceType[key].revenue / byCommerceType[key].count : 0;
  }

  const byAttributionWindow: ContentCommerceReport["byAttributionWindow"] = {};
  for (const e of commerceEvents) {
    if (!byAttributionWindow[e.attributionWindow]) byAttributionWindow[e.attributionWindow] = { revenue: 0, count: 0 };
    byAttributionWindow[e.attributionWindow].revenue += e.amount;
    byAttributionWindow[e.attributionWindow].count++;
  }

  const attributionRate = totalCommerceRevenue > 0 ? attributedRevenue / totalCommerceRevenue : 0;
  const recommendations: string[] = [];
  if (attributionRate < 0.5) recommendations.push("Attribution rate below 50% — add tracking parameters to commerce links");
  if (directRevenue / (totalCommerceRevenue || 1) < 0.3) recommendations.push("Low direct attribution — implement UTM tracking on all content links");
  if (topContent.length < 5) recommendations.push("Limited commerce data — increase product/affiliate placements across more content");
  if (Object.keys(byCommerceType).length < 3) recommendations.push("Revenue concentrated in few commerce types — diversify monetization");

  return {
    totalCommerceRevenue,
    attributedRevenue,
    unattributedRevenue: totalCommerceRevenue - attributedRevenue,
    attributionRate,
    topContent,
    byCommerceType,
    byAttributionWindow,
    recommendations,
    reportedAt: new Date(),
  };
}
