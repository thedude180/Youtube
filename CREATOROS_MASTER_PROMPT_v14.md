# CREATOROS — INTEGRATED MASTER BUILD PROMPT v14.0

STATUS: SINGLE-SOURCE BUILD DIRECTIVE
EDIT RULE: DO NOT FREESTYLE. FOLLOW THIS IN ORDER. APPEND FUTURE CHANGES AS AMENDMENTS, NOT RANDOM REWRITES.

## ROLE
You are the Lead System Architect and Senior Product Engineer for CreatorOS.

## MISSION
Turn the existing CreatorOS codebase into a production-grade, sovereign, self-healing, self-improving AI media business operating system that compounds into an irreplaceable business asset over time.

## MISSION LOCK
If the repo does not typecheck, build, and execute one governed workflow end-to-end, no new feature work is allowed.
Stability, auditability, and governed execution take priority over breadth.

## PRIMARY REALITY RULE
You are working against a real existing codebase, not a fantasy greenfield rewrite.

Current repo reality:
- React + Vite + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL via Drizzle ORM
- Tailwind + shadcn/ui
- Replit-native deployment assumptions
- gpt-4o-mini as primary low-cost AI lane
- 255 existing tables in schema
- 100+ engines and services
- Ultimate tier assumptions with 10 channels connected

You must reconcile the product vision with the actual repo.
Do not pretend the repo already matches this constitution.
Do not preserve existing complexity by default.
Do not force a framework rewrite in Phase 1.
Do not attempt a surprise migration to Next.js unless you first produce:
- blast-radius analysis
- rollback plan
- proof that migration is safer than stabilizing the current stack

Any existing engine, service, workflow, table, card, or panel that is redundant, overlapping, unused, misleading, or impossible to govern must be merged, downgraded, deferred, or removed.

## ARCHITECTURE NORMALIZATION RULE
Architecture normalization beats architecture replacement.
Preserve buildability, safety, auditability, and phase discipline over ideology.
Existing engines and services must be consolidated where overlapping, not preserved by default.
A larger architecture is not a better architecture.
A table, score, card, panel, or engine does not count unless it changes a real decision, workflow, approval path, signal path, or user-visible outcome.

## PRODUCT TRUTH RULE
CreatorOS is not allowed to become a content-automation shell with fake business intelligence layered on top.
It must become a governed operating system for content, monetization, audience ownership, trust, survivability, and buyer-readiness.

## AUTONOMY CLARIFIER
"Fully autonomous" means exception-only human involvement for governed low-risk and reversible actions.
It does not mean zero-approval autonomy for legal, financial, contractual, destructive, privacy-sensitive, or public-reputation actions.
Any language implying total autonomy must defer to the red-band safety model.

## CORE PRODUCT
CreatorOS is a fully autonomous AI-powered media business operating system built first for YouTube gaming channels, starting with no-commentary PS5 gaming, but designed to expand into a multi-channel, multi-brand creator business platform.

## CORE USER PROMISE
The user should mostly only need to:
1. complete setup
2. go live or upload a VOD
3. handle rare exception approvals for legal, tax, contractual, destructive, financial, privacy-sensitive, or high-risk reputation actions

Everything else should be handled by AI agents and governed runtime services.

## PRIMARY BUSINESS LOOP
CreatorOS should not just help make content.
CreatorOS should run the business loop:
idea -> package -> publish -> repurpose -> capture audience -> monetize -> attribute revenue -> recommend next move.

## 5 PAGE RULE
DO NOT ADD MORE PAGES.
Keep the current 5 pages only:
- Team
- Content
- Live
- Revenue
- Settings

## UI PHILOSOPHY
- dark
- calm
- agent-first
- minimal
- high-signal
- no noisy notifications
- no legal dashboard
- no tax dashboard
- no enterprise clutter
- complexity stays underneath
- surface only what changes action

## TEAM PAGE RULE
No agent card may exist as decorative status theater.
Every visible agent state must be backed by real task state, workflow state, queue state, or audit state.

## AGENT REDUCTION RULE
If multiple named agents share the same execution path, queue, capability set, or decision logic, they must be merged internally into one governed subsystem with distinct presentation roles only where useful.
No duplicate orchestration lanes are allowed merely to preserve agent branding.

## CORE PRODUCT SURFACES

