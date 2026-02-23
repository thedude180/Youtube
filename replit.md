# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform that provides AI-powered insights, compliance checks, growth strategies, and content optimization across major platforms like YouTube, Twitch, Kick, TikTok, X, and Discord. Its core purpose is to offer near-100% automated end-to-end business management, functioning as a "YouTube Team In A Box" to autonomously manage a creator's online presence, foster growth, and maximize revenue. The platform is **niche-agnostic** — it automatically detects and adapts to any content niche (gaming, cooking, tech, fitness, music, comedy, education, beauty, travel, finance, crafts, automotive, sports, science, art, photography, pets, ASMR, reaction, vlogging, and more).

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 25 platforms)
- "5-year-old simple" UI with big buttons and color-coded status
- Exception-only notifications (AI handles everything silently unless issue arises)
- Advanced Mode toggle (off by default) - reveals extra controls, detailed metrics, manual overrides
- Streamlined navigation - consolidated from 22 sidebar items down to 5
- Floating AI chat accessible from any page
- No manual trigger buttons - everything runs autonomously in background

## System Architecture
CreatorOS is a full-stack application with an Express.js backend and a React/Vite frontend, built on a multi-tenant PostgreSQL database with user ID scoping.

### Frontend
- **Technology**: React + Vite with Tailwind CSS and shadcn/ui.
- **UI/UX**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat, command palette, keyboard shortcuts, rich empty states.
- **QoL Features**: Global loading bar, copy-to-clipboard, auto-updating timestamps, animated counters, undo toast, tab memory, focus mode.
- **State Management**: TanStack Query, ThemeProvider, AdvancedModeProvider, FocusModeProvider with localStorage persistence and real-time updates via SSE.
- **Adaptive System**: `AdaptiveProvider` adjusts rendering based on device capabilities.
- **Native App**: Capacitor integration for iOS/Android.
- **Internationalization**: `react-i18next` with 12 languages and RTL support.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, response compression, rate limiting, CSRF protection, API key authentication, parameter pollution protection, User-Agent validation, subscription tier enforcement, circuit breaker, AI Security Sentinel.
- **AI Integration**: OpenAI (gpt-5-mini) via Replit AI Integrations.
- **Core Engines**:
    - **Dual Pipeline System**: 65-step Live Stream and 56-step VOD pipelines across 9 phases.
    - **Content Loop Engine**: Continuous state machine for content generation (livestream → stream-exhaust → vod-optimize → thumbnail-gen → idle).
    - **Automation Engine**: Cron Scheduler, Content Loop boot, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior Engine**: Simulates realistic posting patterns.
    - **Content Variation Engine**: Generates unique platform-specific content using 15 content angles and voice profiles.
    - **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, Learning Engine.
    - **Ultimate Engine**: 17 advanced AI features including Self-Healing Pipelines, Predictive Analytics, Creator DNA, Audience Mind Mapping, and Shadow Ban Detection.
    - **Idea-to-Empire Builder**: AI-driven tool for new creators, automating content strategy.
    - **Multi-Platform Live Detection**: Polls connected platforms every 2 minutes.
    - **YouTube Learning Source Engine**: Uses YouTube for niche trends, creator patterns, and algorithm insights.
    - **Creator Skill Progression System**: Tracks creator maturity and adapts AI outputs.
    - **Platform Sync Engines**: Auto Revenue Sync and Platform Sync.
    - **YouTube Quota Manager & Push Backlog**: Manages YouTube API quota and queues optimizations.
    - **Content Performance Predictor**: AI-powered prediction with actionable suggestions.
    - **Cross-Platform Analytics**: Unified dashboard.
    - **Autonomous Marketer Engine**: Orchestrates 15 organic marketing strategies and optional paid ads.
    - **Keyword Learning Engine**: Analyzes performance for winning keywords.
    - **Traffic Growth Engine**: Generates ToS-compliant traffic strategies.
    - **Priority Orchestrator**: Manages dynamic content priorities.
    - **Daily Content Engine**: Extracts and cross-posts content from livestreams.
    - **VOD Optimizer Engine**: Identifies and optimizes underperforming old videos.
    - **Auto-Playlist Manager**: Automatically organizes videos into game-specific playlists.
    - **Retention Beats Engine**: Applies retention patterns from top YouTube creators.
    - **Publish Verification Engine**: Confirms content is live on platforms post-publishing.
    - **Content Verification Engine**: Verifies live streams and VODs are active and real.
    - **Auto-Thumbnail Engine**: AI-powered thumbnail generation and refresh for underperforming videos.
    - **Stream Clip → YouTube Shorts Pipeline**: Processes clips for YouTube Shorts.
    - **Reconnect Email Service**: Sends Gmail alerts for OAuth token expiry.
    - **Self-Healing Core**: Wraps all automation subsystems with autonomous failure detection, AI diagnosis, retry logic, circuit breakers, and health monitoring.
    - **Auto-Fix Engine**: Autonomous failure classification and recovery system. Classifies errors into 8 categories (quota_cap, rate_limit, auth_expired, network, copyright, platform_down, config_missing, unknown). Quota/cap errors defer until daily reset (YouTube midnight Pacific). Auth errors trigger auto token refresh. Network/platform errors use exponential backoff. Copyright/config errors are permanent. Runs every 3 minutes via cron. API: GET /api/autopilot/auto-fix/status.
    - **Weekly Report Engine**: Automated weekly email digest.
    - **TikTok Video Publishing Pipeline**: Downloads, cuts, and uploads clips to TikTok.

