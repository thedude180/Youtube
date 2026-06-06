/**
 * game-detection.ts
 *
 * World-class multi-signal game detection engine.
 * Uses title regex, character/weapon/location signature dictionaries,
 * description text, and tag arrays to detect the correct game with
 * confidence scoring.  Returns null when confidence is insufficient
 * rather than producing a generic fallback.
 *
 * Priority order:
 *   1. High-confidence title regex (direct keyword in title)
 *   2. Character/weapon/location/keyword signature scoring across ALL text sources
 *   3. Cross-validation: if title regex and signature scoring disagree, use higher scorer
 *   4. Return null if top score < MIN_CONFIDENCE (no generic fallback)
 */

export interface GameDetectionResult {
  game: string | null;
  confidence: number;   // 0–100
  signals: string[];    // human-readable list of what matched
}

const MIN_CONFIDENCE = 38;

// ── Signature dictionaries ─────────────────────────────────────────────────────
// Each entry is { characters, weapons, locations, keywords } — all lowercase.
// Scoring: character/weapon +20, location +15, keyword +10, regex title match +35.
// Cap per game at 100.

interface GameSignatures {
  titleRegex: RegExp[];     // title-only patterns (high confidence)
  characters: string[];
  weapons: string[];
  locations: string[];
  keywords: string[];
}

