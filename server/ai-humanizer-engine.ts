import { createLogger } from "./lib/logger";

const logger = createLogger("ai-humanizer");

const AI_TELLTALE_PATTERNS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bIt's worth noting that\b/gi, replacements: ["tbh", "honestly", "look,", "real talk —"] },
  { pattern: /\bFurthermore,?\b/gi, replacements: ["also", "plus", "and", "oh and"] },
  { pattern: /\bIn conclusion,?\b/gi, replacements: ["so yeah", "anyway", "bottom line", "tldr"] },
  { pattern: /\bHowever,?\b/gi, replacements: ["but", "tho", "that said", "then again"] },
  { pattern: /\bAdditionally,?\b/gi, replacements: ["also", "plus", "on top of that", "and"] },
  { pattern: /\bMoreover,?\b/gi, replacements: ["also", "and honestly", "plus", "on top of that"] },
  { pattern: /\bNevertheless,?\b/gi, replacements: ["still", "but still", "even so", "regardless"] },
  { pattern: /\bConsequently,?\b/gi, replacements: ["so", "because of that", "which means", "that's why"] },
  { pattern: /\bTherefore,?\b/gi, replacements: ["so", "which means", "that's why", "basically"] },
  { pattern: /\bIn order to\b/gi, replacements: ["to", "so you can", "if you wanna"] },
  { pattern: /\bUtilize\b/gi, replacements: ["use", "try", "go with"] },
  { pattern: /\bLeverage\b/gi, replacements: ["use", "take advantage of", "lean on"] },
  { pattern: /\bOptimize\b/gi, replacements: ["improve", "make better", "tweak", "dial in"] },
  { pattern: /\bSeamlessly\b/gi, replacements: ["smoothly", "easily", "without issues"] },
  { pattern: /\bRobust\b/gi, replacements: ["solid", "strong", "reliable"] },
  { pattern: /\bComprehensive\b/gi, replacements: ["full", "complete", "thorough"] },
  { pattern: /\bFacilitate\b/gi, replacements: ["help", "make easier", "support"] },
  { pattern: /\bImplement\b/gi, replacements: ["set up", "build", "put in place", "add"] },
  { pattern: /\bEnhance\b/gi, replacements: ["improve", "boost", "make better", "level up"] },
  { pattern: /\bDelve\b/gi, replacements: ["dig into", "look at", "get into", "check out"] },
  { pattern: /\bEmbark\b/gi, replacements: ["start", "kick off", "begin", "jump into"] },
  { pattern: /\bPivotal\b/gi, replacements: ["key", "big", "major", "important"] },
  { pattern: /\bParadigm\b/gi, replacements: ["approach", "way of thinking", "model"] },
  { pattern: /\bSynergy\b/gi, replacements: ["teamwork", "combo", "mix"] },
  { pattern: /\bStreamline\b/gi, replacements: ["simplify", "speed up", "clean up"] },
  { pattern: /\bCutting-edge\b/gi, replacements: ["latest", "newest", "modern", "fresh"] },
  { pattern: /\bGame-changer\b/gi, replacements: ["huge deal", "big move", "total shift"] },
  { pattern: /\bGroundbreaking\b/gi, replacements: ["wild", "crazy good", "next level", "insane"] },
  { pattern: /\bRevolutionize\b/gi, replacements: ["change", "shake up", "transform", "flip"] },
  { pattern: /\bIt is important to note\b/gi, replacements: ["heads up", "just so you know", "keep in mind", "quick thing"] },
  { pattern: /\bWithout a doubt\b/gi, replacements: ["for sure", "100%", "no question", "easily"] },
  { pattern: /\bPlays a crucial role\b/gi, replacements: ["matters a lot", "is super important", "is key"] },
  { pattern: /\bA testament to\b/gi, replacements: ["proof of", "shows how", "says a lot about"] },
  { pattern: /\bjourney\b/gi, replacements: ["process", "path", "grind", "road"] },
  { pattern: /\blandscape\b/gi, replacements: ["space", "scene", "world", "area"] },
  { pattern: /\brealm\b/gi, replacements: ["world", "space", "area"] },
  { pattern: /\bNavigate\b/gi, replacements: ["figure out", "work through", "deal with"] },
  { pattern: /\bElevate\b/gi, replacements: ["level up", "boost", "take up a notch"] },
  { pattern: /\bUnlock\b/gi, replacements: ["get", "access", "open up"] },
  { pattern: /\bEmpower\b/gi, replacements: ["help", "let", "give power to"] },
  { pattern: /\bFoster\b/gi, replacements: ["build", "grow", "encourage"] },
  { pattern: /\bCurate\b/gi, replacements: ["pick", "choose", "put together"] },
  { pattern: /\bTailored\b/gi, replacements: ["custom", "made for you", "specific"] },
  { pattern: /\bInnovative\b/gi, replacements: ["new", "creative", "fresh"] },
  { pattern: /\bHolistic\b/gi, replacements: ["full", "complete", "all-around"] },
  { pattern: /\bIntricate\b/gi, replacements: ["complex", "detailed", "tricky"] },
  { pattern: /\bMeander\b/gi, replacements: ["wander", "drift", "roam"] },
  { pattern: /\bTestament\b/gi, replacements: ["proof", "sign", "example"] },
  { pattern: /\bTapestry\b/gi, replacements: ["mix", "blend", "collection"] },
];

