/**
 * growth-milestone-engine.ts
 *
 * THE GROWTH HORMONE — channel growth directly and automatically unlocks new
 * system capabilities.  In biology, growth hormones don't just increase size —
 * they trigger cascades of entirely new capabilities.  This engine does the same
 * for CreatorOS: as ET Gaming 274 gains subscribers, it autonomously escalates
 * to higher operating tiers, enabling more content, deeper optimization, and new
 * feature unlocks — without any human touch.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Tier 0  (<1K subs):    3 Shorts/day, basic metadata only               │
 * │  Tier 1  (1K–5K):       3 Shorts/day + A/B thumbnails, brand sweeps     │
 * │  Tier 2  (5K–10K):      4 Shorts/day + deep SEO, full brand sweeps ← NOW│
 * │  Tier 3  (10K–50K):     5 Shorts/day + community posts, collab signals  │
 * │  Tier 4  (50K+):        6 Shorts/day + monetization optimization        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Written to:  service_state("growth-milestones", "current-tier")
 * Read by:     getMilestoneConfig() — importable by any service
 *              loop-conductor (adjusts queue depth targets)
 *              brain Step 9w (writes growth strategy to masterKnowledgeBank)
 */

import { createLogger }              from "../lib/logger";
import { getState, setStateAsync }   from "../lib/service-state";
import { logSystemIncident }         from "../lib/incident-log";
import { db }                        from "../db";
import { sql }                       from "drizzle-orm";

const logger = createLogger("growth-milestones");

const CHANNEL_ID         = 53;
const CHECK_INTERVAL_MS  = 6 * 60 * 60_000;   // re-evaluate every 6h
const INITIAL_DELAY_MS   = 3 * 60_000;         // first check T+3min after init
const KNOWN_SUBSCRIBERS  = 6_140;              // baseline June 2026

// ── Types ──────────────────────────────────────────────────────────────────

export interface MilestoneTierConfig {
  tier:                          number;
  name:                          string;
  subscriberMin:                 number;
  subscriberMax:                 number;    // -1 = no upper bound

  shortsPerDay:                  number;
  longFormPerDay:                number;

  abThumbnailTestingEnabled:     boolean;
  communityPostsEnabled:         boolean;
  deepSeoEnabled:                boolean;
  brandConsistencySweepEnabled:  boolean;
  collaborationSignalsEnabled:   boolean;
  monetizationOptEnabled:        boolean;

  aiBudgetMultiplier:            number;

  currentSubscribers:            number;
  subscribersToNextTier:         number;   // -1 = already at max
  percentToNextTier:             number;   // 0.0–1.0

  tieredUpFrom:                  number | null;
  computedAt:                    string;
}

// ── Tier definitions ───────────────────────────────────────────────────────

interface TierDef {
  tier:                          number;
  name:                          string;
  subscriberMin:                 number;
  subscriberMax:                 number;
  shortsPerDay:                  number;
  longFormPerDay:                number;
  abThumbnailTestingEnabled:     boolean;
  communityPostsEnabled:         boolean;
  deepSeoEnabled:                boolean;
  brandConsistencySweepEnabled:  boolean;
  collaborationSignalsEnabled:   boolean;
  monetizationOptEnabled:        boolean;
  aiBudgetMultiplier:            number;
}

