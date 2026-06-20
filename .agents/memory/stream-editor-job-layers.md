---
name: Stream editor cancelLongStreamEditJobs layer isolation
description: Why each Layer (A/B/C) in cancelLongStreamEditJobs must have its own try/catch, and how to add new cycling job IDs.
---

## The rule
Each Layer (A, B, C) in `cancelLongStreamEditJobs()` MUST have its own independent `try/catch`. A single shared try/catch means any DB error in Layer A silently blocks Layers B and C.

## Why
Layer A cancels ALL `processing` stream_edit_jobs on boot. If the `stream_edit_jobs` table has a schema mismatch or RLS issue, Layer A throws and skips Layers B (known IDs) and C (source >7200s). The stream editor's startup recovery at T+19min then finds the job still in `processing` and re-queues it → crash loop on every boot.

## How to apply
- When a stream_edit_job causes a recurring boot-time crash loop, add its ID to `LONG_STREAM_EDIT_JOB_IDS` in `server/lib/startup-migrations.ts`.
- Known crash-loop IDs as of 2026-06-20: 18117, 18229, 18103–18112, 18297.
- The stream editor startup recovery (in `stream-editor.ts`) only cancels jobs with `startedAt > 2h ago`; "recent" jobs (<2h) are re-queued, creating a cycle if the job OOMs.
- Layer B (known IDs) + Layer A (all processing) together prevent the cycle on the next boot.
