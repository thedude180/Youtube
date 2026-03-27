import { emitDomainEvent } from "../kernel/index";

export interface HumanValueSignal {
  category: "authenticity" | "expertise" | "community" | "creativity" | "trust" | "presence";
  source: string;
  score: number;
  description: string;
  capturedAt: Date;
}

export interface HumanValueMoatReport {
  overallScore: number;
  categoryScores: Record<string, number>;
  signals: HumanValueSignal[];
  strengthAreas: string[];
  vulnerabilityAreas: string[];
  recommendations: string[];
  assessedAt: Date;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  authenticity: "Genuine human perspective and voice that AI cannot replicate",
  expertise: "Deep domain knowledge from lived gaming experience",
  community: "Real relationships with audience members",
  creativity: "Unique creative decisions and artistic vision",
  trust: "Earned audience trust through consistent behavior",
  presence: "Real-time human judgment during live interactions",
};

export function captureHumanValueSignal(
  source: string,
  category: HumanValueSignal["category"],
  score: number,
  description?: string
): HumanValueSignal {
  return {
    category,
    source,
    score: Math.max(0, Math.min(1, score)),
    description: description || CATEGORY_DESCRIPTIONS[category] || "",
    capturedAt: new Date(),
  };
}

export function assessHumanValueMoat(signals: HumanValueSignal[]): HumanValueMoatReport {
  const categoryScores: Record<string, number[]> = {};

  for (const signal of signals) {
    if (!categoryScores[signal.category]) categoryScores[signal.category] = [];
    categoryScores[signal.category].push(signal.score);
  }

  const avgScores: Record<string, number> = {};
  for (const [cat, scores] of Object.entries(categoryScores)) {
    avgScores[cat] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const allCategories = ["authenticity", "expertise", "community", "creativity", "trust", "presence"];
  for (const cat of allCategories) {
    if (!(cat in avgScores)) avgScores[cat] = 0;
  }

  const overallScore = Object.values(avgScores).length > 0
    ? Object.values(avgScores).reduce((a, b) => a + b, 0) / Object.values(avgScores).length
    : 0;

  const strengthAreas = Object.entries(avgScores)
    .filter(([, score]) => score >= 0.7)
    .map(([cat]) => cat);

  const vulnerabilityAreas = Object.entries(avgScores)
    .filter(([, score]) => score < 0.4)
    .map(([cat]) => cat);

  const recommendations: string[] = [];
  if (vulnerabilityAreas.includes("community")) {
    recommendations.push("Invest in direct community engagement — respond to comments, host Q&As, create membership perks");
  }
  if (vulnerabilityAreas.includes("authenticity")) {
    recommendations.push("Increase behind-the-scenes content and personal takes on gaming experiences");
  }
  if (vulnerabilityAreas.includes("expertise")) {
    recommendations.push("Demonstrate deeper game knowledge — tips, strategies, hidden details that AI wouldn't know");
  }
  if (vulnerabilityAreas.includes("presence")) {
    recommendations.push("Stream more often to build real-time audience connection");
  }
  if (overallScore < 0.4) {
    recommendations.push("Human value moat is weak — urgently build creator identity that transcends content");
  }

  return {
    overallScore,
    categoryScores: avgScores,
    signals,
    strengthAreas,
    vulnerabilityAreas,
    recommendations,
    assessedAt: new Date(),
  };
}

export async function assessAndEmit(
  userId: string,
  signals: HumanValueSignal[]
): Promise<HumanValueMoatReport> {
  const report = assessHumanValueMoat(signals);

  if (report.overallScore < 0.4) {
    try {
      await emitDomainEvent(userId, "human_value_moat.weak", {
        overallScore: report.overallScore,
        vulnerabilityAreas: report.vulnerabilityAreas,
      }, "human-value-moat", "channel");
    } catch (_) {}
  }

  return report;
}

export function captureLiveHumanValueSignals(
  streamDurationMin: number,
  chatInteractions: number,
  uniqueDecisions: number
): HumanValueSignal[] {
  const signals: HumanValueSignal[] = [];

  signals.push(captureHumanValueSignal("live-stream", "presence",
    Math.min(1, streamDurationMin / 120),
    `${streamDurationMin} minutes of live presence`
  ));

  signals.push(captureHumanValueSignal("live-chat", "community",
    Math.min(1, chatInteractions / 50),
    `${chatInteractions} real-time chat interactions`
  ));

  signals.push(captureHumanValueSignal("live-decisions", "creativity",
    Math.min(1, uniqueDecisions / 20),
    `${uniqueDecisions} unique creative decisions during stream`
  ));

  return signals;
}
