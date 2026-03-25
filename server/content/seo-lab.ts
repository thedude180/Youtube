import { emitDomainEvent } from "../kernel/index";

export interface SEOAnalysis {
  titleScore: number;
  descriptionScore: number;
  tagScore: number;
  overallScore: number;
  suggestions: SEOSuggestion[];
}

export interface SEOSuggestion {
  field: string;
  current: string;
  suggested: string;
  reason: string;
  impact: "high" | "medium" | "low";
}

export function analyzeSEO(
  title: string,
  description: string,
  tags: string[],
  gameTitle?: string,
): SEOAnalysis {
  const suggestions: SEOSuggestion[] = [];

  let titleScore = 0.5;
  if (title.length >= 30 && title.length <= 70) titleScore += 0.2;
  if (title.length > 70) {
    suggestions.push({ field: "title", current: title, suggested: title.slice(0, 67) + "...", reason: "Title exceeds 70 characters", impact: "high" });
  }
  if (title.length < 30) {
    suggestions.push({ field: "title", current: title, suggested: title, reason: "Title is too short for SEO", impact: "medium" });
  }
  if (gameTitle && title.toLowerCase().includes(gameTitle.toLowerCase())) titleScore += 0.15;
  if (/[|—\-:]/.test(title)) titleScore += 0.1;
  titleScore = Math.min(1, titleScore);

  let descriptionScore = 0.5;
  if (description.length >= 100) descriptionScore += 0.2;
  if (description.length >= 250) descriptionScore += 0.15;
  if (description.length < 100) {
    suggestions.push({ field: "description", current: `${description.length} chars`, suggested: "Add 250+ characters", reason: "Short descriptions hurt discovery", impact: "high" });
  }
  descriptionScore = Math.min(1, descriptionScore);

  let tagScore = 0.5;
  if (tags.length >= 5) tagScore += 0.15;
  if (tags.length >= 10) tagScore += 0.15;
  if (tags.length < 5) {
    suggestions.push({ field: "tags", current: `${tags.length} tags`, suggested: "Add 10-15 relevant tags", reason: "More tags improve discovery", impact: "medium" });
  }
  if (gameTitle && tags.some(t => t.toLowerCase().includes(gameTitle.toLowerCase()))) tagScore += 0.15;
  tagScore = Math.min(1, tagScore);

  const overallScore = titleScore * 0.4 + descriptionScore * 0.35 + tagScore * 0.25;

  return { titleScore, descriptionScore, tagScore, overallScore, suggestions };
}

export function generateSEOSuggestions(
  title: string,
  description: string,
  tags: string[],
  gameTitle?: string,
): SEOSuggestion[] {
  return analyzeSEO(title, description, tags, gameTitle).suggestions;
}

export function scoreSEOHealth(userId: string, analyses: SEOAnalysis[]): {
  avgScore: number;
  trend: "improving" | "stable" | "declining";
  worstArea: string;
} {
  if (analyses.length === 0) return { avgScore: 0, trend: "stable", worstArea: "none" };

  const avgScore = analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length;

  const avgTitle = analyses.reduce((sum, a) => sum + a.titleScore, 0) / analyses.length;
  const avgDesc = analyses.reduce((sum, a) => sum + a.descriptionScore, 0) / analyses.length;
  const avgTags = analyses.reduce((sum, a) => sum + a.tagScore, 0) / analyses.length;

  const worst = Math.min(avgTitle, avgDesc, avgTags);
  const worstArea = worst === avgTitle ? "titles" : worst === avgDesc ? "descriptions" : "tags";

  const half = Math.floor(analyses.length / 2);
  const recentAvg = analyses.slice(0, half).reduce((s, a) => s + a.overallScore, 0) / Math.max(1, half);
  const olderAvg = analyses.slice(half).reduce((s, a) => s + a.overallScore, 0) / Math.max(1, analyses.length - half);

  const trend = recentAvg > olderAvg + 0.05 ? "improving" : recentAvg < olderAvg - 0.05 ? "declining" : "stable";

  return { avgScore, trend, worstArea };
}
