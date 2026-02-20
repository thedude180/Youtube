# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform designed to empower creators with AI-powered insights, compliance checks, growth strategies, and content optimization across major platforms like YouTube, Twitch, Kick, TikTok, X, and Discord. It aims to provide near-100% automated end-to-end business management, essentially acting as a "YouTube Team In A Box" to autonomously manage all aspects of a creator's online presence, foster growth, and maximize revenue.

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
CreatorOS is a full-stack application built with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database in a multi-tenant architecture with user ID scoping.

### Frontend
- **Technology**: React + Vite with Tailwind CSS, shadcn/ui.
- **UI/UX**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat, command palette (Ctrl+K), keyboard shortcuts, rich empty states.
- **QoL Features**: Global loading bar, copy-to-clipboard, auto-updating timestamps, animated counters, undo toast, tab memory, focus mode.
- **State Management**: TanStack Query, ThemeProvider, AdvancedModeProvider, FocusModeProvider with localStorage persistence. Real-time updates via SSE.
- **Adaptive System**: `AdaptiveProvider` detects device capabilities (screen size, performance tier, connection speed, OS preferences) to adjust rendering.
- **Native App**: Capacitor integration for iOS/Android distribution.
- **Internationalization**: `react-i18next` with 12 languages and RTL support.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, response compression, rate limiting, CSRF protection, API key auth, parameter pollution protection, User-Agent validation, subscription tier enforcement, circuit breaker, AI Security Sentinel.
- **AI Integration**: OpenAI (gpt-5-mini) via Replit AI Integrations.
- **Core Engines**:
    - **Dual Pipeline System**: 65-step Live Stream and 56-step VOD pipelines across 9 phases, including live discovery and retention.
    - **Content Loop Engine** (`content-loop.ts`): Continuous state machine replacing cron-based content generation. Phases: livestream → stream-exhaust → vod-optimize → thumbnail-gen → idle. Runs continuously after stream ends, extracting ALL content before moving to VOD optimization. Instantly preempts on new livestream detection. Only idles when all content is fully squeezed.
    - **Automation Engine**: Cron Scheduler (live detection 2min, comment responder 4h, content recycler 6h), Content Loop boot, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior Engine**: Simulates realistic posting patterns.
    - **Content Variation Engine**: Generates unique content per platform using 15 content angles and platform-specific voice profiles.
    - **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, Learning Engine.
    - **Ultimate Engine**: 17 advanced AI features including Self-Healing Pipelines, Predictive Analytics, Creator DNA, Audience Mind Mapping, and Shadow Ban Detection.
    - **Idea-to-Empire Builder**: AI-driven tool for new creators, automating content strategy and activation of autopilot.
    - **Multi-Platform Live Detection**: Polls connected platforms every 2 minutes for active broadcasts.
    - **YouTube Learning Source Engine**: Uses YouTube for niche trends, creator patterns, and algorithm insights.
    - **Creator Skill Progression System**: Tracks creator maturity (1-100) and adapts AI outputs.
    - **Platform Sync Engines**: Auto Revenue Sync and Platform Sync.
    - **YouTube Quota Manager & Push Backlog**: Manages YouTube API quota and queues optimizations.
    - **Content Performance Predictor**: AI-powered prediction with actionable suggestions.
    - **Cross-Platform Analytics**: Unified dashboard.
    - **Autonomous Marketer Engine** (`marketer-engine.ts`): Unified marketing orchestrator that coordinates all 15 organic strategies (SEO, community, cross-platform, collabs, series, retention, trends, playlists, Shorts funnel, end screens, comments, social proof, hashtags, thumbnails, community posts) + optional paid ads (YouTube/Google/TikTok/X ads, only when user explicitly enables). Runs keyword learning, traffic growth, collab scanning, sponsorship readiness, and brand partnerships in a single coordinated cycle every 6 hours. Organic-first by default, Fort Knox coverage with zero gaps.
    - **Keyword Learning Engine**: Analyzes performance to identify and inject winning keywords.
    - **Traffic Growth Engine**: Generates ToS-compliant traffic strategies.
    - **Priority Orchestrator**: Manages dynamic content priorities (e.g., Top YouTuber Growth, Daily Uploads, VOD Optimization, Livestream overrides).
    - **Daily Content Engine**: Extracts content from livestreams, generating long-form videos and shorts, and cross-posts to TikTok, X, Discord.
    - **VOD Optimizer Engine**: Identifies underperforming old videos for AI-driven optimization of metadata and thumbnails. Triggers thumbnail regeneration for optimized videos.
    - **Auto-Playlist Manager** (`playlist-manager.ts`): Automatically organizes all videos into game-specific playlists. Long-form videos go into "{Game} - Full Gameplay & Videos" playlists, shorts into "{Game} - Shorts & Highlights" playlists. Creates YouTube playlists via API, detects game from metadata/title/tags, runs every 4 hours and after content loop completes. Channel-scoped to prevent cross-channel playlist mixing.
    - **Retention Beats Engine**: Learns and applies retention patterns from top YouTube creators to optimize content.
    - **Publish Verification Engine**: Confirms content is live on platforms post-publishing via API checks.
    - **Auto-Thumbnail Engine**: AI-powered thumbnail generation, upload, and automatic refresh for underperforming videos (CTR < 4% or views < 30% of channel average, with 14-day cooldown between refreshes).
    - **Stream Clip → YouTube Shorts Pipeline**: Processes stream clips for YouTube Shorts, including downloading, cutting, and uploading.
    - **Reconnect Email Service**: Sends Gmail alerts for OAuth token expiry.
    - **Self-Healing Core** (`self-healing-core.ts`): Core system function wrapping ALL 25+ automation subsystems with autonomous failure detection, AI-powered diagnosis, automatic retry with exponential backoff, circuit breakers (5-failure threshold with cooldown), and system health monitoring. Every cron job and engine is protected — failures are diagnosed by AI, retried automatically, and circuit-breakers prevent cascading failures. Health report available at `/api/system/health`. Logs self-healing events and notifies on critical failures.
    - **Weekly Report Engine** (`weekly-report-engine.ts`): Automated Monday 9:00 AM UTC email digest sent via Gmail. Summarizes weekly stats (videos created, optimizations, posts), AI work summary, and system health score. Test endpoint at `POST /api/reports/weekly/test`.

