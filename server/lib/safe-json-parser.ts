/**
 * server/lib/safe-json-parser.ts
 *
 * Fix #5 — content-grinder JSON Truncated at Position 15,494
 *
 * The AI returns JSON that gets cut off mid-string when max_tokens is hit.
 * Standard JSON.parse throws on truncated input. This utility attempts
 * recovery before giving up — important for the content-grinder's moment
 * extraction which processes large video catalogs.
 */
import { createLogger } from "./logger";

const log = createLogger("safe-json-parser");

/**
 * Attempts to parse potentially truncated JSON from an AI response.
 * Tries multiple recovery strategies before returning null.
 */
export function safeParseAiJson<T = unknown>(
  raw:    string,
  label?: string,
): T | null {
  if (!raw || raw.trim().length === 0) return null;

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();

  // Attempt 1 — clean parse
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* fall through */ }

  // Attempt 2 — truncated object: close with }
  try {
    const recovered = cleaned.replace(/,?\s*$/, "") + "}";
    return JSON.parse(recovered) as T;
  } catch { /* fall through */ }

  // Attempt 3 — truncated array: close with ]
  try {
    const recovered = cleaned.replace(/,?\s*$/, "") + "]";
    return JSON.parse(recovered) as T;
  } catch { /* fall through */ }

  // Attempt 4 — truncated nested: close both
  try {
    const recovered = cleaned.replace(/,?\s*$/, "") + '"}';
    return JSON.parse(recovered) as T;
  } catch { /* fall through */ }

  // Attempt 5 — find last complete top-level key and truncate there
  try {
    const lastComplete = cleaned.lastIndexOf('",');
    if (lastComplete > 10) {
      const truncated = cleaned.slice(0, lastComplete + 1) + "}";
      return JSON.parse(truncated) as T;
    }
  } catch { /* fall through */ }

  log.warn(
    `[SafeJsonParser]${label ? ` [${label}]` : ""} All recovery attempts failed. ` +
    `Raw length: ${raw.length}. First 100 chars: ${raw.slice(0, 100)}`
  );
  return null;
}

/**
 * Recommended max_tokens values for calls that return JSON.
 * The content-grinder moment extraction was hitting the 4096 limit causing truncation.
 */
export const AI_JSON_TOKEN_LIMITS = {
  momentExtraction:   6000, // was hitting 4096 limit — this is why JSON was truncated
  titleGeneration:     200,
  descriptionGen:      600,
  tagGeneration:       250,
  thumbnailConcept:    400,
  chapterGeneration:   300,
  strategyScoring:     150,
  clipScoring:         300,
} as const;