const SIGNATURES: Record<string, GameSignatures> = {
  // ── Assassin's Creed Shadows ────────────────────────────────────────────────
  "Assassin's Creed Shadows": {
    titleRegex: [/assassin.?s creed shadows|ac shadows/i],
    characters: ["naoe", "yasuke", "fujibayashi naoe", "fujibayashi", "mochizuki"],
    weapons: ["shuriken", "grappling hook shinobi", "yumi bow"],
    locations: ["feudal japan", "sengoku", "iga", "osaka castle", "kyoto", "shinobi", "igashima", "azuchi"],
    keywords: ["shadows", "ac shadows", "1579", "sengoku era", "shinobi stealth"],
  },

  // ── Assassin's Creed Mirage ─────────────────────────────────────────────────
  "Assassin's Creed Mirage": {
    titleRegex: [/assassin.?s creed mirage|ac mirage|\bmirage\b(?!.*shadow of)/i],
    characters: ["basim", "basim ibn ishaq", "nehal", "roshan", "ali ibn muhammad", "ibn ishaq"],
    weapons: ["zanj uprising"],
    locations: ["baghdad", "alamut", "karkh", "abbasid", "9th century", "8th century"],
    keywords: ["mirage", "ac mirage", "abbasid caliphate", "hidden ones"],
  },

  // ── Assassin's Creed Valhalla ────────────────────────────────────────────────
  "Assassin's Creed Valhalla": {
    titleRegex: [/assassin.?s creed valhalla|ac valhalla|valhalla/i],
    characters: ["eivor", "sigurd", "randvi", "halfdan", "oswald", "ivarr", "ubba", "odin", "thorvald", "ceolbert"],
    weapons: ["dane axe", "jomsvikings", "raven ability"],
    locations: ["norway", "ravensthorpe", "england", "jotunheim", "asgard", "wessex", "mercia", "northumbria", "fjord"],
    keywords: ["valhalla", "viking", "norse", "anglo-saxon", "ac valhalla", "wolf-kissed", "skald"],
  },

  // ── Assassin's Creed Odyssey ─────────────────────────────────────────────────
  "Assassin's Creed Odyssey": {
    titleRegex: [/assassin.?s creed odyssey|ac odyssey|odyssey/i],
    characters: ["kassandra", "alexios", "brasidas", "elpidios", "nikolaos", "deimos", "myrinne", "barnabas", "herodotos", "alkibiades", "kleon"],
    weapons: ["spear of leonidas", "broken spear", "eagle bearer"],
    locations: ["ancient greece", "sparta", "athens", "athens agora", "peloponnese", "greece 431", "kephallonia", "makedonia"],
    keywords: ["odyssey", "misthios", "cult of kosmos", "spartan", "athenian", "ac odyssey"],
  },

  // ── Assassin's Creed Origins ─────────────────────────────────────────────────
  "Assassin's Creed Origins": {
    titleRegex: [/assassin.?s creed origins|ac origins/i],
    characters: ["bayek", "aya", "ptolemy", "cleopatra", "julius caesar", "khemu", "amunet", "shadya", "phylakes"],
    weapons: ["predator bow", "scepter of ay"],
    locations: ["egypt", "giza", "memphis", "siwa", "cyrene", "ptolemaic", "sinai", "faiyum"],
    keywords: ["origins", "proto-assassin", "hidden ones origin", "ancient egypt", "medjay", "ac origins"],
  },

  // ── Assassin's Creed Syndicate ───────────────────────────────────────────────
  "Assassin's Creed Syndicate": {
    titleRegex: [/assassin.?s creed syndicate|ac syndicate/i],
    characters: ["jacob frye", "evie frye", "starrick", "crawford starrick", "henry green", "darwin", "dickens", "florence nightingale", "frye twins", "frye"],
    weapons: ["kukri knife", "rope launcher"],
    locations: ["london", "whitechapel", "lambeth", "southwark", "thames", "victorian london", "tower of london", "buckingham"],
    keywords: ["syndicate", "rooks gang", "templars", "victorian era", "1868", "ac syndicate"],
  },

  // ── Assassin's Creed Unity ───────────────────────────────────────────────────
  "Assassin's Creed Unity": {
    titleRegex: [/assassin.?s creed unity|ac unity/i],
    characters: ["arno dorian", "arno", "élise de la serre", "elise", "napoleon", "robespierre", "pierre bellec", "mirabeau"],
    weapons: ["phantom blade", "french pistol"],
    locations: ["paris", "notre dame", "versailles", "french revolution", "bastille", "palais royal", "montmartre"],
    keywords: ["unity", "french revolution", "1789", "brotherhood paris", "ac unity"],
  },

  // ── Assassin's Creed Rogue ───────────────────────────────────────────────────
  "Assassin's Creed Rogue": {
    titleRegex: [/assassin.?s creed rogue|ac rogue/i],
    characters: ["shay cormac", "shay", "haytham kenway", "achilles", "liam o'brien"],
    weapons: ["air rifle", "grenade launcher ship"],
    locations: ["seven years war", "north atlantic", "river valley", "new york", "lisbon earthquake"],
    keywords: ["rogue", "templar assassin", "shay", "ac rogue", "seven years"],
  },

  // ── Assassin's Creed Revelations ────────────────────────────────────────────
  "Assassin's Creed Revelations": {
    titleRegex: [/assassin.?s creed revelations|ac revelations/i],
    characters: ["ezio", "yusuf tazim", "suleiman", "sofia sartor", "altair archive", "tarik barleti"],
    weapons: ["hookblade", "bomb crafting", "crossbow revelations"],
    locations: ["constantinople", "masyaf", "cappadocia", "istanbul", "ottoman empire", "1511"],
    keywords: ["revelations", "ottoman", "hookblade", "ac revelations"],
  },

  // ── Assassin's Creed Brotherhood ────────────────────────────────────────────
  "Assassin's Creed Brotherhood": {
    titleRegex: [/assassin.?s creed brotherhood|ac brotherhood/i],
    characters: ["ezio", "cesare borgia", "lucrezia borgia", "claudia", "machiavelli", "bartolomeo d'alviano", "la volpe"],
    weapons: ["crossbow", "recruiting assassins", "mercenaries rome"],
    locations: ["rome", "papal states", "colosseum", "castel sant'angelo", "vatican", "tiber island"],
    keywords: ["brotherhood", "roman assassins", "borgia tower", "ac brotherhood"],
  },

  // ── Assassin's Creed IV: Black Flag ─────────────────────────────────────────
  "Assassin's Creed IV: Black Flag": {
    titleRegex: [/assassin.?s creed iv|black flag|ac4\b|ac iv\b/i],
    characters: ["edward kenway", "blackbeard", "charles vane", "anne bonny", "mary read", "bartholomew roberts", "adéwalé", "adewale", "calico jack", "hornigold"],
    weapons: ["jackdaw", "naval broadside", "swivel gun ship"],
    locations: ["caribbean", "nassau", "havana", "kingston", "great inagua", "long bay", "rum cay", "florida keys"],
    keywords: ["black flag", "pirate", "golden age of piracy", "1715", "ac4", "naval combat"],
  },

  // ── Assassin's Creed Liberation ─────────────────────────────────────────────
  "Assassin's Creed Liberation": {
    titleRegex: [/assassin.?s creed liberation|ac liberation|liberation/i],
    characters: ["aveline de grandpré", "aveline", "gérald blanc", "gerald blanc", "commander baptiste", "george davidson"],
    weapons: ["whip", "blowpipe"],
    locations: ["new orleans", "bayou", "chichen itza", "slave trade louisiana"],
    keywords: ["liberation", "free slave", "1765", "new orleans bayou", "ac liberation"],
  },

  // ── Assassin's Creed 3 ───────────────────────────────────────────────────────
  "Assassin's Creed 3": {
    titleRegex: [/assassin.?s creed (3|iii)\b|ac3\b|ac iii\b/i],
    characters: ["connor", "ratonhnhaketon", "haytham kenway", "charles lee", "ziio", "achilles davenport", "samuel adams", "george washington ac", "benjamin church", "william johnson ac"],
    weapons: ["tomahawk", "rope dart", "naval fleet ac3"],
    locations: ["boston", "new york 1770", "frontier", "homestead", "colonial america", "valley forge", "bunker hill", "boston tea party", "charles town"],
    keywords: ["american revolution", "mohawk", "revolutionary war", "colonial", "1775", "ac3", "patriots", "loyalists"],
  },

  // ── Assassin's Creed 2 ───────────────────────────────────────────────────────
  "Assassin's Creed 2": {
    titleRegex: [/assassin.?s creed (2|ii)\b(?! brotherhood| revelations)|ac2\b|ac ii\b/i],
    characters: ["ezio auditore", "ezio", "rodrigo borgia", "caterina sforza", "leonardo da vinci", "cristina vespucci", "federico", "claudia"],
    weapons: ["hidden pistol", "poison blade", "dual hidden blades"],
    locations: ["florence", "venice", "forli", "monteriggioni", "san gimignano", "venice carnival", "1476 italy"],
    keywords: ["ac2", "renaissance italy", "pazzi conspiracy", "monteriggioni"],
  },

  // ── Assassin's Creed 1 ───────────────────────────────────────────────────────
  "Assassin's Creed": {
    titleRegex: [], // Only matched if no more specific AC title matches first
    characters: ["altair", "altaïr ibn la ahad", "al mualim", "malik al sayf", "robert de sablé", "maria thorpe"],
    weapons: ["short blade", "throwing knives ac1"],
    locations: ["masyaf ac1", "jerusalem", "damascus", "acre", "holy land", "crusades"],
    keywords: ["altair", "third crusade", "1191", "holy land"],
  },

  // ── Battlefield 2042 ─────────────────────────────────────────────────────────
  "Battlefield 2042": {
    titleRegex: [/battlefield\s*2042|bf\s*2042/i],
    characters: [
      "sundance", "irish", "falck", "angel", "mackay", "zara", "boris", "rao",
      "crawford", "paik", "dozer", "specialist", "emma rosier", "webster james",
      "ji-soo paik", "pyotr guskovsky",
    ],
    weapons: [
      "sfar-m gl", "dm7", "ntw-50", "pp-29", "lcmg", "pkp-bp", "m5a3",
      "av-4", "swr", "bsvm", "v-40 mini", "c5 explosive", "xm8", "gbmm",
      "gol sniper", "rst v2", "bfbc mortar", "wingsuit", "grapple hook bf",
    ],
    locations: [
      "hourglass", "kaleidoscope", "renewal", "discarded", "manifest", "orbital",
      "exposure", "breaking point", "flashpoint", "stranded", "redacted", "arica harbor 2042",
    ],
    keywords: [
      "bf2042", "hazard zone", "all-out warfare", "specialist class", "conquest 2042",
      "breakthrough 2042", "portal battlefield", "october 2042",
    ],
  },

  // ── Battlefield 6 ────────────────────────────────────────────────────────────
  "Battlefield 6": {
    titleRegex: [/battlefield\s*6|bf\s*6\b/i],
    characters: [],   // BF6 characters unknown at time of writing — populate when released
    weapons: [],
    locations: [],
    keywords: ["bf6", "battlefield 6", "battlefield6"],
  },

  // ── Battlefield V ────────────────────────────────────────────────────────────
  "Battlefield V": {
    titleRegex: [/battlefield\s*v\b|battlefield\s*5\b|bfv\b|bf\s*5\b/i],
    characters: ["britt sisseck", "athos ross"],
    weapons: ["stg 44", "kar98k bf5", "piat"],
    locations: ["rotterdam", "narvik", "al sundan", "hamada desert", "pacific 1942 bfv", "twisted steel"],
    keywords: ["bfv", "world war 2 battlefield", "bfv firestorm", "ttk bfv"],
  },

  // ── Battlefield 4 ────────────────────────────────────────────────────────────
  "Battlefield 4": {
    titleRegex: [/battlefield\s*4\b|bf4\b/i],
    characters: ["daniel recker", "irish bf4", "hannah bf4", "dunn"],
    weapons: [],
    locations: ["golmud railway", "dawnbreaker", "shanghai bf4", "operation locker bf4"],
    keywords: ["bf4", "levolution", "commander mode bf4"],
  },

  // ── Middle-earth: Shadow of War ──────────────────────────────────────────────
  "Middle-earth: Shadow of War": {
    titleRegex: [/shadow of war|nemesis phase/i],
    characters: ["talion", "celebrimbor", "shadow of war", "bruz", "shelob", "carnán"],
    weapons: ["ring of power", "wraith power"],
    locations: ["mordor", "gorgoroth", "cirith ungol", "minas morgul", "seregost"],
    keywords: ["shadow of war", "nemesis system", "orc branding", "uruk", "dark lord"],
  },

  // ── Middle-earth: Shadow of Mordor ──────────────────────────────────────────
  "Middle-earth: Shadow of Mordor": {
    titleRegex: [/shadow of mordor/i],
    characters: ["talion", "celebrimbor", "sauron", "ratbag"],
    weapons: [],
    locations: ["mordor", "udûn", "the sea of núrnen"],
    keywords: ["shadow of mordor", "nemesis system shadow", "orc army"],
  },

  // ── Dragon Age: The Veilguard ─────────────────────────────────────────────────
  "Dragon Age: The Veilguard": {
    titleRegex: [/dragon age|veilguard/i],
    characters: ["rook", "lucanis", "neve", "bellara", "harding", "emmrich", "taash", "solas", "varric"],
    weapons: ["lyrium", "blight"],
    locations: ["tevinter", "minrathous", "treviso", "arlathan"],
    keywords: ["dragon age", "veilguard", "tevinter imperium", "the veil", "grey wardens"],
  },

  // ── God of War ───────────────────────────────────────────────────────────────
  "God of War": {
    titleRegex: [/god of war/i],
    characters: ["kratos", "atreus", "freya", "baldur", "zeus", "ares", "thor", "odin gow", "mimir"],
    weapons: ["leviathan axe", "blades of chaos", "guardian shield"],
    locations: ["midgard", "alfheim", "helheim", "niflheim", "muspelheim", "asgard gow"],
    keywords: ["god of war", "greek mythology", "norse mythology", "spartan rage", "kratos"],
  },

  // ── Ratchet & Clank ──────────────────────────────────────────────────────────
  "Ratchet & Clank": {
    titleRegex: [/ratchet|rift apart/i],
    characters: ["ratchet", "clank", "rivet", "emperor nefarious"],
    weapons: ["groovitron", "ryno", "buzzblades", "mr. funghi"],
    locations: ["savali", "nefarious city", "corson v", "sargasso"],
    keywords: ["ratchet and clank", "rift apart", "lombax", "dimensionator"],
  },

  // ── Warhammer 40,000: Space Marine 2 ─────────────────────────────────────────
  "Warhammer 40,000: Space Marine 2": {
    titleRegex: [/space marine\s*2?|warhammer.*space marine/i],
    characters: ["titus", "demetrian titus", "chairon"],
    weapons: ["bolter", "chainsword", "thunder hammer"],
    locations: ["tyranid swarm", "ultramarine", "for the emperor"],
    keywords: ["space marine", "tyranids", "40k", "warhammer", "chaos", "ultramarines"],
  },
};

