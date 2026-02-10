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

## System Architecture
The platform is built as a full-stack application with an Express.js backend and a React/Vite frontend, utilizing a PostgreSQL database. It features a multi-tenant architecture with user ID scoping on all data. Core architectural decisions include:
- **Frontend**: React + Vite, leveraging TanStack Query for data fetching, wouter for routing, Tailwind CSS and shadcn/ui for UI components, and react-icons for iconography.
- **Backend**: Express.js with Drizzle ORM for database interaction.
- **Database**: PostgreSQL, specifically Neon-backed via Replit, to handle diverse data types across numerous features.
- **AI Integration**: OpenAI via Replit AI Integrations (gpt-5-mini model) for all AI-powered features, ensuring personalization with user context.
- **Authentication**: Replit Auth (OIDC-based) providing secure user authentication, including Google login.
- **Design System**: A dark theme with a purple accent for a "God Tier" power-user aesthetic, emphasizing simplicity and clear status indicators.
- **Autonomous AI Agents**: 11 specialized AI agents (e.g., Editor, SEO Director, Tax Strategist) operate 24/7, collaborating in chains for complex tasks like auto-backlog processing and stream-aware pivoting.
- **Creator Intelligence System**: Comprises a Style Scanner, Creator Memory, Humanization Layer, and Learning Engine to personalize AI outputs based on individual creator styles and feedback.
- **PWA Support**: Full Progressive Web App capabilities including a manifest and service worker for installability and offline access.
- **UI/UX**: Features like a notification bell, Human Review Mode toggle, and a content calendar are integrated for intuitive control and oversight.

## External Dependencies
- **Replit Auth**: For user authentication and session management.
- **OpenAI API**: For all AI-driven functionalities using the `gpt-5-mini` model.
- **PostgreSQL (Neon-backed)**: The primary database solution.
- **YouTube Data API v3**: For OAuth2 connection, video synchronization, and pushing optimized metadata to YouTube.