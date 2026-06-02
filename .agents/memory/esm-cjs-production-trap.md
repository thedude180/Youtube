---
name: ESM-only packages in CJS production bundle
description: p-limit v5+ and other pure-ESM packages crash the CJS production build on boot with "TypeError: (0, X.default) is not a function"
---

## The rule
Never `import` a pure-ESM package (one with `"type": "module"` in its package.json) at the top level of server code. The production build compiles to `dist/index.cjs` (CommonJS) and pure-ESM packages cannot be `require()`-d — the process crashes on boot before serving a single request.

**Why:** Replit's production build bundles the Express server into a single `dist/index.cjs` file. Any top-level `import X from 'esm-only-package'` becomes a `require()` call at runtime. Pure-ESM packages (`"type": "module"`) return an ESM namespace object from `require()`, not the default export — so calling it as a function throws immediately.

**How to detect:** `cat node_modules/<pkg>/package.json | grep '"type"'` — if it says `"module"`, it's ESM-only.

**Known offenders installed in this project:**
- `p-limit` v7.3.0 — caused 89 production outages (crash loop); replaced with hand-written `makeConcurrencyLimiter()` in `server/lib/ai-semaphore.ts`

**How to apply:**
- Before adding any new package import to server code, check its `"type"` field.
- If ESM-only: either use a CJS-compatible version (p-limit v3 was the last CJS version), use a dynamic `await import()` inside an async function, or write a small inline replacement.
- The "TypeError: (0 , X.default) is not a function" crash pattern in `dist/index.cjs` always means an ESM package was required as CJS.
