/**
 * etgaming247-profile.ts
 *
 * Phase 2 + Phase 4: ETGaming247 channel profile and 92 BPM cadence engine.
 *
 * 92 BPM IS CADENCE — NOT A VIDEO LENGTH OR DURATION.
 * It describes the editing rhythm and pacing feel of a video.
 *
 * Use these constants anywhere ETGaming247 brand language, content structure,
 * or cadence guidance is needed. Import from this file instead of duplicating.
 */

// ── Channel identity ──────────────────────────────────────────────────────────

export const CHANNEL_NAME = "ETGaming247";

export const BRAND_PROMISE =
  "No commentary. No facecam. No fake hype. Raw gameplay cut with 92 BPM cadence: steady pressure, clean action, controlled chaos.";

export const SHORT_TAGLINE = "No talking. Just gameplay.";

export const ALT_TAGLINES = [
  "Raw gameplay. Clean action. Controlled chaos.",
  "No commentary gameplay cut with 92 BPM pressure.",
  "No facecam. No fake hype. Just the game.",
  "Clean gameplay with no wasted time.",
] as const;

// ── Viewer promise ────────────────────────────────────────────────────────────

export const VIEWER_PROMISE =
  "Clean no-commentary gameplay with steady pressure, fast context, and no wasted time.";

// ── Approved phrases ──────────────────────────────────────────────────────────

export const APPROVED_PHRASES = [
  "No commentary",
  "No facecam",
  "No fake hype",
  "No talking. Just gameplay.",
  "Raw gameplay",
  "Clean action",
  "Controlled chaos",
  "92 BPM pressure",
  "Hold line",
  "Final tickets",
  "Vehicle chaos",
  "Objective pressure",
  "Raw war",
  "No comms",
] as const;

// ── Avoid phrases ─────────────────────────────────────────────────────────────

export const AVOID_PHRASES = [
  "best ever",
  "most insane ever",
  "you won't believe",
  "god-tier",
  "clickbait",
  "fake claims",
] as const;

// ── Contextual overlay text (used in CONTEXT phase) ───────────────────────────

export const CONTEXT_OVERLAYS = [
  "LAST PUSH",
  "HOLD LINE",
  "OBJECTIVE LOST",
  "FINAL TICKETS",
  "ONE CHANCE",
  "VEHICLE INCOMING",
  "NO COMMS",
  "RAW WAR",
] as const;

// ── Thumbnail text options ────────────────────────────────────────────────────

export const THUMBNAIL_TEXT_OPTIONS = [
  "LAST PUSH",
  "HOLD LINE",
  "FINAL TICKETS",
  "RAW WAR",
  "VEHICLE PUSH",
  "OBJECTIVE LOST",
  "NO COMMS",
  "LOBBY BROKE",
  "ONE CHANCE",
  "PURE CHAOS",
  "FULL MATCH",
  "LIVE NOW",
] as const;

// ── Content buckets ───────────────────────────────────────────────────────────

export const CONTENT_BUCKETS = [
  "Objective Defense",
  "Final Tickets",
  "Vehicle Chaos",
  "Infantry Push",
  "Full Match",
  "Livestream Replay",
  "Raw All-Out Warfare",
  "Clutch Moment",
  "Funny Timing",
  "Brutal Flank",
  "No Commentary Background Watch",
  "92 BPM Cadence Cut",
] as const;

export type ContentBucket = typeof CONTENT_BUCKETS[number];

// ── Default playlists ─────────────────────────────────────────────────────────

export const DEFAULT_PLAYLISTS = [
  "Battlefield 6 No Commentary",
  "Full Matches",
  "Livestream Replays",
  "Shorts",
  "Objective Defense",
  "Vehicle Chaos",
  "Final Tickets",
  "Raw All-Out Warfare",
  "92 BPM Cadence Cuts",
] as const;

// ── Homepage sections ─────────────────────────────────────────────────────────

export interface HomepageSection {
  name: string;
  purpose: string;
  playlistName: string;
  playlistDescription: string;
  whatBelongsHere: string;
  updateRule: string;
}