const TIERS: TierDef[] = [
  {
    tier: 0, name: "Seed",        subscriberMin: 0,      subscriberMax: 1_000,
    shortsPerDay: 3, longFormPerDay: 1,
    abThumbnailTestingEnabled: false, communityPostsEnabled: false,
    deepSeoEnabled: false,           brandConsistencySweepEnabled: false,
    collaborationSignalsEnabled: false, monetizationOptEnabled: false,
    aiBudgetMultiplier: 1.0,
  },
  {
    tier: 1, name: "Growing",     subscriberMin: 1_000,  subscriberMax: 5_000,
    shortsPerDay: 3, longFormPerDay: 1,
    abThumbnailTestingEnabled: true,  communityPostsEnabled: false,
    deepSeoEnabled: false,            brandConsistencySweepEnabled: true,
    collaborationSignalsEnabled: false, monetizationOptEnabled: false,
    aiBudgetMultiplier: 1.1,
  },
  {
    tier: 2, name: "Established", subscriberMin: 5_000,  subscriberMax: 10_000,
    shortsPerDay: 4, longFormPerDay: 1,
    abThumbnailTestingEnabled: true,  communityPostsEnabled: false,
    deepSeoEnabled: true,             brandConsistencySweepEnabled: true,
    collaborationSignalsEnabled: false, monetizationOptEnabled: false,
    aiBudgetMultiplier: 1.2,
  },
  {
    tier: 3, name: "Authority",   subscriberMin: 10_000, subscriberMax: 50_000,
    shortsPerDay: 5, longFormPerDay: 2,
    abThumbnailTestingEnabled: true,  communityPostsEnabled: true,
    deepSeoEnabled: true,             brandConsistencySweepEnabled: true,
    collaborationSignalsEnabled: true, monetizationOptEnabled: false,
    aiBudgetMultiplier: 1.3,
  },
  {
    tier: 4, name: "Dominant",    subscriberMin: 50_000, subscriberMax: -1,
    shortsPerDay: 6, longFormPerDay: 2,
    abThumbnailTestingEnabled: true,  communityPostsEnabled: true,
    deepSeoEnabled: true,             brandConsistencySweepEnabled: true,
    collaborationSignalsEnabled: true, monetizationOptEnabled: true,
    aiBudgetMultiplier: 1.5,
  },
];

function getTierDef(subscribers: number): TierDef {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (subscribers >= TIERS[i]!.subscriberMin) return TIERS[i]!;
  }
  return TIERS[0]!;
}

// ── Subscriber count ───────────────────────────────────────────────────────

async function getSubscriberCount(): Promise<number> {
  try {
    const { getCachedChannelStats } = await import("./youtube-data-cache");
    const stats = await getCachedChannelStats(CHANNEL_ID);
    if (stats && stats.subscriberCount > 0) return stats.subscriberCount;
  } catch { /* fall through */ }

  try {
    const result = await db.execute(sql`
      SELECT subscriber_count FROM channels WHERE id = ${CHANNEL_ID} LIMIT 1
    `);
    const count = Number((result as any)?.rows?.[0]?.subscriber_count ?? 0);
    if (count > 0) return count;
  } catch { /* fall through */ }

  return KNOWN_SUBSCRIBERS;
}

// ── Evaluation ─────────────────────────────────────────────────────────────

