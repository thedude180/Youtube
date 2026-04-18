import { storage } from "../storage";
import { withRetry } from "../lib/retry";
import { createLogger } from "../lib/logger";

const logger = createLogger("youtube-analytics");

const YT_ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2/reports";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MILESTONE_BREAKPOINTS = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

async function getFirstChannelForUser(userId: string): Promise<{ id: number; accessToken: string; channelId: string; subscriberCount: number | null } | null> {
  const channels = await storage.getChannelsByUser(userId);
  const ch = channels.find(c => c.accessToken) || channels[0];
  if (!ch) return null;
  return {
    id: ch.id,
    accessToken: ch.accessToken || "",
    channelId: ch.channelId || "",
    subscriberCount: ch.subscriberCount ?? null,
  };
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

async function fetchAnalyticsReport(
  accessToken: string,
  channelYtId: string,
  params: Record<string, string>
): Promise<any[] | null> {
  const searchParams = new URLSearchParams({
    ids: `channel==${channelYtId || "MINE"}`,
    ...params,
  });
  const url = `${YT_ANALYTICS_BASE}?${searchParams}`;
  try {
    const res = await withRetry(
      () => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      { label: "YouTube Analytics" }
    );
    if (!res.ok) {
      const errBody = await res.text();
      logger.warn("YouTube Analytics API error", { status: res.status, body: errBody.slice(0, 200) });
      return null;
    }
    const data = await res.json() as any;
    return data.rows || [];
  } catch (err: any) {
    logger.error("YouTube Analytics fetch failed", { error: err?.message });
    return null;
  }
}

export async function fetchViewsByDayAndHour(userId: string): Promise<{
  heatmapData: Array<{ day: string; hours: Array<{ hour: number; activity: number; viewers: number; engagement: number }> }>;
  peakTime: { day: string; hour: number };
  totalDataPoints: number;
  source: "real" | "none";
}> {
  const EMPTY = {
    heatmapData: DAY_NAMES.map(day => ({ day, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, activity: 0, viewers: 0, engagement: 0 })) })),
    peakTime: { day: "Saturday", hour: 20 },
    totalDataPoints: 0,
    source: "none" as const,
  };

  const ch = await getFirstChannelForUser(userId);
  if (!ch || !ch.accessToken) return EMPTY;

  const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
    startDate: daysAgoStr(90),
    endDate: daysAgoStr(0),
    metrics: "views,estimatedMinutesWatched",
    dimensions: "dayOfWeek,hour",
    sort: "dayOfWeek,hour",
  });

  if (!rows || rows.length === 0) return EMPTY;

  const viewMap: Record<string, { views: number; minutes: number }> = {};
  let maxViews = 1;

  for (const row of rows) {
    const [dayOfWeek, hour, views, minutes] = row;
    const key = `${dayOfWeek}-${hour}`;
    viewMap[key] = { views: Number(views) || 0, minutes: Number(minutes) || 0 };
    if ((Number(views) || 0) > maxViews) maxViews = Number(views);
  }

  let peakDayIdx = 0;
  let peakHour = 20;
  let peakViews = 0;

  const heatmapData = Array.from({ length: 7 }, (_, rawDay) => {
    const ytDay = rawDay;
    const dayName = DAY_NAMES[ytDay];
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const v = viewMap[`${ytDay}-${hour}`] || { views: 0, minutes: 0 };
      const activity = Math.round((v.views / maxViews) * 100);
      if (v.views > peakViews) {
        peakViews = v.views;
        peakDayIdx = ytDay;
        peakHour = hour;
      }
      return { hour, activity, viewers: v.views, engagement: v.minutes > 0 ? Math.round((v.minutes / Math.max(v.views, 1)) * 10) : 0 };
    });
    return { day: dayName, hours };
  });

  return {
    heatmapData,
    peakTime: { day: DAY_NAMES[peakDayIdx], hour: peakHour },
    totalDataPoints: rows.length,
    source: "real",
  };
}