const SENTENCE_STARTERS_HUMAN = [
  "ngl", "honestly", "look", "ok so", "real talk", "listen",
  "yo", "bruh", "lowkey", "fr", "no cap", "idk but",
  "wait", "ok hear me out", "so like", "not gonna lie",
  "i mean", "legit", "deadass", "bro", "dude",
];

const FILLER_INSERTIONS = [
  "like", "literally", "basically", "actually", "honestly",
  "kinda", "sorta", "pretty much", "low-key", "fr",
];

const CONTRACTION_MAP: Record<string, string> = {
  "I am": "I'm", "I have": "I've", "I will": "I'll", "I would": "I'd",
  "you are": "you're", "you have": "you've", "you will": "you'll",
  "we are": "we're", "we have": "we've", "we will": "we'll",
  "they are": "they're", "they have": "they've", "they will": "they'll",
  "it is": "it's", "it has": "it's", "that is": "that's",
  "there is": "there's", "what is": "what's", "who is": "who's",
  "do not": "don't", "does not": "doesn't", "did not": "didn't",
  "is not": "isn't", "are not": "aren't", "was not": "wasn't",
  "were not": "weren't", "has not": "hasn't", "have not": "haven't",
  "had not": "hadn't", "will not": "won't", "would not": "wouldn't",
  "could not": "couldn't", "should not": "shouldn't", "cannot": "can't",
  "can not": "can't", "let us": "let's", "going to": "gonna",
  "want to": "wanna", "got to": "gotta", "kind of": "kinda",
  "sort of": "sorta",
};

interface HumanizerOptions {
  aggressionLevel: "subtle" | "moderate" | "aggressive";
  platform?: string;
  preserveLinks?: boolean;
  preserveHashtags?: boolean;
  contentType?: "social-post" | "title" | "description" | "comment" | "email" | "long-form";
}

interface HumanizerResult {
  original: string;
  humanized: string;
  stealthScore: number;
  modificationsApplied: string[];
  perplexityEstimate: number;
  burstinessScore: number;
}

function gaussianRandom(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stddev + mean;
}

function replaceAIPatterns(text: string): { text: string; count: number } {
  let result = text;
  let count = 0;
  for (const { pattern, replacements } of AI_TELLTALE_PATTERNS) {
    if (pattern.test(result)) {
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(pattern, replacement);
      count++;
    }
  }
  return { text: result, count };
}

function applyContractions(text: string): string {
  let result = text;
  for (const [formal, informal] of Object.entries(CONTRACTION_MAP)) {
    const regex = new RegExp(`\\b${formal}\\b`, "gi");
    result = result.replace(regex, informal);
  }
  return result;
}

function varySentenceLength(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return text;

  const result: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const words = s.split(/\s+/);

    if (words.length > 15 && Math.random() < 0.3) {
      const midpoint = Math.floor(words.length * (0.4 + Math.random() * 0.2));
      const connectors = [" — ", ". ", "... ", " but ", " and ", " — basically "];
      const connector = connectors[Math.floor(Math.random() * connectors.length)];
      result.push(words.slice(0, midpoint).join(" ") + connector + words.slice(midpoint).join(" "));
    } else if (words.length > 3 && words.length < 8 && Math.random() < 0.15 && i < sentences.length - 1) {
      const next = sentences[i + 1];
      if (next) {
        result.push(s.replace(/[.!?]$/, "") + " — " + next.charAt(0).toLowerCase() + next.slice(1));
        i++;
      } else {
        result.push(s);
      }
    } else {
      result.push(s);
    }
  }
  return result.join(" ");
}