export const HOMEPAGE_SECTIONS: HomepageSection[] = [
  {
    name: "Start Here: Best No-Commentary Gameplay",
    purpose: "First impression — show new visitors what the channel is about",
    playlistName: "Start Here: Best No-Commentary Gameplay",
    playlistDescription:
      "The best ETGaming247 no-commentary clips. Start here for clean gameplay, steady pressure, and controlled chaos.",
    whatBelongsHere: "Top-performing clips with strong retention and clear no-commentary identity",
    updateRule: "Auto-Safe: update when a video beats current top performers in retention or CTR",
  },
  {
    name: "Latest Uploads",
    purpose: "Show returning subscribers what's new",
    playlistName: "Latest Uploads",
    playlistDescription: "Fresh ETGaming247 uploads — raw gameplay, no commentary.",
    whatBelongsHere: "All recent uploads in reverse chronological order",
    updateRule: "Automatic — YouTube maintains this natively",
  },
  {
    name: "Battlefield 6 No Commentary",
    purpose: "Primary game-specific series — channel's core content",
    playlistName: "Battlefield 6 No Commentary",
    playlistDescription:
      "ETGaming247 Battlefield 6 no-commentary gameplay. Full matches, objective fights, vehicle chaos, infantry pushes — no talking, no facecam.",
    whatBelongsHere: "All BF6 content: full matches, highlights, Shorts, replays",
    updateRule: "Auto-Safe: add every BF6 video on publish",
  },
  {
    name: "Full Matches",
    purpose: "Long-watch audience — background watch and deep viewers",
    playlistName: "Full Matches",
    playlistDescription:
      "Complete uncut ETGaming247 gameplay sessions. No commentary, no editing fluff — just full raw matches.",
    whatBelongsHere: "Full match recordings, uncut or lightly trimmed",
    updateRule: "Auto-Safe: add every full match on publish",
  },
  {
    name: "Livestream Replays",
    purpose: "VOD audience — viewers who missed the live",
    playlistName: "Livestream Replays",
    playlistDescription:
      "ETGaming247 live session replays. Full matches, objective fights, raw gameplay from recent streams.",
    whatBelongsHere: "Post-stream VODs, replay cuts, and stream highlight compilations",
    updateRule: "Auto-Safe: add all stream replays on publish",
  },
  {
    name: "Shorts",
    purpose: "Discovery — new viewers via Shorts algorithm",
    playlistName: "Shorts",
    playlistDescription:
      "ETGaming247 Shorts — raw gameplay moments cut with 92 BPM pressure. Under 60 seconds, no commentary.",
    whatBelongsHere: "All Shorts (clips under 60s with #Shorts tag)",
    updateRule: "Auto-Safe: add every Short on publish",
  },
  {
    name: "Objective Defense",
    purpose: "Core content bucket — strong retention performer",
    playlistName: "Objective Defense",
    playlistDescription:
      "Objective defense moments from ETGaming247. Hold line. Final tickets. No commentary.",
    whatBelongsHere: "Clips with clear objective contest or hold-the-point gameplay",
    updateRule: "Auto-Safe: add on publish when video is tagged as Objective Defense bucket",
  },
  {
    name: "Vehicle Chaos",
    purpose: "High visual impact — good Shorts and discovery content",
    playlistName: "Vehicle Chaos",
    playlistDescription:
      "ETGaming247 vehicle gameplay — tanks, helicopters, jets, and raw vehicular chaos. No commentary.",
    whatBelongsHere: "Vehicle-focused clips and full matches with heavy vehicle action",
    updateRule: "Auto-Safe: add on publish when video is tagged as Vehicle Chaos bucket",
  },
  {
    name: "Final Tickets",
    purpose: "High pressure, emotional — strong viewer pull",
    playlistName: "Final Tickets",
    playlistDescription:
      "ETGaming247 final-ticket pressure moments. The match is almost over. No commentary. Pure pressure.",
    whatBelongsHere: "Clips that feature end-of-match final ticket or objective collapse moments",
    updateRule: "Auto-Safe: add on publish when video is tagged as Final Tickets bucket",
  },
  {
    name: "Raw All-Out Warfare",
    purpose: "High-energy bulk content — great for background watchers",
    playlistName: "Raw All-Out Warfare",
    playlistDescription:
      "ETGaming247 all-out war gameplay. Full intensity, no talking, pure raw action.",
    whatBelongsHere: "High-intensity gameplay that doesn't fit a specific bucket — raw and unstructured",
    updateRule: "Auto-Safe: add on publish when video is tagged as Raw All-Out Warfare bucket",
  },
  {
    name: "92 BPM Cadence Cuts",
    purpose: "Showcase the editing style — brand identity reinforcement",
    playlistName: "92 BPM Cadence Cuts",
    playlistDescription:
      "ETGaming247 gameplay cut with 92 BPM cadence — steady pressure, clean action, no wasted frames.",
    whatBelongsHere: "Tightly edited clips where the 92 BPM pacing is clearly intentional",
    updateRule: "Curated: add manually or when cadenceScore is high on diagnosis",
  },
];

