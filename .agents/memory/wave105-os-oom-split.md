---
name: Wave 10.5 OS-level OOM kill and split
description: 34-service Wave 10.5 caused platform SIGKILL at T+35min; fix is to split into Wave 10.5 (20 services) + Wave 10.75 (14 services, T+50min) with a 13-min GC gap.
---

## The rule
Never put more than 20 services into a single sequential Wave 10.5 boot block.
If services need to be added, create a new named wave (10.75, 10.8, etc.) that
starts at least 10 minutes after the previous wave finishes.

**Why:** Each `import()` in sequentialBoot permanently grows the Node module
cache. With 34 services at T+31.6min, ~14 services had loaded by T+35min. The
cumulative heap exceeded the container OS memory ceiling. The Replit platform
issued a SIGKILL — this bypasses MemoryGuardian's 42-min holdoff entirely
because MG can only prevent its own `process.exit()`, not an OS-level kill.

**How to apply:**
- Count services in every sequentialBoot array before adding more.
- Threshold: ≤20 services per Wave 10.5 block.
- Move excess to Wave 10.75 starting at T+50min (sleep 24.5min after Wave 10).
- Call `memoryGuardian.resetBaseline()` after each batch finishes.
- 14 ASI/capability services deferred: platform-compliance-brain,
  bayesian-knowledge, algorithm-model-learner, goal-discovery, architecture-critic,
  hypothesis-engine, self-architect, autonomous-goal-engine, safe-self-implementer,
  causal-attribution-engine, content-expansion-engine, back-catalog-asi,
  live-stream-asi, master-asi.

## Symptoms
- Consistent crash at T+35min (right in middle of Wave 10.5 loading)
- Health monitor: "196 vault entries stuck in indexed for >2h"
- Health monitor: "Publishing velocity: 0 in last 4h"
- MemoryGuardian NOT in logs (it never triggered — OS killed first)
- Server restarts ~35min after each boot → crash loop

## Timeline after fix
- T+31.6min: Wave 10.5 starts (20 engines × 15s = ~5min)
- T+36.6min: Wave 10.5 done, MG baseline reset
- T+40.5min: Wave 11 immune system starts
- T+42min: MG holdoff expires, real leak detection begins
- T+50min: Wave 10.75 starts (14 engines × 20s = ~4.7min)
- T+54.7min: Wave 10.75 done, MG baseline reset again