function insertFillers(text: string, aggressionLevel: string): string {
  if (aggressionLevel === "subtle") return text;
  const words = text.split(/\s+/);
  if (words.length < 8) return text;

  const insertionChance = aggressionLevel === "aggressive" ? 0.08 : 0.04;
  const result: string[] = [];

  for (let i = 0; i < words.length; i++) {
    result.push(words[i]);
    if (i > 2 && i < words.length - 2 && Math.random() < insertionChance) {
      const filler = FILLER_INSERTIONS[Math.floor(Math.random() * FILLER_INSERTIONS.length)];
      result.push(filler);
    }
  }
  return result.join(" ");
}

function addTypos(text: string, aggressionLevel: string): string {
  if (aggressionLevel === "subtle") return text;
  const words = text.split(/\s+/);
  const typoChance = aggressionLevel === "aggressive" ? 0.02 : 0.008;
  const result: string[] = [];

  for (const word of words) {
    if (word.length > 4 && Math.random() < typoChance && !/^[@#]/.test(word) && !/^https?:/.test(word)) {
      const strategies = [
        () => { const i = 1 + Math.floor(Math.random() * (word.length - 2)); return word.slice(0, i) + word.slice(i + 1); },
        () => { const i = 1 + Math.floor(Math.random() * (word.length - 2)); return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); },
        () => { const i = 1 + Math.floor(Math.random() * (word.length - 2)); return word.slice(0, i) + word[i] + word[i] + word.slice(i + 1); },
      ];
      const strategy = strategies[Math.floor(Math.random() * strategies.length)];
      result.push(strategy());
    } else {
      result.push(word);
    }
  }
  return result.join(" ");
}

function randomizeCapitalization(text: string): string {
  if (Math.random() < 0.3) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map((s, i) => {
    if (i === 0) return s;
    if (Math.random() < 0.15) {
      return s.charAt(0).toLowerCase() + s.slice(1);
    }
    return s;
  }).join(" ");
}

function addHumanPunctuation(text: string, aggressionLevel: string): string {
  let result = text;
  if (aggressionLevel !== "subtle") {
    if (Math.random() < 0.15) result = result.replace(/\.$/, "");
    if (Math.random() < 0.1) result = result.replace(/!$/, "!!");
    if (Math.random() < 0.08) result = result.replace(/\?$/, "??");
    if (Math.random() < 0.12) {
      const idx = result.lastIndexOf(". ");
      if (idx > 0) {
        result = result.slice(0, idx) + "... " + result.slice(idx + 2);
      }
    }
  }
  return result;
}

function shuffleAdjacentSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length < 4) return text;

  if (Math.random() < 0.2) {
    const idx = 1 + Math.floor(Math.random() * (sentences.length - 3));
    [sentences[idx], sentences[idx + 1]] = [sentences[idx + 1], sentences[idx]];
  }
  return sentences.join(" ");
}

function addStarterPhrase(text: string, platform: string, aggressionLevel: string): string {
  if (aggressionLevel === "subtle") return text;
  if (Math.random() > 0.2) return text;

  const casual = ["social-post", "comment"].includes(platform);
  if (!casual) return text;

  const starter = SENTENCE_STARTERS_HUMAN[Math.floor(Math.random() * SENTENCE_STARTERS_HUMAN.length)];
  return starter + " " + text.charAt(0).toLowerCase() + text.slice(1);
}

function calculatePerplexity(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  const bigrams = new Map<string, number>();
  const unigramCount = new Map<string, number>();

  for (const w of words) unigramCount.set(w, (unigramCount.get(w) || 0) + 1);

  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }

  const uniqueRatio = new Set(words).size / words.length;
  const bigramUniqueness = bigrams.size / Math.max(words.length - 1, 1);
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;

  let score = uniqueRatio * 0.4 + bigramUniqueness * 0.35 + Math.min(avgWordLen / 8, 1) * 0.25;
  return Math.min(1, Math.max(0, score));
}

function calculateBurstiness(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length < 2) return 0.5;

  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / Math.max(mean, 1);

  return Math.min(1, cv);
}

