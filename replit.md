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
- **UI/UX Decisions**: Dark theme, 5 core pages (Team, Content, Live, Revenue, Settings) with persistent sidebar and mobile navigation. Features include a notification bell, floating AI chat, command palette, keyboard shortcuts, and PWA support.

### Backend
- **Technology**: Express.js with Drizzle ORM and PostgreSQL.
- **Architecture**: Domain-based route modularization.
- **Security**: Robust security measures including Helmet, rate limiting, CSRF protection, API key authentication, subscription tier enforcement, and an AI Security Sentinel for prompt injection and replay attack prevention.
- **AI Integration**: Leverages OpenAI (gpt-5-mini) and Anthropic (Claude Opus/Sonnet/Haiku), with intelligent routing based on task requirements.
- **Core AI Engines & Features**:
    - **AI Team Engine**: Orchestrates 20 specialized AI agents for tasks like scriptwriting, SEO, community management, and revenue tracking.
    - **Growth Journey System**: AI-generated daily actions and personalized roadmaps.
    - **Competitive Edge Suite**: VOD optimizer, Autopilot (7-phase pipeline), Creator DNA & Brand Voice, Cross-Platform Analytics, A/B Testing, Sponsorship Marketplace.
    - **Content Loop Engine**: Manages content generation and scheduling, including auto-clip, smart scheduling, AI comment responder, and content recycling.
    - **Smart Edit Engine**: Autonomous highlight reel generation using audio energy analysis, scene change detection, FFmpeg for editing, and AI-optimized metadata for YouTube upload.
    - **Performance Feedback Engine**: Analyzes video performance using YouTube Analytics API for continuous learning.
    - **Livestream Growth Agent**: Automates SEO-optimized title updates and social media pushes for live viewers.
    - **Conversational AI Co-Pilot**: Context-aware AI assistant with tool-calling capabilities.
    - **Content Automation System**: Includes YouTube Upload Watcher, Historical Content Sweep, and Content Consistency Agent.
- **Secure Kernel**: Implements CQRS command routing with an approval matrix, idempotency, HMAC-signed receipts, DLQ routing, feature flag gating, and webhook verification. Includes inter-agent communication, agent performance evaluation, audience trust management, and runtime platform integration verification.
- **Advanced Governance & Resilience**:
    - **Platform Policy Tracker**: Monitors and enforces compliance across 7 platforms.
    - **Policy Intelligence & Compliance Hardening**: Service modules for policy change detection, AI disclosure intelligence, creator credibility scoring, and unified pre-flight checks.
    - **Revenue Reconciliation & Attribution**: Manages revenue reconciliation lifecycle (verified, estimated, disputed, etc.) and content-to-revenue attribution.
    - **Exception Desk & Anomaly Hardening**: Unified exception aggregation, anomaly detection, system health integration, and prompt toxicity monitoring.
    - **Trust & Governance Hardening**: Comprehensive trust budget management, approval matrix, tenant isolation, channel immune system (dislike bomb, spam detection), and community trust loop.
    - **Resilience & Observability Hardening**: Safe mode controls, rollback capabilities, blast radius limiting, self-healing validation, correlation ID middleware, performance metrics, dependency health tracking, and feature sunset system.
    - **Operational Hardening & Audit Intelligence**: Financial audit trail, internal rate limiter, adaptive resource governor, granular circuit breaker, and ops health API.
    - **Automated Recovery & Background Task Resilience**: Cron heartbeat monitor, automated playbook execution, concurrency-aware job retries, persistent metric rollups, and webhook provider circuit breakers.
    - **Learning Governance & Signal Intelligence**: Signal decay engine, learning maturity score, learning governance enforcement, narrative promise tracker, override learning integration, and contradiction detection.
- **Advanced Learning / Full Intelligence**: Event-sourced Creator Intelligence Graph, Experiment Engine, Learning Maturity System, Research Swarm, Skill Promotions, Agent Evaluations, Predictive Content Promotion, Audience Soul Model, Temporal Graph Queries, Adaptive Operating Layer, and a robust Recovery Mode.
- **Native Multistream Fabric**: First-party multistream broadcasting subsystem for source detection, broadcast orchestration, relay/re-encode, reliability guarding, and platform-specific packaging.
- **Unified Live Command Center**: Operator-grade live control surface for monitoring broadcast state, metadata, AI actions, community intelligence, commerce, trust/risk, recovery, and decision traceability.
- **Live Production Crew**: A governed team of coordinated live agents handling roles such as Live Director, Community Host, Moderation Captain, Live SEO Producer, Thumbnail Producer, Moment Producer, Commerce & CTA Producer, Platform Packaging Producer, and Clip & Replay Handoff Producer, including a Creator Interrupt Router.
- **Pre-Channel Launch Mode**: Guided launch experience for new users, offering a 7-state lifecycle and a 10-step mission system for channel identity, content planning, brand setup, and monetization readiness.

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