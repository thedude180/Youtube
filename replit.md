# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed for creators. It supports 25 major platforms, offering AI-powered insights, compliance checks, growth strategies, and content optimization. The platform integrates 11 autonomous AI agents, including a Tax Strategist, to provide end-to-end business management, from formation and taxes to revenue tracking and content scheduling. CreatorOS aims to be a "YouTube Team In A Box," empowering creators with advanced tools for content creation, distribution, and business growth across all major digital platforms.

## User Preferences
- Dark mode design with deep purple/blue tones
- "God Tier" power-user aesthetic
- Emphasis on AI-powered automation
- Multi-platform streaming focus (PS5 to 25 platforms)
- "5-year-old simple" UI with big buttons and color-coded status
- Exception-only notifications (AI handles everything silently unless issue arises)
- Human Review Mode available but off by default (full autonomy)
- Streamlined navigation - consolidated from 22 sidebar items to 13

## Recent Changes (Feb 2026)
- **Stripe Integration**: Added Stripe payment processing for accepting customer payments (payouts to Chase business account). Includes payment link creation, webhook handling, and payment history.
- **UI Streamlining**: Consolidated 12 standalone pages into 5 tabbed pages:
  - Money (Revenue + Expenses + Taxes + Payments) with Chase CSV import
  - Business (Ventures + Goals + Sponsors)
  - Growth (Brand + Collabs + Competitors)
  - Legal (Formation + Protections)
  - You (Wellness + Learning)
- Sidebar reduced from 22 items to 13 items for simpler navigation

## System Architecture
The platform is built as a full-stack application with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database. It features a multi-tenant architecture with user ID scoping on all data. Core architectural decisions include:
- **Frontend**: React + Vite, leveraging TanStack Query for data fetching, wouter for routing, Tailwind CSS and shadcn/ui for UI components, and lucide-react for iconography.
- **Backend**: Express.js with Drizzle ORM for database interaction.
- **Database**: PostgreSQL, specifically Neon-backed via Replit, to handle diverse data types across numerous features.
- **Payments**: Stripe integration via Replit connector (stripe-replit-sync) with automatic webhook management, schema sync, and data backfill. Stripe schema is managed automatically - never insert directly.
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all AI-powered features, ensuring personalization with user context.
- **Authentication**: Replit Auth (OIDC-based) providing secure user authentication, including Google login.
- **Design System**: A dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Autonomous AI Agents**: 11 specialized AI agents (e.g., Editor, SEO Director, Tax Strategist) operate 24/7, collaborating in chains for complex tasks like auto-backlog processing and stream-aware pivoting.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs based on individual creator styles and feedback.
- **PWA Support**: Full Progressive Web App capabilities including a manifest and service worker for installability and offline access.
- **UI/UX**: Consolidated tabbed pages for simplicity, notification bell, Human Review Mode toggle, and a content calendar.

## Navigation Structure (13 items)
- Dashboard, Library, Channels, Stream, Calendar, AI Team, Advisor
- Money (Revenue / Expenses / Taxes / Payments tabs)
- Business (Ventures / Goals / Sponsors tabs)
- Growth (Brand / Collabs / Competitors tabs)
- Legal (Formation / Protections tabs)
- You (Wellness / Learning tabs)
- Settings

## Key Files
- `server/index.ts` - Express server with Stripe webhook (registered BEFORE express.json())
- `server/stripeClient.ts` - Stripe credential fetching via Replit connector API
- `server/webhookHandlers.ts` - Stripe webhook processing
- `server/routes.ts` - All API routes including Stripe payment endpoints
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/ai-engine.ts` - 11 AI agents including Tax Strategist
- `client/src/App.tsx` - Main app with routing
- `client/src/components/Sidebar.tsx` - Simplified sidebar navigation
- `client/src/pages/Money.tsx` - Consolidated money page (Revenue + Expenses + Taxes + Payments)
- `client/src/pages/Business.tsx` - Consolidated business page (Ventures + Goals + Sponsors)
- `client/src/pages/Growth.tsx` - Consolidated growth page (Brand + Collabs + Competitors)
- `client/src/pages/Legal.tsx` - Consolidated legal page (Formation + Protections)
- `client/src/pages/You.tsx` - Consolidated personal page (Wellness + Learning)

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.
- **Stripe**: Payment processing via Replit connector. Sandbox mode for dev, live keys needed for production publishing.
