# CreatorOS — Full Codebase Context

Generated: 2026-03-04T13:40:42.270Z

---

This file is a self-contained snapshot of the CreatorOS codebase, assembled for analysis by ChatGPT or similar AI tools. It includes the project overview, a directory tree, the most important source files (truncated at 150 lines each), and the full audit report.

---

# 1. Project Overview

# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is an AI-powered creator platform designed for content creators, offering multi-platform content management, live streaming automation, AI-driven growth coaching, and comprehensive business operations across major social media platforms. The platform aims for near-100% automated growth and revenue maximization, providing adaptive AI coaching.

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic — cinematic, data-dense, $10M SaaS feel
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 25 platforms)
- "5-year-old simple" UI with big buttons and color-coded status
- Exception-only notifications (AI handles everything silently unless issue arises)
- Advanced Mode toggle (off by default) - reveals extra controls, detailed metrics, manual overrides
- Floating AI chat accessible from any page (+ mobile FAB)
- No manual trigger buttons - everything runs autonomously in background
- Full mobile god-mode optimization: scrollable tabs, responsive gauges, cinematic bottom nav, touch targets

## System Architecture
CreatorOS is a full-stack application built with an Express.js backend and a React/Vite frontend, utilizing a multi-tenant PostgreSQL database.

### Frontend
- **Technology**: React + Vite, Tailwind CSS, shadcn/ui.
- **UI/UX Decisions**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, content calendar, floating AI chat, command palette, keyboard shortcuts, rich empty states. Mobile optimization includes cinematic bottom navigation and responsive components.
- **Features**: Internationalization (12 languages with RTL support), robust SEO features (dynamic hreflang, Open Graph, JSON-LD), accessibility standards (ARIA roles, keyboard navigation), and performance optimizations (lazy loading, code splitting, PWA support).
- **Core Visuals**: Custom keyframes and power classes create a "God Tier" aesthetic with animated glows, neon effects, data-grid backgrounds, and holographic elements.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, rate limiting, CSRF protection, API key authentication, subscription tier enforcement, and an AI Security Sentinel for prompt injection detection and replay attack prevention.
- **AI Integration**: Primarily uses OpenAI (gpt-5-mini) for AI functionalities.
- **Core Engines**:
    - **Growth Journey System**: AI-generated daily actions and personalized roadmaps.
    - **Competitive Edge Suite**: VOD optimizer, Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics, A/B Testing, Sponsorship Marketplace.
    - **Content Loop Engine**: Manages content generation and scheduling.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior & AI Humanizer Engines**: Simulate realistic posting.
    - **Autonomy Controller**: Orchestrates all AI engines.
    - **AI Team Engine**: Three autonomous AI agents (Editor, Moderator, Analyst) collaborate via a shared task queue.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling.
    - **Content Automation System**: Includes a YouTube Upload Watcher and Historical Content Sweep for automated content ingestion and repurposing.
    - **Content Consistency Agent**: Analyzes upload cadence, fills calendar gaps, and audits videos for SEO issues.
    - **Auto Agent Orchestrator**: Manages background agent sessions for all paid users.
    - **Team Ops God Mode**: Orchestrates a 41-agent company via `server/team-orchestration.ts`.
    - **God-Level Business AI Exec Team**: 9 autonomous AI executives for business functions.
    - **Legal & Tax AI Agent Command Center**: 18 autonomous AI agents for legal and tax auditing.
- **System Hardening**: Centralized OpenAI client with telemetry, retry logic, caching, structured logging, Zod validation, DB-backed cron locks, external service health checks, and a self-healing core.
- **Platform Policy Tracker**: Monitors 7 platforms for policy changes and enforces compliance.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access.

### Notification & Feedback Systems
- **Notification Engine**: Exception-only model, alerting only on critical issues.
- **AI Feedback Processor**: Analyzes user feedback.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Gmail API**: Email notifications.
- **i18next**: Internationalization.
- **PostgreSQL**: Primary database.
- **YouTube Data API v3**: YouTube integration.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.

## Recent Features
- **Stream Agent** (`server/services/stream-agent.ts`): Autonomous hands-free streaming assistant. Polls every 2 min for live status. When live: responds to chat in creator's voice, moderates, generates AI engagement prompts every 10 min. When stream ends: triggers full VOD clip+distribute pipeline. Keeps 20-entry action log. API: GET/POST `/api/stream-agent/status|start|stop`. Bootstrapped at T+45s. UI panel (`data-testid="stream-agent-card"`) at top of `/stream` page.
- **Empire Mode** (`client/src/pages/Autopilot.tsx`): Single "Activate Empire" button (`data-testid="button-activate-empire"`) that chains autopilot + sweep + consistency agent. ON state shows 4 green checkmark status lines. `data-testid="empire-switch"`.
- **Content Automation System**: Upload Watcher (30min polls, new uploads → clips + repurpose), Historical Content Sweep (3-phase: sync→clip→repurpose), Content Consistency Agent (every 4h, audits SEO + fills calendar gaps). Routes under `/api/content-automation/*`.
- **Content Intelligence Hub** (`client/src/pages/Autopilot.tsx`): Always-visible panel (`data-testid="content-intelligence-hub"`) on /autopilot showing Upload Watcher status card and Historical Sweep card with Start/Cancel buttons. Data pulled from `/api/content-automation/status`, auto-refreshes every 15s.
- **Agent Event Bus** (`server/services/agent-events.ts`): In-process pub/sub system for cross-agent coordination. Fires events: `stream.started`, `stream.ended`, `upload.detected`, `sweep.completed`, `empire.activated`. Handlers: stream.ended → triggers upload scan + consistency check. Stream agent wired into orchestrator `initializeUserSystems`. Coordination wired at T+5s on startup.
- **Copyright Guardian Agent** (`server/services/copyright-guardian.ts`): Autonomous AI agent scanning all videos every 6h for copyright/trademark risks via keyword scan + GPT-4o-mini. Auto-rewrites titles/descriptions/tags for low/medium risk. Flags high/critical for manual review with suggested rewrites. Rate-limited to 1 video/12s. Bootstrapped at T+50s. Routes under `/api/copyright-guardian/*`. UI panel (`data-testid="copyright-guardian-panel"`) on /autopilot with status stats, issue list, Apply Fix / Dismiss actions, and Run Deep Scan button. Wired into agent orchestrator `startUserAgentSession`.
- **Production DB Pool Hardening** (2026-03-03): Fixed critical pool exhaustion causing cascading failures across all background engines. (1) ConnectionGuardian fast-recovery interval raised from 30s → 5 min; main cycle raised from 3 min → 15 min — was the #1 DB pressure source with 12+ sequential full-table-scan queries per cycle. (2) AI team `processTaskQueue` now detects transient DB errors (connection timeout/ECONNRESET/query timeout) and re-queues tasks to `status="queued"` instead of marking `status="failed"`, with inner try-catch so the recovery write can't fail loudly. (3) `runTeamCycle` now cleans up tasks stuck in `status="in_progress"` for >10 minutes at the start of each cycle. (4) `daily-content-engine.ts` `generateBatchPlan` now uses `response_format: { type: "json_object" }` to force valid JSON from the model, eliminating the unescaped-quote parse crash (e.g. `"BATTLEFIELD 6"` inside a description string). (5) DualPipeline `registerCleanup("dualPipelineProcess")` interval raised from 60s → 5 min — was firing 3 sequential DB queries every 60s (processWaitingVodPipelines, processQueuedPipelines, autoSpawnMissingVodPipelines), now runs every 5 min reducing DB load by 80%.
- **Content Automation Bug Fixes** (2026-03-04): (1) Auto-thumbnail engine: catch block now detects "cannot be found" / 404 errors and permanently marks the video `metadata.autoThumbnailFailed = "video_not_found_on_youtube"` so deleted YouTube videos stop retrying forever. `regenerateThumbnailsForUnderperformers` also now skips videos with `autoThumbnailFailed` set, preventing the underperformer refresh logic from overriding the permanent mark. (2) `server/youtube.ts`: added `export` to `getAuthenticatedClient` — was private, causing `TypeError: n is not a function` in playlist-manager. (3) `server/playlist-manager.ts` `organizePlaylistsForUser`: added `PLAYLIST_BATCH_LIMIT = 20` cap on both outer (channel) and inner (video) loops plus `.limit(40)` on the DB query — eliminates DB read timeouts from unbounded full-table scans. (4) `server/auto-fix-engine.ts`: added "creditsdepleted", "credits to fulfill", and "does not have any credits" to CONFIG_PATTERNS so X API 402 billing errors are immediately classified as `config_missing` (permanent fail) instead of "unknown" (which was causing 3x retry loop).
- **DB Pool + Cron Pressure Fixes** (2026-03-04 session 2): Addresses cascading DB connection timeout failures visible in production logs. (1) `server/db.ts`: pool `max` raised 15 → 20 connections; `idleTimeoutMillis` reduced 30s → 20s (faster slot reclamation); `connectionTimeoutMillis` reduced 15s → 10s (fail-fast for withRetry); statement/query timeouts reduced 30s → 25s. (2) `server/automation-engine.ts`: ScheduledPosts cron changed from `"* * * * *"` (every 1 min) to `"*/2 * * * *"` (every 2 min) — was acquiring a DB cron-lock every 60s; halving frequency reduces DB lock contention by 50%. Lock TTL raised from 55s to 90s to match new interval. (3) `server/auto-thumbnail-engine.ts`: image generation switched from `"1024x1024"` to `"512x512"` — eliminates `"Media is too large. Limit: 2097152"` errors at the source (512x512 PNG is ~4× smaller). Added pre-flight check: if generated buffer still exceeds 2 MB, permanently marks video `metadata.autoThumbnailFailed = "image_too_large"` without uploading. Extended catch block to also detect `"Media is too large"` / `"2097152"` / `"media_too_large"` errors from YouTube API and apply the same permanent-fail mark — stops infinite 30-second retry loop for oversized thumbnails.

---

# 2. Directory Tree

```
shared/
├── models
│   ├── auth.ts
│   └── chat.ts
├── platform-specs.ts
├── routes.ts
└── schema.ts

server/
├── lib
│   ├── ai-attack-shield.ts
│   ├── audit.ts
│   ├── cache.ts
│   ├── cron-lock.ts
│   ├── errors.ts
│   ├── logger.ts
│   ├── lru-cache.ts
│   ├── openai.ts
│   ├── platform-formatter.ts
│   ├── retry.ts
│   ├── security-hardening.ts
│   ├── threat-learning-engine.ts
│   └── youtube-live-check.ts
├── replit_integrations
│   ├── audio
│   │   ├── client.ts
│   │   ├── index.ts
│   │   └── routes.ts
│   ├── auth
│   │   ├── index.ts
│   │   ├── replitAuth.ts
│   │   ├── routes.ts
│   │   └── storage.ts
│   ├── batch
│   │   ├── index.ts
│   │   └── utils.ts
│   ├── chat
│   │   ├── index.ts
│   │   ├── routes.ts
│   │   └── storage.ts
│   └── image
│       ├── client.ts
│       ├── index.ts
│       └── routes.ts
├── routes
│   ├── admin.ts
│   ├── ai.ts
│   ├── automation.ts
│   ├── autonomy.ts
│   ├── autopilot.ts
│   ├── business-agents.ts
│   ├── clips.ts
│   ├── competitive-edge.ts
│   ├── content-automation.ts
│   ├── content-verification.ts
│   ├── content.ts
│   ├── copyright-guardian.ts
│   ├── dual-pipeline.ts
│   ├── events.ts
│   ├── feedback.ts
│   ├── fortress.ts
│   ├── growth-tracking.ts
│   ├── helpers.ts
│   ├── legal-tax.ts
│   ├── loops.ts
│   ├── marketing.ts
│   ├── money.ts
│   ├── multistream.ts
│   ├── nexus.ts
│   ├── pillars.ts
│   ├── pipeline.ts
│   ├── platform.ts
│   ├── retention-beats.ts
│   ├── security-dashboard.ts
│   ├── settings.ts
│   ├── stream-agent.ts
│   ├── stream.ts
│   ├── sync.ts
│   ├── team-ops.ts
│   ├── test-auth.ts
│   ├── ultimate.ts
│   ├── upgrades.ts
│   └── world-best.ts
├── services
│   ├── agent-events.ts
│   ├── agent-orchestrator.ts
│   ├── ai-hardening.ts
│   ├── ai-model-router.ts
│   ├── ai-queue.ts
│   ├── ai-security-sentinel.ts
│   ├── analytics-intelligence-engine.ts
│   ├── api-retry.ts
│   ├── auto-reconnect.ts
│   ├── auto-settings-optimizer.ts
│   ├── auto-tier-optimizer.ts
│   ├── automation-hardening.ts
│   ├── autopilot-monitor.ts
│   ├── brand-partnerships-engine.ts
│   ├── circuit-breaker.ts
│   ├── cleanup-coordinator.ts
│   ├── community-audience-engine.ts
│   ├── compliance-legal-engine.ts
│   ├── connection-guardian.ts
│   ├── content-consistency-agent.ts
│   ├── content-quality-engine.ts
│   ├── content-sweep.ts
│   ├── copilot-engine.ts
│   ├── copyright-check.ts
│   ├── copyright-guardian.ts
│   ├── creator-education-engine.ts
│   ├── creator-memory-engine.ts
│   ├── dashboard-intelligence-engine.ts
│   ├── email-templates.ts
│   ├── engine-heartbeat.ts
│   ├── external-health.ts
│   ├── feedback-processor.ts
│   ├── gmail-client.ts
│   ├── keyword-learning-engine.ts
│   ├── live-detection.ts
│   ├── map-cleanup.ts
│   ├── monetization-check.ts
│   ├── multistream-engine.ts
│   ├── notification-system.ts
│   ├── notifications.ts
│   ├── performance-optimizer.ts
│   ├── platform-policy-tracker.ts
│   ├── post-login-init.ts
│   ├── push-scheduler.ts
│   ├── reconnect-email.ts
│   ├── resilience-core.ts
│   ├── security-fortress.ts
│   ├── stream-agent.ts
│   ├── stripe-hardening.ts
│   ├── tiktok-clip-autopublisher.ts
│   ├── traffic-growth-engine.ts
│   ├── usage-metering.ts
│   ├── webhook-verify.ts
│   ├── youtube-push-backlog.ts
│   ├── youtube-quota-tracker.ts
│   ├── youtube-upload-watcher.ts
│   └── youtube-vod-watcher.ts
├── ab-testing-engine.ts
├── ai-engine.ts
├── ai-humanizer-engine.ts
├── ai-team-engine.ts
├── algorithm-monitor.ts
├── audience-mindmap-engine.ts
├── auto-fix-engine.ts
├── auto-thumbnail-engine.ts
├── automation-engine.ts
├── autonomy-controller.ts
├── autopilot-engine.ts
├── backlog-engine.ts
├── backlog-manager.ts
├── business-agent-engine.ts
├── business-intel-engine.ts
├── clip-video-processor.ts
├── cluster.cjs
├── collab-engine.ts
├── compounding-engine.ts
├── content-loop.ts
├── content-variation-engine.ts
├── content-verification-engine.ts
├── copilot-engine.ts
├── creator-dna-engine.ts
├── creator-intelligence.ts
├── customer-database-engine.ts
├── daily-content-engine.ts
├── db.ts
├── empire-launcher.ts
├── google-auth.ts
├── growth-programs-engine.ts
├── human-behavior-engine.ts
├── idea-empire-engine.ts
├── index.ts
├── learning-engine.ts
├── legal-tax-agent-engine.ts
├── live-chat-engine.ts
├── localization-engine.ts
├── marketer-engine.ts
├── merch-engine.ts
├── migration-engine.ts
├── monetization-engine.ts
├── oauth-config.ts
├── optimization-engine.ts
├── pipeline-healing-engine.ts
├── pipeline-router.ts
├── platform-auth.ts
├── platform-data-fetcher.ts
├── platform-publisher.ts
├── platform-sync-engine.ts
├── playlist-manager.ts
├── prestart.cjs
├── priority-orchestrator.ts
├── publish-verifier.ts
├── repurpose-engine.ts
├── retention-beats-engine.ts
├── revenue-maximizer.ts
├── revenue-sync-engine.ts
├── routes.ts
├── security-engine.ts
├── self-healing-core.ts
├── shadowban-detector.ts
├── shorts-pipeline-engine.ts
├── smart-scheduler.ts
├── static.ts
├── stealth-guardrails.ts
├── storage.ts
├── streaming-loop-engine.ts
├── stripe-seed.ts
├── stripeClient.ts
├── team-orchestration.ts
├── tiktok-publisher.ts
├── token-refresh.ts
├── trend-predictor.ts
├── trend-rider-engine.ts
├── vite.ts
├── vod-continuous-engine.ts
├── vod-optimizer-engine.ts
├── vod-shorts-loop-engine.ts
├── webhookHandlers.ts
├── weekly-report-engine.ts
├── youtube-learning-engine.ts
├── youtube-manager.ts
└── youtube.ts

client/src/
├── assets
│   └── images
├── components
│   ├── ui
│   │   ├── accordion.tsx
│   │   ├── alert-dialog.tsx
│   │   ├── alert.tsx
│   │   ├── aspect-ratio.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── breadcrumb.tsx
│   │   ├── button.tsx
│   │   ├── calendar.tsx
│   │   ├── card.tsx
│   │   ├── carousel.tsx
│   │   ├── chart.tsx
│   │   ├── checkbox.tsx
│   │   ├── collapsible.tsx
│   │   ├── command.tsx
│   │   ├── context-menu.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── hover-card.tsx
│   │   ├── input-otp.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── menubar.tsx
│   │   ├── navigation-menu.tsx
│   │   ├── pagination.tsx
│   │   ├── popover.tsx
│   │   ├── progress.tsx
│   │   ├── radio-group.tsx
│   │   ├── resizable.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── switch.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   ├── toaster.tsx
│   │   ├── toggle-group.tsx
│   │   ├── toggle.tsx
│   │   └── tooltip.tsx
│   ├── AnimatedCounter.tsx
│   ├── AuthForm.tsx
│   ├── BackToTop.tsx
│   ├── Breadcrumbs.tsx
│   ├── ChannelGrowthTimeline.tsx
│   ├── CollapsibleToolbox.tsx
│   ├── CommandPalette.tsx
│   ├── CookieConsent.tsx
│   ├── CopyButton.tsx
│   ├── CountdownTimer.tsx
│   ├── DateRangePicker.tsx
│   ├── EmptyState.tsx
│   ├── error-boundary.tsx
│   ├── FeedbackWidget.tsx
│   ├── FloatingChat.tsx
│   ├── GettingStartedChecklist.tsx
│   ├── GlobalProgress.tsx
│   ├── GrowthImpactChart.tsx
│   ├── GrowthTrajectoryPredictor.tsx
│   ├── HealthRibbon.tsx
│   ├── KeyboardShortcuts.tsx
│   ├── KeyboardShortcutsCard.tsx
│   ├── LiveChatPanel.tsx
│   ├── LiveStatusBar.tsx
│   ├── LiveStreamBanner.tsx
│   ├── LiveTimestamp.tsx
│   ├── MetricCard.tsx
│   ├── NextBestAction.tsx
│   ├── NotificationBell.tsx
│   ├── OfflineIndicator.tsx
│   ├── PageSkeleton.tsx
│   ├── PageState.tsx
│   ├── PipelineCommandCenter.tsx
│   ├── PipelineStatus.tsx
│   ├── PlatformHealthCards.tsx
│   ├── PlatformIcon.tsx
│   ├── PriorityCommandCenter.tsx
│   ├── PulseOrb.tsx
│   ├── QueryErrorReset.tsx
│   ├── RevealSection.tsx
│   ├── ScrollProgress.tsx
│   ├── SectionErrorBoundary.tsx
│   ├── SessionTracker.tsx
│   ├── Sidebar.tsx
│   ├── Sparkline.tsx
│   ├── StatusBadge.tsx
│   ├── StealthRing.tsx
│   ├── TrendIndicator.tsx
│   ├── UpgradeGate.tsx
│   ├── VirtualList.tsx
│   └── WhatsNext.tsx
├── hooks
│   ├── use-adaptive.tsx
│   ├── use-advanced-mode.tsx
│   ├── use-advisor.ts
│   ├── use-audit-logs.ts
│   ├── use-auth.ts
│   ├── use-channels.ts
│   ├── use-compliance.ts
│   ├── use-creator-mode.tsx
│   ├── use-dashboard.ts
│   ├── use-device.ts
│   ├── use-focus-mode.tsx
│   ├── use-insights.ts
│   ├── use-jobs.ts
│   ├── use-lazy-visible.ts
│   ├── use-login-sync.ts
│   ├── use-mobile.tsx
│   ├── use-offline.ts
│   ├── use-page-title.ts
│   ├── use-smart-polling.ts
│   ├── use-sse.ts
│   ├── use-strategies.ts
│   ├── use-tab-memory.ts
│   ├── use-theme.tsx
│   ├── use-toast.ts
│   ├── use-undo-toast.tsx
│   ├── use-user-profile.ts
│   └── use-videos.ts
├── i18n
│   ├── locales
│   │   ├── ar.ts
│   │   ├── de.ts
│   │   ├── en.ts
│   │   ├── es.ts
│   │   ├── fr.ts
│   │   ├── hi.ts
│   │   ├── it.ts
│   │   ├── ja.ts
│   │   ├── ko.ts
│   │   ├── pt.ts
│   │   ├── ru.ts
│   │   └── zh.ts
│   └── index.ts
├── lib
│   ├── ai-cache.ts
│   ├── auth-utils.ts
│   ├── lazyRetry.ts
│   ├── locale-format.ts
│   ├── native-app.ts
│   ├── offline-engine.ts
│   ├── offline-store.ts
│   ├── prefetch.ts
│   ├── queryClient.ts
│   ├── safe-data.ts
│   ├── utils.ts
│   └── web-vitals.ts
├── pages
│   ├── autopilot
│   │   └── PipelineTab.tsx
│   ├── content
│   │   ├── AIToolsTab.tsx
│   │   ├── CalendarTab.tsx
│   │   ├── ChannelsTab.tsx
│   │   ├── ClipsTab.tsx
│   │   ├── LocalizationTab.tsx
│   │   ├── PipelineTab.tsx
│   │   ├── RetentionBeatsTab.tsx
│   │   ├── SEOTab.tsx
│   │   └── UpdatedVideosTab.tsx
│   ├── dashboard
│   │   ├── ActivityFeedSection.tsx
│   │   ├── AdvancedMetrics.tsx
│   │   ├── AIActionCenter.tsx
│   │   ├── AIInsightsSection.tsx
│   │   ├── AIProofOfWork.tsx
│   │   ├── AIToolSuites.tsx
│   │   ├── AnomalyDetector.tsx
│   │   ├── AudienceGrowthSection.tsx
│   │   ├── AudienceStealthSection.tsx
│   │   ├── BackgroundJobsDashboard.tsx
│   │   ├── BusinessHealthSection.tsx
│   │   ├── CompetitorBenchmark.tsx
│   │   ├── ContentPredictions.tsx
│   │   ├── ContentVerification.tsx
│   │   ├── CrossPlatformAnalytics.tsx
│   │   ├── DailyBriefingSection.tsx
│   │   ├── DashboardSkeleton.tsx
│   │   ├── HealthMonitor.tsx
│   │   ├── MetricsGrid.tsx
│   │   ├── MissionControl.tsx
│   │   └── PerformanceVitals.tsx
│   ├── money
│   │   ├── ExpensesTab.tsx
│   │   ├── GoalsTab.tsx
│   │   ├── MoneyAIToolSuites.tsx
│   │   ├── OpportunitiesTab.tsx
│   │   ├── RevenueTab.tsx
│   │   ├── SponsorsTab.tsx
│   │   ├── TaxTab.tsx
│   │   └── VenturesTab.tsx
│   ├── settings
│   │   ├── AccessibilityTab.tsx
│   │   ├── AdminTabs.tsx
│   │   ├── AutomationTab.tsx
│   │   ├── BrandTab.tsx
│   │   ├── CollabsTab.tsx
│   │   ├── CompetitorsTab.tsx
│   │   ├── GrowthProgramsTab.tsx
│   │   ├── LearningTab.tsx
│   │   ├── LegalTab.tsx
│   │   ├── SecurityTab.tsx
│   │   └── WellnessTab.tsx
│   ├── stream
│   │   └── StreamUpgradesSection.tsx
│   ├── AccessCodes.tsx
│   ├── AICommand.tsx
│   ├── AIFactory.tsx
│   ├── AIMatrix.tsx
│   ├── Autopilot.tsx
│   ├── BusinessAgents.tsx
│   ├── CalendarPage.tsx
│   ├── Changelog.tsx
│   ├── Community.tsx
│   ├── CompetitiveEdge.tsx
│   ├── Content.tsx
│   ├── ContentCommand.tsx
│   ├── CreatorHub.tsx
│   ├── Dashboard.tsx
│   ├── EmpireLauncher.tsx
│   ├── GrowthJourney.tsx
│   ├── Heartbeat.tsx
│   ├── Hub.tsx
│   ├── IntelligenceHub.tsx
│   ├── Landing.tsx
│   ├── Legal.tsx
│   ├── LegalTaxTeam.tsx
│   ├── MissionControl.tsx
│   ├── Money.tsx
│   ├── not-found.tsx
│   ├── Notifications.tsx
│   ├── Onboarding.tsx
│   ├── Pipeline.tsx
│   ├── Pricing.tsx
│   ├── ScriptStudio.tsx
│   ├── Settings.tsx
│   ├── Simulator.tsx
│   ├── StealthAutonomy.tsx
│   ├── StreamCenter.tsx
│   ├── StreamLoop.tsx
│   ├── SystemStatus.tsx
│   ├── TeamOps.tsx
│   ├── ViralPredictor.tsx
│   ├── VodShortsLoop.tsx
│   ├── WarRoom.tsx
│   └── Workspace.tsx
├── App.tsx
├── index.css
└── main.tsx

```

---

# 3. Key Source Files

## FILE: shared/schema.ts
> 5577 lines total — showing first 150 lines

