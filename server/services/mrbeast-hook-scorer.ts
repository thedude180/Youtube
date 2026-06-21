/**
 * mrbeast-hook-scorer.ts
 *
 * MrBeast's core principle: the first 3-5 seconds must EARN the viewer.
 * Every clip moment gets a "hook energy" score that measures how likely
 * it is to grab and hold attention from frame 1.
 *
 * Used by back-catalog-engine and creator-acceleration-engine to prefer
 * the highest-hook candidates when multiple moments are available.
 */

export interface ViralMomentCandidate {
  startSec: number;
  endSec: number;
  title?: string;
  retentionScore?: number; // 0-1, from retention curve (1 = peak viewer attention)
}

export interface HookScore {
  score: number;
  breakdown: {
    openingEnergy: number;  // 0-40 pts — does retention curve say viewers love this moment?
    positionBonus: number;  // 0-25 pts — first 30% or final 20% of video (power zones)
    durationFit: number;    // 0-20 pts — 22-45s sweet spot for Shorts algorithm
    titlePower: number;     // 0-15 pts — power words that drive curiosity gap or emotion
  };
  label: "elite" | "strong" | "good" | "average" | "weak";
}

const HOOK_POWER_WORDS = [
  // Combat actions
  "kill", "clutch", "wipe", "ace", "destroy", "1v4", "1v5", "1v3",
  "no scope", "headshot", "melee", "knife", "squad wipe", "solo wipe",
  // Emotional intensity
  "insane", "crazy", "epic", "impossible", "broken", "god", "beast",
  "legendary", "op", "overpowered", "unreal", "unbelievable", "insane",
  // Battlefield-specific
  "tank", "jet", "helicopter", "sundance", "mackay", "bf6", "battlefield",
  "conquest", "rush", "breakthrough", "operators",
  // Content quality signals
  "best", "worst", "first", "only", "secret", "pro", "tip", "trick",
  "glitch", "carry", "comeback", "highlight", "moment", "reaction",
];

export function scoreMomentHook(
  moment: ViralMomentCandidate,
  videoDurationSec: number,
): HookScore {
  const durationSec = moment.endSec - moment.startSec;
  const positionPct = videoDurationSec > 0
    ? moment.startSec / videoDurationSec
    : 0.5;

  // ── 1. Opening energy (0-40 pts) ──────────────────────────────────────────
  // Retention score from analytics curve = what % of viewers were still watching.
  // Higher retention → more likely this is genuinely engaging content.
  const retention = Math.max(0, Math.min(1, moment.retentionScore ?? 0.5));
  const openingEnergy = Math.round(retention * 40);

  // ── 2. Position bonus (0-25 pts) ──────────────────────────────────────────
  // MrBeast principle: best clips come from the OPENING (fresh, unfiltered energy)
  // or the CLIMAX (payoff moment at end). Middle sections are harder to hook with.
  let positionBonus: number;
  if (positionPct < 0.3) {
    // First 30%: full bonus scaling from 25 down to 15
    positionBonus = Math.round(25 - (positionPct / 0.3) * 10);
  } else if (positionPct > 0.8) {
    // Last 20%: climax moments — scale 15 up to 20
    positionBonus = Math.round(15 + ((positionPct - 0.8) / 0.2) * 5);
  } else {
    // Middle: linear decay 15 → 5
    positionBonus = Math.max(5, Math.round(15 - ((positionPct - 0.3) / 0.5) * 10));
  }

  // ── 3. Duration fit (0-20 pts) ────────────────────────────────────────────
  // YouTube algorithm sweet spot for Shorts: 22-45s. Clips ≤15s or ≥57s get
  // heavy penalties because they either can't build tension or lose retention.
  let durationFit: number;
  if (durationSec >= 22 && durationSec <= 45) {
    durationFit = 20;
  } else if (durationSec >= 15 && durationSec < 22) {
    durationFit = Math.round(10 + ((durationSec - 15) / 7) * 10);
  } else if (durationSec > 45 && durationSec <= 57) {
    durationFit = Math.round(20 - ((durationSec - 45) / 12) * 10);
  } else if (durationSec > 57 && durationSec <= 60) {
    durationFit = 8;
  } else {
    durationFit = Math.max(0, 5 - Math.round(Math.abs(durationSec - 33) / 20));
  }

  // ── 4. Title power words (0-15 pts) ───────────────────────────────────────
  // Strong title signal means the AI already knows this is a high-energy moment.
  let titlePower = 0;
  if (moment.title) {
    const lower = moment.title.toLowerCase();
    const hits = HOOK_POWER_WORDS.filter(w => lower.includes(w)).length;
    titlePower = Math.min(15, hits * 5);
    // Bonus: numbers in title (1v4, 3 kills, etc.) are strong curiosity signals
    if (/\d/.test(lower)) titlePower = Math.min(15, titlePower + 3);
  }

  const score = Math.min(100, openingEnergy + positionBonus + durationFit + titlePower);

  let label: HookScore["label"];
  if (score >= 80) label = "elite";
  else if (score >= 65) label = "strong";
  else if (score >= 50) label = "good";
  else if (score >= 35) label = "average";
  else label = "weak";

  return {
    score,
    breakdown: { openingEnergy, positionBonus, durationFit, titlePower },
    label,
  };
}

/**
 * Sort an array of clip moment candidates by hook score, highest first.
 *
 * @param moments       - Raw clip candidates with startSec/endSec/title/retentionScore
 * @param videoDurationSec - Total duration of the source video (used for position scoring)
 * @returns The same moments sorted by descending hook score, each annotated with hookScore
 */
export function rankMomentsByHook<T extends ViralMomentCandidate>(
  moments: T[],
  videoDurationSec: number,
): Array<T & { hookScore: HookScore }> {
  return moments
    .map(m => ({ ...m, hookScore: scoreMomentHook(m, videoDurationSec) }))
    .sort((a, b) => b.hookScore.score - a.hookScore.score);
}
