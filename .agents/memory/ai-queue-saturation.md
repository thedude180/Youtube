---
name: AI queue saturation loop fix
description: stream-exhaust while loop caused permanent AI queue saturation at 4 calls/sec; fix pattern for any engine that calls AI in a tight loop
---

## The rule
Any engine that calls an AI function inside a `while` loop MUST catch "AI queue full"
errors specifically and sleep before retrying, NOT just `continue` immediately.

## What happened
`runDailyContentGeneration` (stream-exhaust logger) had this pattern:
```typescript
while (streamRemaining >= 1) {
  const plan = await generateBatchPlan(...); // AI call
  if (!plan) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) break;
    streamRemaining -= MINUTES_PER_BATCH;
    continue; // ← zero backoff
  }
}
```
`generateBatchPlan` caught ALL errors and returned null, including "AI queue full".
So a queue-full condition looked identical to a bad-content-plan condition.
Result: ~4 calls/sec spinning through all streams, permanently holding all 4 AI slots.

## Fix applied
1. `generateBatchPlan` now re-throws errors that contain "AI queue full" — queue
   saturation is a transient infrastructure state, not a content-plan failure.
2. The while loop catches queue-full specifically:
   ```typescript
   try {
     plan = await generateBatchPlan(...);
   } catch (planErr: any) {
     if (planErr?.message?.includes("AI queue full")) {
       await new Promise(r => setTimeout(r, 30_000)); // back off 30s
       continue; // retry SAME segment, no minutes consumed
     }
     // other errors fall through to null-plan handling
   }
   ```

## Boot window startup delays
The AI queue has 4 background slots. These engines must NOT converge:
- T+10-20 min: back-catalog runner + AI orchestrator (immovable — their design)
- T+20-25 min: stream-exhaust (daily-content-engine, index.ts line ~3373)
- T+22 min: self-improvement-engine (internal setTimeout)
- T+22 min: growth-flywheel (first flywheel cycle)
- T+25 min: growth-flywheel competitive intel
- T+27 min: growth-flywheel memory consolidation

**Why:** Each "AI queue full" error that returns immediately (not a real network wait)
collapses the event loop's backpressure. A tight while loop with immediate-return errors
produces thousands of calls per minute regardless of `await`.

**How to apply:**
- New engines with AI calls in tight loops: always detect queue-full and sleep 30s+
- New heavy-AI engines: check the boot window timeline above before setting initial delay
- If adding another engine to the T+10-20 min window: push it to T+25+ min instead
