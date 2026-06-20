# Threat Model

## Project Overview

CreatorOS is a production-deployed Express + TypeScript backend with a React/Vite frontend and PostgreSQL database. It automates YouTube channel operations for authenticated users, including OAuth account linking, content generation and publishing, background orchestration, analytics, and revenue-related workflows. Production uses Replit OAuth for user authentication and is publicly reachable on the internet; development-only bypass authentication and sandbox helpers are not in scope unless a production path can reach them.

## Assets

- **User accounts and authenticated sessions** — session cookies, Replit/OIDC identities, and any logic that maps a browser session to a CreatorOS user. Compromise allows impersonation and access to all account-scoped operations.
- **YouTube OAuth credentials and linked channel state** — YouTube access tokens, refresh tokens, token expiry metadata, channel bindings, and backup token copies in user records. These credentials allow publishing, analytics access, chat actions, and other channel operations.
- **CreatorOS business data** — channel configuration, content queues, analytics, revenue/monetization records, decision logs, and autopilot state. Integrity matters because the product performs autonomous actions from stored state.
- **Administrative controls** — privileged routes, governance controls, diagnostics, and cross-account maintenance operations. Abuse can affect every user/channel in the deployment.
- **Application secrets and third-party credentials** — database connection details, Google OAuth client secrets, Stripe or other platform credentials, and internal signing/session secrets.

## Trust Boundaries

- **Browser to API** — all client input is untrusted. Every production `/api` route must enforce authentication, authorization, and input validation server-side.
- **Authenticated user to admin operator** — some actions affect other users, platform-wide settings, or token maintenance. These require explicit server-side admin authorization, not naming conventions or UI hiding.
- **API to PostgreSQL** — route and service code can read and mutate durable channel, token, queue, and analytics state. Query scope and parameterization are critical.
- **API to external services** — the server calls Google/YouTube and other providers using stored credentials. Callback handling, redirect generation, token storage, and outbound fetches are high-risk.
- **Production to development-only helpers** — dev bypass auth, dev seed routes, and experimental tooling exist in the repo but should be treated as out of scope unless production reachability is demonstrated.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/routes/**`, auth integration under `server/replit_integrations/auth/**`.
- **Highest-risk areas:** OAuth/account-linking flows in `server/routes/platform.ts`, `server/platform-auth.ts`, `server/youtube.ts`; object-ID routes in `server/routes/content.ts`, `server/routes/stream.ts`, and `server/youtube-manager.ts`; background services under `server/services/**`; any route touching tokens, publishing, payouts, diagnostics, or privileged maintenance.
- **Boundary reminders:** public allowlist is narrow; most `/api` traffic is authenticated, but admin enforcement is route-local and must be checked explicitly. `/api/admin/` is governance-exempt in `server/routes.ts`, so missing `requireAdmin` is especially dangerous. Numeric IDs and global list endpoints must never be treated as sufficient authority on their own.
- **OAuth reminder:** the dedicated `/api/youtube/callback` flow is especially sensitive because it can fall back to session-bound reconnect state; future scans should verify strict `state` validation before any token exchange or account binding occurs.
- **Usually ignore unless production-reachable:** `server/dev-*`, `/api/dev/*`, local mock/sandbox code, dev bypass behavior in `NODE_ENV=development`.

## Threat Categories

### Spoofing

CreatorOS relies on session-backed authentication and multiple OAuth integrations. The system must bind every protected request to the correct user identity and must bind each OAuth callback to the intended account owner. Callback state, session state, and any fallback identifiers used during reconnect flows must not allow one user to attach external credentials to another user account. Password-reset and login flows must also generate links from a trusted canonical origin rather than request headers, otherwise attacker-controlled domains can be injected into emailed authentication links.

### Tampering

Authenticated users can trigger workflows that mutate channels, publishing queues, analytics state, and monetization data. The backend must treat all request parameters as untrusted and must ensure cross-account mutations are impossible without explicit authorization. Operations that copy tokens, reconnect channels, change settings, or alter publishing state must be scoped to the caller or gated to admins.

### Information Disclosure

The application stores OAuth access tokens, refresh tokens, business analytics, and user/account metadata. API responses, logs, and error paths must not leak credentials or other users’ records. Admin or diagnostics endpoints must not expose broader datasets unless an authenticated admin is verified server-side.

### Denial of Service

The service runs many expensive background and third-party operations. Public or low-privilege users must not be able to trigger costly global scans, reconnect storms, mass token maintenance, or repeated provider calls without rate limits and authorization checks. External API calls and subprocesses must use timeouts and bounded work.

### Elevation of Privilege

This project has a strong authenticated/admin distinction and cross-account channel management. The most important guarantee is that normal users cannot invoke admin-only routes, impersonate another account in OAuth flows, or operate on other users’ channels by manipulating IDs, sessions, or callback context. All production-sensitive routes must enforce authorization in code, not by path naming, comments, or UI placement.