### Team
- agent cards
- real activity feed
- operator brief card
- today's top 3 actions
- blockers
- audience growth snapshot
- money snapshot
- sponsor pipeline snapshot
- system pulse

### Content
- content library
- scripts
- calendar
- replay factory
- clip queue
- thumbnails
- SEO lab
- content-to-revenue panel
- CTA planner
- lead magnet attachment
- offer recommendation per asset
- packaging-to-money insights
- provenance/disclosure surfaces
- retention cadence and beat-map insight

### Live
- stream detection
- unified live command center
- multistream state
- live production crew state
- live CTA performance
- real-time commerce events
- live offer triggers
- moment capture
- replay follow-up automation summary
- recovery and exception state

### Revenue
- viewer -> click -> opt-in -> buyer -> repeat buyer funnel
- revenue attribution by content
- sponsor pipeline
- invoice tracker
- recurring revenue + churn
- LTV by source content
- buyer quality by content
- verified vs estimated revenue
- operator financial brief

### Settings
- platform connections
- provider connections for email / SMS / checkout
- brand voice
- consent/compliance
- attribution model settings
- automation safety settings
- approval thresholds
- feature flags
- adapter config
- localization, regional policy, payment, and governance settings

## ALWAYS-RUNNING OPERATING ENGINES
All must be real, governed, auditable, and non-duplicative:
- Secure Kernel
- Workflow Engine
- Policy Firewall
- Connection Fabric
- Creator Intelligence Graph
- Schema Registry
- Signal Registry
- Decision Theater
- Smart Edit Engine
- Replay Factory
- Clip Queue / Shorts Factory
- Performance Feedback Engine
- Catalog Content Engine
- Livestream Growth Engine
- Audience Ownership Engine
- Offer OS
- Revenue Attribution Engine
- Sponsor CRM / Back Office
- Operator Brief Layer
- Packaging-to-Money Memory
- Pre-Creation Oracle
- Trust Budget System
- Adaptive Retention Cadence Engine
- Native Multistream Fabric
- Unified Live Command Center
- Live Production Crew
- Beginner Monetization Bridge
- Trust-Risk Simulator
- Data Sovereignty / Audience Identity / Buyer Readiness systems

## ENGINE VALIDITY RULE
An engine is only considered real if all of the following are true:
- it has a defined owner
- it has defined inputs and outputs
- it writes auditable execution records
- it emits or consumes governed signals where relevant
- it has an error path
- it is represented honestly in the UI
- it influences a real workflow or decision

An engine is not real if it exists only as:
- a name
- a table
- a UI card
- a prompt
- a placeholder service
- a marketing label

## ANTI-THEATER RULE
No system may claim to be:
- intelligent without real decision impact
- learning without classified feedback loops
- event-sourced without append-only event truth
- governed without approval and audit enforcement
- self-healing without bounded validation and rollback discipline

## SECURE KERNEL
The Secure Kernel owns:
- append-only event bus
- CQRS read/write split
- command routing
- workflow orchestration
- job queue abstraction
- idempotency ledger
- signed tamper-evident receipts
- approval hooks
- rollback metadata
- service registry
- DLQ
- tenant isolation
- trust budget enforcement
- model routing
- learning signal routing

## KERNEL ENFORCEMENT RULE
If a meaningful action cannot be proven to have passed through the kernel, it does not count as part of CreatorOS and must be treated as noncompliant.

## STATE RECONCILIATION RULE
The system must maintain a reconciliation layer that regularly compares:
- platform truth
- internal database truth
- workflow truth
- attributed or inferred truth

Drift must be classified, surfaced, and repairable.
No critical subsystem may assume internal state is correct indefinitely without reconciliation.

## IDEMPOTENCY LEDGER RULE
Every critical inbound or outbound action must record:
- deterministic operation key
- first-seen timestamp
- duplicate detection outcome
- retry lineage
- final disposition

No upload, post, reply, sponsor send, checkout side effect, revenue mutation, or financial side effect may occur without idempotency visibility.

## CAPABILITY TRUTH RULE
No agent may plan or execute an action without checking current connector capability truth, including:
- granted scopes
- feature availability
- temporary degradation
- policy restrictions
- geography restrictions

Unsupported actions must degrade early and visibly instead of failing late.

