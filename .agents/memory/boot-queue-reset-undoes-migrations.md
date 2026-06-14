---
name: Boot queue reset undoes migrations
description: index.ts Wave 0.6 full queue reset runs AFTER Wave 0.5 migrations and resets everything back — undoing purge migrations on every restart.
---

## The Rule

Any startup migration that sets `status='permanent_fail'` to purge items will have that status reset back to `scheduled` on every single boot by the "Full queue reset" in `index.ts` Wave 0.6.

**Two safe alternatives:**
1. **Use `cancelled` status** — NOT in the reset's `WHERE status IN ('permanent_fail', 'processing', 'pending')` clause. `cancelled` items survive every future restart permanently.
2. **Set `metadata->>'failReason' = 'migration-0XX:...'`** — the reset now has an exception: `AND (metadata->>'failReason' IS NULL OR metadata->>'failReason' NOT LIKE 'migration-%')`. Items with this pattern are skipped by the reset.

## Why

The full queue reset is a "give everything another shot on every deploy" mechanic at index.ts ~line 2755. It runs at Wave 0.6 (after all startup migrations at Wave 0.5). It was only excepting one specific `error_message` string — everything else including migration-purged `permanent_fail` items was reset to `scheduled`.

This caused AC Unity Shorts (purged by migrations 072/074) to resurrect on every boot and fill the pre-encoder with 131+ items that would never succeed, blocking all BF6 publishing.

## How to Apply

- **New purge migrations**: use `SET status = 'cancelled'` instead of `SET status = 'permanent_fail'`. Also set `metadata->>'failReason' = 'migration-0XX: description'` for audit trail.
- **Existing purge migrations that used permanent_fail**: add a follow-up migration that re-sets them to `cancelled`.
- **The exception pattern in the reset**: items where `metadata->>'failReason' LIKE 'migration-%'` are now skipped — so both approaches work going forward.
- The `perpetual-repair.ts` rescues `permanent_fail` items older than 24h as well — another reason `cancelled` is the right status for intentionally-dead items.
