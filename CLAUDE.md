# CLAUDE.md — CreatorOS Full Codebase Reference

Read this file before touching anything. It is the single source of truth for AI assistants working on this repo.

---

## 1. What This Project Is

**CreatorOS** is an AI-powered YouTube gaming business operating system for a no-commentary PS5 gaming channel.

- **Owner / admin:** thedude180@gmail.com — etgaming247.com
- **Mission:** 100% AI-autonomous channel operation (content, publishing, growth, monetization, community)
- **Active strategic directive:** `CREATOROS_MASTER_PROMPT_v15.md` — read it for current business priorities
- **Production quality standards:** defined in `replit.md` — 18 standards, always follow them

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Wouter (routing), TanStack Query v5, Tailwind CSS, shadcn/ui (Radix), framer-motion |
| Backend | Express 5, Node.js — tsx in dev, esbuild bundle for prod |
| Database | PostgreSQL via Drizzle ORM |
| AI Primary | OpenAI gpt-4o-mini via wrapped client `server/lib/openai.ts` |
| AI Secondary | Anthropic Claude via wrapped client `server/lib/claude.ts` |
| Auth | Replit Auth (OIDC) + Passport (Google OAuth + local strategy) |
| Payments | Stripe with stripe-replit-sync |
| Real-time | WebSockets (ws) — Twitch IRC, Kick Pusher, Discord Gateway live chat bridges |
| Icons | lucide-react for UI icons, react-icons/si for brand logos |

---

## 3. Repository Map

```
CREATOROS_MASTER_PROMPT_v15.md   Strategic directive — read for business priorities
replit.md                         Project memory + 18 production quality standards
CLAUDE.md                         This file

client/
  index.html
  src/
    App.tsx                       Route registrations (Wouter)
    pages/                        Route-level page components
      Dashboard.tsx / dashboard/
      Content.tsx  / content/
      Money.tsx    / money/
      Settings.tsx / settings/
      StreamCenter.tsx / stream/
      VideoStudio.tsx
      Vault.tsx
      Notifications.tsx
      Onboarding.tsx / PreChannelLaunch.tsx
      autopilot/
      Landing.tsx / Legal.tsx / Pricing.tsx
    components/
      ui/                         shadcn primitives (Button, Card, Badge, etc.)
      Sidebar.tsx                 Main navigation sidebar
      NotificationBell.tsx
      PlatformReconnectBanner.tsx  Surfaces disconnected platform warnings
      HealthRibbon.tsx / SystemPulseHUD.tsx
      LiveChatPanel.tsx / LiveStreamBanner.tsx
      AgentUIPayloadCard.tsx      AI agent event display
    hooks/
      use-toast.ts                ALWAYS import from here
      use-auth.ts / use-channels.ts / use-dashboard.ts
      use-stream-state.tsx / use-smart-polling.ts
    lib/
      queryClient.ts              TanStack Query client + apiRequest helper

server/
  index.ts                        Express bootstrap, port 5000, vault auto-clear on startup
  db.ts                           Drizzle client + withRetry helper
  storage.ts                      IStorage interface — ALL DB CRUD must go through here
  routes.ts                       Route aggregator (registers all sub-routers)
  platform-publisher.ts           Cross-platform post publishing (YT, TT, Discord, etc.)
  autopilot-engine.ts             Core autopilot orchestration loop
  ai-team-engine.ts               Multi-agent AI work pipeline
  ai-engine.ts                    AI utility functions
  oauth-config.ts                 OAuth provider configs

  routes/                         Thin HTTP handlers — validate with Zod, call storage
    ai.ts (8679 lines)            AI endpoints — largest file
    content.ts / content-core.ts
    platform.ts / settings.ts
    money.ts / stream.ts
    autopilot.ts / automation.ts
    growth-tracking.ts / audience-engine.ts
    competitive-edge.ts / dual-pipeline.ts
    kernel.ts / empire.ts
    events.ts                     SSE event streaming
    (50+ route files total)

  services/                       Long-running engines, watchdogs, schedulers
    autopilot-monitor.ts          Per-user health checks + platform_connections watchdog
    connection-guardian.ts        Watches OAuth token expiry every 15 min
    internal-rate-limiter.ts      System-wide rate limits — ai_calls: 250/min
    notifications.ts              notifyUser() — email/SMS, 4h dedupe by title
    notification-system.ts        Digest + push notification system
    chat-bridge.ts                Twitch IRC / Kick Pusher / Discord Gateway chat ingestion
    video-vault.ts                Video download + vault management
    youtube-push-backlog.ts       Queued YT metadata updates
    channel-catalog-sync.ts       Syncs YouTube channel catalog to DB
    relentless-content-grinder.ts Continuous content optimization loop
    infinite-evolution-engine.ts  Self-improvement AI loop
    empire-brain.ts               Strategic business intelligence
    growth-flywheel-engine.ts     Audience growth engine
    resilience-core.ts / resilience-observability.ts
    self-healing-agent.ts / anomaly-responder.ts
    health-brain.ts / memory-guardian.ts
    adaptive-throttle.ts / intelligent-job-queue.ts
    cleanup-coordinator.ts
    (100+ service files total)

  lib/
    openai.ts                     WRAPPED OpenAI client — ALWAYS use this
    claude.ts                     WRAPPED Anthropic client — ALWAYS use this
    logger.ts                     createLogger("module-name")
    errors.ts                     AppError, createErrorResponse
    security-hardening.ts         Request validation middleware
    ai-attack-shield.ts           AI-specific attack prevention
    platform-formatter.ts         Per-platform content formatting

  content/                        Content intelligence modules
  business/                       Revenue + business intelligence modules
  distribution/                   Multi-platform distribution logic
  live-ops/                       Live stream operations

shared/
  schema.ts                       Drizzle schema — SINGLE SOURCE OF TRUTH for all data shapes
  platform-specs.ts               Per-platform content limits / character counts

migrations/                       Drizzle-generated SQL — NEVER hand-edit
scripts/                          Operational scripts
script/build.ts                   Production bundle builder (esbuild)
vault/                            Temporary video downloads — AUTO-CLEARED on every startup + hourly
attached_assets/                  User uploads, importable via @assets/...
```