// ── Scoring helpers ────────────────────────────────────────────────────────────

function scoreSignatures(corpus: string, sigs: GameSignatures): { score: number; matched: string[] } {
  const c = corpus.toLowerCase();
  const matched: string[] = [];
  let score = 0;

  for (const ch of sigs.characters) {
    if (c.includes(ch.toLowerCase())) {
      score += 20;
      matched.push(`character:${ch}`);
    }
  }
  for (const w of sigs.weapons) {
    if (c.includes(w.toLowerCase())) {
      score += 20;
      matched.push(`weapon:${w}`);
    }
  }
  for (const loc of sigs.locations) {
    if (c.includes(loc.toLowerCase())) {
      score += 15;
      matched.push(`location:${loc}`);
    }
  }
  for (const kw of sigs.keywords) {
    if (c.includes(kw.toLowerCase())) {
      score += 10;
      matched.push(`keyword:${kw}`);
    }
  }

  return { score: Math.min(score, 80), matched };
}

// ── Primary export ─────────────────────────────────────────────────────────────

/**
 * Detect the game shown in a clip using every available text signal.
 *
 * @param title       Video title (required)
 * @param description Video description (optional, improves accuracy)
 * @param tags        Array of YouTube tags (optional, improves accuracy)
 * @param minConfidence Override the default minimum confidence threshold (default 38)
 * @returns GameDetectionResult — game is null when confidence is insufficient
 */
