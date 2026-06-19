---
name: ASI system wiring
description: 7 ASI-level services added in Wave 10.5; ComplianceResult type shape and masterKnowledgeBank nullable column patterns.
---

# ASI System Wiring

## Services (Wave 10.5, T+35min+)
1. `platform-compliance-brain.ts` — immune system; seeds 40+ rules from AI; `checkCompliance()` gates every upload
2. `bayesian-knowledge.ts` — Bayesian confidence reweighting of all masterKnowledgeBank entries daily
3. `algorithm-model-learner.ts` — builds publish-window timing model from own analytics
4. `goal-discovery.ts` — computes content ROI, discovers what to do more/less of
5. `architecture-critic.ts` — scores all background services, flags underperformers
6. `hypothesis-engine.ts` — generates testable hypotheses; promotes confirmed ones to masterKnowledgeBank
7. `self-architect.ts` — reads weak-service metrics + incident log, writes proposals to `serviceProposals` table

## ComplianceResult type (platform-compliance-brain.ts)
```ts
export interface ComplianceResult {
  pass:          boolean;       // true = safe to publish
  hardBlocks:    string[];      // rule descriptions that block upload
  warnings:      string[];      // rule descriptions (non-blocking)
  blockedRuleIds: number[];
}
```
**Why:** Publishers originally used `cr.blocked`/`cr.violations` (objects with `.rule`/`.category`). The actual interface uses `!cr.pass`, `cr.hardBlocks` (plain strings), and `cr.warnings` (plain strings).

## masterKnowledgeBank nullable columns
`confidenceScore`, `evidenceCount`, `timesApplied`, `successRate` are all `integer().default(N)` WITHOUT `.notNull()` — TypeScript sees them as `number | null`. Always use `?? default` coalescing:
```ts
const cs = entry.confidenceScore ?? 50;
const ec = entry.evidenceCount   ?? 0;
if ((entry.timesApplied ?? 0) > 0) { ... }
```

## shadowVideoAnalytics column names
- `views` (not viewCount)
- `impressionsCtr` (not ctr)
- `averageViewPercent` (not avgViewPercentage)
- `likes` (not likeCount)

## Brain steps
- Step 9x: compliance context → masterKnowledgeBank (confidence 95)
- Step 9y: Bayesian reweighting of all knowledge entries (calls `runBayesianReweighting()`)
- Step 9z: algorithm model timing principle → masterKnowledgeBank

## Admin routes
- `GET /api/admin/service-proposals` — list all proposals
- `PATCH /api/admin/service-proposals/:id` — approve/reject a proposal
- `GET /api/admin/compliance-rules` — list compliance rules

## Startup migrations
- Migration 106: `platform_compliance_rules`, `service_proposals`, `hypotheses` tables
- Migration 107: `service_performance_metrics` table
