---
name: TOS monitor critical rule injection
description: TOS compliance monitor AI writes critical-severity rules to compliance_rules DB; those rules then block all autopilot_queue items before publishers start.
---

## The rule

The TOS compliance monitor (`tos-compliance-monitor.ts`) uses GPT to detect YouTube policy changes and writes new/updated rows to the `compliance_rules` table via `recordPolicyChange()`. When the AI returns `severity: "critical"` (or "high"), that value was passed verbatim to the DB.

## Why it blocks publishing

`enforceComplianceRules()` (platform-policy-tracker.ts) reads all active compliance_rules and keyword-matches them against every queue item's content + title. Any critical-severity match causes `autopilot-engine.ts` to set `status = "failed"` with `complianceBlocked: true` in metadata — permanently removing the item from the publisher's view.

The backlog processor runs at T+4.5min (before publishers at T+40min), so items get blocked before any publisher ever sees them.

## Observed rule names that caused blocking

- `incentivization_spam` — matched BF6 gaming descriptions
- `3rd_party_content` — "Unknown violation type" in registry, still blocked
- `misleading_metadata` — overlaps with code-defined `yt_misleading_metadata` (warning)

## Fix (both parts required)

**Part 1 — `server/services/tos-compliance-monitor.ts` `recordPolicyChange()`:**
Cap severity when writing to DB: any AI-reported `critical` or `high` → stored as `warning`. Only hard-coded policy-pack rules with verified keyword lists should ever be `critical`.

```typescript
const safeSeverity = (change.severity === "critical" || change.severity === "high")
  ? "warning"
  : (change.severity as any);
```

**Part 2 — `server/index.ts` boot-heal downgrade (step 8b):**
Added to the ILIKE list: `%incentivization_spam%`, `%incentivization%`, `%3rd_party_content%`, `%third_party_content%`, `%misleading_metadata%`, `%new_restriction%`, `%new_requirement%`. The existing reset SQL (`metadata->>'complianceBlocked' = 'true'`) already unblocks all affected items on next boot.

**Why:** The boot-heal catches any rules that slipped through before Part 1 was deployed, and handles future cases where the rule name pattern changes. Part 1 prevents re-creation. Both are needed because the DB may already contain critical rules from past TOS monitor runs.

## Timing note

The boot-heal downgrade runs at T+4s (Wave 0.5). The backlog processor that runs compliance checks starts at T+4.5min. If the downgrade succeeds, rules are already at "warning" when the backlog processor fires — so items are never blocked in the first place on subsequent boots.