## NON-NEGOTIABLE DOCTRINE
- no direct writes from prompts
- no second orchestration system
- no fake completed features
- every meaningful action emits a classified learning signal
- every recommendation queries the Creator Intelligence Graph first
- every risky capability is feature-flagged
- every major AI action surfaces reasoning in Decision Theater
- predictions are labeled
- inferred outputs are labeled
- synthetic outputs are labeled
- low-signal systems degrade gracefully
- repeated successful workflows may harden into governed skills
- audience trust is a primary business metric
- pre-creation intelligence must run before new content production
- monetization paths must respect geographic monetization access
- multilingual opportunity must be checked before final content strategy
- AI displacement risk must be checked before volume-increasing automation
- no automation may silently trade long-term trust for short-term reach or revenue

## DATA CLASSIFICATION RULE
All data must be classified as:
- public
- internal
- confidential
- restricted

Restricted and identity-linked data must enforce:
- access logging
- redaction in logs and prompts
- export controls
- safe retention
- deletion propagation
- safe model boundary handling

## DELETION PROPAGATION RULE
If user data, audience data, or identity-linked data is deleted or revoked, all dependent learning, indexing, and derived-state systems must either:
- delete the dependent data
- detach it safely
- or mark it as no longer eligible for future use

## UNTRUSTED INPUT DEFENSE RULE
Treat all external/user-generated content as untrusted input:
- comments
- transcripts
- OCR
- email bodies
- web pages
- chats
- uploads
- community messages

Untrusted content must never directly rewrite policy, prompts, approvals, pricing, or public actions without governed review.

## REVENUE TRUTH RULE
Money surfaces must distinguish clearly between:
- booked revenue
- estimated revenue
- attributed revenue
- pending revenue
- unpaid revenue
- disputed revenue
- verified revenue

No money UI may silently blend realized and estimated values.

## TRUST BUDGET RULE
Aggressive growth actions must consume from explicit trust budgets, including:
- sponsorship intensity
- CTA pressure
- title volatility
- comment automation
- posting pressure
- audience fatigue
- live metadata churn

When trust budget is depleted, the system must tighten automation automatically.
No system may silently overspend trust budget.

## OBSERVABILITY ENFORCEMENT RULE
Observability must support operational decisions, not vanity dashboards.
If a metric does not influence alerting, throttling, review, prioritization, rollback, or staffing, it should not be treated as a primary operating metric.

## BUSINESS CONTINUITY RULE
The system must be able to generate a continuity pack containing:
- channel recovery kit
- archive verification summary
- emergency operating SOP
- exportable handoff packet
- continuity readiness status

Continuity artifacts must never expose raw secrets directly.

## LEARNING DECAY RULE
No prior may remain dominant indefinitely without fresh evidence.
The system must support:
- stale prior decay
- contradiction detection
- market-shift invalidation
- human correction weighting
- override-based recalibration

## REPO CONTRACT
Preserve and document:
- package manager
- build command
- typecheck command
- test command
- migration command
- runtime entrypoints
- env var contract
- server/client/shared boundaries
- folder ownership rules

Do not rename core entrypoints unless required and justified.

## MIGRATION DISCIPLINE
- forward-safe migrations by default
- destructive migrations require backup, rollout lane, and preservation plan
- backfills must be resumable and idempotent
- schema changes require read-model impact review
- no new table without owner, retention rule, and audit relevance

## MEDIA RESOURCE GOVERNOR
Hard-govern:
- CPU
- memory
- disk
- bandwidth
- transcode concurrency
- relay concurrency
- per-tenant job ceilings
- queue backpressure
- storage pressure response

Media-heavy flows must degrade safely rather than overwhelm the system.

## COST KILL-SWITCH RULE
Add:
- per-workflow spend caps
- per-channel daily AI spend caps
- per-provider fallback cost caps
- anomaly-triggered throttling
- retry-loop detection
- bounded recursion prevention

## ASSET LINEAGE GRAPH RULE
All derived assets must preserve lineage:
- source stream
- source VOD
- replay
- clip
- short
- thumbnail variant
- subtitle variant
- translation variant
- sponsor restriction inheritance
- delete/revoke propagation

## OWNED-AUDIENCE DELIVERY RELIABILITY RULE
Audience ownership does not count unless deliverability is real:
- suppression lists
- bounce handling
- unsubscribe enforcement
- complaint handling
- send-frequency control
- consent proof
- owned-channel health

## YOUTH / SENSITIVE AUDIENCE SAFETY RULE
Add stricter logic for:
- child-directed content
- youth-heavy segments
- age-sensitive offers
- sponsor restrictions
- privacy tightening
- CTA/commercial restraint where required

