# CreatorOS - YouTube Team In A Box

## Overview
A comprehensive multi-platform content management and live streaming platform for creators. Supports 25 platforms (YouTube, Twitch, Kick, Facebook Gaming, TikTok, X/Twitter, Rumble, LinkedIn Live, Instagram, Discord, Snapchat, Pinterest, Reddit, Threads, Bluesky, Mastodon, Patreon, Ko-fi, Substack, Spotify, Apple Podcasts, DLive, Trovo, YouTube Shorts, WhatsApp). Provides AI-powered insights, compliance checking, growth strategies, content optimization, stream SEO, thumbnail generation, backlog processing, 10 autonomous AI agents, content scheduling, revenue tracking, creator intelligence (style matching, learning engine, humanized output), notification system, and PWA support - all in one dashboard.

## Current State
- Full-stack app with Express backend + React/Vite frontend
- PostgreSQL database with seeded demo data
- Replit Auth for user authentication (supports Google login)
- OpenAI integration for real AI-powered features
- Dark theme with purple accent design system
- Multi-platform support (25 platforms with icons, setup guides, compliance rules)
- 10 autonomous AI agents working 24/7
- Multi-tenant architecture with userId scoping on all tables
- Content calendar with automated scheduling
- Revenue tracking with platform/source breakdowns
- Auto-backlog processing engine with priority queue, 6-agent collaboration chains
- Stream-aware agent pivot (auto-pause backlog -> live support -> post-stream VOD -> resume backlog)
- Notification bell with unread count badge and popover panel
- Human Review Mode toggle (localStorage-based) on Dashboard and Settings
- YouTube Data API v3 integration: OAuth2 connect, video sync, push optimized metadata
- Creator Intelligence system: Style Scanner, Creator Memory, Humanization Layer, Learning Engine
- PWA support with manifest, service worker, and installable app capability
- Idea-to-Video feature in Advisor (AI generates full production plans from raw ideas)
- A/B testing UI, feedback system, version history on Video Detail page

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter routing + Tailwind CSS + shadcn/ui + react-icons
- **Backend**: Express.js with Drizzle ORM
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini model)
- **Auth**: Replit Auth (OIDC-based)
- **PWA**: Web app manifest + service worker for installability

## Supported Platforms (25)
YouTube, Twitch, Kick, Facebook Gaming, TikTok, X/Twitter, Rumble, LinkedIn Live, Instagram, Discord, Snapchat, Pinterest, Reddit, Threads, Bluesky, Mastodon, Patreon, Ko-fi, Substack, Spotify, Apple Podcasts, DLive, Trovo, YouTube Shorts, WhatsApp

## Database Schema
- `users` / `sessions` - Auth tables (managed by Replit Auth)
- `channels` - Connected social platform accounts (25 platforms)
- `videos` - Content library (VODs, Shorts, live replays)
- `jobs` - Background processing tasks
- `audit_logs` - Activity tracking for all user actions
- `content_insights` - AI-generated content pattern analysis
- `compliance_records` - Platform rule compliance checks
- `growth_strategies` - AI-generated growth plans
- `conversations` / `messages` - Chat/AI conversation history
- `stream_destinations` - RTMP streaming destinations per platform
- `streams` - Stream sessions with platform-specific SEO data
- `thumbnails` - AI-generated thumbnail prompts and metadata
- `ai_agent_activities` - Autonomous AI agent task logs (userId-scoped)
- `automation_rules` - User-defined automation triggers (userId-scoped)
- `schedule_items` - Content calendar entries (userId-scoped)
- `revenue_records` - Revenue tracking per platform/source (userId-scoped)
- `community_posts` - AI-generated community posts (userId-scoped)
- `notifications` - Exception-only notification system (userId-scoped)
- `ab_tests` - A/B test configurations for titles/thumbnails
- `analytics_snapshots` - Periodic analytics snapshots
- `learning_insights` - AI learning patterns from feedback
- `content_ideas` - Content idea bank (from Advisor Idea-to-Video)
- `creator_memory` - Creator style profiles and preferences
- `content_clips` - Short-form clips extracted from VODs
- `video_versions` - Version history for video metadata changes
- `stream_chat_messages` / `chat_topics` - Stream chat analysis
- `sponsorship_deals` - Sponsorship deal tracking
- `platform_health` - Platform connection health monitoring
- `collaboration_leads` - Creator collaboration opportunities
- `audience_segments` - Audience segmentation data
- `compliance_rules` - Platform-specific compliance rules
- `user_feedback` - User feedback on AI outputs
- `subscriptions` - Subscription tier management

