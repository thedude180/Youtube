export interface SeasonalRevenueEntry {
  month: number;
  monthName: string;
  expectedMultiplier: number;
  drivers: string[];
  risks: string[];
  opportunities: string[];
}

export interface SeasonalRevenueCalendar {
  entries: SeasonalRevenueEntry[];
  currentMonth: SeasonalRevenueEntry;
  yearlyPattern: "front_loaded" | "back_loaded" | "seasonal_peaks" | "steady";
  recommendations: string[];
}

const MONTHLY_PATTERNS: Omit<SeasonalRevenueEntry, "month" | "monthName">[] = [
  { expectedMultiplier: 0.7, drivers: ["Post-holiday slowdown"], risks: ["Advertiser budget reset"], opportunities: ["New year content push", "Most anticipated games lists"] },
  { expectedMultiplier: 0.75, drivers: ["Q1 game releases"], risks: ["Low ad spend"], opportunities: ["State of Play coverage", "Valentine's gaming guides"] },
  { expectedMultiplier: 0.85, drivers: ["Spring releases", "GDC"], risks: ["Seasonal transition"], opportunities: ["Major PS5 releases", "Spring sale coverage"] },
  { expectedMultiplier: 0.9, drivers: ["Pre-summer content push"], risks: ["Outdoor competition"], opportunities: ["PS5 exclusives coverage"] },
  { expectedMultiplier: 0.8, drivers: ["E3/Summer Game Fest hype"], risks: ["Summer viewership dip"], opportunities: ["Announcement reactions", "Trailer breakdowns"] },
  { expectedMultiplier: 0.95, drivers: ["Summer Game Fest", "Showcase season"], risks: ["Vacation viewing drops"], opportunities: ["Deep dives on announcements", "Wishlist content"] },
  { expectedMultiplier: 0.75, drivers: ["Summer slowdown"], risks: ["Low viewership", "Reduced sponsorship"], opportunities: ["Backlog content", "Hidden gems series"] },
  { expectedMultiplier: 0.85, drivers: ["Fall preview season", "Gamescom"], risks: ["Back to school competition"], opportunities: ["Pre-order guides", "Fall preview content"] },
  { expectedMultiplier: 1.0, drivers: ["Fall release season", "TGS"], risks: ["Competition for attention"], opportunities: ["Major releases", "First impressions"] },
  { expectedMultiplier: 1.1, drivers: ["Holiday marketing ramp"], risks: ["Content saturation"], opportunities: ["Gift guides", "Holiday deals"] },
  { expectedMultiplier: 1.3, drivers: ["Black Friday", "Holiday shopping"], risks: ["Creator fatigue from output demands"], opportunities: ["Deal roundups", "Holiday specials", "Peak sponsorship rates"] },
  { expectedMultiplier: 1.4, drivers: ["Holiday peak", "Game Awards", "Year-end"], risks: ["Burnout from peak season"], opportunities: ["GOTY content", "Year-end compilations", "Holiday streams"] },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function getSeasonalRevenueCalendar(baseMonthlyRevenue: number = 0): SeasonalRevenueCalendar {
  const entries: SeasonalRevenueEntry[] = MONTHLY_PATTERNS.map((pattern, i) => ({
    month: i + 1,
    monthName: MONTH_NAMES[i],
    ...pattern,
  }));

  const currentMonthIndex = new Date().getMonth();
  const currentMonth = entries[currentMonthIndex];

  const firstHalf = entries.slice(0, 6).reduce((sum, e) => sum + e.expectedMultiplier, 0);
  const secondHalf = entries.slice(6).reduce((sum, e) => sum + e.expectedMultiplier, 0);
  const yearlyPattern: SeasonalRevenueCalendar["yearlyPattern"] =
    secondHalf > firstHalf * 1.2 ? "back_loaded" :
    firstHalf > secondHalf * 1.2 ? "front_loaded" : "seasonal_peaks";

  const recommendations: string[] = [];
  if (currentMonth.expectedMultiplier < 0.8) {
    recommendations.push("Low season — focus on evergreen content and building backlog for peak months");
  }
  if (currentMonth.expectedMultiplier >= 1.1) {
    recommendations.push("Peak season — maximize output and capture sponsorship opportunities");
  }
  if (currentMonth.opportunities.length > 0) {
    recommendations.push(`Key opportunities: ${currentMonth.opportunities.join(", ")}`);
  }

  return { entries, currentMonth, yearlyPattern, recommendations };
}
