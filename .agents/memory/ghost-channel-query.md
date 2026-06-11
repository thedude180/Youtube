---
name: Ghost channel query pattern
description: Channel 52 (ghost, no token, lower id) gets picked before channel 53 (real) by any ORDER BY id query without token filter.
---

# Ghost Channel Query Pattern

## The Rule
Any DB query for `platform='youtube'` without an `accessToken IS NOT NULL` filter will return channel 52 (ghost `google_api_demo_reviewer`) before channel 53 (real ET Gaming 274) because 52 < 53.

## Why
Channel 52 was created by a demo user and has no OAuth token. It has a lower primary key id. Any `.limit(1)` query without a token filter picks it first. ShortsPrepPipeline was querying `getEncodedClipsWithoutReadyPayload` using channel 52's userId (`google_api_demo_reviewer`), which returned 0 encoded clips (that user has none) → pipeline found nothing to prep.

## How to Apply
- All channel lookups must filter to channels with a valid token: `.find(c => c.accessToken)` in JS, or `isNotNull(accessToken)` in Drizzle WHERE clause.
- Check any new code that does `channels.where(eq(platform,'youtube')).limit(1)` — add the token filter.
- Services already fixed: ShortsPrepPipeline (server/index.ts ghost-channel fix), shorts-publisher, long-form-publisher, stream-operator, stream-editor-auto-publisher, community-auto-manager (via ShortsPublisher no-token fix).
- Channel 52 exists in production as `ET Gaming 247` (google_api_demo_reviewer). Do NOT delete it manually — use Migration 038 pattern (DeleteChannel52 already ran).