// ── Default text templates ─────────────────────────────────────────────────────

export const CHANNEL_PROMISE =
  "No commentary. No facecam. No fake hype. Raw gameplay cut with 92 BPM cadence: steady pressure, clean action, controlled chaos.";

export const YOUTUBE_ABOUT =
  `ETGaming247 is built for clean no-commentary gaming. No facecam, no fake hype, no talking over the game — just raw gameplay cut with a 92 BPM cadence for steady pressure, clean action, and controlled chaos.

Expect full matches, livestream replays, Shorts, objective fights, vehicle chaos, final-ticket pressure, and raw gameplay moments from Battlefield-style games and other high-action titles.

Subscribe for no-commentary gameplay that gets straight to the action.`;

export const BANNER_TEXT_PRIMARY = "NO COMMENTARY GAMEPLAY • 92 BPM PRESSURE • NO FACE CAM";
export const BANNER_TEXT_SHORT = "NO TALKING. JUST GAMEPLAY.";

export const CHANNEL_TRAILER_TITLE = "Welcome to ETGaming247 — No Commentary Gameplay";
export const CHANNEL_TRAILER_DESCRIPTION =
  "ETGaming247 is raw no-commentary gameplay cut for clean action, steady pressure, and controlled chaos. No talking. No facecam. Just the game.";

// ── Default tags ──────────────────────────────────────────────────────────────

export const DEFAULT_TAGS =
  "battlefield 6,battlefield 6 gameplay,battlefield 6 no commentary,no commentary gameplay,battlefield gameplay,battlefield 6 ps5,battlefield 6 live,all out warfare,battlefield 6 multiplayer,raw gameplay,fps gameplay,no facecam gameplay,full match gameplay,objective gameplay,vehicle gameplay,92 bpm gaming,ETGaming247";

// ── Default descriptions ──────────────────────────────────────────────────────

export function buildDefaultDescription(game: string): string {
  return `Raw ${game} no-commentary gameplay cut with a 92 BPM cadence — steady pressure, clean action, objective fights, vehicles, infantry chaos, and no talking over the game.

No facecam. No fake hype. Just gameplay.`;
}

export const DEFAULT_LIVESTREAM_DESCRIPTION =
  `Live no-commentary gameplay from ETGaming247. No facecam, no fake hype, no talking over the game — just raw gameplay, full matches, objective pressure, vehicles, infantry fights, and controlled chaos.

Stay for full matches, livestream replays, Shorts, and clean gameplay cut with 92 BPM pressure.`;

export const DEFAULT_PINNED_COMMENT =
  "No commentary. No facecam. Just raw gameplay with 92 BPM pressure. Subscribe for full matches, livestreams, Shorts, and clean action.";

export const BATTLEFIELD_6_PINNED_COMMENT =
  "Live BF6 no commentary on PS5. All-Out Warfare, vehicles, infantry fights, and raw gameplay. Stay for full matches and subscribe for more. Stay for the next match and drop a like if you enjoy raw BF6.";

// ── Post-stream mining checklist ──────────────────────────────────────────────

export const POST_STREAM_MINING_CHECKLIST = [
  "Watch back the VOD and mark timestamps for strongest moments",
  "Identify 3–5 Short candidates (vehicle hits, clutch moments, objective turns)",
  "Identify 1–2 long-form candidates (best 10–30 min sections)",
  "Note final-ticket moments — high-value for thumbnails",
  "Note vehicle chaos moments — good Short + discovery content",
  "Pull thumbnail screenshot from highest-pressure moment",
  "Write title using Situation + Game + No Commentary formula",
  "Apply 92 BPM cadence: cut to HOOK→CONTEXT→PRESSURE→PAYOFF→RESET",
  "Trim idle opening, slow start, and any dead air",
  "Queue Shorts first — publish in scheduled windows (08:00 / 14:30 / 21:30)",
  "Package long-form with full SEO metadata",
  "Update VOD title/description if it's going live as a replay",
  "Add timestamp chapters to long-form if over 10 minutes",
] as const;

