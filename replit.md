# CreatorOS — AI-Powered Media Business Operating System

## Overview
CreatorOS is an autonomous AI-powered media business operating system built first for YouTube gaming channels (no-commentary PS5 gaming), designed to expand into a multi-channel, multi-brand creator business platform. It runs the full business loop: idea → package → publish → repurpose → capture audience → monetize → attribute revenue → recommend next move.

## Active Build Directive
**CREATOROS_MASTER_PROMPT_v15.md** (unified, single-source) — saved in repo root.
Admin: thedude180@gmail.com / etgaming247.com

## Current Phase
**Phase 0 COMPLETE** — Audit & Stabilization done. Phase 1 (Foundation / Operating Core) is next.

## Architecture
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **AI**: gpt-4o-mini via Replit AI integrations (OpenAI + Anthropic available)
- **Auth**: Replit OAuth
- **Deployment**: Replit-native, port 5000

## 5-Page Rule (strict)
Only 5 pages allowed: **Team** (`/`), **Content** (`/content`), **Live** (`/stream`), **Revenue** (`/money`), **Settings** (`/settings`)
- Pre-auth pages (Landing, Legal, Pricing) are acceptable auxiliary routes
- Notifications, FounderConsole, Onboarding, PreChannelLaunch pages violate the rule — scheduled for removal/merge

## UI Philosophy
Dark, calm, agent-first, minimal, high-signal. No noisy notifications, no legal/tax dashboards, no enterprise clutter. Complexity stays underneath.

## Key Files
| File | Purpose |
|---|---|
| `CREATOROS_MASTER_PROMPT_v15.md` | Active build directive |
| `shared/schema.ts` | 400+ database tables (8,900+ lines) |
| `server/kernel/index.ts` | Secure Kernel — command routing, receipts, approval |
| `server/routes.ts` | API route registration |
| `server/index.ts` | Server entrypoint |
| `client/src/App.tsx` | Frontend router & page registration |
| `.local/phase0-audit-report.md` | Full Phase 0 audit with merge/remove/defer decisions |

## Repo Contract
| Item | Value |
|---|---|
| Package manager | npm |
| Build | `npm run build` |
| Test | `npx vitest run` |
| DB push | `npm run db:push` |
| Server bundle | `dist/index.cjs` (4.5MB) |
| Tests | 929/929 passing (all green) |
| Safe Mode | OFF (deadlock fixed — governance gate exemptions added) |
| Trust Budget | 100/100 (reset mechanism fixed) |

## Codebase Scale
- 400+ database tables (including v15.2.a17 resolution intelligence tables)
- 47 root-level engine files + 106 service files + 41 kernel files
- 154,939 server lines + 61,451 client lines
- Engine overlap clusters identified for merge (see `.local/phase0-audit-report.md`)

## Engine Overlap Summary
~107 engine/service files identified, target ~30 after consolidation:
- **Content cluster**: 13 files → 3-4 (catalog-content-engine primary)
- **Optimization cluster**: 7 files → 2 (performance-feedback primary)
- **Security cluster**: 11 files → 3 (security-engine + policy-preflight + rights-disclosure)
- **Growth cluster**: 7 files → 2 (livestream-growth primary)
- **Live cluster**: 13 files → 5 (live-detection + multistream + stream-lifecycle + reconciliation + clip-highlighter)
- **Money cluster**: 10 files → 3 (revenue-sync + brand-partnerships + stripe-hardening)
- **Healing cluster**: 9 files → 2 (resilience-observability + circuit-breaker)
- **Learning/AI cluster**: 13 files → 4 (ai-model-router + ai-queue + creator-memory + ai-disclosure)

## Bugs Fixed in QA Gauntlet (Post-Phase 7)
1. **PLATFORM_INFO missing "x" entry** — ChannelsTab and StreamCenter crashed with `TypeError: Cannot read properties of undefined (reading 'color')` when iterating PLATFORMS array. Added full X (Twitter) entry to PLATFORM_INFO.
2. **`requireAdmin` missing import in money.ts** — `/api/stripe/payments` returned 500 with `ReferenceError: requireAdmin is not defined`. Added import.
3. **Duplicate GET /api/channels route** — Two handlers registered; removed unreachable plain version, kept enriched version with connection status.
4. **Missing `/api/stream/command-center`** — Dashboard and Money page fetched it but route didn't exist. Added endpoint returning active stream session info.
5. **Missing `/api/vitals` + `/api/vitals/summary`** — Web vitals beacon POST and performance dashboard GET returned 404. Added in-memory collection + summary endpoint.
6. **Missing `/api/security/audit-log`** — Settings Security tab fetched it. Added endpoint returning user-scoped audit logs.
7. **Missing `/api/monetization/sponsorship-opportunities`, `/api/monetization/merch-predictor`, `/api/monetization/revenue-diversification`** — Money page fetched these with userId param appended by TanStack Query's `queryKey.join("/")`. Added handlers with `/:uid` param variant, returning correct response shapes matching frontend component expectations.

8. **Missing `/api/security/sessions`, `/api/security/two-factor`, `/api/security/alerts`** — Settings Security tab showed "Endpoint not found" error modal. Added all three + POST handlers.
9. **Missing 6 audience endpoints** — Dashboard fetched `/api/audience/heatmap/me`, milestones, growth-forecast, engagement-score, top-fans, geo-distribution. All returned 404. Added to platform routes.
10. **Missing 4 stream-upgrades endpoints** — `/api/stream-upgrades/highlights`, `/api/stream-upgrades/chat-sentiment`, `/api/stream-upgrades/overlay` (GET+POST), `/api/stream-upgrades/schedule`. Stream page showed "Request failed: Endpoint not found" toast.
11. **Missing 3 SEO endpoints** — `/api/seo/scores/me`, `/api/seo/rankings/me` (GET+POST), `/api/seo/opportunities/me`. Content SEO tab would 404.
12. **`/api/live-crew/state` returned 401** — `getUserId()` in `live-crew.ts` didn't check `req.user.claims.sub`. Fixed to include the correct auth path.
13. **Rate limiter too aggressive (100 req/60s)** — Normal multi-page browsing easily exceeded the 100 request/minute threshold, causing "Request blocked by security system" errors. Raised to 500 req/60s.

## Known Issues (Not Bugs — Expected Behavior)
- YouTube OAuth returns `redirect_uri_mismatch` — Google OAuth is configured for production domain (etgaming247.com), not dev/test domains. Expected in dev.
- `/api/stripe/payments` returns 403 "Admin access required" for non-admin users — intentional admin-only endpoint.
- AI chat returns trust-budget-exhausted error — safe mode is active globally, blocking AI actions until approval thresholds are adjusted.
- Platform connections show "configured: true" but no channels linked until user actually completes OAuth flow — this is expected startup state.

## Bugs Fixed in Phase 0
1. gpt-5-mini → gpt-4o-mini (37 files)
2. deleteChannel() SQL array cast
3. videos.userId column reference (3 engines, 10 occurrences)
4. Keyword engine float→integer crash
5. Collab engine null candidates crash
6. 11 failing tests (trust budget exhaustion + missing approval rule)
