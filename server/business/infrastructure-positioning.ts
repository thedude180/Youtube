export interface InfrastructurePosition {
  component: string;
  category: "hosting" | "tooling" | "platform" | "payment" | "ai" | "storage" | "cdn";
  currentProvider: string;
  cost: number;
  lock_in_risk: number;
  alternatives: string[];
  migrationComplexity: "trivial" | "moderate" | "complex" | "prohibitive";
  recommendation: string;
}

export interface InfrastructureReport {
  positions: InfrastructurePosition[];
  totalMonthlyCost: number;
  averageLockInRisk: number;
  vendorConcentration: number;
  recommendations: string[];
  assessedAt: Date;
}

export function analyzeInfrastructurePositioning(
  overrides?: Partial<Record<string, { provider: string; cost: number }>>
): InfrastructureReport {
  const positions: InfrastructurePosition[] = [
    {
      component: "Application Hosting",
      category: "hosting",
      currentProvider: overrides?.hosting?.provider || "Replit",
      cost: overrides?.hosting?.cost || 25,
      lock_in_risk: 0.3,
      alternatives: ["Vercel", "Railway", "Fly.io", "AWS"],
      migrationComplexity: "moderate",
      recommendation: "Good value; maintain portability through standard Node.js patterns",
    },
    {
      component: "Database",
      category: "hosting",
      currentProvider: overrides?.database?.provider || "PostgreSQL (Replit)",
      cost: overrides?.database?.cost || 0,
      lock_in_risk: 0.2,
      alternatives: ["Supabase", "Neon", "PlanetScale", "AWS RDS"],
      migrationComplexity: "moderate",
      recommendation: "Standard PostgreSQL — highly portable; ensure regular backups",
    },
    {
      component: "AI Services",
      category: "ai",
      currentProvider: "OpenAI + Anthropic",
      cost: overrides?.ai?.cost || 20,
      lock_in_risk: 0.4,
      alternatives: ["Google Gemini", "Mistral", "Local LLMs", "Groq"],
      migrationComplexity: "moderate",
      recommendation: "Multi-provider strategy reduces lock-in; model fallback chain provides resilience",
    },
    {
      component: "Video Platform",
      category: "platform",
      currentProvider: "YouTube",
      cost: 0,
      lock_in_risk: 0.9,
      alternatives: ["Twitch", "Kick", "Rumble", "Self-hosted"],
      migrationComplexity: "prohibitive",
      recommendation: "Highest lock-in risk — build platform-independent audience touchpoints",
    },
    {
      component: "Payment Processing",
      category: "payment",
      currentProvider: overrides?.payment?.provider || "Stripe",
      cost: overrides?.payment?.cost || 0,
      lock_in_risk: 0.3,
      alternatives: ["Paddle", "Lemon Squeezy", "PayPal"],
      migrationComplexity: "moderate",
      recommendation: "Standard integration; maintain payment abstraction layer",
    },
    {
      component: "Content Storage",
      category: "storage",
      currentProvider: overrides?.storage?.provider || "Local + YouTube",
      cost: overrides?.storage?.cost || 10,
      lock_in_risk: 0.5,
      alternatives: ["Backblaze B2", "AWS S3", "Cloudflare R2"],
      migrationComplexity: "trivial",
      recommendation: "Keep local copies of all content assets — storage is cheap insurance",
    },
  ];

  const totalMonthlyCost = positions.reduce((sum, p) => sum + p.cost, 0);
  const averageLockInRisk = positions.reduce((sum, p) => sum + p.lock_in_risk, 0) / positions.length;

  const providers = new Set(positions.map((p) => p.currentProvider));
  const vendorConcentration = 1 - (providers.size / positions.length);

  const recommendations: string[] = [];
  const highRisk = positions.filter((p) => p.lock_in_risk > 0.7);
  if (highRisk.length > 0) {
    recommendations.push(`High lock-in risk: ${highRisk.map((p) => p.component).join(", ")} — build migration paths`);
  }
  if (vendorConcentration > 0.5) {
    recommendations.push("High vendor concentration — diversify providers to reduce single-vendor risk");
  }
  if (totalMonthlyCost > 100) {
    recommendations.push("Monthly infrastructure costs above $100 — review for optimization opportunities");
  }

  return { positions, totalMonthlyCost, averageLockInRisk, vendorConcentration, recommendations, assessedAt: new Date() };
}
