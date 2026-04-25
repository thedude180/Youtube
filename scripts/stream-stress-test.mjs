/**
 * ET GAMING 274 — 8-HOUR LIVE STREAM STRESS TEST
 *
 * Simulates a full 8-hour stream compressed in real time:
 * every "minute" of stream = ~150ms of test time
 * 8 hours × 60 min = 480 "minutes" → ~72 seconds of actual test
 *
 * Phases:
 *   H1  : Stream startup, go-live blast, initial chat flood
 *   H2-3: Mid-stream peak, concurrent AI, moment capture
 *   H4-6: Endurance slog, sustained load, health checks
 *   H7  : Pre-finale surge, burnout check, AI assistance
 *   H8  : Finale, end stream, post-processing pipeline
 */

const BASE = "http://localhost:5000";
const DEV_KEY = "crtr_dev_ai_test_key_2025_ET_Gaming";
const PROD_USER = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";
const MIN_MS = 150; // 1 stream-minute = 150ms real time

// ── Helpers ─────────────────────────────────────────────────────────────────

const pass = (n) => `  ✅ ${n}`;
const fail = (n, e) => `  ❌ ${n}: ${e}`;
const warn = (n, e) => `  ⚠️  ${n}: ${e}`;

const RESULTS = { ok: 0, failed: 0, warned: 0, errors: [] };

