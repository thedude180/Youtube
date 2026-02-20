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
    - **Automation Engine**: Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store for background processing.
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
    - **Keyword Learning Engine**: Analyzes performance to identify and inject winning keywords.
    - **Traffic Growth Engine**: Generates ToS-compliant traffic strategies.
    - **Priority Orchestrator**: Manages dynamic content priorities (e.g., Top YouTuber Growth, Daily Uploads, VOD Optimization, Livestream overrides).
    - **Daily Content Engine**: Extracts content from livestreams, generating long-form videos and shorts, and cross-posts to TikTok, X, Discord.
    - **VOD Optimizer Engine**: Identifies underperforming old videos for AI-driven optimization of metadata and thumbnails.
    - **Retention Beats Engine**: Learns and applies retention patterns from top YouTube creators to optimize content.
    - **Publish Verification Engine**: Confirms content is live on platforms post-publishing via API checks.
    - **Auto-Thumbnail Engine**: AI-powered thumbnail generation and upload.
    - **Stream Clip → YouTube Shorts Pipeline**: Processes stream clips for YouTube Shorts, including downloading, cutting, and uploading.
    - **Reconnect Email Service**: Sends Gmail alerts for OAuth token expiry.

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