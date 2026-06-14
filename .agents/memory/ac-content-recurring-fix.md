---
name: AC content recurring generation fix
description: Why one-shot migrations fail to stop recurring off-brand content, and the correct per-boot cleanup pattern.
---

## The Rule

Any content-integrity rule that must survive recurring generator cycles (e.g. the back-catalog runner that fires every 22-24h) MUST be implemented as a per-boot non-flagged cleanup in `server/index.ts`, NOT as a one-shot startup-migration.

**Why:** One-shot migrations (`getFlag` / `setFlag` pattern) run exactly once. When the back-catalog runner fires again 22-24h later and generates fresh off-brand items, there is no migration left to clean them up.

**How to apply:**
- Add a raw `db.execute(sql\`...\`)` call in the Wave 0.6 / boot-reset section of `index.ts` using a `.then()/.catch()` chain (fire-and-forget, like the other boot cleanups)
- Use `'cancelled'` status — NOT `'permanent_fail'` — so the boot queue reset (which runs moments earlier and resets permanent_fail → scheduled) cannot resurrect the items
- Gate with `user_id IN (SELECT user_id FROM channels WHERE id = 53)` to scope to the real channel
- Log the row count so it's visible in production logs: `[Boot] AC/off-brand purge: cancelled N non-BF6 items`

## The `isCopyrightRiskyGame` Valhalla gap

`COPYRIGHT_RISKY_GAME_PATTERNS` in `youtube-back-catalog-engine.ts` previously only matched:
```
/assassin.?s creed.*(unity|syndicate|liberation|black flag|freedom cry)/i
```

Valhalla, Origins, and Odyssey were NOT in the list → AC Valhalla videos passed the copyright gate and the back-catalog engine's `gameFilter` (BF6 filter) should have blocked them, but some path allowed them through.

**Fixed:** Broadened to `/assassin.?s creed/i` (catches ALL AC titles) + explicit `/\bac valhalla\b/i` abbreviations.

## The one-shot migration trap (observed in production)

Migration 075 set AC items to `cancelled` (immune to boot reset) once. But:
1. The back-catalog runner re-ran 22-24h later and generated 8 new AC items (June 14)
2. Those new items had no migration to clean them up
3. The old 128 items from June 13 were in `pending` status — migration 075's ILIKE patterns (`%"AssassinsCreed"%`, `%"Valhalla"%`) may not have matched all serialized forms of the gameName

Result: 136 AC items still in pending/scheduled, still at risk of being published.
