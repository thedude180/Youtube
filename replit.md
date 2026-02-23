# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform designed to automate and optimize a creator's online presence across major platforms like YouTube, Twitch, Kick, TikTok, X, and Discord. It offers AI-powered insights, compliance checks, growth strategies, and content optimization, functioning as a "YouTube Team In A Box" to manage end-to-end business operations. The platform is niche-agnostic, automatically adapting to various content categories. Its core ambition is to provide near-100% automated growth and revenue maximization for online creators.

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
CreatorOS is a full-stack application built with an Express.js backend and a React/Vite frontend, utilizing a multi-tenant PostgreSQL database.

### Frontend
- **Technology**: React + Vite, Tailwind CSS, shadcn/ui.
- **UI/UX**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, content calendar, floating AI chat, command palette, keyboard shortcuts, rich empty states.
- **Quality of Life**: Global loading bar, copy-to-clipboard, auto-updating timestamps, animated counters, undo toast, tab memory, focus mode.
- **State Management**: TanStack Query, ThemeProvider, AdvancedModeProvider, FocusModeProvider with localStorage persistence and SSE for real-time updates.
- **Adaptive System**: Adjusts rendering based on device capabilities.
- **Native App**: Capacitor integration for iOS/Android.
- **Internationalization**: `react-i18next` with 12 languages (EN, ES, FR, PT, DE, JA, KO, ZH, AR, HI, RU, IT), RTL support for Arabic, language switcher in sidebar, locale-aware currency/date/number formatting (`client/src/lib/locale-format.ts`), auto-detection via browser language.
- **SEO**: Dynamic hreflang tags for 12 locales + x-default, Open Graph, Twitter Cards, JSON-LD structured data, robots.txt, sitemap.xml with multi-language support, canonical URLs.
- **Accessibility**: Skip-to-content link, RouteAnnouncer for screen readers, ARIA roles/labels, keyboard navigation (Alt+1-5 shortcuts), focus management.
- **Performance**: Web Vitals monitoring (CLS/LCP/INP/FCP/TTFB) with beacon-based collection, preconnect/dns-prefetch hints, lazy loading, code splitting, virtual lists.
- **PWA Support**: Service Worker for caching, push notifications, and offline capability.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, response compression, rate limiting, CSRF protection, API key authentication, parameter pollution protection, User-Agent validation, subscription tier enforcement, circuit breaker, AI Security Sentinel.
- **AI Integration**: Primarily OpenAI (gpt-5-mini) via Replit AI Integrations.
- **Core Engines**:
    - **Dual Pipeline System**: 65-step Live Stream and 56-step VOD pipelines across 9 phases.
    - **Content Loop Engine**: Manages content generation workflow (livestream → stream-exhaust → vod-optimize → thumbnail-gen → idle).
    - **Automation Engine**: Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior Engine**: Simulates realistic posting patterns.
    - **Content Variation Engine**: Generates platform-specific content using diverse angles and voice profiles.
    - **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, Learning Engine.
    - **Ultimate Engine**: Advanced AI features including Self-Healing Pipelines, Predictive Analytics, Creator DNA, Audience Mind Mapping, and Shadow Ban Detection.
    - **Idea-to-Empire Builder**: AI-driven tool for content strategy automation.
    - **Multi-Platform Live Detection**: Polls connected platforms.
    - **YouTube Learning Source Engine**: Analyzes YouTube for trends, creator patterns, and algorithm insights.
    - **Creator Skill Progression System**: Adapts AI outputs based on creator maturity.
    - **Platform Sync Engines**: Auto Revenue Sync and Platform Sync.
    - **YouTube Quota Manager & Push Backlog**: Manages YouTube API quota and queues optimizations.
    - **Content Performance Predictor**: AI-powered prediction with actionable suggestions.
    - **Cross-Platform Analytics**: Unified dashboard.
    - **Autonomous Marketer Engine**: Orchestrates organic and optional paid marketing strategies.
    - **Keyword Learning Engine**: Analyzes performance for winning keywords.
    - **Traffic Growth Engine**: Generates ToS-compliant traffic strategies.
    - **Priority Orchestrator**: Manages dynamic content priorities.
    - **Daily Content Engine**: Extracts and cross-posts content from livestreams.
    - **VOD Optimizer Engine**: Identifies and optimizes underperforming old videos.
    - **Auto-Playlist Manager**: Automatically organizes videos into game-specific playlists.
    - **Retention Beats Engine**: Applies retention patterns from top YouTube creators.
    - **Publish Verification Engine**: Confirms content is live on platforms post-publishing.
    - **Content Verification Engine**: Verifies live streams and VODs are active.
    - **Auto-Thumbnail Engine**: AI-powered thumbnail generation and refresh for underperforming videos.
    - **Stream Clip → YouTube Shorts Pipeline**: Processes clips for YouTube Shorts.
    - **Reconnect Email Service**: Sends Gmail alerts for OAuth token expiry.
    - **Self-Healing Core**: Autonomous failure detection, AI diagnosis, retry logic, circuit breakers, and health monitoring for all automation subsystems.
    - **Auto-Fix Engine**: Classifies and recovers from errors (quota, rate limit, auth, network, copyright, platform down, config missing, unknown).
    - **Weekly Report Engine**: Automated weekly email digest.
    - **TikTok Video Publishing Pipeline**: Downloads, cuts, and uploads clips to TikTok.
    - **AI Memory & Learning System**: Persistent creator intelligence for style, preferences, and performance.
    - **Multi-Model AI Router**: Smart model selection by task, user tier, and priority (gpt-4o-mini, gpt-4o).
    - **Content Quality Engine**: AI-powered quality scoring for titles, descriptions, SEO, and engagement prediction with platform-specific optimization.
    - **Dashboard Intelligence Engine**: Real-time AI-generated insights, trend detection, and opportunity alerts.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling for channel history, performance, and scheduling.
    - **Performance at Scale**: Request deduplication, lazy computation, slow-query detection, global performance reporting.
