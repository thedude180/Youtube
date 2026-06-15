---
name: Drizzle sql tag array spread bug
description: Passing a JS array to sql`` template with ::type[] cast produces invalid PostgreSQL row-constructor syntax; use sql.raw() IN list instead.
---

**Rule:** Never pass a JS array directly into Drizzle's `sql`` template tag with a PostgreSQL type cast (`::text[]`, `::int[]`, etc.).

```typescript
// WRONG — Drizzle spreads [a, b, c] as ($1, $2, $3)::text[]
// PostgreSQL cannot cast a row constructor to text[]
await db.execute(sql`WHERE col = ANY(${myArray}::text[])`);

// RIGHT — embed as a literal IN list using sql.raw()
const list = myArray.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
await db.execute(sql.raw(`WHERE col IN (${list})`));

// ALSO RIGHT for single-element or known-size arrays — use a literal
await db.execute(sql`WHERE id = 18117 AND status IN ('queued','processing')`);
```

**Why:** Drizzle's parameterizer treats a JS array value as multiple positional parameters, wrapping them in parentheses: `($1,$2,$3)`. When you append `::text[]`, PostgreSQL sees `($1,$2,$3)::text[]` — a row constructor cast — which is invalid syntax. The error surfaces as "Failed query: …" with no clear indication of the array spread.

**How to apply:**
- Any startup migration that needs to filter by a list of IDs/strings: use `sql.raw()` with an interpolated IN list
- Escape single quotes in string IDs with `.replace(/'/g, "''")`  
- For integer ID lists: no escaping needed — just `.join(',')`
- The bug affects `sql`` tag ONLY; `db.execute(sql.raw(...))` with a template literal is safe

**Affected migrations (examples):** migration 091 (fixed by 093), cancelLongStreamEditJobs (fixed before first deploy), migration 095.