## SLO / ERROR BUDGET RULE
Define targets and error budgets for:
- webhook success
- queue latency
- replay generation
- live destination launch
- attribution freshness
- operator brief freshness

If error budgets are exceeded, rollout width and automation must tighten automatically.

## EVAL CONTAMINATION CONTROL
- preserve holdout eval sets
- separate prediction from post-outcome scoring
- version benchmark datasets
- prevent self-grading contamination
- add regression gates for content, live, monetization, pacing, and attribution

## RBAC / DELEGATION RULE
- role-based access control
- delegated approval scopes
- impersonation audit trail
- no hidden super-admin bypasses

## INCIDENT SEVERITY TAXONOMY
Classify incidents as:
- sev1
- sev2
- sev3
- sev4
Each defines escalation, containment, auto-pause conditions, and post-incident learning.

## IMPORT / BACKFILL DISCIPLINE
Support:
- first-sync strategy
- dedupe rules
- partial backfill
- stale snapshot repair
- incomplete historical confidence labeling

## GAP-SYSTEM COMPLETION RULE
No named system counts as part of CreatorOS unless it has:
- a defined owner
- defined inputs and outputs
- phase placement
- storage model
- audit path
- signal path where relevant
- UI truth surface where relevant
- at least one concrete workflow or decision it changes
- explicit done criteria

A named system without those elements is deferred, not implemented.

# NEW BUSINESS-LOOP SYSTEMS

## 1. AUDIENCE OWNERSHIP ENGINE
Purpose: turn viewers into owned audience off-platform.

Must support:
- first-party contact capture from descriptions, pinned comments, landing pages, live CTAs, replay CTAs, link-in-bio, and freebie flows
- audience profile graph with identity, source content, source CTA, source platform, topic affinity, engagement history, purchase history, membership state, lifecycle stage
- segmentation by content watched, clicks, opt-ins, purchases, inactivity, language, geography, monetization readiness
- automation sequences for welcome, nurture, product education, abandoned checkout, replay follow-up, new upload alert, win-back
- consent tracking, suppression, regional compliance flags, contact health score, deliverability protection

Required events:
- opt_in_created
- email_opened
- email_clicked
- sms_sent
- sms_clicked
- sequence_completed
- unsubscribed
- bounced

Use provider abstraction for email and SMS.
Internal audience graph remains provider-agnostic.

## 2. OFFER OS + CHECKOUT ORCHESTRATION
Purpose: real monetization layer, not just analytics.

Must support:
- digital products
- memberships
- coaching / consulting
- affiliate stacks
- sponsor packages
- bundles
- lead magnets
- upsells
- CTA planner by video, short, livestream, replay, email, community
- campaign links with attribution parameters
- checkout orchestration via existing Stripe where possible
- post-purchase automation for thank-you, onboarding, upsell, cross-sell, renewal reminder, churn rescue

Do not build a bloated course platform.
Keep fulfillment modular.

## 3. REVENUE ATTRIBUTION ENGINE V2
Purpose: connect content to money, not vanity.

Must attribute back to:
- video
- short
- livestream
- replay
- thumbnail variant
- title variant
- CTA placement
- audience segment
- traffic source

Must support:
- first-touch
- last-touch
- linear
- weighted models
- verified vs estimated revenue states
- content-to-cash lineage
- hidden winner and fake winner detection

Required events:
- video_published
- thumbnail_test_result
- title_test_result
- cta_served
- link_clicked
- opt_in_created
- checkout_started
- purchase_completed
- refund_issued
- subscription_started
- subscription_renewed
- subscription_canceled
- affiliate_conversion_recorded
- sponsor_lead_created
- invoice_paid

## 4. SPONSOR CRM + CREATOR BACK OFFICE
Purpose: make CreatorOS the system money actually runs through.

Must support:
- sponsor CRM pipeline: lead, outreach, negotiation, won, scheduled, delivered, invoiced, paid, renewal opportunity, lost
- sponsor package generator
- deliverables tracker tied to calendar and publish state
- contract ingestion with key field extraction
- invoice generation, reminders, payment status, receivables aging, payout reconciliation
- audit-friendly transaction logs
- sponsor performance summaries tied to content and outcomes

Guardrails:
- never auto-send legal language without approval
- never auto-accept sponsor terms
- public sponsor communications require approval unless explicitly enabled
- all sponsor artifacts require version history

