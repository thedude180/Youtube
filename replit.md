# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is the #1 AI-powered creator platform designed to empower creators from beginners to top-tier influencers. It acts as a "YouTube Team In A Box," offering multi-platform content management, live streaming automation, AI-driven growth coaching, and full business operations across major social media platforms. The platform aims for near-100% automated growth and revenue maximization, with AI coaching that adapts to the creator's progression.

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
- **UI/UX Decisions**: Dark theme, consolidated tabbed pages, notification bell, Advanced Mode toggle, content calendar, floating AI chat, command palette, keyboard shortcuts, rich empty states. Mobile optimization includes a cinematic bottom navigation, responsive components, and global scrolling for tabbed elements.
- **Features**: Internationalization (12 languages with RTL support), robust SEO features (dynamic hreflang, Open Graph, JSON-LD), accessibility standards (ARIA roles, keyboard navigation), and performance optimizations (lazy loading, code splitting, PWA support).
- **Core Visuals**: Custom keyframes and power classes create a "God Tier" aesthetic with animated glows, neon effects, data-grid backgrounds, and holographic elements.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Comprehensive measures including Helmet, rate limiting, CSRF protection, API key authentication, subscription tier enforcement, and an AI Security Sentinel with prompt injection detection and replay attack prevention.
- **AI Integration**: Primarily uses OpenAI (gpt-5-mini) for AI functionalities.
- **Core Engines**: A suite of AI-powered engines drives the platform:
    - **Growth Journey System**: AI-generated daily actions and personalized roadmaps.
    - **Competitive Edge Suite**: VOD optimizer, Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics, A/B Testing, Sponsorship Marketplace.
    - **Content Loop Engine**: Manages content generation, scheduling 1 long-form and 3 shorts daily until footage is exhausted, filling the calendar in a single run.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior & AI Humanizer Engines**: Simulate realistic posting to evade AI detectors.
    - **Autonomy Controller**: Orchestrates all AI engines.
    - **AI Team Engine**: Three autonomous AI agents (Editor, Moderator, Analyst) collaborate via a shared task queue.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling.
- **System Hardening**: Centralized OpenAI client with telemetry, retry logic, caching, structured logging, Zod validation. Includes DB-backed cron locks, external service health checks, and a self-healing core for autonomous failure detection and recovery.
- **Platform Policy Tracker**: Monitors 7 platforms for policy changes, updates `complianceRules`, and enforces limits before publishing.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access.

### Notification & Feedback Systems
- **Notification Engine**: Exception-only model, alerting only on critical issues (e.g., 3+ consecutive engine failures, security threats, platform bans).
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

## Key Development Notes
- **CompetitiveEdge route**: `/edge` (NOT `/competitive-edge`)
- **Autopilot.tsx icon imports**: All lucide icons must be explicitly imported. Previously missing: `Youtube` (use `SiYoutube` from react-icons/si instead), `Wifi`, `WifiOff`, `ExternalLink`, `Fingerprint`, `Share`, `Square`, `SquareCheck`. When adding new icon usages, always add to the import line.
- **Production workflow**: Runs pre-built `dist/` files — must run `npx vite build` AND restart workflow after any frontend changes
- **Testing admin OIDC**: `[OIDC] Configure next login with {sub: "7210ff92-76dd-4d0a-80bb-9eb5be27508b", email: "thedude180@gmail.com"}` then navigate `/api/login`
- **T001-T008 visual upgrades**: All implemented and e2e verified — Empire Score, AI Ticker, Platform Pulse (Dashboard), Radar/Threat/Signal (WarRoom), Pipeline/LiveTasks (Autopilot), Phase Hero/Velocity (Growth), BattleBars/MarketRadar (CompetitiveEdge), Orbital/Telemetry (MissionControl), Health Gauge/Timeline (Heartbeat), Live Stats/Logos/Trust/CTA (Landing)