export interface SkillArea {
  name: string;
  category: "technical" | "creative" | "business" | "community" | "platform";
  currentLevel: "beginner" | "intermediate" | "advanced" | "expert";
  importance: "critical" | "high" | "medium" | "low";
  growthOpportunity: number;
  resources: string[];
}

export interface SkillDevelopmentPlan {
  skillAreas: SkillArea[];
  prioritySkills: SkillArea[];
  overallReadiness: number;
  recommendations: string[];
  assessedAt: Date;
}

export function assessSkillDevelopment(channelType: string = "ps5-no-commentary"): SkillDevelopmentPlan {
  const skillAreas: SkillArea[] = [
    { name: "Video Editing", category: "technical", currentLevel: "intermediate", importance: "critical", growthOpportunity: 0.6, resources: ["DaVinci Resolve tutorials", "Premiere Pro courses"] },
    { name: "Thumbnail Design", category: "creative", currentLevel: "intermediate", importance: "high", growthOpportunity: 0.7, resources: ["Photoshop fundamentals", "YouTube thumbnail guides"] },
    { name: "SEO Optimization", category: "platform", currentLevel: "intermediate", importance: "high", growthOpportunity: 0.5, resources: ["TubeBuddy", "vidIQ analytics"] },
    { name: "Audio Engineering", category: "technical", currentLevel: "beginner", importance: "medium", growthOpportunity: 0.8, resources: ["Game audio capture guides", "Audio mixing basics"] },
    { name: "Community Management", category: "community", currentLevel: "beginner", importance: "high", growthOpportunity: 0.9, resources: ["Discord server management", "YouTube community posts"] },
    { name: "Revenue Strategy", category: "business", currentLevel: "beginner", importance: "critical", growthOpportunity: 0.9, resources: ["Creator economy courses", "Sponsorship negotiation"] },
    { name: "Analytics Interpretation", category: "platform", currentLevel: "intermediate", importance: "high", growthOpportunity: 0.5, resources: ["YouTube Analytics deep dives", "Creator Academy"] },
    { name: "Brand Building", category: "business", currentLevel: "intermediate", importance: "high", growthOpportunity: 0.6, resources: ["Personal branding courses", "Design consistency guides"] },
    { name: "Streaming Setup", category: "technical", currentLevel: "intermediate", importance: "medium", growthOpportunity: 0.4, resources: ["OBS Studio advanced", "PS5 streaming optimization"] },
    { name: "Content Strategy", category: "creative", currentLevel: "intermediate", importance: "critical", growthOpportunity: 0.7, resources: ["Content calendar planning", "Niche authority building"] },
  ];

  const prioritySkills = skillAreas
    .filter((s) => s.importance === "critical" || (s.importance === "high" && s.growthOpportunity > 0.6))
    .sort((a, b) => b.growthOpportunity - a.growthOpportunity);

  const levelScores: Record<string, number> = { beginner: 0.25, intermediate: 0.5, advanced: 0.75, expert: 1.0 };
  const overallReadiness = skillAreas.reduce((sum, s) => sum + (levelScores[s.currentLevel] || 0.5), 0) / skillAreas.length;

  const recommendations: string[] = [];
  const beginnerCritical = skillAreas.filter((s) => s.currentLevel === "beginner" && s.importance === "critical");
  for (const bc of beginnerCritical) {
    recommendations.push(`Priority: Level up ${bc.name} — it's critical but you're at beginner level`);
  }
  if (overallReadiness < 0.4) {
    recommendations.push("Overall skill readiness is low — consider dedicated learning time each week");
  }

  return { skillAreas, prioritySkills, overallReadiness, recommendations, assessedAt: new Date() };
}