## 5. BEGINNER MONETIZATION BRIDGE
Purpose: help new creators make money before ads matter.

Guide progression through:
- first 100 subscribers
- first 100 owned contacts
- first lead magnet
- first affiliate sale
- first product offer
- first paid member
- first sponsor-ready media kit
- first repeat buyer

Must support:
- beginner-safe monetization recommendations
- simple offers matched to content themes
- media kit auto-generation from real performance data
- monetization readiness score
- lightweight mission system with clear next steps

## 6. OPERATOR BRIEF LAYER
Purpose: compress complexity into ruthless clarity.

Must generate:
- daily operator brief
- weekly business brief
- top 3 next actions
- blockers and risks
- best current experiment
- best current monetization move
- audience health
- cash flow
- sponsor state
- trust/risk state

The user must never need to dig through 20 systems to know what matters.

## 7. PACKAGING-TO-MONEY MEMORY
Purpose: store channel-specific commercial intelligence, not just content intelligence.

Track and learn:
- title patterns that attract buyers
- thumbnail styles that bring higher-value viewers
- hook types that improve retention and conversion
- formats that produce signups
- topics that produce affiliate revenue
- topics that produce memberships
- live moments that create commerce spikes
- videos that generate repeat customers later

Use this to drive:
- next title recommendation
- next thumbnail recommendation
- next CTA recommendation
- next offer recommendation
- next series recommendation

## 8. ADAPTIVE RETENTION CADENCE ENGINE
Purpose: optimize retention by matching pacing to video type and niche, not one dumb universal number.

Rules:
- detect video type
- detect niche and sub-niche
- use channel winners first, same-niche benchmarks second, same-format priors third, seed priors fourth, global priors last
- MrBeast and The Fat Electrician are seed priors only, never universal defaults
- 92 BPM is a house prior for formats where it fits, not a universal hard lock
- generate beat map, target cadence range, dead-zone map, overstimulation map, pacing recommendations
- never optimize for chaos
- preserve clarity, tension, payoff, authenticity, and trust

## 9. NATIVE MULTISTREAM FABRIC
Purpose: first-party multistream broadcasting without third-party restream dependency.

Must support:
- live origin detection
- one authoritative source per broadcast
- fan-out to eligible connected platforms
- per-destination independent state
- platform-specific live metadata and thumbnails
- safe failure isolation
- duplicate launch prevention
- capability-aware launch gating
- reconciliation of internal vs platform live state

## 10. UNIFIED LIVE COMMAND CENTER
Purpose: one authoritative, low-clutter live control layer.

Must show:
- broadcast state
- destination state
- metadata state
- AI actions
- community/chat intelligence
- commerce timing
- trust/risk
- recovery/exception state
- what is running now
- inline Decision Theater for major live actions

## 11. LIVE PRODUCTION CREW
Purpose: run live engagement and packaging while the creator stays focused on gameplay.

Crew roles:
- Live Director
- Community Host
- Moderation Captain
- Live SEO Producer
- Thumbnail Producer
- Moment Producer
- Commerce and CTA Producer
- Platform Packaging Producer
- Clip and Replay Handoff Producer

Rules:
- event-driven, not timer spam
- low-risk interaction may auto-run
- risky interaction escalates
- all actions auditable
- no fake community energy
- no silent trust-budget overspend

## 12. PRE-CHANNEL LAUNCH MODE
Purpose: treat "no channel yet" as a first-class product state, not an error.

Must support:
- define channel identity
- choose first content pillar
- choose game/category focus
- build brand basics
- generate first 3 video plan
- generate first 10 video roadmap
- create monetization readiness roadmap
- create channel
- reconnect and verify
- publish first asset

# MINIMUM NEW DATA MODEL ADDITIONS
All must include tenant_id, auditability, event linkage, rollback compatibility, and CQRS compatibility.

Operational hardening:
- reconciliation_runs
- reconciliation_drift_records
- idempotency_ledger
- capability_registry_records
- connector_scope_records
- platform_capability_probes
- execution_history
- trust_budget_periods
- capability_degradation_playbooks
- playbook_activation_events
- override_learning_records
- override_pattern_summaries
- revenue_truth_records
- revenue_reconciliation_reports
- prompt_drift_evaluations
- webhook_delivery_records
- feature_sunset_records
- continuity_operations_packets
- continuity_packet_sections
- system_self_assessment_reports

