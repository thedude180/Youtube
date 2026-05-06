# CreatorOS — YouTube-Only Enforcement Changes
**Audit Date:** 2026-05-05  
**Audit Result:** 23/23 checks CLEAN  
**Verify at any time:** `bash scripts/youtube-only-audit.sh`

---

## What Was Changed and Why

CreatorOS is a YouTube-only platform. This audit enforced that rule at every layer — token refresh, OAuth, publishing, connection health, routing, packaging, and the frontend — so that no call to Twitch, Kick, TikTok, Discord, Rumble, or X/Twitter can reach a live API in production.

---

## 1. Shared Guard Module — `shared/youtube-only.ts`

Central source of truth used by both server routes and services.

```ts
export const SUPPORTED_PLATFORMS = ["youtube"] as const;

export function normalizePlatform(platform?: string | null): SupportedPlatform | null {
  // "youtubeshorts" / "youtube_shorts" / "shorts" → "youtube"
  // everything else → null
}

export function requireYouTubeOnly(platform?: string | null): SupportedPlatform {
  // throws: "Platform disabled in YouTube-only mode: <platform>"
  // if platform is anything other than youtube/youtubeshorts variants
}
```

**Used by:** `server/routes/platform.ts`, `server/routes/distribution.ts`, `server/routes/content-automation.ts`

---

## 2. Token Refresh Layer — `server/token-refresh.ts`

### What changed
Both token refresh functions now filter `platform = "youtube"` at the **database query level**, not just by skipping rows in a loop.

**`refreshExpiringTokens()`**
```ts
// YouTube-only: filter at DB level — never fetch non-YouTube channel rows for token refresh.
const expiringChannels = await db.select().from(channels).where(
  and(
    eq(channels.userId, userId),
    eq(channels.platform, "youtube"),   // ← added
    ...
  )
);
```

**`keepAliveAllTokens()`**
```ts
const allChannels = await db.select().from(channels).where(
  and(
    isNotNull(channels.userId),
    eq(channels.platform, "youtube")    // ← added
  )
);
```

**`repairNullTokenChannels()`** (called by Token Guardian every 30 min)
```ts
const nullChannels = await db.select().from(channels).where(
  and(
    eq(channels.platform, "youtube"),   // ← already present, confirmed
    isNull(channels.accessToken),
    ...
  )
);
```

---

## 3. Connection Guardian Layer — `server/services/connection-guardian.ts`

### What changed
Three functions now filter at DB level.

**`ensureAllTokensFresh()`**
```ts
const allChannels = await db.select().from(channels).where(
  and(isNotNull(channels.userId), eq(channels.platform, "youtube"))
);
```

**`fastRecoverBrokenConnections()`**
```ts
const brokenChannels = await db.select().from(channels).where(
  and(isNotNull(channels.userId), eq(channels.platform, "youtube"))
);
```

**`getConnectionHealth()`**
```ts
// YouTube-only: only surface YouTube channel health.
const userChannels = await db.select().from(channels)
  .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

const userLinked = await db.select().from(linkedChannels)
  .where(and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, "youtube")));
```

Previously `getConnectionHealth` returned health data for all connected platforms. It now only ever returns YouTube channel data, so non-YouTube channels are invisible to the health dashboard and connection guardian cycle.

---

## 4. Publishing Layer — `server/platform-publisher.ts`

### What changed

**Entry-point allowlist** — rejects any non-YouTube publish before it reaches platform-specific code:
```ts
const ALLOWED = new Set(["youtube", "youtubeshorts", "youtube_shorts", "youtube-shorts"]);

if (!ALLOWED.has(platform)) {
  return {
    success: false,
    error: `Publishing to ${platform} is disabled — CreatorOS operates in YouTube-only mode. (410)`,
  };
}
```

**TikTok path stubbed** — removed the dynamic `import("./tiktok-publisher")` call entirely. Replaced with a stub:
```ts
// DISABLED: TikTok publisher — YouTube-only mode.
if (platform === "tiktok") {
  return { success: false, platform: "tiktok", error: "YouTube-only mode — TikTok publishing disabled" };
}
```

