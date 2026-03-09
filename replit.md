# CreatorOS - AI YouTube Business Team

## Overview
CreatorOS is a fully autonomous AI-powered YouTube business. A team of 20 named AI agents (Jordan Blake/CEO, Nia Okafor/Scriptwriter, Jamie Cruz/Catalog Content Director, River Osei/Live Stream Growth Agent, etc.) works autonomously 24/7 to grow a creator's channel — writing scripts, producing thumbnails, optimizing SEO, managing community, tracking revenue, running the live stream pipeline, mining the catalog for new content, and maximizing concurrent viewers on every live stream. The UI is intentionally simple: just the team doing their work.

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
  - `/` — Team: 20 AI agent cards with live status, activity feed, channel stats. Live stream squad: River Osei (Growth), Kai Nakamura (Chat), Mila Reyes (Clips), Devon Hall (Raids), Jade Kim (Revenue)
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
    - **Smart Edit Engine** (`server/smart-edit-engine.ts`): Fully autonomous highlight reel generator for a no-commentary PS5 gaming channel. On startup and for every new video/stream >15 min: downloads the source via OAuth, runs FFprobe audio energy analysis (per-minute RMS levels) + scene change density detection to locate the most intense gaming moments, sends the intensity profile + game name to GPT-4o-mini to pick 5-8 best 60-90s segments, cuts each with FFmpeg (16:9 1920x1080), concatenates with the concat demuxer, adds channel branding overlay, generates AI-optimized metadata using the learning context, uploads the finished reel to YouTube with monetization enabled, and schedules a 24h performance check. The `ai-editor` agent owns each job (visible in Team dashboard). Serial queue processing prevents disk pressure.
    - **Performance Feedback Engine** (`server/performance-feedback-engine.ts`): Closes the learning loop. Every 60 minutes, checks autopilotQueue for `performance-check` items whose scheduledAt has passed, fetches YouTube Analytics API (views, estimatedMinutesWatched, averageViewDuration) for the uploaded video, computes a performance score, and calls `recordLearningEvent()` with the results. The learning engine then factors this into future AI content decisions via `getLearningContext()`. Tracks per-game performance and upload hour effectiveness.
    - **Livestream Growth Agent** (`server/services/livestream-growth-agent.ts`): River Osei activates automatically when a `stream.started` event fires. Every 15 min while live: AI generates a maximally SEO-optimized YouTube title (🔴 LIVE: format), updates the broadcast via YouTube API, and queues social blasts to X, Discord, and TikTok to drive live viewers. Every 20 min: additional social push. Stops automatically on `stream.ended`.
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
- **sharp**: Image processing for JPEG thumbnail conversion before YouTube upload.
- **web-push**: VAPID-based web push notifications for critical alerts.

## Recent Improvements (Latest Session)
- **JPEG thumbnails**: Auto-thumbnail engine now converts generated images from PNG to JPEG (via sharp) before YouTube upload — better compatibility and smaller file size.
- **Kick live detection**: `ps5-live-detector.ts` now checks Kick channels via their public API alongside YouTube and Twitch.
- **Devon raid execution**: When a stream ends, Devon Hall calls the Twitch Helix Raid API to actually execute the top-ranked raid (not just recommend it).
- **Jade → YouTube chat**: Jade Kim's membership prompts are now posted directly to YouTube live chat (not just Discord).
- **Agent task post-processing**: After each AI agent task completes, a `dispatchTaskResult()` handler pushes results into the right place — SEO suggestions → video metadata (+ YouTube push), scripts → video metadata, thumbnail prompts → auto-thumbnail engine, sponsorship opportunities → sponsorship deals table, clip timestamps → content clips table.
- **Revenue/Expense CSV export**: `GET /api/revenue/export.csv` and `GET /api/expenses/export.csv` endpoints with frontend Export CSV buttons.
- **Agent task result detail modal**: Clicking any activity row in the Dashboard opens a modal showing the full AI agent output (JSON or text).
- **Script export**: Copy + Download .txt buttons on scripts in Script Studio.
- **Bulk video SEO**: Multi-select mode on Content page with floating action bar to batch-optimize SEO for multiple videos at once via `POST /api/content/bulk-seo-optimize`.
- **Wellness + Accessibility persistence**: Settings saved via `POST /api/settings/wellness` and `POST /api/settings/accessibility`, stored in `user_preferences` JSONB on users table.
- **Platform setup banners**: Dashboard shows dismissible amber banners when YouTube is not connected or Stripe is unconfigured.
- **Stripe graceful UI**: Money and Pricing pages show a setup card instead of errors when Stripe is not configured.
- **Channel stats refresh**: Refresh button on Dashboard triggers a live sync from YouTube API.
- **Push notifications (VAPID)**: `web-push` VAPID keys configured, subscription endpoint `POST /api/notifications/subscribe`, public key at `GET /api/notifications/vapid-public-key` (public — no auth required), browser prompted for permission on load, critical notifications trigger real web push.
- **YouTube community post character limit**: Fixed — `postMaxLength: 50000` added to YouTube platform spec so autopilot community posts no longer fail the 100-char safety check (which was incorrectly using the video title limit as fallback).
- **Thumbnail quality auto-scaling**: JPEG conversion now starts at quality 82 and loops down to stay under 1.9 MB (YouTube 2 MB limit). Also resizes to 1280×720 before conversion.
- **TikTok live detection**: `detectTikTok()` added to `ps5-live-detector.ts` — checks TikTok user LIVE page for live indicators (`is_live`, `isLive`, `liveRoom`) with 8s timeout.
- **Channel expired token display**: ChannelsTab platform cards now show amber `AlertTriangle "Expired"` badge when `platformData._connectionStatus === "expired"` instead of always showing green "On".
- **Revenue CSV import**: `POST /api/revenue/import-csv` endpoint + Import CSV button on Revenue tab with paste-in dialog (supports date, source, platform, amount, currency columns).
- **Sponsorship outreach draft**: `POST /api/sponsorship-deals/:id/outreach-draft` endpoint generates AI outreach email (subject + body + follow-up tip) using deal info and channel context. "Outreach" button on each deal card opens draft in dialog with Copy button.
- **Learning path personalization**: `aiLearningPathBuilder` now fetches user's channels and recent videos to build personalized recommendations. Response includes `quickWins` (this week actions), `path` (milestones with `why` field), and `schedule`. LearningTab updated to display all fields.