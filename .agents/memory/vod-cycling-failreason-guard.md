---
name: VOD cycling bug — failReason guard on Bug B restoration
description: Bug B restoration (index.ts Wave 0.6) must exclude items with failReason LIKE 'migration-%' or per-boot cleanups are undone every restart
---

## The rule

The Bug B `cancelled → scheduled` restoration in `server/index.ts` (Wave 0.6, ~line 1037) MUST include:

```sql
(metadata->>'failReason' IS NULL OR metadata->>'failReason' NOT LIKE 'migration-%')
```

as a Drizzle `sql`` ` raw condition in its WHERE clause.

**Why:** `cleanupNonBF6QueueItems()` and other per-boot content-integrity cleanups set `status='cancelled'` with `failReason='migration-per-boot:...'`. Bug B restoration unconditionally restores ALL cancelled vod-long-form/vod-short items. Without this guard, every boot undoes the per-boot cleanup — 14+ off-brand items cycled cancelled→scheduled on every restart, wasting quota and risking off-brand content publishing.

**How to apply:**
- Any new "cancelled → scheduled" restoration sweep must also include this failReason guard.
- Per-boot cleanups that use `cancelled` status MUST set `failReason` starting with `'migration-per-boot:'` or `'migration-'` prefix to be protected.
- Items cancelled by named one-shot migrations use `failReason LIKE 'migration-0XX:...'` and are also protected.
