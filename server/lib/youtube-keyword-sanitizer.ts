/**
 * server/lib/youtube-keyword-sanitizer.ts
 *
 * Sanitizes tags/keywords before any YouTube API call (videos.insert,
 * videos.update, thumbnails.set). The invalid_keywords error causes
 * permanent failures in the push-backlog — this stops that.
 *
 * YouTube keyword rules enforced here:
 *   - Each tag: 1–30 characters (YouTube Studio hard limit)
 *   - Total across all tags: ≤500 characters
 *   - No HTML-like characters (< > " ' \)
 *   - No hashtag/mention characters (# @ &)
 *   - No URL-scheme strings (http:// https://)
 *   - No percent-encoding or raw % signs
 *   - No tabs, newlines, carriage returns
 *   - No leading/trailing whitespace
 *   - No empty tags
 *   - Tags that are comma-joined strings get split into individual tags
 */
import { createLogger } from "./logger";

const log = createLogger("youtube-keyword-sanitizer");

const MAX_TAG_CHARS   = 30;   // YouTube Studio per-tag hard limit
const MAX_TOTAL_CHARS = 500;

const PROHIBITED_CHARS = /[<>"'\\#@&%]/g;
const WHITESPACE_NORMALIZE = /[\t\r\n]+/g;

function isUrlLike(t: string): boolean {
  return /^https?:\/\//i.test(t) || /^www\./i.test(t);
}

export function sanitizeYouTubeTags(rawTags: string[]): string[] {
  if (!Array.isArray(rawTags) || rawTags.length === 0) return [];

  const expanded = rawTags
    .flatMap(t => String(t ?? "").split(","))
    .map(t =>
      t
        .replace(WHITESPACE_NORMALIZE, " ")
        .trim()
        .replace(PROHIBITED_CHARS, "")
        .trim()
    )
    .filter(t => t.length > 0 && !isUrlLike(t) && t.length <= MAX_TAG_CHARS);

  let totalChars = 0;
  const sanitized: string[] = [];

  for (const tag of expanded) {
    const cost = tag.length + (sanitized.length > 0 ? 1 : 0);
    if (totalChars + cost > MAX_TOTAL_CHARS) break;
    sanitized.push(tag);
    totalChars += cost;
  }

  if (sanitized.length < rawTags.length) {
    log.debug(
      `[KeywordSanitizer] Trimmed ${rawTags.length - sanitized.length} tags ` +
      `(${rawTags.length} → ${sanitized.length}) to fit YouTube limits`
    );
  }

  return sanitized;
}

/**
 * Validates a single tag and returns a human-readable reason if invalid.
 */
export function validateTag(tag: string): { valid: boolean; reason?: string } {
  if (!tag || tag.trim().length === 0) return { valid: false, reason: "empty" };
  if (tag.length > MAX_TAG_CHARS) return { valid: false, reason: `exceeds ${MAX_TAG_CHARS} chars` };
  if (PROHIBITED_CHARS.test(tag)) return { valid: false, reason: "contains prohibited characters" };
  if (isUrlLike(tag)) return { valid: false, reason: "URL-like tags not allowed" };
  return { valid: true };
}