## Pages (Sidebar Navigation)
1. **Dashboard** (`/`) - Autonomy status banner, 6 metric cards, notification feed, quick action links, Human Review toggle
2. **Library** (`/videos`) - Video management with VOD/Shorts/Live tabs, search, responsive grid, stats row
3. **Video Detail** (`/videos/:id`) - Video editing, AI metadata, feedback buttons, A/B testing, SEO score, version history
4. **Channels** (`/channels`) - 25 platform cards with category filters, setup guide dialogs, connection status, YouTube OAuth
5. **Stream Center** (`/stream`) - RTMP destinations, stream planning, live SEO, multi-platform status panel
6. **Calendar** (`/schedule`) - Weekly calendar view, content ideas section, schedule item management
7. **AI Team** (`/team`) - 10 agent cards in grid, run tasks, recent activity feed, agent status
8. **Advisor** (`/advisor`) - AI chat + Idea-to-Video tab (AI generates full production plans from ideas)
9. **Revenue** (`/monetization`) - Revenue summary cards, record tracking, platform breakdowns
10. **Settings** (`/settings`) - AI autonomy toggle, notification preferences, risk profiles, account info

## API Routes
- `/api/channels` - CRUD for channels
- `/api/videos` - CRUD for videos + AI metadata generation
- `/api/jobs` - Job creation and listing
- `/api/dashboard/stats` - Dashboard statistics
- `/api/audit-logs` - Audit log listing
- `/api/insights` - Content insights CRUD + AI generation
- `/api/compliance` - Compliance records + AI checks
- `/api/strategies` - Growth strategies + AI generation
- `/api/advisor/ask` - AI strategy advisor chat
- `/api/stream-destinations` - CRUD for RTMP streaming destinations
- `/api/streams` - Stream session management + AI SEO generation
- `/api/streams/:id/go-live` - Go Live trigger
- `/api/streams/:id/end` - End stream with post-stream processing
- `/api/streams/:id/automation` - Real-time automation task status
- `/api/backlog` - Backlog video optimization
- `/api/thumbnails` - AI thumbnail generation
- `/api/agents/status` - AI agent status (10 agents)
- `/api/agents/activities` - Agent activity log
- `/api/agents/:agentId/trigger` - Trigger AI agent task
- `/api/automation` - Automation rules CRUD
- `/api/schedule` - Content calendar CRUD
- `/api/revenue` - Revenue records CRUD + summary
- `/api/community` - Community posts CRUD + AI generation
- `/api/youtube/auth` - Start YouTube OAuth2 flow
- `/api/youtube/callback` - YouTube OAuth2 callback
- `/api/youtube/channel/:channelId` - Fetch YouTube channel info
- `/api/youtube/videos/:channelId` - Fetch YouTube video library
- `/api/youtube/sync/:channelId` - Sync YouTube videos
- `/api/youtube/video/:channelId/:videoId` - Update video metadata on YouTube
- `/api/youtube/push-optimization/:videoId` - Push AI-optimized metadata to YouTube
- `/api/notifications` - Notification listing
- `/api/notifications/unread-count` - Unread notification count
- `/api/notifications/:id/read` - Mark notification read
- `/api/notifications/read-all` - Mark all notifications read
- `/api/style-scan/:channelId` - Run creator style scan
- `/api/feedback` - Record user feedback on AI output
- `/api/creator-memory` - Creator memory/preferences
- `/api/learning-insights` - AI learning insights
- `/api/content-ideas` - Content idea bank CRUD
- `/api/subscription` - Subscription tier info
- `/api/ab-tests` - A/B test management
- `/api/sponsorship-deals` - Sponsorship deal tracking
- `/api/analytics` - Analytics snapshots
- `/api/platform-health` - Platform connection health
- `/api/video-versions/:videoId` - Video version history
- `/api/content-clips` - Content clip management
- `/api/collaboration-leads` - Collaboration opportunity tracking
- `/api/compliance-rules` - Platform compliance rules