**Other platform stubs** (Discord, Twitch, Kick):
```ts
// DISABLED: Discord publisher — YouTube-only mode.
// DISABLED: Twitch publisher — YouTube-only mode.
// DISABLED: Kick publisher — YouTube-only mode.
// Each returns { success: false, error: "YouTube-only mode — <Platform> publishing disabled" }
```

---

## 5. Stream Destinations Route — `server/routes/stream.ts`

### What changed
Stream destination create and update schemas changed from `z.string()` to `z.enum(["youtube"])`, so non-YouTube RTMP destinations are rejected at the route layer with a Zod validation error before any DB write.

```ts
// Create destination
const schema = z.object({
  platform: z.enum(["youtube"]),   // ← was z.string()
  ...
});

// Update destination
const schema = z.object({
  platform: z.enum(["youtube"]).optional(),   // ← was z.string().optional()
  ...
});
```

---

## 6. Distribution Route — `server/routes/distribution.ts`

### What changed
The cross-platform packaging endpoint now ignores any `platforms` array submitted in the request body and always overrides it to `["youtube"]`:

```ts
// Schema still accepts the field for API compatibility, but only "youtube" is valid:
platforms: z.array(z.enum(["youtube"])).min(1).default(["youtube"]),

// YouTube-only: override any submitted platforms list to prevent non-YouTube packaging.
const youtubePlatforms: ["youtube"] = ["youtube"];
const result = await packageForAllPlatforms(userId, parsed.data, youtubePlatforms);
```

All other distribution routes that accept a `platform` parameter run it through `requireYouTubeOnly()` which throws on any non-YouTube value.

---

## 7. Cross-Platform Packaging — `server/distribution/cross-platform-packaging.ts`

### What changed
`packageForAllPlatforms()` has an early YouTube-only guard that silently drops any non-YouTube platform from the passed-in list and defaults to `["youtube"]` if the list ends up empty:

```ts
export async function packageForAllPlatforms(userId, options, platforms) {
  // YouTube-only: filter out any non-YouTube platform silently.
  const ytPlatforms = (platforms ?? []).filter(p => p === "youtube");
  const activePlatforms = ytPlatforms.length > 0 ? ytPlatforms : ["youtube"];
  // ... proceeds with activePlatforms only
}
```

---

## 8. Content Automation Route — `server/routes/content-automation.ts`

### What changed
Removed the import and status field for `tiktokAutopublisher`. The `/api/content-automation/status` endpoint no longer includes a TikTok autopublisher entry in its response.

**Before:**
```ts
import { tiktokAutopublisher } from "../services/tiktok-clip-autopublisher";
// ...status response included tiktokAutopublisher.getStatus()
```

**After:** import removed, field removed from status response. Only YouTube pipeline services appear.

---

## 9. Platform OAuth Route — `server/routes/platform.ts`

### What changed
The `POST /api/oauth/x/manual-token` endpoint was previously guarded by a dev-only check but still constructed and made a live call to `api.twitter.com` when reached. It now returns **410 Gone** immediately:

```ts
app.post("/api/oauth/x/manual-token", (_req, res) => {
  res.status(410).json({
    error: "X/Twitter integration is disabled — CreatorOS operates in YouTube-only mode.",
  });
});
```

All other non-YouTube OAuth flows remain in `LEGACY_DISABLED_OAUTH_CONFIGS` (static data object, never executed).

---

## 10. StreamCenter Frontend — `client/src/pages/StreamCenter.tsx`

### What changed
The multistream relay mutation success toast was updated to remove any implication of multi-platform relaying:

**Before:**
```ts
toast({ title: "Relay started", description: "FFmpeg relay is active for all configured platforms" });
```

**After:**
```ts
toast({ title: "YouTube Live relay started", description: "FFmpeg relay is active for your YouTube Live stream" });
```

