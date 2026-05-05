export const SUPPORTED_PLATFORMS = ["youtube"] as const;

export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number];

export function normalizePlatform(platform?: string | null): SupportedPlatform | null {
  if (!platform) return null;

  const p = platform.toLowerCase().trim();

  if (p === "youtube") return "youtube";

  if (p === "youtubeshorts" || p === "youtube_shorts" || p === "shorts") {
    return "youtube";
  }

  return null;
}

export function isSupportedPlatform(platform?: string | null): boolean {
  return normalizePlatform(platform) !== null;
}

export function requireYouTubeOnly(platform?: string | null): SupportedPlatform {
  const normalized = normalizePlatform(platform);

  if (normalized !== "youtube") {
    throw new Error(`Platform disabled in YouTube-only mode: ${platform || "unknown"}`);
  }

  return normalized;
}
