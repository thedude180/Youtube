---
name: autopilot_queue content_type column
description: autopilot_queue has no bare content_type column; type filtering must use metadata JSONB accessor
---

## Rule
Any raw SQL query filtering autopilot_queue by content type MUST use `metadata->>'contentType'` (JSONB accessor), not a bare `content_type` column. The column does not exist on this table.

**Why:** Content type is stored in the `metadata` JSONB field as `metadata->>'contentType'`. No migration has ever added a top-level `content_type` column to `autopilot_queue`. Queries using `content_type` directly will throw `column "content_type" does not exist` and fail silently or crash the calling service.

**How to apply:**
- Raw SQL on autopilot_queue: `WHERE metadata->>'contentType' IN ('youtube_short', ...)`
- Drizzle ORM: `sql\`${autopilotQueue.metadata}->>'contentType'\`` (as in shorts-clip-publisher.ts)
- The `youtube_output_metrics` table DOES have a real `content_type` column — queries there are fine
- Migration 090 silently failed for this reason; its dead-zone logic never actually ran

**Confirmed bad pattern (what broke):**
```sql
-- WRONG — content_type does not exist on autopilot_queue
SELECT SUM(CASE WHEN content_type IN ('youtube_short','auto-clip',...) ...)
FROM autopilot_queue
```

**Correct pattern:**
```sql
-- RIGHT — use JSONB accessor
SELECT SUM(CASE WHEN metadata->>'contentType' IN ('youtube_short','auto-clip',...) ...)
FROM autopilot_queue
```
