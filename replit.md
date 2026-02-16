# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a multi-platform content management and live streaming platform designed to empower creators with AI-powered insights, compliance checks, growth strategies, and content optimization across YouTube, Twitch, Kick, TikTok, X, and Discord. It provides near-100% automated end-to-end business management, aiming to be a "YouTube Team In A Box." The project's vision is to autonomously manage all aspects of a creator's online presence, fostering growth and maximizing revenue.

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
CreatorOS is a full-stack application built with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database. It employs a multi-tenant architecture with user ID scoping on all data.

### Frontend
-   **Technology**: React + Vite with Tailwind CSS, shadcn/ui, and lucide-react.
-   **UI/UX**: Dark theme with purple accent, consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat, command palette (Ctrl+K), keyboard shortcuts, rich empty states with contextual tips.
-   **State Management**: TanStack Query, ThemeProvider, AdvancedModeProvider with localStorage persistence.
-   **Performance**: PWA support with offline capabilities, lazy-loading, code splitting, session expiry detection.
-   **Internationalization**: `react-i18next` with 12 languages and RTL support.

### Backend
-   **Technology**: Express.js with Drizzle ORM and PostgreSQL.
-   **Architecture**: Domain-based route modularization.
-   **Security**: Comprehensive security features including Helmet, response compression, rate limiting (global and AI-specific), CSRF protection, API key authentication, parameter pollution protection, User-Agent validation, subscription tier enforcement, circuit breaker pattern for external APIs, and an AI Security Sentinel for continuous threat monitoring. A Security Dashboard provides real-time monitoring and management.
-   **AI Integration**: OpenAI (gpt-5-mini) via Replit AI Integrations, with tier-based rate limiting.
-   **Core Engines**:
    -   **Dual Pipeline System**: Live Stream (65 steps) and VOD (56 steps) pipelines across 9 phases, including live discovery and retention. VOD pipelines auto-spawn after live content publication. Pipeline completion triggers autopilot distribution and user notifications. Pipeline errors also generate notifications and self-healing attempts.
    -   **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) for background processing. 60-second interval auto-starts queued pipelines.
    -   **Autopilot Engine**: 5 hands-off automation systems (Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler). Automatically triggered by pipeline completion and empire video creation. Content generation is enriched with keyword learning context and active traffic growth strategies.
    -   **Human Behavior Engine**: Simulates realistic posting patterns with platform-specific peak hours, gaussian timing, waking-hours-only scheduling, weekend multipliers, and daily post budgets.
    -   **Content Variation Engine**: Generates unique content per platform using 15 content angles, platform-specific voice profiles, banned AI-phrase filtering, keyword learning integration, and traffic strategy alignment.
    -   **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, and Learning Engine for personalized AI outputs.
    -   **Ultimate Engine**: 17 advanced AI-powered features including Self-Healing Pipelines, Dynamic Routing, Predictive Analytics, Creator DNA, Audience Mind Mapping, and Shadow Ban Detection.
    -   **Idea-to-Empire Builder**: AI-driven tool for new creators, automating content strategy creation, video generation, and activating full autopilot upon niche selection. Includes the "Empire Launcher" for public access.
    -   **Multi-Platform Live Detection**: Polls connected platforms every 2 minutes for active broadcasts, triggering live pipelines, announcements, and content backlog management.
    -   **YouTube Learning Source Engine**: Uses YouTube as a primary source for niche trends, successful creator patterns, and algorithm insights, refreshing research based on video performance.
    -   **Creator Skill Progression System**: Tracks creator maturity (1-100) and adapts AI-generated content quality to match the creator's skill level.
    -   **Platform Sync Engines**: Auto Revenue Sync (every 6 hours) and Platform Sync (real-time metadata push).
    -   **YouTube Quota Manager & Push Backlog**: Tracks daily YouTube API quota usage, prioritizing direct pushes when available and queuing optimizations when quota is low.
    -   **Content Performance Predictor**: AI-powered prediction of video performance with actionable suggestions.
    -   **Cross-Platform Analytics**: Unified dashboard for aggregated video, stream, views, and revenue data.
    -   **Keyword Learning Engine**: Analyzes video performance to identify, score, and track winning keywords, injecting them into new content creation prompts.
    -   **Traffic Growth Engine**: Generates 100% legitimate, ToS-compliant traffic strategies covering SEO, community engagement, cross-platform distribution, and more, explicitly blocking banned tactics.

### Authentication & Authorization
-   **Authentication**: Replit Auth (OIDC-based).
-   **OAuth**: Universal OAuth framework for 23 platforms with automatic token refresh.
-   **Subscription & Access**: Multi-tier subscription model with role-based access control.

### Notification & Feedback Systems
-   **Notification Engine**: Sends email (Gmail) and optional SMS alerts for warnings/critical issues.
-   **AI Feedback Processor**: Analyzes user feedback, auto-categorizes, and resolves config-type issues.

## External Dependencies
-   **Replit Auth**: User authentication.
-   **OpenAI API**: AI-driven functionalities.
-   **Gmail API**: Email notifications via Replit Connectors.
-   **react-i18next / i18next**: Internationalization.
-   **PostgreSQL (Neon-backed)**: Primary database.
-   **YouTube Data API v3**: YouTube integration and OAuth2.
-   **Stripe**: Payment processing and subscription management.
-   **node-cron**: Background task scheduling.
-   **googleapis**: Gmail API client.