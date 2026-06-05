---
name: OOM crash loop root causes and fixes
description: Why production crashes every ~24 min and what was done to fix it
---

## Jun 5 Follow-up: clip-video-processor.ts Memory Gate + AI Queue Stampede Fixes

### Cause 4: clip-video-processor bypassed ytdlp-gate memory check (FIXED)
- `downloadWithYtDlp` in `clip-video-processor.ts` called `execFileAsync(YT_DLP_BIN())` directly, bypassing `ytdlp-gate.ts`
- Added `hasSpawnHeadroom()` check inside `downloadWithYtDlp` before every `execFileAsync` call

### Cause 5: Permanent fail sentinel row missing on first failure (FIXED)
- `markPermanentlyFailed` only ran UPDATE; if no vault row existed the update was a silent no-op
- On next restart the same video would retry, fail, and crash the container
- **Fix**: Changed to upsert: tries UPDATE first (.returning()), falls back to INSERT sentinel row

### Cause 6: AI queue stampede from batch callers (FIXED)
- `channel-catalog-sync.ts` fired fire-and-forget `vodSEOOptimizer.optimize()` for every video in a batch with no delay → 50+ concurrent AI calls
- `routes/content.ts` SEO reset batch loop had no inter-call delay
- **Fix**: Added `seoStaggerIndex * 8000 ms` setTimeout stagger in catalog-sync; added `4000 ms` await between videos in content.ts batch loop
- `backlog-engine.ts` viral optimizer had no inter-video delay → added `INTER_VIDEO_DELAY_MS = 4000`

## Root Causes of 24-Minute OOM Crash Loop

### Cause 1: Live Gate False Positive (FIXED — confirmed in production)
`server/services/agent-events.ts` was activating the live gate on HLS failures, causing live-copilot mode to turn on spuriously. Already deployed and confirmed working.

### Cause 2: MemoryGuardian False Positive → Zombie State (FIXED)
- MemoryGuardian was sampling heap every 60s, triggered at 350 MB with only 10 samples (10 min of data)
- `drainAndRestart()` called `throw new Error(...)` inside `.catch()` — process never exited, zombie state until container SIGKILL at ~T+24min
- **Fix**: 5-min startup holdoff, 20-sample minimum (25 min of steady data), 500 MB threshold, `process.exit(1)` instead of throw

### Cause 3: yt-dlp Container Memory Gate Missing from Slot Acquisition (FIXED)
- `ytdlp-gate.ts` enforces MAX_CONCURRENT=1 (serializes all yt-dlp processes)
- `hasSpawnHeadroom()` check (200 MB free minimum) was only in video-vault's download path
- Shorts-publisher and pre-encoder section downloads bypassed the memory gate — could spawn yt-dlp even when container was at 350+ MB used, pushing total over container limit
- **Fix**: Added `hasSpawnHeadroom()` check inside `acquireYtdlpSlot()` itself — throws immediately if <200 MB free, callers handle gracefully

## Key Architecture Facts
- Container OOM kill is silent (no Node.js logs) — OOM killer terminates the cgroup
- cgroup memory includes ALL processes: Node.js RSS + yt-dlp Python + ffmpeg
- yt-dlp (Python) consumes 150-300 MB per process on startup
- `getContainerMemory()` reads `/sys/fs/cgroup/memory.current` — true container usage
- `MIN_SPAWN_HEADROOM_BYTES = 200 MB` is the minimum free container memory needed
- Production container limit estimated at 512-640 MB based on crash timing

**Why:** The gate existed but was not enforced at the acquisition point — only at the vault's own download entry. Any new caller that used `acquireYtdlpSlot()` without their own `hasSpawnHeadroom()` check was unprotected.

**How to apply:** If adding a new yt-dlp caller, use `downloadYouTubeSection()` or `acquireYtdlpSlot()` — the gate now automatically enforces memory headroom. Do not add separate `hasSpawnHeadroom()` checks; the gate handles it.
