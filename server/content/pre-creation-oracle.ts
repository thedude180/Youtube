import { analyzeSEO } from "./seo-lab";
import { scoreBrandSafety } from "./brand-safety";
import { checkBrandAlignment, getBrandProfile } from "./brand-system";
import { checkVoiceConsistency } from "./voice-guardian";

export interface OraclePrediction {
  overallScore: number;
  viewPrediction: string;
  engagementPrediction: string;
  recommendations: string[];
  risks: string[];
  goNoGo: "go" | "caution" | "no-go";
}

export function predictPerformance(
  userId: string,
  content: { title: string; description: string; tags: string[]; gameTitle?: string },
): OraclePrediction {
  const seo = analyzeSEO(content.title, content.description, content.tags, content.gameTitle);
  const safety = scoreBrandSafety(content);
  const brand = checkBrandAlignment(content, getBrandProfile(userId));
  const voice = checkVoiceConsistency(userId, content.title, { isTitle: true });

  const overallScore = seo.overallScore * 0.3 + safety.score * 0.2 + brand.score * 0.25 + voice.score * 0.25;

  const recommendations: string[] = [];
  const risks: string[] = [];

  if (seo.overallScore < 0.6) recommendations.push("Improve SEO — title, description, or tags need optimization");
  if (!brand.aligned) risks.push(...brand.issues);
  if (!voice.consistent) risks.push(...voice.issues);
  if (safety.flags.length > 0) risks.push(...safety.flags);

  seo.suggestions.forEach(s => {
    if (s.impact === "high") recommendations.push(s.reason);
  });

  const viewPrediction = overallScore >= 0.8 ? "above average" :
    overallScore >= 0.6 ? "average" : "below average";

  const engagementPrediction = overallScore >= 0.75 ? "high engagement expected" :
    overallScore >= 0.5 ? "moderate engagement" : "low engagement risk";

  const goNoGo = overallScore >= 0.7 ? "go" :
    overallScore >= 0.45 ? "caution" : "no-go";

  return {
    overallScore,
    viewPrediction,
    engagementPrediction,
    recommendations,
    risks,
    goNoGo,
  };
}

export function getOracleRecommendation(prediction: OraclePrediction): string {
  if (prediction.goNoGo === "go") {
    return `Ready to publish. Predicted performance: ${prediction.viewPrediction}. ${prediction.recommendations.slice(0, 2).join(". ")}`;
  }
  if (prediction.goNoGo === "caution") {
    return `Review recommended before publishing. Key risks: ${prediction.risks.slice(0, 2).join("; ")}. Suggestions: ${prediction.recommendations.slice(0, 2).join("; ")}`;
  }
  return `Not recommended for publishing. Critical risks: ${prediction.risks.slice(0, 3).join("; ")}`;
}