- **Engine Heartbeat System**: Records real-time status, timestamps, and failure counts for background engines.
- **Usage Metering & Billing**: Tracks AI calls, videos processed, and platform usage against tier limits.
- **Content Pipeline Enhancements**: A/B Test Tracking, Content Approval Workflow, Bulk Content Editing.
- **GDPR & Legal Compliance**: Cookie consent, data export, account deletion, configurable notifications.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth framework for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access control.

### Notification & Feedback Systems
- **Notification Engine**: Email and optional SMS alerts.
- **AI Feedback Processor**: Analyzes user feedback.

### Infrastructure & Hardening
- Centralized OpenAI client with telemetry, retry wrapper, LRU cache, structured logging, memory leak prevention, AI request queue, SSE with backpressure, database indexes and transactions, Zod input validation, rate limiting, request tracking, webhook security, CSRF protection, secure API keys, error handling, frontend lazy loading, data-testid attributes, ARIA accessibility, pagination.
- **DB-Backed Cron Locks**: Prevents overlapping cron execution.
- **External Service Health Checks**: Probes integrated services.
- **AI Telemetry**: Tracks OpenAI usage, latency, and failure rates.
- **Database Transactions**: Ensures data consistency for critical operations.
- **Memory Monitoring**: Heap usage warnings and admin-only memory stats.
- **DB Pool Monitoring**: Provides connection pool statistics.
- **Response Sanitization**: Strips internal error details in production.
- **Security Audit Logging**: Audit trails for sensitive actions.
- **Cross-Tenant Protection**: Verifies resource ownership for critical routes.
- **System Status APIs**: Endpoints for health, subsystems, cron locks, external health, AI telemetry, and memory stats.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Gmail API**: Email notifications.
- **react-i18next / i18next**: Internationalization.
- **PostgreSQL**: Primary database.
- **YouTube Data API v3**: YouTube integration.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.