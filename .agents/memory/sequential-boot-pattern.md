---
name: Sequential boot pattern
description: How the server/index.ts wave chain is structured for sequential AI-safe startup — absolute service start times from boot.
---

## Rule
Every wave that contains AI-intensive services must use `wave(async () => { await sleep(N * 60_000); ... })` to ensure services start at known absolute times from boot. Do NOT use small staggeredBoot gaps (1.5–5s) for AI-touching services — they fire nearly simultaneously even with gaps.

**Why:** staggeredBoot() is non-blocking (schedules setTimeouts and returns immediately). All waves register their setTimeouts within ~5s of boot. Services with 2s stagger gaps all fire within seconds of each other, saturating the 4-slot background AI semaphore and causing: viral-optimizer hourly cap hit at T+2.5min, RepurposeEngine budget exhausted at T+5min, AI queue full 4/4 at T+6min, publisher loops idle-spinning indefinitely.

**How to apply:** When adding a new AI-intensive service to any wave, check the wave's current `await sleep(N)` value and ensure the new service fires ≥2min after the previous AI-heavy service. Use `setTimeout(() => import(...).then(...), M * 60_000)` for fine-grained absolute timing within a wave.

## Current boot timeline (server/index.ts)

| Time from boot | What starts |
|---|---|
| T+0s | Waves 0–3: DB, auth, security, event-gate, live-detection (no AI) |
| T+5s | Wave 4: content-consistency-agent, stream-agent, connection-guardian, stripe-init |
| T+10min | Wave 4 deferred: copyright-guardian |
| T+8min | Wave 6: analytics-intelligence, compliance-legal, platform-policy, ai-team-scheduler, live agents (12 items, 1.5s gaps = T+8:00–8:17) |
| T+15min | Wave 7: continuity-engine, log-retention, vod-shorts-loop (first run T+23min), vod-continuous, api-cache, cleanup, resilience-watchdog (8 items, 3s gaps = T+15:00–15:21) |
| T+15min | Wave 8 immediate: weekly-report, daily-digest, pipeline-self-heal, trust-governance, initBackCatalogRunner, initPublishingWatchdog, initChannelIntelligenceEngine, initQuotaResetCron, initPreSeo, initPreEncoder, initYouTubeAIOrchestrator, startQuotaAwarePublisher, initPipelineTracer, resurrection-engine(+35s), channel-hygiene(+60s), stuck-scheduler(+90s), vault-clip(+90s), perpetual-downloader(+120s) |
| T+20min | Wave 8: shorts-repurpose-engine (+5min from Wave 8 start) |
| T+22min | Wave 8: automation-engine (+7min); Wave 5: community-audience-engine |
| T+24min | Wave 8: trend-rider-engine (+9min); Wave 5: creator-education-engine |
| T+25min | Wave 8: marketer-engine (+10min); Wave 9: performance-feedback, smart-edit, game-detection, self-improvement, growth-flywheel (5 items, 5s gaps) |
| T+26min | Wave 5: brand-partnerships-engine |
| T+28min | Wave 8: playlist-manager (+13min) |
| T+25min | Wave 10: shorts-clip-publisher, long-form-clip-publisher, youtube-output-scheduler FIRST (then 9 more engines, 5s gaps → T+25:55) |
| T+30min | Wave 10.5: 18 meta-intelligence engines (4s gaps → T+30:00–31:08) |
| T+31min | Wave 8: vod-optimizer-engine (+16min) |
| T+35min | Wave 11: self-healing, webhook pipeline, health brain |
| T+40min | Hourly publisher sweep (separate setTimeout in Wave 8, unchanged) |

## Adding new services
- **No AI, critical (upload pipeline)**: add to Wave 8 immediate section or before
- **Light AI, runs every few hours**: add to Wave 9 staggeredBoot or Wave 8 with setTimeout(5-10 * 60_000)
- **Heavy AI, background optimization**: add to Wave 10.5 staggeredBoot (T+30min)
- **Any new wave fn touching AI**: must be `wave(async () => { await sleep(...); ... })`
