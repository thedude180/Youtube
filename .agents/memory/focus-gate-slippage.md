---
name: Focus gate slippage patterns
description: Two code paths that bypass the BF6 focus gate and let AC/non-BF6 content into autopilot_queue, and how they were fixed.
---

## Path 1 — queuePastStreamContent had no focus-game gate

`queuePastStreamContent` queued ALL past live streams (AC Valhalla, SoM, etc.) as Shorts/long-form clips with no Battlefield check. The function used `stream.category || "Gaming"` as the game name but never ran that through `buildGameFilter`.

**Fix**: Before the stream loop, call `getFocusGame()` and `buildGameFilter(focusGame)`. Skip any stream whose category+title doesn't pass the matcher. Flagged with `continue`.

## Path 2 — title-match bypass writes wrong gameName to metadata

`buildGameFilter(v)` tests `${v.gameName} ${v.title}` together. So a BF2042 video whose catalog detection was wrong (e.g., "Sonic the Hedgehog") still passes the gate via its title containing "Battlefield 2042" — but then `v.gameName` (= "Sonic") gets written to queue metadata.

**Fix**: At Short and long-form insertion points, compute:
```typescript
const effectiveGameName = detectGameFromTitle(v.title ?? "") ?? v.gameName;
```
Use `effectiveGameName` everywhere `v.gameName` was used in the metadata and caption.

## Cleanup — migration 061

One-shot flagged migration that fails all `scheduled`/`pending` autopilot_queue items whose `metadata->>'gameName'` doesn't contain "battlefield/bf6/bf 6". Catches Sonic, AC IV, AI, Gaming, and any other slippage from previous cycles.

## Why this matters

- Channel catalog is 270 AC Valhalla + 50 AC IV + 45 BF6 → gate failure causes the queue to fill with AC content
- The `gameFilter` testing both fields is correct for the GATE (catches misdetected but on-brand videos) but requires the metadata fix so the correct game name is actually stored
