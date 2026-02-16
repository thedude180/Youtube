# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed to empower creators. It offers AI-powered insights, compliance checks, growth strategies, and content optimization across YouTube, Twitch, Kick, TikTok, X, and Discord. The platform integrates extensive AI features and autonomous automation systems to provide near-100% automated end-to-end business management, aiming to be a "YouTube Team In A Box" for content creators.

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
CreatorOS is built as a full-stack application with an Express.js backend and a React/Vite frontend, using a PostgreSQL database. It features a multi-tenant architecture with user ID scoping on all data.

### Frontend
-   **Technology**: React + Vite
-   **UI/UX**: Tailwind CSS, shadcn/ui, lucide-react for iconography. Dark theme with a purple accent. Consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat with message persistence, command palette (Ctrl+K), keyboard shortcuts help (?), rich empty states with contextual tips.
-   **State Management**: TanStack Query, ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.
-   **Routing**: wouter
-   **Internationalization**: react-i18next with 12 languages and RTL support.
-   **PWA Support**: Full Progressive Web App capabilities including offline storage (IndexedDB), offline mutation queuing, service worker caching, and connection monitoring.
-   **Performance**: Lazy-loading with IntersectionObserver, session expiry detection, code splitting using `React.lazy` and `Suspense`.
-   **Error Handling**: QueryErrorReset component, SectionErrorBoundary, global error toasts.

### Backend
-   **Technology**: Express.js
-   **ORM**: Drizzle ORM
-   **Database**: PostgreSQL
-   **Server Architecture**: Routes split into domain modules (ai, admin, content, stream, money, settings, platform, automation, events, helpers).
-   **Security**: Helmet security headers (CSP enforced, HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff), response compression, request body size limits (2MB JSON, 1MB URL-encoded), request IDs, structured logging, request timeouts (30s API, 60s AI), global IP rate limiting (300 req/min), per-route AI rate limiting (tier-based daily limits), CSRF token protection (double-submit pattern), API key authentication system (Bearer crtr_* tokens), parameter pollution protection, User-Agent validation, subscription tier enforcement, async error handling, global 401 handler, smart query caching, Hack-Proof Security System with adaptive defense rules and AI learning, webhook signature verification (HMAC for YouTube/Twitch/Kick/Discord), circuit breaker pattern for all external APIs.
-   **Security Dashboard**: Real-time security monitoring at Settings > Security showing threat stats, blocked IPs, security events, circuit breaker status, API key management, and defense rule overview. Admin-only deep analytics.
-   **AI Integration**: OpenAI (gpt-5-mini) via Replit AI Integrations. AI rate limiting based on subscription tier.
-   **Core Engines**:
    -   **Dual Pipeline System**: Live Stream Pipeline (65 steps) and VOD Pipeline (56 steps) across 9 phases (INTAKE, INTELLIGENCE, CONTENT OPS, SEO & GROWTH, DISTRIBUTION, AUDIENCE, COMMUNITY, PRODUCTION, SECURITY). Includes live discovery steps and retention steps. VOD pipelines auto-spawn after live content publication with human-realistic delays.
    -   **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) for background processing.
    -   **Autopilot Engine**: 5 hands-off automation systems: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    -   **Human Behavior Engine**: Simulates realistic posting patterns with per-platform peak hours, gaussian timing, waking-hours-only scheduling, weekend multipliers, daily post budgets, and micro-delays.
    -   **Content Variation Engine**: Generates unique content per platform using 15 content angles, platform-specific voice profiles, banned AI-phrase filtering, and uniqueness scoring.
    -   **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, and Learning Engine for personalized AI outputs.
    -   **Ultimate Engine**: A suite of 17 advanced AI-powered features including Self-Healing Pipelines, Dynamic Routing, A/B Testing Engine, Predictive Analytics, Creator DNA, Audience Mind Mapping, Stream Copilot, Audience Migration, Collaboration Network, Revenue Maximizer, Content Compounding, Smart Merch, Algorithm Decoder, Shadow Ban Detection, Multi-Language Empire, Tax Intelligence, and Team Scaling Advisor.
    -   **Idea-to-Empire Builder**: AI-driven tool for new creators to build a complete content strategy from a single idea. Wired into the "I'm a New Creator" onboarding flow — after first login, selecting a niche triggers the full empire build with real-time SSE progress, auto-creates videos, and spawns VOD pipelines. Auto-enables full autopilot (all 7 features) so everything runs hands-free from day one. Video creation uses Human Behavior Engine for gaussian timing delays, peak-hour scheduling, cross-platform staggering, and waking-hours-only constraints. Scripts are generated with anti-AI-detection prompting including banned phrase filtering, natural speech patterns, platform-specific voice profiles, and format-appropriate guidance.
    -   **Multi-Platform Live Detection**: `server/services/live-detection.ts` — Every 2 minutes, polls all connected platforms (YouTube, Twitch, Kick) for active live broadcasts. When a new creator (or any user) goes live on any platform, the system automatically creates a stream record, triggers go-live announcements across all 6 platforms, creates a live pipeline, pauses the content backlog, and notifies the user. When the broadcast ends (2 consecutive missed polls), it auto-ends the stream, spawns a REPLAY pipeline, resumes the backlog, and distributes post-stream highlights. Runs alongside existing YouTube-specific detection in automation-engine.ts.
    -   **Empire Launcher** (Public): No-auth endpoint at POST /api/empire/launch accepting {email, idea}. Orchestrates full autonomous build: find-or-create user, build blueprint, auto-launch 3 videos with VOD pipelines, seed 14-day autopilot across 6 platforms. Status polling via GET /api/empire/launch/:buildToken. Exception-only notification model — AI handles everything silently, only creates critical notifications on catastrophic failures. Rate-limited per email. Frontend at /launch. Tracked via empire_builds table with stage progression and progress percentage.
    -   **YouTube Learning Source Engine**: Uses YouTube as the primary learning source for all content systems. Researches niche-specific trends, successful creator patterns, content gaps, algorithm insights, cross-platform strategies, and monetization data. Seeds learning insights from YouTube research. Refreshes research based on actual video performance. Pulls from external video sources on the internet to improve content quality over time.
    -   **Creator Skill Progression System**: Tracks creator maturity level (1-100) per user via creator_skill_progress table. Videos start rough like a real beginner (awkward intros, basic editing, generic thumbnails) and progressively improve with each video created. 12 skill tiers from "complete_beginner" to "expert" with quality multipliers that control content sophistication. Integrated into createVideoFromIdea prompts so AI generates content matching the creator's current skill level.
    -   **Auto Revenue Sync Engine**: Pulls revenue data from connected platforms every 6 hours.
    -   **Platform Sync Engine**: Real-time push of updated video metadata to platforms like YouTube.
    -   **Customer Database Engine**: Tracks detailed user profiles including engagement scores, churn risk, and lifetime revenue.
    -   **Circuit Breaker System**: `server/services/circuit-breaker.ts` — Wraps all external API calls (YouTube, Twitch, Kick, TikTok, Discord, Stripe, OpenAI, Gmail) with automatic failure detection and recovery. Trips to OPEN after 3-5 failures, auto-recovers via half-open probing after 30-60s cooldown.
    -   **AI Security Sentinel**: `server/services/ai-security-sentinel.ts` — Autonomous AI-powered security scanner running continuously every 15 minutes. Performs 8 scan modules: brute force detection, suspicious IP analysis, circuit breaker health, security event pattern analysis, threat pattern tuning, session anomaly detection, lockout hygiene, and rate limit effectiveness. Auto-fixes issues (blocks malicious IPs, generates threat patterns, tunes false-positive rules, cleans expired lockouts). Integrated with hack-proof fortress. Security is a base feature for ALL users regardless of tier. Scan history persisted in security_scans table.
    -   **Webhook Signature Verification**: `server/services/webhook-verify.ts` — HMAC-based cryptographic verification for inbound webhooks from YouTube (X-Hub-Signature), Twitch (Twitch-Eventsub-Message-Signature), Kick, and Discord. Uses timing-safe comparison to prevent timing attacks.
    -   **Content Performance Predictor**: AI-powered prediction engine at POST /api/ai/predict-performance. Estimates views, likes, comments, engagement rate with confidence scores and actionable suggestions (strengths, weaknesses, improvements).
    -   **Cross-Platform Analytics**: GET /api/analytics/cross-platform — Unified dashboard aggregating videos, streams, views, and revenue across all 6 platforms.
    -   **Background Job Dashboard**: GET /api/health/jobs — Real-time visibility into cron jobs, AI chains, automation rules, and scheduled items.
    -   **Health Monitor**: GET /api/health/engines — Status of all 9 engines plus external service circuit breaker states with green/yellow/red indicators.

