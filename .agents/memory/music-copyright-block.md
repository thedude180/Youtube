---
name: Music copyright monetization block
description: Background music library tracks carry Content ID claims that disable channel monetization; must use raw game audio only
---

## The Problem

`assembleMusicScore()` in `pre-encoder.ts` mixed tracks from `data/music-library/`
(act1_intro.mp3, short_arc_01.mp3, short_arc_02.mp3, etc.) into every encoded clip.
One track — "KML - T006 Energy" by A.K. — carries a Content ID claim. YouTube's system:
- Marks the video "Can't be monetized"
- Does NOT issue a strike (channel is safe)
- But revenue goes to the claimant instead of the channel

## The Fix

In `server/services/pre-encoder.ts`:
- Removed `assembleMusicScore` from the import (kept `cleanupMusicScore` — it's a safe no-op on null)
- Set `const musicPath: string | null = null;` in BOTH `encodeShort()` and `encodeLongForm()`
- All `if (musicPath)` branches already have an `else` (no-music FFmpeg path) — those take over
- `hasMusicMixed` now always returns false → `hasAiMusic` metadata not set → `selfDeclaredMadeWithAI: false`

## Why Raw Game Audio Is Fine

No-commentary gaming channels don't need background music. Game audio (gunshots, explosions,
ambient sounds) provides all the sensory context. YouTube doesn't penalize "no music" content.

## Handling Already-Uploaded Videos

For videos already on YouTube with the claim:
1. YouTube Studio → Content → the video → Copyright
2. "Remove song" — mutes only the claimed track, keeps game audio in that segment
3. For non-BF6 videos (AC Valhalla etc.) — just delete them, they shouldn't be there

**Why:** Raw game audio = zero copyright risk = monetization always enabled.

**How to apply:** If music claims appear again in future, check if `assembleMusicScore` was
re-enabled or new tracks added to `data/music-library/` without license verification.
Never re-enable music mixing without confirming all tracks are YouTube monetization-safe.
