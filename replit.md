# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed for creators. It supports 25 major platforms, offering AI-powered insights, compliance checks, growth strategies, and content optimization. The platform integrates 722 AI-powered features and 6 autonomous automation systems to provide near-100% automated end-to-end business management. CreatorOS aims to be a "YouTube Team In A Box," empowering creators with advanced tools for content creation, distribution, and business growth across all major digital platforms.

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
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all 722 AI-powered features.
- **Authentication**: Replit Auth (OIDC-based).
- **Design System**: Dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Internationalization (i18n)**: react-i18next with 12 languages (English, Spanish, French, Portuguese, German, Japanese, Korean, Chinese, Arabic, Hindi, Russian, Italian). RTL support for Arabic/Hebrew. Browser language auto-detection with localStorage persistence. Language selector in Settings.
- **Automation Engine**: 6 autonomous systems (Cron Scheduler, Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, AI Results Store) using node-cron for background processing.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs.
- **PWA Support**: Full Progressive Web App capabilities for installability and offline access.
- **UI/UX**: Consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, and floating AI chat.
- **State Management**: ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.
- **Key Features**:
    - **Home**: Dashboard with Activity Feed, Business Health, Daily Briefing, AI Action Center, AI News Feed, AI Milestones, AI Cross-Platform Analytics, AI Comment Manager, plus 67 additional AI features.
    - **Content**: Library, Channels, Calendar, **Localization** tabs. Localization tab includes 17 AI-powered video localization features (Video Translator, Subtitle Generator, Localization Advisor, Multi-Language SEO, Dubbing Script, Cultural Adaptation, Thumbnail Localizer, Multi-Language Hashtags, Translation Checker, Audience Language Analyzer, Regional Trends, Cross-Language Comments, Localized Calendar, Multi-Language A/B Testing, Voice-Over Formatter, Regional Compliance, Multi-Language Media Kit), plus 172 additional AI features.
    - **Go Live**: Stream Center with AI Stream Advisor, AI Chat Bot Builder, AI Stream Checklist, AI Raid Strategy, AI Post-Stream Report, plus 57 additional AI features.
    - **Money**: Revenue with AI Financial Insights, AI P&L Report, Expenses, Taxes, Payments, Ventures, Goals, Sponsors with AI Sponsorship Manager, AI Media Kit, plus 57 additional AI features.
    - **Settings**: General (includes Language Selector), Brand, Collabs, Competitors, Legal, Wellness, Learning tabs plus **Automation Hub** tab with Cron Scheduler, AI Chain Orchestrator, Rules Engine, Webhook Listeners, Notification Pipeline, plus 332 additional AI features.

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

## Key Files
- `server/routes.ts` - All API routes including 722 AI endpoints, 17 localization endpoints, automation routes, and Stripe payment endpoints
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/ai-engine.ts` - 722 AI feature functions organized in 22 batches + 17 localization AI functions
- `server/automation-engine.ts` - Cron scheduler, chain orchestrator, rules engine, webhook processor, notification pipeline, localization auto-processor (every 12h)
- `shared/schema.ts` - Database schema with 30+ tables including ai_results, cron_jobs, ai_chains, webhook_events
- `client/src/i18n/index.ts` - i18n initialization with react-i18next, browser detection, 12 languages
- `client/src/i18n/locales/*.ts` - Translation files for all 12 supported languages
- `client/src/pages/Dashboard.tsx` - Home dashboard with ~75 AI features
- `client/src/pages/Content.tsx` - Content management with ~180 AI features + Localization tab (17 AI features)
- `client/src/pages/StreamCenter.tsx` - Live streaming with ~65 AI features
- `client/src/pages/Money.tsx` - Monetization with ~65 AI features
- `client/src/pages/Settings.tsx` - Settings with ~340 AI features + Automation Hub tab + Language Selector

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **react-i18next / i18next**: Internationalization framework for 12-language UI support with RTL and browser auto-detection.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.
- **Stripe**: Payment processing via Replit connector, with automatic webhook management.
- **node-cron**: Background task scheduling for autonomous AI operations.
