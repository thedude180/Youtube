# CreatorOS - AI YouTube Business Team

## Overview
CreatorOS is an autonomous AI-powered YouTube business that deploys a team of 20 specialized AI agents to manage and grow a creator's channel 24/7. These agents handle tasks such as scriptwriting, thumbnail production, SEO optimization, community management, revenue tracking, live stream pipeline management, content catalog mining, and maximizing concurrent viewers. The project aims to provide a simple UI where users can observe and approve the autonomous team's work, focusing on business vision, market potential, and project ambitions to revolutionize content creation.

## User Preferences
- Dark mode, clean and simple — agents are the star of the show
- 5 pages only: Team (home), Content, Live, Revenue, Settings
- Exception-only notifications (AI handles everything silently)
- No complexity — no empire scores, no mission control, no legal/tax dashboards
- Everything runs autonomously in the background; user just observes and approves

## System Architecture
CreatorOS is a full-stack application built with an Express.js backend and a React/Vite frontend, all centered around a multi-tenant PostgreSQL database.

### Frontend
- **Technology**: React + Vite, Tailwind CSS, shadcn/ui.
- **Pages**: 5 dedicated pages for Team (home), Content, Live, Revenue, and Settings, each displaying relevant information and agent activities.
- **Navigation**: Persistent sidebar and mobile bottom navigation for core pages.
- **Features**: Dark theme, notification bell, floating AI chat, command palette, keyboard shortcuts, and PWA support.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Robust security measures including Helmet, rate limiting, CSRF protection, API key authentication, subscription tier enforcement, and an AI Security Sentinel for prompt injection and replay attack prevention.
- **AI Integration**: Leverages OpenAI (gpt-5-mini) and Anthropic (Claude Opus/Sonnet/Haiku), with intelligent routing based on task requirements.
- **Core Engines**:
    - **Growth Journey System**: AI-generated daily actions and personalized roadmaps.
    - **Competitive Edge Suite**: VOD optimizer, Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics, A/B Testing, Sponsorship Marketplace.
    - **Content Loop Engine**: Manages content generation and scheduling.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior & AI Humanizer Engines**: Simulate realistic posting.
    - **Autonomy Controller**: Orchestrates all AI engines.
    - **AI Team Engine**: Facilitates collaboration among autonomous AI agents via a shared task queue, with agents like Jamie Cruz (Catalog Content Director) mining YouTube catalog for repurposing opportunities.
    - **Smart Edit Engine**: Autonomous highlight reel generator using audio energy analysis, scene change detection, and GPT-4o-mini for segment selection, editing with FFmpeg, and YouTube upload with AI-optimized metadata.
    - **Performance Feedback Engine**: Analyzes video performance using YouTube Analytics API to close the learning loop for future AI content decisions.
    - **Livestream Growth Agent**: River Osei automates SEO-optimized title updates, social media pushes to X, Discord, and TikTok to drive live viewers.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling capabilities.
    - **Content Automation System**: Includes YouTube Upload Watcher, Historical Content Sweep, and Content Consistency Agent.
    - **Auto Agent Orchestrator**: Manages background agent sessions for paid users.
    - **Team Ops God Mode**: Orchestrates a larger company of agents via a dedicated service.
    - **God-Level Business AI Exec Team**: 9 autonomous AI executives for business functions.
    - **Legal & Tax AI Agent Command Center**: 18 autonomous AI agents for legal and tax auditing.
    - **Autonomous Social Media Company**: Manages live stream detection, lifecycle, creator DNA, stream operations, shorts factory, VOD SEO, multi-platform distribution, revenue intelligence, and community.
- **Secure Kernel**: Implements CQRS command routing with an approval matrix, idempotency, HMAC-signed receipts, DLQ routing, feature flag gating, and webhook verification. Includes inter-agent communication (Agent Interop Bus), agent performance evaluation (Eval Harness), audience trust management (Trust Budget), runtime platform integration verification (Capability Probes), payment and localization adapters, and degradation playbooks.
- **Phase 2 Content + YouTube Core**: Comprises 25 content modules covering the full content lifecycle, including content atomization, replay generation, thumbnail/SEO labs, brand system, revenue attribution, shadow audience simulation, multilingual support, and AI disclosure compliance.
- **System Hardening**: Features a centralized OpenAI client with telemetry, retry logic, caching, structured logging, Zod validation, DB-backed cron locks, external service health checks, and a self-healing core for high availability.
- **Phase 3 Live Ops**: Governance-integrated live stream operations layer with 22 modules in `server/live-ops/`: game-detection, war-room, event-triggers, live-trust (budgeted title/chat/engagement actions), live-title, live-chat-workflow, moment-capture, post-stream-handoff, live-learning, live-revenue, live-commerce, monetization-timing, burnout-prediction, crisis-detection, audience-geo, live-accessibility, co-creation, live-authenticity, community-activation, live-degradation playbooks, webhook-reliability, and live-override-learning. Frontend Live Ops Intelligence tab on Stream Center with trust budget visualization, wellness/recovery, and degradation playbooks. 20+ REST endpoints at `/api/live-ops/*`. 41 integration tests.
- **Phase 4 Distribution + Brand**: Cross-platform distribution governance layer in `server/distribution/` with 4 modules: platform-adapter (governance pipeline with trust budget, capability probes, policy gates), connection-health (circuit breaker pattern for platform reliability), publishing-gates (content compliance, clickbait detection, disclosure/copyright enforcement), distribution-learning (feedback signals and distribution insights). 9 new schema tables: distributionEvents, cadenceIntelligence, platformDependencyScores, algorithmRelationships, trendArbitrageOpportunities, formatInnovations, contentTimingIntelligence, platformIndependenceScores, nicheAuthorityTracking. 24 integration tests.
- **Platform Policy Tracker**: Monitors 7 platforms for policy changes and enforces compliance.
- **Phase 5 Business / Profit / Commerce (In Progress)**: Revenue reconciliation truth layer in `server/business/` with 2 modules: revenue-reconciliation (6-status reconciliation lifecycle: verified/estimated/disputed/delayed/unresolved/unverified, truth summary with confidence labels, reconciliation reports with platform breakdown, delayed record flagging, human action routing for gaps > $100), revenue-attribution (content-to-revenue attribution graph with direct/inferred/proportional methods, per-platform attribution rates, top revenue content ranking). 31 integration tests.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access.

### Notification & Feedback Systems
- **Notification Engine**: Exception-only model for critical alerts.
- **AI Feedback Processor**: Analyzes user feedback for continuous improvement.

## External Dependencies
- **Replit Auth**: User authentication.
- **OpenAI API**: AI-driven functionalities.
- **Anthropic API**: AI-driven functionalities (Claude models).
- **Gmail API**: Email notifications.
- **i18next**: Internationalization.
- **PostgreSQL**: Primary database.
- **YouTube Data API v3**: YouTube integration.
- **Stripe**: Payment processing and subscription management.
- **node-cron**: Background task scheduling.
- **tweetnacl**: Cryptographic library for security.
- **sharp**: Image processing.
- **web-push**: VAPID-based web push notifications.