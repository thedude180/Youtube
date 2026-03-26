import { createLogger } from "../lib/logger";
import { feedPromptToxicityToExceptionDesk, feedPromptDriftToExceptionDesk } from "./exception-desk";

const logger = createLogger("prompt-toxicity-monitor");

const TOXICITY_KEYWORDS: Record<string, string[]> = {
  harmful_content: [
    "kill", "murder", "suicide", "self-harm", "violence", "weapon", "bomb", "attack",
    "abuse", "assault", "torture", "exploit children",
  ],
  bias: [
    "all women are", "all men are", "inferior race", "superior race",
    "those people", "they always", "typical of their kind",
  ],
  hallucination_indicators: [
    "as an ai", "i cannot", "i don't have personal", "i was trained",
    "my training data", "as a language model", "i apologize, but",
  ],
  manipulation: [
    "click here now", "limited time only", "you must act now",
    "guaranteed results", "secret method", "they don't want you to know",
  ],
};

const TOXICITY_THRESHOLD = 0.6;
const DRIFT_THRESHOLD = 0.5;

interface ToxicityResult {
  toxic: boolean;
  score: number;
  categories: string[];
  flaggedPhrases: string[];
}

interface DriftResult {
  drifted: boolean;
  score: number;
  expectedPattern: string;
  actualPattern: string;
}

export function screenForToxicity(text: string): ToxicityResult {
  const lower = text.toLowerCase();
  const categories: string[] = [];
  const flaggedPhrases: string[] = [];
  let totalMatches = 0;

  for (const [category, keywords] of Object.entries(TOXICITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        if (!categories.includes(category)) categories.push(category);
        flaggedPhrases.push(keyword);
        totalMatches++;
      }
    }
  }

  const wordCount = text.split(/\s+/).length;
  const density = wordCount > 0 ? totalMatches / Math.max(wordCount, 1) : 0;
  const score = Math.min(1, density * 50 + (categories.length * 0.15));

  return {
    toxic: score >= TOXICITY_THRESHOLD,
    score: Math.round(score * 100) / 100,
    categories,
    flaggedPhrases,
  };
}

export function detectPromptDrift(
  output: string,
  expectedFormat: string,
  expectedTopics: string[] = [],
): DriftResult {
  let driftScore = 0;
  const actualPatterns: string[] = [];
  const expectedPatterns: string[] = [];

  if (expectedFormat === "json") {
    expectedPatterns.push("json_format");
    try {
      JSON.parse(output);
      actualPatterns.push("json_format");
    } catch {
      driftScore += 0.4;
      actualPatterns.push("non_json_format");
    }
  }

  if (expectedFormat === "markdown") {
    expectedPatterns.push("markdown_format");
    if (output.includes("#") || output.includes("- ") || output.includes("**")) {
      actualPatterns.push("markdown_format");
    } else {
      driftScore += 0.3;
      actualPatterns.push("plain_text");
    }
  }

  if (expectedTopics.length > 0) {
    const lower = output.toLowerCase();
    let topicHits = 0;
    for (const topic of expectedTopics) {
      if (lower.includes(topic.toLowerCase())) {
        topicHits++;
      }
    }
    const topicCoverage = topicHits / expectedTopics.length;
    if (topicCoverage < 0.3) {
      driftScore += 0.3;
      actualPatterns.push("off_topic");
      expectedPatterns.push("on_topic");
    }
  }

  if (output.length < 10) {
    driftScore += 0.2;
    actualPatterns.push("too_short");
  } else if (output.length > 50000) {
    driftScore += 0.1;
    actualPatterns.push("excessively_long");
  }

  return {
    drifted: driftScore >= DRIFT_THRESHOLD,
    score: Math.min(1, Math.round(driftScore * 100) / 100),
    expectedPattern: expectedPatterns.join(", ") || expectedFormat,
    actualPattern: actualPatterns.join(", ") || "normal",
  };
}

export async function screenAiOutput(
  output: string,
  model: string,
  options: {
    expectedFormat?: string;
    expectedTopics?: string[];
    promptContext?: string;
    autoFeedExceptionDesk?: boolean;
  } = {},
): Promise<{
  toxicity: ToxicityResult;
  drift: DriftResult | null;
  exceptionsCreated: number;
}> {
  const autoFeed = options.autoFeedExceptionDesk !== false;
  let exceptionsCreated = 0;

  const toxicity = screenForToxicity(output);

  let drift: DriftResult | null = null;
  if (options.expectedFormat) {
    drift = detectPromptDrift(output, options.expectedFormat, options.expectedTopics);
  }

  if (toxicity.toxic && autoFeed) {
    try {
      await feedPromptToxicityToExceptionDesk({
        outputText: output.slice(0, 500),
        toxicityScore: toxicity.score,
        categories: toxicity.categories,
        model,
        promptContext: options.promptContext,
      });
      exceptionsCreated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to feed toxicity to exception desk", { error: msg.slice(0, 200) });
    }
  }

  if (drift?.drifted && autoFeed) {
    try {
      await feedPromptDriftToExceptionDesk({
        model,
        driftScore: drift.score,
        expectedPattern: drift.expectedPattern,
        actualPattern: drift.actualPattern,
        context: options.promptContext,
      });
      exceptionsCreated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to feed drift to exception desk", { error: msg.slice(0, 200) });
    }
  }

  return { toxicity, drift, exceptionsCreated };
}

export function getMonitorConfig() {
  return {
    toxicityThreshold: TOXICITY_THRESHOLD,
    driftThreshold: DRIFT_THRESHOLD,
    categories: Object.keys(TOXICITY_KEYWORDS),
    keywordsPerCategory: Object.fromEntries(
      Object.entries(TOXICITY_KEYWORDS).map(([k, v]) => [k, v.length])
    ),
  };
}