---

## 4. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (Express + Vite on port 5000) |
| `npm run build` | Production bundle to dist/ |
| `npm run start` | Run production bundle (NODE_ENV=production) |
| `npm run db:push` | Sync Drizzle schema to Postgres |
| `npm run check` | TypeScript typecheck |

- Both API and frontend are served from **port 5000** — never add a Vite proxy.
- Deployment: build command = `npm run build`, run command = `npm run start`.

---

## 5. The Most Important Rules

### 5a. Data Model
- Define every model in `shared/schema.ts` FIRST — both frontend and backend import from there.
- Generate insert schemas:
  ```ts
  export const insertVideoSchema = createInsertSchema(videos).omit({ id: true, createdAt: true });
  export type InsertVideo = z.infer<typeof insertVideoSchema>;
  export type Video = typeof videos.$inferSelect;
  ```
- Array columns: `text("tags").array()` — never `array(text())`.
- **NEVER change a primary-key column type.** serial to varchar (or vice versa) generates a destructive ALTER TABLE that breaks everything.

### 5b. Storage Layer
- All DB CRUD goes through `IStorage` in `server/storage.ts`.
- Routes never call `db` directly — always call a storage method.

### 5c. Routes
- Keep thin — validate with Zod insert schemas, call storage, return response.
- No silent fallbacks — throw with actionable error messages.

### 5d. AI Calls (Critical)
1. **ALWAYS use the wrapped clients**: `server/lib/openai.ts` and `server/lib/claude.ts`. Never instantiate `new OpenAI()` or `new Anthropic()` directly anywhere.
2. The wrappers enforce:
   - System rate limit: **250 requests/min** for ai_calls (waits up to 30s for a slot, then throws `"AI throttled: system ai_calls budget exhausted"`)
   - Up to **5 retries** with exponential backoff on upstream 429s
   - Fail-closed: errors must throw, never return fake-success payloads
3. Default model: `gpt-4o-mini`. Do not change without coordination.
4. A 429 storm in logs = engine concurrency issue, not provider limit. Fix the engine, do not raise the 250/min limiter.

### 5e. Frontend
- Routing with Wouter — new pages go in `client/src/pages/`, register in `App.tsx`.
- Forms: shadcn `useForm` + `Form` + `zodResolver`. Always pass `defaultValues`.
- TanStack Query v5 — object form ONLY:
  ```ts
  useQuery({ queryKey: ['/api/videos'] })   // correct
  useQuery(['/api/videos'])                  // wrong (v4 syntax)
  ```
- Never define `queryFn` in queries (default fetcher configured in queryClient.ts).
- Cache keys as arrays for hierarchy: `['/api/recipes', id]` not template strings.
- Mutations: use `apiRequest` from `@/lib/queryClient`, then `queryClient.invalidateQueries`.
- Show loading/skeleton states via `.isLoading` / `.isPending`.
- Toast: import `useToast` from `@/hooks/use-toast` — never any other path.
- Env vars on frontend: `import.meta.env.VITE_*` — never process.env.
- Don't import React explicitly — the JSX transform handles it.
- Add `data-testid` to every interactive element and every meaningful display element.
  - Pattern: `button-submit`, `input-email`, `card-video-${videoId}`.

### 5f. Styling
- HSL tokens in `client/src/index.css` use `H S% L%` format — no `hsl()` wrapper.
- Dark mode is class-based on `<html>`. Pair every utility class with its `dark:` variant unless a configured token already handles it.

### 5g. Path Aliases
```
@/...        →  client/src/
@shared/...  →  shared/
@assets/...  →  attached_assets/
```

---

## 6. Publishing Pipeline

- Per-user OAuth tokens live in the `channels` table: `accessToken`, `refreshToken`, `tokenExpiresAt`, `platformData`.
- `accessToken IS NULL` or `platformData._connectionStatus === "expired"` means the channel is disconnected.
- `server/platform-publisher.ts` is the single entrypoint for all cross-platform posting.
- **Discord posting** supports two modes (tried in order):
  1. Webhook URL stored on the channel row (`platformData.webhookUrl`)
  2. Bot API fallback using `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` env vars — kicks in automatically when no webhook is configured. Posts via `https://discord.com/api/v10/channels/{id}/messages` with `Authorization: Bot <token>`.
