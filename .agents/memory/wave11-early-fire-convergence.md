---
name: Wave 11 early-fire convergence crash
description: When Wave 10.5 is disabled (meta-intelligence gate off), Wave 11 fires at T+30.5min instead of the commented T+35min, colliding with back-catalog runner, grinder, and VOD optimizer.
---

## The bug

Wave 11 comment says "T+35min" but this assumes Wave 10.5 ran and completed (~4.5 min). When `meta-intelligence` is disabled (DISABLED_SERVICES), the entire Wave 10.5 `wave(...)` call is never registered. The wave chain jumps from Wave 10 (~T+25.5min) directly to Wave 11. Wave 11 sleeps 5min → fires at T+30.5min.

## The convergence window that caused 70 outages/day

Without the fix, all 6 heavy services converged in T+29-35min:
- T+25-30min: back-catalog runner first cycle
- T+28min: playlist manager  
- T+29min: grinder first run (was 4min/240s startup delay from Wave 10 T+25)
- T+30.5min: Wave 11 (autopilot-monitor, connection-guardian, perpetual-repair)
- T+31min: VOD optimizer (was 16min delay from Wave 8 T+15)
- T+35.5min: perpetual-repair first cycle (Wave 11 + 5min internal delay)

Memory spike from simultaneous yt-dlp + AI + DB work → OOM → crash loop.

**Why:** node-cron missed execution warning at T+19min was a GC-pause symptom (not root cause). The crash was at T+35min from the convergence.

## The fix (applied)

Three timing changes spread the services over a 22-minute window:
1. `server/index.ts` Wave 11 sleep: `5 * 60_000` → `15 * 60_000` (fires T+40.5min)
2. `server/index.ts` VOD optimizer delay: `16 * 60_000` → `32 * 60_000` (fires T+47min)
3. `server/services/relentless-content-grinder.ts` startup: `240_000` → `600_000` (fires T+35min)

**How to apply:** Any future service added to Wave 8-11 must account for the fact that Wave 10.5 may be skipped. Do not rely on Wave 10.5's execution time when calculating Wave 11's timing. Always use an absolute sleep long enough to clear the T+25-35min convergence window.

## Diagnostic pattern

- Server runs fine T+0 to T+28min
- node-cron "missed execution" warning at T+19min (GC pressure building)
- Multiple "Failed query" errors at SAME millisecond on 3+ tables = GC pause timeout, not schema issue
- Crash at T+35min
- 70 outages/day = ~20min crash cycle
