# CreatorOS - YouTube Team In A Box

## Overview
A comprehensive multi-platform content management and live streaming platform for creators. Supports 9 streaming platforms (YouTube, Twitch, Kick, Facebook Gaming, TikTok, X/Twitter, Rumble, LinkedIn Live, Instagram). Provides AI-powered insights, compliance checking, growth strategies, content optimization, stream SEO, thumbnail generation, and backlog processing - all in one dashboard.

## Current State
- Full-stack app with Express backend + React/Vite frontend
- PostgreSQL database with seeded demo data
- Replit Auth for user authentication (supports Google login)
- OpenAI integration for real AI-powered features
- Dark theme with purple accent design system
- Multi-platform streaming support (9 platforms)

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

## Pages
1. **Dashboard** (`/`) - Overview with metrics, quick links to AI tools, active jobs, audit log
2. **Library** (`/videos`) - Video content management with search/filter
3. **Video Detail** (`/videos/:id`) - Individual video editing + AI metadata generation
4. **Stream Center** (`/stream`) - RTMP destination management, stream planning, live SEO optimization, platform resolution guide
5. **Operations** (`/jobs`) - Background job monitoring
6. **Channels** (`/channels`) - Connected platform management (9 platforms with icons)
7. **Insights** (`/insights`) - AI content pattern analysis
8. **Strategy** (`/strategy`) - AI growth plan generator
9. **Compliance** (`/compliance`) - Platform rule compliance monitor
10. **Advisor** (`/advisor`) - AI chat for content strategy questions
11. **Backlog Optimizer** (`/backlog`) - Batch AI optimization for existing videos
12. **Settings** (`/settings`) - Risk profiles and automation config

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
- `/api/streams/:id/go-live` - Go Live trigger with automatic AI automation
- `/api/streams/:id/end` - End stream with automatic post-stream processing
- `/api/streams/:id/automation` - Real-time automation task status
- `/api/backlog` - Backlog video optimization endpoints
- `/api/thumbnails` - AI thumbnail generation and management

## Key Files
- `shared/schema.ts` - Database schema, types, PLATFORMS constant, PLATFORM_INFO
- `shared/routes.ts` - API route definitions with validation
- `server/routes.ts` - Express route handlers
- `server/storage.ts` - Database access layer
- `server/ai-engine.ts` - OpenAI-powered AI functions (includes stream SEO, post-stream optimization, thumbnail prompts)
- `client/src/App.tsx` - Main app with routing
- `client/src/components/Sidebar.tsx` - Navigation sidebar
- `client/src/pages/StreamCenter.tsx` - Stream Command Center page
- `client/src/pages/BacklogOptimizer.tsx` - Backlog Optimizer page

## AI Engine Functions
- `generateVideoMetadata` - Title, description, tags for videos
- `generateStreamSeo` - Live stream SEO optimization per platform
- `postStreamOptimize` - Post-stream VOD conversion optimization
- `generateThumbnailPrompt` - AI thumbnail concept generation
- `generateContentInsights` - Content pattern analysis
- `checkCompliance` - Platform rule compliance checking
- `generateGrowthStrategy` - Growth plan generation
- `askAdvisor` - Strategy advisor chat

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 9 platforms)
