---
name: Autonomous OS Upgrade
description: Durable rules for the autonomous OS primitives that gate all background engine work in CreatorOS.
---

## The problem these primitives solve

Demo/reviewer accounts (userId pattern: `google_api_demo_reviewer`, channelId pattern: `UCdemo_*`) were consuming real AI quota and triggering YouTube RSS 404 storms. Combined with AI call stampedes and unordered startup, this caused 31 crash/restarts per 24h in production.

## Gateway rules — apply to every new background engine

**Why:** Without a single gate, each new engine must independently re-implement all the same checks (demo guard, quota breaker, kill switches, memory pressure), and any engine that misses one creates a crash path.

**How to apply:** At the top of every per-user iteration in a background engine:
1. Call `isProductionAutomationAllowed(userId, channelId)` — returns false for any userId containing `demo/test/reviewer/seed/placeholder` or channelId starting with `UCdemo`. Early-exit with one-time log per userId per session.
2. Call `CommandCenter.canRun({module, userId, channelId, jobType, platform, priority})` — checks kill switches → account guard → channel validity + connection → YouTube quota → AI capacity → memory pressure in that order. Returns `{allowed, reason, action}`.
3. Route all background AI calls through `AIScheduler.enqueue` (not raw `executeRoutedAICall`) — enforces priority lanes (1–10), max 4 concurrent background slots, hourly/daily budget per module.
4. Use `LogSuppressor.warn/error(key, message)` for repetitive error paths — first occurrence logs immediately, subsequent within 10 min are suppressed and summarized.

## Startup sequencing rule

**Why:** Wave-based startup allows engines to fire before critical checks (DB readiness, demo job purge, quota recovery) complete.

**How to apply:** `StartupOrchestrator.run()` runs at Wave 0.6 (after startup-migrations, before Wave 1 engines). Its 13 stages are sequential and awaited. Critical stage failure keeps HTTP server alive but prevents dependent workers from starting. Non-critical stage failures degrade with warning only.

## Kill switch admin auth rule

**Why:** `POST /api/system/kill-switch/:name` affects all users globally — broken access control here is a serious privilege escalation risk.

**How to apply:** Always use `requireAdmin(req, res)` from `./helpers` for any kill-switch write endpoint. `requireAdmin` returns null and sends 401/403 automatically; callers must check `if (!adminUserId) return;`.

## getQuotaStatus signature

`getQuotaStatus(userId: string)` requires a userId. For dashboard/status routes without a request-level user, use `isQuotaBreakerTripped()` (no args) instead.

## DB cascade rule for new tables with channel_id

Any new schema table with a `channel_id` FK must also be added to the DELETE list in `deleteChannel()` in `server/storage.ts`. The `check-channel-tables` validation script enforces this on every commit.