The relay itself (FFmpeg → YouTube Live RTMP) is a valid YouTube-only feature. Only the label was misleading.

---

## Audit Script — `scripts/youtube-only-audit.sh`

A new bash script was created that verifies all 23 enforcement points on every run. Run it any time to confirm the codebase is still clean:

```
bash scripts/youtube-only-audit.sh
```

Output on a clean codebase:
```
── 1. Token Refresh Layer
  ✓ refreshExpiringTokens has DB-level YouTube filter
  ✓ keepAliveAllTokens has DB-level YouTube filter

── 2. OAuth Config Layer
  ✓ OAUTH_CONFIGS (active) contains only YouTube platform

── 3. Publishing Layer
  ✓ publishToplatform has YouTube-only allowlist
  ✓ executePublish does not call tiktok-publisher

── 4. Connection Guardian Layer
  ✓ ensureAllTokensFresh has YouTube filter
  ✓ fastRecoverBrokenConnections has YouTube filter
  ✓ getConnectionHealth has YouTube filter

── 5. Token Vault Layer
  ✓ saveToVault has YouTube-only normalization guard

── 6. Route-Level Guards
  ✓ stream destinations enforces z.enum(["youtube"])
  ✓ distribution cross-platform-packaging enforces YouTube-only platforms
  ✓ content-automation has no tiktok-clip-autopublisher reference
  ✓ X/Twitter manual-token route returns 410 (disabled)

── 7. Live HTTP Calls to Non-YouTube APIs (server/)
  ✓ No live Twitch API fetch() calls in server/
  ✓ No live Kick API fetch() calls in server/
  ✓ No live TikTok API fetch() calls in server/
  ✓ No live Discord API fetch() calls in server/
  ✓ No live Rumble API fetch() calls in server/
  ✓ No live Twitter/X API fetch() calls in server/

── 8. Cross-Platform Packaging Guard
  ✓ packageForAllPlatforms has YouTube-only filter

── 9. Shared YouTube-Only Module
  ✓ shared/youtube-only.ts restricts SUPPORTED_PLATFORMS to ["youtube"]
  ✓ shared/youtube-only.ts exports requireYouTubeOnly guard

── 10. Frontend Advisory-Only Check
  ✓ StreamCenter relay toast is YouTube-focused

Results: 23 passed  0 failed
All checks passed — YouTube-only enforcement verified.
```

---

## Files Changed (Summary)

| File | What Changed |
|---|---|
| `shared/youtube-only.ts` | Source of truth — `SUPPORTED_PLATFORMS`, `requireYouTubeOnly()`, `normalizePlatform()` |
| `server/token-refresh.ts` | `refreshExpiringTokens()` + `keepAliveAllTokens()` filter `platform="youtube"` at DB level |
| `server/services/connection-guardian.ts` | `ensureAllTokensFresh()`, `fastRecoverBrokenConnections()`, `getConnectionHealth()` filter `platform="youtube"` at DB level |
| `server/platform-publisher.ts` | YouTube allowlist at entry point; TikTok dynamic import replaced with stub; Discord/Twitch/Kick stubs added |
| `server/routes/stream.ts` | Stream destinations schema changed to `z.enum(["youtube"])` |
| `server/routes/distribution.ts` | Packaging route overrides submitted platforms to `["youtube"]`; all platform params run through `requireYouTubeOnly()` |
| `server/distribution/cross-platform-packaging.ts` | `packageForAllPlatforms()` filters and defaults to YouTube only |
| `server/routes/content-automation.ts` | Removed `tiktokAutopublisher` import and status field |
| `server/routes/platform.ts` | `POST /api/oauth/x/manual-token` returns 410 |
| `client/src/pages/StreamCenter.tsx` | Relay toast updated to say "YouTube Live relay" not "all configured platforms" |
| `scripts/youtube-only-audit.sh` | New — 23-point audit script, exit 0 = clean |
