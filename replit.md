# CreatorOS - YouTube Team In A Box

## Overview
A comprehensive audience growth and content management platform for YouTube creators. Provides AI-powered insights, compliance checking, growth strategies, and content optimization - all in one dashboard.

## Current State
- Full-stack app with Express backend + React/Vite frontend
- PostgreSQL database with seeded demo data
- Replit Auth for user authentication
- OpenAI integration for real AI-powered features
- Dark theme with purple accent design system

## Architecture
- **Frontend**: React + Vite + TanStack Query + wouter routing + Tailwind CSS + shadcn/ui
- **Backend**: Express.js with Drizzle ORM
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini model)
- **Auth**: Replit Auth (OIDC-based)

## Database Schema
- `users` / `sessions` - Auth tables (managed by Replit Auth)
- `channels` - Connected social platform accounts (YouTube, TikTok, etc.)
- `videos` - Content library (VODs, Shorts, live replays)
- `jobs` - Background processing tasks
- `audit_logs` - Activity tracking for all user actions
- `content_insights` - AI-generated content pattern analysis
- `compliance_records` - Platform rule compliance checks
- `growth_strategies` - AI-generated growth plans
- `conversations` / `messages` - Chat/AI conversation history

## Pages
1. **Dashboard** (`/`) - Overview with metrics, quick links to AI tools, active jobs, audit log
2. **Library** (`/videos`) - Video content management with search/filter
3. **Video Detail** (`/videos/:id`) - Individual video editing + AI metadata generation
4. **Operations** (`/jobs`) - Background job monitoring
5. **Channels** (`/channels`) - Connected platform management
6. **Insights** (`/insights`) - AI content pattern analysis
7. **Strategy** (`/strategy`) - AI growth plan generator
8. **Compliance** (`/compliance`) - Platform rule compliance monitor
9. **Advisor** (`/advisor`) - AI chat for content strategy questions
10. **Settings** (`/settings`) - Risk profiles and automation config

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

## Key Files
- `shared/schema.ts` - Database schema and types
- `shared/routes.ts` - API route definitions with validation
- `server/routes.ts` - Express route handlers
- `server/storage.ts` - Database access layer
- `server/ai-engine.ts` - OpenAI-powered AI functions
- `client/src/App.tsx` - Main app with routing
- `client/src/components/Sidebar.tsx` - Navigation sidebar

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
