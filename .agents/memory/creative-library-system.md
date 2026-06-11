---
name: Creative Library system
description: Architecture of the ever-expanding scored creative asset library — music tracks, video filters, title templates stored in DB and scored by YouTube Analytics.
---

## Overview
`creative_library` PostgreSQL table stores every creative asset the system has generated or discovered. Assets are scored 0–100 from real YouTube Analytics (40% retention + 30% CTR + 30% success rate). Best performers get selected more often; bad performers sink. Library grows as new assets are generated.

## Key files
- `server/services/creative-library-manager.ts` — seedMusicLibrary, getBestItem, addToLibrary, recordUsage, recordPerformance, listLibraryItems, getLibraryStats
- `server/routes/creative-library.ts` — GET /api/creative-library, GET /api/creative-library/stats, POST /api/creative-library/generate, PATCH /api/creative-library/:id
- `server/lib/generate-music.ts` — ElevenLabs API wrapper (requires ELEVENLABS_API_KEY env var)
- `client/src/pages/dashboard/CreativeLibrary.tsx` — dashboard panel

## Music track roles (tags)
- `intro` → act1_intro.mp3 — Act 1, quiet/anticipatory
- `rising` → act2_rising.mp3 — Act 2, tension builds
- `climax` → act3_climax.mp3 — Act 3, peak intensity
- `falling` → act4_falling.mp3 — Act 4, post-combat
- `outro` → act5_outro.mp3 — Act 5, resolution
- `short_arc` → short_arc_01/02.mp3 — 90s complete arc for Shorts

## How seeding works
`seedMusicLibrary(channelId)` in startup-migrations.ts runs on every boot (non-flagged, non-transactional). It scans `data/music-library/` for .mp3 files and INSERTs any not already in the DB (deduplicates by filePath). This means dropping a new .mp3 in the directory automatically registers it on the next restart.

## How track selection works
`assembleMusicScore(durationSec, isShort, channelId?)` in music-scorer.ts:
1. Calls `getBestItem(channelId, "music", tag)` for each act role
2. Falls back to hardcoded ACT_FILES paths if DB returns nothing or file missing
3. Fires `recordUsage(id)` fire-and-forget for each item used
4. For Shorts: picks highest-scoring item with `short_arc` tag

## Performance feedback loop
`recordPerformance(itemId, retention, ctr)` updates the score after YouTube Analytics data is available (48h+ after publish). The learning brain or analytics engine should call this for each item stored in queue metadata.

## deleteChannel() requirement
**Why:** `creative_library` has `channel_id` column → must be in `deleteChannel()`'s `channelTables` array in storage.ts.
**How to apply:** Any new table with `channel_id` added to `creative_library`-style tables must also be added to `channelTables`.