export async function fetchMilestoneData(userId: string): Promise<{
  currentSubscribers: number;
  achievedMilestones: Array<{ milestone: number; achievedAt: string }>;
  nextMilestone: number;
  progress: number;
  estimatedDaysToNext: number;
  dailyGrowthRate: number;
  growthTrend: string;
  source: "real" | "none";
}> {
  const ch = await getFirstChannelForUser(userId);
  if (!ch) {
    return { currentSubscribers: 0, achievedMilestones: [], nextMilestone: 100, progress: 0, estimatedDaysToNext: 0, dailyGrowthRate: 0, growthTrend: "stable", source: "none" };
  }

  const currentSubs = ch.subscriberCount || 0;
  const achievedMilestoneNums = MILESTONE_BREAKPOINTS.filter(m => currentSubs >= m);
  const achievedMilestones = achievedMilestoneNums.map(m => ({ milestone: m, achievedAt: "" }));
  const nextMilestone = MILESTONE_BREAKPOINTS.find(m => m > currentSubs) || MILESTONE_BREAKPOINTS[MILESTONE_BREAKPOINTS.length - 1];
  const prevMilestone = achievedMilestoneNums[achievedMilestoneNums.length - 1] || 0;
  const progress = nextMilestone > prevMilestone
    ? Math.round(((currentSubs - prevMilestone) / (nextMilestone - prevMilestone)) * 100)
    : 100;

  let dailyGrowthRate = 0;
  let growthTrend = "stable";
  let estimatedDaysToNext = 0;

  if (ch.accessToken && ch.channelId) {
    const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
      startDate: daysAgoStr(30),
      endDate: daysAgoStr(0),
      metrics: "subscribersGained,subscribersLost",
    });

    if (rows && rows.length > 0) {
      const [gained, lost] = rows[0];
      const netGain = (Number(gained) || 0) - (Number(lost) || 0);
      dailyGrowthRate = Math.round((netGain / 30) * 10) / 10;

      if (dailyGrowthRate > 2) growthTrend = "growing";
      else if (dailyGrowthRate < -2) growthTrend = "declining";
      else growthTrend = "stable";

      const subsNeeded = nextMilestone - currentSubs;
      estimatedDaysToNext = dailyGrowthRate > 0 ? Math.ceil(subsNeeded / dailyGrowthRate) : 0;
    }
  }

  return {
    currentSubscribers: currentSubs,
    achievedMilestones,
    nextMilestone,
    progress,
    estimatedDaysToNext,
    dailyGrowthRate,
    growthTrend,
    source: "real",
  };
}

export async function fetchGrowthForecast(userId: string): Promise<{
  currentSubscribers: number;
  monthlyGrowthRate: number;
  forecast: Array<{ month: string; predictedSubscribers: number; confidence: number }>;
  yearEndPrediction: number;
  bestCaseScenario: number;
  worstCaseScenario: number;
  accelerators: string[];
  source: "real" | "none";
}> {
  const EMPTY = {
    currentSubscribers: 0, monthlyGrowthRate: 0, forecast: [], yearEndPrediction: 0,
    bestCaseScenario: 0, worstCaseScenario: 0,
    accelerators: ["Consistent upload schedule", "SEO optimization", "Community engagement"],
    source: "none" as const,
  };

  const ch = await getFirstChannelForUser(userId);
  if (!ch) return EMPTY;

  const currentSubs = ch.subscriberCount || 0;

  let monthlyNetGain = 0;
  if (ch.accessToken && ch.channelId) {
    const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
      startDate: daysAgoStr(90),
      endDate: daysAgoStr(0),
      metrics: "subscribersGained,subscribersLost",
    });
    if (rows && rows.length > 0) {
      const [gained, lost] = rows[0];
      monthlyNetGain = Math.round(((Number(gained) || 0) - (Number(lost) || 0)) / 3);
    }
  }

  const monthlyGrowthRate = currentSubs > 0
    ? Math.round((monthlyNetGain / currentSubs) * 1000) / 10
    : 0;

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const forecast = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mon = MONTHS_SHORT[d.getMonth()];
    const month = `${d.getFullYear()}-${mon}`;
    const predictedSubscribers = Math.max(0, Math.round(currentSubs + monthlyNetGain * (i + 1)));
    return { month, predictedSubscribers, confidence: Math.max(10, 90 - i * 5) };
  });

  const yearEndPrediction = forecast[11]?.predictedSubscribers || currentSubs;
  const bestCaseScenario = Math.max(currentSubs, Math.round(currentSubs + monthlyNetGain * 12 * 1.5));
  const worstCaseScenario = Math.max(0, Math.round(currentSubs + monthlyNetGain * 12 * 0.5));

  return {
    currentSubscribers: currentSubs,
    monthlyGrowthRate,
    forecast,
    yearEndPrediction,
    bestCaseScenario,
    worstCaseScenario,
    accelerators: ["Consistent upload schedule", "SEO optimization", "Community engagement"],
    source: "real",
  };
}

