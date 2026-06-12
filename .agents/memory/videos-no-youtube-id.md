---
name: videos table has no youtube_id column
description: The `videos` table is for uploaded/processed local video files and has no youtube_id column. YouTube video IDs are stored elsewhere.
---

## The Rule

**Never write `SELECT ... FROM videos WHERE youtube_id = $1`** — the `videos` table has no `youtube_id` column. That query will always throw "column does not exist".

## Where YouTube IDs Actually Live

| Location | Column | Purpose |
|---|---|---|
| `back_catalog_videos` | `youtube_video_id` | Imported back-catalog (source streams/VODs) |
| `content_vault_backups` | `youtube_id` | Downloaded vault files |
| `autopilot_queue.metadata` | `->>'sourceYoutubeId'` | JSONB field on queue items pointing to source video |
| `videos.metadata` | `->>'youtubeId'` | Uploaded video metadata (not the primary key) |

## videos Table Columns (production-confirmed)

`id, channel_id, title, original_filename, file_path, thumbnail_url, description, type, status, platform, metadata, scheduled_time, published_at, created_at`

No `youtube_id` column. YouTube IDs in `metadata` are buried under `metadata->>'youtubeId'` or `metadata->>'youtubeVideoId'`.

## How to Cancel autopilot_queue Items for a Known YouTube Video ID

```sql
UPDATE autopilot_queue
SET status = 'permanent_fail', ...
WHERE (metadata->>'sourceYoutubeId') = $1
  AND status IN ('scheduled', 'pending')
```

**Why:** Migration 058 originally used `WHERE source_video_id IN (SELECT id FROM videos WHERE youtube_id = $1)` which always threw "column does not exist" and prevented the migration from completing. The fix uses `metadata->>'sourceYoutubeId'` on the `autopilot_queue` row directly.
