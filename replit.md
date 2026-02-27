# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform designed to automate and optimize a creator's online presence across major platforms like YouTube, Twitch, Kick, TikTok, X, and Discord. It offers AI-powered insights, compliance checks, growth strategies, and content optimization, functioning as a "YouTube Team In A Box" to manage end-to-end business operations. The platform aims to provide near-100% automated growth and revenue maximization for online creators, adapting automatically to various content categories.

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

## Mobile Architecture
- **Bottom Nav**: 5-item cinematic nav (Hub/Autopilot/Plan/Revenue/AI) with glowing active indicator, glassmorphism bg, safe area support
- **Mobile FAB**: Floating purple AI chat button above bottom nav (`.fab` class), hidden on desktop
- **Global Tab Scrolling**: All `[role="tablist"]` elements scroll horizontally on mobile via global CSS
- **Touch Targets**: 36px min-height globally on mobile, tap highlight removed
- **Pipeline Visualizer**: Horizontally scrollable on mobile (`min-w-[420px]` + `touch-scroll`)
- **Empire Score Gauge**: Responsive sizing `w-32 h-32 sm:w-40 md:w-48` with SVG viewBox
- **iOS Scroll**: `-webkit-overflow-scrolling: touch` on all overflow containers
- **Safe Areas**: `env(safe-area-inset-bottom)` for bottom nav and FAB positioning
- **Mobile CSS Classes**: `.fab`, `.touch-scroll`, `.pb-nav`, `.mb-nav`, `.mobile-status-pill`, `.god-mode-badge`
- **Theme Toggle**: Now visible on mobile (removed `hidden sm:inline-flex` wrapper)

## Dual-Mode Hub System
- **Hub Page** (`/hub`): Dual-mode command center — Content Mode (AI publishing queue + verification receipts) and Stream Mode (auto-triggered when live detected)
- **CreatorModeProvider**: Wraps entire app in `client/src/hooks/use-creator-mode.tsx` — polls `/api/youtube/live-status` every 30s, auto-switches to streaming mode when live
- **LiveStreamBanner**: Global overlay banner shown when streaming is active (`client/src/components/LiveStreamBanner.tsx`), links to /hub
- **Mode switching**: Auto-triggers Stream Mode on live detection, auto-returns to Content Mode when stream ends

## Visual Design System (index.css)
- **New Keyframes**: radar-sweep, pulse-ring, data-stream, neon-flicker, scan-line, ticker-scroll, orbit, empire-glow, threat-pulse, gradient-shift, holographic
- **Power Classes**: .card-empire (animated glow border), .neon-text, .holographic-text, .data-grid-bg, .terminal, .metric-display, .live-dot, .gradient-border, .ticker-scroll, .orbit-1/2/3, .animated-gradient-bg, .glow-purple/green/red/gold/blue
- **Mobile Utilities**: .fab, .touch-scroll, .pb-nav, .mb-nav, .mobile-status-pill, .god-mode-badge, .swipe-card

## Page Features (Latest)
- **Sidebar**: Live stats strip (subscribers, revenue, AI agents), "LIVE" indicator, AI performance widget, terminal icon for AI Command
- **Dashboard**: Empire Score hero card (circular gauge), AI Live Ticker (scrolling activity feed), Platform Pulse Grid (10 platforms), Revenue Today counter
- **WarRoom**: SVG Radar Scanner, 5-tier Threat Level Gauge, Live Signal Feed (rotating status), Crisis Mode with threat-pulse animation
- **MissionControl**: Orbital system visualization (3 rings, 8 modules), Live Telemetry Feed terminal, SVG Status Ring gauges
- **Heartbeat**: Overall Health Score gauge, 24-hour health timeline, engine sparklines, animated progress bars
- **Autopilot**: Pipeline Flow Visualizer (7-phase node graph), Live Tasks widget with animated progress
- **EmpireLauncher**: Mission Timeline vertical stages, Launch Velocity Gauge, gradient progress bar
- **AICommand**: Chat interface with typing indicators, gradient border message bubbles, Quick Commands grid
- **Landing**: Live Stats Bar (auto-incrementing counters), Platform Logos Grid, CSS Browser Mockup, Trust Badges, Enhanced Testimonials with growth stats, CTA countdown timer
- **CompetitiveEdge**: Competitor Battle Bars, Market Share Radar (SVG pentagon)
- **GrowthJourney**: Growth Phase Hero Card, Growth Velocity Gauge (speedometer SVG)
- **AI Factory** (/ai-factory): 20 AI tools across 5 tabs — card-empire hero header with stat pills (20 Tools / 10+ Platforms / READY), "All AI models online" live status bar
- **IntelligenceHub**: 8-tab audience analytics — Heatmap upgraded with multi-color heat gradient (blue→purple→orange→gold), peak cell ring highlight, color legend, hover zoom; other tabs: Demographics, Segments, Retention curve, Super Fans, Sentiment, Growth Intel
- **Community**: CommunityHeroStrip with SVG ring gauge (health score, grade, live metrics); SuperFans leaderboard with 🥇🥈🥉 medal badges, fire emoji levels (🔥🔥🔥), animated engagement bars; RadarTab with 4 SVG sentiment rings (Overall Sentiment, Brand Safety, Positive Mentions, Crisis Risk)
- **Content**: ContentStatsStrip with 5 live counters (Total Videos, VODs, Shorts, Published, Est. Views) from real video data
- **Money**: Revenue Intelligence hero strip with Sponsor Potential, Revenue Streams count, Payments count — card-empire + holographic text
- **CreatorHub**: Report Card KPI cards upgraded with colored SVG mini-rings (grade A/B/C/D color-coded), metric-display values, grade-bg color pills; Channel Valuation, Financials (burn rate)
- **Heartbeat**: Health score card upgraded to card-empire + empire-glow + data-grid-bg + glow filter on SVG gauge; engine cards get threat-pulse animation on error status

