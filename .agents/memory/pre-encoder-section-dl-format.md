---
name: Pre-encoder section-dl format fallback
description: yt-dlp --download-sections fails for many YouTube videos; vault-first FFmpeg-trim fallback and soft-fail behavior.
---

# Pre-encoder Section-DL Format Fallback

## The Rule
When the pre-encoder gets "Requested format is not available" from yt-dlp section download, it now uses a vault-first fallback path before hard-failing.

## Why
YouTube videos without DASH/fragmented format manifests can't be section-downloaded, but they CAN be full-downloaded and then FFmpeg-trimmed. The pre-encoder previously jumped straight to `preEncoderFailCount=3` (hard-fail), permanently blacklisting items. This blocked 15 scheduled clips from ever being encoded.

## How to Apply
- `server/services/pre-encoder.ts`: vault check runs before `downloadSection()` per item.
- If `contentVaultBackups` has `status='downloaded'` with a real `filePath`: call `trimRawFromFile()` and encode from that file (skip yt-dlp entirely).
- If vault `status='indexed'` (not yet downloaded): set `preEncoderFailCount = Math.max(prevCount, 1)` — soft-fail, retry on next 5-min cycle after vault downloads the full file.
- If vault `status='failed'` with failCount ≥ 3: skip completely (unresolvable).
- If no vault entry at all: hard-fail (set count=3) as before.
- Migration 039 (`migration:039:reset_hard_blacklisted_pre_encoder`) resets all `preEncoderHardFail=true` items to count=1 on first boot after this change.
- The old typecheck errors in pre-encoder.ts (lines 548/550 `item.channelId`) were fixed by restructuring to use `const musicChannelId = (meta.channelId as number | undefined) ?? 53` before the try block.