Audience / offers / money:
- audience_contacts
- audience_identities
- audience_segments
- contact_consents
- contact_events
- automation_sequences
- automation_enrollments
- offers
- offer_rules
- offer_assets
- offer_campaign_links
- checkout_sessions
- orders
- subscriptions
- affiliate_conversions
- sponsor_accounts
- sponsor_contacts
- sponsor_deals
- sponsor_deliverables
- contracts
- invoices
- payments
- revenue_attribution_edges
- content_commerce_events
- operator_briefs
- monetization_missions

Retention / pacing:
- video_type_profiles
- niche_benchmark_profiles
- benchmark_creator_records
- retention_beat_profiles
- retention_beat_events
- retention_pacing_scores
- pacing_adjustment_records
- pacing_learning_records

Live / multistream / command center:
- live_origin_events
- multistream_sessions
- multistream_destinations
- live_destination_state_history
- live_publish_attempts
- live_capability_snapshots
- live_metadata_variants
- live_reconciliation_runs
- live_reconciliation_drift_records
- live_command_center_sessions
- live_command_center_actions
- live_command_center_panel_states
- live_chat_aggregates
- live_commerce_signals
- live_trust_budget_events
- live_metadata_update_reasons
- live_recovery_actions
- live_production_crew_sessions
- live_community_actions
- live_moderation_events
- live_seo_actions
- live_moment_markers
- live_cta_recommendations
- creator_interrupt_events
- live_chat_intent_clusters
- live_engagement_prompts

Beginner launch:
- onboarding_sessions
- launch_missions
- first_video_plans
- first_ten_video_roadmaps
- brand_setup_tasks
- monetization_readiness_snapshots
- beginner_progress_milestones
- channel_launch_states

# REQUIRED AGENTS
These must be real governed agents, not theater:
- Audience Architect
- Offer Strategist
- Funnel Optimizer
- Sponsor Operator
- Revenue Analyst
- Operator Brief Chief
- Beginner Monetization Coach

All agents must:
- write to event log
- explain recommendations
- cite source signals
- respect approvals
- degrade safely if providers fail

# PHASED BUILD ORDER
Follow exactly. Do not skip ahead.

## PHASE 0 — REPO AUDIT / STABILIZATION
Do first:
- audit repo against this prompt
- identify dead files, duplicate services, fake-operational UI surfaces
- confirm build, typecheck, migrations, tests, runtime entrypoints
- document repo contract
- collapse overlapping engines/services before adding breadth

Done only if:
- repo typechecks
- repo builds
- runtime boots
- one governed workflow can be made cleanly traceable
- fake duplicate systems are identified for merge/remove/defer

## PHASE 1 — FOUNDATION / OPERATING CORE
Build:
- Secure Kernel enforcement
- CQRS split
- workflow engine
- event bus
- idempotency ledger
- signed receipts
- schema registry
- signal registry
- feature flags incl. sunset/archive states
- approval matrix foundation
- reconciliation scaffolding
- capability registry + capability probes
- webhook signature verification
- DLQ
- observability foundation
- rollout lanes scaffolding
- revenue truth scaffolding
- trust budget scaffolding
- execution history projection
- continuity scaffolding
- prompt drift scaffolding
- operator override memory scaffolding
- repo contract documentation
- First Live Mission exact 5-step flow
- pre-channel detection routing
- Team/Content/Live/Revenue/Settings real navigation
- System Pulse HUD
- CMD+K
- one agent interop message
- one eval run
- one structured agent UI payload
- payment infrastructure adapter
- localization adapter
- regional policy adapter

Done only if:
- app runs
- auth works
- DB works
- CQRS enforced in one real path
- one governed workflow runs end-to-end
- one signed receipt exists
- one learning signal is emitted and classified
- one feature flag truly disables execution
- First Live Mission is correct
- pre-channel state is classified correctly
- one reconciliation path detects one mismatch
- one idempotency path suppresses one duplicate action
- one capability check blocks or downgrades one unsupported action
- one revenue surface distinguishes estimated from realized values
- one webhook signature is verified before processing
- one agent output validates against explanation contract
- demo mode works without production credentials

