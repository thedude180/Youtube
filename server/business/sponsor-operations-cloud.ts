export interface SponsorDeal {
  id: string;
  brandName: string;
  status: "prospect" | "outreach" | "negotiating" | "contracted" | "in_progress" | "completed" | "declined";
  dealValue: number;
  deliverables: string[];
  deadline?: Date;
  contactName?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorPipeline {
  deals: SponsorDeal[];
  totalPipelineValue: number;
  activeDeals: number;
  conversionRate: number;
  averageDealValue: number;
  recommendations: string[];
}

export interface SponsorOperationsReport {
  pipeline: SponsorPipeline;
  rateCard: SponsorRateCard;
  outreachReadiness: number;
  recommendations: string[];
  assessedAt: Date;
}

export interface SponsorRateCard {
  dedicatedVideo: number;
  integratedSponsorship: number;
  preRoll: number;
  socialPost: number;
  liveStreamMention: number;
  packageDeal: number;
  currency: string;
}

const dealStore = new Map<string, SponsorDeal[]>();

export function getUserDeals(userId: string): SponsorDeal[] {
  if (!dealStore.has(userId)) dealStore.set(userId, []);
  return dealStore.get(userId)!;
}

export function addDeal(userId: string, deal: Omit<SponsorDeal, "id" | "createdAt" | "updatedAt">): SponsorDeal {
  const deals = getUserDeals(userId);
  const newDeal: SponsorDeal = {
    ...deal,
    id: `deal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  deals.push(newDeal);
  return newDeal;
}

export function updateDealStatus(userId: string, dealId: string, status: SponsorDeal["status"]): boolean {
  const deals = getUserDeals(userId);
  const deal = deals.find((d) => d.id === dealId);
  if (deal) { deal.status = status; deal.updatedAt = new Date(); return true; }
  return false;
}

export function generateRateCard(subscriberCount: number): SponsorRateCard {
  const baseRate = subscriberCount * 0.02;
  return {
    dedicatedVideo: Math.round(baseRate * 2),
    integratedSponsorship: Math.round(baseRate * 1.5),
    preRoll: Math.round(baseRate * 0.5),
    socialPost: Math.round(baseRate * 0.3),
    liveStreamMention: Math.round(baseRate * 0.8),
    packageDeal: Math.round(baseRate * 3.5),
    currency: "USD",
  };
}

export function getSponsorOperationsReport(
  userId: string,
  subscriberCount: number = 0
): SponsorOperationsReport {
  const deals = getUserDeals(userId);
  const activeDeals = deals.filter((d) => !["completed", "declined"].includes(d.status));
  const completedDeals = deals.filter((d) => d.status === "completed");
  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const conversionRate = deals.length > 0 ? completedDeals.length / deals.length : 0;
  const averageDealValue = completedDeals.length > 0
    ? completedDeals.reduce((sum, d) => sum + d.dealValue, 0) / completedDeals.length
    : 0;

  const rateCard = generateRateCard(subscriberCount);

  const recommendations: string[] = [];
  if (deals.length === 0) recommendations.push("Start building your sponsor pipeline — create a media kit and rate card");
  if (conversionRate < 0.2 && deals.length > 5) recommendations.push("Low conversion rate — improve outreach targeting or negotiate terms");
  if (activeDeals.length > 5) recommendations.push("Multiple active deals — ensure delivery capacity");
  if (subscriberCount > 10000 && deals.length === 0) recommendations.push("Your channel size supports sponsorships — begin outreach");

  const outreachReadiness = Math.min(1, (subscriberCount / 5000) * 0.3 + (deals.length > 0 ? 0.3 : 0) + (completedDeals.length > 0 ? 0.4 : 0));

  return {
    pipeline: { deals, totalPipelineValue, activeDeals: activeDeals.length, conversionRate, averageDealValue, recommendations: [] },
    rateCard,
    outreachReadiness,
    recommendations,
    assessedAt: new Date(),
  };
}