```typescript

import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export { sessions, users, SUBSCRIPTION_TIERS, USER_ROLES, TIER_PLATFORM_LIMITS, TIER_LABELS, ADMIN_EMAIL } from "./models/auth";
export type { User, UpsertUser, SubscriptionTier, UserRole } from "./models/auth";
export { conversations, messages } from "./models/chat";

export const PLATFORMS = [
  "youtube",
  "twitch",
  "kick",
  "tiktok",
  "x",
  "discord",
  "rumble",
] as const;
export type Platform = typeof PLATFORMS[number];

export type ContentCapability = "video" | "short_video" | "text" | "image" | "live_stream";

export const PLATFORM_CAPABILITIES: Record<Platform, {
  supports: ContentCapability[];
  primaryType: "video" | "text";
  maxVideoLength: number | null;
  description: string;
}> = {
  youtube: {
    supports: ["video", "short_video", "live_stream", "text", "image"],
    primaryType: "video",
    maxVideoLength: null,
    description: "Full video uploads, Shorts, live streaming, community posts",
  },
  twitch: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
  kick: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
  tiktok: {
    supports: ["short_video", "text", "image"],
    primaryType: "video",
    maxVideoLength: 600,
    description: "Short-form video clips (up to 10 min), optimized for vertical 9:16",
  },
  x: {
    supports: ["text", "image"],
    primaryType: "text",
    maxVideoLength: null,
    description: "Text posts, stream announcements, traffic driving, throwback content",
  },
  discord: {
    supports: ["text", "image"],
    primaryType: "text",
    maxVideoLength: null,
    description: "Community announcements, text posts via webhooks",
  },
  rumble: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
};

export const VIDEO_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("video") || PLATFORM_CAPABILITIES[p].supports.includes("short_video"));
export const TEXT_ONLY_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].primaryType === "text" && !PLATFORM_CAPABILITIES[p].supports.includes("video") && !PLATFORM_CAPABILITIES[p].supports.includes("short_video"));
export const LIVE_STREAM_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("live_stream"));

export const PLATFORM_INFO: Record<Platform, {
  label: string;
  color: string;
  maxResolution: string;
  maxBitrate: string;
  rtmpUrlTemplate: string;
  category: "streaming" | "social" | "monetization" | "content" | "messaging";
  connectionType: "oauth" | "manual" | "api_key";
  signupUrl: string;
  strategyDescription: string;
  setupSteps: string[];
}> = {
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    maxResolution: "4K (2160p)",
    maxBitrate: "51 Mbps",
    rtmpUrlTemplate: "rtmp://a.rtmp.youtube.com/live2",
    category: "streaming",
    connectionType: "oauth",
    signupUrl: "https://www.youtube.com/create_channel",
    strategyDescription: "The world's largest video platform. Essential for long-form content, SEO-driven discovery, and ad revenue. Your home base for building a sustainable creator business.",
    setupSteps: ["Click 'Connect YouTube' to sign in with your Google account", "Grant CreatorOS permission to manage your videos", "Your channel will sync automatically"],
  },
  twitch: {
    label: "Twitch",
    color: "#9146FF",
    maxResolution: "1080p60",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://live.twitch.tv/app",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://www.twitch.tv/signup",
    strategyDescription: "Live streaming only — the go-to platform for live gaming content. Used exclusively for broadcasting, stream detection, and live audience engagement. No content posting or cross-platform distribution.",
    setupSteps: ["Go to your Twitch Dashboard", "Click Settings then Stream", "Copy your Primary Stream Key", "Paste it below"],
  },
  kick: {
    label: "Kick",
    color: "#53FC18",
    maxResolution: "1080p60",
    maxBitrate: "8 Mbps",
    rtmpUrlTemplate: "rtmp://fa723fc1b171.global-contribute.live-video.net/app",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://kick.com/signup",
    strategyDescription: "Fast-growing streaming platform with creator-friendly 95/5 revenue split. Great for diversifying your live streaming income while reaching new audiences.",
    setupSteps: ["Go to kick.com/dashboard/settings/stream", "Find your Stream Key under Stream Settings", "Copy the Stream Key", "Paste it below"],
  },
  tiktok: {
    label: "TikTok",
    color: "#000000",
    maxResolution: "1080p30",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://push.tiktok.com/live",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://www.tiktok.com/signup",
    strategyDescription: "The fastest way to go viral. Post short-form vertical videos (up to 10 minutes) to reach Gen Z audiences with massive organic reach and rapid growth potential.",
    setupSteps: ["Open TikTok on your phone and go to your profile", "Tap the + button to create content", "Record or upload your short-form video (up to 10 min)", "Add captions, effects, and hashtags", "Post and track engagement"],
  },
  x: {
    label: "X (Twitter)",
    color: "#000000",
    maxResolution: "N/A",
    maxBitrate: "N/A",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://x.com/i/flow/signup",
    strategyDescription: "Real-time conversation platform. X posts drive traffic to your videos and streams with live announcements, highlight clips, and throwback content that surfaces older videos for new audiences.",
    setupSteps: ["Connect your X account via Settings", "CreatorOS will auto-post stream announcements, clips, and traffic-driving posts", "Older content gets resurfaced automatically to keep your catalog active"],
  },
  discord: {

... [truncated at 150 lines — full file is 5577 lines] ...
```

## FILE: server/db.ts
```typescript

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                      // raised from 15 — Replit Postgres handles ~25 total; 20 gives headroom for burst
  idleTimeoutMillis: 20_000,    // release idle connections faster to free up pool slots
  connectionTimeoutMillis: 10_000, // 10 s — fail fast so withRetry can try a fresh connection sooner
  allowExitOnIdle: true,
  statement_timeout: 25_000,
  query_timeout: 25_000,
});

let poolErrorCount = 0;
pool.on("error", (err) => {
  poolErrorCount++;
  const msg = err?.message || String(err);
  if (msg.includes("Connection terminated") || msg.includes("ECONNRESET")) {
    if (poolErrorCount % 10 === 1) {
      console.warn(`[DB Pool] Transient error (count=${poolErrorCount}): ${msg.substring(0, 100)}`);
    }
  } else {
    console.error(`[DB Pool] Unexpected client error (count=${poolErrorCount}):`, msg.substring(0, 150));
  }
});

pool.on("connect", () => {
  poolErrorCount = Math.max(0, poolErrorCount - 1);
});

export const db = drizzle(pool, { schema });

const TRANSIENT_DB_ERRORS = [
  "Connection terminated",
  "Authentication timed out",
  "connection refused",
  "too many clients",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "Client has encountered a connection error",
  "terminating connection",
  "Connection lost",
  "socket hang up",
  "remaining connection slots are reserved",
  "server closed the connection unexpectedly",
  "could not connect to server",
  "the database system is starting up",
  "the database system is shutting down",
  "timeout exceeded when trying to connect",
  "Query read timeout",
  "query_timeout",
  "statement_timeout",
  "connection timeout",
];

function isTransientDbError(msg: string): boolean {
  return TRANSIENT_DB_ERRORS.some(p => msg.includes(p));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label = "db-op",
  maxRetries = 3,
): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (!isTransientDbError(msg) || attempt === maxRetries) break;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.warn(`[DB Retry] ${label} attempt ${attempt}/${maxRetries} failed (${msg.substring(0, 80)}), retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

```

## FILE: server/index.ts
> 1082 lines total — showing first 150 lines

```typescript
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { seedStripeProducts } from "./stripe-seed";
import { pool } from "./db";
import { initSecurityEngine, evaluateThreat, trackSecurityEvent } from "./security-engine";
import { startAutopilotMonitor, stopAutopilotMonitor } from "./services/autopilot-monitor";
import { startConnectionGuardian, stopConnectionGuardian } from "./services/connection-guardian";
import { startAutonomyController, stopAutonomyController } from "./autonomy-controller";
import { storage } from "./storage";
import { checkAccountLock, getAdaptiveRateLimit, updateIpReputation, analyzeRequestPattern, seedRetentionPolicies } from "./services/security-fortress";
import { processDeadLetterQueue } from "./services/automation-hardening";
import { processAllDigests } from "./services/notification-system";
import { startSentinel, stopSentinel } from "./services/ai-security-sentinel";
import { stopCommunityAudienceEngine } from "./services/community-audience-engine";
import { stopComplianceLegalEngine } from "./services/compliance-legal-engine";
import { stopCreatorEducationEngine } from "./services/creator-education-engine";
import { stopAnalyticsIntelligenceEngine } from "./services/analytics-intelligence-engine";
import { stopBrandPartnershipsEngine } from "./services/brand-partnerships-engine";
import { stopFortressCleanup } from "./services/security-fortress";
import { stopPushCleanup } from "./services/push-scheduler";
import { stopAutoFixCleanup } from "./services/autopilot-monitor";
import { stopSettingsCleanup } from "./services/auto-settings-optimizer";
import { stopTierCleanup } from "./services/auto-tier-optimizer";
import { createLogger } from "./lib/logger";
import { AppError, createErrorResponse } from "./lib/errors";
import { closeAllConnections } from "./routes/events";
import { requestSizeLimiter, slowRequestDetector, validateContentType, anomalyDetector, inputSanitizer, idempotencyGuard, getSlowRequests, payloadIntegrityCheck, honeypotTrapMiddleware, responseSecurityScrubber } from "./lib/security-hardening";
import { methodOverrideBlock, badUserAgentBlock, promptInjectionGuard, replayAttackGuard, highEntropyPayloadBlock, timingAttackMitigation, serverTimingHeaderStrip, tokenFloodGuard, perEndpointRateLimit, requestIdEnforcement, hostHeaderValidation, sensitiveRouteHardening, requestRecorder, adaptiveLearningGuard } from "./lib/ai-attack-shield";
import { startThreatLearningEngine, stopThreatLearningEngine, getLearningStats } from "./lib/threat-learning-engine";
import { startResilienceWatchdog, stopResilienceWatchdog, getResilienceStatus, registerMap, registerCache, checkDbPool } from "./services/resilience-core";
import { startCleanupCoordinator, stopCleanupCoordinator } from "./services/cleanup-coordinator";
import { writeFileSync as _writeFileSync, appendFileSync as _appendFileSync } from "fs";

const logger = createLogger("express");

// Debug interceptor — captures the exact call site and error message that triggers process.exit
// so we can identify and fix the crash root cause.
{
  const _realExit = process.exit.bind(process);
  (process as any).exit = (code?: number) => {
    const stack = new Error(`process.exit(${code}) intercepted`).stack || "";
    // Write to stdout so Replit workflow runner captures it (stderr is not shown in logs)
    process.stdout.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    process.stderr.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    _realExit(code as any);
  };
}

// Write crash info to a persistent file so it survives workflow restarts
const CRASH_LOG = "/tmp/server-crash.log";
_writeFileSync(CRASH_LOG, `[STARTUP] PID=${process.pid} started at ${new Date().toISOString()}\n`, { flag: "a" });

// Catch unhandled rejections / exceptions that may bypass the exit interceptor
process.on("uncaughtException", (err) => {
  const msg = `\n[UNCAUGHT-EXCEPTION] PID=${process.pid} ${err.message}\n${err.stack}\n`;
  process.stdout.write(msg);
  _appendFileSync(CRASH_LOG, msg);
});
process.on("unhandledRejection", (reason) => {
  const msg = `\n[UNHANDLED-REJECTION] PID=${process.pid} ${String(reason)}\n`;
  process.stdout.write(msg);
  _appendFileSync(CRASH_LOG, msg);
});

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// ── ULTRA-EARLY HEALTH CHECK — registered BEFORE any app.use() middleware ────
// hostHeaderValidation, badUserAgentBlock, honeypotTrap, and all other global
// security middleware run via app.use() and would otherwise intercept these
// routes. By registering them here (Express evaluates routes in order of
// registration), health check requests are served in microseconds before any
// filtering can cause a non-200 response.
app.get("/healthz", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("OK");
});

// Early SPA route — also registered before all middleware so Replit's health
// probe (which may hit /) gets a 200 immediately even before OIDC/DB is ready.
if (process.env.NODE_ENV === "production") {
  const path = require("path") as typeof import("path");
  const _distPublic = path.resolve(__dirname, "..", "dist", "public");
  const _indexHtml = path.join(_distPublic, "index.html");
  // Pre-read into memory so responses are in-memory (no disk I/O per request)
  let _indexHtmlContent: string | null = null;
  try {
    _indexHtmlContent = require("fs").readFileSync(_indexHtml, "utf-8");
  } catch { /* file may not exist yet — handled below */ }
  app.get("/", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (_indexHtmlContent) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(_indexHtmlContent);
    } else {
      // Fallback: try disk, or just return 200 to keep health check green
      res.sendFile(_indexHtml, (err) => {
        if (err && !res.headersSent) res.status(200).send("OK");
      });
    }
  });
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    await runMigrations({ databaseUrl, schema: 'stripe' } as any);

    const stripeSync = await getStripeSync();

    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      const webhookBaseUrl = `https://${replitDomain}`;
      try {
        await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
      } catch (webhookError) {
        logger.warn('Webhook setup skipped (non-critical)', { error: String(webhookError) });
      }
    } else {
      logger.warn('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    stripeSync.syncBackfill()
      .then(() => {
        return seedStripeProducts();
      })
      .catch((err: any) => logger.error('Error syncing Stripe data', { error: String(err) }));
  } catch (error) {

... [truncated at 150 lines — full file is 1082 lines] ...
```

## FILE: server/storage.ts
> 1606 lines total — showing first 150 lines

```typescript
import { db } from "./db";
import {
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  streamDestinations, streams, thumbnails, aiAgentActivities, automationRules,
  scheduleItems, revenueRecords, revenueSyncLog, communityPosts,
  notifications, abTests, analyticsSnapshots, learningInsights, contentIdeas,
  creatorMemory, contentClips, videoVersions, streamChatMessages, chatTopics,
  sponsorshipDeals, platformHealth, collaborationLeads, audienceSegments,
  complianceRules, userFeedback, subscriptions, accessCodes,
  users, ADMIN_EMAIL,
  type User, type AccessCode, type InsertAccessCode,
  expenseRecords, businessVentures, businessGoals, taxEstimates, brandAssets, wellnessChecks, competitorTracks,
  aiResults, cronJobs, aiChains, webhookEvents, knowledgeMilestones,
  type Channel, type InsertChannel, type UpdateChannelRequest,
  type Video, type InsertVideo, type UpdateVideoRequest,
  type Job, type InsertJob,
  type AuditLog, type InsertAuditLog,
  type ContentInsight, type InsertContentInsight,
  type ComplianceRecord, type InsertComplianceRecord,
  type GrowthStrategy, type InsertGrowthStrategy,
  type StreamDestination, type InsertStreamDestination,
  type Stream, type InsertStream,
  type Thumbnail, type InsertThumbnail,
  type AgentActivity, type InsertAgentActivity,
  type AutomationRule, type InsertAutomationRule,
  type ScheduleItem, type InsertScheduleItem,
  type RevenueRecord, type InsertRevenueRecord,
  type RevenueSyncLog, type InsertRevenueSyncLog,
  type CommunityPost, type InsertCommunityPost,
  type StatsResponse,
  type Notification, type InsertNotification,
  type AbTest, type InsertAbTest,
  type AnalyticsSnapshot, type InsertAnalyticsSnapshot,
  type LearningInsight, type InsertLearningInsight,
  type ContentIdea, type InsertContentIdea,
  type CreatorMemoryEntry, type InsertCreatorMemory,
  type ContentClip, type InsertContentClip,
  type VideoVersion, type InsertVideoVersion,
  type StreamChatMessage, type InsertStreamChatMessage,
  type ChatTopic, type InsertChatTopic,
  type SponsorshipDeal, type InsertSponsorshipDeal,
  type PlatformHealthRecord, type InsertPlatformHealth,
  type CollaborationLead, type InsertCollaborationLead,
  type AudienceSegment, type InsertAudienceSegment,
  type ComplianceRule, type InsertComplianceRule,
  type UserFeedbackEntry, type InsertUserFeedback,
  type Subscription, type InsertSubscription,
  type ExpenseRecord, type InsertExpenseRecord,
  type BusinessVenture, type InsertBusinessVenture,
  type BusinessDetails, type InsertBusinessDetails, businessDetails,
  type BusinessGoal, type InsertBusinessGoal,
  type TaxEstimate, type InsertTaxEstimate,
  type BrandAsset, type InsertBrandAsset,
  type WellnessCheck, type InsertWellnessCheck,
  type CompetitorTrack, type InsertCompetitorTrack,
  type KnowledgeMilestone, type InsertKnowledgeMilestone,
  type AiResult, type InsertAiResult,
  type CronJob, type InsertCronJob,
  type AiChain, type InsertAiChain,
  type WebhookEvent, type InsertWebhookEvent,
  localizationRecommendations,
  type LocalizationRecommendation, type InsertLocalizationRecommendation,
  notificationPreferences,
  apiKeys, contentPredictions, videoUpdateHistory,
  teamMembers, teamActivityLog,
  type ApiKey, type InsertApiKey,
  type ContentPrediction, type InsertContentPrediction,
  type VideoUpdateHistory, type InsertVideoUpdateHistory,
  type TeamMember, type InsertTeamMember,
  type TeamActivityLogEntry, type InsertTeamActivityLog,
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  getChannels(): Promise<Channel[]>;
  getChannelsByUser(userId: string): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel>;
  deleteChannel(id: number): Promise<void>;

  getVideos(): Promise<Video[]>;
  getVideosByUser(userId: string): Promise<Video[]>;
  getVideo(id: number): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video>;
  deleteVideo(id: number): Promise<void>;
  getVideosByChannel(channelId: number): Promise<Video[]>;

  getJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJobStatus(id: number, status: string, result?: any): Promise<Job>;
  updateJobProgress(id: number, progress: number): Promise<Job>;
  updateJobPayload(id: number, payload: any): Promise<Job>;

  getAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsByUser(userId: string, action?: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getVideoUpdateHistory(userId: string, youtubeVideoId?: string): Promise<VideoUpdateHistory[]>;
  createVideoUpdateHistory(entry: InsertVideoUpdateHistory): Promise<VideoUpdateHistory>;

  getContentInsights(channelId?: number): Promise<ContentInsight[]>;
  createContentInsight(insight: InsertContentInsight): Promise<ContentInsight>;
  clearInsights(channelId?: number): Promise<void>;

  getComplianceRecords(channelId?: number): Promise<ComplianceRecord[]>;
  createComplianceRecord(record: InsertComplianceRecord): Promise<ComplianceRecord>;
  clearComplianceRecords(channelId?: number): Promise<void>;

  getGrowthStrategies(channelId?: number): Promise<GrowthStrategy[]>;
  createGrowthStrategy(strategy: InsertGrowthStrategy): Promise<GrowthStrategy>;
  updateGrowthStrategy(id: number, updates: Partial<InsertGrowthStrategy>): Promise<GrowthStrategy>;

  getStreamDestinations(userId?: string): Promise<StreamDestination[]>;
  getStreamDestination(id: number): Promise<StreamDestination | undefined>;
  createStreamDestination(dest: InsertStreamDestination): Promise<StreamDestination>;
  updateStreamDestination(id: number, updates: Partial<InsertStreamDestination>): Promise<StreamDestination>;
  deleteStreamDestination(id: number): Promise<void>;

  getStreams(userId?: string): Promise<Stream[]>;
  getStream(id: number): Promise<Stream | undefined>;
  createStream(stream: InsertStream): Promise<Stream>;
  updateStream(id: number, updates: Partial<InsertStream>): Promise<Stream>;

  getThumbnails(videoId?: number, streamId?: number): Promise<Thumbnail[]>;
  createThumbnail(thumb: InsertThumbnail): Promise<Thumbnail>;

  getAgentActivities(userId?: string, agentId?: string, limit?: number): Promise<AgentActivity[]>;
  createAgentActivity(activity: InsertAgentActivity): Promise<AgentActivity>;

  getAutomationRules(userId?: string): Promise<AutomationRule[]>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: number, updates: Partial<InsertAutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: number): Promise<void>;

  getScheduleItems(userId?: string, from?: Date, to?: Date): Promise<ScheduleItem[]>;
  createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem>;
  updateScheduleItem(id: number, updates: Partial<InsertScheduleItem>): Promise<ScheduleItem>;
  deleteScheduleItem(id: number): Promise<void>;

  getRevenueRecords(userId?: string, platform?: string): Promise<RevenueRecord[]>;
  createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord>;
  getRevenueSummary(userId?: string): Promise<{ total: number; byPlatform: Record<string, number>; bySource: Record<string, number> }>;
  getRevenueByExternalId(userId: string, externalId: string): Promise<RevenueRecord | null>;
  getRevenueSyncLogs(userId: string): Promise<RevenueSyncLog[]>;
  createRevenueSyncLog(log: InsertRevenueSyncLog): Promise<RevenueSyncLog>;

  getCommunityPosts(userId?: string, platform?: string): Promise<CommunityPost[]>;
  createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost>;
  updateCommunityPost(id: number, updates: Partial<InsertCommunityPost>): Promise<CommunityPost>;

... [truncated at 150 lines — full file is 1606 lines] ...
```

## FILE: server/routes/helpers.ts
> 371 lines total — showing first 150 lines

```typescript
import type { Request, Response, NextFunction } from "express";
import { ADMIN_EMAIL } from "@shared/schema";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

interface UserClaims {
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface AuthenticatedUser {
  claims: UserClaims;
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export function parseNumericId(raw: string, res: Response, label = "ID"): number | null {
  const id = Number(raw);
  if (isNaN(id) || !Number.isFinite(id)) {
    res.status(400).json({ error: `Invalid ${label}` });
    return null;
  }
  return id;
}

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function getUserId(req: Request): string {
  return ((req.user as AuthenticatedUser)?.claims?.sub ?? "") as string;
}

export function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid session — please log in again" });
    return null;
  }
  return userId;
}

export function requireAdmin(req: Request, res: Response): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const email = (req.user as AuthenticatedUser)?.claims?.email;
  if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

export function getUserEmail(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.email;
}

export function getUserFirstName(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.first_name;
}

export function getUserLastName(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.last_name;
}

export const TIER_RANK: Record<string, number> = {
  free: 0,
  youtube: 1,
  starter: 2,
  pro: 3,
  ultimate: 4,
};

export async function getUserTier(userId: string): Promise<string> {
  const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.tier || "free";
}

export async function requireTier(
  req: Request,
  res: Response,
  minTier: string,
  featureName: string,
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const userTier = await getUserTier(userId);
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[minTier] ?? 0;

  if (userRank < requiredRank) {
    const tierLabel = minTier.charAt(0).toUpperCase() + minTier.slice(1);
    res.status(403).json({
      error: "upgrade_required",
      message: `${featureName} requires the ${tierLabel} plan or higher. Please upgrade to unlock this feature.`,
      currentTier: userTier,
      requiredTier: minTier,
      upgradeUrl: "/pricing",
    });
    return null;
  }

  return userId;
}

const SERVER_START_TIME = Date.now();
const STARTUP_GRACE_MS = 60_000; // 1 minute grace period after startup

function isInStartupGrace(): boolean {
  return Date.now() - SERVER_START_TIME < STARTUP_GRACE_MS;
}

const endpointLimits = new Map<string, Map<string, { count: number; resetAt: number }>>();

/**
 * Rate limiter middleware for endpoint protection.
 * 
 * NOTE: This uses in-memory rate limiting which resets on server restart.
 * To mitigate restart-based bypass attacks, stricter limits are applied 
 * during the 60-second startup grace period:
 * - During grace period: limit is reduced by half (e.g., 5 instead of 10)
 * - After grace period: normal limit applies (e.g., 10)
 * 
 * This prevents rapid-fire abuse immediately after a server restart without
 * requiring database schema changes.
 */
export function rateLimitEndpoint(maxRequests: number = 10, windowMs: number = 60000) {
  return (req: any, res: any, next: any) => {
    const key = `${req.path}`;
    const userId = (req as any).user?.claims?.sub || req.ip;
    if (!endpointLimits.has(key)) endpointLimits.set(key, new Map());
    const users = endpointLimits.get(key)!;
    const now = Date.now();
    const entry = users.get(userId);
    
    // Apply stricter limit during startup grace period
    const effectiveLimit = isInStartupGrace() ? Math.ceil(maxRequests / 2) : maxRequests;
    
    if (!entry || now > entry.resetAt) {
      users.set(userId, { count: 1, resetAt: now + windowMs });

... [truncated at 150 lines — full file is 371 lines] ...
```

## FILE: server/routes/content.ts
> 1837 lines total — showing first 150 lines

```typescript
import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc, inArray, isNotNull, gte, sql, lt } from "drizzle-orm";
import { api } from "@shared/routes";
import {
  contentPipeline, contentIdeas, videos, scheduleItems,
  autopilotQueue, communityPosts, uploadQueue, streams,
  reengagementCampaigns, streamPipelines, channels,
  keywordInsights, trafficStrategies, videoUpdateHistory,
  contentInsights, complianceRecords, growthStrategies,
} from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, requireTier, parseNumericId, asyncHandler, rateLimitEndpoint, getUserEmail, getUserFirstName, getUserLastName } from "./helpers";
import { cached } from "../lib/cache";
import { sendSSEEvent } from "./events";
import {
  generateVideoMetadata,
  analyzeChannelGrowth,
  runComplianceCheck,
  generateContentInsights,
  getContentStrategyAdvice,
  generateThumbnailPrompt,
} from "../ai-engine";
import {
  startBacklogProcessing,
  getBacklogStatus,
  pauseBacklog,
  resumeBacklog,
  getVideosWithScores,
  bulkOptimize,
  autoScheduleOptimizedContent,
  getStaleVideos,
} from "../backlog-engine";

export function registerContentRoutes(app: Express) {
  const contentRateLimit = rateLimitEndpoint(10, 60000);
  const writeRateLimit = rateLimitEndpoint(30, 60000);
  const deleteRateLimit = rateLimitEndpoint(10, 60000);
  const bulkRateLimit = rateLimitEndpoint(5, 60000);

  app.post("/api/auto-connect-youtube", writeRateLimit, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const email = getUserEmail(req);
    const firstName = getUserFirstName(req);
    const lastName = getUserLastName(req);

    try {
      const existingChannels = await storage.getChannelsByUser(userId);
      const hasYoutube = existingChannels.some(c => c.platform === "youtube");
      if (hasYoutube) {
        return res.json({ connected: true, existing: true, channel: existingChannels.find(c => c.platform === "youtube") });
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "My Channel";
      const channelHandle = email?.split("@")[0] || userId.slice(0, 12);

      const channel = await storage.createChannel({
        userId,
        platform: "youtube",
        channelName: `${displayName}'s YouTube`,
        channelId: `UC_${channelHandle}`,
        settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
      });

      await storage.createAuditLog({
        userId,
        action: "youtube_auto_connected",
        target: channel.channelName,
        details: { platform: "youtube", autoConnected: true },
        riskLevel: "low",
      });

      res.json({ connected: true, existing: false, channel });
    } catch (err: any) {
      console.error("Auto-connect YouTube error:", err);
      res.status(500).json({ message: "Failed to auto-connect YouTube" });
    }
  }));

  app.get(api.channels.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const userChannels = await storage.getChannelsByUser(userId);
    const enriched = userChannels.map(ch => {
      const pd = (ch.platformData || {}) as any;
      return {
        ...ch,
        connectionStatus: pd._connectionStatus || "healthy",
        lastVerifiedAt: pd._lastVerifiedAt || null,
      };
    });
    res.json(enriched);
  }));

  app.post(api.channels.create.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.channels.create.input.parse(req.body);
      const channel = await storage.createChannel({ ...input, userId });
      await storage.createAuditLog({
        userId,
        action: "channel_created",
        target: channel.channelName,
        details: { platform: channel.platform, channelId: channel.channelId },
        riskLevel: "low",
      });
      res.status(201).json(channel);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating channel:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.channels.update.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    try {
      const existing = await storage.getChannel(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ error: "Not found" });
      const channelUpdateSchema = z.object({}).passthrough();
      const parsed = channelUpdateSchema.parse(req.body);
      const channel = await storage.updateChannel(id, parsed);
      await storage.createAuditLog({
        userId,
        action: "channel_updated",
        target: channel.channelName,
        details: parsed,
        riskLevel: "low",
      });
      res.json(channel);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      console.error("Error updating channel:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.delete("/api/channels/:id", deleteRateLimit, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;

... [truncated at 150 lines — full file is 1837 lines] ...
```

## FILE: server/routes/stream.ts
> 771 lines total — showing first 150 lines

```typescript
import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { requireAuth, requireTier, parseNumericId, asyncHandler } from "./helpers";
import { cached } from "../lib/cache";
import {
  generateStreamSeo,
  postStreamOptimize,
  generateThumbnailPrompt,
  runComplianceCheck,
} from "../ai-engine";
import { pivotToStream, resumeFromStream } from "../backlog-engine";
import { processGoLiveAnnouncements, processPostStreamHighlights } from "../autopilot-engine";
import { processLiveChatMessage, getLiveChatFeed, getLiveChatStats, getMultiStreamStatus } from "../live-chat-engine";
import { createPipelineForStream } from "./pipeline";
import { pauseForLive, resumeAfterStream } from "../backlog-manager";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { sendSSEEvent } from "./events";
import { getQuotaStatus } from "../services/youtube-quota-tracker";
import { fireAgentEvent } from "../services/agent-events";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

async function checkYouTubeLiveViaWatchPage(channelId: string): Promise<boolean> {
  const result = await detectYouTubeLiveFromChannel(channelId);
  return result.isLive;
}


export function registerStreamRoutes(app: Express) {
  app.get(api.streamDestinations.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const destinations = await storage.getStreamDestinations(userId);
    res.json(destinations);
  }));

  app.post(api.streamDestinations.create.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      platform: z.string().min(1),
      label: z.string().min(1),
      rtmpUrl: z.string().default(""),
      streamKey: z.string().optional(),
      enabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const dest = await storage.createStreamDestination(input);
      await storage.createAuditLog({
        userId,
        action: "stream_destination_created",
        target: dest.label,
        details: { platform: dest.platform },
        riskLevel: "low",
      });
      res.status(201).json(dest);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating stream destination:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.streamDestinations.update.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const existing = await storage.getStreamDestination(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Destination not found" });
    }
    const schema = z.object({
      platform: z.string().min(1).optional(),
      label: z.string().min(1).optional(),
      rtmpUrl: z.string().optional(),
      streamKey: z.string().optional(),
      enabled: z.boolean().optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const dest = await storage.updateStreamDestination(id, parsed.data);
    res.json(dest);
  }));

  app.delete(api.streamDestinations.delete.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const existing = await storage.getStreamDestination(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Destination not found" });
    }
    await storage.deleteStreamDestination(id);
    res.sendStatus(204);
  }));

  app.get(api.streams.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamList = await storage.getStreams(userId);
    res.json(streamList);
  }));

  app.get(api.streams.get.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });
    res.json(stream);
  }));

  app.post(api.streams.create.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      platforms: z.array(z.string()).optional(),
      scheduledFor: z.string().optional().nullable(),
      status: z.string().optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const stream = await storage.createStream(input);
      await storage.createAuditLog({
        userId,
        action: "stream_created",
        target: stream.title,
        details: { platforms: stream.platforms },
        riskLevel: "low",
      });

... [truncated at 150 lines — full file is 771 lines] ...
```

## FILE: server/routes/money.ts
> 1277 lines total — showing first 150 lines

```typescript
import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { expenseRecords, businessVentures, businessGoals, taxEstimates, sponsorshipDeals, affiliateLinks } from "@shared/schema";
import { requireAuth, requireTier, parseNumericId, asyncHandler, getUserEmail } from "./helpers";
import { cached } from "../lib/cache";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { generateTaxStrategy, generateExpenseAnalysis } from "../ai-engine";
import {
  suggestAdBreaks, generateRevenueForecast, trackFanFunnel,
  getFanFunnelData, calculateSponsorRates, getSponsorRates,
  trackEquipmentRoi, getEquipmentRoi, generateInvoice, getInvoices, analyzeDeal,
} from "../monetization-engine";
import { syncAllRevenue, syncPlatformRevenue } from "../revenue-sync-engine";

export function registerMoneyRoutes(app: Express) {
  app.post("/api/stripe/create-checkout-session", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const checkoutSchema = z.object({ priceId: z.string().min(1) });
      const { priceId } = checkoutSchema.parse(req.body);

      const user = await storage.getUser(userId);
      let customerId = user?.stripeCustomerId;

      if (!customerId) {
        const email = getUserEmail(req);
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        client_reference_id: userId,
        success_url: `${baseUrl}/settings?tab=subscription&status=success`,
        cancel_url: `${baseUrl}/pricing?status=cancelled`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      console.error("Stripe checkout error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stripe/verify-session", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stripe = await getUncachableStripeClient();
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.json({ tier: user?.tier || "free", synced: false, reason: "no_customer" });
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 5,
        expand: ["data.items.data.price.product"],
      });

      const validStatuses = ["active", "trialing", "past_due"];
      const activeSub = subscriptions.data.find(s => validStatuses.includes(s.status));
      if (!activeSub) {
        return res.json({ tier: user?.tier || "free", synced: false, reason: "no_active_subscription" });
      }

      let detectedTier: string | null = null;
      for (const item of activeSub.items.data) {
        const product = typeof item.price?.product === "object" ? item.price.product as any : null;
        if (product?.metadata?.tier) {
          detectedTier = product.metadata.tier;
          break;
        }
      }

      if (detectedTier && detectedTier !== user.tier) {
        const role = detectedTier === "free" ? "user" : "premium";
        await storage.updateUserRole(userId, role, detectedTier);
        await storage.updateUserStripeInfo(userId, {
          stripeSubscriptionId: activeSub.id,
          tier: detectedTier,
        });

        try {
          const { initializeUserSystems } = await import("../services/post-login-init");
          initializeUserSystems(userId).catch((e: any) => console.error("[VerifySession] Post-login init error:", e?.message));
        } catch (e: any) { console.error("[VerifySession] Post-login import error:", e?.message); }

        return res.json({ tier: detectedTier, synced: true, previousTier: user.tier });
      }

      res.json({ tier: user.tier || "free", synced: false, reason: "already_synced" });
    } catch (err: any) {
      console.error("[VerifySession] Error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stripe/customer-portal", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No subscription found" });

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/stripe/products-with-prices", asyncHandler(async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id as product_id, p.name as product_name, p.description as product_description,
               p.metadata as product_metadata, p.active as product_active,
               pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        const r = row as any;
        if (!productsMap.has(r.product_id)) {
          productsMap.set(r.product_id, {
            id: r.product_id,

... [truncated at 150 lines — full file is 1277 lines] ...
```

## FILE: server/routes/upgrades.ts
> 2365 lines total — showing first 150 lines

```typescript
import type { Express } from "express";
import { z } from "zod";
import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and } from "drizzle-orm";
import { requireAuth, asyncHandler, parseNumericId } from "./helpers";
import { cached } from "../lib/cache";
import {
  contentIdeas, auditLogs, videos, channels, notifications,
  scheduleItems, communityPosts,
} from "@shared/schema";

const openai = getOpenAIClient();

// ═══════════════════════════════════════════════════════
// INPUT VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════

// Common string validation patterns
const titleSchema = z.string().max(500, "Title must be 500 characters or less").optional();
const descriptionSchema = z.string().max(2000, "Description must be 2000 characters or less").optional();
const textSchema = z.string().max(1000, "Text must be 1000 characters or less").optional();
const platformSchema = z.string().max(100, "Platform must be 100 characters or less").optional();

// AI endpoint schemas
const thumbnailAbTestSchema = z.object({
  thumbnailA: z.string().max(500).optional(),
  thumbnailB: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  targetAudience: z.string().max(300).optional(),
}).passthrough();

const titleOptimizerSchema = z.object({
  title: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
}).passthrough();

const descriptionOptimizerSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  platform: z.string().max(100).optional(),
  niche: z.string().max(200).optional(),
}).passthrough();

const hookGeneratorSchema = z.object({
  title: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  targetEmotion: z.string().max(200).optional(),
  videoLength: z.string().max(100).optional(),
}).passthrough();

const trendDetectorSchema = z.object({
  niche: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
}).passthrough();

const audiencePsychographicsSchema = z.object({
  niche: z.string().max(200).optional(),
  channelDescription: z.string().max(1000).optional(),
  topVideos: z.array(z.any()).optional(),
}).passthrough();

const competitorDeepDiveSchema = z.object({
  competitorName: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
}).passthrough();

const uploadTimeOptimizerSchema = z.object({
  niche: z.string().max(200).optional(),
  targetRegions: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
}).passthrough();

const hashtagStrategySchema = z.object({
  title: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  platforms: z.array(z.string()).optional(),
}).passthrough();

const viralPredictorSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  niche: z.string().max(200).optional(),
  thumbnailDescription: z.string().max(500).optional(),
}).passthrough();

const retentionAnalyzerSchema = z.object({
  title: z.string().max(500).optional(),
  videoLength: z.string().max(100).optional(),
  niche: z.string().max(200).optional(),
  currentRetention: z.string().max(100).optional(),
}).passthrough();

const communityPostGeneratorSchema = z.object({
  topic: z.string().max(500).optional(),
  type: z.string().max(100).optional(),
  platform: z.string().max(100).optional(),
  tone: z.string().max(100).optional(),
}).passthrough();

const collabPitchWriterSchema = z.object({
  targetCreator: z.string().max(500).optional(),
  yourNiche: z.string().max(200).optional(),
  yourSubscribers: z.string().max(100).optional(),
  collabIdea: z.string().max(1000).optional(),
}).passthrough();

const nicheAnalyzerSchema = z.object({
  niche: z.string().max(200),
  subNiche: z.string().max(200).optional(),
}).passthrough();

const captionGeneratorSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  platform: z.string().max(100).optional(),
  style: z.string().max(200).optional(),
}).passthrough();

