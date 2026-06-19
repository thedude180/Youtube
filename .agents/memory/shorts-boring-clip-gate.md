---
name: Shorts boring-clip freeze gate
description: encodeShort() had no quality gate; wall-stare/idle clips were encoding and publishing; fixed with pre-encode freeze detection
---

## The Problem

`encodeLongForm()` runs `detectFreezeSegments()` with `minFreezeSec=60` to cut
out loading screens / dead time. `encodeShort()` had NO equivalent quality gate.

Clips chosen by the back-catalog engine's "even-spacing" fallback (used when
retention curve analytics aren't available) could land on boring moments:
- Player scoping at a wall waiting for an enemy
- Respawn screen idle
- Menu / loadout screen

These clips encoded normally and were published to YouTube, performing poorly
and damaging the channel's audience retention signals.

## The Fix

Added to `encodeShort()` after cutscene detection, BEFORE the encode:

```typescript
const freezeSegs = await detectFreezeSegments(rawPath, 10); // 10s threshold
const totalFrozenSec = freezeSegs.reduce((s, seg) => s + (seg.end - seg.start), 0);
if (totalFrozenSec > durationSec * 0.50) {
  throw new Error(`boring-clip: ${Math.round(totalFrozenSec)}s frozen / ${Math.round(durationSec)}s total — static moment rejected`);
}
```

The thrown error increments `preEncoderFailCount`. After 3 retries the item
is permanently failed; the back-catalog engine selects a different timestamp
on the next catalog cycle.

## Caveats

`detectFreezeSegments` uses FFmpeg's `freezedetect=n=-60dB:d=10` — requires
TRULY static pixels (< -60dB change across all channels) for 10+ seconds.
Action with smoke/fire/HUD animations won't trigger this. It catches:
- Loading screens ✓
- Black screens between respawns ✓
- Scope aimed at empty wall with zero movement ✓
- "Sitting duck" idle waiting for action ✓

It does NOT catch:
- Slow walking with minor mouse drift (some pixel change)
- Scope aimed at distant object with particle effects (fire/smoke moving)

For those cases, the fix lives upstream: retention-curve clip selection
prefers high-engagement moments, and the vision-clip-detector (GPT-4o)
adds another layer of scoring. The freeze gate is the last line of defence.

**Why:** 50% frozen threshold: a 30-second clip with 16+ seconds of freeze
is clearly a bad moment. Action clips have near-zero frozen time.

**How to apply:** If boring clips appear again, check that the freeze gate is
still in `encodeShort()` with `minFreezeSec=10` and threshold `0.50`. Can
lower to `0.40` or reduce `minFreezeSec` to `8` for stricter gating.
