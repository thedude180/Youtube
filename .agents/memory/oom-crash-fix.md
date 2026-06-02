---
name: OOM crash loop root causes and fixes
description: Why production crashes every ~24 min and what was done to fix it
---

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