- Stream-only platforms (Rumble, Twitch, Kick) hold RTMP stream keys for live broadcasting. They do not publish social posts.
- `autopilot_queue` table holds pending cross-platform posts. The `platform_connections` watchdog in `autopilot-monitor.ts` scans every monitor cycle for "not connected" failures and fires a critical notification grouped by platform. `notifyUser()` deduplicates by title over a 4-hour window.
- `youtube_push_backlog` table holds queued title/description/tag updates. Drains automatically once YouTube is reconnected.

---

## 7. Active Gaps

| Issue | Status | Resolution |
|---|---|---|
| YouTube OAuth disconnected | Open | User reconnects in Settings → Platforms |
| TikTok not connected | Open | User connects in Settings → Platforms |
| No Discord webhook configured | Mitigated | Bot API fallback covers it via DISCORD_BOT_TOKEN |
| 349 YouTube push-backlog failures | Queued | Auto-drains on YouTube reconnect |
| live_publish_attempts empty 14+ days | Root cause = above | Populates automatically after reconnect |

---

## 8. Secrets and Integrations

### User-managed secrets (Replit Secrets panel)

| Secret | Used for |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Gateway chat ingestion + bot API posting fallback |
| `DISCORD_CHANNEL_ID` | Target channel for bot API posting |
| `KICK_STREAM_URL` | RTMP destination for Kick live broadcasting |

### Platform-managed integrations (credentials handled by Replit — no raw key needed)
OpenAI, Anthropic, Stripe, Google Mail, GitHub, Replit Auth.

**Never log, print, or write secret values to any file.**

---

## 9. Forbidden and High-Risk Changes

| File / Area | Why it is off-limits |
|---|---|
| `package.json` | Use the package installer tool; never hand-edit |
| `vite.config.ts`, `server/vite.ts` | Host/proxy/middleware config is already correct — do not touch |
| `drizzle.config.ts` | Pre-configured — do not touch |
| Primary-key column types in `shared/schema.ts` | serial to varchar or vice versa = destructive ALTER TABLE |
| Wrapped AI clients' rate-limit / retry plumbing | Core stability guarantee |
| Silent-failure fallbacks anywhere | Must throw with actionable error messages |

---

## 10. Vault Auto-Clear (Deployment Safety)

`vault/` accumulates MP4 downloads from YouTube. 50 GB+ will cause deployment to fail with "Disk quota exceeded."

**Solution already in place in `server/index.ts`:**
- `clearVault()` runs immediately on every server startup (which happens before every checkpoint)
- `setInterval(clearVault, 3600000)` runs it hourly during long-running sessions
- `vault/` is already in `.gitignore`

Do not remove this code.

---

## 11. Debugging Quick Reference

| Symptom | Where to look |
|---|---|
| Autopilot posts failing silently | `autopilot-monitor.ts` platform_connections check; `autopilot_queue` table |
| AI 429 storms | `server/lib/openai.ts`, `internal-rate-limiter.ts` (250/min limit) |
| OAuth tokens expiring | `connection-guardian.ts`, `channels` table |
| Live chat not arriving | `chat-bridge.ts`, check DISCORD_BOT_TOKEN / TWITCH_BOT_TOKEN / KICK_CHANNEL env vars |
| Discord posting broken | `platform-publisher.ts` postToDiscord — webhook tried first, bot API fallback second |
| YouTube not publishing | `channels` table: verify accessToken is not null for the youtube row |
| Notifications not reaching user | `notifications.ts` — 4h dedupe by (userId, title) |
| Server crash on startup | `/tmp/server-crash.log` — written on every PID start |
| Deployment disk quota exceeded | Check vault/ size — clearVault() on startup should have cleared it |

---

## 12. Architecture Patterns

### Adding a new feature
1. Schema first in `shared/schema.ts` — table definition, insert schema, exported types
2. Storage method in `server/storage.ts` — add to IStorage interface and implementation
3. Route in `server/routes/<domain>.ts` — thin, Zod-validated
4. Register in `server/routes.ts` if it is a new file
5. Frontend page in `client/src/pages/` — register in `App.tsx`
6. TanStack Query hook for data fetching
7. Add data-testid to all interactive and meaningful display elements

### Adding a new background service
- Create in `server/services/`
- Export `start<Name>()` and `stop<Name>()`
- Register start and stop in `server/index.ts` alongside existing services
- Log using `createLogger("service-name")`

### Adding a new AI call
- Use the wrapped client from `server/lib/openai.ts` or `server/lib/claude.ts`
- Throw on error — never return fake or partial data
- If hitting rate limits, reduce engine concurrency — do not raise the 250/min system limit

---

*When in doubt: read `replit.md` for project memory, `CREATOROS_MASTER_PROMPT_v15.md` for current strategic direction.*
