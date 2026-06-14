---
name: IO gate — strict serialization
description: How heavy I/O is serialized to one-at-a-time across downloads and uploads
---

## Rule
At most ONE heavy I/O operation runs at any instant system-wide: either one vault yt-dlp download OR one YouTube multipart upload — never both.

## Implementation
`server/lib/io-gate.ts` — single-slot async Promise queue (FIFO). 90-min watchdog force-releases a stuck slot.

## Wired into
- `shorts-clip-publisher.ts` perpetual loop — `acquireIOSlot("shorts-publisher")` + `.finally(release)` wrapping `runShortsClipPublisher()`
- `long-form-clip-publisher.ts` perpetual loop — same pattern wrapping `runLongFormClipPublisher()`
- `perpetual-downloader.ts` `runCycle()` — `acquireIOSlot("perpetual-downloader")` + `try/finally` wrapping `processVaultDownloads()`

**Why:** Running a vault download and a YouTube upload simultaneously doubles RAM and bandwidth pressure; historically caused OOM crashes.

**How to apply:** Any new service doing heavy I/O (yt-dlp, FFmpeg, large HTTP upload) should acquire the slot before the operation and release in a finally block. The gate is FIFO so callers just wait their turn — no polling needed.