## System Architecture
CreatorOS is a full-stack application with an Express.js backend and a React/Vite frontend, using a multi-tenant PostgreSQL database.

### Frontend
- **Technology**: React + Vite, Tailwind CSS, shadcn/ui.
- **UI/UX**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, content calendar, floating AI chat, command palette, keyboard shortcuts, rich empty states.
- **Internationalization**: `react-i18next` with 12 languages (EN, ES, FR, PT, DE, JA, KO, ZH, AR, HI, RU, IT), RTL support, locale-aware formatting, auto-detection.
- **SEO**: Dynamic hreflang, Open Graph, Twitter Cards, JSON-LD, robots.txt, sitemap.xml, canonical URLs, per-page title/meta description via PAGE_META map.
- **Accessibility**: Skip-to-content, RouteAnnouncer, ARIA roles/labels, keyboard navigation, focus management.
- **Performance**: Web Vitals monitoring, preconnect/dns-prefetch, lazy loading, code splitting, virtual lists.
- **PWA Support**: Service Worker for caching, push notifications, and offline capability.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, response compression, rate limiting, CSRF protection, API key authentication, parameter pollution protection, User-Agent validation, subscription tier enforcement, circuit breaker, AI Security Sentinel.
- **AI Integration**: Primarily OpenAI (gpt-5-mini) via Replit AI Integrations.
- **Core Engines**: CreatorOS leverages a comprehensive suite of AI-powered engines for automation, growth, and content management, including:
    - **Growth Journey System**: AI-generated daily actions, growth phase detection, personalized roadmaps.
    - **Competitive Edge Suite**: Closed-Loop VOD Optimizer, Closed-Loop Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics & ROI, A/B Testing Engine, Sponsorship Marketplace, Team Collaboration, Copyright Shield, Usage-Based Billing.
    - **Dual Pipeline System**: 65-step Live Stream and 56-step VOD pipelines.
    - **Content Loop Engine**: Manages content generation workflow. Schedules 1 long-form + 3 shorts per day across sequential future days until all stream footage is exhausted. No daily batch cap — fills the entire calendar in a single engine run.
    - **Automation Engine**: Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior & AI Humanizer Engines**: Simulate realistic posting and evade AI detectors.
    - **Autonomy Controller**: Central AI orchestrator for all engines.
    - **Content Variation Engine**: Generates platform-specific content.
    - **Creator Intelligence System**: Style Scanner, Creator Memory, Learning Engine.
    - **Ultimate Engine**: Self-Healing Pipelines, Predictive Analytics, Creator DNA, Audience Mind Mapping, Shadow Ban Detection.
    - **AI Team Engine**: Three autonomous AI agents (Editor, Moderator, Analyst) collaborating via a shared task queue.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling.
- **Engine Heartbeat System**: Records real-time status and failure counts.
- **Usage Metering & Billing**: Tracks AI calls, videos processed, and platform usage.
- **Content Pipeline Enhancements**: A/B Test Tracking, Content Approval Workflow, Bulk Content Editing.
- **GDPR & Legal Compliance**: Cookie consent, data export, account deletion.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access.

### Notification & Feedback Systems
- **Notification Engine**: Exception-only model — alerts only on 3+ consecutive engine failures, critical security threats, platform bans/shadow bans. All routine "info" notifications are suppressed.
- **AI Feedback Processor**: Analyzes user feedback.

### Infrastructure & Hardening
- Centralized OpenAI client with telemetry, retry wrapper, caching, structured logging, memory leak prevention, request queue, SSE with backpressure, Zod input validation, database indexes and transactions.
- **DB-Backed Cron Locks**: Prevents overlapping cron execution.
- **External Service Health Checks**: Probes integrated services.
- **AI Telemetry**: Tracks OpenAI usage, latency, and failure rates.
- **Token Refresh**: Permanently expired tokens have `refreshToken` and `tokenExpiresAt` nulled to prevent infinite retry loops. ConnectionGuardian uses exponential backoff cooldown for dead tokens.
- **Query Client Retry**: 500 errors fail immediately (no retry); transient errors (502/503/504/429/network) retry up to 4 times with exponential backoff.
- **Self-Healing Core**: Autonomous failure detection, AI diagnosis, retry logic, circuit breakers, and health monitoring.
- **Auto-Fix Engine**: Classifies and recovers from various errors.
- **Platform Policy Tracker**: Autonomous engine (runs every 12 hours via autonomy controller) that monitors 7 platforms for policy/TOS changes, updates `complianceRules` table, and auto-enforces limits before publishing. Pre-publish compliance check blocks critical violations and auto-fixes lengths/metadata.
- **System Status APIs**: Endpoints for health, subsystems, and monitoring.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Gmail API**: Email notifications.
- **react-i18next / i18next**: Internationalization.
- **PostgreSQL**: Primary database.
- **YouTube Data API v3**: YouTube integration.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.