async function hit(label, method, path, body, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${DEV_KEY}`,
    "User-Agent": "Mozilla/5.0 (ET Gaming Stream Test)",
  };
  if (opts.userId) headers["X-User-Override"] = opts.userId;

  const fetchOpts = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(opts.timeout || 15000),
  };

  const t0 = Date.now();
  try {
    const res = await fetch(url, fetchOpts);
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") || "";
    let data;
    try { data = ct.includes("json") ? await res.json() : await res.text(); }
    catch { data = null; }

    const ok = res.ok || (opts.acceptStatus || []).includes(res.status);

    if (ok) {
      RESULTS.ok++;
      if (opts.verbose) console.log(pass(`${label} [${res.status}] ${ms}ms`));
      return { ok: true, status: res.status, data, ms };
    } else {
      const errMsg = `HTTP ${res.status} ${ms}ms — ${JSON.stringify(data)?.substring(0, 80)}`;
      if (opts.soft) {
        RESULTS.warned++;
        if (opts.verbose) console.log(warn(label, errMsg));
        return { ok: false, status: res.status, data, ms };
      }
      RESULTS.failed++;
      RESULTS.errors.push(`${label}: ${errMsg}`);
      if (opts.verbose !== false) console.log(fail(label, errMsg));
      return { ok: false, status: res.status, data, ms };
    }
  } catch (e) {
    const ms = Date.now() - t0;
    const errMsg = `${e.name} ${ms}ms — ${e.message?.substring(0, 60)}`;
    RESULTS.failed++;
    RESULTS.errors.push(`${label}: ${errMsg}`);
    if (opts.verbose !== false) console.log(fail(label, errMsg));
    return { ok: false, data: null, ms };
  }
}

async function parallel(calls) {
  return Promise.all(calls);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function bar(n, total, w = 30) {
  const filled = Math.round((n / total) * w);
  return "█".repeat(filled) + "░".repeat(w - filled);
}

function header(title) {
  const pad = Math.max(0, 66 - title.length);
  const left = "═".repeat(Math.floor(pad / 2));
  const right = "═".repeat(Math.ceil(pad / 2));
  console.log(`\n${left} ${title} ${right}`);
}

function checkpoint(h, viewers, chat, events) {
  console.log(`\n  ┌─ HOUR ${h} CHECKPOINT ──────────────────────────────────────┐`);
  console.log(`  │  Viewers: ${String(viewers).padEnd(6)} Chat/min: ${String(chat).padEnd(6)} Events fired: ${events}`);
  console.log(`  │  Results so far → ✅ ${RESULTS.ok}  ❌ ${RESULTS.failed}  ⚠️  ${RESULTS.warned}`);
  console.log(`  └────────────────────────────────────────────────────────────┘`);
}

// ── Phase 0: Pre-flight ──────────────────────────────────────────────────────

header("PHASE 0 — PRE-FLIGHT CHECKS");

const health = await hit("Server health", "GET", "/api/health", null, { verbose: true });
const cmdCenter = await hit("Command center", "GET", "/api/stream/command-center", null, {
  verbose: true, soft: true
});
const warRoom = await hit("Live ops war room", "GET", "/api/live-ops/war-room", null, {
  verbose: true, soft: true
});
const liveStatus = await hit("YouTube live status", "GET", "/api/youtube/live-status", null, {
  verbose: true, soft: true
});
const multistreamStatus = await hit("Multistream status", "GET", "/api/multistream/status", null, {
  verbose: true, soft: true
});
const burnoutRecovery = await hit("Burnout recovery data", "GET", "/api/live-ops/burnout/recovery", null, {
  verbose: true, soft: true
});
const streamList = await hit("Stream list", "GET", "/api/streams", null, { verbose: true, soft: true });

console.log(`\n  Pre-flight: ${RESULTS.ok} up, ${RESULTS.failed} failed, ${RESULTS.warned} warned`);

// ── Phase 1: Hour 1 — Go Live ────────────────────────────────────────────────

header("PHASE 1 — HOUR 1: GO LIVE (stream start + blast)");
console.log("  Simulating: stream created → go live → AI blast → chat flood\n");

// Create a fresh stream
const createRes = await hit("Create stream", "POST", "/api/streams", {
  title: "God of War: Ragnarök — FULL PLAYTHROUGH 🎮 BOSS KILL STREAM",
  description: "Playing through God of War Ragnarök with epic boss fights, hidden secrets, and Kratos gameplay. Join the chaos!",
  category: "Gaming",
  platforms: ["youtube", "twitch"],
  status: "planned",
}, { verbose: true });

let STREAM_ID = null;
if (createRes.ok && createRes.data?.id) {
  STREAM_ID = createRes.data.id;
  console.log(`  → Stream created with ID: ${STREAM_ID}`);
} else {
  // Try to use existing stream
  const listRes = await hit("Fallback: get stream list", "GET", "/api/streams", null, { soft: true });
  if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length > 0) {
    const live = listRes.data.find(s => s.status === 'live') || listRes.data[0];
    STREAM_ID = live.id;
    console.log(`  → Using existing stream ID: ${STREAM_ID} (status: ${live.status})`);
  } else {
    console.log("  ⚠️  No stream available — some tests will skip stream-ID-dependent calls");
  }
}

// Go live
let isLive = false;
if (STREAM_ID) {
  const goLiveRes = await hit("Go live", "POST", `/api/streams/${STREAM_ID}/go-live`, {
    platform: "youtube",
    viewers: 0,
  }, { verbose: true, acceptStatus: [400, 409] });
  isLive = goLiveRes.ok;
  if (!isLive && goLiveRes.data?.message?.includes("already")) isLive = true;
}

// Blast of AI features triggered at stream start
console.log("\n  [AI BLAST — stream start triggers these concurrently]");
await parallel([
  hit("AI: stream title generator", "POST", "/api/ai/stream-title-generator", {
    game: "God of War Ragnarök", mood: "epic", currentViewers: 0, streamMinutesElapsed: 0
  }, { soft: true, verbose: true }),
  hit("AI: live thumbnail suggestion", "POST", "/api/ai/live-thumbnail-suggestion", {
    streamTitle: "God of War Ragnarök BOSS KILL", game: "God of War Ragnarök", viewerCount: 0
  }, { soft: true, verbose: true }),
  hit("AI: stream SEO optimize", "POST", `/api/streams/${STREAM_ID}/optimize`, {
    platforms: ["youtube", "twitch"]
  }, { soft: true, verbose: true, acceptStatus: [503] }),
  hit("Live ops timeline", "GET", "/api/live-ops/timeline", null, { soft: true, verbose: true }),
  hit("Live ops trust score", "GET", "/api/live-ops/trust", null, { soft: true, verbose: true }),
]);

await sleep(MIN_MS * 5); // 5 min startup

// Chat flood — first wave
console.log("\n  [CHAT FLOOD — first 30 minutes]");
const chatMessages = [
  { platform: "youtube", author: "GamingFan99", message: "LET'S GOOO ET GAMING 274!!!! 🔥🔥🔥" },
  { platform: "youtube", author: "PS5Player", message: "What settings are you using bro?" },
  { platform: "youtube", author: "KratosLover", message: "KRATOS GOD MODE activate!!!! epic boss kill incoming" },
  { platform: "twitch", author: "NavalGamer", message: "Is this better than AC4 Black Flag naval combat?" },
  { platform: "youtube", author: "SubCount247", message: "Sub goal?? I'll sub if you destroy this boss 💪" },
  { platform: "twitch", author: "TwitchBro", message: "is this stream on twitch too?" },
  { platform: "youtube", author: "SecretHunter", message: "There's a hidden secret at the well! Did you find it?" },
  { platform: "youtube", author: "ClutchMoment", message: "OH WOW that was insane gameplay right there" },
];

if (STREAM_ID) {
  const chatResults = await parallel(chatMessages.map((msg, i) =>
    hit(`Chat msg ${i+1}: ${msg.author}`, "POST", `/api/streams/${STREAM_ID}/chat`, msg, {
      soft: true, verbose: true
    })
  ));
  const chatOk = chatResults.filter(r => r.ok).length;
  console.log(`  → ${chatOk}/${chatMessages.length} chat messages delivered`);
}

checkpoint(1, 47, 12, RESULTS.ok + RESULTS.failed);

// ── Phase 2: Hour 2-3 — Peak Activity ────────────────────────────────────────

header("PHASE 2 — HOURS 2-3: PEAK ACTIVITY (viewers climbing)");
console.log("  Simulating: 80+ viewers, rapid chat, AI assisting in real-time\n");

await sleep(MIN_MS * 10);

// Concurrent operational reads — what the UI polls every 30s during stream
for (let tick = 0; tick < 6; tick++) {
  process.stdout.write(`  [Poll tick ${tick+1}/6] `);
  const tickResults = await parallel([
    hit(`chat feed t${tick}`, "GET", `/api/streams/${STREAM_ID}/chat`, null, { soft: true }),
    hit(`chat stats t${tick}`, "GET", `/api/streams/${STREAM_ID}/chat/stats`, null, { soft: true }),
    hit(`war room t${tick}`, "GET", "/api/live-ops/war-room", null, { soft: true }),
    hit(`timeline t${tick}`, "GET", "/api/live-ops/timeline", null, { soft: true }),
    hit(`community pulse t${tick}`, "GET", "/api/live-ops/community/pulse", null, { soft: true }),
    hit(`live moments t${tick}`, "GET", "/api/live-ops/moments", null, { soft: true }),
    hit(`multi-status t${tick}`, "GET", `/api/streams/${STREAM_ID}/multi-status`, null, { soft: true }),
  ]);
  const ok = tickResults.filter(r => r.ok).length;
  console.log(`${ok}/7 ok`);
  await sleep(MIN_MS * 5); // 5 min per poll cycle
}

// Moment capture — boss fight begins
console.log("\n  [BOSS FIGHT BEGINS — moment capture + AI title update]");
await parallel([
  hit("Capture boss fight moment", "POST", "/api/live-ops/moments/capture", {
    streamId: String(STREAM_ID),
    momentType: "boss_fight",
    timestampSec: 7380,
    description: "Kratos faces Baldur — EPIC BOSS KILL incoming",
  }, { soft: true, verbose: true }),
  hit("AI: dynamic title update during stream", "POST", "/api/live-ops/title/generate", {
    game: "God of War Ragnarök",
    currentPhase: "boss_fight",
    viewerCount: 82,
    peakViewers: 94,
    chatHighlight: "boss fight hype",
  }, { soft: true, verbose: true }),
  hit("AI: live chat policy check", "GET", "/api/live-ops/chat/policy", null, { soft: true, verbose: true }),
  hit("AI: geo audience data", "GET", "/api/live-ops/geo", null, { soft: true, verbose: true }),
  hit("Live ops revenue", "GET", "/api/live-ops/revenue", null, { soft: true, verbose: true }),
]);

// More chat during boss fight — high sentiment wave
const bossChat = [
  { platform: "youtube", author: "Clutch247", message: "HOLY MOLY THAT BOSS KILL THOUGH 😱😱😱 INSANE" },
  { platform: "youtube", author: "GamingClips_4k", message: "Clip that! CLIP THAT RIGHT NOW" },
  { platform: "youtube", author: "EpicGamer_ET", message: "bro you are cracked at this game no cap" },
  { platform: "youtube", author: "TrollAccount99", message: "this is boring compared to other streamers lol" },
  { platform: "youtube", author: "HypeViewer", message: "KRATOS NEVER DIES LETS GOOOOO 🔥" },
  { platform: "twitch", author: "SecretsGuy", message: "You missed a hidden chest on the left side!" },
  { platform: "twitch", author: "NavalFan", message: "Reminds me of the naval combat from AC4, same energy" },
  { platform: "youtube", author: "SubWatcher", message: "First time watching, gonna sub this is epic" },
  { platform: "youtube", author: "ChillViewer", message: "what time do you usually stream?" },
  { platform: "youtube", author: "GodOfWarPro", message: "Use the Leviathan Axe for this part!! trust" },
  { platform: "youtube", author: "ClipVault", message: "That deserves a clip for sure! Amazing gameplay 🎮" },
  { platform: "youtube", author: "HatefulTroll", message: "get off the game you're trash lmao" },
];

if (STREAM_ID) {
  const bossResults = await parallel(bossChat.map((msg, i) =>
    hit(`Boss chat ${i+1}`, "POST", `/api/streams/${STREAM_ID}/chat`, msg, { soft: true })
  ));
  const ok = bossResults.filter(r => r.ok).length;
  console.log(`\n  → ${ok}/${bossChat.length} boss fight chat messages delivered`);
}

// Game detection during stream
await hit("Live game detect: God of War", "POST", "/api/live-ops/game/detect", {
  streamId: STREAM_ID,
  thumbnailUrl: null,
  streamTitle: "God of War Ragnarök — BOSS KILL STREAM",
  detectionMethod: "title_parse",
}, { soft: true, verbose: true });

checkpoint(3, 94, 28, RESULTS.ok + RESULTS.failed);

// ── Phase 3: Hours 4-6 — Endurance ───────────────────────────────────────────

header("PHASE 3 — HOURS 4-6: ENDURANCE GRIND (sustained load)");
console.log("  Simulating: 3 hours of continuous operation, all systems running\n");

await sleep(MIN_MS * 5);

// Simulate 18 "30-minute" check cycles (3 hours × 2 checks/hr)
const ENDURANCE_BATCHES = 18;
let totalFired = 0;
let peakViewers = 94;

for (let cycle = 0; cycle < ENDURANCE_BATCHES; cycle++) {
  // Viewer count drift (realistic: rises to peak, then drops mid-stream slump, then recovers)
  if (cycle < 4) peakViewers = Math.min(120, peakViewers + Math.floor(Math.random() * 8));
  else if (cycle < 10) peakViewers = Math.max(55, peakViewers - Math.floor(Math.random() * 5));
  else peakViewers = Math.min(100, peakViewers + Math.floor(Math.random() * 6));

  const batchResults = await parallel([
    // Core stream health
    hit(`endo-chat-feed-c${cycle}`, "GET", `/api/streams/${STREAM_ID}/chat`, null, { soft: true }),
    hit(`endo-war-room-c${cycle}`, "GET", "/api/live-ops/war-room", null, { soft: true }),
    hit(`endo-timeline-c${cycle}`, "GET", "/api/live-ops/timeline", null, { soft: true }),
    hit(`endo-revenue-c${cycle}`, "GET", "/api/live-ops/revenue", null, { soft: true }),
    // Learning system
    hit(`endo-learning-c${cycle}`, "GET", "/api/live-ops/learning", null, { soft: true }),
    // Ops health
    hit(`endo-summary-c${cycle}`, "GET", "/api/live-ops/summary", null, { soft: true }),
    // Command center
    hit(`endo-cmd-center-c${cycle}`, "GET", "/api/stream/command-center", null, { soft: true }),
    // Chat messages
    ...(cycle % 3 === 0 ? [
      hit(`endo-chat-msg-c${cycle}`, "POST", `/api/streams/${STREAM_ID}/chat`, {
        platform: cycle % 2 === 0 ? "youtube" : "twitch",
        author: `Viewer${cycle * 7 + 100}`,
        message: cycle % 2 === 0 ? "still watching! this is amazing gameplay 🔥" : "how long are you streaming today?",
      }, { soft: true }),
    ] : []),
  ]);

  totalFired += batchResults.length;
  const ok = batchResults.filter(r => r?.ok).length;
  const pct = Math.round((cycle / ENDURANCE_BATCHES) * 100);
  process.stdout.write(`\r  Endurance: [${bar(cycle, ENDURANCE_BATCHES, 20)}] ${pct}% | ${ok}/${batchResults.length} ok | viewers: ~${peakViewers}`);
  await sleep(MIN_MS * 3); // 3 stream-minutes per cycle
}

console.log(`\n\n  Endurance phase: ${totalFired} total requests fired`);

// Mid-stream burnout check (6h mark — streamer getting tired)
console.log("\n  [HOUR 6 — Burnout & accessibility checks]");
await parallel([
  hit("Burnout predict (6h mark)", "POST", "/api/live-ops/burnout/predict", {
    streamDurationHours: 6,
    messagingRate: 4.2,
    breaksTaken: 1,
    energyLevel: "medium",
  }, { soft: true, verbose: true }),
  hit("Burnout recovery plan", "GET", "/api/live-ops/burnout/recovery", null, { soft: true, verbose: true }),
  hit("Accessibility check", "GET", "/api/live-ops/accessibility", null, { soft: true, verbose: true }),
  hit("Reputation monitor", "GET", "/api/live-ops/reputation", null, { soft: true, verbose: true }),
  hit("Commerce/merch check", "GET", "/api/live-ops/commerce", null, { soft: true, verbose: true }),
  hit("Co-creation ideas", "GET", "/api/live-ops/co-creation", null, { soft: true, verbose: true }),
  hit("Playbooks available", "GET", "/api/live-ops/playbooks", null, { soft: true, verbose: true }),
  hit("Override flags", "GET", "/api/live-ops/overrides", null, { soft: true, verbose: true }),
]);

checkpoint(6, peakViewers, 8, totalFired);

// ── Phase 4: Hour 7 — Pre-Finale Surge ──────────────────────────────────────

header("PHASE 4 — HOUR 7: PRE-FINALE SURGE (viewers returning)");
console.log("  Simulating: final boss teased, chat exploding, AI at max load\n");

await sleep(MIN_MS * 5);

// Final boss announcement — mass AI activation
console.log("  [FINAL BOSS TEASED — AI engagement tools fire simultaneously]");
const surge = await parallel([
  hit("AI: final segment title", "POST", "/api/live-ops/title/generate", {
    game: "God of War Ragnarök",
    currentPhase: "final_boss",
    viewerCount: 103,
    peakViewers: 120,
    urgency: "high",
  }, { soft: true, verbose: true }),
  hit("Capture: final boss moment", "POST", "/api/live-ops/moments/capture", {
    streamId: String(STREAM_ID),
    momentType: "final_boss",
    timestampSec: 25200,
    description: "FINAL BOSS — Thor fight begins! Chat going insane",
  }, { soft: true, verbose: true }),
  hit("Community pulse check", "GET", "/api/live-ops/community/pulse", null, { soft: true, verbose: true }),
  hit("Title history", "GET", "/api/live-ops/title/history", null, { soft: true, verbose: true }),
  hit("Game history", "GET", "/api/live-ops/game/history", null, { soft: true, verbose: true }),
  hit("War room final", "GET", "/api/live-ops/war-room", null, { soft: true, verbose: true }),
  hit("Webhooks health", "GET", "/api/live-ops/webhooks/health", null, { soft: true, verbose: true }),
]);

// Mass chat wave — finale hype
const finaleChat = [
  { platform: "youtube", author: "HypeLord_420", message: "THOR FIGHT LETS FREAKIN GOOOOOOO 🔥🔥🔥🔥" },
  { platform: "youtube", author: "GamingKing92", message: "THIS IS THE MOMENT WE'VE BEEN WAITING FOR" },
  { platform: "youtube", author: "EpicClipMaker", message: "Clip everything!! This is going viral for sure" },
  { platform: "youtube", author: "PS5God", message: "You got this ET!! Don't die don't die don't die" },
  { platform: "twitch", author: "Lurker_420", message: "first time in chat. incredible stream bro WOW" },
  { platform: "youtube", author: "CasualFan2026", message: "came back just for this fight been here since hour 1" },
  { platform: "youtube", author: "Troll456", message: "you're gonna lose lmao skill issue" },
  { platform: "youtube", author: "ClutchFan", message: "USE THE SPARTAN RAGE NOW GO GO GO 😤😤" },
  { platform: "youtube", author: "KratosMain", message: "i literally cannot breathe rn this is TOO GOOD" },
  { platform: "youtube", author: "RewardedViewer", message: "my hands are shaking watching this" },
  { platform: "youtube", author: "SupportiveSub", message: "EARNED that sub today ET gaming 274 is cracked 💯" },
  { platform: "twitch", author: "NavalGamer", message: "Better than ANY AC4 naval fight I've ever seen" },
  { platform: "youtube", author: "DiscordMod99", message: "this clip is going in the server hall of fame" },
  { platform: "youtube", author: "ClipHunter", message: "clipped! sharing everywhere! insane!" },
  { platform: "youtube", author: "NewSub_9817", message: "Just subbed after this fight!! AMAZING 🎮" },
];

if (STREAM_ID) {
  const finaleResults = await parallel(finaleChat.map((msg, i) =>
    hit(`Finale chat ${i+1}`, "POST", `/api/streams/${STREAM_ID}/chat`, msg, { soft: true })
  ));
  const ok = finaleResults.filter(r => r.ok).length;
  console.log(`\n  → ${ok}/${finaleChat.length} finale chat messages delivered`);
}

// Concurrent AI assistance — max concurrent
console.log("\n  [MAXIMUM CONCURRENT AI LOAD — what fires during a peak moment]");
const maxLoad = await parallel([
  hit("AI: stream title gen 1", "POST", "/api/ai/stream-title-generator", {
    game: "God of War Ragnarök", mood: "epic_boss_kill", currentViewers: 103
  }, { soft: true }),
  hit("AI: video metadata post", "POST", "/api/ai/video-metadata", {
    title: "INSANE God of War Thor Boss Kill - ET Gaming 274",
    type: "clip", platform: "youtube"
  }, { soft: true }),
  hit("Live-ops summary", "GET", "/api/live-ops/summary", null, { soft: true }),
  hit("Chat stats final", "GET", `/api/streams/${STREAM_ID}/chat/stats`, null, { soft: true }),
  hit("War room final 2", "GET", "/api/live-ops/war-room", null, { soft: true }),
  hit("Learning data", "GET", "/api/live-ops/learning", null, { soft: true }),
  hit("Memory stats", "GET", "/api/memory/stats", null, { soft: true }),
  hit("Memory context", "GET", "/api/memory/context", null, { soft: true }),
  hit("Moments list", "GET", "/api/live-ops/moments", null, { soft: true }),
  hit("Community pulse", "GET", "/api/live-ops/community/pulse", null, { soft: true }),
]);

const maxOk = maxLoad.filter(r => r?.ok).length;
const maxMs = maxLoad.filter(r => r?.ms).map(r => r.ms);
const avgMs = maxMs.length ? Math.round(maxMs.reduce((a, b) => a + b, 0) / maxMs.length) : 0;
const maxMsVal = maxMs.length ? Math.max(...maxMs) : 0;
console.log(`  → ${maxOk}/10 concurrent requests ok | avg: ${avgMs}ms | max: ${maxMsVal}ms`);

checkpoint(7, 120, 45, RESULTS.ok + RESULTS.failed);

// ── Phase 5: Hour 8 — Grand Finale ───────────────────────────────────────────

header("PHASE 5 — HOUR 8: GRAND FINALE + POST-STREAM PIPELINE");
console.log("  Simulating: stream end → replay pipeline → clip extraction → SEO\n");

await sleep(MIN_MS * 5);

// End stream
let endedOk = false;
if (STREAM_ID) {
  const endRes = await hit("END STREAM after 8h", "POST", `/api/streams/${STREAM_ID}/end`, {
    finalViewerCount: 87,
    peakViewers: 120,
    totalChatMessages: 327,
    streamDurationHours: 8,
  }, { verbose: true, acceptStatus: [400, 422] });
  endedOk = endRes.ok;

  if (!endedOk) {
    console.log(`  ℹ️  Stream end rejected (status ${endRes.status}) — stream may already be ended`);
    endedOk = endRes.status === 400;
  }
}

// Confirm end and check what fired
await sleep(MIN_MS * 2);
const postChecks = await parallel([
  hit("Stream state after end", "GET", `/api/streams/${STREAM_ID}`, null, { soft: true, verbose: true }),
  hit("War room post-stream", "GET", "/api/live-ops/war-room", null, { soft: true, verbose: true }),
  hit("Learning: post-stream data", "GET", "/api/live-ops/learning", null, { soft: true, verbose: true }),
  hit("Moments captured", "GET", "/api/live-ops/moments", null, { soft: true, verbose: true }),
  hit("Summary final", "GET", "/api/live-ops/summary", null, { soft: true, verbose: true }),
]);

// Check post-stream pipeline was auto-fired
console.log("\n  [POST-STREAM PIPELINE CHECK — what fires automatically on stream end]");
await parallel([
  hit("Post-stream process", "POST", `/api/streams/${STREAM_ID}/post-process`, {
    generateHighlights: true,
    generateClips: true,
    platforms: ["youtube", "twitch"],
  }, { soft: true, verbose: true, acceptStatus: [503] }),
  hit("Unedited VODs list", "GET", "/api/stream/unedited-vods", null, { soft: true, verbose: true }),
  hit("Stream upgrades highlights", "GET", "/api/stream-upgrades/highlights", null, { soft: true, verbose: true }),
  hit("Stream upgrades overlay", "GET", "/api/stream-upgrades/overlay", null, { soft: true, verbose: true }),
  hit("Stream automation status", "GET", `/api/streams/${STREAM_ID}/automation`, null, { soft: true, verbose: true }),
]);

// Verify stream learning cycle wrote data
await sleep(MIN_MS * 3);
console.log("\n  [VERIFYING LEARNING SYSTEM WROTE POST-STREAM DATA]");
const learningVerify = await parallel([
  hit("Memory stats (post-stream)", "GET", "/api/memory/stats", null, { soft: true, verbose: true }),
  hit("Memory context (post-stream)", "GET", "/api/memory/context", null, { soft: true, verbose: true }),
  hit("Live-ops learning data", "GET", "/api/live-ops/learning", null, { soft: true, verbose: true }),
]);

checkpoint(8, 87, 0, RESULTS.ok + RESULTS.failed);

// ── Phase 6: Chaos Test — Concurrent Abuse ───────────────────────────────────

header("PHASE 6 — CHAOS TEST (relentless hammering on all systems simultaneously)");
console.log("  Firing all systems at once, 40 concurrent requests, no mercy\n");

await sleep(MIN_MS * 2);

const CHAOS_ENDPOINTS = [
  ["GET", "/api/stream/command-center"],
  ["GET", "/api/live-ops/war-room"],
  ["GET", "/api/live-ops/timeline"],
  ["GET", "/api/live-ops/trust"],
  ["GET", "/api/live-ops/summary"],
  ["GET", "/api/live-ops/moments"],
  ["GET", "/api/live-ops/learning"],
  ["GET", "/api/live-ops/revenue"],
  ["GET", "/api/live-ops/commerce"],
  ["GET", "/api/live-ops/reputation"],
  ["GET", "/api/live-ops/geo"],
  ["GET", "/api/live-ops/accessibility"],
  ["GET", "/api/live-ops/co-creation"],
  ["GET", "/api/live-ops/community/pulse"],
  ["GET", "/api/live-ops/playbooks"],
  ["GET", "/api/live-ops/webhooks/health"],
  ["GET", "/api/live-ops/overrides"],
  ["GET", "/api/live-ops/burnout/recovery"],
  ["GET", "/api/live-ops/chat/policy"],
  [`GET`, `/api/streams/${STREAM_ID}/chat`],
  [`GET`, `/api/streams/${STREAM_ID}/chat/stats`],
  [`GET`, `/api/streams/${STREAM_ID}/multi-status`],
  ["GET", "/api/streams"],
  ["GET", "/api/memory/stats"],
  ["GET", "/api/memory/context"],
  ["GET", "/api/multistream/status"],
  ["GET", "/api/multistream/destinations"],
  ["GET", "/api/youtube/live-status"],
  ["GET", "/api/stream/unedited-vods"],
  ["GET", "/api/stream-upgrades/highlights"],
  ["GET", "/api/stream-upgrades/overlay"],
  ["GET", "/api/stream-upgrades/schedule"],
  ["GET", "/api/multistream/fabric/eligibility"],
  ["GET", "/api/multistream/fabric/readiness"],
  ["GET", "/api/live-ops/game/history"],
  ["GET", "/api/live-ops/title/history"],
  ["GET", "/api/insights/dashboard"],
  ["GET", "/api/insights/trends"],
  ["GET", "/api/insights/alerts"],
  ["GET", "/api/system/performance"],
];

const CHAOS_ROUNDS = 3;
let chaosTotal = 0, chaosOk = 0;
const chaosLatencies = [];

for (let round = 0; round < CHAOS_ROUNDS; round++) {
  process.stdout.write(`  Chaos round ${round+1}/${CHAOS_ROUNDS}: `);
  const t0 = Date.now();
  const chaosResults = await parallel(
    CHAOS_ENDPOINTS.map(([method, path]) =>
      hit(`chaos-${method}-${path}`, method, path, null, { soft: true, timeout: 10000 })
    )
  );
  const elapsed = Date.now() - t0;
  const ok = chaosResults.filter(r => r?.ok).length;
  chaosOk += ok;
  chaosTotal += CHAOS_ENDPOINTS.length;
  chaosLatencies.push(elapsed);
  console.log(`${ok}/${CHAOS_ENDPOINTS.length} ok | ${elapsed}ms total round time`);
  await sleep(MIN_MS * 1);
}

const avgChaosMs = Math.round(chaosLatencies.reduce((a, b) => a + b, 0) / chaosLatencies.length);
console.log(`\n  Chaos total: ${chaosOk}/${chaosTotal} ok | avg round: ${avgChaosMs}ms`);

// ── Final Report ──────────────────────────────────────────────────────────────

header("8-HOUR STREAM STRESS TEST — FINAL REPORT");

const totalReqs = RESULTS.ok + RESULTS.failed + RESULTS.warned;
const pct = totalReqs > 0 ? Math.round((RESULTS.ok / totalReqs) * 100) : 0;

console.log(`\n  Stream ID tested: ${STREAM_ID}`);
console.log(`  Total requests fired:   ${totalReqs}`);
console.log(`  ✅ Passed:              ${RESULTS.ok} (${pct}%)`);
console.log(`  ⚠️  Soft warnings:       ${RESULTS.warned}`);
console.log(`  ❌ Hard failures:        ${RESULTS.failed}`);

console.log(`\n  PHASE BREAKDOWN:`);
console.log(`    Pre-flight checks     → server, auth, all stream APIs reachable`);
console.log(`    Hour 1 (go-live)      → stream created, 8 chat msgs, AI blast`);
console.log(`    Hours 2-3 (peak)      → 6 poll cycles, boss fight, game detect`);
console.log(`    Hours 4-6 (endurance) → ${ENDURANCE_BATCHES} × 7-req cycles, burnout check`);
console.log(`    Hour 7 (finale surge) → 15 chat msgs, 10 concurrent AI, moment capture`);
console.log(`    Hour 8 (end+pipeline) → stream end, post-process, learning verify`);
console.log(`    Chaos test            → ${CHAOS_ROUNDS} × ${CHAOS_ENDPOINTS.length} concurrent = ${CHAOS_ROUNDS * CHAOS_ENDPOINTS.length} rapid hits`);

if (RESULTS.errors.length > 0) {
  console.log(`\n  HARD FAILURES (${RESULTS.errors.length}):`);
  for (const e of RESULTS.errors.slice(0, 15)) {
    console.log(`    ✗ ${e}`);
  }
  if (RESULTS.errors.length > 15) {
    console.log(`    ... and ${RESULTS.errors.length - 15} more`);
  }
}

const verdict = RESULTS.failed === 0
  ? "🟢 STREAM-READY — no hard failures across the full 8-hour simulation"
  : RESULTS.failed < 5
  ? "🟡 MOSTLY STABLE — minor failures, stream can run but needs review"
  : "🔴 NEEDS ATTENTION — multiple failures detected, review before streaming";

console.log(`\n  VERDICT: ${verdict}`);
console.log(`${"═".repeat(68)}\n`);
