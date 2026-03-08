# CreatorOS - AI YouTube Business Team

## Overview
CreatorOS is a fully autonomous AI-powered YouTube business. A team of 15 named AI agents (Jordan Blake/CEO, Nia Okafor/Scriptwriter, Jamie Cruz/Catalog Content Director, etc.) works autonomously 24/7 to grow a creator's channel — writing scripts, producing thumbnails, optimizing SEO, managing community, tracking revenue, running the live stream pipeline, and continuously mining the video catalog for new content. The UI is intentionally simple: just the team doing their work.

## User Preferences
- Dark mode, clean and simple — agents are the star of the show
- 5 pages only: Team (home), Content, Live, Revenue, Settings
- Exception-only notifications (AI handles everything silently)
- No complexity — no empire scores, no mission control, no legal/tax dashboards
- Everything runs autonomously in the background; user just observes and approves

## System Architecture
CreatorOS is a full-stack application leveraging an Express.js backend and a React/Vite frontend, all built around a multi-tenant PostgreSQL database.

### Frontend
- **Technology**: React + Vite, Tailwind CSS, shadcn/ui.
- **Pages (5 total)**:
  - `/` — Team: 15 AI agent cards with live status, activity feed, channel stats (includes Jamie Cruz / Catalog Content Director)
  - `/content` — Content: video library, scripts, calendar, thumbnails
  - `/stream` — Live: stream detection, engagement tools, post-stream pipeline
  - `/money` — Revenue: earnings, expenses, sponsorships, tax
  - `/settings` — Settings: channel connection, brand voice, account
- **Sidebar**: 5-item navigation (Team, Content, Live, Revenue, Settings) + user info + channel stats
- **Mobile**: Bottom nav mirrors sidebar items; floating AI chat available on all pages
- **All legacy routes redirect** to the appropriate page or home (/)
- **Features**: Dark theme, notification bell, floating AI chat, command palette, keyboard shortcuts, PWA support

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Helmet, rate limiting, CSRF protection, API key authentication, subscription tier enforcement, and an AI Security Sentinel for prompt injection detection and replay attack prevention.
- **AI Integration**: Primarily uses OpenAI (gpt-5-mini) and Anthropic (Claude Opus/Sonnet/Haiku) for various AI functionalities, intelligently routed based on task.
- **Core Engines**:
    - **Growth Journey System**: AI-generated daily actions and personalized roadmaps.
    - **Competitive Edge Suite**: VOD optimizer, Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics, A/B Testing, Sponsorship Marketplace.
    - **Content Loop Engine**: Manages content generation and scheduling.
    - **Autopilot Engine**: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    - **Human Behavior & AI Humanizer Engines**: Simulate realistic posting.
    - **Autonomy Controller**: Orchestrates all AI engines.
    - **AI Team Engine**: Autonomous AI agents collaborate via a shared task queue. The 15th agent, Jamie Cruz (Catalog Content Director), mines the full YouTube catalog every 4 hours to identify repurposing opportunities (viral clips, compilations, throwbacks, trend-jacked re-frames) and queues them to autopilot.
    - **Catalog Content Engine** (`server/services/catalog-content-engine.ts`): Scans ALL catalog videos (no age limit), uses GPT-4o-mini with Jamie Cruz's world-class editing prompt to identify up to 8 repurposing opportunities per cycle, and queues them as `catalog-clip`, `catalog-compilation`, `catalog-reactivation`, or `catalog-reaction` types.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling.
    - **Content Automation System**: Includes YouTube Upload Watcher, Historical Content Sweep, and Content Consistency Agent.
    - **Auto Agent Orchestrator**: Manages background agent sessions for all paid users, including Stream Agent and Copyright Guardian.
    - **Team Ops God Mode**: Orchestrates a 41-agent company via a dedicated orchestration service.
    - **God-Level Business AI Exec Team**: 9 autonomous AI executives for business functions.
    - **Legal & Tax AI Agent Command Center**: 18 autonomous AI agents for legal and tax auditing.
    - **Autonomous Social Media Company**: Comprehensive suite for live stream detection, lifecycle management, creator DNA analysis, stream operations (chat response, moderation, highlights), shorts factory, VOD SEO optimization, multi-platform distribution, revenue intelligence, and community management.
- **System Hardening**: Centralized OpenAI client with telemetry, retry logic, caching, structured logging, Zod validation, DB-backed cron locks, external service health checks, and a world-class self-healing core comprising 8 components for high availability and scalability (Health Brain, Memory Guardian, Adaptive Throttle, Intelligent Job Queue, Self-Healing Agent, Anomaly Responder, Continuous Audit, and Admin Endpoints).
- **Platform Policy Tracker**: Monitors 7 platforms for policy changes and enforces compliance.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based).
- **OAuth**: Universal OAuth for 23 platforms with auto token refresh.
- **Subscription & Access**: Multi-tier subscription model with role-based access.

### Notification & Feedback Systems
- **Notification Engine**: Exception-only model, alerting only on critical issues.
- **AI Feedback Processor**: Analyzes user feedback.

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
- **tweetnacl**: Cryptographic library for security (e.g., Discord Ed25519 verification).