# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed for creators. It supports 25 major platforms, offering AI-powered insights, compliance checks, growth strategies, and content optimization. The platform integrates 832 AI-powered features and 6 autonomous automation systems to provide near-100% automated end-to-end business management. CreatorOS aims to be a "YouTube Team In A Box," empowering creators with advanced tools for content creation, distribution, and business growth across all major digital platforms.

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
- **Database**: PostgreSQL, specifically Neon-backed via Replit.
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all 832 AI-powered features.
- **Authentication**: Replit Auth (OIDC-based).
- **Design System**: Dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Internationalization (i18n)**: react-i18next with 12 languages (English, Spanish, French, Portuguese, German, Japanese, Korean, Chinese, Arabic, Hindi, Russian, Italian). RTL support for Arabic/Hebrew. Browser language auto-detection with localStorage persistence. Language selector in Settings.
- **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) using node-cron for background processing.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs.
- **PWA Support**: Full Progressive Web App capabilities for installability and offline access.
- **UI/UX**: Consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, and floating AI chat.
- **State Management**: ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.
- **Key Features**:
    - **Home**: Dashboard with Activity Feed, Business Health, Daily Briefing, AI Action Center, AI News Feed, AI Milestones, AI Cross-Platform Analytics, AI Comment Manager, AI Growth Intelligence (Collab Matchmaker, Viral Predictor, Optimal Schedule, Subscriber Magnet, Audience Persona Builder, Engagement Booster), AI Community & Fans (Fan Loyalty Tracker, Comment Strategy, Community Poll Generator, Fan Milestone Celebrator), AI Analytics & Predictions (Revenue Forecaster, Subscriber Milestone Predictor, Algorithm Decoder, Growth Trajectory Modeler, Daily Action Plan), plus 67 additional AI features.
    - **Content**: Library, Channels, Calendar, **Localization** tabs. Library includes AI Content Quality & Cross-Platform Suite (Script Coach, Thumbnail CTR Predictor, Platform Repurposer, Content Decay Detector, Title A/B Tester, Description Optimizer, Content Roadmap, Evergreen Content Identifier). Localization tab includes 17 AI-powered video localization features, plus 172 additional AI features.
    - **Go Live**: Stream Center with AI Stream Advisor, AI Chat Bot Builder, AI Stream Checklist, AI Raid Strategy, AI Post-Stream Report, AI Live Streaming Advanced Suite (Stream Overlay Designer, Raid Target Optimizer, Stream Highlight Clipper, Donation Goal Strategist, Multi-Stream Chat Unifier), plus 57 additional AI features.
    - **Money**: Revenue with AI Financial Insights, AI P&L Report, AI Revenue Intelligence (Deal Negotiation Coach, Merch Demand Predictor, Revenue Stream Optimizer, Membership Tier Designer, Affiliate Link Manager, Sponsorship Rate Calculator), AI Brand & Growth (Brand Auditor, Brand Voice Analyzer, Brand Partnership Scorer, Media Kit Auto-Updater, Course/Product Planner), plus 57 additional AI features.
    - **Settings**: General (includes Language Selector), Brand, Collabs, Competitors (AI Competitor Intelligence: Tracker, Gap Analysis, Alerts, Content Scorer, Niche Domination Map, Audience Overlap), Legal (AI Legal Protection: Copyright Shield, Contract Analyzer, Fair Use Analyzer, DMCA Defense, Content Insurance), Wellness (AI Wellness & Productivity: Burnout Prevention, Content Batching, Creative Block Solver, Work-Life Balance, Motivation Engine), Learning tabs plus **Automation Hub** tab with Cron Scheduler, AI Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, plus 332 additional AI features.

## Automation Engine (100% Automation - Zero Gaps)
- **Cron Job Scheduler**: node-cron based system running AI features on configurable intervals (15min/hourly/6h/12h/daily/weekly/monthly). Persists results to PostgreSQL.
- **AI Chain Orchestrator**: Connects AI agents into pipelines (e.g., Trend Scanner → Script Writer → SEO Optimizer → Thumbnail → Calendar). 5 pre-built templates: Content Pipeline, Revenue Optimizer, Growth Engine, Stream Autopilot, Brand Guardian.
- **Auto-Action Rules Engine**: User-configurable threshold rules that AI executes automatically (metric thresholds, scheduled actions, platform events, revenue changes).
- **Webhook Event Listeners**: Real-time event endpoints for YouTube, Stripe, Twitch, TikTok, Instagram, and system events. Events trigger AI chains and rules automatically.
- **Notification Pipeline**: Exception-only alerts from background jobs, webhooks, and AI chains. Feeds into existing NotificationBell component.
- **AI Results Store**: Database-backed persistence for all AI outputs with timestamps, replacing sessionStorage caching for historical intelligence.
- **AI Auto-Onboarding**: Automatically configures new accounts, connects platforms, sets optimal defaults with zero manual setup.
- **AI Sponsorship Auto-Approve**: Evaluates and auto-approves/rejects brand deals every 30 minutes based on creator criteria (brand fit, min CPM, audience match).
- **AI Creative Autonomy**: Makes all creative decisions autonomously - thumbnails, titles, scripts, scheduling - learning and matching each creator's unique style.
- **AI Auto-Payment Manager**: Handles invoicing, expense categorization, tax prep, and payment optimization every 6 hours.
- **Traffic-Driven Localization Intelligence**: AI Audience Language Analyzer runs first in the localization cron cycle, determines priority languages from viewer traffic data, stores recommendations in `localization_recommendations` table, then feeds those languages into all 16 other localization AI features (Video Translator, Subtitle Generator, etc.). Settings Language Selector shows traffic-based UI language suggestions. Content Localization tab displays priority languages, viewer distribution, and untapped markets.

