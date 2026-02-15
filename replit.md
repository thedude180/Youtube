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
-   **Security**: Helmet security headers, response compression, request body size limits, request IDs, structured logging, request timeouts, rate limiting, subscription tier enforcement, async error handling, global 401 handler, smart query caching, Hack-Proof Security System with adaptive defense rules and AI learning.
-   **AI Integration**: OpenAI (gpt-5-mini) via Replit AI Integrations. AI rate limiting based on subscription tier.
-   **Core Engines**:
    -   **Dual Pipeline System**: Live Stream Pipeline (65 steps) and VOD Pipeline (56 steps) across 9 phases (INTAKE, INTELLIGENCE, CONTENT OPS, SEO & GROWTH, DISTRIBUTION, AUDIENCE, COMMUNITY, PRODUCTION, SECURITY). Includes live discovery steps and retention steps. VOD pipelines auto-spawn after live content publication with human-realistic delays.
    -   **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) for background processing.
    -   **Autopilot Engine**: 5 hands-off automation systems: Auto-Clip & Post, Smart Schedule, AI Comment Responder, Discord Announcements, Content Recycler.
    -   **Human Behavior Engine**: Simulates realistic posting patterns with per-platform peak hours, gaussian timing, waking-hours-only scheduling, weekend multipliers, daily post budgets, and micro-delays.
    -   **Content Variation Engine**: Generates unique content per platform using 15 content angles, platform-specific voice profiles, banned AI-phrase filtering, and uniqueness scoring.
    -   **Creator Intelligence System**: Style Scanner, Creator Memory, Humanization Layer, and Learning Engine for personalized AI outputs.
    -   **Ultimate Engine**: A suite of 17 advanced AI-powered features including Self-Healing Pipelines, Dynamic Routing, A/B Testing Engine, Predictive Analytics, Creator DNA, Audience Mind Mapping, Stream Copilot, Audience Migration, Collaboration Network, Revenue Maximizer, Content Compounding, Smart Merch, Algorithm Decoder, Shadow Ban Detection, Multi-Language Empire, Tax Intelligence, and Team Scaling Advisor.
    -   **Idea-to-Empire Builder**: AI-driven tool for new creators to build a complete content strategy from a single idea.
    -   **Auto Revenue Sync Engine**: Pulls revenue data from connected platforms every 6 hours.
    -   **Platform Sync Engine**: Real-time push of updated video metadata to platforms like YouTube.
    -   **Customer Database Engine**: Tracks detailed user profiles including engagement scores, churn risk, and lifetime revenue.

### Authentication & Authorization
-   **Authentication**: Replit Auth (OIDC-based).
-   **OAuth**: Universal OAuth framework for 23 platforms with generic routes and automatic token refresh.
-   **Login Groups**: Platforms sharing login providers are grouped for simplified onboarding.
-   **Subscription & Access System**: Multi-tier subscription model with role-based access and admin capabilities.

## External Dependencies
-   **Replit Auth**: User authentication.
-   **OpenAI API**: All AI-driven functionalities.
-   **react-i18next / i18next**: Internationalization.
-   **PostgreSQL (Neon-backed)**: Primary database.
-   **YouTube Data API v3**: YouTube integration and OAuth2.
-   **Stripe**: Payment processing and subscription management.
-   **node-cron**: Background task scheduling.