// ── Safety rails ──────────────────────────────────────────────────────────────

export const APPROVAL_REQUIRED_ACTIONS = [
  "Deleting videos",
  "Deleting playlists",
  "Deleting channel sections",
  "Mass-changing old metadata beyond safe daily limits",
  "Publishing copyright-risk content",
  "Changing OAuth credentials",
  "Disabling YouTube-only mode",
  "Disabling Lite Mode protections",
  "Changing monetization-risk settings",
  "Bypassing quota protection",
  "Uploading when required video file is missing",
  "Using misleading title or thumbnail claims",
  "Making destructive public channel-page changes",
] as const;

export const AUTO_SAFE_ACTIONS = [
  "Generate upload packages",
  "Generate livestream packages",
  "Generate stream mining plans",
  "Generate channel structure assets",
  "Queue Shorts in scheduled windows",
  "Queue long-form in scheduled window",
  "Update metadata within daily safe limits",
  "Generate analytics diagnosis",
  "Generate next-upload recommendation",
  "Assign playlist recommendations",
  "Run learning cycle",
  "Run back-catalog scan",
  "Refresh YouTube OAuth token",
] as const;

// ── 92 BPM Cadence Engine ─────────────────────────────────────────────────────
//
// IMPORTANT: 92 BPM IS CADENCE — NOT DURATION.
// This is the editing rhythm and pacing feel of the video.
// It is NOT a 92-second format. It does NOT control video length.

export const BPM = 92;
export const BEAT_DURATION_SEC = 60 / BPM; // 0.652s per beat

/**
 * Convert a number of beats to seconds at 92 BPM.
 * Use as a guide, not a strict cut rule.
 */
export function beatsToSeconds(beats: number): number {
  return parseFloat((beats * BEAT_DURATION_SEC).toFixed(3));
}

export const BPM_TIMING_GUIDE = [
  { beats: 1,  seconds: beatsToSeconds(1),  label: "1 beat",   useFor: "small visual change, aim flick, reload start, camera micro-shift" },
  { beats: 2,  seconds: beatsToSeconds(2),  label: "2 beats",  useFor: "aim movement, enemy reveal, reload complete, short text flash, direction change" },
  { beats: 4,  seconds: beatsToSeconds(4),  label: "4 beats",  useFor: "kill, explosion, impact moment, objective update, vehicle hit, edit cut, text overlay" },
  { beats: 8,  seconds: beatsToSeconds(8),  label: "8 beats",  useFor: "fight development, flank, push, revive, new threat, squad wipe setup, reposition" },
  { beats: 16, seconds: beatsToSeconds(16), label: "16 beats", useFor: "reset, payoff, new fight, new objective, chapter shift, transition" },
  { beats: 32, seconds: beatsToSeconds(32), label: "32 beats", useFor: "major sequence change, new map area, new game phase, full reset" },
] as const;

// ── Content structure (HOOK→CONTEXT→PRESSURE→PAYOFF→RESET) ───────────────────

export const CONTENT_STRUCTURE = {
  HOOK: {
    description: "Open with the highest-pressure moment. Do not start slow.",
    options: [
      "Explosion mid-screen",
      "Near death or last-second dodge",
      "Final tickets situation",
      "Sudden enemy reveal",
      "Objective being lost",
      "Vehicle push arriving",
      "Squad wipe starting",
      "Brutal flank opening",
      "Sudden chaos break",
    ],
  },
  CONTEXT: {
    description: "1–3 word text overlay immediately after the hook. Ground the viewer fast.",
    options: CONTEXT_OVERLAYS,
  },
  PRESSURE: {
    description: "Build and sustain tension. No dead air. Cut anything that doesn't add pressure.",
    options: [
      "Reloads under active fire",
      "Objective being contested",
      "Vehicle threat building",
      "Revive under fire",
      "Near death chain",
      "Ticket drain visible",
      "Enemy push sustained",
      "Flank closing in",
      "Squad wipe building",
    ],
  },
  PAYOFF: {
    description: "The moment. It can be a win or a loss — it just has to land.",
    options: [
      "Kill confirmed",
      "Death (honest payoff)",
      "Objective captured",
      "Objective lost",
      "Explosion",
      "Escape",
      "Squad wipe",
      "Epic fail",
      "Hard cut to silence",
    ],
  },
  RESET: {
    description: "Cut dead space immediately after payoff. Move to the next pressure moment.",
    options: [
      "Hard cut on payoff frame",
      "Fade to black then open on new hook",
      "Jump cut to different fight",
      "Text card into new sequence",
    ],
  },
} as const;