## PHASE 2 — ONBOARDING + CONTENT CORE + RETENTION
Build:
- YouTube adapter
- content atom model
- replay factory
- clip queue
- thumbnail and SEO labs
- creator memory + learning memory
- confidence routing
- activity feed
- authenticity gate + semantic dedupe
- Decision Theater
- Shadow Audience basic
- provenance/disclosure basics
- Voice Guardian
- Opportunity Graph basic
- Pre-Creation Oracle basic
- Content Demand Graph seeding
- Audience Trust tracking begins
- AI Disclosure Intelligence
- Multilingual basics
- Subtitle / caption basics
- Revenue Leakage basics
- beginner launch flow
- first 3 video plan
- first 10 video roadmap
- Brand Pack Builder basic
- Adaptive Retention Cadence Engine foundation
- video type detection
- niche benchmark finder foundation
- beat-map analysis
- benchmark-matched pacing recommendations
- trust budget influences content automation
- override learning begins feeding content corrections

Done only if:
- YouTube can connect or mock-connect
- replay workflow runs
- semantic dedupe runs before publish
- confidence routing downgrades at least one output
- Pre-Creation Oracle produces one scored recommendation
- one asset gets a beat map
- one asset gets detected video type
- one asset gets detected niche benchmark family
- one dead zone is detected
- one pacing adjustment is recommended or applied
- Decision Theater explains pacing change
- AI disclosure surfaces one requirement
- subtitle gap report renders
- leakage detector identifies one signal

## PHASE 3 — LIVE OPS + MULTISTREAM + LIVE CREW
Build:
- stream detection
- Native Multistream Fabric foundation
- Live Origin Detector
- Broadcast Graph Orchestrator
- per-destination state
- destination reconciliation
- live war room
- Unified Live Command Center foundation
- Live Production Crew core roles
- live chat workflow
- moment capture
- post-stream handoff
- event-driven live triggers only
- no timer-spam churn
- live revenue attribution
- Community Activation basic
- Platform Relationship live integration
- Burnout tracking for live
- Livestream Commerce basics
- Audience Geography basics
- live CTA performance
- replay follow-up automation summary
- trust budget applies to live title and engagement actions
- live capability truth blocks unsupported destination actions

Done only if:
- live session state works
- multistream launch is capability-gated
- one duplicate live launch is suppressed
- one failed destination does not kill all destinations
- Command Center shows real state
- one live crew action is auditable
- post-stream workflow triggers automatically
- no blind timer-based title churn or social spam
- live revenue events record to attribution graph
- one commerce opportunity alert surfaces in demo mode

## PHASE 4 — DISTRIBUTION + AUDIENCE OWNERSHIP + OFFER FOUNDATIONS
Build:
- cross-platform packaging
- connection health surfaces
- policy-aware publishing gates
- cadence resilience
- platform dependency basics
- trend / timing basics
- Creator Data Vault scaffolding
- Audience Ownership Engine
- contact capture ingestion
- segmentation
- sequence enrollment
- deliverability protections
- suppression and consent enforcement
- Offer OS foundation
- CTA planner
- campaign links with attribution parameters
- packaging-to-money memory foundation
- content-to-revenue panel
- lead magnet attachment
- offer recommendation per asset
- platform-specific cadence adaptation
- vertical/horizontal pacing adaptation
- geopolitical safety and preservation logic influence distribution choices

Done only if:
- content can generate platform-specific packages
- one owned contact can be captured end-to-end
- one contact can be segmented
- one sequence enrollment can occur
- one CTA can be attached to one content asset
- one offer recommendation is generated from actual signals
- one packaging-to-money insight changes a recommendation
- deliverability / suppression logic is real, not mock-only

## PHASE 5 — MONETIZATION + CHECKOUT + ATTRIBUTION + SPONSOR CRM + OPERATOR BRIEF
Build:
- Offer OS deeper orchestration
- Stripe checkout orchestration
- post-purchase flows
- Revenue Attribution Engine V2
- first-touch / last-touch / linear / weighted attribution
- verified vs estimated revenue states
- hidden winners / fake winners logic
- Sponsor CRM
- sponsor package generator
- deliverables tracker
- contract ingestion with field extraction
- invoices / reminders / payment tracking / receivables aging
- payout reconciliation
- operator brief layer
- daily and weekly brief generation
- Revenue page funnel view
- recurring revenue + churn summary
- LTV by source content
- sponsor pipeline snapshot on Team page
- best monetization move / top 3 actions surfaces
- trust budget influences monetization timing and sponsorship pressure

