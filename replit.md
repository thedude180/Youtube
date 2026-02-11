# CreatorOS - YouTube Team In A Box

## Overview
CreatorOS is a comprehensive, multi-platform content management and live streaming platform designed for creators. It supports 25 major platforms, offering AI-powered insights, compliance checks, growth strategies, and content optimization. The platform integrates 11 autonomous AI agents to provide end-to-end business management, from formation and taxes to revenue tracking and content scheduling. CreatorOS aims to be a "YouTube Team In A Box," empowering creators with advanced tools for content creation, distribution, and business growth across all major digital platforms.

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
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all AI-powered features.
- **Authentication**: Replit Auth (OIDC-based).
- **Design System**: Dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Autonomous AI Agents**: 11 specialized AI agents operate 24/7, collaborating in chains for complex tasks like auto-backlog processing and stream-aware pivoting, with no manual triggers.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs.
- **PWA Support**: Full Progressive Web App capabilities for installability and offline access.
- **UI/UX**: Consolidated tabbed pages, notification bell, Advanced Mode toggle, theme toggle, content calendar, and floating AI chat.
- **State Management**: ThemeProvider and AdvancedModeProvider context providers with localStorage persistence.
- **Key Features**:
    - **Home**: Dashboard with Activity Feed, Business Health, Daily Briefing, AI Action Center, AI News Feed, AI Milestones, AI Cross-Platform Analytics, AI Comment Manager.
    - **Content**: Library with AI Content Ideas, AI Keyword Research, AI Content Calendar, AI Script Writer, AI Repurpose Hub, AI Chapter Markers, AI SEO Audit, AI Thumbnail Concepts, Channels, Calendar tabs.
    - **Go Live**: Stream Center with AI Stream Advisor, AI Chat Bot Builder, AI Stream Checklist, AI Raid Strategy, AI Post-Stream Report.
    - **Money**: Revenue with AI Financial Insights, AI P&L Report, Expenses, Taxes, Payments, Ventures, Goals, Sponsors with AI Sponsorship Manager, AI Media Kit.
    - **Settings**: General with AI Team Manager, AI Automation Builder, Brand with AI Brand Analysis, Collabs with AI Collab Matchmaker, Competitors, Legal, Wellness with AI Wellness Advisor, Learning with AI Creator Academy.

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.
- **Stripe**: Payment processing via Replit connector, with automatic webhook management.