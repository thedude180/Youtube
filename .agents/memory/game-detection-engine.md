---
name: Multi-signal game detection engine
description: Architecture and rules for game-detection.ts — what signals it uses, how cross-validation works, and how to extend it.
---

# Multi-signal game detection engine

## Location
`server/services/game-detection.ts`

## How it works
1. Builds a full text corpus: `title + description + tags joined`.
2. For every game in SIGNATURES dict: scores across character (+20), weapon (+20), location (+15), keyword (+10) signals. Title regex match adds +35. All capped at 100.
3. Cross-validator: if title says "Battlefield 6" but BF2042 character/weapon signals dominate, overrides to BF2042. This catches "Sundance" / "SFAR-M GL" mislabelling.
4. Returns null if top score < 38 (configurable). No generic fallback — null is better than a wrong label.
5. Exports `detectGame(title, description?, tags?, minConfidence?)` → `GameDetectionResult` and `extractGameForBackCatalog(title, description?, tags?)` → `string|null`.

## Integration in back-catalog engine
`importFromYouTube` now calls `extractGameForBackCatalog(ytv.title, ytv.description, ytv.tags)` first, falls back to legacy `extractGameName(title, tags)` only if null. The legacy function's "first tag as game name" fallback was removed — returning null is safer.

## Known corrections registry
`server/services/youtube-metadata-corrector.ts` holds `KNOWN_CORRECTIONS[]`.
- Entry for `3NKTCjsIgAY`: "Battlefield 6" → "Assassin's Creed 3" (confirmed via screenshot 2026-06-06).
- Add new entries here when a human confirms a mismatch via screenshot.
- Admin routes: `GET /api/admin/youtube/game-correction-status`, `POST /api/admin/youtube/correct-game-metadata`.
- Each correction is idempotent via `system_settings` flag `metadata_correction:<videoId>`.

**Why:** The legacy detector only had one generic "Assassin's Creed" regex and one "Battlefield 6" regex. It couldn't distinguish AC3 from ACU, or BF2042 from BF6. The new engine uses per-title character/weapon/location dictionaries to score each specific game independently.

**How to apply:** When adding a new game to the catalog, add an entry to `SIGNATURES` in game-detection.ts with its specific characters, weapons, and locations. Do NOT rely on generic title keywords alone — they can collide.