async function evaluate(): Promise<void> {
  const subscribers = await getSubscriberCount();
  const tierDef     = getTierDef(subscribers);

  const previous  = await getState<MilestoneTierConfig>("growth-milestones", "current-tier");
  const prevTier  = previous?.tier ?? null;
  const tieredUp  = (prevTier !== null && tierDef.tier > prevTier) ? prevTier : null;

  const nextDef       = TIERS[tierDef.tier + 1] ?? null;
  const subsToNext    = nextDef ? (nextDef.subscriberMin - subscribers) : -1;
  const pctToNext     = nextDef
    ? Math.min(1, (subscribers - tierDef.subscriberMin) / (nextDef.subscriberMin - tierDef.subscriberMin))
    : 1.0;

  const config: MilestoneTierConfig = {
    ...tierDef,
    currentSubscribers:    subscribers,
    subscribersToNextTier: subsToNext,
    percentToNextTier:     pctToNext,
    tieredUpFrom:          tieredUp,
    computedAt:            new Date().toISOString(),
  };

  await setStateAsync("growth-milestones", "current-tier",  config as unknown as Record<string, unknown>);
  await setStateAsync("growth-milestones", "tier-config",   config as unknown as Record<string, unknown>);

  if (tieredUp !== null) {
    const from = TIERS[tieredUp]?.name ?? `Tier ${tieredUp}`;
    logger.info(
      `[growth-milestones] 🎉 TIER UP! ${from} → ${tierDef.name} ` +
      `(${subscribers.toLocaleString()} subscribers)`,
    );

    logSystemIncident({
      category:       "other",
      service:        "growth-milestone-engine",
      severity:       "low",
      status:         "resolved",
      rootCause:
        `Channel crossed ${tierDef.subscriberMin.toLocaleString()} subscribers → ` +
        `${tierDef.name} tier unlocked.`,
      fixDescription:
        `System auto-upgraded to Tier ${tierDef.tier} (${tierDef.name}): ` +
        `${tierDef.shortsPerDay} Shorts/day, deepSEO=${tierDef.deepSeoEnabled}, ` +
        `communityPosts=${tierDef.communityPostsEnabled}, aiBudget×${tierDef.aiBudgetMultiplier}.`,
      lesson:
        `Growth milestone: Tier ${tierDef.tier} (${tierDef.name}) reached at ` +
        `${subscribers.toLocaleString()} subscribers. ` +
        `New capabilities now active: ${tierDef.shortsPerDay} Shorts/day ` +
        `(was ${TIERS[tieredUp]?.shortsPerDay ?? 3}), ` +
        `deepSEO=${tierDef.deepSeoEnabled}, A/B thumbnails=${tierDef.abThumbnailTestingEnabled}, ` +
        `community posts=${tierDef.communityPostsEnabled}. ` +
        `These capabilities were earned through consistent output and audience compounding. ` +
        `Next milestone: ${nextDef?.name ?? "max tier"} at ` +
        `${nextDef?.subscriberMin.toLocaleString() ?? "already reached"} subscribers.`,
      tags: ["milestone", "tier-up", `tier-${tierDef.tier}`, tierDef.name.toLowerCase()],
    });
  } else {
    const pctDisplay = Math.round(pctToNext * 100);
    const label = nextDef
      ? `${subscribers.toLocaleString()} subs — ` +
        `${subsToNext.toLocaleString()} to ${nextDef.name} (${pctDisplay}% there)`
      : `${subscribers.toLocaleString()} subs — max tier ${tierDef.name}`;
    logger.info(`[growth-milestones] Tier ${tierDef.tier} (${tierDef.name}): ${label}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the current milestone tier config.
 * Falls back to Tier 2 defaults (channel is already at ~6.14K subs).
 * Never throws.
 */
export async function getMilestoneConfig(): Promise<MilestoneTierConfig> {
  try {
    const stored = await getState<MilestoneTierConfig>("growth-milestones", "current-tier");
    if (stored && typeof stored.tier === "number") return stored;
  } catch { /* fall through */ }

  return {
    ...TIERS[2]!,
    currentSubscribers:    KNOWN_SUBSCRIBERS,
    subscribersToNextTier: 10_000 - KNOWN_SUBSCRIBERS,
    percentToNextTier:     (KNOWN_SUBSCRIBERS - 5_000) / (10_000 - 5_000),
    tieredUpFrom:          null,
    computedAt:            new Date().toISOString(),
  };
}

// ── Init ───────────────────────────────────────────────────────────────────

export function initGrowthMilestoneEngine(): void {
  logger.info(
    `[growth-milestones] Initializing — first evaluation in ${INITIAL_DELAY_MS / 60_000}min, ` +
    `then every ${CHECK_INTERVAL_MS / (60 * 60_000)}h`,
  );

  const run = async () => {
    try { await evaluate(); } catch (err: any) {
      logger.debug(`[growth-milestones] Eval error: ${err?.message?.slice(0, 80)}`);
    }
  };

  setTimeout(() => {
    run();
    const jitter = () => CHECK_INTERVAL_MS + Math.floor(Math.random() * 30 * 60_000);
    const next = () => setTimeout(() => { run(); next(); }, jitter());
    next();
  }, INITIAL_DELAY_MS);
}