export function detectGame(
  title: string,
  description?: string | null,
  tags?: string[] | null,
  minConfidence = MIN_CONFIDENCE,
): GameDetectionResult {
  const corpus = [title, description ?? "", ...(tags ?? [])].join(" ");

  const scores: Record<string, { score: number; signals: string[] }> = {};

  for (const [game, sigs] of Object.entries(SIGNATURES)) {
    const { score: sigScore, matched } = scoreSignatures(corpus, sigs);

    // Check title regex patterns (title-only, high confidence)
    let titleBonus = 0;
    const titleSignals: string[] = [];
    for (const re of sigs.titleRegex) {
      if (re.test(title)) {
        titleBonus = 35;
        titleSignals.push(`title-regex:${re.source.slice(0, 40)}`);
        break;
      }
    }

    // Also check description + tags for regex patterns (lower bonus)
    let descBonus = 0;
    const descSignals: string[] = [];
    if (titleBonus === 0) {
      for (const re of sigs.titleRegex) {
        if ((description && re.test(description)) || tags?.some(t => re.test(t))) {
          descBonus = 15;
          descSignals.push(`desc/tag-regex:${re.source.slice(0, 40)}`);
          break;
        }
      }
    }

    const total = Math.min(100, sigScore + titleBonus + descBonus);
    if (total > 0) {
      scores[game] = { score: total, signals: [...titleSignals, ...descSignals, ...matched] };
    }
  }

  // ── Pick the winner ──────────────────────────────────────────────────────────
  let topGame: string | null = null;
  let topScore = 0;
  let topSignals: string[] = [];

  for (const [game, { score, signals }] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topGame = game;
      topSignals = signals;
    }
  }

  // ── Cross-signal conflict detection ─────────────────────────────────────────
  // If the title says "Battlefield 6" but signature signals strongly indicate
  // "Battlefield 2042" (e.g. Sundance, SFAR-M GL), prefer BF2042.
  const bf6Score = scores["Battlefield 6"]?.score ?? 0;
  const bf2042Score = scores["Battlefield 2042"]?.score ?? 0;
  if (
    topGame === "Battlefield 6" &&
    bf6Score < bf2042Score + 15 &&
    (scores["Battlefield 2042"]?.signals ?? []).some(s =>
      s.startsWith("character:") || s.startsWith("weapon:")
    )
  ) {
    topGame = "Battlefield 2042";
    topScore = bf2042Score;
    topSignals = scores["Battlefield 2042"]?.signals ?? [];
  }

  if (topScore < minConfidence || !topGame) {
    return { game: null, confidence: topScore, signals: topSignals };
  }

  return { game: topGame, confidence: Math.min(100, topScore), signals: topSignals };
}

/**
 * Convenience wrapper used during back catalog import and clip generation.
 * Returns the game name string or null.
 */
export function extractGameForBackCatalog(
  title: string,
  description?: string | null,
  tags?: string[] | null,
): string | null {
  return detectGame(title, description, tags).game;
}
