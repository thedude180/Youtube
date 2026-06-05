---
name: Boot-storm crash fix (2026-06-05)
description: 87 production crashes/day caused by T+17min OOM convergence and a boot AI-storm that filled the 8-slot semaphore within 115 seconds; how each was fixed.
---

## Primary crash driver — T+17 min OOM convergence

Publisher sweep fired at T+2 min, then every **15 minutes** (T+2, T+17, T+32...).
Back-catalog runner starts at T+10-15 min (jittered). At T+17 min both services
try to download/encode video concurrently → OOM kill → restart → repeat every 15 min.

**Fix (server/index.ts):**
- `hourlySweepInitTimer`: T+2 min → **T+40 min**
- `hourlySweepInterval`: `jitter(15 * 60_000)` → `jitter(30 * 60_000)`

## Secondary crash driver — boot AI storm

**How:** All 50+ engines start within a 20-second window. Four heavy agents in
`agent-orchestrator.startUserAgentSession` had first-run delays of 20/40/60/90 seconds.
With Wave 3 starting at ~T+20s, they fired at T+40-110s, filling the 8-slot AI
semaphore by T+115s and leaving every subsequent request dropped.

**Fix (server/services/agent-orchestrator.ts):**
| Agent | Before | After |
|-------|--------|-------|
| ai_team | 20s | 5 min |
| business_agents | 40s | 7 min |
| legal_tax | 60s | 10 min |
| team_ops | 90s | 12 min |

**Fix (server/index.ts Wave 5):**
community-audience-engine, creator-education-engine, brand-partnerships-engine
wrapped in a `setTimeout(..., 5 * 60_000)` — were firing immediately before.

## Phantom user AI waste — growth-flywheel

Local `isYouTubeUser()` only blocked `tiktok_/rumble_/kick_/twitch_` prefixes.
`google_api_demo_reviewer` passed through all 3 loop functions and triggered AI calls.

**Fix (server/services/growth-flywheel-engine.ts):**
- Replaced `isYouTubeUser` with `isActiveYouTubeUser` from `active-user-guard` in all 3 loops
- Competitive scan boot delay: 120s → 12 min
- Flywheel cycle boot delay: 5 min → 8 min

**Fix (server/services/self-improvement-engine.ts):**
- Initial run delay: 120s → 10 min

## Why the T+15min fix in memory.md wasn't enough

Previous fix raised grinder interval 10→20 min and added memory gates.
It did NOT touch the publisher sweep first-run time. The T+17 min convergence
(publisher sweep #2) was the remaining crash vector.