const endScreenOptimizerSchema = z.object({
  videoTitle: z.string().max(500).optional(),
  niche: z.string().max(200).optional(),
  existingEndScreen: z.string().max(1000).optional(),
}).passthrough();

const shortsStrategySchema = z.object({
  niche: z.string().max(200).optional(),
  existingContent: z.string().max(1000).optional(),
  platforms: z.array(z.string()).optional(),
}).passthrough();

async function callAI(systemPrompt: string, userPrompt: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (error: any) {
    console.error("[Upgrades] AI call or parse failed:", error);
    return {};
  }

... [truncated at 150 lines — full file is 2365 lines] ...
```

## FILE: server/routes/fortress.ts
> 598 lines total — showing first 150 lines

```typescript
import { Express, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler, requireAuth, requireAdmin, getUserTier, parseNumericId } from "./helpers";

import {
  recordLoginAttempt, checkAccountLock, lockAccount, unlockAccount,
  getIpReputation, updateIpReputation, getTopSuspiciousIps,
  analyzeRequestPattern, getBehaviorScore,
  registerThreatPattern, matchThreatPatterns,
  validateSession, invalidateAllSessions, getActiveSessions,
  createSecurityAlert, getUnacknowledgedAlerts, acknowledgeAlert,
  getAdaptiveRateLimit,
  runDataRetention, seedRetentionPolicies,
  exportUserData, deleteUserData, anonymizeUserData
} from "../services/security-fortress";

import {
  getCacheStats, clearUserCache,
  getUserAiCosts, getSystemAiCosts, getUserDailyUsage, isUserOverAiLimit,
  getModelHealth,
  scoreAiOutput, getAverageQuality,
  getBatchStatus
} from "../services/ai-hardening";

import {
  getDeadLetterItems, retryDeadLetterItem, resolveDeadLetterItem, getDeadLetterStats,
  getJobsByPriority,
  checkBackpressure, getInflightStats,
  getRateLimitStatus, canMakeApiCall,
  getPipelineAnalytics, getBottlenecks
} from "../services/automation-hardening";

import {
  getNotificationPreferences, updateNotificationPreferences,
  markAllRead, markCategoryRead, getUnreadCounts, deleteOldNotifications,
  generateDigest
} from "../services/notification-system";

import {
  checkDunningStatus, getSubscriptionStatus, pauseSubscription, resumeSubscription,
  validatePromoCode, applyPromoCode, getActivePromoCodes,
  startFreeTrial, checkTrialStatus, hasUsedTrial,
  getInvoiceHistory, getNextBillingDate, getLifetimeSpend,
  getAnnualPricing
} from "../services/stripe-hardening";

import { db } from "../db";
import { featureFlags } from "@shared/schema";
import { eq } from "drizzle-orm";

import {
  runFullSecurityScan, getLatestScanResult, getScanHistory, getSentinelStatus
} from "../services/ai-security-sentinel";

export function registerFortressRoutes(app: Express) {

  // ==================== SECURITY FORTRESS ROUTES ====================

  app.get("/api/fortress/ip-reputation", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const ips = await getTopSuspiciousIps(100);
    res.json(ips);
  }));

  app.get("/api/fortress/ip-reputation/:ip", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ip = req.params.ip as string;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ip || !ipRegex.test(ip)) return res.status(400).json({ error: "Invalid IP address format" });
    const reputation = await getIpReputation(ip);
    res.json(reputation);
  }));

  app.get("/api/fortress/behavior/:ip", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ip = req.params.ip as string;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ip || !ipRegex.test(ip)) return res.status(400).json({ error: "Invalid IP address format" });
    const score = getBehaviorScore(ip);
    res.json({ ip, score });
  }));

  app.get("/api/fortress/sessions", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sessions = getActiveSessions(userId);
    res.json(sessions);
  }));

  app.post("/api/fortress/sessions/invalidate", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sessionSchema = z.object({ reason: z.string().max(500).optional().default("User requested") });
    const parsed = sessionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const reason = parsed.data.reason;
    await invalidateAllSessions(userId, reason);
    res.json({ success: true, message: "All sessions invalidated" });
  }));

  app.get("/api/fortress/alerts", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const alerts = await getUnacknowledgedAlerts(userId);
    res.json(alerts);
  }));

  app.post("/api/fortress/alerts/:id/acknowledge", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const success = await acknowledgeAlert(id, userId);
    res.json({ success });
  }));

  app.get("/api/fortress/lockouts", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = await checkAccountLock(userId);
    res.json(status);
  }));

  app.post("/api/fortress/lockouts/unlock/:identifier", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const identifier = String(req.params.identifier).trim();
    if (!identifier || identifier.length > 200) return res.status(400).json({ error: "Invalid identifier" });
    await unlockAccount(identifier);
    res.json({ success: true, message: `Account ${identifier} unlocked` });
  }));

  app.get("/api/fortress/threat-patterns", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const matches = await matchThreatPatterns("");
    res.json(matches);
  }));

  app.post("/api/fortress/threat-patterns", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["sql_injection", "xss", "brute_force", "path_traversal", "bot", "credential_stuffing", "rate_abuse", "custom"]),
      signature: z.string().min(1).max(500),
      severity: z.enum(["low", "medium", "high", "critical"]),

... [truncated at 150 lines — full file is 598 lines] ...
```

## FILE: server/lib/security-hardening.ts
> 375 lines total — showing first 150 lines

```typescript
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createLogger } from "./logger";
import { registerMap } from "../services/resilience-core";

const logger = createLogger("security-hardening");

const SENSITIVE_FIELDS = new Set([
  "password", "secret", "token", "accessToken", "refreshToken",
  "streamKey", "apiKey", "privateKey", "clientSecret",
  "oauthToken", "sessionSecret", "webhookSecret",
  "stripeKey", "discordToken", "twitchToken",
  "kickToken", "tiktokToken", "xToken", "googleToken",
]);

export function sanitizeResponseData(data: any, depth = 0): any {
  if (depth > 8 || data === null || data === undefined) return data;
  if (typeof data === "string") return data;
  if (typeof data === "number" || typeof data === "boolean") return data;
  if (data instanceof Date) return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponseData(item, depth + 1));
  }

  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey) ||
          lowerKey.includes("password") || lowerKey.includes("secret") ||
          lowerKey.includes("_key") || lowerKey.includes("_token") ||
          lowerKey.endsWith("streamkey") || lowerKey.endsWith("apikey")) {
        if (typeof value === "string" && value.length > 0) {
          result[key] = value.substring(0, 4) + "****";
        } else {
          result[key] = "[REDACTED]";
        }
      } else {
        result[key] = sanitizeResponseData(value, depth + 1);
      }
    }
    return result;
  }
  return data;
}

export function requestSizeLimiter(maxBodyKeys: number = 100) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      const keys = Object.keys(req.body);
      if (keys.length > maxBodyKeys) {
        return res.status(400).json({
          error: "payload_too_complex",
          message: "Request body has too many fields.",
        });
      }
    }
    next();
  };
}

export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    next();
  };
}

const slowQueryLog: Array<{ path: string; method: string; duration: number; timestamp: number }> = [];

export function slowRequestDetector(thresholdMs: number = 5000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (duration > thresholdMs && req.path.startsWith("/api")) {
        logger.warn(`Slow request detected: ${req.method} ${req.path} took ${duration}ms`, {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
        });
        slowQueryLog.push({ path: req.path, method: req.method, duration, timestamp: Date.now() });
        if (slowQueryLog.length > 100) slowQueryLog.splice(0, slowQueryLog.length - 100);
      }
    });
    next();
  };
}

export function getSlowRequests() {
  return [...slowQueryLog];
}

export function validateContentType() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const contentType = req.headers["content-type"] || "";
      const exempt = ["/api/stripe/webhook", "/api/vitals"];
      if (!exempt.some(p => req.path.startsWith(p))) {
        if (!contentType.includes("application/json") && 
            !contentType.includes("application/x-www-form-urlencoded") &&
            !contentType.includes("multipart/form-data")) {
          if (req.body && Object.keys(req.body).length > 0) {
            return res.status(415).json({
              error: "unsupported_media_type",
              message: "Content-Type must be application/json",
            });
          }
        }
      }
    }
    next();
  };
}

const requestFingerprints = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
registerMap("requestFingerprints", requestFingerprints, 1000);

export function anomalyDetector() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const fingerprint = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();

    let entry = requestFingerprints.get(fingerprint);
    if (!entry) {
      entry = { count: 0, firstSeen: now, lastSeen: now };
      requestFingerprints.set(fingerprint, entry);
    }
    entry.count++;
    entry.lastSeen = now;

    if (entry.count > 500 && (now - entry.firstSeen) < 60000) {
      logger.warn(`Anomaly: ${fingerprint} made ${entry.count} requests in ${now - entry.firstSeen}ms`, {
        ip,
        method: req.method,
        path: req.path,
        count: entry.count,
      });
    }

    next();

... [truncated at 150 lines — full file is 375 lines] ...
```

## FILE: server/lib/openai.ts
```typescript
import OpenAI from "openai";

let _client: OpenAI | null = null;
let _trackedClient: OpenAI | null = null;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>, endpoint: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.statusCode ?? 0;
      const isRetryable = RETRYABLE_STATUS_CODES.has(status) || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT";
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      const rawRetryAfter = parseInt(err?.headers?.["retry-after"] ?? "");
      const retryAfterMs = !isNaN(rawRetryAfter)
        ? rawRetryAfter * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, retryAfterMs));
    }
  }
  throw lastErr;
}

export function getOpenAIClient(): OpenAI {
  if (!_trackedClient) {
    const baseClient = getRawOpenAIClient();
    const originalCreate = baseClient.chat.completions.create.bind(baseClient.chat.completions);

    (baseClient.chat.completions as any).create = async function(params: any, ...args: any[]) {
      const start = Date.now();
      const endpoint = params?.model || "unknown";
      const isStreaming = params?.stream === true;
      try {
        const result = await withRetry(() => originalCreate(params, ...args), endpoint);
        const latency = Date.now() - start;
        if (isStreaming) {
          trackAICall(endpoint, 0, 0, latency);
        } else {
          const tokensIn = (result as any)?.usage?.prompt_tokens || 0;
          const tokensOut = (result as any)?.usage?.completion_tokens || 0;
          trackAICall(endpoint, tokensIn, tokensOut, latency);
        }
        return result;
      } catch (err: any) {
        const latency = Date.now() - start;
        trackAICall(endpoint, 0, 0, latency, err?.message);
        throw err;
      }
    };
    _trackedClient = baseClient;
  }
  return _trackedClient;
}

function getRawOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _client;
}

interface AICallMetrics {
  totalCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalLatencyMs: number;
  failures: number;
  callsByEndpoint: Map<string, { calls: number; tokensIn: number; tokensOut: number; failures: number; avgLatencyMs: number }>;
  recentErrors: Array<{ timestamp: string; endpoint: string; error: string }>;
  startedAt: string;
}

const metrics: AICallMetrics = {
  totalCalls: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalLatencyMs: 0,
  failures: 0,
  callsByEndpoint: new Map(),
  recentErrors: [],
  startedAt: new Date().toISOString(),
};

export function trackAICall(endpoint: string, tokensIn: number, tokensOut: number, latencyMs: number, error?: string) {
  metrics.totalCalls++;
  metrics.totalTokensIn += tokensIn;
  metrics.totalTokensOut += tokensOut;
  metrics.totalLatencyMs += latencyMs;

  const existing = metrics.callsByEndpoint.get(endpoint) || { calls: 0, tokensIn: 0, tokensOut: 0, failures: 0, avgLatencyMs: 0 };
  existing.calls++;
  existing.tokensIn += tokensIn;
  existing.tokensOut += tokensOut;
  existing.avgLatencyMs = Math.round((existing.avgLatencyMs * (existing.calls - 1) + latencyMs) / existing.calls);

  if (error) {
    metrics.failures++;
    existing.failures++;
    metrics.recentErrors.push({
      timestamp: new Date().toISOString(),
      endpoint,
      error: error.substring(0, 200),
    });
    if (metrics.recentErrors.length > 50) {
      metrics.recentErrors = metrics.recentErrors.slice(-50);
    }
  }

  metrics.callsByEndpoint.set(endpoint, existing);
}

export function getAITelemetry() {
  const endpointStats: Record<string, any> = {};
  for (const [key, val] of metrics.callsByEndpoint) {
    endpointStats[key] = val;
  }

  return {
    totalCalls: metrics.totalCalls,
    totalTokensIn: metrics.totalTokensIn,
    totalTokensOut: metrics.totalTokensOut,
    totalTokens: metrics.totalTokensIn + metrics.totalTokensOut,
    avgLatencyMs: metrics.totalCalls > 0 ? Math.round(metrics.totalLatencyMs / metrics.totalCalls) : 0,
    failures: metrics.failures,
    failureRate: metrics.totalCalls > 0 ? Math.round((metrics.failures / metrics.totalCalls) * 10000) / 100 : 0,
    endpointStats,
    recentErrors: metrics.recentErrors.slice(-10),
    startedAt: metrics.startedAt,
    uptimeMinutes: Math.round((Date.now() - new Date(metrics.startedAt).getTime()) / 60000),
  };
}

```

## FILE: server/stripeClient.ts
```typescript
import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    const noop = () => {};
    const silentLogger = { info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop, child: () => silentLogger };
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
      logger: silentLogger,
    });
  }
  return stripeSync;
}

```

## FILE: server/services/agent-orchestrator.ts
> 381 lines total — showing first 150 lines

```typescript
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("agent-orchestrator");

interface AgentHealth {
  consecutiveFails: number;
  lastSuccess: Date | null;
  lastAttempt: Date | null;
  backoffUntil: Date | null;
  totalRuns: number;
  totalFails: number;
}

interface UserSession {
  userId: string;
  tier: string;
  intervals: ReturnType<typeof setInterval>[];
  startedAt: Date;
  agentsRunning: string[];
  health: Record<string, AgentHealth>;
  manuallyPaused: boolean;
}

const activeSessions = new Map<string, UserSession>();
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let isWatchdogRunning = false;

