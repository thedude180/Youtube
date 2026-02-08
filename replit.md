# CreatorOS - YouTube Team In A Box

## Overview
A comprehensive multi-platform content management and live streaming platform for creators. Supports 9 streaming platforms (YouTube, Twitch, Kick, Facebook Gaming, TikTok, X/Twitter, Rumble, LinkedIn Live, Instagram). Provides AI-powered insights, compliance checking, growth strategies, content optimization, stream SEO, thumbnail generation, backlog processing, 10 autonomous AI agents, content scheduling, and revenue tracking - all in one dashboard.

## Current State
- Full-stack app with Express backend + React/Vite frontend
- PostgreSQL database with seeded demo data
- Replit Auth for user authentication (supports Google login)
- OpenAI integration for real AI-powered features
- Dark theme with purple accent design system
- Multi-platform streaming support (9 platforms)
- 10 autonomous AI agents working 24/7
- Multi-tenant architecture with userId scoping on all tables (channels, videos, agents, jobs)
- Content calendar with automated scheduling
- Revenue tracking with platform/source breakdowns
- Auto-backlog processing engine with priority queue, 6-agent collaboration chains, optimization scores (0-100)
- Stream-aware agent pivot (auto-pause backlog → live support → post-stream VOD → resume backlog)
- Real-time toast notifications and 5-second auto-refresh on Dashboard and AI Team pages
- Auto-scheduling of social posts across 4 platforms for fully optimized content
- Stale video detection (30+ days) and bulk re-optimization triggers

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter routing + Tailwind CSS + shadcn/ui + react-icons
- **Backend**: Express.js with Drizzle ORM
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini model)
- **Auth**: Replit Auth (OIDC-based)

## Supported Platforms
YouTube, Twitch, Kick, Facebook Gaming, TikTok, X/Twitter, Rumble, LinkedIn Live, Instagram

## Database Schema
- `users` / `sessions` - Auth tables (managed by Replit Auth)
- `channels` - Connected social platform accounts (9 platforms)
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

## Pages
1. **Dashboard** (`/`) - Overview with metrics, AI team status, revenue, quick links, active jobs, audit log
2. **Library** (`/videos`) - Video content management with search/filter
3. **Video Detail** (`/videos/:id`) - Individual video editing + AI metadata generation
4. **Stream Center** (`/stream`) - RTMP destination management, stream planning, live SEO optimization, platform resolution guide
5. **Calendar** (`/schedule`) - Content scheduling with weekly calendar view, upcoming items, date detail
6. **Operations** (`/jobs`) - Background job monitoring
7. **Channels** (`/channels`) - Connected platform management (9 platforms with icons)
8. **AI Team** (`/team`) - 10 autonomous AI agents dashboard with status, activity log, run tasks
9. **Insights** (`/insights`) - AI content pattern analysis
10. **Strategy** (`/strategy`) - AI growth plan generator
11. **Compliance** (`/compliance`) - Platform rule compliance monitor
12. **Advisor** (`/advisor`) - AI chat for content strategy questions
13. **Backlog Optimizer** (`/backlog`) - Batch AI optimization for existing videos
14. **Monetization** (`/monetization`) - Revenue tracking, platform/source breakdowns, record revenue
15. **Settings** (`/settings`) - Risk profiles and automation config

## API Routes
- `/api/channels` - CRUD for channels
- `/api/videos` - CRUD for videos + AI metadata generation
- `/api/jobs` - Job creation and listing
- `/api/dashboard/stats` - Dashboard statistics (includes revenue, scheduled items, active agents)
- `/api/audit-logs` - Audit log listing
- `/api/insights` - Content insights CRUD + AI generation
- `/api/compliance` - Compliance records + AI checks
- `/api/strategies` - Growth strategies + AI generation
- `/api/advisor/ask` - AI strategy advisor chat
- `/api/stream-destinations` - CRUD for RTMP streaming destinations
- `/api/streams` - Stream session management + AI SEO generation
- `/api/streams/:id/go-live` - Go Live trigger with automatic AI automation
- `/api/streams/:id/end` - End stream with automatic post-stream processing
- `/api/streams/:id/automation` - Real-time automation task status
- `/api/backlog` - Backlog video optimization endpoints
- `/api/thumbnails` - AI thumbnail generation and management
- `/api/agents/status` - AI agent status (10 agents with activity counts)
- `/api/agents/activities` - Agent activity log (userId-scoped)
- `/api/agents/:agentId/trigger` - Trigger AI agent task (runs real AI)
- `/api/automation` - Automation rules CRUD (userId-scoped)
- `/api/schedule` - Content calendar CRUD (userId-scoped)
- `/api/revenue` - Revenue records CRUD + summary (userId-scoped)
- `/api/community` - Community posts CRUD + AI generation (userId-scoped)

## Key Files
- `shared/schema.ts` - Database schema, types, PLATFORMS constant, PLATFORM_INFO, AI_AGENTS
- `shared/routes.ts` - API route definitions with validation
- `server/routes.ts` - Express route handlers
- `server/storage.ts` - Database access layer
- `server/ai-engine.ts` - OpenAI-powered AI functions
- `client/src/App.tsx` - Main app with routing
- `client/src/components/Sidebar.tsx` - Navigation sidebar
- `client/src/pages/AITeam.tsx` - AI Team dashboard
- `client/src/pages/Schedule.tsx` - Content calendar
- `client/src/pages/Monetization.tsx` - Revenue tracking
- `client/src/pages/Dashboard.tsx` - Main dashboard with AI team overview

## AI Engine Functions
- `generateVideoMetadata` - Title, description, tags for videos
- `generateStreamSeo` - Live stream SEO optimization per platform
- `postStreamOptimize` - Post-stream VOD conversion optimization
- `generateThumbnailPrompt` - AI thumbnail concept generation
- `generateContentInsights` - Content pattern analysis
- `checkCompliance` - Platform rule compliance checking
- `generateGrowthStrategy` - Growth plan generation
- `askAdvisor` - Strategy advisor chat
- `runAgentTask` - Autonomous AI agent task execution (10 agent roles)
- `generateCommunityPost` - AI community post generation

## AI Team Agents
10 autonomous AI agents: Editor, Social Manager, SEO Director, Analytics Director, Brand Strategist, Ad Buyer, Legal Advisor, Community Manager, Business Manager, Growth Strategist

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 9 platforms)
- "5-year-old simple" UI with big buttons and color-coded status