// ── Title formula ─────────────────────────────────────────────────────────────

export const TITLE_FORMULA = "Situation + Game + No Commentary";

export const TITLE_EXAMPLES = [
  "Final Objective Defense Got Brutal — Battlefield 6 No Commentary",
  "This Vehicle Push Changed the Match — Battlefield 6 Gameplay",
  "The Lobby Collapsed Into Chaos — Battlefield 6 No Commentary",
  "Battlefield 6 Live No Commentary — Raw All-Out Warfare Grind",
  "No Talking. Just Battlefield Pressure.",
  "Hold Line or Lose — Battlefield 6 No Commentary",
  "Last Ticket Pressure — Battlefield 6 Raw Gameplay",
];

export const TITLE_RULES = [
  "Sell the situation, not just the game",
  "No fake hype (no INSANE, EPIC, BEST EVER unless clearly earned)",
  "No misleading claims",
  "Keep 'no commentary' visible when useful",
  "Use game name when useful",
  "Use livestream/full match/raw gameplay when useful",
  "No all-caps spam",
] as const;

// ── Autonomous decision rules (Phase 10) ─────────────────────────────────────

export interface AutonomousDecisionRule {
  condition: string;
  action: string;
  requiresApproval: boolean;
}

export const AUTONOMOUS_DECISION_RULES: AutonomousDecisionRule[] = [
  {
    condition: "Vehicle Chaos Shorts outperform other buckets",
    action: "Create more Vehicle Chaos Shorts",
    requiresApproval: false,
  },
  {
    condition: "Objective Defense gets better retention than average",
    action: "Prioritize Objective Defense long-form and thumbnail concepts",
    requiresApproval: false,
  },
  {
    condition: "Livestream replays get weak replay views",
    action: "Improve post-live title/thumbnail and cut idle openings",
    requiresApproval: false,
  },
  {
    condition: "CTR is below 3%",
    action: "Rewrite title and thumbnail concept",
    requiresApproval: false,
  },
  {
    condition: "First 30-second retention is below 60%",
    action: "Start with stronger moment — fix the hook",
    requiresApproval: false,
  },
  {
    condition: "Average view percentage is below 35% despite good hook",
    action: "Fix cadence — remove dead air in middle section, tighten PRESSURE phase",
    requiresApproval: false,
  },
  {
    condition: "Tags string exceeds 500 characters",
    action: "Trim tags automatically to 500 characters",
    requiresApproval: false,
  },
  {
    condition: "Title contains fake hype phrases",
    action: "Rewrite title to situation-based framing",
    requiresApproval: false,
  },
  {
    condition: "Package lacks a clear payoff moment",
    action: "Mark as weak and recommend another clip or identify a better payoff",
    requiresApproval: false,
  },
  {
    condition: "No strong content is available in the queue",
    action: "Generate a livestream or recording plan instead of forcing a bad upload",
    requiresApproval: false,
  },
  {
    condition: "Shorts swiped-away rate is above 40%",
    action: "Cut to action immediately — no buildup, no loading screens, open mid-moment",
    requiresApproval: false,
  },
  {
    condition: "Good retention but low impressions",
    action: "Try a broader search-targeting title or trending moment angle",
    requiresApproval: false,
  },
];

// ── Auto-Safe operating mode description ─────────────────────────────────────

export const AUTO_SAFE_MODE_DESCRIPTION = `ETGaming247 Auto-Safe Mode:
CreatorOS runs the channel autonomously. Human involvement is only needed for:
1. Initial setup and account connections
2. Providing footage (livestreams, recordings, gameplay clips)
3. Emergency approval for risky or destructive actions

Everything else — packaging, queueing, scheduling, analytics diagnosis,
next-upload recommendations, playlist assignments, metadata generation,
and learning cycles — runs automatically.`;
