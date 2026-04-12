export function safeParseJSON<T = any>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const extracted = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (extracted) return JSON.parse(extracted[0]) as T;
    } catch {}
    return fallback;
  }
}
