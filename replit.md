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
- Advanced Mode toggle (off by default) - reveals extra controls, detailed metrics, manual overrides
- Streamlined navigation - consolidated from 22 sidebar items down to 5
- Floating AI chat accessible from any page
- No manual trigger buttons - everything runs autonomously in background

## Recent Changes (Feb 2026)
- **Major UI Consolidation v2**: Reduced sidebar from 7 items to 5 items:
  - Home, Content, Go Live, Money, Settings
- **AI Team removed from sidebar**: Agents run autonomously in background; AI chat accessible via floating button on every page
- **Business Hub absorbed**: Ventures/Goals/Sponsors merged into Money page; Brand/Collabs/Competitors/Legal/Wellness/Learning merged into Settings page
- **Floating AI Chat**: Bot icon in bottom-right corner opens AI Strategist chat panel, accessible from any page
- **Dashboard Simplified**: Removed quick links (sidebar handles navigation), merged Notifications + AI Activity into single "Activity Feed"
- **Content Page**: Consolidated Library + Channels + Calendar into tabbed page with URL routing (/content/:tab)
- **Money Page**: Revenue + Expenses + Taxes + Payments + Ventures + Goals + Sponsors (7 tabs) with Chase CSV import
- **Settings Page**: General + Brand + Collabs + Competitors + Legal + Wellness + Learning (7 tabs with URL routing /settings/:tab)
- **Theme System**: Dark/light mode toggle with localStorage persistence
- **Advanced Mode**: Toggle with context provider, localStorage persistence, badge indicator in sidebar
- **Notification System**: Bell icon in header with filtering and mark-as-read
- **Stripe Integration**: Payment processing via Replit connector with webhook handling
- **Legacy Route Redirects**: All old URLs (/ai, /business, etc.) redirect to new consolidated pages

## System Architecture
The platform is built as a full-stack application with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database. It features a multi-tenant architecture with user ID scoping on all data. Core architectural decisions include:
- **Frontend**: React + Vite, leveraging TanStack Query for data fetching, wouter for routing (with useParams for tab routing), Tailwind CSS and shadcn/ui for UI components, and lucide-react for iconography.
- **Backend**: Express.js with Drizzle ORM for database interaction.
- **Database**: PostgreSQL, specifically Neon-backed via Replit, to handle diverse data types across numerous features.
- **Payments**: Stripe integration via Replit connector (stripe-replit-sync) with automatic webhook management, schema sync, and data backfill. Stripe schema is managed automatically - never insert directly.
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all AI-powered features, ensuring personalization with user context.
- **Authentication**: Replit Auth (OIDC-based) providing secure user authentication, including Google login.
- **Design System**: A dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Autonomous AI Agents**: 11 specialized AI agents (e.g., Editor, SEO Director, Tax Strategist) operate 24/7, collaborating in chains for complex tasks like auto-backlog processing and stream-aware pivoting. No manual triggers - fully autonomous.
- **Floating AI Chat**: FloatingChat component provides AI strategist access from any page via bottom-right floating button.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs based on individual creator styles and feedback.
- **PWA Support**: Full Progressive Web App capabilities including a manifest and service worker for installability and offline access.
- **UI/UX**: Consolidated tabbed pages for simplicity, notification bell, Advanced Mode toggle, theme toggle, content calendar, floating AI chat.
- **State Management**: ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.

## Navigation Structure (5 sidebar items)
- Home (Dashboard with Activity Feed, Business Health, Daily Briefing)
- Content (Library / Channels / Calendar tabs)
- Go Live (Stream Center)
- Money (Revenue / Expenses / Taxes / Payments / Ventures / Goals / Sponsors tabs)
- Settings (General / Brand / Collabs / Competitors / Legal / Wellness / Learning tabs)

## Key Files
- `server/index.ts` - Express server with Stripe webhook (registered BEFORE express.json())
- `server/stripeClient.ts` - Stripe credential fetching via Replit connector API
- `server/webhookHandlers.ts` - Stripe webhook processing
- `server/routes.ts` - All API routes including Stripe payment endpoints
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/ai-engine.ts` - 11 AI agents including Tax Strategist
- `client/src/App.tsx` - Main app with routing, providers (QueryClient, Tooltip, Theme, AdvancedMode), sidebar layout, FloatingChat, and legacy route redirects
- `client/src/components/Sidebar.tsx` - 5-item sidebar with user avatar, Advanced Mode badge
- `client/src/components/FloatingChat.tsx` - Floating AI chat button and panel (bottom-right)
- `client/src/components/NotificationBell.tsx` - Header notification bell component
- `client/src/hooks/use-theme.tsx` - Dark/light theme provider with localStorage
- `client/src/hooks/use-advanced-mode.tsx` - Advanced Mode provider with localStorage
- `client/src/hooks/use-auth.ts` - Authentication hook (Replit Auth)
- `client/src/hooks/use-advisor.ts` - AI advisor mutation hook
- `client/src/pages/Dashboard.tsx` - Home dashboard with Activity Feed, Business Health, Daily Briefing
- `client/src/pages/Content.tsx` - Consolidated content page (Library + Channels + Calendar)
- `client/src/pages/Money.tsx` - Consolidated money & business page (Revenue + Expenses + Taxes + Payments + Ventures + Goals + Sponsors)
- `client/src/pages/Settings.tsx` - Settings with 7 tabs (General + Brand + Collabs + Competitors + Legal + Wellness + Learning)
- `client/src/pages/StreamCenter.tsx` - Live streaming page
- `client/src/pages/Notifications.tsx` - Notifications page
- `client/src/pages/Landing.tsx` - Unauthenticated landing page

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.
- **Stripe**: Payment processing via Replit connector. Sandbox mode for dev, live keys needed for production publishing.
