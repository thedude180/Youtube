# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform designed to automate and optimize a creator's online presence across major platforms like YouTube, Twitch, Kick, TikTok, X, and Discord. It offers AI-powered insights, compliance checks, growth strategies, and content optimization, functioning as a "YouTube Team In A Box" to manage end-to-end business operations. The platform aims to provide near-100% automated growth and revenue maximization for online creators, adapting automatically to various content categories.

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