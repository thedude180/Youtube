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
- **22-Fix Security Remediation** (2026-03-04): Full audit remediation across all layers. (1) `webhook-verify.ts`: HMAC now compares raw bytes (not UTF-8 hex strings) via `digest()` + `Buffer.from(sig,'hex'/'base64')`; Discord Ed25519 replaced with `tweetnacl` `nacl.sign.detached.verify`; all 4 platform verifiers fail-closed (`{valid:false}`) when secrets missing in production (`NODE_ENV=production` or `REPLIT_DEPLOYMENT=1`), pass-through in dev only. (2) `money.ts`: `/api/stripe/payments` and `/api/stripe/balance` now require `requireAdmin` (not `requireAuth`); `getAppBaseUrl(req)` helper resolves from `APP_BASE_URL` → `REPLIT_DOMAINS` → request headers, eliminating `https://undefined` redirects. (3) `webhookHandlers.ts`: `checkAndRecordWebhookEvent` uses `.onConflictDoNothing()` to eliminate read-then-insert race condition. (4) `upgrades.ts callAI`: optional chaining `response?.choices?.[0]?.message?.content` + JSON.parse try/catch. (5) `content.ts` GET video: added direct `video.userId !== userId` ownership check before channel lookup (IDOR fix). (6) All 4 `.passthrough()` mass-assignment sinks removed from `content.ts` (channel update, video update) and `platform.ts` (community post, subscription) — replaced with explicit allowlist schemas. (7) `storage.ts getVideosByUser`: added `page`/`limit` params with DB-level LIMIT/OFFSET (max 100); route updated to pass these instead of in-memory slice. (8) `usage-metering.ts`: reads `user?.tier || user?.subscriptionTier` for both property name variants. (9) `youtube-quota-tracker.ts getNextResetTime`: uses `Intl.DateTimeFormat.formatToParts()` to reliably extract Pacific midnight UTC. (10) `youtube.ts` OAuth token handler: wrapped in IIFE + try/catch to prevent unhandled promise rejections. (11) `youtube.ts` numeric stats: all truthy checks on `subscriberCount/videoCount/viewCount` replaced with `!= null` checks (fixes channels reporting 0 subscribers). (12) `offline-engine.ts`: `runDueAutomations` uses `apiRequest` (not raw `fetch`) for CSRF token; event listeners stored as named refs so `stop()` can properly remove them. (13) `settings.ts`: removed duplicate `POST /api/notifications/mark-all-read` endpoint (canonical is `read-all`). (14) `AuthForm.tsx`: password toggle `tabIndex={-1}` removed; added `aria-label`, `aria-pressed`, `type="button"`. (15) `use-login-sync.ts syncTriggered`: reset to `false` on all exit paths (success, error, timeout). (16) `stripe-hardening.ts`: all 5 in-memory Maps/Sets migrated to DB tables (`billing_dunning_records`, `billing_paused_subscriptions`, `billing_promo_applications`, `billing_promo_usage`, `billing_trial_records`, `billing_invoices`); `applyPromoCode` now validates tier applicability; promo uses atomic `INSERT ... ON CONFLICT DO UPDATE SET currentUses = currentUses + 1`. `tweetnacl` package installed.
- **DB Pool + Cron Pressure Fixes** (2026-03-04 session 2): Addresses cascading DB connection timeout failures visible in production logs. (1) `server/db.ts`: pool `max` raised 15 → 20 connections; `idleTimeoutMillis` reduced 30s → 20s (faster slot reclamation); `connectionTimeoutMillis` reduced 15s → 10s (fail-fast for withRetry); statement/query timeouts reduced 30s → 25s. (2) `server/automation-engine.ts`: ScheduledPosts cron changed from `"* * * * *"` (every 1 min) to `"*/2 * * * *"` (every 2 min) — was acquiring a DB cron-lock every 60s; halving frequency reduces DB lock contention by 50%. Lock TTL raised from 55s to 90s to match new interval. (3) `server/auto-thumbnail-engine.ts`: image generation switched from `"1024x1024"` to `"512x512"` — eliminates `"Media is too large. Limit: 2097152"` errors at the source (512x512 PNG is ~4× smaller). Added pre-flight check: if generated buffer still exceeds 2 MB, permanently marks video `metadata.autoThumbnailFailed = "image_too_large"` without uploading. Extended catch block to also detect `"Media is too large"` / `"2097152"` / `"media_too_large"` errors from YouTube API and apply the same permanent-fail mark — stops infinite 30-second retry loop for oversized thumbnails.