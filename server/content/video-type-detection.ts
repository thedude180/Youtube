export interface VideoTypeResult {
  detectedType: string;
  confidence: number;
  signals: string[];
  alternativeTypes: { type: string; confidence: number }[];
}

const VIDEO_TYPE_PATTERNS: { type: string; titlePatterns: RegExp[]; descPatterns: RegExp[]; tagPatterns: string[]; durationHint?: { min?: number; max?: number } }[] = [
  {
    type: "walkthrough",
    titlePatterns: [/walkthrough/i, /full game/i, /complete.*playthrough/i, /part\s*\d+/i, /chapter\s*\d+/i, /100%.*completion/i],
    descPatterns: [/walkthrough/i, /playthrough/i, /all.*collectibles/i, /no commentary.*gameplay/i],
    tagPatterns: ["walkthrough", "playthrough", "full game", "100%"],
    durationHint: { min: 900 },
  },
  {
    type: "review",
    titlePatterns: [/review/i, /worth.*buying/i, /honest.*review/i, /first.*impressions/i, /before.*you.*buy/i],
    descPatterns: [/review/i, /worth.*it/i, /pros.*cons/i, /verdict/i],
    tagPatterns: ["review", "first impressions", "worth it"],
    durationHint: { min: 300, max: 1800 },
  },
  {
    type: "montage",
    titlePatterns: [/montage/i, /compilation/i, /best.*moments/i, /highlights/i, /top\s*\d+/i, /best.*kills/i, /epic.*moments/i],
    descPatterns: [/montage/i, /compilation/i, /highlights/i, /best.*clips/i],
    tagPatterns: ["montage", "compilation", "highlights", "best moments"],
    durationHint: { max: 600 },
  },
  {
    type: "tutorial",
    titlePatterns: [/tutorial/i, /how\s*to/i, /guide/i, /tips.*tricks/i, /beginner/i, /advanced.*guide/i],
    descPatterns: [/tutorial/i, /step.*by.*step/i, /how.*to/i, /guide/i],
    tagPatterns: ["tutorial", "guide", "tips", "how to"],
    durationHint: { min: 180, max: 1200 },
  },
  {
    type: "lets-play",
    titlePatterns: [/let'?s?\s*play/i, /gameplay/i, /playing/i, /blind.*run/i, /first.*time/i],
    descPatterns: [/let'?s?\s*play/i, /gameplay/i, /blind.*playthrough/i],
    tagPatterns: ["lets play", "gameplay", "blind run"],
    durationHint: { min: 600 },
  },
  {
    type: "speedrun",
    titlePatterns: [/speedrun/i, /speed\s*run/i, /world.*record/i, /any%/i, /fastest/i, /wr\b/i],
    descPatterns: [/speedrun/i, /any%/i, /world.*record/i, /pb\b/i],
    tagPatterns: ["speedrun", "world record", "any%", "glitchless"],
    durationHint: { max: 3600 },
  },
  {
    type: "lore",
    titlePatterns: [/lore/i, /story.*explained/i, /timeline/i, /theory/i, /deep.*dive/i, /hidden.*meaning/i],
    descPatterns: [/lore/i, /story/i, /timeline/i, /explained/i, /theory/i],
    tagPatterns: ["lore", "story explained", "theory", "deep dive"],
    durationHint: { min: 300, max: 2400 },
  },
  {
    type: "boss-fight",
    titlePatterns: [/boss.*fight/i, /boss.*battle/i, /how.*to.*beat/i, /defeat/i, /final.*boss/i],
    descPatterns: [/boss/i, /defeat/i, /strategy/i],
    tagPatterns: ["boss fight", "boss battle", "how to beat"],
    durationHint: { max: 1200 },
  },
  {
    type: "comparison",
    titlePatterns: [/vs\.?/i, /versus/i, /compared/i, /comparison/i, /which.*is.*better/i],
    descPatterns: [/comparison/i, /versus/i, /which.*better/i],
    tagPatterns: ["vs", "comparison", "which is better"],
    durationHint: { min: 300, max: 1200 },
  },
  {
    type: "unboxing",
    titlePatterns: [/unboxing/i, /first.*look/i, /hands.*on/i, /opening/i],
    descPatterns: [/unboxing/i, /first.*look/i, /hands.*on/i],
    tagPatterns: ["unboxing", "first look", "hands on"],
    durationHint: { max: 900 },
  },
];

export function detectVideoType(
  title: string,
  description: string,
  tags: string[],
  durationSeconds?: number,
): VideoTypeResult {
  const scores: Record<string, { score: number; signals: string[] }> = {};

  for (const pattern of VIDEO_TYPE_PATTERNS) {
    let score = 0;
    const signals: string[] = [];

    for (const re of pattern.titlePatterns) {
      if (re.test(title)) {
        score += 3;
        signals.push(`Title matches "${re.source}"`);
      }
    }

    for (const re of pattern.descPatterns) {
      if (re.test(description)) {
        score += 1.5;
        signals.push(`Description matches "${re.source}"`);
      }
    }

    const tagsLower = tags.map(t => t.toLowerCase());
    for (const tp of pattern.tagPatterns) {
      if (tagsLower.some(t => t.includes(tp.toLowerCase()))) {
        score += 2;
        signals.push(`Tag matches "${tp}"`);
      }
    }

    if (durationSeconds && pattern.durationHint) {
      const { min, max } = pattern.durationHint;
      if (min && durationSeconds >= min) {
        score += 0.5;
        signals.push(`Duration (${Math.round(durationSeconds / 60)}min) fits ${pattern.type} range`);
      }
      if (max && durationSeconds <= max) {
        score += 0.5;
        signals.push(`Duration within ${pattern.type} upper bound`);
      }
      if (min && durationSeconds < min) {
        score -= 1;
      }
      if (max && durationSeconds > max) {
        score -= 1;
      }
    }

    if (score > 0) {
      scores[pattern.type] = { score, signals };
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);

  if (sorted.length === 0) {
    return {
      detectedType: "general",
      confidence: 0.3,
      signals: ["No strong type signals detected — classified as general gaming content"],
      alternativeTypes: [],
    };
  }

  const maxScore = sorted[0][1].score;
  const confidence = Math.min(0.95, maxScore / 10);

  return {
    detectedType: sorted[0][0],
    confidence,
    signals: sorted[0][1].signals,
    alternativeTypes: sorted.slice(1, 4).map(([type, data]) => ({
      type,
      confidence: Math.min(0.95, data.score / 10),
    })),
  };
}

export function getNicheBenchmarkFamily(videoType: string): string {
  const familyMap: Record<string, string> = {
    "walkthrough": "long-form-gameplay",
    "lets-play": "long-form-gameplay",
    "review": "commentary-analysis",
    "comparison": "commentary-analysis",
    "lore": "commentary-analysis",
    "tutorial": "educational-gaming",
    "montage": "short-form-highlights",
    "boss-fight": "short-form-highlights",
    "speedrun": "skill-showcase",
    "unboxing": "product-showcase",
    "general": "general-gaming",
  };
  return familyMap[videoType] || "general-gaming";
}