### Authentication & Authorization
-   **Authentication**: Replit Auth (OIDC-based).
-   **OAuth**: Universal OAuth framework for 23 platforms with generic routes and automatic token refresh.
-   **Login Groups**: Platforms sharing login providers are grouped for simplified onboarding.
-   **Subscription & Access System**: Multi-tier subscription model with role-based access and admin capabilities.

### Notification & Feedback Systems
-   **Gmail Integration**: Email notifications via Replit Connectors (google-mail). Used for admin escalation alerts when recurring issues aren't auto-resolved. Client at `server/services/gmail-client.ts`.
-   **Notification Engine**: `server/services/notifications.ts` - sends email (Gmail) and SMS (Twilio, optional) alerts. Only contacts users for warnings/critical issues; info-level events are silent.
-   **AI Feedback Processor**: `server/services/feedback-processor.ts` - analyzes user feedback with OpenAI, auto-categorizes, determines tier placement, auto-resolves config-type issues. Only notifies admin when the same issue category hits 3+ unresolved reports in 30 days.
-   **Autopilot Monitor**: `server/services/autopilot-monitor.ts` - background health checker running every 30 minutes for all users with autopilot enabled. Starts on server boot.
-   **Feedback Widget**: `client/src/components/FeedbackWidget.tsx` - floating UI for users to submit improvement suggestions, bug reports, and feature requests. Positioned bottom-right.
-   **Note**: SendGrid integration was dismissed by user. Gmail is the primary email transport. If Gmail connector becomes unavailable, re-propose SendGrid or add SENDGRID_API_KEY secret manually.

## External Dependencies
-   **Replit Auth**: User authentication.
-   **OpenAI API**: All AI-driven functionalities.
-   **Gmail API**: Email notifications via Replit Connectors.
-   **react-i18next / i18next**: Internationalization.
-   **PostgreSQL (Neon-backed)**: Primary database.
-   **YouTube Data API v3**: YouTube integration and OAuth2.
-   **Stripe**: Payment processing and subscription management.
-   **node-cron**: Background task scheduling.
-   **googleapis**: Gmail API client for sending notification emails.