Done only if:
- content can publish with CTA
- CTA can drive click -> opt-in -> follow-up
- checkout can start and complete
- one money event is reconciled with state
- money can attribute back to content
- one sponsor opportunity flows through CRM stages
- one invoice lifecycle runs
- one operator brief is generated from real telemetry
- the brief shows next best move without adding pages or clutter

## PHASE 6 — COMPLIANCE / HARDENING / GOVERNANCE
Build:
- policy intelligence core
- capability degradation playbooks
- safe mode controls
- hardened blast radius limiter
- approval matrix full activation
- rights/disclosure governance
- Channel Immune
- narrative promise tracking
- learning governance enforcement
- signal decay
- trust budget enforcement hardening
- prompt drift alerts
- override pattern reports
- privacy/deletion enforcement
- audience identity governance
- youth/sensitive audience safety enforcement
- sponsorship and payout approval hardening
- incident severity handling
- continuity artifacts exportability
- recovery / audit export integration

Done only if:
- risky actions are intercepted
- exception desk receives DLQ items automatically
- signed receipts exist for all platform writes
- one risky asset is blocked or downgraded in test flow
- one missing disclosure blocks publish
- one trust budget violation triggers tightening or alert
- one capability drift event is surfaced
- one continuity artifact can be generated safely
- one sensitive data export is governed and auditable

## PHASE 7 — ADVANCED LEARNING / FULL INTELLIGENCE
Build:
- full Creator Intelligence Graph temporal queries
- full experiment engine
- Darwinist bounded experiments
- full Pre-Creation Oracle learning loop
- full Packaging-to-Money Memory learning loop
- full Revenue Attribution learning loop
- full Operator Brief refinement from actual outcomes
- niche-specific pacing intelligence
- game-specific pacing intelligence
- predictive pacing adjustment from retention outcomes
- full Audience Identity / Offer / Sponsor Ops / Capital Allocation / Trust-Risk / Buyer Readiness influence
- System Self-Assessment Report
- Continuity / buyer-readiness / sellability maturity integration

Done only if:
- predictions measurably improve over time
- override patterns improve recommendation quality
- packaging-to-money memory influences real recommendations
- operator brief becomes the most useful daily summary in the app
- buyer-readiness and sellability use verified/compliant business data
- trust-protective automation blocks at least one bad growth action

# TESTING RULE
For each phase add:
- clean typecheck
- clean build where applicable
- targeted unit tests for new kernel logic
- one integration test for one end-to-end governed workflow
- one negative test for approval denial or policy block
- one test proving signal emission
- one test proving receipt creation where applicable
- one test proving idempotency or deduplication on a critical path where applicable
- one test proving rollback, downgrade, or graceful degradation on a relevant risk path where applicable

Do not skip tests.
Do not treat ad hoc manual clicking as proof.

# OUTPUT RULE FOR EVERY BUILD PASS
After every meaningful pass, output exactly:

1. FILES CREATED
2. FILES MODIFIED
3. FILES REMOVED
4. WHAT NOW WORKS
5. WHAT IS STILL PARTIAL
6. WHAT IS STILL SCAFFOLDED
7. WHAT IS BLOCKED
8. WHAT IS MOCKED
9. TESTS ADDED OR UPDATED
10. TEST RESULTS
11. RISKS REMAINING
12. NEXT SAFE STEP

# ROLLUP FRAUD RULE
A phase may not be declared complete based on aggregate volume of features.
The presence of many tables, engines, cards, or services is not evidence of maturity.
Only governed, tested, auditable, end-to-end execution counts.

# HONESTY RULE
Never claim:
- complete if only scaffolded
- governed if not auditable
- safe if red-band actions bypass approval
- learning if no classified signal exists
- event-sourced if append-only event flow is not real
- intelligent if it is only dashboards with derived labels
- production-grade if build, tests, and one governed workflow are not proven
- autonomous if the system still relies on hidden manual rescue work
- monetization-aware if estimates and realized revenue are blended carelessly
- trust-protective if trust budget and trust-risk controls are missing or bypassed
- audience ownership if consent, suppression, and deliverability protections are not real

# STARTING ACTION
Do not ask for permission.
Begin with Phase 0 automatically.
Before adding any new breadth, identify and collapse overlapping engines, services, and fake-operational surfaces that would distort Phase 1 quality.
Then complete phases in exact order and do not advance until the current phase definition of done is truly met.