### Dashboard Features
- **Mission Control**: Real-time system health dashboard with animated score gauge (0-100), subsystem grid showing status/healing rate/circuit breaker state, and quick stats. Fetches from `/api/system/health` every 15s.
- **AI Proof of Work Feed**: Live feed showing all AI actions grouped by time period (Just Now, Earlier Today, Yesterday, This Week). Shows agent name, action description, and result badges.
- **Competitor Benchmarking**: AI-powered competitive intelligence with session-cached analysis. Shows niche averages, comparison metrics, insights, and recommended actions.
- **Enhanced Onboarding**: 8-milestone checklist with 3 phases (Setup → Activate → Grow), next-step highlighting, and congrats celebration on completion.
- **Calendar Drag-and-Drop**: HTML5 drag-drop rescheduling in Month and Week views with visual drop zone feedback.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth framework for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access control.

### Notification & Feedback Systems
- **Notification Engine**: Email and optional SMS alerts.
- **AI Feedback Processor**: Analyzes user feedback for auto-categorization and resolution.

### Infrastructure & Hardening
- **Centralized OpenAI**: Single shared client.
- **Retry Wrapper**: Exponential backoff for external API calls.
- **LRU Cache**: For AI response caching.
- **Structured Logger**: JSON output, configurable levels.
- **Memory Leak Prevention**: Cleanup intervals for in-memory Maps.
- **Database Indexes**: userId and composite indexes.
- **Database Transactions**: Atomic multi-step writes.
- **Input Validation**: Zod schemas on all POST/PUT bodies.
- **Rate Limiting**: Per-endpoint limits.
- **Request Tracking**: X-Request-ID header.
- **Webhook Security**: HMAC-SHA256 signature verification.
- **Error Handling**: asyncHandler wrapping, ErrorBoundary.
- **Frontend**: Lazy loading, data-testid attributes, ARIA accessibility.
- **Pagination**: List endpoints support `page` and `limit`.

### TikTok Video Publishing Pipeline
- **Clip Video Processor**: Downloads YouTube source videos, cuts clips to 9:16 vertical format for TikTok.
- **TikTok Publisher**: Uploads clips to TikTok via Content Posting API with chunked transfer and token refresh.
- **Integration**: Autopilot and manual publish endpoints for TikTok clips.
- **TikTok Optimization**: Shorts pipeline generates TikTok-optimized clips with trending hooks and hashtag strategy.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Gmail API**: Email notifications (via Replit Connectors).
- **react-i18next / i18next**: Internationalization.
- **PostgreSQL**: Primary database (Neon-backed).
- **YouTube Data API v3**: YouTube integration and OAuth2.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.