### Dashboard Features
- **Mission Control**: Real-time system health dashboard.
- **AI Proof of Work Feed**: Live feed of AI actions.
- **Competitor Benchmarking**: AI-powered competitive intelligence.
- **Enhanced Onboarding**: 8-milestone checklist.
- **Calendar Drag-and-Drop**: Rescheduling in Month and Week views.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth framework for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access control.

### Notification & Feedback Systems
- **Notification Engine**: Email and optional SMS alerts.
- **AI Feedback Processor**: Analyzes user feedback.

### Infrastructure & Hardening
- Centralized OpenAI client with automatic token/latency telemetry, retry wrapper for external API calls, LRU cache for AI responses, structured logging (zero empty catch blocks), memory leak prevention, AI request queue, SSE with backpressure protection (64KB payload limit, 200 global connection cap, 5 per-user limit), database indexes and transactions, Zod input validation + centralized AI body validation middleware (50KB max), rate limiting, request tracking, webhook security, CSRF protection, secure API keys, error handling, frontend lazy loading, data-testid attributes, ARIA accessibility, pagination.
- **DB-Backed Cron Locks** (`server/lib/cron-lock.ts`): Prevents overlapping cron execution on restart. TTL-based with instance tracking, execution count, duration, and error logging. Applied to all 15+ cron jobs.
- **External Service Health Checks** (`server/services/external-health.ts`): Probes YouTube, Twitch, TikTok, Stripe, Gmail, Discord, Kick, OpenAI, and PostgreSQL. API: `GET /api/system/external-health`.
- **AI Telemetry** (`server/lib/openai.ts`): Transparent proxy on OpenAI client tracks tokens in/out, latency, failure rate, per-model stats. API: `GET /api/system/ai-telemetry`.
- **Database Transactions**: Critical multi-step storage operations (deleteChannel, redeemAccessCode, upsertBusinessDetails, upsertLocalizationRecommendations, upsertNotificationPreferences) wrapped in `db.transaction()` to prevent partial writes.
- **Memory Monitoring**: Hard cap on globalRateLimitMap (50K entries, auto-evicts oldest 20%), heap usage warning at 512MB, admin-only `/api/system/memory-stats` endpoint with Map sizes.
- **DB Pool Monitoring**: `/api/health` includes pool stats (total, idle, waiting, saturated flag) for connection pool saturation detection.
- **Response Sanitization**: Production mode strips internal error details, stack traces, and `err.errors` from responses; generic messages for 500+ errors; AppError details stripped for server errors.
- **Security Audit Logging** (`server/lib/audit.ts`): Audit trails for API key creation/revocation, admin role changes with risk levels and full context. JSONB details stored for compliance.
- **Subscription Tier Enforcement**: 10 premium endpoints in automation (8) and streaming (2) routes now require starter/pro tier. Tier hierarchy: free < youtube < starter < pro < ultimate.
- **Cross-Tenant Protection**: All critical routes verify resource ownership (userId scoping) before allowing access/modification.
- **System Status APIs**: `GET /api/system/health`, `GET /api/system/subsystems`, `GET /api/system/cron-locks`, `GET /api/system/external-health`, `GET /api/system/ai-telemetry`, `GET /api/system/memory-stats` (admin-only).

### Engine Heartbeat System
- Records real-time status (running/idle/error), timestamps, duration, and failure counts for background engines, persisted in the database.

### Usage Metering & Billing
- Tracks AI calls, videos processed, platform count, posts per day against tier limits. Includes Stripe integration for billing history, subscription cancellation/reactivation, and a customer self-service portal.

### Content Pipeline Enhancements
- **A/B Test Tracking**: For title/thumbnail variants.
- **Content Approval Workflow**: For review before publishing.
- **Bulk Content Editing**: Update tags/status on multiple videos.

### GDPR & Legal Compliance
- Cookie consent, data export functionality, account deletion with audit logging, and configurable notification preferences.

### PWA Support
- Service Worker for caching and push notifications, Web App Manifest for installability, and an offline indicator.

### Platform Stubs
- Extended platforms (Rumble, Facebook, Instagram) with OAuth config stubs, affiliate link tracking.

### Professional Email Templates
- Branded HTML emails for alerts, reports, and welcome messages.

### Additional Pages
- **System Status**: Live engine monitoring.
- **Keyboard Shortcuts**: Help dialog.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Gmail API**: Email notifications.
- **react-i18next / i18next**: Internationalization.
- **PostgreSQL**: Primary database.
- **YouTube Data API v3**: YouTube integration.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.