## OAuth Platform Integration
- **Universal OAuth Framework**: `server/oauth-config.ts` contains OAuth2 configs for 23 platforms (Twitch, Discord, Twitter/X, Facebook, Instagram, TikTok, LinkedIn, Reddit, Pinterest, Snapchat, Spotify, Patreon, Kick, Rumble, Threads, Bluesky, Mastodon, Ko-fi, Substack, Apple Podcasts, DLive, Trovo, WhatsApp)
- **OAuth Routes**: Generic `/api/oauth/:platform/auth` (initiate) and `/api/oauth/:platform/callback` (token exchange + channel creation) routes handle all platforms
- **OAuth Status API**: `/api/oauth/status` returns which platforms have OAuth configured (Client ID + Secret env vars present)
- **Credential Env Vars**: Each platform uses `{PLATFORM}_CLIENT_ID` and `{PLATFORM}_CLIENT_SECRET` env vars (e.g., `TWITCH_CLIENT_ID`, `DISCORD_CLIENT_SECRET`)
- **UI Integration**: Platform dialogs show "Login with [Platform]" OAuth buttons when configured, with manual credential fallback always available
- **YouTube**: Uses dedicated `/api/youtube/auth` flow via Google OAuth (already configured with GOOGLE_CLIENT_ID/SECRET)

## Key Files
- `server/oauth-config.ts` - OAuth2 configuration for all 23 non-YouTube platforms (auth URLs, token URLs, scopes, user info endpoints)
- `server/routes.ts` - All API routes including 832 AI endpoints, 17 localization endpoints, automation routes, Stripe payment endpoints, and generic OAuth routes
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/ai-engine.ts` - 832 AI feature functions organized in 22+ batches + 17 localization AI functions + 110 new upgrade features
- `server/automation-engine.ts` - Cron scheduler, chain orchestrator, rules engine, webhook processor, notification pipeline, localization auto-processor (every 12h), 10 AI feature categories
- `shared/schema.ts` - Database schema with 30+ tables including ai_results, cron_jobs, ai_chains, webhook_events
- `client/src/i18n/index.ts` - i18n initialization with react-i18next, browser detection, 12 languages
- `client/src/i18n/locales/*.ts` - Translation files for all 12 supported languages
- `client/src/pages/Dashboard.tsx` - Home dashboard with ~90 AI features (Growth Intelligence, Community & Fans, Analytics & Predictions)
- `client/src/pages/Content.tsx` - Content management with ~188 AI features + Content Quality Suite + Localization tab (17 AI features)
- `client/src/pages/StreamCenter.tsx` - Live streaming with ~70 AI features + Live Streaming Advanced Suite
- `client/src/pages/Money.tsx` - Monetization with ~76 AI features + Revenue Intelligence + Brand & Growth
- `client/src/pages/Settings.tsx` - Settings with ~358 AI features + Competitor Intelligence + Legal Protection + Wellness & Productivity + Automation Hub + Language Selector

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **react-i18next / i18next**: Internationalization framework for 12-language UI support with RTL and browser auto-detection.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.
- **Stripe**: Payment processing via Replit connector, with automatic webhook management. 4 subscription tiers (YouTube $9.99, Starter $29.99, Pro $79.99, Ultimate $149.99/mo). Stripe products auto-seeded on first boot.
- **node-cron**: Background task scheduling for autonomous AI operations.

## Subscription & Access System
- **Tiers**: free (0 platforms), youtube (1), starter (3), pro (10), ultimate (25 platforms)
- **Admin**: Thedude180@gmail.com auto-promoted to admin with ultimate tier on login
- **Access Codes**: Admin generates codes that grant free premium access (any tier, configurable max uses, optional expiry)
- **Stripe Checkout**: Per-tier subscription checkout via Stripe, customer portal for billing management
- **Role-based Access**: `useUserProfile` hook provides tier/role info, `TIER_PLATFORM_LIMITS` constant maps tiers to platform counts
- **Key Files**: `server/stripe-seed.ts` (auto-creates Stripe products), `client/src/pages/Pricing.tsx` (pricing page), `client/src/hooks/use-user-profile.ts` (tier hook), Settings has Subscription/Admin Codes/Admin Users tabs