export async function fetchEngagementScore(userId: string): Promise<{
  overallScore: number;
  components: {
    likeRate: number;
    commentRate: number;
    shareRate: number;
    saveRate: number;
    avgWatchPercentage: number;
    subscriberConversion: number;
  };
  nicheAverage: number;
  percentile: number;
  trend: "improving" | "stable" | "declining";
  source: "real" | "none";
}> {
  const EMPTY = {
    overallScore: 0, components: { likeRate: 0, commentRate: 0, shareRate: 0, saveRate: 0, avgWatchPercentage: 0, subscriberConversion: 0 },
    nicheAverage: 4.2, percentile: 0, trend: "stable" as const, source: "none" as const,
  };

  const ch = await getFirstChannelForUser(userId);
  if (!ch || !ch.accessToken) return EMPTY;

  const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
    startDate: daysAgoStr(30),
    endDate: daysAgoStr(0),
    metrics: "views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained",
  });

  if (!rows || rows.length === 0) return EMPTY;

  const [views, likes, comments, shares, minutesWatched, avgViewPct, subsGained] = rows[0];
  const v = Math.max(Number(views) || 1, 1);

  const likeRate = Math.round(((Number(likes) || 0) / v) * 1000) / 10;
  const commentRate = Math.round(((Number(comments) || 0) / v) * 1000) / 10;
  const shareRate = Math.round(((Number(shares) || 0) / v) * 1000) / 10;
  const avgWatchPercentage = Math.round(Number(avgViewPct) || 0);
  const subscriberConversion = Math.round(((Number(subsGained) || 0) / v) * 1000) / 10;

  const overallScore = Math.min(10, Math.round(((likeRate * 0.3 + commentRate * 0.2 + shareRate * 0.1 + avgWatchPercentage / 10 * 0.3 + subscriberConversion * 0.1)) * 10) / 10);

  return {
    overallScore,
    components: { likeRate, commentRate, shareRate, saveRate: 0, avgWatchPercentage, subscriberConversion },
    nicheAverage: 4.2,
    percentile: Math.min(99, Math.round(overallScore * 10)),
    trend: "stable",
    source: "real",
  };
}

export async function fetchGeoDistribution(userId: string): Promise<{
  distribution: Array<{ country: string; percentage: number; views: number }>;
  primaryLanguage: string;
  internationalPercentage: number;
  source: "real" | "none";
}> {
  const EMPTY = { distribution: [], primaryLanguage: "en", internationalPercentage: 0, source: "none" as const };

  const ch = await getFirstChannelForUser(userId);
  if (!ch || !ch.accessToken) return EMPTY;

  const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
    startDate: daysAgoStr(90),
    endDate: daysAgoStr(0),
    metrics: "views",
    dimensions: "country",
    sort: "-views",
    maxResults: "25",
  });

  if (!rows || rows.length === 0) return EMPTY;

  const totalViews = rows.reduce((sum: number, row: any[]) => sum + (Number(row[1]) || 0), 0);
  const distribution = rows.map((row: any[]) => ({
    country: row[0] as string,
    views: Number(row[1]) || 0,
    percentage: totalViews > 0 ? Math.round(((Number(row[1]) || 0) / totalViews) * 1000) / 10 : 0,
  }));

  const topCountry = distribution[0]?.country || "US";
  const topPct = distribution[0]?.percentage || 100;
  const internationalPercentage = Math.round(Math.max(0, 100 - topPct));

  const COUNTRY_LANG_MAP: Record<string, string> = {
    US: "en", GB: "en", CA: "en", AU: "en", IN: "hi",
    ES: "es", MX: "es", BR: "pt", DE: "de", FR: "fr",
    JP: "ja", KR: "ko", CN: "zh", RU: "ru",
  };

  return {
    distribution,
    primaryLanguage: COUNTRY_LANG_MAP[topCountry] || "en",
    internationalPercentage,
    source: "real",
  };
}

export async function fetchChannelCTR(userId: string): Promise<{
  ctr: number | null;
  impressions: number;
  source: "real" | "none";
}> {
  const ch = await getFirstChannelForUser(userId);
  if (!ch || !ch.accessToken) return { ctr: null, impressions: 0, source: "none" };

  const rows = await fetchAnalyticsReport(ch.accessToken, ch.channelId, {
    startDate: daysAgoStr(28),
    endDate: daysAgoStr(0),
    metrics: "impressions,impressionsClickThroughRate",
  });

  if (!rows || rows.length === 0) return { ctr: null, impressions: 0, source: "none" };

  const [impressions, ctrDecimal] = rows[0];
  const ctr = ctrDecimal != null ? Math.round(Number(ctrDecimal) * 1000) / 10 : null;

  return { ctr, impressions: Number(impressions) || 0, source: "real" };
}

export async function fetchTopFans(userId: string): Promise<{
  topFans: Array<{ authorDisplayName: string; commentCount: number; likeCount: number }>;
  totalSuperfans: number;
  superfanGrowthRate: number;
  source: "real" | "none";
}> {
  return { topFans: [], totalSuperfans: 0, superfanGrowthRate: 0, source: "none" };
}