## Key Files
- `shared/schema.ts` - Database schema, types, PLATFORMS (25), PLATFORM_INFO, AI_AGENTS
- `shared/routes.ts` - API route definitions with validation
- `server/routes.ts` - Express route handlers (uses `requireAuth` helper)
- `server/storage.ts` - Database access layer (52+ methods)
- `server/ai-engine.ts` - OpenAI-powered AI functions (all accept userId for personalization)
- `server/creator-intelligence.ts` - Creator intelligence system (style scan, feedback, learning, humanization)
- `server/youtube.ts` - YouTube Data API v3 integration
- `client/src/App.tsx` - Main app with routing, PWA registration, persistent header
- `client/src/components/Sidebar.tsx` - Navigation sidebar
- `client/src/components/PlatformIcon.tsx` - Platform icon component (25 platforms)
- `client/src/components/NotificationBell.tsx` - Notification bell with popover panel
- `client/src/pages/Dashboard.tsx` - Dashboard with autonomy banner
- `client/src/pages/Landing.tsx` - Landing page with feature highlights
- `client/public/manifest.json` - PWA manifest
- `client/public/sw.js` - Service worker

## Data Fetching Patterns
- **Queries**: Use default `queryFn` via `queryKey` (e.g., `queryKey: ['/api/channels']`)
- **Mutations**: Use `apiRequest` from `@/lib/queryClient` for POST/PUT/DELETE
- **Cache invalidation**: Always invalidate by queryKey after mutations
- Hooks are in `client/src/hooks/`

## Creator Intelligence System
- **Style Scanner**: Analyzes last 50 titles/descriptions to build creator style profile
- **Creator Memory**: Stores style profile, preferences, and patterns in `creator_memory` table
- **Humanization Layer**: Varies sentence structure, avoids AI-detectable patterns
- **Learning Engine**: Records feedback signals and adjusts future AI output
- All AI functions receive userId to fetch and apply creator-specific context

## AI Engine Functions
- `generateVideoMetadata` - Title, description, tags (gaming-aware, personalized)
- `generateStreamSeo` - Live stream SEO optimization per platform
- `postStreamOptimize` - Post-stream VOD conversion optimization
- `generateThumbnailPrompt` - AI thumbnail concept generation
- `generateContentInsights` - Content pattern analysis
- `checkCompliance` - Platform rule compliance checking
- `generateGrowthStrategy` - Growth plan generation
- `getContentStrategyAdvice` - Strategy advisor chat (personalized)
- `runAgentTask` - Autonomous AI agent task execution (personalized)
- `generateCommunityPost` - AI community post generation
- `detectGamingContext` - Gaming content detection (30+ games)

## AI Team Agents
10 autonomous AI agents: Editor, Social Manager, SEO Director, Analytics Director, Brand Strategist, Ad Buyer, Legal Advisor, Community Manager, Business Manager, Growth Strategist

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 25 platforms)
- "5-year-old simple" UI with big buttons and color-coded status
- Exception-only notifications (AI handles everything silently unless issue arises)
- Human Review Mode available but off by default (full autonomy)
