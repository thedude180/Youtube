---
name: Early self-heal boot pattern
description: Self-heal fires at T+5s before publishers start; Wave 7 pushed T+15→T+20min to eliminate the convergence crash window.
---

## Boot timing (current)
| Time | What |
|------|------|
| T+0s | prod-heal (channel cleanup, ghost data) |
| T+3s | startup-migrations (one-time DB fixes) |
| T+5s | **Wave 0.52: runPipelineSelfHeal(true)** — full 7-healer deep audit before any publisher starts |
| T+4min | Publishers start — picking up from a clean slate |
| T+8min | Wave 6 |
| T+20min | Wave 7 (was T+15min) |
| T+20:21 | Wave 8 — initPipelineSelfHeal() registers periodic schedule |
| T+25:21 | pipeline-self-heal first startup deep audit (5min after Wave 8 init) |
| Every 20min | Regular heals continue |

## Why T+15min was crashing
Wave 7 (7 services) + Wave 8 fired at T+15:21. `pipeline-self-heal` deep audit ran IMMEDIATELY at T+15:21 (now deferred 5min). Continuity engine first cycle was 10s after init (now 60s). Combined DB pressure → pool saturation → healthcheck 500s → crash loop. 31 outages/day.

## Key files
- `server/index.ts` — Wave 0.52 at T+5s; Wave 7 sleep 12min (not 7min)
- `server/services/pipeline-self-heal.ts` — startup deep audit deferred 5min; `runHealthMonitor()` called after every cycle
- `server/services/continuity-engine.ts` — first cycle 60s (was 10s)
- `server/lib/dependency-check.ts` — ffmpeg dynamic Nix store glob fallback

## ffmpeg dynamic discovery
Static paths fail when Nix store hash changes. Added shell-glob probe in `probeFFmpeg()`:
```sh
sh -c 'ls /nix/store/*-ffmpeg-*/bin/ffmpeg 2>/dev/null | head -1'
```
Fast (OS-level glob, not recursive find), 5s timeout. Logs discovered path.

**Why:** After a Nix package update the hash changes and all hardcoded `/nix/store/HASH-ffmpeg-*/bin/ffmpeg` paths break. The glob finds the new hash automatically.