function calculateStealthScore(text: string): number {
  let score = 1.0;
  const lower = text.toLowerCase();

  for (const { pattern } of AI_TELLTALE_PATTERNS) {
    if (pattern.test(lower)) score -= 0.05;
  }

  const perplexity = calculatePerplexity(text);
  if (perplexity < 0.3) score -= 0.15;
  if (perplexity > 0.7) score += 0.05;

  const burstiness = calculateBurstiness(text);
  if (burstiness < 0.2) score -= 0.15;
  if (burstiness > 0.4) score += 0.05;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 2) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const allSimilar = lengths.every(l => Math.abs(l - lengths[0]) <= 2);
    if (allSimilar) score -= 0.1;
  }

  const hasContractions = /\b(I'm|don't|can't|won't|it's|that's|we're|they're|you're)\b/.test(text);
  if (hasContractions) score += 0.05;

  return Math.min(1, Math.max(0, score));
}

export function humanizeText(text: string, options: HumanizerOptions): HumanizerResult {
  const modifications: string[] = [];
  let result = text;

  const { text: patternFixed, count: patternCount } = replaceAIPatterns(result);
  result = patternFixed;
  if (patternCount > 0) modifications.push(`replaced ${patternCount} AI patterns`);

  result = applyContractions(result);
  modifications.push("applied contractions");

  if (options.contentType !== "title") {
    result = varySentenceLength(result);
    modifications.push("varied sentence lengths");
  }

  const contentType = options.contentType || "social-post";
  if (["social-post", "comment"].includes(contentType)) {
    result = insertFillers(result, options.aggressionLevel);
    if (options.aggressionLevel !== "subtle") modifications.push("inserted natural fillers");

    result = addStarterPhrase(result, contentType, options.aggressionLevel);
  }

  result = addTypos(result, options.aggressionLevel);
  if (options.aggressionLevel !== "subtle") modifications.push("added natural typos");

  result = randomizeCapitalization(result);
  modifications.push("randomized capitalization");

  result = addHumanPunctuation(result, options.aggressionLevel);
  modifications.push("humanized punctuation");

  if (options.contentType !== "title" && options.contentType !== "email") {
    result = shuffleAdjacentSentences(result);
  }

  result = result.replace(/\s{2,}/g, " ").trim();

  const stealthScore = calculateStealthScore(result);
  const perplexityEstimate = calculatePerplexity(result);
  const burstinessScore = calculateBurstiness(result);

  if (stealthScore < 0.6 && options.aggressionLevel !== "aggressive") {
    const boosted = humanizeText(text, { ...options, aggressionLevel: "aggressive" });
    if (boosted.stealthScore > stealthScore) {
      return boosted;
    }
  }

  return {
    original: text,
    humanized: result,
    stealthScore,
    modificationsApplied: modifications,
    perplexityEstimate,
    burstinessScore,
  };
}

export function getStealthAnalysis(text: string): {
  stealthScore: number;
  perplexity: number;
  burstiness: number;
  detectedPatterns: string[];
  risk: "low" | "medium" | "high";
  suggestions: string[];
} {
  const perplexity = calculatePerplexity(text);
  const burstiness = calculateBurstiness(text);
  const stealthScore = calculateStealthScore(text);

  const detectedPatterns: string[] = [];
  for (const { pattern } of AI_TELLTALE_PATTERNS) {
    const match = text.match(pattern);
    if (match) detectedPatterns.push(match[0]);
  }

  const suggestions: string[] = [];
  if (perplexity < 0.3) suggestions.push("Text is too predictable — add varied vocabulary and unexpected word choices");
  if (burstiness < 0.2) suggestions.push("Sentence lengths are too uniform — mix short punchy lines with longer ones");
  if (detectedPatterns.length > 0) suggestions.push(`Remove AI-typical phrases: ${detectedPatterns.slice(0, 3).join(", ")}`);
  if (!/[!?]{2,}|\.{3}/.test(text)) suggestions.push("Add expressive punctuation (!! or ... or ??) for human feel");
  if (!/\b(I'm|don't|can't|won't)\b/.test(text)) suggestions.push("Use contractions — humans rarely write out full forms");

  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 2) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const allSimilar = lengths.every(l => Math.abs(l - lengths[0]) <= 3);
    if (allSimilar) suggestions.push("Sentence structure is too regular — break the pattern");
  }

  let risk: "low" | "medium" | "high" = "low";
  if (stealthScore < 0.5) risk = "high";
  else if (stealthScore < 0.75) risk = "medium";

  return { stealthScore, perplexity, burstiness, detectedPatterns, risk, suggestions };
}

export function humanizeBatch(texts: string[], options: HumanizerOptions): HumanizerResult[] {
  return texts.map(t => humanizeText(t, options));
}

logger.info("AI Humanizer Engine initialized");
