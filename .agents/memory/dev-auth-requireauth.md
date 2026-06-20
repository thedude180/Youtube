---
name: Dev auth requireAuth pattern
description: The correct pattern for extracting userId in Express routes for both dev and prod.
---

## Rule

All route files MUST use `requireAuth(req, res)` from `./helpers` to extract userId.
Never use `(req as any).user?.id` or `req.user?.id` directly.

## Why

Dev bypass sets `req.user = { claims: { sub: "dev_bypass_user", email: "dev@example.com" } }`.
Production Replit OAuth sets `req.user = { claims: { sub: "<real-uuid>" } }`.
Neither sets `req.user.id` — that field doesn't exist. `requireAuth()` reads `user?.claims?.sub`.

## Correct pattern

```ts
import { requireAuth } from "./helpers";

app.get("/api/some/route", async (req, res) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;  // requireAuth already sent 401
    // ... use userId
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

## Files fixed (known offenders)

- `server/routes/evolution.ts` — 8 endpoints (system-growth/*, evolution/*)
- `server/routes/empire.ts` — 7 endpoints (empire/*)
- `server/routes/grinder.ts` — 2 endpoints (grinder/*)
- `server/routes/social-expansion.ts` — 3 endpoints (social/*)
- `server/routes/omni-intelligence.ts` — local requireAuth used claims.sub
- `server/routes/niche-research.ts` — local requireAuth used claims.sub
- `server/routes/catalog.ts` — rewritten to use requireAuth from helpers

## How to apply

When adding any new route file: import requireAuth from "./helpers" at the top.
When auditing for 401s in dev: grep for `(req as any).user?.id` across server/routes/*.ts.
