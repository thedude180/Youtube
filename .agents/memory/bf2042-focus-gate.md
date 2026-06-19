---
name: BF2042 focus-gate false-allow
description: buildGameFilter "battlefield 6" used broad "battlefield" pattern that matched BF2042; explicit deny required
---

## The Problem

`buildGameFilter("Battlefield 6")` in `server/services/youtube-back-catalog-engine.ts`
used this abbrevMap entry:
```javascript
"battlefield 6": ["battlefield", "bf6", "bf 6"],
```

The bare `"battlefield"` pattern matched every game with "battlefield" in the name,
including "Battlefield 2042". So BF2042 source videos were included in catalog
processing → clips queued → published.

`buildFocusGameRegex()` in `game-focus.ts` was already correct (generates
`/Battlefield 6|bf6|bf 6/i`) but `buildGameFilter` was the function used
by the back-catalog engine and it was wrong.

## The Fix

```javascript
const DENY_RE = /battlefield\s*2042|bf\s*2042\b/i;
return (v) => {
  const text = `${v.gameName ?? ""} ${v.title ?? ""}`;
  if (DENY_RE.test(text)) return false;
  return re.test(text);
};
```

Gate semantics after fix:
- `gameName = "Battlefield 6"` → ALLOW
- `gameName = "BF6"` → ALLOW
- `gameName = "Battlefield"` (no number, detection failure) → ALLOW (benefit of doubt)
- `gameName = "Battlefield 2042"` → DENY
- `gameName = "BF2042"` → DENY

## Defence in depth

1. `buildGameFilter` deny (stops new clips being generated from BF2042 sources)
2. `migration104CancelBF2042Items()` (one-shot, cancels items already in queue)
3. `cleanupNonBF6QueueItems()` per-boot (catches any BF2042 items that slip through
   via caption, e.g. "Battlefield 2042 LIVE – Raw Gameplay Only")

**Why:** Channel is BF6-only. BF2042 is a different, older game. Any BF2042 clips
confuse the audience and dilute the channel's topic focus.

**How to apply:** If BF2042 clips appear again, check whether DENY_RE is still
present in `buildGameFilter`. Also check that `cleanupNonBF6QueueItems` SQL
includes the `metadata::text ILIKE '%"Battlefield 2042"%'` patterns.