const TIER_CAPABILITIES: Record<string, {
  runAITeam: boolean; aiTeamIntervalMs: number;
  runBusinessAgents: boolean; businessAgentIntervalMs: number;
  runLegalTaxAgents: boolean; legalTaxIntervalMs: number;
  runTeamOps: boolean; teamOpsIntervalMs: number;
  runConsistencyAgent: boolean;
}> = {
  free: {
    runAITeam: false, aiTeamIntervalMs: 0,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: false,
  },
  youtube: {
    runAITeam: true, aiTeamIntervalMs: 4 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  starter: {
    runAITeam: true, aiTeamIntervalMs: 3 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  pro: {
    runAITeam: true, aiTeamIntervalMs: 2 * 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 6 * 60 * 60 * 1000,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  ultimate: {
    runAITeam: true, aiTeamIntervalMs: 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 4 * 60 * 60 * 1000,
    runLegalTaxAgents: true, legalTaxIntervalMs: 6 * 60 * 60 * 1000,
    runTeamOps: true, teamOpsIntervalMs: 8 * 60 * 60 * 1000,
    runConsistencyAgent: true,
  },
};

const MAX_CONSECUTIVE_FAILS = 5;
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;

function freshHealth(): AgentHealth {
  return { consecutiveFails: 0, lastSuccess: null, lastAttempt: null, backoffUntil: null, totalRuns: 0, totalFails: 0 };
}

function recordSuccess(health: AgentHealth): void {
  health.consecutiveFails = 0;
  health.lastSuccess = new Date();
  health.lastAttempt = new Date();
  health.backoffUntil = null;
  health.totalRuns++;
}

function recordFailure(health: AgentHealth, agentName: string, userId: string): void {
  health.consecutiveFails++;
  health.lastAttempt = new Date();
  health.totalRuns++;
  health.totalFails++;

  if (health.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    const backoffMs = Math.min(30 * 60 * 1000 * Math.pow(2, health.consecutiveFails - MAX_CONSECUTIVE_FAILS), MAX_BACKOFF_MS);
    health.backoffUntil = new Date(Date.now() + backoffMs);
    logger.warn(`[${userId}] ${agentName} in backoff for ${Math.round(backoffMs / 60000)}min after ${health.consecutiveFails} consecutive failures`);
  }
}

function isInBackoff(health: AgentHealth): boolean {
  if (!health.backoffUntil) return false;
  return health.backoffUntil > new Date();
}

async function getUserTier(userId: string): Promise<string> {
  try {
    const user = await storage.getUser(userId);
    return (user as any)?.tier || "free";
  } catch {
    return "free";
  }
}

function makeAgentRunner(
  userId: string,
  agentName: string,
  session: UserSession,
  runFn: () => Promise<void>
): () => void {
  let isRunning = false;
  return async () => {
    if (session.manuallyPaused || isRunning) return;
    const health = session.health[agentName] || (session.health[agentName] = freshHealth());
    if (isInBackoff(health)) return;
    
    isRunning = true;
    try {
      await runFn();
      recordSuccess(health);
    } catch (err: any) {
      recordFailure(health, agentName, userId);
      logger.warn(`[${userId}] ${agentName} failed: ${err.message}`);
    } finally {
      isRunning = false;
    }
  };
}

async function runAITeam(userId: string): Promise<void> {
  const { runTeamCycle } = await import("../ai-team-engine");
  await runTeamCycle(userId);
}

async function runBusinessAgents(userId: string): Promise<void> {
  const { runBusinessAgentCycle } = await import("../business-agent-engine");
  await runBusinessAgentCycle(userId);
}

async function runLegalTax(userId: string): Promise<void> {

... [truncated at 150 lines — full file is 381 lines] ...
```

## FILE: server/services/stream-agent.ts
> 376 lines total — showing first 150 lines

```typescript
import { storage } from "../storage";
import { db } from "../db";
import { streams } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { fireAgentEvent } from "./agent-events";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { getQuotaStatus, trackQuotaUsage } from "./youtube-quota-tracker";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

const logger = {
  info: (msg: string, meta?: any) => console.log(`[stream-agent] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(`[stream-agent] WARN ${msg}`, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(`[stream-agent] ERROR ${msg}`, meta ?? ""),
};

interface ActionEntry {
  time: Date;
  action: string;
  detail?: string;
}

interface StreamAgentState {
  userId: string;
  enabled: boolean;
  isLive: boolean;
  platform: string | null;
  streamTitle: string | null;
  streamId: number | null;
  videoId: string | null;
  streamStartedAt: Date | null;
  viewerCount: number;
  viewerPeak: number;
  chatMessagesHandled: number;
  chatSentiment: "positive" | "neutral" | "negative";
  currentAction: string;
  actionsLog: ActionEntry[];
  lastPromptAt: Date | null;
  postStreamPhase: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
}

const agentStates = new Map<string, StreamAgentState>();

function getOrCreateState(userId: string): StreamAgentState {
  if (!agentStates.has(userId)) {
    agentStates.set(userId, {
      userId,
      enabled: false,
      isLive: false,
      platform: null,
      streamTitle: null,
      streamId: null,
      videoId: null,
      streamStartedAt: null,
      viewerCount: 0,
      viewerPeak: 0,
      chatMessagesHandled: 0,
      chatSentiment: "neutral",
      currentAction: "Standing by",
      actionsLog: [],
      lastPromptAt: null,
      postStreamPhase: null,
      intervalHandle: null,
      lastCheckedAt: null,
      lastError: null,
    });
  }
  return agentStates.get(userId)!;
}

function logAction(state: StreamAgentState, action: string, detail?: string) {
  state.actionsLog.unshift({ time: new Date(), action, detail });
  if (state.actionsLog.length > 20) state.actionsLog = state.actionsLog.slice(0, 20);
  state.currentAction = action;
  logger.info(`[${state.userId}] ${action}${detail ? ` — ${detail}` : ""}`);
}

async function generateEngagementPrompt(state: StreamAgentState): Promise<string> {
  const openai = getOpenAIClient();
  const prompt = `You are an AI streaming assistant for a gaming streamer. They are LIVE right now playing "${state.streamTitle || "a game"}". 
Current viewer count: ${state.viewerCount}. Chat sentiment: ${state.chatSentiment}.
Generate ONE short, punchy engagement prompt the streamer can do RIGHT NOW to boost viewer interaction. 
Examples: "Ask chat what game they want to see next", "Do a 30-second speedrun challenge", "React to a clip", "Run a quick giveaway".
Response: just the prompt, no extra text, under 15 words.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 40,
    });
    return res.choices[0]?.message?.content?.trim() || "Ask chat a question!";
  } catch {
    return "React to a clip to re-engage chat!";
  }
}

async function checkAndEngageStream(userId: string): Promise<void> {
  const state = getOrCreateState(userId);
  if (!state.enabled) return;

  try {
    state.lastCheckedAt = new Date();

    // Check internal DB for streams marked live
    const userStreams = await storage.getStreams(userId);
    let liveStream = userStreams.find(s => s.status === "live");
    let detectedVideoId: string | null = null;

    // If no DB stream is live, check YouTube — API first (if quota available), then RSS fallback
    if (!liveStream) {
      try {
        const userChannels = await storage.getChannelsByUser(userId);
        const ytChannel = (userChannels as any[]).find((c: any) => c.platform === "youtube" && c.accessToken);
        if (ytChannel) {
          let broadcastTitle: string | null = null;
          let detectedLive = false;

          // Try YouTube API first (costs 1 quota unit) — only if > 5 units remaining
          const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
          if (quota.remaining > 5) {
            try {
              const broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
              await trackQuotaUsage(userId, "list", 1);
              const activeBroadcast = broadcasts.find((b: any) =>
                b.status === "live" || b.status === "liveStarting" || b.status === "testing"
              );
              if (activeBroadcast) {
                detectedLive = true;
                broadcastTitle = activeBroadcast.title;
                detectedVideoId = activeBroadcast.videoId || activeBroadcast.id || null;
              }
            } catch (apiErr: any) {
              logger.warn(`[${userId}] YouTube API live check failed — trying RSS fallback: ${apiErr.message}`);
            }
          } else {
            logger.warn(`[${userId}] YouTube quota low (${quota.remaining}) — using RSS fallback for live detection`);
          }

          // Watch-page fallback: zero-quota — checks RSS feed for recent videos, then confirms "isLive":true on watch page
          if (!detectedLive && ytChannel.channelId) {
            try {
              const check = await detectYouTubeLiveFromChannel(ytChannel.channelId);
              if (check.isLive) {
                detectedLive = true;
                broadcastTitle = check.title || broadcastTitle || "Live Stream";
                detectedVideoId = check.videoId || null;

... [truncated at 150 lines — full file is 376 lines] ...
```

## FILE: server/services/usage-metering.ts
```typescript
import { db } from "../db";
import { usageMetrics } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

const TIER_LIMITS: Record<string, Record<string, number>> = {
  free: { ai_calls: 50, videos_processed: 5, platforms: 2, posts_per_day: 5 },
  starter: { ai_calls: 500, videos_processed: 50, platforms: 4, posts_per_day: 25 },
  pro: { ai_calls: 2000, videos_processed: 200, platforms: 6, posts_per_day: 100 },
  ultimate: { ai_calls: 999999, videos_processed: 999999, platforms: 999, posts_per_day: 999999 },
};

export async function trackUsage(userId: string, metricType: string, increment: number = 1): Promise<{ allowed: boolean; current: number; limit: number }> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  
  try {
    const existing = await db.select().from(usageMetrics)
      .where(and(
        eq(usageMetrics.userId, userId),
        eq(usageMetrics.metricType, metricType),
        gte(usageMetrics.periodStart, periodStart)
      ))
      .limit(1);

    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    const tier = (user as any)?.subscriptionTier || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const limit = limits[metricType] || 999999;

    if (existing.length > 0) {
      const current = (existing[0].count || 0) + increment;
      if (current > limit) return { allowed: false, current: existing[0].count || 0, limit };
      await db.update(usageMetrics).set({ count: current }).where(eq(usageMetrics.id, existing[0].id));
      return { allowed: true, current, limit };
    } else {
      if (increment > limit) return { allowed: false, current: 0, limit };
      await db.insert(usageMetrics).values({ userId, metricType, count: increment, periodStart });
      return { allowed: true, current: increment, limit };
    }
  } catch (e) {
    console.error("[UsageMetering] Error:", e);
    return { allowed: false, current: 0, limit: 0 };
  }
}

export async function getUsageSummary(userId: string): Promise<Record<string, { current: number; limit: number; percentage: number }>> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  
  try {
    const metrics = await db.select().from(usageMetrics)
      .where(and(eq(usageMetrics.userId, userId), gte(usageMetrics.periodStart, periodStart)));
    
    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    const tier = (user as any)?.subscriptionTier || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    
    const summary: Record<string, { current: number; limit: number; percentage: number }> = {};
    for (const [key, limit] of Object.entries(limits)) {
      const metric = metrics.find(m => m.metricType === key);
      const current = metric?.count || 0;
      summary[key] = { current, limit, percentage: Math.round((current / limit) * 100) };
    }
    return summary;
  } catch (e) {
    console.error("[UsageMetering] Summary error:", e);
    return {};
  }
}

```

## FILE: server/services/webhook-verify.ts
```typescript
import crypto from "crypto";
import { trackSecurityEvent } from "../security-engine";

interface VerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = "sha256",
  encoding: "hex" | "base64" = "hex"
): VerificationResult {
  try {
    const data = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = crypto.createHmac(algorithm, secret).update(data).digest(encoding);
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function verifyYouTubeWebhook(body: string, hubSignature: string): VerificationResult {
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!hubSignature) return { valid: false, error: "Missing X-Hub-Signature header" };
  const [algo, sig] = hubSignature.split("=");
  return verifyHmacSignature(body, sig, secret, algo || "sha1", "hex");
}

export function verifyTwitchWebhook(body: string, messageId: string, timestamp: string, signature: string): VerificationResult {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!signature) return { valid: false, error: "Missing Twitch-Eventsub-Message-Signature" };
  const hmacMessage = messageId + timestamp + body;
  const expectedSig = "sha256=" + crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    return { valid };
  } catch {
    return { valid: false, error: "Signature length mismatch" };
  }
}

export function verifyKickWebhook(body: string, signature: string): VerificationResult {
  const secret = process.env.KICK_WEBHOOK_SECRET;
  if (!secret) return { valid: true };
  if (!signature) return { valid: false, error: "Missing webhook signature" };
  return verifyHmacSignature(body, signature, secret, "sha256", "hex");
}

export function verifyDiscordWebhook(body: string, signature: string, timestamp: string): VerificationResult {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return { valid: true };
  if (!signature || !timestamp) return { valid: false, error: "Missing signature/timestamp" };
  try {
    const message = Buffer.from(timestamp + body);
    const sigBuf = Buffer.from(signature, "hex");
    const keyBuf = Buffer.from(publicKey, "hex");
    
    // Discord provides a raw 32-byte Ed25519 public key.
    // crypto.verify with {format: "der", type: "spki"} expects a DER-encoded SPKI key.
    // We prepend the Ed25519 SPKI header: 302a300506032b6570032100
    const spkiHeader = Buffer.from("302a300506032b6570032100", "hex");
    const spkiKey = Buffer.concat([spkiHeader, keyBuf]);
    
    const valid = crypto.verify(null, message, { key: spkiKey, format: "der", type: "spki" }, sigBuf);
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export async function logWebhookFailure(platform: string, ip: string, error: string) {
  try {
    await trackSecurityEvent({
      eventType: "webhook_signature_failure",
      severity: "warning",
      ipAddress: ip,
      endpoint: `/api/webhooks/${platform}`,
      details: { platform, error },
      blocked: false,
    });
  } catch (err) {
    console.error(`[WebhookVerify] Failed to log webhook failure for ${platform}:`, err);
  }
}

```

## FILE: server/services/stripe-hardening.ts
> 471 lines total — showing first 150 lines

```typescript
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { registerMap } from "./resilience-core";

interface PaymentFailure {
  customerId: string;
  invoiceId: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  userId?: string;
}

interface DunningRecord {
  userId: string;
  reason: string;
  startedAt: Date;
  stage: "warning" | "reminder" | "final_warning" | "downgraded";
  lastNotifiedAt: Date;
  originalTier: string;
}

interface PausedSubscription {
  userId: string;
  pausedAt: Date;
  reason?: string;
  originalTier: string;
}

interface PromoCode {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  expiresAt: Date;
  applicableTiers: string[];
}

interface TrialRecord {
  userId: string;
  tier: string;
  startedAt: Date;
  endsAt: Date;
  ended: boolean;
}

interface InvoiceRecord {
  id: string;
  userId: string;
  amount: number;
  status: string;
  description: string;
  createdAt: Date;
}

const paymentFailures = new Map<string, PaymentFailure>();
registerMap("paymentFailures", paymentFailures, 200);
const dunningRecords = new Map<string, DunningRecord>();
registerMap("dunningRecords", dunningRecords, 200);
const pausedSubscriptions = new Map<string, PausedSubscription>();
registerMap("pausedSubscriptions", pausedSubscriptions, 200);
const trialRecords = new Map<string, TrialRecord>();
registerMap("trialRecords", trialRecords, 200);
const trialHistory = new Set<string>();
const invoiceStore = new Map<string, InvoiceRecord[]>();
registerMap("invoiceStore", invoiceStore, 500);
const appliedPromos = new Map<string, string>();
registerMap("appliedPromos", appliedPromos, 200);

const GRACE_PERIOD_DAYS = 3;
const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_TIER = "starter";

const promoCodes: PromoCode[] = [
  { code: "CREATOR20", discountPercent: 20, maxUses: 100, currentUses: 0, expiresAt: new Date("2027-01-01"), applicableTiers: ["starter", "pro", "ultimate"] },
  { code: "LAUNCH50", discountPercent: 50, maxUses: 50, currentUses: 0, expiresAt: new Date("2026-06-01"), applicableTiers: ["starter", "pro"] },
  { code: "FRIEND10", discountPercent: 10, maxUses: 500, currentUses: 0, expiresAt: new Date("2027-12-31"), applicableTiers: ["youtube", "starter", "pro", "ultimate"] },
];

const MONTHLY_PRICES: Record<string, number> = { youtube: 999, starter: 4999, pro: 9999, ultimate: 14999 };

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    return user?.id || null;
  } catch (error) {
    console.error("[Stripe Hardening] findUserByCustomerId error:", error);
    return null;
  }
}

export async function handlePaymentFailed(customerId: string, invoiceId: string, attemptCount: number): Promise<void> {
  try {
    const existing = paymentFailures.get(customerId);
    const now = new Date();
    paymentFailures.set(customerId, {
      customerId, invoiceId, attemptCount,
      firstFailedAt: existing?.firstFailedAt || now,
      lastFailedAt: now,
      userId: existing?.userId,
    });

    const userId = existing?.userId || await findUserByCustomerId(customerId);
    if (userId) {
      paymentFailures.get(customerId)!.userId = userId;
      await storage.createNotification({
        userId, type: "payment_failed", severity: "critical",
        title: "Payment Failed",
        message: `Your payment attempt #${attemptCount} failed. Please update your payment method to avoid service interruption.`,
        metadata: { source: "billing" },
      });

      if (attemptCount === 1) {
        await startDunning(userId, "payment_failed");
      }

      const failure = paymentFailures.get(customerId)!;
      const daysSinceFirst = (now.getTime() - failure.firstFailedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst >= GRACE_PERIOD_DAYS) {
        await endDunning(userId, false);
      }
    }
  } catch (err) {
    console.error("[StripeHardening] handlePaymentFailed error:", err);
  }
}

export async function handlePaymentSucceeded(customerId: string, invoiceId: string): Promise<void> {
  try {
    const failure = paymentFailures.get(customerId);
    const userId = failure?.userId || await findUserByCustomerId(customerId);
    paymentFailures.delete(customerId);

    if (userId) {
      await endDunning(userId, true);
      await storage.createNotification({
        userId, type: "payment_success", severity: "info",
        title: "Payment Successful",
        message: "Your payment has been processed successfully. Thank you!",
        metadata: { source: "billing" },
      });

      const existing = invoiceStore.get(userId) || [];
      existing.push({ id: invoiceId, userId, amount: 0, status: "paid", description: "Subscription payment", createdAt: new Date() });
      invoiceStore.set(userId, existing);
    }
  } catch (err) {
    console.error("[StripeHardening] handlePaymentSucceeded error:", err);

... [truncated at 150 lines — full file is 471 lines] ...
```

## FILE: server/vod-optimizer-engine.ts
> 361 lines total — showing first 150 lines

```typescript
import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, lt, isNotNull, asc, inArray } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { shouldRunVodOptimization } from "./priority-orchestrator";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { detectGamingContext, buildGamingPromptSection, detectContentContext, buildContentPromptSection, getNicheLabel } from "./ai-engine";
import { humanizeText } from "./ai-humanizer-engine";

const logger = createLogger("vod-optimizer");
const openai = getOpenAIClient();

const VODS_PER_BATCH = 5;
const MIN_AGE_DAYS = 7;
const RE_OPTIMIZE_AFTER_DAYS = 30;

interface VodOptimization {
  videoId: number;
  originalTitle: string;
  newTitle: string;
  newDescription: string;
  newTags: string[];
  thumbnailSuggestion: string;
  strategyNotes: string;
  expectedImpact: string;
}

async function findOptimizableVods(userId: string): Promise<any[]> {
  const userChannels = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

  if (userChannels.length === 0) return [];
  const channelIds = userChannels.map(c => c.id);

  const minAge = new Date(Date.now() - MIN_AGE_DAYS * 86400000);
  const reOptCutoff = new Date(Date.now() - RE_OPTIMIZE_AFTER_DAYS * 86400000);

  const candidateVids = await db.select().from(videos)
    .where(and(
      lt(videos.createdAt, minAge),
      inArray(videos.channelId, channelIds)
    ))
    .orderBy(asc(videos.createdAt))
    .limit(50);

  const recentlyOptimized = await db.select({ sourceVideoId: autopilotQueue.sourceVideoId })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "vod-optimization"),
      gte(autopilotQueue.createdAt, reOptCutoff),
    ));

  const recentIds = new Set(recentlyOptimized.map(r => r.sourceVideoId));
  return candidateVids.filter(v => !recentIds.has(v.id)).slice(0, VODS_PER_BATCH);
}

async function generateOptimizations(vods: any[], userId?: string): Promise<VodOptimization[]> {
  if (vods.length === 0) return [];

  const vodList = vods.map((v, i) => {
    const meta = v.metadata as any;
    const contentCtx = detectContentContext(v.title, v.description, meta?.contentCategory, meta);
    const topicLabel = contentCtx.topicName ? ` | Topic: ${contentCtx.topicName}` : "";
    return `${i + 1}. Title: "${v.title}" | Views: ${v.viewCount || 0} | Likes: ${v.likeCount || 0} | Duration: ${meta?.duration || "unknown"} | Published: ${v.publishedAt || v.createdAt} | Tags: ${(v.tags as string[] || []).join(", ") || "none"} | Description: ${(v.description || "").substring(0, 150)}${topicLabel}`;
  }).join("\n");

  const topicNames = [...Array.from(new Set(vods.map(v => {
    const meta = v.metadata as any;
    return detectContentContext(v.title, v.description, meta?.contentCategory, meta).topicName;
  }).filter(Boolean)))];
  const nicheSpecificSection = topicNames.length > 0
    ? `\n\nNICHE-SPECIFIC OPTIMIZATION (CRITICAL):\nThese videos cover: ${topicNames.join(", ")}. Every title, description, tag, and thumbnail MUST reference the specific topic/subject. Use niche-specific terminology and community language. Tags MUST include topic names and related search terms viewers actually search for. Do NOT give generic advice — optimize for the SPECIFIC topic in each video.`
    : "";

  const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a team of world-class experts collaborating to resurrect underperforming content and make the YouTube algorithm push it to millions:

🎯 WORLD'S BEST SEO EXPERT: You reverse-engineer YouTube's ranking algorithm. You know exactly which keywords are surging, how search intent works for content queries, and how to structure metadata so YouTube's crawler treats this as fresh, relevant content. You exploit keyword gaps competitors miss.

📝 WORLD'S BEST DIRECT-RESPONSE COPYWRITER: You write titles with 15%+ CTR. You use proven formulas — curiosity gaps, power words, emotional triggers, number hooks, before/after framing. Every word in the title and first 2 lines of the description is engineered to convert impressions into clicks.

📊 WORLD'S BEST GROWTH HACKER: You know why the algorithm surfaces some old videos and buries others. You engineer "second life" metadata that makes YouTube's recommendation engine think this is a brand new trending video. You exploit browse features, suggested video placement, and search ranking signals.

🧠 WORLD'S BEST AUDIENCE PSYCHOLOGIST: You understand the target audience's decision-making in the 0.5 seconds they decide to click or scroll. You weaponize FOMO, social proof, pattern interrupts, and dopamine triggers in every metadata element.

🎨 WORLD'S BEST THUMBNAIL STRATEGIST: You design thumbnail concepts that achieve 8%+ CTR. You understand visual hierarchy, color psychology, facial expressions, contrast, and the "stop the scroll" principle that makes viewers physically unable to not click.
${retentionContext}${nicheSpecificSection}

OPTIMIZATION STRATEGY:
- Titles: Front-load the primary keyword. Use power words (INSANE, IMPOSSIBLE, NEVER). Create a curiosity gap or emotional hook. Max 60 chars. Make it feel like a video uploaded TODAY about a trending topic.
- Descriptions: First 2 lines must contain the primary keyword and a compelling hook (this is what shows in search). Add retention-beat-timed timestamps. Include 3-5 long-tail keyword phrases naturally woven in. End with subscribe CTA + social links. Add relevant hashtags.
- Tags: 15-25 tags. Mix exact-match keywords, long-tail variations, competitor video keywords, trending search terms, and broad niche tags. Put highest-value tags first.
- Thumbnail: Describe a concept with specific emotion, composition, color scheme, focal point, and contrast technique that would achieve 8%+ CTR.
- Strategy: Explain exactly which algorithm signals this optimization exploits and why it will trigger YouTube to resurface this video.

Return ONLY valid JSON array matching this structure:
[{
  "videoIndex": 1,
  "newTitle": "string - max 60 chars, power words + curiosity gap + front-loaded keyword",
  "newDescription": "string - SEO-optimized: keyword-rich first 2 lines, timestamps, long-tail phrases, CTA, hashtags",
  "newTags": ["15-25 strategically ordered tags mixing exact-match, long-tail, trending, competitor keywords"],
  "thumbnailSuggestion": "detailed concept: subject, emotion, colors, composition, contrast, focal point, text overlay suggestion",
  "strategyNotes": "which algorithm signals this exploits and why YouTube will resurface this video",
  "expectedImpact": "estimated view increase like '3-5x' with reasoning"
}]`
        },
        {
          role: "user",
          content: `Optimize these underperforming VODs for maximum new viewership:\n\n${vodList}\n\nCRITICAL: Each optimization MUST be tailored to the SPECIFIC content of that video. Reference the actual topic, events, and moments in the video. Do NOT give generic titles like "INSANE CONTENT" — instead reference what specifically happened. Make each title irresistible and content-specific. Use current YouTube trends relevant to each video's niche. Every optimization should feel like a fresh upload to the algorithm.`
        }
      ],
      temperature: 0.8,
      max_tokens: 3000,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error("AI returned non-JSON VOD optimizations");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      videoIndex: number;
      newTitle: string;
      newDescription: string;
      newTags: string[];
      thumbnailSuggestion: string;
      strategyNotes: string;
      expectedImpact: string;
    }>;

    return parsed.map(opt => {
      const vid = vods[(opt.videoIndex || 1) - 1];
      if (!vid) return null;
      const titleHumanized = humanizeText(opt.newTitle, { aggressionLevel: "subtle", contentType: "title" });
      const descHumanized = humanizeText(opt.newDescription, { aggressionLevel: "moderate", contentType: "description" });
      return {
        videoId: vid.id,

... [truncated at 150 lines — full file is 361 lines] ...
```

## FILE: server/stealth-guardrails.ts
> 170 lines total — showing first 150 lines

```typescript
import { checkContentSafety, getStealthReport } from "./content-variation-engine";
import { addHumanMicroDelay, getActivityWindow } from "./human-behavior-engine";

const BANNED_AI_PHRASES = [
  "as an ai", "as a language model", "i cannot", "i can't help",
  "dive into", "delve into", "let's explore", "in this video we",
  "buckle up", "without further ado", "game changer", "take it to the next level",
  "leverage", "synergy", "utilize", "facilitate",
  "it's worth noting", "it's important to note", "interestingly",
  "in conclusion", "to summarize", "in summary",
  "comprehensive guide", "ultimate guide",
];

const NATURAL_IMPERFECTIONS = [
  (t: string) => Math.random() < 0.15 ? t.replace(/\.\s/g, (m, i) => i > 0 && Math.random() < 0.3 ? ".. " : m) : t,
  (t: string) => Math.random() < 0.1 ? t.replace(/!$/, "!!") : t,
  (t: string) => Math.random() < 0.08 ? t + (Math.random() < 0.5 ? " lol" : " haha") : t,
  (t: string) => Math.random() < 0.12 ? t.replace(/really /i, "reallyyy ") : t,
];

export interface GuardrailResult {
  content: string;
  original: string;
  safetyGrade: "A" | "B" | "C" | "D" | "F";
  humanized: boolean;
  stealthScore: number;
  issues: string[];
  microDelayMs: number;
}

export async function applyGuardrails(
  content: string,
  userId: string,
  platform: string,
  options?: {
    skipHumanization?: boolean;
    skipSafetyCheck?: boolean;
    contentType?: string;
  }
): Promise<GuardrailResult> {
  const original = content;
  let processed = content;
  const issues: string[] = [];

  if (!options?.skipHumanization) {
    processed = removeBannedPhrases(processed);
    processed = applyNaturalImperfections(processed);
    processed = adjustPlatformVoice(processed, platform);
  }

  let safetyGrade: "A" | "B" | "C" | "D" | "F" = "A";
  if (!options?.skipSafetyCheck) {
    const safety = await checkContentSafety(processed, userId, platform);
    safetyGrade = safety.overallGrade;
    issues.push(...safety.issues);

    if (!safety.safe && safety.issues.length > 2) {
      processed = aggressiveCleanup(processed);
      const recheck = await checkContentSafety(processed, userId, platform);
      safetyGrade = recheck.overallGrade;
      issues.length = 0;
      issues.push(...recheck.issues);
    }
  }

  const microDelayMs = addHumanMicroDelay();

  const stealthScore = calculateStealthScore(processed, issues.length);

  return {
    content: processed,
    original,
    safetyGrade,
    humanized: !options?.skipHumanization,
    stealthScore,
    issues,
    microDelayMs,
  };
}

export function removeBannedPhrases(text: string): string {
  let result = text;
  for (const phrase of BANNED_AI_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function applyNaturalImperfections(text: string): string {
  let result = text;
  for (const fn of NATURAL_IMPERFECTIONS) {
    result = fn(result);
  }
  return result;
}

function adjustPlatformVoice(text: string, platform: string): string {
  switch (platform) {
    case "discord":
      return text
        .replace(/\bvideo\b/gi, (m) => Math.random() < 0.3 ? "vid" : m)
        .replace(/\beveryone\b/gi, (m) => Math.random() < 0.2 ? "y'all" : m);
    case "tiktok":
      return text
        .replace(/\bcheck out\b/gi, (m) => Math.random() < 0.3 ? "peep" : m)
        .replace(/subscribe/gi, (m) => Math.random() < 0.4 ? "follow" : m);
    case "x":
      if (text.length > 260) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        let shortened = "";
        for (const s of sentences) {
          if ((shortened + s).length < 250) shortened += s.trim() + ". ";
          else break;
        }
        return shortened.trim() || text;
      }
      return text;
    default:
      return text;
  }
}

function aggressiveCleanup(text: string): string {
  let result = text;
  result = result.replace(/#\w+\s*/g, '').trim();
  result = result.replace(/https?:\/\/\S+/g, '').trim();
  result = result.replace(/[!]{2,}/g, '!');
  result = result.replace(/[.]{3,}/g, '...');
  return result;
}

function calculateStealthScore(content: string, issueCount: number): number {
  let score = 100;
  score -= issueCount * 12;

  const lower = content.toLowerCase();
  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase)) score -= 8;
  }

  const hashtags = (content.match(/#\w+/g) || []).length;
  if (hashtags > 3) score -= (hashtags - 3) * 5;

  const links = (content.match(/https?:\/\/\S+/g) || []).length;
  if (links > 2) score -= (links - 2) * 10;

  if (content.length > 20 && content.length < 50) score -= 5;

  return Math.max(0, Math.min(100, score));

... [truncated at 150 lines — full file is 170 lines] ...
```

## FILE: server/ai-engine.ts
> 11567 lines total — showing first 150 lines

```typescript
import { getOpenAIClient } from "./lib/openai";
import { getCreatorStyleContext, getLearningContext, buildHumanizationPrompt } from "./creator-intelligence";

const openai = getOpenAIClient();

export type ContentNiche = 'gaming' | 'cooking' | 'tech' | 'fitness' | 'music' | 'comedy' | 'education' | 'vlogging' | 'beauty' | 'travel' | 'finance' | 'crafts' | 'automotive' | 'sports' | 'news' | 'science' | 'art' | 'photography' | 'pets' | 'asmr' | 'reaction' | 'general';

export interface ContentContext {
  niche: ContentNiche;
  subNiche: string | null;
  isGaming: boolean;
  gameName: string | null;
  topicName: string | null;
  brandKeywords: string[];
  nicheTerminology: string[];
  audienceType: string;
  contentStyle: string;
}

const NICHE_SIGNALS: Record<ContentNiche, string[]> = {
  gaming: ['gameplay', 'playthrough', 'walkthrough', 'speedrun', "let's play", 'gaming', 'ranked', 'competitive', 'multiplayer', 'co-op', 'boss fight', 'raid', 'pvp', 'pve', 'esports', 'tournament', 'highlights', 'montage', 'clutch', 'victory royale', 'battle royale', 'fps', 'mmorpg', 'rpg'],
  cooking: ['recipe', 'cooking', 'baking', 'meal prep', 'kitchen', 'ingredient', 'chef', 'food', 'cuisine', 'dinner', 'lunch', 'breakfast', 'dessert', 'restaurant', 'mukbang', 'food review', 'taste test'],
  tech: ['review', 'unboxing', 'tech', 'gadget', 'smartphone', 'laptop', 'iphone', 'android', 'software', 'hardware', 'setup', 'programming', 'coding', 'developer', 'ai', 'machine learning', 'apple', 'samsung', 'pc build'],
  fitness: ['workout', 'fitness', 'gym', 'exercise', 'training', 'muscle', 'bodybuilding', 'cardio', 'yoga', 'crossfit', 'hiit', 'gains', 'protein', 'diet', 'weight loss', 'transformation', 'calisthenics'],
  music: ['music', 'song', 'guitar', 'piano', 'drums', 'singing', 'vocal', 'cover', 'remix', 'beat', 'producer', 'album', 'concert', 'freestyle', 'rap', 'hip hop', 'rock', 'pop', 'jazz', 'electronic'],
  comedy: ['comedy', 'funny', 'skit', 'prank', 'joke', 'standup', 'stand-up', 'parody', 'satire', 'humor', 'roast', 'meme', 'blooper'],
  education: ['tutorial', 'how to', 'learn', 'course', 'lesson', 'explain', 'education', 'study', 'lecture', 'class', 'teacher', 'student', 'academic', 'guide', 'tips and tricks'],
  vlogging: ['vlog', 'day in my life', 'daily vlog', 'grwm', 'get ready with me', 'routine', 'storytime', 'life update', 'moving', 'apartment tour', 'room tour'],
  beauty: ['makeup', 'skincare', 'beauty', 'cosmetics', 'tutorial', 'haul', 'foundation', 'lipstick', 'hair', 'nails', 'fashion', 'outfit', 'style', 'grwm'],
  travel: ['travel', 'vacation', 'trip', 'flight', 'hotel', 'destination', 'backpacking', 'adventure', 'explore', 'country', 'city guide', 'travel vlog'],
  finance: ['investing', 'stock', 'crypto', 'money', 'finance', 'budget', 'passive income', 'real estate', 'trading', 'retirement', 'wealth', 'side hustle', 'entrepreneur'],
  crafts: ['diy', 'craft', 'handmade', 'woodworking', 'sewing', 'knitting', 'crochet', 'pottery', 'resin', 'painting', 'renovation', 'home improvement'],
  automotive: ['car', 'automotive', 'vehicle', 'engine', 'horsepower', 'drift', 'race', 'modification', 'detailing', 'mechanic', 'motorcycle', 'truck', 'supercar'],
  sports: ['nfl', 'nba', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'golf', 'mma', 'ufc', 'boxing', 'wrestling', 'highlights', 'analysis', 'draft'],
  news: ['news', 'breaking', 'update', 'report', 'analysis', 'politics', 'current events', 'commentary', 'opinion', 'debate'],
  science: ['science', 'experiment', 'physics', 'chemistry', 'biology', 'space', 'nasa', 'astronomy', 'research', 'discovery', 'evolution'],
  art: ['art', 'drawing', 'illustration', 'digital art', 'animation', 'sketch', 'painting', 'watercolor', 'procreate', 'photoshop', 'design', 'graphic design'],
  photography: ['photography', 'photo', 'camera', 'lens', 'lightroom', 'portrait', 'landscape', 'street photography', 'editing', 'composition'],
  pets: ['dog', 'cat', 'puppy', 'kitten', 'pet', 'animal', 'rescue', 'vet', 'training', 'aquarium', 'fish', 'reptile', 'bird'],
  asmr: ['asmr', 'triggers', 'tingles', 'relaxing', 'sleep', 'whispering', 'tapping', 'scratching', 'roleplay asmr'],
  reaction: ['reaction', 'reacting', 'react', 'first time watching', 'responding to', 'commentary'],
  general: [],
};

const NICHE_CONFIG: Record<ContentNiche, { audienceType: string; contentStyle: string; terminology: string[]; thumbnailStyle: string; seoFocus: string }> = {
  gaming: { audienceType: 'gamers and gaming enthusiasts', contentStyle: 'high-energy, competitive, entertainment-focused', terminology: ['clutch', 'meta', 'nerf', 'buff', 'GG', 'carry', 'sweaty', 'cracked', 'goated'], thumbnailStyle: 'high-energy compositions, in-game action shots, bold contrasting colors, dramatic moments or reactions', seoFocus: 'game-specific long-tail keywords, game version/season info, trending community topics, gaming hashtags' },
  cooking: { audienceType: 'home cooks and food enthusiasts', contentStyle: 'warm, inviting, step-by-step instructional', terminology: ['al dente', 'sear', 'fold', 'rest', 'season to taste', 'mise en place'], thumbnailStyle: 'appetizing close-up food shots, vibrant colors, steam/texture visible, clean bright lighting', seoFocus: 'recipe name keywords, ingredient lists, cuisine type, dietary preferences (vegan, keto, etc.), cooking method' },
  tech: { audienceType: 'tech enthusiasts and early adopters', contentStyle: 'informative, analytical, product-focused', terminology: ['specs', 'benchmark', 'upgrade', 'ecosystem', 'teardown', 'hands-on'], thumbnailStyle: 'clean product shots, comparison layouts, spec callouts, before/after, tech-blue color schemes', seoFocus: 'product name + review/unboxing, vs comparisons, year-specific keywords, spec-based searches' },
  fitness: { audienceType: 'fitness enthusiasts and people seeking transformation', contentStyle: 'motivational, instructional, results-driven', terminology: ['reps', 'sets', 'PR', 'gains', 'bulk', 'cut', 'macros', 'form check'], thumbnailStyle: 'before/after transformations, action poses, bold text overlays, motivational imagery', seoFocus: 'exercise name, muscle group, routine type, transformation keywords, beginner/advanced level' },
  music: { audienceType: 'music lovers, musicians, and aspiring artists', contentStyle: 'creative, expressive, performance-oriented', terminology: ['riff', 'chord', 'tempo', 'key', 'verse', 'chorus', 'bridge', 'drop'], thumbnailStyle: 'performance shots, instrument close-ups, waveform visuals, concert lighting aesthetic', seoFocus: 'song name, artist, genre, instrument, tutorial/cover/original, music theory terms' },
  comedy: { audienceType: 'entertainment seekers looking for laughs', contentStyle: 'humorous, relatable, personality-driven', terminology: ['bit', 'punchline', 'callback', 'deadpan', 'improv'], thumbnailStyle: 'exaggerated facial expressions, funny freeze-frames, meme-style text, bright colors', seoFocus: 'comedy + topic, funny + situation, relatable content keywords, trending meme references' },
  education: { audienceType: 'learners, students, and curious minds', contentStyle: 'clear, structured, authoritative yet accessible', terminology: ['explained', 'breakdown', 'step-by-step', 'beginner-friendly', 'deep dive'], thumbnailStyle: 'clean diagrams, whiteboard style, numbered steps, professional yet approachable', seoFocus: 'how to, tutorial, explained, beginner guide, topic + for beginners, step by step' },
  vlogging: { audienceType: 'lifestyle content consumers seeking connection', contentStyle: 'personal, authentic, diary-like storytelling', terminology: ['grwm', 'ootd', 'haul', 'storytime', 'life update'], thumbnailStyle: 'candid personal shots, lifestyle aesthetic, warm tones, relatable expressions', seoFocus: 'day in my life, routine, storytime, life update, personal experience keywords' },
  beauty: { audienceType: 'beauty enthusiasts and fashion followers', contentStyle: 'aspirational, tutorial-based, trend-focused', terminology: ['glam', 'beat face', 'swatch', 'holy grail', 'dupe', 'shade match'], thumbnailStyle: 'glamorous close-ups, before/after, product flat lays, clean aesthetic, pastel or bold accents', seoFocus: 'product name + review, tutorial type, skin type, trend name, dupe/alternative keywords' },
  travel: { audienceType: 'travelers and adventure seekers', contentStyle: 'cinematic, inspirational, informative', terminology: ['itinerary', 'hidden gem', 'must-visit', 'budget travel', 'off the beaten path'], thumbnailStyle: 'stunning landscape/cityscape shots, vibrant colors, wanderlust-inducing imagery, location text overlay', seoFocus: 'destination name, travel guide, things to do in, budget tips, best time to visit' },
  finance: { audienceType: 'investors, entrepreneurs, and financially curious', contentStyle: 'authoritative, data-driven, actionable', terminology: ['ROI', 'compound interest', 'portfolio', 'bull/bear market', 'diversify', 'passive income'], thumbnailStyle: 'charts/graphs, money imagery, professional headshots, green/gold accents, numbers callouts', seoFocus: 'stock name, investing strategy, money tips, passive income, financial literacy terms' },
  crafts: { audienceType: 'DIY enthusiasts and makers', contentStyle: 'hands-on, process-focused, satisfying', terminology: ['DIY', 'handmade', 'upcycle', 'project', 'makeover', 'transformation'], thumbnailStyle: 'before/after transformations, process shots, satisfying results, warm workshop lighting', seoFocus: 'DIY + project type, how to make, home improvement, craft type, material name' },
  automotive: { audienceType: 'car enthusiasts and gearheads', contentStyle: 'passionate, detailed, performance-focused', terminology: ['horsepower', 'torque', 'mod', 'build', 'dyno', 'exhaust note', 'spec'], thumbnailStyle: 'dramatic car angles, action shots, before/after mods, spec callouts, motorsport aesthetic', seoFocus: 'car make/model, modification type, vs comparison, review, build progress' },
  sports: { audienceType: 'sports fans and analysts', contentStyle: 'analytical, passionate, highlight-driven', terminology: ['highlights', 'breakdown', 'analysis', 'draft pick', 'trade', 'clutch moment'], thumbnailStyle: 'action shots, player close-ups, score graphics, team colors, dramatic moments', seoFocus: 'team/player name, game highlights, analysis, predictions, season/week specific' },
  news: { audienceType: 'informed citizens and news followers', contentStyle: 'timely, factual, commentary-driven', terminology: ['breaking', 'developing', 'analysis', 'report', 'exclusive'], thumbnailStyle: 'newsroom aesthetic, text-heavy headlines, urgent red accents, professional headshots', seoFocus: 'topic + today/2026, breaking news, latest update, analysis, explained' },
  science: { audienceType: 'science enthusiasts and curious learners', contentStyle: 'fascinating, educational, evidence-based', terminology: ['hypothesis', 'experiment', 'data', 'peer-reviewed', 'breakthrough'], thumbnailStyle: 'stunning visuals (space, microscopy), clean infographics, "mind-blown" expressions, wonder-inducing', seoFocus: 'topic + explained, how does X work, science behind, new discovery, experiment' },
  art: { audienceType: 'artists and creative community', contentStyle: 'creative, process-focused, inspirational', terminology: ['composition', 'palette', 'technique', 'commission', 'timelapse', 'WIP'], thumbnailStyle: 'finished artwork showcase, process comparison, vibrant colors, artist at work', seoFocus: 'art style, medium (digital/traditional), character/subject, speedpaint, tutorial' },
  photography: { audienceType: 'photographers and visual storytellers', contentStyle: 'visual, technical, gear-focused', terminology: ['aperture', 'ISO', 'focal length', 'golden hour', 'bokeh', 'composition'], thumbnailStyle: 'stunning photo examples, before/after edits, gear shots, technical overlays', seoFocus: 'camera/lens model, photography type, editing technique, tips for beginners' },
  pets: { audienceType: 'pet owners and animal lovers', contentStyle: 'heartwarming, cute, informative', terminology: ['rescue', 'adoption', 'training', 'breed', 'vet visit', 'zoomies'], thumbnailStyle: 'adorable animal close-ups, funny pet expressions, heartwarming moments, bright cheerful colors', seoFocus: 'pet breed/species, training tips, pet care, funny animals, rescue stories' },
  asmr: { audienceType: 'relaxation and sleep seekers', contentStyle: 'calming, intimate, sensory-focused', terminology: ['triggers', 'tingles', 'tapping', 'whispering', 'no talking', 'sleep'], thumbnailStyle: 'close-up trigger objects, soft lighting, pastel colors, cozy aesthetic, ear-to-ear imagery', seoFocus: 'ASMR + trigger type, sleep ASMR, relaxing, no talking, specific trigger keywords' },
  reaction: { audienceType: 'entertainment seekers who enjoy shared experiences', contentStyle: 'expressive, conversational, personality-driven', terminology: ['first time', 'reacting to', 'commentary', 'breakdown', 'my thoughts'], thumbnailStyle: 'split-screen with source material, exaggerated expressions, colorful borders, reaction faces', seoFocus: 'reaction + source content name, first time watching, responding to, commentary on' },
  general: { audienceType: 'general audience', contentStyle: 'versatile and engaging', terminology: [], thumbnailStyle: 'clear subject focus, readable text, high contrast, professional composition', seoFocus: 'topic-specific keywords, trending terms, how-to and guide keywords' },
};

const KNOWN_GAMES: Record<string, string[]> = {
  'Fortnite': ['fortnite', 'battle royale fortnite', 'fortnite chapter'],
  'Call of Duty': ['call of duty', 'cod', 'warzone', 'modern warfare', 'black ops'],
  'Minecraft': ['minecraft', 'mc server', 'survival minecraft'],
  'Apex Legends': ['apex legends', 'apex'],
  'Valorant': ['valorant', 'valo'],
  'League of Legends': ['league of legends', 'lol ranked', 'league'],
  'GTA V': ['gta', 'gta v', 'gta 5', 'gta online', 'grand theft auto'],
  'Elden Ring': ['elden ring', 'lands between'],
  "Baldur's Gate 3": ["baldur's gate", 'bg3'],
  'Helldivers 2': ['helldivers', 'helldivers 2'],
  'Counter-Strike 2': ['counter-strike', 'cs2', 'csgo', 'cs:go'],
  'Overwatch 2': ['overwatch', 'ow2'],
  'Rocket League': ['rocket league'],
  'Destiny 2': ['destiny 2', 'destiny'],
  'FIFA': ['fifa', 'ea fc', 'ea sports fc'],
  'NBA 2K': ['nba 2k', '2k25', '2k24'],
  'Madden': ['madden'],
  'Spider-Man 2': ['spider-man', 'spiderman'],
  'God of War': ['god of war', 'ragnarok'],
  'Zelda': ['zelda', 'tears of the kingdom', 'breath of the wild', 'totk', 'botw'],
  'Palworld': ['palworld'],
  'Roblox': ['roblox'],
  'Diablo IV': ['diablo', 'diablo iv', 'diablo 4'],
  'Final Fantasy': ['final fantasy', 'ffxiv', 'ff14', 'ff7'],
  'Pokemon': ['pokemon', 'pokémon'],
};

export function detectContentContext(title: string, description?: string | null, category?: string | null, metadata?: any): ContentContext {
  const text = `${title} ${description || ''} ${category || ''}`.toLowerCase();
  const brandKeywords: string[] = metadata?.brandKeywords || [];

  if (metadata?.contentNiche) {
    const niche = metadata.contentNiche as ContentNiche;
    const config = NICHE_CONFIG[niche] || NICHE_CONFIG.general;
    let gameName: string | null = null;
    if (niche === 'gaming') {
      gameName = metadata?.gameName || detectGameName(text);
    }
    return {
      niche,
      subNiche: metadata?.subNiche || null,
      isGaming: niche === 'gaming',
      gameName,
      topicName: metadata?.topicName || gameName || null,
      brandKeywords,
      nicheTerminology: config.terminology,
      audienceType: config.audienceType,
      contentStyle: config.contentStyle,
    };
  }

  const nicheScores: { niche: ContentNiche; score: number }[] = [];
  for (const [niche, signals] of Object.entries(NICHE_SIGNALS)) {
    if (niche === 'general') continue;
    const score = signals.filter(s => text.includes(s)).length;
    if (score > 0) nicheScores.push({ niche: niche as ContentNiche, score });
  }
  nicheScores.sort((a, b) => b.score - a.score);

  if (category) {
    const catLower = category.toLowerCase();
    for (const niche of Object.keys(NICHE_SIGNALS) as ContentNiche[]) {
      if (catLower === niche || catLower.includes(niche)) {
        const existing = nicheScores.find(n => n.niche === niche);
        if (existing) existing.score += 5;
        else nicheScores.push({ niche, score: 5 });
      }
    }
    nicheScores.sort((a, b) => b.score - a.score);
  }

  const detectedNiche: ContentNiche = nicheScores.length > 0 ? nicheScores[0].niche : 'general';
  const config = NICHE_CONFIG[detectedNiche] || NICHE_CONFIG.general;

  let gameName: string | null = null;
  if (detectedNiche === 'gaming') {
    gameName = metadata?.gameName || detectGameName(text);
  }

  const topicName = gameName || extractTopicName(text, detectedNiche);

... [truncated at 150 lines — full file is 11567 lines] ...
```

## FILE: client/src/App.tsx
> 910 lines total — showing first 150 lines

```typescript
import { Switch, Route, Redirect, useLocation } from "wouter";
import { Component, Suspense, useEffect, useState, useCallback } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";
import { AdvancedModeProvider, useAdvancedMode } from "@/hooks/use-advanced-mode";
import { FocusModeProvider, useFocusMode } from "@/hooks/use-focus-mode";
import { useLoginSync } from "@/hooks/use-login-sync";
import { AdaptiveProvider } from "@/hooks/use-adaptive";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";
import { Loader2, Zap, Sun, Moon, Search, Keyboard, ChevronRight, LayoutDashboard, Video, Radio, DollarSign, Settings as SettingsIcon, Maximize, Minimize, Clock, Rocket, CalendarDays, Bot, TrendingUp as TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineStatusBadge, PWAInstallPrompt } from "@/components/OfflineIndicator";
import { offlineEngine } from "@/lib/offline-engine";
import { prefetchForRoute } from "@/lib/prefetch";
import { BackToTop } from "@/components/BackToTop";
import { GlobalProgress } from "@/components/GlobalProgress";
import { ScrollProgress } from "@/components/ScrollProgress";
import { HealthRibbon } from "@/components/HealthRibbon";
import { SessionTracker } from "@/components/SessionTracker";
import { lazyRetry, isChunkError } from "@/lib/lazyRetry";

const CommandPalette = lazyRetry(() => import("@/components/CommandPalette"));

const Dashboard = lazyRetry(() => import("@/pages/Dashboard"));
const Content = lazyRetry(() => import("@/pages/Content"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const StreamCenter = lazyRetry(() => import("@/pages/StreamCenter"));
const Money = lazyRetry(() => import("@/pages/Money"));
const Notifications = lazyRetry(() => import("@/pages/Notifications"));
const Landing = lazyRetry(() => import("@/pages/Landing"));
const Onboarding = lazyRetry(() => import("@/pages/Onboarding"));
const Pricing = lazyRetry(() => import("@/pages/Pricing"));
const Autopilot = lazyRetry(() => import("@/pages/Autopilot"));
const AccessCodes = lazyRetry(() => import("@/pages/AccessCodes"));
const Community = lazyRetry(() => import("@/pages/Community"));
const GrowthJourney = lazyRetry(() => import("@/pages/GrowthJourney"));
const EmpireLauncher = lazyRetry(() => import("@/pages/EmpireLauncher"));
const CompetitiveEdge = lazyRetry(() => import("@/pages/CompetitiveEdge"));
const StreamLoop = lazyRetry(() => import("@/pages/StreamLoop"));
const VodShortsLoop = lazyRetry(() => import("@/pages/VodShortsLoop"));
const StealthAutonomy = lazyRetry(() => import("@/pages/StealthAutonomy"));
const SystemStatus = lazyRetry(() => import("@/pages/SystemStatus"));
const ChangelogPage = lazyRetry(() => import("@/pages/Changelog"));
const MissionControl = lazyRetry(() => import("@/pages/MissionControl"));
const IntelligenceHub = lazyRetry(() => import("@/pages/IntelligenceHub"));
const ContentCommand = lazyRetry(() => import("@/pages/ContentCommand"));
const Simulator = lazyRetry(() => import("@/pages/Simulator"));
const CreatorHub = lazyRetry(() => import("@/pages/CreatorHub"));
const AIFactory = lazyRetry(() => import("@/pages/AIFactory"));
const AICommand = lazyRetry(() => import("@/pages/AICommand"));
const CalendarPage = lazyRetry(() => import("@/pages/CalendarPage"));
const WarRoom = lazyRetry(() => import("@/pages/WarRoom"));
const AIMatrix = lazyRetry(() => import("@/pages/AIMatrix"));
const Workspace = lazyRetry(() => import("@/pages/Workspace"));
const Heartbeat = lazyRetry(() => import("@/pages/Heartbeat"));
const LegalTaxTeam = lazyRetry(() => import("@/pages/LegalTaxTeam"));
const BusinessAgents = lazyRetry(() => import("@/pages/BusinessAgents"));
const TeamOps = lazyRetry(() => import("@/pages/TeamOps"));
const NotFound = lazyRetry(() => import("@/pages/not-found"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.TermsOfService })));
const DataDisclosure = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.DataDisclosure })));
const FloatingChat = lazyRetry(() => import("@/components/FloatingChat"));
const Hub = lazyRetry(() => import("@/pages/Hub"));
const ScriptStudio = lazyRetry(() => import("@/pages/ScriptStudio"));
const ViralPredictor = lazyRetry(() => import("@/pages/ViralPredictor"));
import { FeedbackWidget } from "@/components/FeedbackWidget";
import CookieConsent from "@/components/CookieConsent";
import { CreatorModeProvider } from "@/hooks/use-creator-mode";
import { LiveStreamBanner } from "@/components/LiveStreamBanner";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const sidebarStyle = {
  "--sidebar-width": "13rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": { title: "Dashboard", description: "Your AI-powered creator command center with real-time analytics, daily briefings, and automated growth insights." },
  "/mission-control": { title: "Mission Control", description: "Monitor all systems, subsystem health, and AI engine status in one unified command view." },
  "/intelligence": { title: "Intelligence Hub", description: "Creator scoring, audience mind maps, anomaly detection, and sentiment analysis powered by AI." },
  "/content-command": { title: "Content Command", description: "AI script generation, content atomization, hook analysis, SEO lab, and viral chain tracking." },
  "/growth": { title: "Zero to #1", description: "Your AI-powered roadmap from beginner to top creator with daily actions and milestone tracking." },
  "/content": { title: "Content", description: "Manage your video library, content ideas, SEO, scripts, thumbnails, and publishing calendar." },
  "/calendar": { title: "Content Calendar", description: "AI-powered content calendar with planning horizon, approval queue, and multi-platform scheduling." },
  "/stream": { title: "Go Live", description: "Multi-platform streaming center with AI chat bots, raid strategy, and real-time analytics." },
  "/autopilot": { title: "Autopilot", description: "Fully autonomous content clipping, scheduling, comment response, and cross-platform posting." },
  "/simulator": { title: "Simulator", description: "What-if scenarios, time machine projections, momentum tracking, and revenue attribution analysis." },
  "/ai-command": { title: "AI Command", description: "Configure AI personality, voice commands, daily briefings, and platform failover rules." },
  "/ai-factory": { title: "AI Factory", description: "20 AI-powered tools to dominate every platform including title, hook, and strategy generators." },
  "/war-room": { title: "War Room", description: "Real-time crisis detection, threat scanning, anomaly monitoring, and automated recovery plans." },
  "/creator-hub": { title: "Creator Hub", description: "Creator networks, collaboration matching, achievements, AI clone, and wellness tracking." },
  "/workspace": { title: "Workspace", description: "Team inbox, asset library, reports, email lists, Discord bot, merch, and tip tracking." },
  "/heartbeat": { title: "AI Heartbeat", description: "Live status of 15 autonomous AI engines, decision logs, run history, and exception alerts." },
  "/edge": { title: "Competitive Edge", description: "VOD optimization, A/B testing, competitor tracking, and growth analytics for advanced creators." },
  "/stealth": { title: "AI Stealth", description: "Human behavior simulation and AI detection evasion for authentic content posting." },
  "/empire": { title: "Empire Launcher", description: "Launch and scale your content empire with AI-powered multi-platform growth strategies." },
  "/money": { title: "Money", description: "Revenue tracking, expense management, tax estimates, sponsorships, and financial AI insights." },
  "/script-studio": { title: "AI Script Studio", description: "Full AI-generated scripts with hooks, B-roll notes, chapter markers and viral optimization." },
  "/viral-predictor": { title: "Viral Predictor", description: "AI scores your content before you post — predict views, engagement and viral potential." },
  "/community": { title: "Community", description: "Polls, giveaways, challenges, loyalty programs, and superfan management tools." },
  "/hub": { title: "Creator Hub", description: "AI-powered content mode and live stream command center — the heart of your creator operation." },
  "/settings": { title: "Settings", description: "Profile, brand, integrations, automation rules, security, and account preferences." },
  "/notifications": { title: "Notifications", description: "Exception-only alerts for critical issues, platform bans, and system failures." },
  "/stream-loop": { title: "Stream Loop", description: "Automated livestream content extraction and multi-platform distribution pipeline." },
  "/vod-shorts-loop": { title: "VOD & Shorts", description: "AI-powered VOD clipping, shorts generation, and automated publishing workflow." },
  "/pricing": { title: "Pricing", description: "Choose your plan — from free to Ultimate tier with 832+ AI features and full automation." },
  "/privacy": { title: "Privacy Policy", description: "How CreatorOS handles your data, privacy protections, and GDPR compliance." },
  "/terms": { title: "Terms of Service", description: "Terms and conditions for using the CreatorOS platform." },
  "/data-disclosure": { title: "Data Disclosure", description: "Detailed information about data collection, processing, and third-party sharing." },
  "/status": { title: "System Status", description: "Real-time operational status of all CreatorOS systems and services." },
  "/changelog": { title: "Changelog", description: "Latest updates, new features, and improvements to CreatorOS." },
};

function useRouteMetaSync() {
  const [location] = useLocation();
  useEffect(() => {
    const url = window.location.href;
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    const basePath = "/" + (location.split("/").filter(Boolean)[0] || "");
    const meta = PAGE_META[location] || PAGE_META[basePath] || PAGE_META["/"];
    if (meta) {
      document.title = `${meta.title} | CreatorOS`;

... [truncated at 150 lines — full file is 910 lines] ...
```

## FILE: client/src/lib/queryClient.ts
> 160 lines total — showing first 150 lines

```typescript
import { QueryClient, QueryFunction, MutationCache, QueryCache } from "@tanstack/react-query";
import { offlineStore } from './offline-store';
import { startProgress, stopProgress } from "@/components/GlobalProgress";

let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;

async function getCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = fetch("/api/security/csrf-token", { credentials: "include" })
    .then(r => r.json())
    .then(d => { csrfToken = d.csrfToken; return csrfToken; })
    .catch(() => null)
    .finally(() => { csrfFetchPromise = null; });
  return csrfFetchPromise;
}

let sessionExpiredHandled = false;

function handleSessionExpired() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  queryClient.cancelQueries();
  queryClient.clear();
  const event = new CustomEvent('session-expired');
  window.dispatchEvent(event);
  setTimeout(() => {
    sessionExpiredHandled = false;
    window.location.replace("/");
  }, 2500);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const headers: Record<string, string> = {};
    if (data) headers["Content-Type"] = "application/json";
    if (method !== "GET" && method !== "HEAD") {
      const token = await getCsrfToken();
      if (token) headers["X-CSRF-Token"] = token;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    if (res.status === 403) {
      const body = await res.clone().text();
      if (body.includes("csrf_invalid") || body.includes("csrf_missing")) {
        csrfToken = null;
        const newToken = await getCsrfToken();
        if (newToken) {
          headers["X-CSRF-Token"] = newToken;
          const retry = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined, credentials: "include" });
          await throwIfResNotOk(retry);
          return retry;
        }
      }
    }
    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    if (!navigator.onLine && method !== 'GET') {
      await offlineStore.queueAction({ method, url, body: data });
      return new Response(JSON.stringify({ queued: true, offline: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>({ on401: unauthorizedBehavior }: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  return async ({ queryKey }) => {
    const url = queryKey.join("/") as string;

    if (!navigator.onLine) {
      const cached = await offlineStore.getCachedResponse(url);
      if (cached !== null) return cached as T;
      return null as T;
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();

    offlineStore.cacheResponse(url, data, 120).catch(() => {});

    return data;
  };
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const key = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
      if (error.message?.startsWith("401:") && key === "/api/auth/user") {
        handleSessionExpired();
      }
    },
  }),
  mutationCache: new MutationCache({
    onMutate: () => { startProgress(); },
    onSuccess: () => { stopProgress(); },
    onError: (error) => {
      stopProgress();
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        const msg = error.message || "";
        if (msg.startsWith("401:") || msg.startsWith("403:") || msg.startsWith("404:") || msg.startsWith("422:") || msg.startsWith("500:")) {
          return false;
        }
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.startsWith("502:") || msg.startsWith("503:") || msg.startsWith("504:") || msg.startsWith("429:")) {
          return failureCount < 4;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => {

... [truncated at 150 lines — full file is 160 lines] ...
```

## FILE: client/src/lib/offline-engine.ts
> 253 lines total — showing first 150 lines

```typescript
import { offlineStore } from './offline-store';
import { apiRequest } from '@/lib/queryClient';

type ConnectionStatus = 'online' | 'offline' | 'unstable';
type StatusListener = (status: ConnectionStatus) => void;
type SyncListener = (event: { type: string; count?: number; error?: string }) => void;

let currentStatus: ConnectionStatus = navigator.onLine ? 'online' : 'offline';
const statusListeners: Set<StatusListener> = new Set();
const syncListeners: Set<SyncListener> = new Set();
let automationInterval: ReturnType<typeof setInterval> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let stabilityCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTime: string | null = null;
let isSyncing = false;
let isAuthenticated = false;

function setStatus(s: ConnectionStatus) {
  if (s !== currentStatus) {
    currentStatus = s;
    statusListeners.forEach(fn => fn(s));
    if (s === 'online' && !isSyncing) {
      syncQueue();
    }
  }
}

async function checkStability(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function syncQueue() {
  if (isSyncing || currentStatus === 'offline' || !isAuthenticated) return;
  isSyncing = true;
  syncListeners.forEach(fn => fn({ type: 'sync_start' }));

  try {
    const pending = await offlineStore.getPendingQueue();
    if (pending.length === 0) {
      isSyncing = false;
      syncListeners.forEach(fn => fn({ type: 'sync_complete', count: 0 }));
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if ((currentStatus as string) === 'offline') break;
      try {
        await offlineStore.updateQueueItem(item.id!, { status: 'syncing' });
        const res = await apiRequest(item.method as any, item.url, item.body || undefined);
        if (res.ok) {
          await offlineStore.updateQueueItem(item.id!, { status: 'done' });
          synced++;
        } else if (res.status >= 500) {
          const retries = (item.retries || 0) + 1;
          await offlineStore.updateQueueItem(item.id!, {
            status: retries >= 3 ? 'failed' : 'pending',
            retries,
            error: `HTTP ${res.status}`,
          });
          if (retries < 3) failed++;
        } else {
          await offlineStore.updateQueueItem(item.id!, {
            status: 'failed',
            error: `HTTP ${res.status}`,
          });
          failed++;
        }
      } catch {
        const retries = (item.retries || 0) + 1;
        await offlineStore.updateQueueItem(item.id!, {
          status: retries >= 3 ? 'failed' : 'pending',
          retries,
          error: 'Network error',
        });
      }
    }

    await offlineStore.clearCompletedQueue();
    lastSyncTime = new Date().toISOString();
    await offlineStore.setSetting('lastSyncTime', lastSyncTime);
    syncListeners.forEach(fn => fn({ type: 'sync_complete', count: synced }));
  } catch (err) {
    syncListeners.forEach(fn => fn({ type: 'sync_error', error: String(err) }));
  } finally {
    isSyncing = false;
  }
}

async function runDueAutomations() {
  if (!isAuthenticated) return;
  try {
    const due = await offlineStore.getDueAutomationTasks();
    for (const task of due) {
      try {
        if (currentStatus === 'online') {
          await fetch(`/api/automation/run/${task.id}`, {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {});
        } else {
          await offlineStore.queueAction({
            method: 'POST',
            url: `/api/automation/run/${task.id}`,
          });
        }

        const now = new Date();
        let nextRun: Date;
        if (task.type === 'interval' && task.intervalMs) {
          nextRun = new Date(now.getTime() + task.intervalMs);
        } else {
          nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }

        await offlineStore.updateAutomationTask(task.id, {
          lastRun: now.toISOString(),
          nextRun: nextRun.toISOString(),
        });
      } catch {}
    }
  } catch {}
}

async function preloadData() {
  if (currentStatus !== 'online') return;

  const endpoints = [
    '/api/channels',
    '/api/videos',
    '/api/ai-results',
    '/api/notifications',
    '/api/cron-jobs',
  ];

  for (const url of endpoints) {

... [truncated at 150 lines — full file is 253 lines] ...
```

## FILE: client/src/hooks/use-login-sync.ts
```typescript
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

const SYNC_COOLDOWN_KEY = "creatoros_last_login_sync";
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 24;

export function useLoginSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const syncTriggered = useRef(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "complete" | "error">("idle");

  useEffect(() => {
    if (isLoading || !user || syncTriggered.current) return;

    const lastSync = localStorage.getItem(SYNC_COOLDOWN_KEY);
    if (lastSync && Date.now() - parseInt(lastSync, 10) < SYNC_COOLDOWN_MS) {
      return;
    }

    syncTriggered.current = true;
    setSyncStatus("syncing");

    const pollStatus = async (attempt: number): Promise<void> => {
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setSyncStatus("complete");
        queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/revenue"] });
        return;
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const statusRes = await fetch("/api/sync/status", { credentials: "include" });
        if (!statusRes.ok) {
          setSyncStatus("complete");
          return;
        }

        const statusData = await statusRes.json();
        if (statusData.status === "complete") {
          setSyncStatus("complete");
          queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/content"] });
          queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
          toast({
            title: "Sync complete",
            description: "All your platform data is up to date.",
          });
          return;
        }

        return pollStatus(attempt + 1);
      } catch {
        setSyncStatus("complete");
      }
    };

    const runSync = async () => {
      try {
        const res = await apiRequest("POST", "/api/sync/login");

        if (!res.ok) {
          setSyncStatus("error");
          return;
        }

        const data = await res.json();
        localStorage.setItem(SYNC_COOLDOWN_KEY, String(Date.now()));

        if (!data.alreadyRunning) {
          toast({
            title: "Syncing your platforms",
            description: `Pulling latest data from ${data.results?.connectedPlatforms || "your"} connected platforms...`,
          });
        }

        await pollStatus(0);
      } catch (err) {
        setSyncStatus("error");
        console.error("[LoginSync] Failed:", err);
      }
    };

    runSync();
  }, [user, isLoading, toast, queryClient]);

  return { syncStatus };
}

```

---

# 4. Audit Report

# CreatorOS — AI Audit Report
**Generated:** 2026-03-04T13:14:45.282Z  
**Model:** gpt-5-mini  
**Sections audited:** 8  

---

# PART 1: PRIORITY ISSUES

## 🔴 CRITICAL
1. Broken/unsafe webhook HMAC verification (server/services/webhook-verify.ts)
   - The HMAC verification compares hex/base64 strings incorrectly (wrong Buffer.from usage) and sometimes throws or returns mismatching results; some code paths then return true for exceptions. This makes webhook signature checks unreliable and can allow forged webhooks (billing/fulfillment/security events) or drop valid events. Fix: compute and compare raw digest Buffers (use digest() to get Buffer, or Buffer.from(..., encoding)), guard timingSafeEqual against differing lengths, and fail-closed on errors.

2. Uncaught OpenAI/network errors in callAI → crashing route handlers (server/routes/upgrades.ts)
   - The OpenAI network call is not wrapped in try/catch (only the JSON.parse is), so network/SDK failures or unexpected response shapes throw uncaught exceptions that bubble to route handlers and cause 500s and potentially process instability. Fix: wrap the entire external call + response parsing in try/catch, validate response shape before accessing nested fields, and return/throw a handled error.

3. Runtime crash due to undefined identifier in detectContentContext (server/ai-engine.ts)
   - detectContentContext references undefined variable "desc" (should be description), causing a ReferenceError on invocation and breaking any code path that relies on content-context detection. Fix: use the correct parameter variable, add unit tests, and run TypeScript/ESLint checks to catch such regressions.

## 🟠 HIGH
1. Webhook Discord verification accepts events on exceptions / incorrect verification (server/services/webhook-verify.ts)
   - verifyDiscordWebhook swallows errors and returns valid:true on exceptions and uses incorrect key/format handling. This is an authentication bypass—attackers can send forged Discord webhooks. Fix: implement correct Ed25519 verification (tweetnacl or proper crypto usage), do not return valid:true on exceptions, and log/security-alert failures.

2. Platform-wide Stripe data exposed to any authenticated user (server/routes/money.ts)
   - Endpoints return raw SELECT * FROM stripe.payment_intents and platform Stripe balance to any authenticated user. This leaks sensitive financial data. Fix: restrict to admin-only access or scope queries to the authenticated user and add proper authorization checks.

3. Idempotency cache leaks and mis-specified keys (server/lib/security-hardening.ts)
   - idempotencyGuard caches/returns bodies keyed by (user?.sub || req.ip). For unauthenticated requests this allows NAT-shared IPs to receive other users’ cached responses; cached replay also omits original status and headers. Fix: require trusted authenticated identifier, include status+headers in cache, enforce bounded cache size or use a central idempotency store.

4. Response scrubber skips arrays and fails to sanitize nested arrays (server/lib/security-hardening.ts)
   - responseSecurityScrubber explicitly skips arrays so lists of objects containing secrets can leak. Fix: sanitize arrays and nested structures uniformly and add tests for array responses.

5. Untrusted regexes from DB executed synchronously (ReDoS risk) (server/services/security-fortress.ts)
   - matchThreatPatterns constructs RegExps from DB signatures and runs them synchronously on the event loop, with per-match DB updates (N+1). A malicious/complex regex can cause catastrophic backtracking (ReDoS) or CPU starvation. Fix: validate and constrain regexes at insertion, precompile with safe limits or run matching in worker threads, and batch/async writes for hit counts.

6. Trusting client header for user identity in rate limiter (server/routes/helpers.ts)
   - rateLimitEndpoint uses an untrusted "x-replit-user-id" header to derive user identity (fallback to req.ip), enabling spoofing/bypass or impersonation for rate limits. Fix: derive identity from server-trusted auth (session token/req.user), include method+normalized path in key, and move to a distributed store for cross-instance enforcement.

7. Usage metering fails open on DB errors (server/services/usage-metering.ts)
   - On database errors trackUsage returns allowed:true and an extremely high limit, allowing quota bypass during DB outages enabling billing/abuse spikes. Fix: fail-closed or apply conservative fallback limits, surface/alert DB failures, or use a local conservative limiter.

8. Mass-assignment via .passthrough() in many update endpoints (routes/*)
   - Several update routes use zod .passthrough() and pass the result directly to storage.update*, enabling clients to change protected fields (owner, flags). Fix: replace with explicit update schemas or sanitize before persisting and ensure storage enforces a whitelist.

9. Missing ownership checks for videos (server/routes/content.ts)
   - GET/PUT /api/videos/:id validate channel ownership only when channelId exists; when channelId is null they do not ensure video.userId === authenticatedUserId, allowing IDOR. Fix: always verify resource owner and return 403/404 when mismatched.

10. Stripe promo/trial state kept only in-memory and racy (server/services/stripe-hardening.ts)
    - applyPromoCode uses in-memory currentUses, appliedPromos, trialHistory—no persistence/atomicity. This allows replays on restart and race conditions across concurrent requests, causing revenue loss. Fix: move counters to DB with atomic transactions/upserts and enforce promo applicability to user tier.

11. Stripe client startup/env + concurrency risks (server/stripeClient.ts)
    - getCredentials/new URL building uses process.env.REPLIT_CONNECTORS_HOSTNAME without validation (TypeError if undefined). getStripeSync uses a module-level cache without concurrency-safety, allowing double initialization. Fix: validate envs early, fail-fast with clear errors, and use an atomic Promise-initializer pattern for singleton creation.

12. OAuth token event handler with unhandled rejections (server/youtube.ts)
    - oauth2Client.on("tokens", async ...) performs await storage.updateChannel(...) without try/catch; rejections produce unhandled promise rejections. Fix: wrap handler body in try/catch and log/handle failures.

13. Overlapping agent runs (agent-orchestrator & stream-agent) cause duplicated work/races (server/services/agent-orchestrator.ts, server/services/stream-agent.ts)
    - Agents scheduled via setInterval call async runners without preventing overlap; long runs start new runs concurrently. This leads to duplicated external calls, resource exhaustion, and race conditions. Fix: adopt self-scheduling loop that awaits completion, or an in-progress lock to skip overlapping runs; add per-user locks and timeouts.

14. VOD optimizer queries filter channels in-memory, not in DB (server/vod-optimizer-engine.ts)
    - findOptimizableVods queries only by createdAt and then filters channelId in-memory (limit applied before filter), so users miss eligible videos. Fix: include channelId IN (...) in DB query and limit/results server-side.

15. Frontend offline sync and login-sync bypass CSRF (client/src/lib/offline-engine.ts, client/src/hooks/use-login-sync.ts)
    - syncQueue() and runSync() use fetch directly for state-changing POST/PUT/DELETE without CSRF tokens, causing 403s and broken offline sync or inconsistent CSRF behavior. Fix: use apiRequest(...) or include CSRF via getCsrfToken and retry on csrf_missing.

16. Autoplay/AI token-limit parameter inconsistency across modules (server/autopilot-engine.ts, server/auto-thumbnail-engine.ts, others)
    - Multiple modules use wrong parameter name (max_completion_tokens vs max_tokens) and inconsistent OpenAI parameter usage; calls may be ignored or fail, causing unbounded/incorrect responses and cost/behavior surprises. Fix: centralize OpenAI wrapper with consistent params, update calls to use correct param for installed SDK.

17. OAuth/async handler race on start/stop leading to overlapping runs (server/services/agent-orchestrator.ts stop/start)
    - stopUserAgentSession clears intervals but does not wait for in-flight runs; start immediately begins new intervals which interleave with running tasks. Fix: await in-flight promises or signal cancellation before starting.

## 🟡 MEDIUM
1. DB transient-error matching is brittle/case-sensitive (server/db.ts isTransientDbError/withRetry)
   - Current substring matching misses casing/format variants and prevents legitimate retries. Fix: normalize toLowerCase, consider token or regexp matching, log original errors.

2. Pool-level timeouts may not be applied reliably via Pool constructor (server/db.ts)
   - statement_timeout/query_timeout in Pool options are not uniformly supported; queries may hang. Fix: set statement_timeout on client connect or pass timeout per-query and add tests.

3. withRetry around DB operations lacks client-refresh/context and limited error wrapping (server/db.ts)
   - Retries don't recreate client state or wrap errors with context; add context/attempt count, reset clients between retries, and ensure delays are cancellable.

4. OpenAI retry-after parsing not robust (server/lib/openai.ts)
   - parseInt on Retry-After can produce NaN; needs to support HTTP-date formats and fallback to exponential backoff with bounds.

5. Pagination implemented in-memory for videos (server/routes/content.ts)
   - GET /api/videos loads all videos then slices—doesn't scale. Fix: move pagination into DB (LIMIT/OFFSET or cursor).

6. POST /api/videos not attaching authenticated userId (server/routes/content.ts)
   - New videos may be orphaned or accept client-supplied userId. Fix: attach authenticated userId server-side.

7. createAIRateLimiter doing auth inline and possibly hanging (server/routes/upgrades.ts)
   - Middleware calls requireAuth synchronously and may hang or duplicate auth. Fix: run auth as separate middleware or have consistent requireAuth behavior.

8. AdjustPlatformVoice can drop content if first sentence > limit (server/stealth-guardrails.ts)
   - The function can return empty string. Fix: ensure at least one sentence (truncate first sentence if needed).

9. REP_EVENTS fractional delta vs logic in updateIpReputation (server/services/security-fortress.ts)
   - fractional 0.1 causes unintended DB writes; set correct zero or support floats consistently.

10. matchThreatPatterns invoked for listing (routes/fortress.ts)
    - GET /api/fortress/threat-patterns calls matchThreatPatterns("") and mutates hitCount. Fix: implement proper list query and avoid mutating counters.

11. generateThumbnailPrompt/OpenAI param name (auto-thumbnail + background engines)
    - Wrong param name may be ignored; consolidated with other OpenAI param inconsistencies.

12. Thumbnail metadata conflates failed attempts as generated (server/auto-thumbnail-engine.ts)
    - Marks autoThumbnailGenerated=true on failures. Fix: separate success/failure flags and add attemptCount/retryBackoff.

13. Content loop cancellation not cooperative (server/content-loop.ts)
    - onLivestreamDetected sets a flag but long-running iteration doesn't check it. Fix: pass AbortSignal and check cooperatively.

14. extractAndSanitizeJSON() heuristics may mangle AI output (server/daily-content-engine.ts)
    - Heuristic regex replacements are brittle. Fix: use tolerant parser, log raw outputs and add tests.

15. webhook event dedup race (server/webhookHandlers.ts)
    - read-then-insert dedupe is racy; unique-constraint errors not handled. Fix: use upsert/ON CONFLICT DO NOTHING or catch 23505 and treat as already-processed.

16. Several webhook verification functions silently skip verification when env var missing (server/services/webhook-verify.ts)
    - They return valid:true when secret not set. Fix: fail-closed in prod or loudly warn; only allow skip in explicit dev mode.

17. YouTube quota reset calculation via locale string is brittle (server/services/youtube-quota-tracker.ts)
    - toLocaleString -> new Date(localeStr) is unreliable. Fix: use timezone-aware library or formatToParts to compute Pacific midnight accurately.

18. parseNumericId treats "" as 0 (server/routes/helpers.ts)
    - Use parseInt with trim and reject empty strings.

19. getStripeSync and other singletons should use Promise-initializer pattern (server/stripeClient.ts)
    - Merge with concurrency high issue but keep here as medium actionable pattern.

20. many AI-response JSON.parse assumptions (server/youtube-manager.ts and others)
    - Check typeof content before parse to avoid throwing and silently returning empty objects.

## 🟢 LOW
1. Type widening of derived platform arrays (shared/schema.ts)
   - filter results widen to string[]; cast to Platform[] or use typed helper to preserve literal types.

2. JSONB defaults using JS objects may generate incorrect migrations (shared/schema.ts)
   - Use sql`'{}'::jsonb` or apply defaults application-side and add migration tests.

3. sanitizeResponseData SENSITIVE_FIELDS casing fragile (server/lib/security-hardening.ts)
   - Normalize SENSITIVE_FIELDS to lowercase and compare normalized keys.

4. stripe.seed pagination limit assumption (server/stripe-seed.ts)
   - limit:100 assumption; add pagination and remove unused flags.

5. agentStates not removed on stop (server/services/stream-agent.ts)
   - Memory leak / stale state; prune or TTL stale entries.

6. start/stop engine event listeners not removed (client/src/lib/offline-engine.ts)
   - stop() doesn't remove listeners causing leaks; track and remove bound listeners.

7. getQueryFn returns null for offline cache misses (client/src/lib/queryClient.ts)
   - Return default-shaped values or throw clear offline error; audit UI for null-safe handling.

8. logout implementation navigation semantics (client/src/hooks/use-auth.ts)
   - window.location.href = '/api/logout' breaks mutation lifecycle handlers; either perform API call then navigate or document.

9. password toggle tabIndex accessibility issue (client/src/components/AuthForm.tsx)
   - tabIndex={-1} removes keyboard access; remove it for accessibility.

10. minor sync lifecycle bug syncTriggered never reset (client/src/hooks/use-login-sync.ts)
    - Reset flag on completion/error so login-sync can re-run within same page/session.

11. youtube refreshAllUserChannelStats falsy numeric checks (server/youtube.ts)
    - Use pd.videoCount != null instead of truthiness to allow zero values.

12. multistream API may return unresolved Promises (server/routes/multistream.ts)
    - Ensure await for async functions before res.json and when stopping streams.

13. minor stream go-live platforms normalization mismatch (server/routes/stream.ts)
    - Normalize platforms before creating/persisting job payload to avoid undefined fields.

Executive Summary
The codebase contains several high-severity security and production-stability issues clustered around webhook verification, third-party API error handling, auth/rate-limit boundaries, and payment/tier enforcement. Three critical faults need immediate remediation (broken webhook HMAC verification, uncaught OpenAI/network errors in a payments path, and a runtime ReferenceError in content detection) because they either undermine security or will crash core flows. Beyond those, multiple high-impact issues (IDORs, mass-assignment, fail-open metering, untrusted regex execution, and in-memory financial state) could lead to data leaks, revenue loss, or large-scale outages — prioritize fixes that close trust boundaries, enforce server-side authorizations, and harden external API calls. After those, address concurrency/scheduling defects (agent overlaps, singleton races), centralize OpenAI usage, and add unit/integration tests that simulate missing envs, malformed external responses, and concurrent requests to prevent regressions.

---

# PART 2: DETAILED FINDINGS BY SECTION

## Section 1: Database Schema & Storage
*Files: shared/schema.ts, server/db.ts, server/storage.ts*

---FINDING---
Severity: HIGH
File: server/db.ts
Line: 1-200 (function isTransientDbError / withRetry)
Category: Production Risk
Problem: Transient DB error detection is case-sensitive and uses a brittle substring match. isTransientDbError(msg) does TRANSIENT_DB_ERRORS.some(p => msg.includes(p)) on the raw error message, but many DB driver error messages vary in casing and formatting (e.g. "Connection Refused", "connection refused", or include extra context). As written this will miss transient errors and prevent retries for errors that should be retried.
Impact: Legitimate transient errors will be treated as fatal. This increases the likelihood of failed requests instead of retrying, leading to degraded availability and possibly higher error rates under transient network / DB instability.
Fix: Normalize both sides before comparison (lowercase the message and the patterns) and match on tokens rather than fragile substrings where possible. Example:
  const msgL = (msg || "").toLowerCase();
  return TRANSIENT_DB_ERRORS.some(p => msgL.includes(p.toLowerCase()));
Also consider trimming/normalizing whitespace and logging the original message for debugging. Optionally replace substring checks with a set of compiled RegExps for stronger matching of common transient conditions.

---END---

---FINDING---
Severity: MEDIUM
File: server/db.ts
Line: 1-80 (Pool constructor)
Category: Production Risk
Problem: The Pool constructor includes fields statement_timeout and query_timeout at the top-level options object. node-postgres (pg) does not always apply these as client-level defaults when passed to the Pool constructor; support depends on pg version and driver configuration. If these don't take effect, long-running queries may not be bounded as intended.
Impact: Queries may hang or run much longer than expected despite these settings, leading to stuck clients, pool exhaustion, higher latency and degraded throughput. The code's retry/backoff assumptions and timeouts rely on these being effective.
Fix: Ensure these timeouts are applied in a supported way:
  - For statement_timeout apply a client-side SET on connect: pool.on('connect', client => client.query(`SET statement_timeout = ${value}`));
  - For query-level timeout use pg Pool's query_timeout option (ensure pg version supports it) or pass timeout via query config.
  - Add unit/integration tests verifying timeouts are enforced in your pg version. Document the pg version requirement if relying on these options.

---END---

---FINDING---
Severity: MEDIUM
File: server/db.ts
Line: 1-120 (withRetry)
Category: Production Risk
Problem: withRetry(fn) retries only on matches from isTransientDbError and uses increasing backoff, but it treats any non-matching error as terminal and rethrows the last error without wrapping or preserving context. It also retries the whole operation without taking any action to reset/refresh DB connections or client state between attempts.
Impact: Some transient failures will be misclassified (see previous finding) and even when retried, resources may be left in a bad state (for example, half-open client) causing repeated failures. Lack of additional logging/context makes debugging harder.
Fix: Improve withRetry:
  - Normalize error matching (see previous fix).
  - When retrying, consider recreating/clearing client state if applicable (or opening a new pooled client inside the retried function).
  - Add more context to the thrown error (wrap with label/attempt count).
  - Ensure awaited delays are cancellable in shutdown and respect process signals if applicable.
  - Log stack traces for the final failure to aid debugging.

---END---

---FINDING---
Severity: LOW
File: shared/schema.ts
Line: ~1-260 (PLATFORMS and derived arrays)
Category: Logic Bug
Problem: Derived platform arrays (VIDEO_PLATFORMS, TEXT_ONLY_PLATFORMS, LIVE_STREAM_PLATFORMS) are created using Array.prototype.filter without typing them as readonly tuple or as Platform[]. That makes their static type widen to string[] instead of Platform[]/readonly, losing strictness and increasing risk of accidental misuse elsewhere.
Impact: TypeScript will treat these as plain string[] which weakens type-safety and can hide incorrect uses of platform values elsewhere in the codebase.
Fix: Cast the results to Platform[] or use a typed helper:
  export const VIDEO_PLATFORMS = PLATFORMS.filter(... ) as Platform[];
Or compute with a helper that preserves the literal union. This ensures downstream consumers get precise platform typing.

---END---

---FINDING---
Severity: LOW
File: shared/schema.ts
Line: ~1-300 (JSONB column defaults)
Category: Code Quality / Production Risk
Problem: Several jsonb columns use .default({ ... }) with plain JavaScript objects (for example channels.settings, streamDestinations.settings, streams.platforms default to []). Depending on the version/usage of Drizzle and how migrations are generated, supplying JS objects/arrays directly as .default() can lead to unexpected migration SQL or unsupported defaults in Postgres (the ORM may expect sql(...) defaults or JSON text).
Impact: Generated migrations could contain incorrect SQL for defaults or the defaults may not be applied at the DB level, leading to surprising null/undefined values at runtime or migration failures.
Fix: Verify how drizzle-orm serializes JS defaults in your deployment. To be explicit, use sql`'{}'::jsonb` or sql`'[]'::jsonb` for JSON defaults in schema definitions, or set defaults in application code at insert time. Add migration tests to assert the generated SQL is correct for your Postgres version.

---END---

SUMMARY
Overall the schema and DB connection code is well-structured and leverages Drizzle and pg Pool sensibly. I found no obvious critical security vulnerabilities in the snippets provided (no direct SQL string concatenation or exposed secrets in the code shown). The most important issues are operational: (1) brittle transient-error detection that can prevent retries when the DB/ network is flaky and (2) potential misconfiguration/assumption about Pool-level timeout settings. Both can cause availability problems in production and should be addressed first. Several lower-risk items (typing precision and explicit JSON default handling) should be fixed to improve maintainability and avoid migration/runtime surprises. If you want, I can review the rest of storage.ts implementations (query logic) to find query-level bugs, SQL patterns, and potential N+1/pagination/authorization issues.

---

## Section 2: Authentication & Security
*Files: server/replit_integrations/auth/index.ts, server/lib/security-hardening.ts, server/stealth-guardrails.ts, server/services/security-fortress.ts, server/routes/fortress.ts, server/routes/helpers.ts, server/token-refresh.ts*

---FINDING---
Severity: HIGH
File: server/routes/helpers.ts
Line: 124
Category: Security
Problem: The in-memory rateLimitEndpoint middleware trusts an untrusted HTTP header ("x-replit-user-id") to identify users for rate-limiting: const userId = req.headers["x-replit-user-id"] || req.ip;. An attacker can spoof that header to impersonate another user for rate limits (bypass/evade limits or trigger limits for others). Also the per-key is only req.path (ignores method/params), making limits easy to bypass by changing path variants.
Impact: Attackers can bypass rate limits by setting a fake x-replit-user-id header or evade/shift throttling, enabling abuse (scraping, brute force, DoS). Legitimate users may be penalized if an attacker sets their ID header. This is a high-risk trust boundary violation.
Fix: Derive identity from a trusted source — authenticated session (req.user.claims.sub) or a server-signed token. Remove reliance on client-provided headers for identity. Also include method and normalized params/query or a route+method key when scoping rate limits to reduce bypassability. Document that in-memory limits are best-effort and strong enforcement requires a central store (Redis) for distributed systems.

---END---

---FINDING---
Severity: HIGH
File: server/lib/security-hardening.ts
Line: 221
Category: Security
Problem: responseSecurityScrubber only sanitizes response bodies that are plain objects and explicitly skips arrays (if (body && typeof body === "object" && !Array.isArray(body))). Arrays of objects are common API responses and will not be scrubbed, allowing sensitive fields (tokens, secrets) to be leaked inside arrays.
Impact: Sensitive fields inside arrays (e.g., lists of records containing tokens/keys) will bypass sanitization and be returned to clients or logs, exposing secrets and causing compliance/security incidents.
Fix: Sanitize arrays as well — call sanitizeResponseData on arrays and all nested structures. Change the condition to always sanitize any object/array (e.g., if (body && typeof body === "object") { const scrubbed = sanitizeResponseData(body); ... } ). Add tests for arrays of sensitive objects.

---END---

---FINDING---
Severity: HIGH
File: server/services/security-fortress.ts
Line: 1020
Category: Performance | Security
Problem: matchThreatPatterns constructs RegExp objects directly from database-stored signatures: const matched = new RegExp(p.signature, "i").test(input); This runs arbitrary (untrusted) regex patterns on input synchronously in the event loop without safeguards.
Impact: A malicious or malformed regex in the DB can cause catastrophic backtracking (ReDoS) or CPU starvation, blocking the Node event loop and affecting the whole server. Even well-formed but complex regexes can be expensive. The code also performs a db.update(hitCount) inside the loop for every match (N+1 writes).
Fix: Validate and compile/limit regexes on insertion (registerThreatPattern), store a safe compiled representation or limit allowed constructs. Use a regex engine with timeouts or run expensive matching in a worker thread/process. Avoid synchronous/uncapped regex execution on critical request paths. Batch DB updates for hitCount (increment counters in memory and flush) to avoid N+1 writes.

---END---

---FINDING---
Severity: HIGH
File: server/lib/security-hardening.ts
Line: 149
Category: Logic Bug | Security
Problem: idempotencyGuard caches successful JSON responses and returns them on repeated idempotency keys, but the cache key is built using (req as any).user?.claims?.sub || req.ip. For unauthenticated requests this falls back to req.ip, which is often NAT-shared; the middleware returns cached bodies without re-validating authentication or headers and does not preserve response status or headers (Set-Cookie, auth headers). Also the cache has no max size limit (memory risk).
Impact: Shared IPs (corporate/NAT) can receive other users' cached responses, leaking private data. Important headers (cookies, auth headers, rate-limit headers, content-type) and status codes from the original response are lost when replaying cached body, causing functional and security regressions. Memory may grow unbounded for many idempotency keys.
Fix: Only enable idempotency for authenticated sessions (require a validated user id) or derive the key from a trusted user identifier. When replaying cached responses, include and restore status code and headers (or at least Content-Type and any auth-related headers) and ensure sensitive headers are not leaked. Enforce a bounded cache size and/or persist idempotency entries in a central store with eviction. Consider scoping idempotency strictly to endpoints that are safe to replay.

---END---

---FINDING---
Severity: MEDIUM
File: server/routes/fortress.ts
Line: 120
Category: Logic Bug
Problem: GET /api/fortress/threat-patterns is implemented by calling matchThreatPatterns("") which attempts to match all enabled patterns against an empty string rather than returning the list of threat patterns. matchThreatPatterns also increments hitCount for matches — an odd side effect for a read endpoint.
Impact: The route does not return the intended list of threat patterns and may incorrectly mutate pattern hit counters. Admins calling this endpoint will get an incomplete/incorrect view and hit counts will be skewed.
Fix: Implement the GET endpoint to query and return threatPatterns from the DB (e.g., a service function listThreatPatterns) instead of matchThreatPatterns. Do not mutate hitCount on simple listing calls; reserve hitCount increments for real detection events.

---END---

---FINDING---
Severity: MEDIUM
File: server/stealth-guardrails.ts
Line: 66
Category: Logic Bug
Problem: adjustPlatformVoice for platform "x" attempts to reduce content length by concatenating sentences until <250 chars. If the very first sentence is longer than 250 characters, the loop will not append it and the function returns shortened.trim(), which may be an empty string — effectively dropping the content.
Impact: For long first-sentence inputs the returned content can be empty, causing data loss (users' content disappeared) and confusing downstream consumers.
Fix: Ensure at least one sentence is preserved. For example, if the first sentence alone exceeds the limit, truncate it to the allowed length instead of returning an empty string. Add unit tests covering long-single-sentence inputs.

---END---

---FINDING---
Severity: MEDIUM
File: server/services/security-fortress.ts
Line: 46
Category: Logic Bug
Problem: REP_EVENTS maps "normal_request" to 0.1 (a fractional delta). updateIpReputation treats any non-zero delta as actionable; it uses delta === 0 to early-return. The fractional 0.1 will therefore cause the function to run, increment totalRequests, and potentially cause fractional reputationScore arithmetic and unexpected behavior (design intent likely to have 0).
Impact: Reputation calculations may accumulate fractional deltas, create unexpected reputationScore values, and run extra DB writes for what probably should be a no-op event.
Fix: If "normal_request" should be a no-op, set it to 0. If fractional reputation adjustments are intended, ensure the system consistently supports floating scores and that early-return logic is correct. Document and test the behavior.

---END---

---FINDING---
Severity: MEDIUM
File: server/routes/helpers.ts
Line: 18
Category: Logic Bug
Problem: parseNumericId uses Number(raw) which treats empty string ("") as 0. If req.params.id is missing or an empty string this will return 0 (valid) rather than producing an error. This can silently accept invalid IDs.
Impact: Endpoints using parseNumericId may treat missing parameters as id=0 and operate on resource 0, potentially producing incorrect behavior or leaking data for id 0.
Fix: Use a stricter parser: parseInt(raw, 10) after trimming, and reject empty strings explicitly (if raw.trim() === "" -> invalid). Also validate id > 0 if appropriate.

---END---

---FINDING---
Severity: LOW
File: server/lib/security-hardening.ts
Line: 54
Category: Code Quality | Production Risk
Problem: sanitizeResponseData checks SENSITIVE_FIELDS.has(lowerKey) but the SENSITIVE_FIELDS set contains mixed/camelCase names; using lowerKey rarely matches those mixed-case entries (e.g., "accessToken" vs "accesstoken"). The code does also check SENSITIVE_FIELDS.has(key), but checking lowerKey against the original set is redundant and fragile.
Impact: Potentially some fields may not be recognized and redacted if naming variations are present; however many checks also use substrings so impact is limited.
Fix: Normalize SENSITIVE_FIELDS to all-lowercase and only check normalized keys (e.g., populate set with lowercased entries and compare only lowerKey). This simplifies logic and reduces missed matches.

---END---

SUMMARY
Overall the authentication & security section contains many well-intentioned defenses (sanitizers, idempotency, anomaly detectors, IP reputation, threat patterns), but there are several high-impact issues that must be addressed before production:

- Critical trust boundary mistakes: using an untrusted client header to identify users for rate-limiting (easy bypass/abuse).
- Response scrubbing gaps that skip arrays and can leak secrets.
- Idempotency cache and replay logic that can leak data across users and fails to preserve headers/status.
- Running untrusted regexes synchronously from DB without safeguards (ReDoS risk).
- Several logic bugs that can drop content or skew analytics (threat-patterns listing, "x" platform trimming, fractional reputation delta).

I recommend prioritizing fixes in this order: 1) stop trusting client headers for identity, 2) fix response scrubbing to cover arrays, 3) rework idempotency caching to bind to authenticated users and preserve full response metadata, 4) defend against untrusted regex execution (compile-time validation, worker threads, or safe regex libs), and 5) correct logic bugs in routes and guardrails. Also add unit/integration tests for the sanitizer, idempotency, and rate-limiter behavior (including shared NAT cases).

---

## Section 3: Payments & Subscriptions
*Files: server/stripeClient.ts, server/stripe-seed.ts, server/services/stripe-hardening.ts, server/routes/upgrades.ts, server/services/usage-metering.ts*

---FINDING---
Severity: CRITICAL
File: server/routes/upgrades.ts
Line: N/A
Category: Broken Code
Problem: The callAI() function performs the network call to OpenAI (await openai.chat.completions.create(...)) outside of any try/catch, and only wraps the JSON.parse of the response in a try/catch. If the OpenAI call fails (network error, rate-limit, SDK error) or returns a response missing choices, the function will throw and that exception is not caught inside callAI, causing the error to bubble up to the route handler stack.
Impact: An unhandled rejection/exception from the OpenAI API will crash the enclosing async route handler (or at least propagate to the top-level error handler). This will result in 500 responses and could produce noisy errors or potentially crash the process depending on higher-level error handling.
Fix: Wrap the entire OpenAI call and response parsing in a single try/catch. Validate the shape of response (ensure response.choices and response.choices[0] exist) before accessing nested fields. Return a sensible error object or throw a typed error that route handlers can handle gracefully. Example: try { const response = await openai...; if (!response.choices?.[0]?.message?.content) throw new Error('unexpected response'); return JSON.parse(...); } catch (err) { log and return/throw a handled error }.
---END---

---FINDING---
Severity: HIGH
File: server/stripeClient.ts
Line: N/A
Category: Production Risk
Problem: getCredentials() constructs a URL using process.env.REPLIT_CONNECTORS_HOSTNAME without validating it's set. new URL(`https://${hostname}/api/v2/connection`) will throw a TypeError if hostname is undefined/empty.
Impact: If the environment variable is missing or empty (e.g., misconfigured deployment), the function will throw synchronously when invoked, causing any startup or runtime code that calls getCredentials/getStripe* to fail. This can create hard-to-diagnose crashes on boot.
Fix: Validate process.env.REPLIT_CONNECTORS_HOSTNAME early and throw a clear error or handle missing hostname gracefully. For example, if (!hostname) throw new Error('REPLIT_CONNECTORS_HOSTNAME not set'); or build the URL only after confirming hostname is non-empty. Also check response.ok from fetch and handle non-200 responses before calling response.json().
---END---

---FINDING---
Severity: HIGH
File: server/stripeClient.ts
Line: N/A
Category: Production Risk | Performance
Problem: getStripeSync() uses a module-level cached stripeSync variable but is not concurrency-safe: two concurrent calls to getStripeSync when stripeSync is null can race and cause the StripeSync constructor to run twice (double initialization). Additionally it uses a non-null assertion process.env.DATABASE_URL! which will pass undefined to StripeSync if env var is missing.
Impact: Race can lead to multiple StripeSync instances and duplicate DB pools/connections or inconsistent singleton state. The non-null assertion will throw or cause StripeSync to error if DATABASE_URL is not present, causing runtime failures.
Fix: Make initialization atomic: if stripeSync is null create a Promise-initializer (store the initializing Promise) to ensure only one initialization runs concurrently. Validate process.env.DATABASE_URL and fail fast with clear error if missing (avoid the non-null assertion). Example pattern: if (!stripeSync) { stripeSync = (async () => { ... create and return instance })(); } return await stripeSync;
---END---

---FINDING---
Severity: HIGH
File: server/services/stripe-hardening.ts
Line: N/A
Category: Logic Bug | Security
Problem: applyPromoCode() only checks appliedPromos.has(userId) and validatePromoCode(code) but does NOT verify that the promo is applicable to the user's tier (promo.applicableTiers) nor re-check maxUses after increment. currentUses is incremented without atomicity or persistence.
Impact: Users can apply promo codes intended for other tiers because there is no applicability check. The in-memory currentUses increment is racy—concurrent requests can push currentUses beyond maxUses, and because promo codes are only in-memory, server restarts reset usage counting allowing abuse. These issues can lead to incorrect discounts, billing mistakes, and revenue loss.
Fix: Enforce applicability against the user's tier when applying a promo: fetch the user and compare their target tier or requested upgrade tier with promo.applicableTiers. Use an atomic/persistent mechanism to increment and check usage (e.g., a DB row with a counter and a transaction or an optimistic lock). After validating, increment and ensure currentUses <= maxUses in the same atomic operation or reject. Persist promo usage to durable storage to prevent restart-based abuse.
---END---

---FINDING---
Severity: HIGH
File: server/services/usage-metering.ts
Line: N/A
Category: Logic Bug
Problem: trackUsage() and getUsageSummary() read the user's tier from (user as any)?.subscriptionTier, but elsewhere in the codebase (e.g., stripe-hardening) the user object appears to use the property name tier. This likely means usage-metering will default to "free" if subscriptionTier is undefined.
Impact: Mis-reading the user's tier will apply incorrect limits (likely the free tier) to paying users, throttling/denying legitimate activity. This can severely impact paying customers and lead to support incidents.
Fix: Use a consistent property name for user tier (confirm storage.getUser() returns which property—tier or subscriptionTier) and reference that property. If storage.getUser() provides 'tier', change usage-metering to use user.tier. Add unit tests to validate the mapping.
---END---

---FINDING---
Severity: HIGH
File: server/services/usage-metering.ts
Line: N/A
Category: Production Risk | Security
Problem: On any DB error, trackUsage() catches and returns { allowed: true, current: 0, limit: 999999 } (silently allowing actions when the usage DB is unavailable).
Impact: If the database is down or the query fails, the system will fall back into an "allow everything" mode. This allows attackers or users to bypass usage limits during outages and can lead to large billing/compute spikes and quota exhaustion.
Fix: Fail closed for critical enforcement: return allowed: false (or an error) if the metering DB is unavailable, or implement a conservative fallback policy (e.g., a low default limit). At minimum, log and surface alerts when DB errors occur. Consider a resilient local rate-limiter + graceful degradation strategy rather than unconditional allowance.
---END---

---FINDING---
Severity: MEDIUM
File: server/routes/upgrades.ts
Line: N/A
Category: Production Risk
Problem: createAIRateLimiter() calls requireAuth(req, res) inside the middleware rather than delegating to the next auth middleware. If requireAuth returns null/undefined without sending a response (implementation dependent), the middleware returns early without calling next() or sending a response, which will hang the request. The rate limiter also performs authentication twice (once here and again in every route handler).
Impact: Depending on how requireAuth is implemented, clients could receive a hanging request (no response). Double authentication is wasteful and may cause confusing control flow if requireAuth sometimes sends responses and sometimes returns null.
Fix: Do not call requireAuth directly inside the rate limiter. Instead, make authentication a separate middleware that runs before rate limiting, or accept the userId from a prior middleware (e.g., set req.userId). If you must call requireAuth, ensure requireAuth consistently either throws or sends response; otherwise, have the rate limiter call next() after handling missing authentication by responding with an appropriate 401/403.
---END---

---FINDING---
Severity: MEDIUM
File: server/routes/upgrades.ts
Line: N/A
Category: Logic Bug | Broken Code
Problem: callAI() parses response.choices[0].message.content via JSON.parse without first verifying that response.choices, response.choices[0], and response.choices[0].message exist. Accessing these properties on an unexpected response shape will throw (and because only JSON.parse is wrapped in try/catch, that case won't be caught).
Impact: Requests where OpenAI returns an unexpected response shape will cause route handlers to reject with uncaught exceptions, producing 500s for users.
Fix: After receiving response, verify structure: if (!response?.choices?.[0]?.message?.content) handle error gracefully (log and return error object). Wrap the entire call and parsing in a try/catch as noted above.
---END---

---FINDING---
Severity: MEDIUM
File: server/services/stripe-hardening.ts
Line: N/A
Category: Production Risk | Code Quality
Problem: Several important state collections are entirely in-memory: trialHistory, promoCodes.currentUses, appliedPromos, trialRecords, dunningRecords, pausedSubscriptions, and invoiceStore. These are not persisted across process restarts and are not shared across horizontal instances.
Impact: Business-critical state (used trials, promo usage, dunning phases, paused subscriptions, invoicing history) will be lost on restart and will not be consistent across multiple server instances. This enables users to re-acquire trials/promos by triggering restarts, and makes cluster deployments incorrect.
Fix: Persist all critical state in a durable store (database) and use distributed locks/transactions or a strongly-consistent approach for counters (promo uses, trial history). At minimum, document the limitations and move user-visible/financial state to the DB.
---END---

---FINDING---
Severity: LOW
File: server/stripe-seed.ts
Line: N/A
Category: Performance | Logic Bug
Problem: stripe.products.list() is called with limit: 100 and the seeding logic assumes all relevant products are returned. There is no pagination handling for >100 products. Also the early-return branch sets a pricesFixed flag that is unused.
Impact: If the Stripe account has >100 active products, some CreatorOS products might be missed and duplicates could be created or updated incorrectly. The unused pricesFixed variable is dead code and confusing.
Fix: Use pagination (auto-pagination or listing with starting_after) to ensure you inspect all relevant products. Remove or use the pricesFixed variable, or simply return after ensuring consistency.
---END---

SUMMARY
Overall, the Payments & Subscriptions section contains several high-impact issues that can cause runtime failures, misuse of AI endpoints, incorrect enforcement of usage limits, and business/financial inconsistencies due to in-memory-only state. The most urgent fixes are: wrap OpenAI calls and parsing in robust try/catch with shape validation; fix the stripe client to avoid crashes when env vars are missing and make getStripeSync initialization concurrency-safe; and harden promo/trial/usage logic by persisting critical state and enforcing atomic checks for counters and tier applicability. Addressing those will eliminate the most severe production and security risks.

---

## Section 4: AI Engines & Orchestration
*Files: server/ai-engine.ts, server/services/agent-orchestrator.ts, server/services/stream-agent.ts, server/autopilot-engine.ts, server/lib/openai.ts*

---FINDING---
Severity: CRITICAL
File: server/ai-engine.ts
Line: N/A
Category: Broken Code
Problem: The function detectContentContext constructs a string using an undefined identifier "desc" (e.g. const text = `${title} ${desc...`). Since the visible code passes "description" as the optional parameter name, referencing "desc" will throw a ReferenceError when detectContentContext is invoked.
Impact: Any call to detectContentContext will throw at runtime, crashing the caller or causing unhandled promise rejections. This will break core content-detection flows and likely prevent features that rely on context detection from working.
Fix: Replace the undefined variable with the correct parameter name (e.g. use description or the actual variable name used in the function signature). Add unit tests for detectContentContext to catch this at compile/test time. Example: const text = `${title} ${description || ""} ${category || ""} ${metadata ? JSON.stringify(metadata) : ""}`;
---END---

---FINDING---
Severity: HIGH
File: server/services/agent-orchestrator.ts
Line: N/A
Category: Production Risk
Problem: Agents are scheduled via setInterval with async runner functions (makeAgentRunner returns an async function). There's no protection against concurrent executions: if an agent run takes longer than its interval, the next interval will start a new run while the previous is still running.
Impact: Overlapping runs can cause race conditions, duplicated work, resource exhaustion (multiple heavy AI/db calls concurrently), inaccurate health/telemetry metrics, and potential data corruption if agent tasks are not re-entrant-safe.
Fix: Ensure single-run semantics per agent: replace fixed setInterval with a self-scheduling pattern that awaits the previous run before scheduling the next (e.g. an async loop that awaits runFn and then waits intervalMs), or add a per-run "inProgress" flag in the session.health/agent state to skip scheduling while a run is active. Also consider using setTimeout for retries/backoff instead of setInterval for precise control.
---END---

---FINDING---
Severity: HIGH
File: server/services/stream-agent.ts
Line: N/A
Category: Production Risk
Problem: The stream agent uses setInterval to call checkAndEngageStream periodically, but checkAndEngageStream performs network and DB operations (YouTube checks, AI calls, storage writes). There is no prevention of overlapping executions, nor per-user locking.
Impact: If a check takes longer than 2 minutes (the interval), multiple checkAndEngageStream invocations for the same user can run concurrently. This can lead to duplicated stream records, duplicate notifications, double quota consumption, throttling by external APIs, and inconsistent agent state (viewer counts, videoId, postStreamPhase).
Fix: Introduce an in-flight lock on the StreamAgentState (e.g., state.isChecking boolean) that ensures checkAndEngageStream returns immediately if a previous run is in progress. Alternatively use a self-rescheduling async loop (await run -> await sleep(interval) -> repeat) so runs never overlap. Also ensure any awaited external calls have timeouts and cancellation where appropriate.
---END---

---FINDING---
Severity: MEDIUM
File: server/lib/openai.ts
Line: N/A
Category: Production Risk
Problem: withRetry uses err?.headers?.["retry-after"] and then parseInt(...) * 1000 to compute retryAfterMs but does no robust validation of parseInt result. If the header is malformed or parseInt returns NaN, retryAfterMs becomes NaN and is passed to setTimeout which may coerce or behave unexpectedly. Also the code assumes err.headers exists and that retry-after is a seconds value; some APIs can return different formats (HTTP-date).
Impact: Retry behavior may be incorrect (immediate retry or no delay), causing thundering retries against the API and exacerbating rate limiting, or masking the cause of failures. It could also lead to unexpected timing behavior.
Fix: Parse Retry-After robustly: handle both integer-seconds and HTTP-date formats, fallback to exponential backoff when parsing fails. Example: if header matches /^\d+$/ use parseInt; else try new Date(header). If parsed value is invalid, use the exponential backoff base delay. Also add an explicit upper bound on delay to avoid extremely long waits.
---END---

---FINDING---
Severity: MEDIUM
File: server/autopilot-engine.ts
Line: N/A
Category: Logic Bug
Problem: generateWithAI uses openai.chat.completions.create with the parameter max_completion_tokens (instead of max_tokens). The rest of the codebase uses max_tokens in other places. If the OpenAI client/library in use expects max_tokens, using max_completion_tokens will be ignored or cause unexpected behavior.
Impact: The generated responses may be unbounded or truncated differently than intended; token limits won't be enforced, potentially increasing costs or causing very long responses that downstream code doesn't handle.
Fix: Use the API parameter name that matches the installed OpenAI client version. Standard ChatCompletion accepts max_tokens; confirm the package version and use the correct parameter. Add a centralized wrapper for model invocation to enforce consistent parameters and to add tests asserting token limits.
---END---

---FINDING---
Severity: LOW
File: server/services/stream-agent.ts
Line: N/A
Category: Performance | Code Quality
Problem: agentStates map entries are never removed. stopStreamAgent disables the agent and clears the interval but keeps the state object in memory. There is no lifecycle cleanup for users who permanently stop using the service.
Impact: Over time, agentStates can grow for many users and consume memory unnecessarily, especially if many users start and stop the agent frequently. This can lead to increased memory usage on the server.
Fix: On stopStreamAgent consider removing the entry from agentStates if you don't need to preserve historical state. If historical state must be kept, add a TTL/cleanup job that prunes stale entries (e.g., not enabled and lastCheckedAt older than N days).
---END---

---FINDING---
Severity: LOW
File: server/services/agent-orchestrator.ts
Line: N/A
Category: Production Risk
Problem: startUserAgentSession calls stopUserAgentSession synchronously and then immediately sets up new intervals. However, stopUserAgentSession only clears intervals but does not wait for any in-progress async agent runs to finish; those in-flight runs may continue and interleave with newly scheduled runs.
Impact: Potential for overlapping runs during restart operations and race conditions for user state or external side-effects (multiple concurrent agent cycles touching same resources).
Fix: Track an in-flight promise per agent or per session and await completion (or signal cancellation) before starting a new session. At minimum, set a "restarting" flag and skip new runs until existing ones have naturally finished or a small timeout elapses.
---END---

SUMMARY
The audit found one critical bug that will immediately throw at runtime (the undefined "desc" in detectContentContext) and several scheduling/concurrency issues that can cause race conditions, duplicated work, and excessive external API usage (both in the general orchestrator and the stream agent). There are also a few lower-severity robustness issues in the OpenAI retry and autopilot AI parameter usage that could lead to unexpected behavior or cost. The top priorities are: fix the undefined variable in detectContentContext, and prevent overlapping agent executions by switching to single-run scheduling or adding in-flight locks. After those, harden OpenAI retry parsing and standardize AI call parameters.

---

## Section 5: Background Engines
*Files: server/content-loop.ts, server/daily-content-engine.ts, server/vod-optimizer-engine.ts, server/auto-thumbnail-engine.ts, server/services/push-scheduler.ts, server/services/cleanup-coordinator.ts, server/services/performance-optimizer.ts*

---FINDING---
Severity: HIGH
File: server/vod-optimizer-engine.ts
Line: N/A
Category: Logic Bug | Performance
Problem: findOptimizableVods() loads "allVids" with a DB query that only filters by createdAt (lt MIN_AGE_DAYS) and then performs channelId filtering in-memory. The DB query does not include the user's channelIds, and it limits to 50 rows before the in-memory filter.
Impact: The function can return zero results even when the user has many eligible videos (because the first 50 rows returned by the DB may not belong to the user's channels). Conversely, it may return unrelated videos if channel filtering logic changes. This both breaks correctness (skipping optimizations for the user) and wastes CPU/DB round-trips.
Fix: Push the channelId filter into the DB query. After obtaining channelIds, query videos WHERE videos.channelId IN (channelIds) AND videos.createdAt < minAge, with appropriate parameterized binding and a limit. Example: db.select().from(videos).where(and(lt(videos.createdAt, minAge), inArray(videos.channelId, channelIds))).orderBy(asc(videos.createdAt)).limit(50). Remove the subsequent in-memory filter or use it as a safety check only.
---END---

---FINDING---
Severity: MEDIUM
File: server/daily-content-engine.ts
Line: N/A
Category: Logic Bug
Problem: getNextAvailableDayOffset() builds a Set of scheduledDates from a DB query and later compares these entries to date strings generated with toISOString().split("T")[0]. Depending on Drizzle/DB return types, scheduledDate could be a Date object or a string in a different format, causing the membership test (!filledDays.has(dateStr)) to fail even when a day is actually filled.
Impact: The function may incorrectly report days as available/filled, producing suboptimal scheduling offsets (either overbooking or leaving gaps), causing content to be scheduled at incorrect days/times.
Fix: Normalize the scheduledDate values to a deterministic YYYY-MM-DD string when building the set. Example: const filledDays = new Set(scheduledDays.map(r => (r.scheduledDate instanceof Date ? r.scheduledDate.toISOString().split("T")[0] : String(r.scheduledDate).split("T")[0]))); Use the same canonical format for both sides of the comparison to avoid mismatches.
---END---

---FINDING---
Severity: MEDIUM
File: server/auto-thumbnail-engine.ts
Line: N/A
Category: Broken Code
Problem: generateThumbnailPrompt() calls the OpenAI client with the parameter max_completion_tokens, while other usages in the code use max_tokens. Many OpenAI SDKs expect max_tokens (not max_completion_tokens), so this argument may be ignored or cause an error depending on the client implementation.
Impact: The thumbnail prompt generation may not respect the intended token limit, or the call may fail unexpectedly, resulting in empty prompts and skipped thumbnail generation.
Fix: Use the correct parameter name supported by the OpenAI client in use (likely max_tokens). Make the call uniform with other usages (e.g., max_tokens: 300). Also validate API client options centrally (or wrap OpenAI calls) to avoid inconsistent parameter names across the codebase.
---END---

---FINDING---
Severity: MEDIUM
File: server/auto-thumbnail-engine.ts
Line: N/A
Category: Logic Bug | Production Risk
Problem: When the generated image buffer is larger than the chosen YOUTUBE_THUMBNAIL_LIMIT (or when setYouTubeThumbnail returns not-found/too-large errors), generateAndUploadThumbnail() sets metadata.autoThumbnailGenerated = true and marks autoThumbnailFailed. Marking autoThumbnailGenerated=true conflates "attempted/failed" with "successful generation".
Impact: Videos that failed thumbnail generation (or were skipped due to size) will be treated as if they already had a generated thumbnail. Future runs will skip them permanently, preventing retries or remediation and causing missed thumbnails.
Fix: Separate success and failure flags. Do NOT set autoThumbnailGenerated = true for failed attempts. Instead set or update autoThumbnailFailed/retryAt/attempts counters. On success set autoThumbnailGenerated = true and clear any failure flags. Consider adding an explicit autoThumbnailAttempted or attemptCount to allow retry logic with exponential backoff.
---END---

---FINDING---
Severity: MEDIUM
File: server/content-loop.ts
Line: N/A
Category: Production Risk | Logic Bug
Problem: onLivestreamDetected() sets state.interrupted = true and clears the scheduled timer, but it does not cancel or otherwise stop a runLoopIteration() that is already executing. The runLoopIteration implementation only checks state.interrupted at the very start of the iteration (and only once), and long-running batch functions (runStreamExhaustBatch/runVodOptimizeBatch) do not check state.interrupted cooperatively.
Impact: If a runLoopIteration is in progress when a livestream starts, the loop may continue heavy work (AI calls, DB changes, thumbnail generation, etc.) during an active livestream — contrary to the intent of pausing during live. This can cause wasted API calls, racey/incorrect state transitions, and unexpected content extraction during live streams.
Fix: Implement cooperative cancellation: propagate an AbortSignal/AbortController (or check state.interrupted periodically) into long-running loops and into runStreamExhaustBatch/runVodOptimizeBatch/runThumbnailBatch/runSingleBatchForUser functions. Ensure batch loops check the cancellation state between iterations and abort quickly. When onLivestreamDetected() is called, set an "interruption" signal that the running iteration can observe and stop.
---END---

---FINDING---
Severity: LOW
File: server/daily-content-engine.ts
Line: N/A
Category: Code Quality | Robustness
Problem: extractAndSanitizeJSON() uses several regular-expression based fixes to coerce AI output into JSON (including replacing quotes between word characters with apostrophes). These transformations are heuristic and may accidentally mangle valid-but-unexpected AI output (for example edge cases with strings that contain word"word sequences).
Impact: The sanitizer may turn some valid JSON-like AI outputs into invalid or corrupted JSON, leading to parsing failures and unnecessary retries; conversely, it could mask structured errors in AI output.
Fix: Hardening: prefer a tolerant JSON parser library or a parsing approach that is more resilient (e.g., attempt multiple well-scoped non-destructive normalizations and fail fast if heuristics are ambiguous). Add unit tests covering known AI failure modes and log the raw AI output when sanitization is required so operators can refine heuristics over time.
---END---

SUMMARY
The audited "Background Engines" code contains generally reasonable architecture (batched workers, time budgets, SSE notifications), but I found several real issues that can affect correctness, reliability, and resource usage in production:

- The VOD optimizer contains a clear query/logic bug that can cause it to miss relevant videos for optimization (HIGH).
- Scheduling logic may compare mismatched date types, producing incorrect day offsets (MEDIUM).
- Thumbnail generation has both an API parameter typo and a metadata inconsistency that causes failed thumbnails to be silently marked as generated (MEDIUM).
- The content loop lacks cooperative cancellation, allowing a running iteration to continue after a livestream starts (MEDIUM).
- A few heuristic sanitizers and parameter inconsistencies risk brittle behavior (LOW/MEDIUM).

I recommend addressing the high/medium items first (DB filtering, thumbnail metadata handling, cancellation), add defensive unit tests for AI parsing/sanitization, and standardize OpenAI client usage across modules to prevent subtle runtime errors.

---

## Section 6: Core Backend Routes
*Files: server/routes/content.ts, server/routes/stream.ts, server/routes/money.ts, server/routes/settings.ts, server/routes/ai.ts, server/routes/automation.ts, server/routes/platform.ts*

---FINDING---
Severity: HIGH
File: server/routes/content.ts
Line: N/A
Category: Security
Problem: Video ownership is not consistently enforced. The GET /api/videos/:id and PUT /api/videos/:id handlers only validate channel ownership (when video.channelId exists) but do not verify that the video itself belongs to the authenticated user when channelId is null. This allows a logged-in user to view or update videos that aren't attached to any channel and may belong to other users.
Impact: Authenticated users can read or modify videos they don't own (Insecure Direct Object Reference). This can leak private content and allow unauthorized edits.
Fix: Always enforce ownership. After retrieving a video, check that video.userId === authenticatedUserId (or equivalent) regardless of channel association. If storage.getVideo does not include userId, update the storage layer to return the owner and validate it here. Return 403/404 as appropriate when the owner does not match.
---END---

---FINDING---
Severity: HIGH
File: server/routes/content.ts
Line: N/A
Category: Security
Problem: Mass-assignment risk in channel update endpoint. channels.update builds a Zod schema of z.object({}).passthrough() then passes parsed data directly into storage.updateChannel(id, parsed). That effectively allows any arbitrary fields to be updated, including sensitive fields like userId, role flags, or platform-specific ids if storage.updateChannel does not sanitize.
Impact: A malicious user could modify protected fields (e.g., change channel.userId to another user, flip flags, or inject unexpected data), leading to privilege escalation or data integrity breaches.
Fix: Do not use .passthrough() for updates that will be applied directly. Define an explicit schema listing only the updatable fields and whitelist them when calling storage.updateChannel. Alternatively, sanitize the parsed object before passing it to the storage layer and ensure storage.updateChannel enforces an allowed fields whitelist and ignores attempts to change owner-related fields.
---END---

---FINDING---
Severity: HIGH
File: server/routes/money.ts
Line: N/A
Category: Security
Problem: /api/stripe/payments returns raw results of SELECT * FROM stripe.payment_intents to any authenticated user. There is no filtering by user or any authorization check beyond authentication.
Impact: Any authenticated user can enumerate platform-wide Stripe payment intents, potentially exposing other users’ payment metadata and sensitive payment information.
Fix: Restrict this endpoint to administrative users only, or filter results to items associated with the requesting user (join on metadata/user id). Do not return raw system-wide payment_intents to ordinary users. Add authorization checks and/or modify the query to include WHERE creatorUserId = <userId> (or equivalent link).
---END---

---FINDING---
Severity: HIGH
File: server/routes/money.ts
Line: N/A
Category: Security
Problem: /api/stripe/balance returns the platform Stripe balance to any authenticated user (requireAuth only).
Impact: Exposes sensitive financial information about the platform/account to all authenticated users.
Fix: Restrict access to this endpoint to internal/admin roles only. Add proper authorization checks (requireTier is not appropriate here) and/or remove the endpoint if not necessary for end-users.
---END---

---FINDING---
Severity: MEDIUM
File: server/routes/content.ts
Line: N/A
Category: Performance
Problem: Pagination is implemented in memory. GET /api/videos uses storage.getVideosByUser(userId) to fetch all videos and then slices the resulting array to emulate pagination.
Impact: For users with many videos this will load the entire set into memory on each request, increasing latency, memory usage, and DB load; it will not scale.
Fix: Move pagination to the storage/DB layer: accept page & limit params and implement LIMIT/OFFSET (or cursor-based pagination) in storage.getVideosByUser or create a new storage method that queries the DB with pagination. Ensure limit has sensible max cap.
---END---

---FINDING---
Severity: MEDIUM
File: server/routes/content.ts
Line: N/A
Category: Logic Bug / Production Risk
Problem: POST /api/videos (video creation) calls storage.createVideo(input) using the parsed input from api.videos.create.input without attaching the authenticated userId.
Impact: Newly created videos may be stored without an owner or with incorrect ownership if storage.createVideo expects a userId. This can create orphaned records or allow a client to supply a different userId in the body (if storage.createVideo honors it).
Fix: Ensure the created record is associated with the authenticated user by attaching userId to the input (e.g., storage.createVideo({ ...input, userId })). Also validate/ignore any client-supplied userId in the payload server-side.
---END---

---FINDING---
Severity: MEDIUM
File: multiple files
Line: N/A
Category: Security / Code Quality
Problem: Widespread use of .passthrough() on update schemas (e.g., channel updates, stream destination updates, brand-assets update). .passthrough() allows unknown keys through and these are later passed directly to storage.update* functions.
Impact: Mass-assignment vulnerabilities: clients can send unexpected fields which may be persisted or used to change protected properties if the storage layer does not strictly whitelist fields. This is a common privilege-escalation/data-corruption vector.
Fix: Replace .passthrough() with explicit field schemas that enumerate only allowed update fields. If dynamic fields are required, sanitize the parsed object before persisting and ensure the storage layer enforces a whitelist of allowed update columns/attributes.
---END---

---FINDING---
Severity: MEDIUM
File: server/routes/money.ts
Line: N/A
Category: Production Risk
Problem: The baseUrl used for Stripe success/cancel/return URLs is built from process.env.REPLIT_DOMAINS?.split(",")[0] with no fallback. If REPLIT_DOMAINS is unset the URLs become https://undefined/..., resulting in invalid redirects and failing flows.
Impact: Stripe checkout and portal flows will produce redirect URLs that are invalid or broken in environments where REPLIT_DOMAINS isn't set, breaking payments/portal navigation in production outside Replit.
Fix: Use a robust configuration pattern: read a configured APP_BASE_URL (or derive from request host when safe), and validate it exists. Provide a sensible default or fail early with a clear error. Do not rely on REPLIT_DOMAINS; make the env var explicit (e.g., APP_BASE_URL).
---END---

---FINDING---
Severity: LOW
File: server/routes/stream.ts
Line: N/A
Category: Code Quality / Minor Bug
Problem: In the go-live background async IIFE, the job payload is initially created with platforms: stream.platforms but persistTasks later uses a local platforms variable set to (stream.platforms as string[]) || ['youtube']. If stream.platforms is undefined, the job payload initially stored may have undefined platforms; this can cause inconsistencies between job payload and later persisted state.
Impact: The automation job stored in DB might contain inconsistent or missing platforms until the job is updated, making it harder for other services to consume. Not catastrophic but causes confusing job state.
Fix: Normalize platforms immediately (e.g., const platforms = (stream.platforms as string[]) || ['youtube']) and use that normalized value both when creating the job and when persisting updates.
---END---

---FINDING---
Severity: LOW
File: server/routes/settings.ts
Line: N/A
Category: Code Quality
Problem: Duplicate endpoints for notifications: both POST /api/notifications/read-all and POST /api/notifications/mark-all-read exist and perform identical work.
Impact: Confusing API surface; maintenance overhead and potential for inconsistent behavior if one is changed and the other is not.
Fix: Consolidate to a single canonical endpoint; keep one and deprecate the other (or forward one to the other) with clear documentation.
---END---

SUMMARY
Overall, the routes include several real and impactful issues. The highest-risk problems are authorization/ownership checks and sensitive financial data exposure: (1) missing ownership checks for videos (read/update) and permissive passthrough schemas that enable mass-assignment; and (2) endpoints that expose platform-wide Stripe payment intents and the platform Stripe balance to any authenticated user. There are also important performance issues (in-memory pagination) and configuration fragility (building base URLs from a Replit-specific env var). Fixing the ownership checks, removing passthrough/mass-assignment, restricting Stripe endpoints to admins or scoping to a user, and moving pagination into the DB will address the most serious risks.

---

## Section 7: Frontend Core
*Files: client/src/App.tsx, client/src/lib/queryClient.ts, client/src/hooks/use-auth.ts, client/src/hooks/use-login-sync.ts, client/src/lib/offline-engine.ts, client/src/components/AuthForm.tsx, client/src/pages/Settings.tsx, client/src/pages/Pricing.tsx*

---FINDING---
Severity: HIGH
File: client/src/lib/offline-engine.ts
Line: N/A (function syncQueue)
Category: Broken Code / Security
Problem: syncQueue() sends POST/PUT/DELETE requests directly using fetch(...) without including the application's CSRF token header. The rest of the app uses apiRequest(...) which fetches and refreshes CSRF tokens when needed; offline-engine bypasses this protection.
Impact: Any server endpoints that require CSRF verification will return 403 and queued offline actions will repeatedly fail (or be marked failed) instead of succeeding when connectivity is restored. This breaks offline sync functionality and may cause data loss or permanent failed queue items. It is also inconsistent with the app's CSRF protection model.
Fix: Use the same CSRF-aware request path as the rest of the app. Replace direct fetch calls in syncQueue (and any other offline-engine flows that perform state-changing requests) with apiRequest(method, url, body) or a CSRF-token-aware wrapper. Ensure retry logic handles 403/csrf_missing by refreshing token (reusing getCsrfToken logic) and retrying, or delegate to apiRequest which already implements that behavior.
---END---

---FINDING---
Severity: HIGH
File: client/src/hooks/use-login-sync.ts
Line: N/A (runSync function)
Category: Security | Production Risk
Problem: runSync() posts to /api/sync/login using fetch(...) directly (POST) without adding CSRF token. This is a state-changing endpoint invoked automatically after login, but it bypasses CSRF protection.
Impact: The call will likely receive 403 responses on servers enforcing CSRF tokens, causing the sync flow to fail. The UI will show an error or fail to start the sync, resulting in stale data for users immediately after login. It is also a CSRF risk if the endpoint wasn't correctly hardened server-side.
Fix: Use apiRequest("POST", "/api/sync/login", { /* body if any */ }) instead of fetch so CSRF tokens are handled and retries on csrf_missing/invalid are supported. If apiRequest is not appropriate, explicitly obtain and include the CSRF token via getCsrfToken before posting.
---END---

---FINDING---
Severity: MEDIUM
File: client/src/hooks/use-login-sync.ts
Line: N/A (top-level useEffect)
Category: Logic Bug | Production Risk
Problem: syncTriggered.current is set to true when the sync is started but is never reset to false when the sync completes or fails. This effectively prevents the login-sync flow from running again for the lifetime of the page.
Impact: Users who log out and log back in (or switch accounts) during the same session will not have login-sync re-triggered. This yields stale platform data, missed initial syncs, and mismatch between account state and UI until a full page reload.
Fix: Reset syncTriggered.current to false after the sync completes or on error (e.g., in the pollStatus termination paths and catch handlers). Alternatively, use a more explicit lifecycle flag that is cleared on unmount or when user changes.
---END---

---FINDING---
Severity: MEDIUM
File: client/src/lib/offline-engine.ts
Line: N/A (start/stop functions and event listeners)
Category: Production Risk | Performance
Problem: offlineEngine.start registers window and document event listeners (online/offline/visibilitychange) but offlineEngine.stop does not remove those listeners. Repeatedly starting the engine would attach duplicate listeners.
Impact: If the engine is started/stopped multiple times (e.g., during HMR in dev or misused lifecycle), handlers will accumulate. This can cause duplicate syncs, duplicated network calls, and memory leaks, and complicate debugging in production.
Fix: Track the bound listener functions and remove them in stop() via removeEventListener. Alternatively, ensure start() is only called once and document that stop() only clears intervals (or implement idempotent start/stop that properly registers/unregisters listeners).
---END---

---FINDING---
Severity: MEDIUM
File: client/src/lib/queryClient.ts
Line: N/A (getQueryFn offline path)
Category: Production Risk
Problem: getQueryFn returns null for offline queries when there is no cached response (return null as T). Many consumers expect arrays/objects and may not defensively handle null, leading to runtime errors in components (e.g., calling .map on null).
Impact: In offline scenarios where a cache miss occurs, components that don't expect null can crash or throw, degrading UX while offline. This is a production stability risk.
Fix: Either ensure the offline cache returns a default-shaped value (e.g., [] or {}) consistent with the expected query type, or have getQueryFn throw a specific offline error that components can handle. At minimum, document that queries can return null when offline and audit critical components to handle null/undefined safely.
---END---

---FINDING---
Severity: LOW
File: client/src/components/AuthForm.tsx
Line: N/A (password toggle button)
Category: Code Quality / Accessibility
Problem: The password visibility toggle button has tabIndex={-1} which removes it from the keyboard tab order.
Impact: Keyboard-only users cannot focus the toggle, causing an accessibility regression (cannot reveal/hide password via keyboard). Not a functional crash, but a UX/accessibility issue.
Fix: Remove tabIndex={-1} so the button remains keyboard-focusable, or provide an accessible alternative (e.g., aria-pressed) and ensure it is reachable by keyboard users.
---END---

---FINDING---
Severity: LOW
File: client/src/hooks/use-auth.ts
Line: N/A (logout function and mutation)
Category: Logic Bug / Production Risk
Problem: logout() sets window.location.href = "/api/logout" and returns void. That means the logout mutation never resolves locally (navigation will interrupt execution), and mutation lifecycle callbacks (onSuccess) may not run reliably. The hook exposes logout as logoutMutation.mutate which may be expected to be async.
Impact: Components that rely on mutation.onSuccess/onSettled or the returned promise to run cleanup logic might not run those handlers predictably, leading to stale UI state before navigation or missing analytics/cleanup steps.
Fix: Instead of wiring logout to a mutation that expects asynchronous resolution, either:
- Implement logout as an API call that returns a JSON response then navigate on success, or
- Keep the navigation but don't rely on mutation lifecycle (set query cache locally before navigation), or expose a function that performs the redirect directly (not via useMutation) so callers don't expect a Promise resolution.
---END---

SUMMARY
Overall the frontend core code is well-structured and uses a consistent request wrapper (apiRequest) and react-query patterns. The most critical issues are in the offline and sync flows: offline-engine and use-login-sync perform state-changing network requests via raw fetch without CSRF handling, which will break offline syncs and can cause 403s (and security inconsistencies). There's also a logic bug preventing login-sync from re-triggering during the same session, and a missing removal of event listeners that can cause duplicated behavior or memory leaks. Address the CSRF usage first (use apiRequest or reuse getCsrfToken), then fix the syncTriggered lifecycle and event listener cleanup. The remaining issues are lower-severity accessibility and mutation-lifecycle oddities that should be corrected for robustness.

---

## Section 8: YouTube & Platform Integrations
*Files: server/youtube.ts, server/youtube-manager.ts, server/webhookHandlers.ts, server/routes/multistream.ts, server/services/webhook-verify.ts, server/services/youtube-quota-tracker.ts*

---FINDING---
Severity: CRITICAL
File: server/services/webhook-verify.ts
Line: N/A
Category: Security
Problem: HMAC signature verification is implemented incorrectly. verifyHmacSignature builds an expected digest string using digest(encoding) but then calls crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) without providing the encoding to Buffer.from. This compares buffers of UTF-8 encoded hex characters (not raw bytes) and will often throw (length mismatch) or return false even for valid signatures. The catch paths in several verifier functions then either return valid:false or (worse) return valid:true in some code paths, effectively making signature verification unreliable or trivially bypassable.
Impact: Webhook verification will frequently fail for valid requests (causing false negatives) or be bypassed in other branches (false positives). Attackers could post forged webhooks or valid webhooks could be rejected depending on environment, resulting in missed billing events, unauthorized actions, or security incidents.
Fix: Use Buffer.from with the correct encoding when converting hex/base64 signatures to buffers. Example change inside verifyHmacSignature:
- Create expected as a Buffer directly: const expectedBuf = Buffer.from(crypto.createHmac(algorithm, secret).update(data).digest(), 'binary') OR keep digest(encoding) but convert both inputs with Buffer.from(signature, encoding) and Buffer.from(expected, encoding).
- Prefer: const expected = crypto.createHmac(algorithm, secret).update(data).digest(); const sigBuf = Buffer.isBuffer(payloadSignature) ? payloadSignature : Buffer.from(signature, encoding); const valid = (sigBuf.length === expected.length) && crypto.timingSafeEqual(sigBuf, expected);
- Ensure you handle length mismatches safely (don't call timingSafeEqual on different length buffers).
---END---

---FINDING---
Severity: HIGH
File: server/services/webhook-verify.ts
Line: N/A
Category: Security
Problem: verifyDiscordWebhook swallows all verification errors and returns valid: true on exceptions, and attempts to use crypto.verify with incorrect key/format handling (it treats the public key as hex and uses crypto.verify with { key: keyBuf, format: "der", type: "spki" } which is very unlikely to be correct for Discord's Ed25519 public key and signature scheme).
Impact: Discord webhooks can be accepted even if signatures are invalid or verification throws; attackers can send forged Discord webhook events and they will be treated as valid by the app. This is a direct authentication bypass.
Fix: Replace this implementation with the correct Ed25519 verification flow. For Discord you should:
- Expect publicKey as hex (32 bytes) and signature as hex (64 bytes) and timestamp + body concatenated as message.
- Use a known, correct Ed25519 verification library (e.g., tweetnacl or Node's verify with proper PEM if using libs that accept it). Example using tweetnacl:
  const msg = Buffer.from(timestamp + body);
  const sig = Buffer.from(signature, 'hex');
  const pub = Buffer.from(publicKey, 'hex');
  const valid = nacl.sign.detached.verify(new Uint8Array(msg), new Uint8Array(sig), new Uint8Array(pub));
- Do not return valid: true on exceptions; return valid:false and log the error. If you must allow missing keys in dev, gate that behavior behind an explicit non-prod flag and log loudly.
---END---

---FINDING---
Severity: HIGH
File: server/youtube.ts
Line: N/A (function getAuthenticatedClient / oauth2Client.on handler)
Category: Production Risk | Broken Code
Problem: oauth2Client.on("tokens", async (tokens) => { await storage.updateChannel(...) }) attaches an async event handler that may throw, but there's no try/catch inside the handler. Event emitter callbacks that reject will produce unhandled promise rejections (they are not awaited/handled by the emitter).
Impact: If storage.updateChannel throws (database down, constraint violation), an unhandled rejection will occur. In Node.js unhandled promise rejections may terminate the process (depending on Node version/flags) or flood logs; this is a stability risk.
Fix: Wrap the handler body in try/catch and handle/log errors explicitly. Example:
oauth2Client.on("tokens", (tokens) => {
  (async () => {
    try {
      const updateData = { ... };
      if (Object.keys(updateData).length > 0) await storage.updateChannel(channelId, updateData);
    } catch (err) {
      console.error(`[YouTube] Failed to persist refreshed tokens for channel ${channelId}:`, err);
    }
  })();
});
Or keep async handler but wrap internal await in try/catch so rejections are handled.
---END---

---FINDING---
Severity: HIGH
File: server/webhookHandlers.ts
Line: N/A (function checkAndRecordWebhookEvent)
Category: Production Risk | Logic Bug
Problem: checkAndRecordWebhookEvent performs a read-then-insert to deduplicate events but does not handle race conditions. If two concurrent requests check, see no existing record, and both attempt to insert, one insert can fail with a unique-constraint error. That error is not caught/handled (no 23505 handling), so callers will get an exception and may abort processing unexpectedly.
Impact: Parallel webhook deliveries (common for webhook retries or multiple stripe deliveries) can cause errors and drop processing. This can lead to missed billing updates or duplicated/failed deliveries.
Fix: Make the insert idempotent by using an upsert/ON CONFLICT DO NOTHING (if supported by your DB abstraction) or catch the duplicate-key error (Postgres 23505) and treat it as if the record already exists. After insert failure due to duplicate, query the record to check processed flag. Example:
try { await db.insert(...).values(...); } catch (err) { if (err.code === '23505') { /* fetch record */ } else throw err; }
Also prefer using a unique constraint on webhookEvents.source and perform a single upsert operation that returns whether the caller should process.
---END---

---FINDING---
Severity: MEDIUM
File: server/services/webhook-verify.ts
Line: N/A
Category: Security | Code Quality
Problem: Several verification functions (verifyYouTubeWebhook, verifyKickWebhook, verifyTwitchWebhook, verifyDiscordWebhook) return { valid: true } when the corresponding webhook secret/public key environment variable is not set. This silently disables verification when a secret is missing.
Impact: In production misconfiguration (missing env vars) will make webhook verification effectively disabled, allowing unauthenticated requests to be accepted. This is a security risk that can be easy to overlook.
Fix: Fail closed in non-development environments: return valid:false or throw/log a high-severity alarm when a secret is missing in production. At minimum log a loud warning during startup or the first verification attempt, and gate the "skip verification when not configured" behavior behind an explicit development flag. Do not silently accept webhooks when secrets are not configured.
---END---

---FINDING---
Severity: MEDIUM
File: server/services/youtube-quota-tracker.ts
Line: N/A (getNextResetTime)
Category: Logic Bug | Production Risk
Problem: getNextResetTime computes a Pacific midnight by converting the current Date to a locale string for the Pacific timezone and reparsing it into a Date: const pacificStr = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }); const pacificNow = new Date(pacificStr); This round-trip through a locale formatted string is unreliable and locale-dependent and can produce incorrect offsets/parsing errors.
Impact: The computed resetsAt timestamp may be wrong (off by hours/days) depending on the runtime locale/format, leading to misleading reset times and quota calculations that are inconsistent across servers.
Fix: Compute midnight in the target timezone in a robust manner. Options:
- Use a timezone-aware library (e.g., luxon, moment-timezone, or Intl.DateTimeFormat#formatToParts) to get Pacific date components and construct a Date in UTC from those components.
- Example using Intl.DateTimeFormat#formatToParts:
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  // or use formatToParts to build a Date reliably.
- Or store quota records keyed by the timezone-specific date string only (getPacificDate) and compute reset time from that date rather than parsing locale strings.
---END---

---FINDING---
Severity: LOW
File: server/youtube-manager.ts
Line: N/A (AI response parsing)
Category: Logic Bug | Code Quality
Problem: The code assumes OpenAI responses are strings and calls JSON.parse(content) (e.g. autoOrganizePlaylists, getPlaylistSeoScore, generatePinnedComment, generateMultiLanguageMetadata, buildDescriptionLinks). If the OpenAI client already returns parsed JSON under content (or returns content as an object due to response_format), JSON.parse will throw; the code catches the error and returns an empty object, losing useful information.
Impact: In some client configurations the AI response might already be parsed and the code will treat it as invalid, returning {} and causing functionality to degrade silently.
Fix: Test the response type before parsing. Example:
let parsed;
if (typeof content === 'string') parsed = JSON.parse(content);
else parsed = content;
Wrap JSON.parse in try/catch and log the raw content on parse failure for debugging.
---END---

---FINDING---
Severity: LOW
File: server/youtube.ts
Line: N/A (refreshAllUserChannelStats numeric checks)
Category: Logic Bug
Problem: In refreshAllUserChannelStats the code uses truthy checks to detect numeric metrics from platformData:
const vidCount = pd.videoCount ? Number(pd.videoCount) : pd.tweetCount ? Number(pd.tweetCount) : ...;
This treats 0 as falsy and will skip it in favor of other fields.
Impact: If a channel has 0 videos/views/etc., the code might pick another metric or leave the count null, producing incorrect stored statistics.
Fix: Check for null/undefined explicitly: (pd.videoCount != null) ? Number(pd.videoCount) : (pd.tweetCount != null) ? Number(pd.tweetCount) : ...
---END---

---FINDING---
Severity: LOW
File: server/routes/multistream.ts
Line: N/A
Category: Production Risk | Performance
Problem: The /api/multistream/status route calls res.json(getMultistreamStatus(userId)) synchronously. If getMultistreamStatus is asynchronous (returns a Promise) this will send a Promise object or otherwise behave incorrectly. Also stopMultistream is called without awaiting any potential async cleanup.
Impact: If the underlying multistream-engine functions are async, the API will behave incorrectly (returning an unresolved Promise or returning before work completes), confusing clients and risking incomplete resource cleanup.
Fix: Check and, if required, await asynchronous functions. Change to:
const status = await getMultistreamStatus(userId);
res.json(status);
And for stop: await stopMultistream(userId); or ensure stopMultistream is synchronous by design and document it.
---END---

SUMMARY
Overall, this section has multiple real and high-impact issues concentrated around webhook verification and async/error handling. The most critical problems are insecure or broken webhook verification (timingSafeEqual misuse, incorrect Discord verification, and "accept on missing secret" behavior) which can lead to forged webhooks being accepted or legitimate webhooks being rejected. There are also production stability risks: an unhandled async exception in the OAuth token event handler and a race condition in webhook event de-duplication. Several logic and robustness issues (timezone handling for quota resets, falsey numeric checks, assumption of sync vs async APIs, and brittle AI response parsing) should be fixed to avoid subtle bugs in production. I recommend prioritizing fixes in webhook verification and OAuth token persistence handlers first, then address race conditions and timezone/date logic next.

---

