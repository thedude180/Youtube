# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed for creators. It supports 6 focused platforms (YouTube, Twitch, Kick, TikTok, X, Discord), offering AI-powered insights, compliance checks, growth strategies, and content optimization. The platform integrates 832 AI-powered features, 6 autonomous automation systems, and a 5-system Autopilot engine to provide near-100% automated end-to-end business management. CreatorOS aims to be a "YouTube Team In A Box," empowering creators with advanced tools for content creation, distribution, and business growth.

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
The platform is built as a full-stack application with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database. It features a multi-tenant architecture with user ID scoping on all data.

- **Frontend**: React + Vite, leveraging TanStack Query, wouter for routing, Tailwind CSS and shadcn/ui for UI components, and lucide-react for iconography.
- **Backend**: Express.js with Drizzle ORM.
- **Database**: PostgreSQL.
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model).
- **Authentication**: Replit Auth (OIDC-based).
- **Design System**: Dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Internationalization (i18n)**: react-i18next with 12 languages (English, Spanish, French, Portuguese, German, Japanese, Korean, Chinese, Arabic, Hindi, Russian, Italian), including RTL support.
- **Dual Pipeline System**: Live Stream Pipeline (65 steps) + VOD Pipeline (56 steps) across 9 phases (INTAKE, INTELLIGENCE, CONTENT OPS, SEO & GROWTH, DISTRIBUTION, AUDIENCE, COMMUNITY, PRODUCTION, SECURITY). Live pipeline includes 4 live discovery steps (Live SEO Boost, Live Thumbnail, Go-Live Announce, Discovery Tags) that fire immediately when stream starts to maximize discoverability across all 6 platforms. Both pipelines include 4 retention steps (Retention Hooks, Pattern Interrupts, Engage Inserts, Pacing Optimizer) for maximum watch-through. VOD pipelines auto-spawn only after live content is published with human-realistic delays (1.5-12h gaussian, nighttime skip, weekend multiplier). Manual VOD creation forbidden — requires sourcePipelineId from completed live pipeline.
- **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) for background processing.
- **Autopilot Engine**: 5 hands-off automation systems: Auto-Clip & Post (TikTok/X), Smart Schedule (staggered posting), AI Comment Responder (YouTube), Discord Announcements, Content Recycler (re-promote old videos). Tables: autopilot_queue, comment_responses, autopilot_config. Routes: /api/autopilot/*. Page: /autopilot.
- **Human Behavior Engine** (server/human-behavior-engine.ts): Realistic posting patterns with per-platform peak hours, gaussian-distributed timing, waking-hours-only scheduling, weekend multipliers, daily post budgets, micro-delays, and activity windows. Makes all automation look like a dedicated human.
- **Content Variation Engine** (server/content-variation-engine.ts): Generates completely unique content per platform using 15 content angles, platform-specific voice profiles, banned AI-phrase filtering, natural imperfections, content fingerprinting, uniqueness scoring, and stealth scoring. Self-monitors with safety checks and retry logic.
- **Full Throttle Stealth Mode**: 7 autopilot features (auto-clip, smart-schedule, comment-responder, discord-announce, content-recycler, cross-promo, stealth-mode). Cross-platform loops auto-promote performing content. Stealth dashboard shows per-platform safety grades, overall stealth score, issues, and recommendations.
- **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, and Learning Engine for personalized AI outputs.
- **PWA Support**: Full Progressive Web App capabilities for installability and offline access.
- **UI/UX**: Consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat with message persistence, command palette (Ctrl+K), keyboard shortcuts help (?), rich empty states with contextual tips.
- **State Management**: ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.
- **Offline System**: IndexedDB storage with cache eviction (500 entry max, TTL cleanup every 50 writes), offline mutation queuing, service worker API caching, connection monitoring with toast notifications, PWA install prompt.
- **Performance**: Dashboard lazy-loading with IntersectionObserver for below-fold API queries, session expiry detection with graceful toast + redirect. Content.tsx, Settings.tsx, Dashboard.tsx, and Money.tsx all use React.lazy + Suspense for tab/section-level code splitting (extracted to client/src/pages/content/, client/src/pages/settings/, client/src/pages/dashboard/, client/src/pages/money/).
- **Error Handling**: QueryErrorReset component provides retry buttons for failed queries. SectionErrorBoundary wraps 8 dashboard sections for isolated error recovery. Toast notifications replace silent .catch({}) handlers. Zod validation on 38 critical server routes.
- **AI Caching**: sessionStorage with 30-minute TTL via client/src/lib/ai-cache.ts utilities (getCachedAI, setCachedAI, fetchAIWithCache). Empty AI results show "No results available" message.
- **Type Safety**: AIResponse type (Record<string, unknown> | null) replaces useState<any> for AI result states across all pages.
- **Real-Time Updates**: Server-Sent Events (SSE) via /api/events endpoint with client hook (use-sse.ts) for live dashboard/notification/content updates with exponential backoff reconnection.
- **Server Architecture**: Routes split into 10 domain modules (server/routes/): ai.ts, admin.ts, content.ts, stream.ts, money.ts, settings.ts, platform.ts, automation.ts, events.ts, helpers.ts. Main routes.ts is a thin orchestrator (~180 lines).
- **AI Rate Limiting**: Per-user daily limits by subscription tier (free:10, youtube:50, starter:200, pro:500, ultimate:2000) plus per-minute rate limiting (30 req/min for AI, 120 req/min general).
- **Database Indexing**: Indexes on userId and channelId columns across 23 frequently-queried tables for query performance.
- **Auto Revenue Sync** (server/revenue-sync-engine.ts): Pulls revenue from connected platforms every 6 hours. YouTube (Analytics API, memberships, Super Chats), Twitch (subscriptions, bits, ads), TikTok (Creator Fund, live gifts), Kick (subscriptions), X (ads revenue share), Discord (server subscriptions), Stripe (charges). Uses externalId deduplication. Routes: /api/revenue/sync, /api/revenue/sync-status, /api/revenue/breakdown. Tables: revenue_sync_log + syncSource/externalId fields on revenue_records.
- **Platform Sync Engine** (server/platform-sync-engine.ts): Real-time push of updated video metadata (title, description, tags) to YouTube immediately after processing. Triggered from two paths: (1) Backlog engine — after metadata update (syncVideoAfterProcessing), and (2) Pipeline — after each metadata step completes (title, description, tags, thumbnail via syncPipelineResultsToYouTube). Updates local video record to stay consistent with YouTube. Supports thumbnail push via pushThumbnailToYouTube when a real image URL is available. SSE events broadcast sync status in real-time. Thumbnail concepts from pipeline are broadcast as "thumbnail_concepts_ready" for UI display.
- **Key Features**:
    - **Home**: Dashboard with various AI-powered insights, analytics, and action centers.
    - **Content**: Library, Channels, Calendar, and Localization tabs with AI-powered content quality, repurposing, and localization tools.
    - **Go Live**: Stream Center with AI Stream Advisor, chatbot builder, and advanced live streaming features.
    - **Money**: Revenue management with AI financial insights, P&L reports, and revenue optimization tools.
    - **Settings**: General settings, brand management, collaboration tools, competitor analysis, legal protection, wellness, and an Automation Hub.
- **Security & Performance**: Includes Helmet security headers, response compression, request body size limits, request IDs, structured logging, request timeouts, rate limiting, subscription tier enforcement, async error handling, global 401 handler, smart query caching, global error toasts, PWA service worker, keyboard shortcuts, accessibility, SEO, data export, and database indexing.
- **OAuth Platform Integration**: Universal OAuth framework for 23 platforms, generic OAuth routes, status API, and automatic data fetching and token refresh for connected platforms.
- **Login Groups**: Platforms sharing the same login provider are grouped in onboarding (Google → YouTube+Shorts, Meta → Facebook+Instagram+Threads). One login connects all platforms in the group. YouTube Shorts is deprecated as a separate platform — YouTube covers both.
- **Subscription & Access System**: Multi-tier subscription model (free, youtube, starter, pro, ultimate) with role-based access, admin capabilities, and Stripe integration for payments.

## External Dependencies
- **Replit Auth**: For user authentication.
- **OpenAI API**: For all AI-driven functionalities.
- **react-i18next / i18next**: For internationalization.
- **PostgreSQL (Neon-backed)**: The primary database.
- **YouTube Data API v3**: For OAuth2 connection and YouTube integration.
- **Stripe**: For payment processing and subscription management.
- **node-cron**: For background task scheduling.