import { getOpenAIClient } from "./lib/openai";
import { getCreatorStyleContext, getLearningContext, buildHumanizationPrompt } from "./creator-intelligence";
import { detectGameFromLearned } from "./services/web-game-lookup";
import { tokenBudget, sanitizeForPrompt, sanitizeObjectForPrompt } from "./lib/ai-attack-shield";

import { createLogger } from "./lib/logger";

const logger = createLogger("ai-engine");
const openai = getOpenAIClient();

export type ContentNiche = 'gaming' | 'cooking' | 'tech' | 'fitness' | 'music' | 'comedy' | 'education' | 'vlogging' | 'beauty' | 'travel' | 'finance' | 'crafts' | 'automotive' | 'sports' | 'news' | 'science' | 'art' | 'photography' | 'pets' | 'asmr' | 'reaction' | 'general';

export interface ContentContext {
  niche: ContentNiche;
  subNiche: string | null;
  isGaming: boolean;
  gameName: string | null;
  topicName: string | null;
  brandKeywords: string[];
  nicheTerminology: string[];
  audienceType: string;
  contentStyle: string;
}

const NICHE_SIGNALS: Record<ContentNiche, string[]> = {
  gaming: ['gameplay', 'playthrough', 'walkthrough', 'speedrun', "let's play", 'gaming', 'ranked', 'competitive', 'multiplayer', 'co-op', 'boss fight', 'raid', 'pvp', 'pve', 'esports', 'tournament', 'highlights', 'montage', 'clutch', 'victory royale', 'battle royale', 'fps', 'mmorpg', 'rpg'],
  cooking: ['recipe', 'cooking', 'baking', 'meal prep', 'kitchen', 'ingredient', 'chef', 'food', 'cuisine', 'dinner', 'lunch', 'breakfast', 'dessert', 'restaurant', 'mukbang', 'food review', 'taste test'],
  tech: ['review', 'unboxing', 'tech', 'gadget', 'smartphone', 'laptop', 'iphone', 'android', 'software', 'hardware', 'setup', 'programming', 'coding', 'developer', 'ai', 'machine learning', 'apple', 'samsung', 'pc build'],
  fitness: ['workout', 'fitness', 'gym', 'exercise', 'training', 'muscle', 'bodybuilding', 'cardio', 'yoga', 'crossfit', 'hiit', 'gains', 'protein', 'diet', 'weight loss', 'transformation', 'calisthenics'],
  music: ['music', 'song', 'guitar', 'piano', 'drums', 'singing', 'vocal', 'cover', 'remix', 'beat', 'producer', 'album', 'concert', 'freestyle', 'rap', 'hip hop', 'rock', 'pop', 'jazz', 'electronic'],
  comedy: ['comedy', 'funny', 'skit', 'prank', 'joke', 'standup', 'stand-up', 'parody', 'satire', 'humor', 'roast', 'meme', 'blooper'],
  education: ['tutorial', 'how to', 'learn', 'course', 'lesson', 'explain', 'education', 'study', 'lecture', 'class', 'teacher', 'student', 'academic', 'guide', 'tips and tricks'],
  vlogging: ['vlog', 'day in my life', 'daily vlog', 'grwm', 'get ready with me', 'routine', 'storytime', 'life update', 'moving', 'apartment tour', 'room tour'],
  beauty: ['makeup', 'skincare', 'beauty', 'cosmetics', 'tutorial', 'haul', 'foundation', 'lipstick', 'hair', 'nails', 'fashion', 'outfit', 'style', 'grwm'],
  travel: ['travel', 'vacation', 'trip', 'flight', 'hotel', 'destination', 'backpacking', 'adventure', 'explore', 'country', 'city guide', 'travel vlog'],
  finance: ['investing', 'stock', 'crypto', 'money', 'finance', 'budget', 'passive income', 'real estate', 'trading', 'retirement', 'wealth', 'side hustle', 'entrepreneur'],
  crafts: ['diy', 'craft', 'handmade', 'woodworking', 'sewing', 'knitting', 'crochet', 'pottery', 'resin', 'painting', 'renovation', 'home improvement'],
  automotive: ['car', 'automotive', 'vehicle', 'engine', 'horsepower', 'drift', 'race', 'modification', 'detailing', 'mechanic', 'motorcycle', 'truck', 'supercar'],
  sports: ['nfl', 'nba', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'golf', 'mma', 'ufc', 'boxing', 'wrestling', 'highlights', 'analysis', 'draft'],
  news: ['news', 'breaking', 'update', 'report', 'analysis', 'politics', 'current events', 'commentary', 'opinion', 'debate'],
  science: ['science', 'experiment', 'physics', 'chemistry', 'biology', 'space', 'nasa', 'astronomy', 'research', 'discovery', 'evolution'],
  art: ['art', 'drawing', 'illustration', 'digital art', 'animation', 'sketch', 'painting', 'watercolor', 'procreate', 'photoshop', 'design', 'graphic design'],
  photography: ['photography', 'photo', 'camera', 'lens', 'lightroom', 'portrait', 'landscape', 'street photography', 'editing', 'composition'],
  pets: ['dog', 'cat', 'puppy', 'kitten', 'pet', 'animal', 'rescue', 'vet', 'training', 'aquarium', 'fish', 'reptile', 'bird'],
  asmr: ['asmr', 'triggers', 'tingles', 'relaxing', 'sleep', 'whispering', 'tapping', 'scratching', 'roleplay asmr'],
  reaction: ['reaction', 'reacting', 'react', 'first time watching', 'responding to', 'commentary'],
  general: [],
};

const NICHE_CONFIG: Record<ContentNiche, { audienceType: string; contentStyle: string; terminology: string[]; thumbnailStyle: string; seoFocus: string }> = {
  gaming: { audienceType: 'gamers and gaming enthusiasts', contentStyle: 'high-energy, competitive, entertainment-focused', terminology: ['clutch', 'meta', 'nerf', 'buff', 'GG', 'carry', 'sweaty', 'cracked', 'goated'], thumbnailStyle: 'high-energy compositions, in-game action shots, bold contrasting colors, dramatic moments or reactions', seoFocus: 'game-specific long-tail keywords, game version/season info, trending community topics, gaming hashtags' },
  cooking: { audienceType: 'home cooks and food enthusiasts', contentStyle: 'warm, inviting, step-by-step instructional', terminology: ['al dente', 'sear', 'fold', 'rest', 'season to taste', 'mise en place'], thumbnailStyle: 'appetizing close-up food shots, vibrant colors, steam/texture visible, clean bright lighting', seoFocus: 'recipe name keywords, ingredient lists, cuisine type, dietary preferences (vegan, keto, etc.), cooking method' },
  tech: { audienceType: 'tech enthusiasts and early adopters', contentStyle: 'informative, analytical, product-focused', terminology: ['specs', 'benchmark', 'upgrade', 'ecosystem', 'teardown', 'hands-on'], thumbnailStyle: 'clean product shots, comparison layouts, spec callouts, before/after, tech-blue color schemes', seoFocus: 'product name + review/unboxing, vs comparisons, year-specific keywords, spec-based searches' },
  fitness: { audienceType: 'fitness enthusiasts and people seeking transformation', contentStyle: 'motivational, instructional, results-driven', terminology: ['reps', 'sets', 'PR', 'gains', 'bulk', 'cut', 'macros', 'form check'], thumbnailStyle: 'before/after transformations, action poses, bold text overlays, motivational imagery', seoFocus: 'exercise name, muscle group, routine type, transformation keywords, beginner/advanced level' },
  music: { audienceType: 'music lovers, musicians, and aspiring artists', contentStyle: 'creative, expressive, performance-oriented', terminology: ['riff', 'chord', 'tempo', 'key', 'verse', 'chorus', 'bridge', 'drop'], thumbnailStyle: 'performance shots, instrument close-ups, waveform visuals, concert lighting aesthetic', seoFocus: 'song name, artist, genre, instrument, tutorial/cover/original, music theory terms' },
  comedy: { audienceType: 'entertainment seekers looking for laughs', contentStyle: 'humorous, relatable, personality-driven', terminology: ['bit', 'punchline', 'callback', 'deadpan', 'improv'], thumbnailStyle: 'exaggerated facial expressions, funny freeze-frames, meme-style text, bright colors', seoFocus: 'comedy + topic, funny + situation, relatable content keywords, trending meme references' },
  education: { audienceType: 'learners, students, and curious minds', contentStyle: 'clear, structured, authoritative yet accessible', terminology: ['explained', 'breakdown', 'step-by-step', 'beginner-friendly', 'deep dive'], thumbnailStyle: 'clean diagrams, whiteboard style, numbered steps, professional yet approachable', seoFocus: 'how to, tutorial, explained, beginner guide, topic + for beginners, step by step' },
  vlogging: { audienceType: 'lifestyle content consumers seeking connection', contentStyle: 'personal, authentic, diary-like storytelling', terminology: ['grwm', 'ootd', 'haul', 'storytime', 'life update'], thumbnailStyle: 'candid personal shots, lifestyle aesthetic, warm tones, relatable expressions', seoFocus: 'day in my life, routine, storytime, life update, personal experience keywords' },
  beauty: { audienceType: 'beauty enthusiasts and fashion followers', contentStyle: 'aspirational, tutorial-based, trend-focused', terminology: ['glam', 'beat face', 'swatch', 'holy grail', 'dupe', 'shade match'], thumbnailStyle: 'glamorous close-ups, before/after, product flat lays, clean aesthetic, pastel or bold accents', seoFocus: 'product name + review, tutorial type, skin type, trend name, dupe/alternative keywords' },
  travel: { audienceType: 'travelers and adventure seekers', contentStyle: 'cinematic, inspirational, informative', terminology: ['itinerary', 'hidden gem', 'must-visit', 'budget travel', 'off the beaten path'], thumbnailStyle: 'stunning landscape/cityscape shots, vibrant colors, wanderlust-inducing imagery, location text overlay', seoFocus: 'destination name, travel guide, things to do in, budget tips, best time to visit' },
  finance: { audienceType: 'investors, entrepreneurs, and financially curious', contentStyle: 'authoritative, data-driven, actionable', terminology: ['ROI', 'compound interest', 'portfolio', 'bull/bear market', 'diversify', 'passive income'], thumbnailStyle: 'charts/graphs, money imagery, professional headshots, green/gold accents, numbers callouts', seoFocus: 'stock name, investing strategy, money tips, passive income, financial literacy terms' },
  crafts: { audienceType: 'DIY enthusiasts and makers', contentStyle: 'hands-on, process-focused, satisfying', terminology: ['DIY', 'handmade', 'upcycle', 'project', 'makeover', 'transformation'], thumbnailStyle: 'before/after transformations, process shots, satisfying results, warm workshop lighting', seoFocus: 'DIY + project type, how to make, home improvement, craft type, material name' },
  automotive: { audienceType: 'car enthusiasts and gearheads', contentStyle: 'passionate, detailed, performance-focused', terminology: ['horsepower', 'torque', 'mod', 'build', 'dyno', 'exhaust note', 'spec'], thumbnailStyle: 'dramatic car angles, action shots, before/after mods, spec callouts, motorsport aesthetic', seoFocus: 'car make/model, modification type, vs comparison, review, build progress' },
  sports: { audienceType: 'sports fans and analysts', contentStyle: 'analytical, passionate, highlight-driven', terminology: ['highlights', 'breakdown', 'analysis', 'draft pick', 'trade', 'clutch moment'], thumbnailStyle: 'action shots, player close-ups, score graphics, team colors, dramatic moments', seoFocus: 'team/player name, game highlights, analysis, predictions, season/week specific' },
  news: { audienceType: 'informed citizens and news followers', contentStyle: 'timely, factual, commentary-driven', terminology: ['breaking', 'developing', 'analysis', 'report', 'exclusive'], thumbnailStyle: 'newsroom aesthetic, text-heavy headlines, urgent red accents, professional headshots', seoFocus: 'topic + today/2026, breaking news, latest update, analysis, explained' },
  science: { audienceType: 'science enthusiasts and curious learners', contentStyle: 'fascinating, educational, evidence-based', terminology: ['hypothesis', 'experiment', 'data', 'peer-reviewed', 'breakthrough'], thumbnailStyle: 'stunning visuals (space, microscopy), clean infographics, "mind-blown" expressions, wonder-inducing', seoFocus: 'topic + explained, how does X work, science behind, new discovery, experiment' },
  art: { audienceType: 'artists and creative community', contentStyle: 'creative, process-focused, inspirational', terminology: ['composition', 'palette', 'technique', 'commission', 'timelapse', 'WIP'], thumbnailStyle: 'finished artwork showcase, process comparison, vibrant colors, artist at work', seoFocus: 'art style, medium (digital/traditional), character/subject, speedpaint, tutorial' },
  photography: { audienceType: 'photographers and visual storytellers', contentStyle: 'visual, technical, gear-focused', terminology: ['aperture', 'ISO', 'focal length', 'golden hour', 'bokeh', 'composition'], thumbnailStyle: 'stunning photo examples, before/after edits, gear shots, technical overlays', seoFocus: 'camera/lens model, photography type, editing technique, tips for beginners' },
  pets: { audienceType: 'pet owners and animal lovers', contentStyle: 'heartwarming, cute, informative', terminology: ['rescue', 'adoption', 'training', 'breed', 'vet visit', 'zoomies'], thumbnailStyle: 'adorable animal close-ups, funny pet expressions, heartwarming moments, bright cheerful colors', seoFocus: 'pet breed/species, training tips, pet care, funny animals, rescue stories' },
  asmr: { audienceType: 'relaxation and sleep seekers', contentStyle: 'calming, intimate, sensory-focused', terminology: ['triggers', 'tingles', 'tapping', 'whispering', 'no talking', 'sleep'], thumbnailStyle: 'close-up trigger objects, soft lighting, pastel colors, cozy aesthetic, ear-to-ear imagery', seoFocus: 'ASMR + trigger type, sleep ASMR, relaxing, no talking, specific trigger keywords' },
  reaction: { audienceType: 'entertainment seekers who enjoy shared experiences', contentStyle: 'expressive, conversational, personality-driven', terminology: ['first time', 'reacting to', 'commentary', 'breakdown', 'my thoughts'], thumbnailStyle: 'split-screen with source material, exaggerated expressions, colorful borders, reaction faces', seoFocus: 'reaction + source content name, first time watching, responding to, commentary on' },
  general: { audienceType: 'general audience', contentStyle: 'versatile and engaging', terminology: [], thumbnailStyle: 'clear subject focus, readable text, high contrast, professional composition', seoFocus: 'topic-specific keywords, trending terms, how-to and guide keywords' },
};

const KNOWN_GAMES: Record<string, string[]> = {
  'Fortnite': ['fortnite', 'battle royale fortnite', 'fortnite chapter'],
  'Call of Duty': ['call of duty', 'cod', 'warzone', 'modern warfare', 'black ops', 'mw3', 'mw2'],
  'Minecraft': ['minecraft', 'mc server', 'survival minecraft'],
  'Apex Legends': ['apex legends', 'apex'],
  'Valorant': ['valorant', 'valo'],
  'League of Legends': ['league of legends', 'lol ranked', 'league'],
  'GTA V': ['gta v', 'gta 5', 'gta online', 'grand theft auto v'],
  'GTA VI': ['gta vi', 'gta 6', 'grand theft auto vi'],
  'GTA': ['gta', 'grand theft auto'],
  'Elden Ring': ['elden ring', 'lands between'],
  "Baldur's Gate 3": ["baldur's gate", 'bg3'],
  'Helldivers 2': ['helldivers', 'helldivers 2'],
  'Counter-Strike 2': ['counter-strike', 'cs2', 'csgo', 'cs:go'],
  'Overwatch 2': ['overwatch', 'ow2'],
  'Rocket League': ['rocket league'],
  'Destiny 2': ['destiny 2', 'destiny'],
  'FIFA': ['fifa', 'ea fc', 'ea sports fc'],
  'NBA 2K': ['nba 2k', '2k25', '2k24', '2k26'],
  'Madden': ['madden'],
  'Spider-Man 2': ['spider-man 2', 'spiderman 2', 'spider-man miles', 'spiderman miles'],
  'God of War Ragnarok': ['god of war ragnarok', 'god of war ragnarök'],
  'God of War': ['god of war'],
  'Zelda': ['zelda', 'tears of the kingdom', 'breath of the wild', 'totk', 'botw'],
  'Palworld': ['palworld'],
  'Roblox': ['roblox'],
  'Diablo IV': ['diablo iv', 'diablo 4'],
  'Final Fantasy XVI': ['final fantasy xvi', 'final fantasy 16', 'ff16', 'ffxvi'],
  'Final Fantasy VII Rebirth': ['ff7 rebirth', 'ffvii rebirth', 'final fantasy vii rebirth', 'final fantasy 7 rebirth'],
  'Final Fantasy XIV': ['ffxiv', 'ff14', 'final fantasy xiv', 'final fantasy 14'],
  'Final Fantasy': ['final fantasy', 'ff7'],
  'Pokemon': ['pokemon', 'pokémon'],
  'Battlefield 6': ['battlefield 6', 'bf6'],
  'Battlefield 2042': ['battlefield 2042', 'bf2042'],
  'Battlefield V': ['battlefield v', 'bf5', 'bfv'],
  'Battlefield': ['battlefield'],
  'Horizon Forbidden West': ['horizon forbidden west', 'horizon zero dawn', 'horizon'],
  'The Last of Us Part II': ['last of us part ii', 'last of us 2', 'tlou2', 'tlou part ii'],
  'The Last of Us': ['last of us', 'tlou'],
  'Resident Evil 4': ['resident evil 4', 're4 remake'],
  'Resident Evil': ['resident evil', 'biohazard'],
  'Ghost of Tsushima': ['ghost of tsushima', 'tsushima'],
  'Demon Souls': ["demon's souls", 'demon souls'],
  'Bloodborne': ['bloodborne'],
  'Dark Souls': ['dark souls'],
  'Sekiro': ['sekiro'],
  'Armored Core VI': ['armored core', 'armored core vi', 'armored core 6'],
  'Lies of P': ['lies of p'],
  'Stellar Blade': ['stellar blade'],
  'Black Myth Wukong': ['black myth', 'wukong'],
  'Tekken 8': ['tekken 8'],
  'Tekken': ['tekken'],
  'Street Fighter 6': ['street fighter 6', 'sf6'],
  'Mortal Kombat 1': ['mortal kombat 1', 'mk1'],
  'Mortal Kombat': ['mortal kombat'],
  'Hogwarts Legacy': ['hogwarts legacy', 'hogwarts'],
  'Assassins Creed': ["assassin's creed", 'assassins creed', 'ac valhalla', 'ac mirage', 'ac shadows'],
  'Cyberpunk 2077': ['cyberpunk', 'cyberpunk 2077', 'night city'],
  'Red Dead Redemption 2': ['red dead redemption', 'rdr2', 'red dead'],
  'The Witcher 3': ['witcher 3', 'witcher', 'geralt'],
  'Starfield': ['starfield'],
  'Halo': ['halo infinite', 'halo'],
  'Gears of War': ['gears of war', 'gears'],
  'Death Stranding 2': ['death stranding 2'],
  'Death Stranding': ['death stranding'],
  'Returnal': ['returnal'],
  'Ratchet and Clank': ['ratchet and clank', 'ratchet & clank', 'rift apart'],
  'Gran Turismo 7': ['gran turismo 7', 'gt7'],
  'Gran Turismo': ['gran turismo'],
  'Astro Bot': ['astro bot', 'astros playroom'],
  'Sackboy': ['sackboy'],
  'Uncharted': ['uncharted'],
  'It Takes Two': ['it takes two'],
  'Fall Guys': ['fall guys'],
  'Among Us': ['among us'],
  'Dead by Daylight': ['dead by daylight', 'dbd'],
  'Lethal Company': ['lethal company'],
  'Rainbow Six Siege': ['rainbow six', 'r6 siege'],
  'Escape from Tarkov': ['tarkov', 'escape from tarkov'],
  'PUBG': ['pubg', 'playerunknown'],
  'Rust': ['rust game', 'rust server'],
  'Ark Survival': ['ark survival', 'ark ascended'],
  'Monster Hunter': ['monster hunter', 'mh rise', 'mh world', 'monster hunter wilds'],
  'Dragon Ball': ['dragon ball', 'dbz', 'sparking zero'],
  'Naruto': ['naruto', 'storm connections'],
  'One Piece': ['one piece'],
  'WWE 2K': ['wwe 2k', 'wwe'],
};

export function detectContentContext(title: string, description?: string | null, category?: string | null, metadata?: any): ContentContext {
// AUDIT FIX: Include metadata in content context signal text for richer niche detection
  const text = `${sanitizeForPrompt(title)} ${sanitizeForPrompt(description || "")} ${sanitizeForPrompt(category || "")} ${metadata ? JSON.stringify(sanitizeObjectForPrompt(metadata)) : ""}`.toLowerCase();
  const brandKeywords: string[] = metadata?.brandKeywords || [];

  if (metadata?.contentNiche) {
    const niche = metadata.contentNiche as ContentNiche;
    const config = NICHE_CONFIG[niche] || NICHE_CONFIG.general;
    let gameName: string | null = null;
    if (niche === 'gaming') {
      gameName = metadata?.gameName || detectGameName(text);
    }
    return {
      niche,
      subNiche: metadata?.subNiche || null,
      isGaming: niche === 'gaming',
      gameName,
      topicName: metadata?.topicName || gameName || null,
      brandKeywords,
      nicheTerminology: config.terminology,
      audienceType: config.audienceType,
      contentStyle: config.contentStyle,
    };
  }

  const nicheScores: { niche: ContentNiche; score: number }[] = [];
  for (const [niche, signals] of Object.entries(NICHE_SIGNALS)) {
    if (niche === 'general') continue;
    const score = signals.filter(s => text.includes(s)).length;
    if (score > 0) nicheScores.push({ niche: niche as ContentNiche, score });
  }
  nicheScores.sort((a, b) => b.score - a.score);

  if (category) {
    const catLower = category.toLowerCase();
    for (const niche of Object.keys(NICHE_SIGNALS) as ContentNiche[]) {
      if (catLower === niche || catLower.includes(niche)) {
        const existing = nicheScores.find(n => n.niche === niche);
        if (existing) existing.score += 5;
        else nicheScores.push({ niche, score: 5 });
      }
    }
    nicheScores.sort((a, b) => b.score - a.score);
  }

  const detectedNiche: ContentNiche = nicheScores.length > 0 ? nicheScores[0].niche : 'general';
  const config = NICHE_CONFIG[detectedNiche] || NICHE_CONFIG.general;

  let gameName: string | null = null;
  if (detectedNiche === 'gaming') {
    gameName = metadata?.gameName || detectGameName(text);
  }

  const topicName = gameName || extractTopicName(text, detectedNiche);

  return {
    niche: detectedNiche,
    subNiche: nicheScores.length > 1 ? nicheScores[1].niche : null,
    isGaming: detectedNiche === 'gaming',
    gameName,
    topicName,
    brandKeywords,
    nicheTerminology: config.terminology,
    audienceType: config.audienceType,
    contentStyle: config.contentStyle,
  };
}

function detectGameName(text: string): string | null {
  for (const [game, patterns] of Object.entries(KNOWN_GAMES)) {
    if (patterns.some(p => text.includes(p))) return game;
  }
  const learned = detectGameFromLearned(text);
  if (learned) return learned;
  return null;
}

function extractTopicName(text: string, niche: ContentNiche): string | null {
  const topicPatterns: Partial<Record<ContentNiche, Record<string, string[]>>> = {
    cooking: { 'pasta': ['pasta', 'spaghetti', 'penne', 'fettuccine'], 'baking': ['cake', 'cookies', 'bread', 'pastry'], 'grilling': ['grill', 'bbq', 'barbecue', 'smoke'] },
    tech: { 'iPhone': ['iphone'], 'Android': ['android', 'pixel', 'galaxy'], 'PC': ['pc build', 'custom pc'], 'AI': ['ai', 'chatgpt', 'artificial intelligence'] },
    fitness: { 'Weightlifting': ['bench press', 'squat', 'deadlift'], 'Running': ['marathon', 'running', 'jogging'], 'Yoga': ['yoga', 'flexibility'] },
  };

  const patterns = topicPatterns[niche];
  if (!patterns) return null;
  for (const [topic, signals] of Object.entries(patterns)) {
    if (signals.some(s => text.includes(s))) return topic;
  }
  return null;
}

export function detectGamingContext(title: string, description?: string | null, category?: string | null, metadata?: any): ContentContext {
  return detectContentContext(title, description, category, metadata);
}

export function buildContentPromptSection(ctx: ContentContext): string {
  const config = NICHE_CONFIG[ctx.niche] || NICHE_CONFIG.general;
  let section = '';

  if (ctx.niche !== 'general') {
    section += `\n\nCONTENT NICHE: ${ctx.niche.toUpperCase()} (CRITICAL):`;
    section += `\n- Target audience: ${config.audienceType}`;
    section += `\n- Content style: ${config.contentStyle}`;

    if (ctx.topicName) {
      section += `\n- Specific topic/subject: "${sanitizeForPrompt(ctx.topicName)}". ALL SEO, tags, titles, descriptions, and thumbnails MUST reference "${sanitizeForPrompt(ctx.topicName)}" by name.`;
      section += `\n- Use niche-specific terminology and community language relevant to "${sanitizeForPrompt(ctx.topicName)}".`;
    }

    if (ctx.isGaming && ctx.gameName) {
      section += `\n- This content features the game "${sanitizeForPrompt(ctx.gameName)}". Use game-specific terminology, characters, maps, weapons, mechanics, and community lingo.`;
      section += `\n- Tags MUST include the game name and related search terms players actually search for.`;
    }

    section += `\n- Thumbnail style: ${config.thumbnailStyle}`;
    section += `\n- SEO focus: ${config.seoFocus}`;

    if (config.terminology.length > 0) {
      section += `\n- Use niche terminology naturally: ${config.terminology.slice(0, 5).join(', ')}`;
    }
  }

  if (ctx.brandKeywords.length > 0) {
    section += `\n\nBRAND ALIGNMENT: The creator's brand keywords are: ${sanitizeForPrompt(ctx.brandKeywords.join(', '))}. All output must align with this brand identity.`;
  }

  return section;
}

export function buildGamingPromptSection(ctx: ContentContext): string {
  return buildContentPromptSection(ctx);
}

export function getNicheLabel(ctx: ContentContext): string {
  if (ctx.isGaming) return ctx.gameName ? `${sanitizeForPrompt(ctx.gameName)} gaming` : 'gaming';
  if (ctx.topicName) return `${sanitizeForPrompt(ctx.topicName)} ${sanitizeForPrompt(ctx.niche)}`;
  return ctx.niche;
}

export function getNicheAudienceLabel(ctx: ContentContext): string {
  return NICHE_CONFIG[ctx.niche]?.audienceType || 'general audience';
}

async function getCreatorContext(userId?: string): Promise<string> {
  if (!userId) return '';
  try {
    const [style, learning, humanization] = await Promise.all([
      getCreatorStyleContext(userId),
      getLearningContext(userId),
      buildHumanizationPrompt(userId),
    ]);
    return [style, learning, humanization].filter(Boolean).join('\n\n');
  } catch {
    return '';
  }
}

export async function generateVideoMetadata(video: {
  title: string;
  description?: string | null;
  type: string;
  metadata?: any;
  platform?: string;
}, userId?: string) {
  const platformName = video.platform || 'youtube';
  const contentCtx = detectContentContext(video.title, video.description, video.metadata?.contentCategory, video.metadata);
  const contentSection = buildContentPromptSection(contentCtx);
  const nicheLabel = getNicheLabel(contentCtx);
  const creatorContext = await getCreatorContext(userId);

  let learnedKeywordCtx = "";
  if (userId) {
    try {
      const { getKeywordContext } = await import("./services/keyword-learning-engine");
      learnedKeywordCtx = await getKeywordContext(userId);
    } catch { /* keyword engine not available */ }
  }

  let retentionContext = "";
  if (userId) {
    try {
      const { db } = await import("./db");
      const { retentionBeats } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const beats = await db.select().from(retentionBeats).where(eq(retentionBeats.userId, userId)).orderBy(desc(retentionBeats.retentionImpact)).limit(10);
      if (beats.length > 0) {
        retentionContext = `\n\nRETENTION SCIENCE (from top creators like MrBeast):
${beats.map(b => `- ${sanitizeForPrompt(b.beatType)} at ${b.timestampMarker || '0'}s: "${sanitizeForPrompt(b.description)}" (${Math.round((b.retentionImpact ?? 0) * 100)}% effective)`).join('\n')}
Apply these proven retention patterns to ALL content. Every video must hook in first 3 seconds, re-hook at 30s, and maintain curiosity loops throughout.`;
      }
    } catch (err) {
      logger.error("[AIEngine] Failed to load retention beats context:", err);
    }
  }

  // Build content-type-specific optimization rules
  const detectedContentType = video.metadata?.detectedContentType as string | undefined;
  let contentTypeSection = "";
  if (detectedContentType === "live_stream") {
    contentTypeSection = `
CONTENT TYPE: LIVE STREAM VOD — APPLY THESE RULES:
- Title format: "[Game/Event] Live Stream | [Hook] | ET Gaming 274" OR "FULL STREAM: [Hook]"
- Description MUST open with live stream timestamp highlights (e.g., "0:00 Stream Start | 12:30 Clutch Moment | 45:00 Final Boss")
- Tags MUST include: "full stream", "live stream", "gaming live", "vod", "[game name] live"
- Optimize for VOD discovery — viewers searching for archived streams
- Suggest pinning a "timestamps" comment for navigation`;
  } else if (detectedContentType === "clip") {
    contentTypeSection = `
CONTENT TYPE: HIGHLIGHT CLIP — APPLY THESE RULES:
- Title format: "[Specific Moment] in [Game] 😱" or "[Moment] that [Reaction]"
- Keep titles under 60 characters — clips get shared and titles are truncated on mobile
- Description should reference the full stream/video this clip came from with a link placeholder
- Tags MUST include: "gaming clips", "highlights", "[game] clips", "funny moments", "[game] highlights"
- Focus on virality: hook within first 5 seconds, single punchy moment
- Thumbnail should capture the PEAK moment with high emotion`;
  } else if (detectedContentType === "short") {
    contentTypeSection = `
CONTENT TYPE: YOUTUBE SHORT — APPLY THESE RULES:
- Title must be under 50 characters, hook in first 3 words
- Description under 100 characters with 3 hashtags maximum — always include #Shorts
- Tags: max 5, include "#Shorts", the game name, and "gaming"
- Optimize for vertical feed discovery — high tempo, single payoff moment
- No chapter timestamps needed`;
  }

  const safeVideoTitle = sanitizeForPrompt(video.title);
  const safeVideoDescription = sanitizeForPrompt(video.description || 'None provided');
  const safeTopicName = sanitizeForPrompt(contentCtx.topicName || '');

  const prompt = `You are a world-class ${platformName} content strategist combining the expertise of:
- A top-tier YouTube SEO specialist (vidIQ/TubeBuddy level)
- A retention science expert who studies MrBeast, The Fat Electrician, and top 0.1% creators
- A professional copywriter specializing in hooks and curiosity gaps
- A growth hacker who understands algorithmic content distribution

Video Title: "${safeVideoTitle}"
Video Type: ${video.type}${detectedContentType ? ` (${detectedContentType})` : ''}
Platform: ${platformName}
Content Niche: ${nicheLabel}
Current Description: "${safeVideoDescription}"
Current Tags: ${sanitizeForPrompt(video.metadata?.tags?.join(', ') || 'None')}
${video.metadata?.duration ? `Video Duration: ${video.metadata.duration}` : ''}
${video.metadata?.youtubeCategory ? `YouTube Category ID: ${sanitizeForPrompt(video.metadata.youtubeCategory)}` : ''}
${video.metadata?.liveStats ? `Current Performance: ${video.metadata.liveStats.viewCount} views, ${video.metadata.liveStats.likeCount} likes, ${video.metadata.liveStats.commentCount} comments` : ''}
${video.metadata?.publishedAt ? `Published: ${video.metadata.publishedAt}` : ''}
${safeTopicName ? `Topic/Subject: "${safeTopicName}"` : ''}
${contentCtx.niche !== 'general' ? `Content Category: ${sanitizeForPrompt(contentCtx.niche)}` : ''}
${contentSection}${creatorContext ? `\n\n${creatorContext}` : ''}${learnedKeywordCtx}${retentionContext}${contentTypeSection}

CRITICAL: Your optimization MUST be specifically relevant to THIS video's actual content. Analyze the title, description, and tags to understand exactly what this clip/video shows. Your SEO, thumbnails, and all recommendations must match the actual gameplay, moments, or content depicted — NOT generic gaming advice.

RETENTION RULES (MANDATORY):
- Title MUST create a curiosity gap or promise a specific outcome
- First line of description MUST be a hook that makes viewers NEED to watch
- Include pattern interrupts every 2-3 minutes in chapter structure
- End with open loops that drive to next video or subscription

SEO RULES (MANDATORY):
- Primary keyword in first 60 characters of title
- Front-load description with searchable keywords (first 150 chars appear in search)
- Tags ordered by: exact match > phrase match > broad match > related
- Include trending/seasonal keywords when relevant

Provide your response as JSON with exactly these fields:
{
  "titleHooks": ["3 title variants using different psychological hooks - one curiosity gap, one specific outcome promise, one pattern interrupt. Each must be under 70 characters, include primary keyword in first 60 chars. Optimized for ${platformName} ${nicheLabel} content${safeTopicName ? ` and referencing ${safeTopicName}` : ''}"],
  "titleAnalysis": {
    "bestTitle": "Which of the 3 titles would perform best and why (1 sentence)",
    "hookType": "curiosity_gap | outcome_promise | pattern_interrupt | listicle | challenge",
    "estimatedCTR": "estimated CTR range like 4-8%"
  },
  "descriptionTemplate": "An optimized description starting with a compelling hook sentence that makes viewers click. Then 2-3 keyword-rich sentences about the content. Then actual chapter timestamps (e.g., 0:00 Intro, 1:30 First Topic, 3:45 Main Discussion - NEVER use placeholders). Then a clear CTA. Include 3-5 relevant hashtags. After the main description, add on separate lines: 'https://etgaming247.com' then 'Catch the live streams on Twitch & Kick' then 'Clips & highlights on TikTok' then 'Updates & hot takes on X' then 'Join the community on Discord'. End with: 'Managed with CreatorOS'.${safeTopicName ? ` Must reference ${safeTopicName} with niche-specific keywords.` : ''}",
  "retentionBrief": {
    "hookStrategy": "Specific first-3-second hook strategy for this video",
    "reHookAt30s": "What to say/show at 30 seconds to prevent drop-off",
    "curiosityLoops": ["3 curiosity loops to plant throughout the video that keep viewers watching"],
    "pacingNotes": "Specific pacing advice for this ${nicheLabel} content type",
    "endScreenStrategy": "How to drive viewers to next video or subscription"
  },
  "thumbnailCritique": "Specific actionable advice: composition rule (rule of thirds, centered subject), text overlay (max 4 words, 80pt+ font), color theory (complementary colors, 3-color max), emotional expression, contrast ratio. ${safeTopicName ? `Visual reference to ${safeTopicName}.` : `Optimized for ${nicheLabel} content.`}",
  "thumbnailVariants": ["3 thumbnail concepts described in detail, each tailored to ${nicheLabel} audience expectations"],
  "seoRecommendations": ["7 specific SEO improvements ranked by impact. Include keyword density targets, search volume insights, competitor gap analysis, and trend alignment for ${platformName} ${nicheLabel} content${safeTopicName ? ` targeting ${safeTopicName} audience` : ''}"],
  "complianceNotes": ["Any ${platformName} ToS concerns or best practices"],
  "suggestedTags": ["15 tags ordered by search volume and relevance. Mix of: head terms (1-2 words, high volume), long-tail (3-5 words, high intent), trending, and niche-specific for ${nicheLabel}${safeTopicName ? `. Must include ${safeTopicName} variations` : ''}"],
  "seoScore": 75,
  "contentBrief": {
    "idealLength": "Recommended video length with reasoning for ${nicheLabel} content",
    "structureBeats": ["Ordered list of content beats/sections with timing for maximum retention"],
    "keyMoments": ["3 key moments to timestamp for YouTube chapters and key moments in search"]
  }${safeTopicName ? `,\n  "detectedTopic": "${safeTopicName}"` : ''}${contentCtx.niche !== 'general' ? `,\n  "contentNiche": "${sanitizeForPrompt(contentCtx.niche)}"` : ''}
}`;

  const VIRAL_META_ESTIMATED_TOKENS = 3000;
  if (!tokenBudget.checkBudget("viral-optimizer", VIRAL_META_ESTIMATED_TOKENS)) {
    throw new Error("Daily viral-optimizer token budget exhausted. Will retry tomorrow.");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
  });

  const actualTokens = response.usage?.total_tokens ?? VIRAL_META_ESTIMATED_TOKENS;
  tokenBudget.consumeBudget("viral-optimizer", actualTokens);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function analyzeChannelGrowth(channelData: {
  channelName: string;
  platform: string;
  videoCount: number;
  videos: Array<{ title: string; type: string; status: string; metadata?: any }>;
}, userId?: string) {
  const videoSummary = channelData.videos.slice(0, 20).map(v =>
    `- "${sanitizeForPrompt(v.title)}" (${v.type}, ${v.status}${v.metadata?.stats ? `, ${v.metadata.stats.views} views` : ''})`
  ).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube growth strategist. Analyze this channel and create actionable growth strategies.

Channel: "${sanitizeForPrompt(channelData.channelName)}" on ${sanitizeForPrompt(channelData.platform)}
Total Videos: ${channelData.videoCount}
Recent Videos:
${videoSummary || 'No videos yet'}
${creatorContext ? `\n${creatorContext}` : ''}

Create 5 growth strategies as JSON array. Each strategy should have:
{
  "strategies": [
    {
      "title": "Strategy name",
      "description": "Detailed explanation",
      "category": "one of: content, seo, engagement, consistency, cross-platform",
      "priority": "high/medium/low",
      "actionItems": ["Specific step 1", "Specific step 2", "Specific step 3"],
      "estimatedImpact": "Expected result in 30 days"
    }
  ]
}

Focus on:
- Content patterns that drive growth
- Upload consistency and scheduling
- SEO and discoverability
- Audience engagement tactics
- Cross-platform distribution opportunities
Be specific to THIS channel's content, not generic advice.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function runComplianceCheck(channelData: {
  channelName: string;
  platform: string;
  recentActions: Array<{ action: string; target?: string | null; details?: any }>;
  settings: any;
}, userId?: string) {
  const actionLog = channelData.recentActions.slice(0, 30).map(a =>
    `- ${sanitizeForPrompt(a.action)}: ${sanitizeForPrompt(a.target || 'N/A')} ${a.details ? JSON.stringify(sanitizeObjectForPrompt(a.details)) : ''}`
  ).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a platform compliance expert for ${sanitizeForPrompt(channelData.platform)}. Review this channel's recent activity and settings for ToS compliance risks.

Channel: "${sanitizeForPrompt(channelData.channelName)}"
Platform: ${sanitizeForPrompt(channelData.platform)}
Settings: ${JSON.stringify(sanitizeObjectForPrompt(channelData.settings || {}))}
Recent Actions:
${actionLog || 'No recent actions'}
${creatorContext ? `\n${creatorContext}` : ''}

Analyze for compliance risks and provide your response as JSON:
{
  "checks": [
    {
      "checkType": "type of check (e.g., upload_frequency, metadata_changes, spam_detection, content_policy)",
      "status": "pass or warning or fail",
      "rule": "The specific platform rule being checked",
      "description": "What was found",
      "severity": "info or warning or critical",
      "recommendation": "What to do about it"
    }
  ],
  "overallScore": 85,
  "summary": "Brief overall compliance summary"
}

Check for:
- Upload frequency (too fast = bot-like)
- Metadata edit frequency (mass edits = suspicious)
- Comment patterns (spam-like behavior)
- Content repetition
- Keyword stuffing in tags/descriptions
- Community guidelines alignment`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function generateContentInsights(videos: Array<{
  title: string;
  type: string;
  metadata?: any;
}>, userId?: string) {
  const videoList = videos.slice(0, 30).map(v => {
    const stats = v.metadata?.stats;
    return `- "${sanitizeForPrompt(v.title)}" (${v.type})${stats ? ` | Views: ${stats.views}, Likes: ${stats.likes}, CTR: ${stats.ctr}%` : ''}`;
  }).join('\n');
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube analytics expert. Analyze these videos and identify patterns for content improvement.

Videos:
${videoList || 'No videos to analyze'}
${creatorContext ? `\n${creatorContext}` : ''}

Identify content patterns and provide insights as JSON:
{
  "insights": [
    {
      "insightType": "one of: title_pattern, pacing, upload_time, thumbnail_style, engagement_hook, audience_retention, topic_trend",
      "category": "one of: what_works, what_to_avoid, opportunity, trend",
      "finding": "What the data shows",
      "confidence": 0.85,
      "recommendation": "Specific actionable recommendation",
      "evidence": ["Supporting data point 1", "Supporting data point 2"]
    }
  ],
  "weeklyReport": "A 2-3 paragraph summary of what to focus on this week"
}

Focus on patterns that would help improve:
- Click-through rate (titles & thumbnails)
- Watch time (content pacing)
- Upload timing optimization
- Topic selection
- Format effectiveness (shorts vs longform)`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function getContentStrategyAdvice(question: string, context: {
  channelName?: string;
  videoCount?: number;
  recentTitles?: string[];
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a YouTube content strategy advisor helping creators grow their channels. 

Channel context:
- Name: ${sanitizeForPrompt(context.channelName || 'Unknown')}
- Videos: ${context.videoCount || 0}
- Recent titles: ${sanitizeForPrompt(context.recentTitles?.join(', ') || 'None')}

The creator asks: "${sanitizeForPrompt(question)}"
${creatorContext ? `\n${creatorContext}` : ''}

Provide a detailed, actionable response. Be specific to YouTube/content creation. Include examples where helpful. Keep your response focused and practical - no fluff.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a team of the world's best YouTube experts working as one:\n\n🎯 WORLD'S #1 SEO STRATEGIST: You reverse-engineer the YouTube algorithm. You know which keywords rank, how browse features work, and how to exploit search intent for maximum discoverability.\n\n📊 WORLD'S #1 GROWTH HACKER: You've scaled channels from 0 to 1M subscribers. You understand viral mechanics, audience retention psychology, and algorithmic favor.\n\n📝 WORLD'S #1 CONTENT STRATEGIST: You create content calendars that 10x channel growth. You identify trending niches, optimal upload schedules, and content gaps competitors miss.\n\n🛡️ PLATFORM COMPLIANCE EXPERT: You know every YouTube policy inside and out. You keep creators safe while maximizing reach.\n\nAlways give specific, data-backed, actionable advice. No generic tips — every recommendation should be something the creator can implement TODAY for measurable results." },
      { role: "user", content: prompt }
    ],
    max_completion_tokens: 8000,
  });

  return response.choices[0]?.message?.content || "Unable to generate advice at this time.";
}

export async function generateStreamSeo(streamData: {
  title: string;
  description?: string | null;
  category?: string | null;
  platforms: string[];
  gameName?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const platformList = sanitizeForPrompt(streamData.platforms.join(', '));
  const contentCtx = detectContentContext(streamData.title, streamData.description, streamData.category, { gameName: streamData.gameName, brandKeywords: streamData.brandKeywords });
  const nicheLabel = getNicheLabel(contentCtx);
  const contentSection = buildContentPromptSection(contentCtx);
  const creatorContext = await getCreatorContext(userId);
  const safeTopicName = sanitizeForPrompt(contentCtx.topicName || '');
  const safeStreamTitle = sanitizeForPrompt(streamData.title);
  const safeStreamDesc = sanitizeForPrompt(streamData.description || '');

  const prompt = `You are a live streaming SEO expert. Optimize this stream for maximum discoverability across multiple platforms.

Stream Title: "${safeStreamTitle}"
Description: "${safeStreamDesc || 'Not provided'}"
Category: "${sanitizeForPrompt(streamData.category || contentCtx.niche)}"
Target Platforms: ${platformList}
${safeTopicName ? `Topic/Subject: "${safeTopicName}"` : ''}
${contentSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Provide your response as JSON:
{
  "optimizedTitle": "An optimized stream title that works across all platforms - attention-grabbing, clear, with relevant keywords${safeTopicName ? `. MUST include ${safeTopicName} in the title` : ''}",
  "optimizedDescription": "A compelling description with keywords, call-to-action, schedule info placeholder, and social links placeholder${safeTopicName ? `. Must reference ${safeTopicName} and include niche-specific details` : ''}",
  "tags": ["15 relevant tags for discoverability${safeTopicName ? ` - must include ${safeTopicName} and related ${sanitizeForPrompt(contentCtx.niche)} terms` : ''}"],
  "thumbnailPrompt": "A detailed description for generating an eye-catching stream thumbnail${safeTopicName ? ` featuring ${safeTopicName} visual elements and themes` : ''} - include colors, composition, text overlay suggestions, and mood${contentCtx.niche !== 'general' ? `. Use ${nicheLabel}-appropriate aesthetic and visual identity` : ''}",
  "platformSpecific": {
${streamData.platforms.map(p => { const sp = sanitizeForPrompt(p); return `    "${sp}": { "title": "Platform-optimized title for ${sp}${safeTopicName ? ` featuring ${safeTopicName}` : ''}", "description": "Platform-specific description for ${sp}", "tags": ["5 platform-specific tags${safeTopicName ? ` related to ${safeTopicName}` : ''}"] }`; }).join(',\n')}
  }
}

Focus on:
- Click-worthy but honest titles${safeTopicName ? ` that reference ${safeTopicName}` : ''}
- Platform-specific SEO best practices
- Keywords that drive live viewership${contentCtx.niche !== 'general' ? ` in the ${sanitizeForPrompt(contentCtx.niche)} category` : ''}
- Urgency/FOMO elements for live content${safeTopicName ? `\n- Trending topics and community terms for ${safeTopicName}` : ''}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function postStreamOptimize(streamData: {
  title: string;
  description?: string | null;
  category?: string | null;
  platforms: string[];
  duration?: number;
  stats?: any;
  gameName?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const contentCtx = detectContentContext(streamData.title, streamData.description, streamData.category, { gameName: streamData.gameName, brandKeywords: streamData.brandKeywords });
  const nicheLabel = getNicheLabel(contentCtx);
  const contentSection = buildContentPromptSection(contentCtx);
  const creatorContext = await getCreatorContext(userId);
  const safeTopicName = sanitizeForPrompt(contentCtx.topicName || '');
  const safeStreamTitle = sanitizeForPrompt(streamData.title);
  const safeStreamDesc = sanitizeForPrompt(streamData.description || '');

  const prompt = `You are a VOD optimization expert. This live stream just ended and needs to be optimized for on-demand viewing.

Original Stream Title: "${safeStreamTitle}"
Stream Description: "${safeStreamDesc || 'Not provided'}"
Category: "${sanitizeForPrompt(streamData.category || contentCtx.niche)}"
Platforms: ${sanitizeForPrompt(streamData.platforms.join(', '))}
Duration: ${streamData.duration ? `${Math.round(streamData.duration / 60)} minutes` : 'Unknown'}
${streamData.stats ? `Stats: Peak viewers: ${streamData.stats.peakViewers || 'N/A'}, Avg viewers: ${streamData.stats.avgViewers || 'N/A'}` : ''}
${safeTopicName ? `Topic/Subject: "${safeTopicName}"` : ''}
${contentSection}${creatorContext ? `\n\n${creatorContext}` : ''}

Rewrite and optimize for VOD performance as JSON:
{
  "vodTitle": "An optimized title for the VOD version - should be search-friendly and compelling for on-demand viewers${safeTopicName ? `. MUST include ${safeTopicName} in the title` : ''}",
  "vodDescription": "A full description with actual chapter timestamps written out based on stream content (e.g., 0:00 Stream Start, 5:30 First Game, 15:00 Highlights - never use placeholders), keywords, engagement hooks, and calls to action${safeTopicName ? `. Must reference ${safeTopicName} with niche-specific keywords` : ''}",
  "tags": ["15 tags optimized for VOD search${safeTopicName ? ` - must include ${safeTopicName} and related ${sanitizeForPrompt(contentCtx.niche)} terms` : ''}"],
  "thumbnailPrompt": "A detailed prompt for generating a click-worthy VOD thumbnail different from the live thumbnail${safeTopicName ? ` featuring ${safeTopicName} visuals, themes, or standout moments` : ''} - include composition, text overlay, colors, and emotional hooks${contentCtx.niche !== 'general' ? `. Match the ${nicheLabel} visual identity and color palette` : ''}",
  "seoScore": 80,
  "recommendations": ["5 specific things to do with this VOD to maximize views${safeTopicName ? ` in the ${safeTopicName} community` : ''}"],
  "platformSpecific": {
${streamData.platforms.map(p => { const sp2 = sanitizeForPrompt(p); return `    "${sp2}": { "title": "VOD title for ${sp2}${safeTopicName ? ` referencing ${safeTopicName}` : ''}", "description": "VOD description for ${sp2}", "tags": ["5 tags for ${sp2}${safeTopicName ? ` including ${safeTopicName}` : ''}"] }`; }).join(',\n')}
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function generateThumbnailPrompt(data: {
  title: string;
  description?: string | null;
  platform?: string;
  type?: string;
  gameName?: string | null;
  category?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const contentCtx = detectContentContext(data.title, data.description, data.category, { gameName: data.gameName, brandKeywords: data.brandKeywords });
  const nicheLabel = getNicheLabel(contentCtx);
  const contentSection = buildContentPromptSection(contentCtx);
  const creatorContext = await getCreatorContext(userId);

  // Platform-specific thumbnail specs
  const platform = (data.platform || 'youtube').toLowerCase();
  const platformSpecs: Record<string, { aspectRatio: string; resolution: string; orientation: string; notes: string }> = {
    youtube:        { aspectRatio: "16:9", resolution: "1280x720", orientation: "LANDSCAPE", notes: "wide cinematic frame — focal point center or rule-of-thirds, horizontal composition fills full width" },
    youtube_shorts: { aspectRatio: "9:16", resolution: "1080x1920", orientation: "VERTICAL PORTRAIT", notes: "tall vertical frame — full-bleed portrait composition, subject fills the height, no black bars" },
    twitch:         { aspectRatio: "16:9", resolution: "1280x720", orientation: "LANDSCAPE", notes: "wide cinematic frame matching broadcast dimensions — high energy, game-relevant imagery" },
    kick:           { aspectRatio: "16:9", resolution: "1280x720", orientation: "LANDSCAPE", notes: "widescreen landscape — bold colors, game screenshot or streamer reaction in horizontal frame" },
    rumble:         { aspectRatio: "16:9", resolution: "1280x720", orientation: "LANDSCAPE", notes: "standard widescreen format — clean horizontal composition" },
    tiktok:         { aspectRatio: "9:16", resolution: "1080x1920", orientation: "VERTICAL PORTRAIT", notes: "full-screen vertical mobile format — center subject, high contrast, impactful close-up" },
    instagram:      { aspectRatio: "1:1",  resolution: "1080x1080", orientation: "SQUARE", notes: "perfect square composition — balanced, symmetrical, subject centered" },
    discord:        { aspectRatio: "16:9", resolution: "1280x720",  orientation: "LANDSCAPE", notes: "widescreen embed preview format" },
  };
  const spec = platformSpecs[platform] || platformSpecs['youtube'];
  const platformLabel = platform === 'youtube_shorts' ? 'YouTube Shorts' : (platform.charAt(0).toUpperCase() + platform.slice(1));
  const safeTopicName = sanitizeForPrompt(contentCtx.topicName || '');
  const safeDataTitle = sanitizeForPrompt(data.title);
  const safeDataDesc = sanitizeForPrompt(data.description || '');

  const prompt = `You are a thumbnail design expert for ${platformLabel}. Create a detailed image generation prompt for a high-performing thumbnail.

Content Title: "${safeDataTitle}"
Description: "${safeDataDesc || 'Not provided'}"
Content Type: ${sanitizeForPrompt(data.type || 'video')}
Platform: ${platformLabel}
Aspect Ratio: ${spec.aspectRatio} ${spec.orientation}
Resolution: ${spec.resolution}
Framing Rule: ${spec.notes}
${safeTopicName ? `Topic/Subject: "${safeTopicName}"` : ''}
${contentCtx.niche !== 'general' ? `Content Category: ${sanitizeForPrompt(contentCtx.niche)}` : ''}
${contentSection}${creatorContext ? `\n\n${creatorContext}` : ''}

CRITICAL: The image prompt MUST produce a ${spec.orientation} ${spec.aspectRatio} composition. ${spec.notes.toUpperCase()}.

Create a detailed, photorealistic image generation prompt as JSON:
{
  "prompt": "A detailed, specific image generation prompt that will create a professional, click-worthy ${platformLabel} thumbnail in ${spec.orientation} ${spec.aspectRatio} format.${safeTopicName ? ` The thumbnail MUST visually reference ${safeTopicName} - use recognizable visual elements, themes, and motifs associated with ${safeTopicName}. The color palette should match the ${nicheLabel} aesthetic.` : ''} Include: ${spec.orientation} ${spec.aspectRatio} composition that fills the ${spec.resolution} frame, high-contrast color scheme, emotional hooks, cinematic ${spec.orientation === 'LANDSCAPE' ? 'widescreen' : 'portrait'} lighting, background style.${contentCtx.niche !== 'general' ? ` For ${sanitizeForPrompt(contentCtx.niche)} content: use ${contentCtx.contentStyle} compositions that resonate with ${contentCtx.audienceType}.` : ''} The prompt should produce a thumbnail that stands out in the ${platformLabel} feed.",
  "style": "The overall visual style${contentCtx.niche !== 'general' ? ` (should match the ${nicheLabel} aesthetic and visual conventions of ${sanitizeForPrompt(contentCtx.niche)} content)` : ' (e.g., cinematic, bold, minimalist, energetic)'}",
  "dominantColors": ["3 hex color codes that should dominate the thumbnail${safeTopicName ? ` - should align with ${safeTopicName}'s visual identity` : ''}"],
  "textOverlay": "Suggested text to overlay on the thumbnail (keep it to 3-5 words maximum${safeTopicName ? ` - reference ${safeTopicName} or niche-specific terms` : ''})",
  "aspectRatio": "${spec.aspectRatio}",
  "imageSize": "${spec.aspectRatio === '16:9' ? '1536x1024' : spec.aspectRatio === '9:16' ? '1024x1536' : '1024x1024'}"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });

  const thumbContent = response.choices[0]?.message?.content;
  if (!thumbContent) throw new Error("No response from AI");
  return JSON.parse(thumbContent);
}

const AGENT_ROLES: Record<string, string> = {
  editor: "video editor who cuts highlights, creates shorts, and optimizes VODs for maximum engagement",
  social_manager: "social media manager who cross-posts content, schedules uploads, and manages community engagement across platforms",
  seo_director: "SEO expert who optimizes titles, descriptions, tags, and metadata for maximum discoverability",
  analytics_director: "analytics expert who tracks performance metrics, identifies trends, and generates actionable insights",
  brand_strategist: "brand strategist who maintains voice consistency, evaluates sponsorship fit, and ensures brand guidelines",
  ad_buyer: "ad buying specialist who manages ad spend, targets audiences, and optimizes return on ad spend",
  legal_advisor: "legal advisor who handles copyright checks, compliance monitoring, DMCA protection, and ToS adherence",
  community_manager: "community manager who moderates comments, engages with fans, handles DMs, and builds community",
  business_manager: "business manager who tracks revenue, handles invoicing, negotiates sponsorships, and manages finances",
  growth_strategist: "growth strategist who designs A/B tests, plans collaborations, identifies viral content opportunities, and drives channel growth",
  tax_strategist: "tax strategist who finds deductions, calculates quarterly estimates, recommends entity structure changes (sole prop to LLC to S-Corp), monitors state tax obligations, and ensures IRS compliance for content creators",
};

export async function runAgentTask(agentId: string, context: {
  channelName: string;
  videoCount: number;
  recentTitles: string[];
  gameName?: string | null;
  contentCategory?: string | null;
  brandKeywords?: string[];
}, userId?: string) {
  const role = AGENT_ROLES[agentId] || "AI assistant";
  const contentCtx = detectContentContext(
    context.recentTitles.join(' '),
    null,
    context.contentCategory,
    { gameName: context.gameName, brandKeywords: context.brandKeywords }
  );
  const nicheLabel = getNicheLabel(contentCtx);
  const safeTopicName = sanitizeForPrompt(contentCtx.topicName || '');

  let nicheInstructions = '';
  if (contentCtx.niche !== 'general') {
    nicheInstructions = `\n\nIMPORTANT - ${contentCtx.niche.toUpperCase()} CONTENT CONTEXT:`;
    if (safeTopicName) {
      nicheInstructions += `\n- The channel primarily features "${safeTopicName}" content.`;
      nicheInstructions += `\n- All recommendations, titles, tags, thumbnails, and strategies MUST be tailored to "${safeTopicName}" and its community.`;
      nicheInstructions += `\n- Use niche-specific terminology, trends, and community language relevant to "${safeTopicName}".`;
    }
    if (contentCtx.brandKeywords.length > 0) {
      nicheInstructions += `\n- Creator's brand identity: ${sanitizeForPrompt(contentCtx.brandKeywords.join(', '))}. Ensure all output aligns with this brand voice.`;
    }
    nicheInstructions += `\n- Thumbnails should feature ${nicheLabel}-appropriate visuals, standout moments, and niche-relevant color palettes.`;
    nicheInstructions += `\n- SEO should target ${sanitizeForPrompt(contentCtx.niche)}-specific keywords that the ${contentCtx.audienceType} actually search for.`;
  }

  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a ${role} working autonomously for the YouTube channel "${sanitizeForPrompt(context.channelName)}".

Channel has ${context.videoCount} videos. Recent titles: ${sanitizeForPrompt(context.recentTitles.join(', ') || 'None')}
${safeTopicName ? `Primary Topic: "${safeTopicName}"` : ''}
${contentCtx.niche !== 'general' ? `Content Category: ${sanitizeForPrompt(contentCtx.niche)}` : ''}${nicheInstructions}${creatorContext ? `\n\n${creatorContext}` : ''}

Perform your most important task right now. Respond as JSON:
{
  "action": "What you did (e.g., 'Optimized 3 video titles for CTR')",
  "target": "What you worked on (e.g., 'Recent video SEO')",
  "description": "Detailed description of what you accomplished and why${safeTopicName ? ` - must reference ${safeTopicName} specifics` : ''}",
  "impact": "Expected impact (e.g., '+15% CTR improvement expected')",
  "recommendations": ["3 specific follow-up recommendations${safeTopicName ? ` tailored to ${safeTopicName} content` : ''}"]
}

Be specific, actionable, and reference actual content from this channel.${safeTopicName ? ` All output must be relevant to ${safeTopicName} and its ${contentCtx.audienceType}.` : ''}`;

  const agentResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });

  const agentContent = agentResponse.choices[0]?.message?.content;
  if (!agentContent) throw new Error("No response from AI");
  return JSON.parse(agentContent);
}

export async function generateCommunityPost(data: {
  platform: string;
  channelName: string;
  recentTitles: string[];
  type: string;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const prompt = `You are a social media expert for the ${sanitizeForPrompt(data.platform)} channel "${sanitizeForPrompt(data.channelName)}".

Recent content: ${sanitizeForPrompt(data.recentTitles.join(', ') || 'None')}
Post type: ${sanitizeForPrompt(data.type)}
${creatorContext ? `\n${creatorContext}` : ''}

Create an engaging community post as JSON:
{
  "content": "The full post text, engaging and platform-appropriate. Include relevant hashtags. Write in a natural, authentic voice that feels human-written.",
  "bestTimeToPost": "Recommended posting time (e.g., 'Tuesday 3 PM EST')",
  "expectedEngagement": "Expected engagement level (high/medium/low)"
}`;

  const communityResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const communityContent = communityResponse.choices[0]?.message?.content;
  if (!communityContent) throw new Error("No response from AI");
  const parsed = JSON.parse(communityContent);

  if (parsed.content && userId) {
    try {
      const { applyGuardrails } = await import("./stealth-guardrails");
      const guardrailed = await applyGuardrails(parsed.content, userId, data.platform, { contentType: "community-post" });
      parsed.content = guardrailed.content;
      parsed.stealthScore = guardrailed.stealthScore;
      parsed.safetyGrade = guardrailed.safetyGrade;
    } catch (err) {
      logger.error("[AIEngine] Failed to apply stealth guardrails to community post:", err);
    }
  }

  return parsed;
}

export async function generateTaxStrategy(data: {
  totalRevenue: number;
  totalExpenses: number;
  state: string;
  entityType: string;
  expenses: Array<{ category: string; amount: number; description: string }>;
  platforms: string[];
  year: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const expenseBreakdown = data.expenses.map(e =>
    `- ${sanitizeForPrompt(e.category)}: $${e.amount} (${sanitizeForPrompt(e.description)})`
  ).join('\n');

  const prompt = `You are a tax strategist specializing in content creators and digital entrepreneurs. Analyze this creator's financial situation and provide comprehensive tax optimization advice.

Total Revenue: $${sanitizeForPrompt(data.totalRevenue)}
Total Expenses: $${sanitizeForPrompt(data.totalExpenses)}
Net Income: $${data.totalRevenue - data.totalExpenses}
State: ${sanitizeForPrompt(data.state)}
Entity Type: ${sanitizeForPrompt(data.entityType)}
Tax Year: ${sanitizeForPrompt(data.year)}
Platforms: ${sanitizeForPrompt(data.platforms.join(', '))}

Expense Breakdown:
${expenseBreakdown || 'No expenses provided'}
${creatorContext ? `\n${creatorContext}` : ''}

Provide your analysis as JSON with exactly these fields:
{
  "quarterlyEstimate": { "federal": 0, "state": 0, "selfEmployment": 0, "total": 0 },
  "deductionOpportunities": [{ "category": "", "description": "", "estimatedSavings": 0, "irsCategory": "" }],
  "entityRecommendation": { "currentType": "", "recommendedType": "", "reason": "", "savingsEstimate": 0, "threshold": "" },
  "stateSpecific": { "stateTaxRate": 0, "filingRequirements": [], "deadlines": [] },
  "warnings": [""],
  "optimizationScore": 75
}

Focus on:
- Accurate quarterly estimated tax calculations for federal, state, and self-employment taxes
- Content creator-specific deductions (equipment, software, home office, internet, travel for events, etc.)
- Whether the creator should change entity structure based on their income level
- State-specific tax obligations and filing requirements
- IRS compliance warnings and common audit triggers for content creators
- Platform-specific tax considerations (1099 reporting thresholds, international income)`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function generateExpenseAnalysis(data: {
  expenses: Array<{ category: string; amount: number; description: string; vendor?: string }>;
  revenue: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);

  const expenseList = data.expenses.map(e =>
    `- ${sanitizeForPrompt(e.description)}: $${e.amount} (Category: ${sanitizeForPrompt(e.category)}${e.vendor ? `, Vendor: ${sanitizeForPrompt(e.vendor)}` : ''})`
  ).join('\n');

  const prompt = `You are a tax expense analyst specializing in content creators. Review these expenses and suggest better categorization, identify missing deductions, and provide optimization recommendations.

Total Revenue: $${sanitizeForPrompt(data.revenue)}
Total Expenses: $${data.expenses.reduce((sum, e) => sum + e.amount, 0)}
Expense-to-Revenue Ratio: ${((data.expenses.reduce((sum, e) => sum + e.amount, 0) / data.revenue) * 100).toFixed(1)}%

Expenses:
${expenseList || 'No expenses provided'}
${creatorContext ? `\n${creatorContext}` : ''}

Provide your analysis as JSON with exactly these fields:
{
  "suggestions": [{ "expense": "", "currentCategory": "", "betterCategory": "", "reason": "" }],
  "missingDeductions": [{ "category": "", "description": "", "typicalAmount": 0 }],
  "expenseRatio": 0,
  "healthScore": 85,
  "recommendations": [""]
}

Focus on:
- Recategorizing expenses into proper IRS-recognized categories for maximum deduction value
- Identifying commonly missed deductions for content creators (home office, internet, phone, equipment depreciation, software subscriptions, travel for conventions/events, professional development)
- Calculating expense-to-revenue ratio and whether it is healthy
- Providing an overall financial health score based on expense management
- Specific actionable recommendations to improve tax efficiency`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const expContent = response.choices[0]?.message?.content;
  if (!expContent) throw new Error("No response from AI");
  return JSON.parse(expContent);
}

export async function aiCategorizeExpenses(expenses: Array<{ description: string; amount: number; vendor?: string }>, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const list = expenses.map(e => `- "${sanitizeForPrompt(e.description)}" $${e.amount}${e.vendor ? ` (${sanitizeForPrompt(e.vendor)})` : ''}`).join('\n');

  const prompt = `You are an expense categorization AI for content creators. Automatically categorize these expenses into IRS-recognized categories and determine if they are tax deductible.

Expenses:
${list}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "categorized": [
    {
      "description": "original description",
      "amount": 0,
      "category": "one of: advertising, equipment, software_subscriptions, travel, home_office, education_training, supplies, meals, internet_phone, insurance, legal_professional, office_expense, other",
      "irsCategory": "same as category",
      "taxDeductible": true,
      "confidence": 0.95,
      "reason": "why this category"
    }
  ]
}`;

  const catResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });
  const catContent = catResponse.choices[0]?.message?.content;
  if (!catContent) throw new Error("No response from AI");
  return JSON.parse(catContent);
}

export async function aiFinancialInsights(data: {
  totalRevenue: number;
  totalExpenses: number;
  revenueByPlatform: Record<string, number>;
  expensesByCategory: Record<string, number>;
  monthlyRevenue: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a financial advisor AI for content creators. Analyze this creator's finances and provide smart insights.

Total Revenue: $${sanitizeForPrompt(data.totalRevenue)}
Total Expenses: $${sanitizeForPrompt(data.totalExpenses)}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Monthly Revenue: $${sanitizeForPrompt(data.monthlyRevenue)}
Revenue by Platform: ${JSON.stringify(sanitizeObjectForPrompt(data.revenueByPlatform))}
Expenses by Category: ${JSON.stringify(sanitizeObjectForPrompt(data.expensesByCategory))}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "insights": [
    { "title": "short title", "description": "detailed insight", "type": "positive|warning|opportunity", "priority": "high|medium|low" }
  ],
  "forecast": { "nextMonth": 0, "nextQuarter": 0, "yearEnd": 0, "growthRate": 0 },
  "recommendations": [
    { "action": "what to do", "impact": "expected result", "urgency": "high|medium|low" }
  ],
  "healthScore": 85,
  "summary": "2-3 sentence financial summary"
}`;

  const finResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });
  const finContent = finResponse.choices[0]?.message?.content;
  if (!finContent) throw new Error("No response from AI");
  return JSON.parse(finContent);
}

export async function aiStreamRecommendations(data: {
  channelName: string;
  pastStreams: Array<{ title: string; category: string; platforms: string[] }>;
  videoCount: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const streamList = data.pastStreams.slice(0, 10).map(s => `- "${sanitizeForPrompt(s.title)}" (${sanitizeForPrompt(s.category)}) on ${sanitizeForPrompt(s.platforms.join(', '))}`).join('\n');

  const prompt = `You are a live streaming strategist AI. Analyze this creator's streaming habits and recommend optimal streaming strategies.

Channel: "${sanitizeForPrompt(data.channelName)}"
Total Videos: ${sanitizeForPrompt(data.videoCount)}
Past Streams:
${streamList || 'No past streams'}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "optimalTimes": [
    { "day": "Monday", "time": "7:00 PM EST", "reason": "audience peak", "confidence": 0.85 }
  ],
  "trendingTopics": [
    { "topic": "topic name", "relevance": 0.9, "reason": "why trending", "suggestedTitle": "stream title idea" }
  ],
  "streamIdeas": [
    { "title": "auto-generated stream title", "description": "auto-generated description", "category": "Gaming", "platforms": ["youtube", "twitch"], "reason": "why this would work" }
  ],
  "schedule": {
    "recommendedFrequency": "3x per week",
    "bestDays": ["Tuesday", "Thursday", "Saturday"],
    "reason": "why this schedule"
  }
}`;

  const strmResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });
  const strmContent = strmResponse.choices[0]?.message?.content;
  if (!strmContent) throw new Error("No response from AI");
  return JSON.parse(strmContent);
}

export async function aiContentIdeas(data: {
  channelName: string;
  recentTitles: string[];
  videoCount: number;
  topPerforming?: string[];
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a content strategy AI that generates viral content ideas. Analyze this channel and generate fresh, specific content ideas.

Channel: "${sanitizeForPrompt(data.channelName)}"
Total Videos: ${sanitizeForPrompt(data.videoCount)}
Recent Titles: ${sanitizeForPrompt(data.recentTitles.slice(0, 15).join(', ') || 'None')}
Top Performing: ${sanitizeForPrompt(data.topPerforming?.join(', ') || 'Unknown')}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "ideas": [
    {
      "title": "ready-to-use video title",
      "description": "full auto-generated description with hashtags",
      "type": "vod|short",
      "tags": ["tag1", "tag2"],
      "reason": "why this will perform well",
      "viralScore": 85,
      "bestPostTime": "Tuesday 3PM EST"
    }
  ],
  "seriesIdeas": [
    { "name": "series name", "description": "series concept", "episodeCount": 5, "reason": "why a series works" }
  ],
  "trendAlert": "current trending topic to capitalize on right now"
}`;

  const ideaResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });
  const ideaContent = ideaResponse.choices[0]?.message?.content;
  if (!ideaContent) throw new Error("No response from AI");
  return JSON.parse(ideaContent);
}

export async function aiDashboardActions(data: {
  channelName: string;
  videoCount: number;
  totalRevenue: number;
  totalExpenses: number;
  recentTitles: string[];
  activeGoals: number;
  activeVentures: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are an AI business operations manager for a content creator. Based on their current situation, generate proactive action items and opportunity alerts.

Channel: "${sanitizeForPrompt(data.channelName)}"
Videos: ${sanitizeForPrompt(data.videoCount)}
Revenue: $${sanitizeForPrompt(data.totalRevenue)}
Expenses: $${sanitizeForPrompt(data.totalExpenses)}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Active Goals: ${sanitizeForPrompt(data.activeGoals)}
Active Ventures: ${sanitizeForPrompt(data.activeVentures)}
Recent Content: ${sanitizeForPrompt(data.recentTitles.slice(0, 10).join(', ') || 'None')}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "actionItems": [
    { "title": "what AI is doing or recommends", "description": "detailed explanation", "priority": "high|medium|low", "category": "content|revenue|growth|compliance|wellness", "status": "auto_handled|needs_review" }
  ],
  "opportunities": [
    { "title": "opportunity name", "description": "why this is an opportunity", "potentialImpact": "$500/mo or 10K views", "urgency": "act_now|this_week|this_month" }
  ],
  "todaySummary": "What AI is working on today - 2-3 sentences"
}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const actResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 8000,
      });
      const actContent = actResponse.choices[0]?.message?.content;
      if (!actContent) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error("No response from AI");
      }
      return JSON.parse(actContent);
    } catch (err: any) {
      if (attempt === 0 && !err.message?.includes("rate")) { await new Promise(r => setTimeout(r, 1000)); continue; }
      throw err;
    }
  }
  return { actionItems: [], opportunities: [], todaySummary: "AI is analyzing your channel data. Check back shortly." };
}

export async function aiBrandAnalysis(data: {
  channelName: string;
  recentTitles: string[];
  videoCount: number;
}, userId?: string) {
  const creatorContext = await getCreatorContext(userId);
  const prompt = `You are a brand analysis AI. Analyze this creator's content to auto-detect their brand identity.

Channel: "${sanitizeForPrompt(data.channelName)}"
Videos: ${sanitizeForPrompt(data.videoCount)}
Recent Titles: ${sanitizeForPrompt(data.recentTitles.slice(0, 15).join(', ') || 'None')}
${creatorContext ? `\n${creatorContext}` : ''}

Respond as JSON:
{
  "brandVoice": "description of detected brand voice/tone",
  "targetAudience": "who the content targets",
  "contentPillars": ["3-5 core content themes"],
  "uniqueValue": "what makes this creator unique",
  "suggestedColors": ["#hex1", "#hex2", "#hex3"],
  "suggestedTagline": "a brand tagline suggestion",
  "competitors": [
    { "name": "competitor channel name", "similarity": 0.8, "differentiator": "what sets you apart" }
  ],
  "brandStrength": 75
}`;

  const brandResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });
  const brandContent = brandResponse.choices[0]?.message?.content;
  if (!brandContent) throw new Error("No response from AI");
  return JSON.parse(brandContent);
}

export async function aiScriptWriter(data: { topic: string; style?: string; duration?: string; channelName?: string; recentTitles?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `You are an expert video scriptwriter. Write a complete, ready-to-record video script.
Topic: "${sanitizeForPrompt(data.topic)}"
Style: ${sanitizeForPrompt(data.style || "entertaining and educational")}
Target Duration: ${sanitizeForPrompt(data.duration || "10 minutes")}
Channel: ${sanitizeForPrompt(data.channelName || "Creator Channel")}
Recent Videos: ${sanitizeForPrompt(data.recentTitles?.slice(0, 5).join(", ") || "None")}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "title": "optimized video title",
  "hook": "attention-grabbing first 5 seconds",
  "sections": [{"heading": "section name", "content": "full script text for this section", "duration": "estimated time", "notes": "visual/editing notes"}],
  "cta": "call to action script",
  "thumbnailIdea": "thumbnail concept description",
  "tags": ["tag1", "tag2"],
  "estimatedDuration": "total estimated duration",
  "chapters": [{"time": "0:00", "title": "chapter title"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 10000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailConcepts(data: { videoTitle: string; category?: string; channelName?: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Generate 3 high-CTR thumbnail concepts for this video. Be specific about visual composition.
Title: "${sanitizeForPrompt(data.videoTitle)}"
Category: ${sanitizeForPrompt(data.category || "General")}
Channel: ${sanitizeForPrompt(data.channelName || "Creator")}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "concepts": [
    {"layout": "description of visual layout", "text": "text overlay (max 4 words)", "emotion": "facial expression/mood", "colors": ["primary", "accent"], "style": "photo-realistic|illustrated|mixed", "predictedCTR": "8-12%", "reason": "why this works"}
  ],
  "bestPractices": ["tip1", "tip2"],
  "avoidList": ["what not to do"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 6000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChapterMarkers(data: { title: string; description?: string; duration?: string }, userId?: string) {
  const p = `Generate YouTube chapter timestamps for this video. Create logical chapter breaks.
Title: "${sanitizeForPrompt(data.title)}"
Description: ${sanitizeForPrompt(data.description || "Not provided")}
Duration: ${sanitizeForPrompt(data.duration || "10:00")}
Respond as JSON:
{
  "chapters": [{"time": "0:00", "title": "chapter title", "description": "brief chapter summary"}],
  "description": "full formatted description with chapters included"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 6000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeywordResearch(data: { niche: string; channelName?: string; existingKeywords?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Perform keyword research for a YouTube creator. Find high-value, achievable keywords.
Niche: "${sanitizeForPrompt(data.niche)}"
Channel: ${sanitizeForPrompt(data.channelName || "Creator")}
Existing Keywords: ${sanitizeForPrompt(data.existingKeywords?.join(", ") || "None")}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "primaryKeywords": [{"keyword": "term", "searchVolume": "high|medium|low", "competition": "high|medium|low", "difficulty": 65, "opportunity": "why target this"}],
  "longTailKeywords": [{"keyword": "long phrase", "searchVolume": "low-medium", "competition": "low", "suggestedTitle": "video title using this keyword"}],
  "trendingKeywords": [{"keyword": "trending term", "trendDirection": "rising|stable|declining", "urgency": "act now|this week|this month"}],
  "contentGaps": [{"topic": "untapped topic", "reason": "why it's a gap", "estimatedViews": "potential views"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRepurposeContent(data: { videoTitle: string; videoDescription?: string; platform: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Repurpose this YouTube video content for ${sanitizeForPrompt(data.platform)}. Generate ready-to-post content.
Video Title: "${sanitizeForPrompt(data.videoTitle)}"
Description: ${sanitizeForPrompt(data.videoDescription || "Not provided")}
Target Platform: ${sanitizeForPrompt(data.platform)}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "platform": "${sanitizeForPrompt(data.platform)}",
  "content": "full ready-to-post content text",
  "headline": "attention-grabbing headline",
  "hashtags": ["#tag1", "#tag2"],
  "mediaInstructions": "what images/clips to include",
  "bestPostTime": "optimal posting time",
  "engagementHooks": ["question or CTA to drive engagement"],
  "characterCount": 280,
  "format": "thread|carousel|article|pin|story|post"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorshipManager(data: { channelName: string; niche?: string; avgViews?: number; subscribers?: number; existingSponsors?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const p = `Act as a sponsorship strategist. Generate a complete sponsorship strategy and outreach plan.
Channel: "${sanitizeForPrompt(data.channelName)}"
Niche: ${sanitizeForPrompt(data.niche || "General")}
Avg Views: ${sanitizeForPrompt(data.avgViews || "Unknown")}
Subscribers: ${sanitizeForPrompt(data.subscribers || "Unknown")}
Current Sponsors: ${sanitizeForPrompt(data.existingSponsors?.join(", ") || "None")}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "rateCard": {"preRoll": "$X", "midRoll": "$X", "dedicated": "$X", "integration": "$X", "shortsMention": "$X"},
  "mediaKit": {"headline": "your value proposition", "keyStats": ["stat1", "stat2"], "audienceSummary": "who watches you", "uniqueSelling": "why brands should work with you"},
  "prospectBrands": [{"brand": "brand name", "fit": "high|medium", "estimatedBudget": "$range", "contactApproach": "how to reach out", "pitchAngle": "what to pitch"}],
  "outreachTemplate": "ready-to-send email template",
  "pricingStrategy": "how to negotiate and price",
  "redFlags": ["things to avoid in deals"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaKit(data: { channelName: string; subscribers?: number; avgViews?: number; niche?: string; totalVideos?: number }, userId?: string) {
  const p = `Generate a professional media kit for a content creator.
Channel: "${sanitizeForPrompt(data.channelName)}"
Subscribers: ${sanitizeForPrompt(data.subscribers || "Growing")}
Avg Views: ${sanitizeForPrompt(data.avgViews || "Growing")}
Niche: ${sanitizeForPrompt(data.niche || "General")}
Total Videos: ${data.totalVideos || 0}
Respond as JSON:
{
  "headline": "creator tagline",
  "bio": "professional bio paragraph",
  "keyMetrics": [{"label": "metric name", "value": "metric value", "trend": "up|stable"}],
  "audienceDemo": {"ageRange": "18-34", "topCountries": ["US", "UK"], "gender": "split", "interests": ["interest1"]},
  "packages": [{"name": "package name", "description": "what's included", "price": "$X", "deliverables": ["item1"]}],
  "pastCollabs": "description of collaboration style",
  "testimonialPrompts": ["suggested testimonial angles"]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamChatBot(data: { channelName: string; streamCategory?: string; customCommands?: string[] }, userId?: string) {
  const p = `Design a complete chatbot configuration for a live stream.
Channel: "${sanitizeForPrompt(data.channelName)}"
Stream Category: ${sanitizeForPrompt(data.streamCategory || "Gaming")}
Existing Commands: ${sanitizeForPrompt(data.customCommands?.join(", ") || "None")}
Respond as JSON:
{
  "commands": [{"trigger": "!command", "response": "bot response text", "cooldown": 30, "category": "info|fun|mod"}],
  "autoMessages": [{"message": "timed message text", "interval": 300, "enabled": true}],
  "moderationRules": [{"rule": "description", "action": "warn|timeout|ban", "severity": "low|medium|high"}],
  "loyaltySystem": {"pointName": "currency name", "earnRate": "points per minute", "rewards": [{"name": "reward", "cost": 100}]},
  "welcomeMessage": "greeting for new chatters",
  "raidMessage": "thank you message for raids"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamChecklist(data: { streamType?: string; platforms?: string[] }, userId?: string) {
  const p = `Generate a comprehensive pre-stream and post-stream checklist.
Stream Type: ${sanitizeForPrompt(data.streamType || "Gaming")}
Platforms: ${sanitizeForPrompt(data.platforms?.join(", ") || "YouTube, Twitch")}
Respond as JSON:
{
  "preStream": [{"item": "checklist item", "category": "technical|content|social", "priority": "critical|important|nice", "autoCheck": true}],
  "duringStream": [{"item": "reminder during stream", "timing": "every 30 min|start|end"}],
  "postStream": [{"item": "post-stream task", "category": "content|social|analytics", "automatable": true}],
  "emergencyPlan": [{"scenario": "what could go wrong", "solution": "how to handle it"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRaidStrategy(data: { channelName: string; category?: string; viewers?: number }, userId?: string) {
  const p = `Develop a raid/host strategy for a live streamer.
Channel: "${sanitizeForPrompt(data.channelName)}"
Category: ${sanitizeForPrompt(data.category || "Gaming")}
Average Viewers: ${sanitizeForPrompt(data.viewers || "Growing")}
Respond as JSON:
{
  "raidTargets": [{"channel": "suggested channel to raid", "reason": "why raid them", "bestTiming": "when to raid", "audienceOverlap": "high|medium|low"}],
  "raidEtiquette": ["best practice tips"],
  "networkingStrategy": "how to build raid partnerships",
  "incomingRaidPlan": "how to welcome incoming raids",
  "raidMessage": "customized raid message template"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 6000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPostStreamReport(data: { streamTitle: string; duration?: string; peakViewers?: number; avgViewers?: number; chatMessages?: number; newFollowers?: number }, userId?: string) {
  const p = `Generate a comprehensive post-stream performance report with actionable insights.
Stream: "${sanitizeForPrompt(data.streamTitle)}"
Duration: ${sanitizeForPrompt(data.duration || "Unknown")}
Peak Viewers: ${data.peakViewers || 0}
Average Viewers: ${data.avgViewers || 0}
Chat Messages: ${data.chatMessages || 0}
New Followers: ${data.newFollowers || 0}
Respond as JSON:
{
  "grade": "A+|A|B|C|D",
  "summary": "overall performance summary",
  "highlights": ["what went well"],
  "improvements": ["what to improve next time"],
  "chatEngagement": "analysis of chat activity",
  "viewerRetention": "analysis of viewer retention patterns",
  "recommendations": [{"action": "specific recommendation", "impact": "high|medium|low", "timeframe": "next stream|this week|this month"}],
  "clipSuggestions": ["moments worth clipping"],
  "socialPosts": [{"platform": "TikTok", "content": "ready-to-post recap"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPLReport(data: { totalRevenue: number; totalExpenses: number; revenueBySource: Record<string, number>; expensesByCategory: Record<string, number>; period?: string }, userId?: string) {
  const p = `Generate a professional Profit & Loss analysis for a content creator business.
Period: ${sanitizeForPrompt(data.period || "Current")}
Total Revenue: $${sanitizeForPrompt(data.totalRevenue)}
Total Expenses: $${sanitizeForPrompt(data.totalExpenses)}
Net Profit: $${data.totalRevenue - data.totalExpenses}
Revenue Sources: ${JSON.stringify(sanitizeObjectForPrompt(data.revenueBySource))}
Expense Categories: ${JSON.stringify(sanitizeObjectForPrompt(data.expensesByCategory))}
Respond as JSON:
{
  "summary": "executive summary",
  "profitMargin": "${Math.round(((data.totalRevenue - data.totalExpenses) / Math.max(data.totalRevenue, 1)) * 100)}%",
  "healthGrade": "A|B|C|D|F",
  "insights": [{"area": "area name", "finding": "what the data shows", "recommendation": "what to do"}],
  "topRevenueStream": "highest earning source",
  "biggestExpense": "largest expense category",
  "costCuttingOpps": [{"expense": "what to cut", "savings": "estimated savings", "risk": "low|medium|high"}],
  "growthOpps": [{"opportunity": "revenue growth idea", "estimatedIncrease": "$X", "effort": "low|medium|high"}],
  "taxImplications": "tax-relevant observations",
  "quarterlyProjection": {"revenue": "$X", "expenses": "$X", "profit": "$X"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeamManager(data: { teamSize?: number; contentVolume?: string; currentRoles?: string[] }, userId?: string) {
  const p = `Design an optimal team structure and workflow for a content creator.
Current Team Size: ${data.teamSize || 1}
Content Volume: ${sanitizeForPrompt(data.contentVolume || "2-3 videos per week")}
Current Roles: ${sanitizeForPrompt(data.currentRoles?.join(", ") || "Creator only")}
Respond as JSON:
{
  "recommendedRoles": [{"role": "role title", "responsibilities": ["task1"], "priority": "hire now|next hire|future", "estimatedCost": "$X/month", "roi": "how this role pays for itself"}],
  "workflow": [{"step": "workflow step", "assignedTo": "role", "estimatedTime": "time", "automatable": true}],
  "approvalFlow": {"steps": ["step1: editor submits", "step2: creator reviews"], "turnaround": "24-48 hours"},
  "delegationPlan": [{"task": "task to delegate", "from": "creator", "to": "role", "timeSaved": "hours/week"}],
  "communicationPlan": "how team should communicate",
  "tools": [{"tool": "tool name", "purpose": "what it's for", "cost": "free|$X/month"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutomationBuilder(data: { currentWorkflow?: string; painPoints?: string[]; platforms?: string[] }, userId?: string) {
  const p = `Design a comprehensive automation system for a content creator's workflow.
Current Workflow: ${sanitizeForPrompt(data.currentWorkflow || "Manual content creation and publishing")}
Pain Points: ${sanitizeForPrompt(data.painPoints?.join(", ") || "Time-consuming manual tasks")}
Platforms: ${sanitizeForPrompt(data.platforms?.join(", ") || "YouTube, TikTok, Discord")}
Respond as JSON:
{
  "automations": [{"name": "automation name", "trigger": "what starts it", "actions": ["action1", "action2"], "timeSaved": "hours/week", "complexity": "simple|moderate|complex", "enabled": true}],
  "chains": [{"name": "chain name", "description": "multi-step automation", "steps": [{"step": "step description", "tool": "tool used", "delay": "wait time"}]}],
  "schedules": [{"name": "scheduled task", "frequency": "daily|weekly|monthly", "time": "best time to run", "description": "what it does"}],
  "integrations": [{"service": "external service", "purpose": "why integrate", "automations": ["what can be automated"]}],
  "estimatedTimeSaved": "total hours saved per week"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorAcademy(data: { skillLevel?: string; goals?: string[]; niche?: string }, userId?: string) {
  const p = `Generate a personalized learning curriculum for a content creator.
Skill Level: ${sanitizeForPrompt(data.skillLevel || "intermediate")}
Goals: ${sanitizeForPrompt(data.goals?.join(", ") || "Grow channel, increase revenue")}
Niche: ${sanitizeForPrompt(data.niche || "General")}
Respond as JSON:
{
  "curriculum": [{"module": "module name", "lessons": [{"title": "lesson title", "description": "what you'll learn", "duration": "time", "type": "video|article|exercise"}], "skillLevel": "beginner|intermediate|advanced", "category": "growth|monetization|production|marketing"}],
  "skillTree": [{"skill": "skill name", "level": 1, "maxLevel": 5, "prerequisite": "required skill or null", "impact": "how this skill helps your channel"}],
  "weeklyPlan": [{"day": "Monday", "focus": "area of focus", "tasks": ["task1", "task2"], "duration": "1-2 hours"}],
  "milestones": [{"milestone": "achievement name", "criteria": "how to earn it", "reward": "what you unlock"}],
  "recommendedResources": [{"title": "resource name", "type": "course|book|tool", "url": "where to find it", "relevance": "why it matters"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsFeed(userId?: string) {
  const p = `Generate a creator-focused industry news briefing covering the latest platform updates, algorithm changes, creator economy trends, and opportunities.
Respond as JSON:
{
  "headlines": [{"title": "news headline", "summary": "brief summary", "impact": "how this affects creators", "platform": "YouTube|TikTok|General|All", "urgency": "act now|monitor|fyi", "category": "algorithm|monetization|feature|trend|legal"}],
  "algorithmUpdates": [{"platform": "platform name", "change": "what changed", "recommendation": "how to adapt"}],
  "opportunities": [{"title": "opportunity", "description": "details", "deadline": "time-sensitive or ongoing", "estimatedBenefit": "potential benefit"}],
  "creatorEconomyPulse": "overall state of the creator economy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMilestoneEngine(data: { subscribers?: number; totalViews?: number; totalVideos?: number; channelAge?: string; revenue?: number }, userId?: string) {
  const p = `Track and celebrate creator milestones. Identify recent achievements and upcoming goals.
Subscribers: ${data.subscribers || 0}
Total Views: ${data.totalViews || 0}
Total Videos: ${data.totalVideos || 0}
Channel Age: ${sanitizeForPrompt(data.channelAge || "Unknown")}
Revenue: $${data.revenue || 0}
Respond as JSON:
{
  "recentMilestones": [{"title": "milestone name", "description": "what was achieved", "celebrationPost": "ready-to-post celebration message", "icon": "trophy|star|rocket|fire|crown"}],
  "upcomingMilestones": [{"title": "next milestone", "current": "current value", "target": "target value", "progress": 75, "estimatedDate": "when you'll hit it", "tips": "how to get there faster"}],
  "streaks": [{"name": "streak name", "current": 5, "best": 10, "description": "what the streak tracks"}],
  "yearInReview": {"topVideo": "best performing video concept", "growth": "growth summary", "totalEarnings": "earnings summary"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossplatformAnalytics(data: { platforms: string[]; videoCount?: number; totalRevenue?: number; channelName?: string }, userId?: string) {
  const p = `Analyze cross-platform performance and provide strategic recommendations for a multi-platform creator.
Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}
Videos: ${data.videoCount || 0}
Revenue: $${data.totalRevenue || 0}
Channel: ${sanitizeForPrompt(data.channelName || "Creator")}
Respond as JSON:
{
  "platformScores": [{"platform": "name", "score": 85, "strengths": ["strength1"], "weaknesses": ["weakness1"], "growthPotential": "high|medium|low"}],
  "audienceOverlap": "analysis of audience overlap between platforms",
  "bestPerforming": "top performing platform and why",
  "underutilized": "platform with most untapped potential",
  "contentStrategy": [{"platform": "name", "recommendedContent": "what to post", "frequency": "how often", "bestTimes": "when to post"}],
  "revenueBreakdown": [{"platform": "name", "estimatedRevenue": "$X", "growthTip": "how to earn more here"}],
  "synergies": [{"from": "platform1", "to": "platform2", "strategy": "how to cross-promote"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommentManager(data: { comments?: Array<{ text: string; author: string }>; channelName?: string }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const comments = data.comments || [];
  const p = `Analyze these comments and draft personalized replies in the creator's voice. Also identify superfans and sentiment.
Channel: ${sanitizeForPrompt(data.channelName || "Creator")}
Comments: ${JSON.stringify(comments.slice(0, 20).map(c => ({ text: sanitizeForPrompt(c.text), author: sanitizeForPrompt(c.author) })))}
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "replies": [{"originalComment": "the comment", "author": "commenter name", "suggestedReply": "personalized reply", "sentiment": "positive|neutral|negative", "priority": "high|medium|low"}],
  "superfans": [{"name": "fan name", "reason": "why they're a superfan"}],
  "sentimentOverview": {"positive": 70, "neutral": 20, "negative": 10},
  "commonQuestions": ["frequently asked question"],
  "contentIdeasFromComments": ["idea inspired by comments"],
  "toxicComments": [{"comment": "toxic text", "action": "hide|report|ignore"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 8000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabMatchmaker(data: { channelName: string; niche?: string; subscribers?: number; style?: string }, userId?: string) {
  const p = `Find ideal collaboration partners for this creator. Suggest specific creators and collab formats.
Channel: "${sanitizeForPrompt(data.channelName)}"
Niche: ${sanitizeForPrompt(data.niche || "General")}
Subscribers: ${sanitizeForPrompt(data.subscribers || "Growing")}
Style: ${sanitizeForPrompt(data.style || "Not specified")}
Respond as JSON:
{
  "idealPartners": [{"type": "creator type to look for", "audienceSize": "similar|larger|smaller", "nicheOverlap": "high|medium|complementary", "collabFormat": "suggested collab format", "outreachTemplate": "ready-to-send message", "expectedBenefit": "what you'll gain"}],
  "collabFormats": [{"format": "collab type", "description": "how it works", "effort": "low|medium|high", "impact": "subscriber/view potential"}],
  "networkingTips": ["tip for building creator relationships"],
  "collabCalendar": "suggested frequency and timing for collabs"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWellnessAdvisor(data: { hoursWorked?: number; videosThisWeek?: number; streamsThisWeek?: number; lastBreak?: string; mood?: string }, userId?: string) {
  const p = `Assess this creator's wellness and provide burnout prevention advice.
Hours Worked This Week: ${sanitizeForPrompt(data.hoursWorked || "Unknown")}
Videos Published: ${data.videosThisWeek || 0}
Streams This Week: ${data.streamsThisWeek || 0}
Last Break: ${sanitizeForPrompt(data.lastBreak || "Unknown")}
Current Mood: ${sanitizeForPrompt(data.mood || "Not specified")}
Respond as JSON:
{
  "burnoutRisk": "low|moderate|high|critical",
  "burnoutScore": 35,
  "assessment": "current wellness assessment",
  "recommendations": [{"action": "what to do", "priority": "now|today|this week", "category": "rest|exercise|social|creative|boundaries"}],
  "breakSuggestion": {"duration": "how long to take off", "activities": ["suggested activities"], "bestDay": "when to take the break"},
  "batchSchedule": {"recordingDays": ["Tuesday", "Wednesday"], "editingDays": ["Thursday"], "offDays": ["Saturday", "Sunday"], "reason": "why this schedule works"},
  "incomeStability": "assessment of income stability for taking breaks",
  "creativeBlock": {"hasBlock": false, "exercises": ["creative unblocking exercises"]}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSEOAudit(data: { videoTitle: string; description?: string; tags?: string[]; thumbnailDesc?: string }, userId?: string) {
  const p = `Perform a comprehensive SEO audit on this YouTube video. Score and provide specific improvements.
Title: "${sanitizeForPrompt(data.videoTitle)}"
Description: ${sanitizeForPrompt(data.description || "Not provided")}
Tags: ${sanitizeForPrompt(data.tags?.join(", ") || "None")}
Respond as JSON:
{
  "overallScore": 72,
  "titleScore": {"score": 80, "issues": ["issue1"], "suggestions": ["better title option"]},
  "descriptionScore": {"score": 65, "issues": ["issue1"], "optimizedDescription": "improved description text"},
  "tagScore": {"score": 70, "missingTags": ["tag1"], "irrelevantTags": ["tag2"], "optimizedTags": ["tag1", "tag2"]},
  "thumbnailScore": {"score": 75, "suggestions": ["improvement1"]},
  "competitorComparison": "how this compares to top-ranking videos",
  "quickWins": [{"fix": "easy improvement", "impact": "high|medium|low", "effort": "5 min|15 min|30 min"}],
  "optimizedTitle": "SEO-optimized title suggestion"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentCalendarPlanner(data: { channelName: string; niche?: string; frequency?: string; upcomingEvents?: string[] }, userId?: string) {
  const ctx = await getCreatorContext(userId);
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();
  const isQ4 = currentMonth >= 9 && currentMonth <= 11;
  const isApproachingQ4 = currentMonth === 8; // September
  const q4MonthName = ["October", "November", "December"][currentMonth - 9] || "";
  const q4Context = isQ4
    ? `IMPORTANT: We are currently in Q4 (${q4MonthName} ${currentYear}). Advertiser spend is 3-5x higher than January. THIS IS THE HIGHEST-CPM PERIOD OF THE YEAR for gaming content. Schedule your highest-effort, best-produced videos NOW. Don't waste this window on routine uploads.`
    : isApproachingQ4
    ? `IMPORTANT: Q4 (October-December ${currentYear}) begins next month. Q4 RPMs run 3-5x higher than January — the biggest revenue opportunity of the year. Plan your highest-quality content to drop in Q4. Use September to batch-record and prepare.`
    : `NOTE: Q4 (October-December) has 3-5x higher ad RPMs than January. If planning extends into Q4, mark those weeks as HIGH-VALUE — highest-effort content should land there.`;
  const p = `Generate a complete 30-day content calendar with specific video ideas, publishing schedule, and platform distribution.
Channel: "${sanitizeForPrompt(data.channelName)}"
Niche: ${sanitizeForPrompt(data.niche || "General")}
Publishing Frequency: ${sanitizeForPrompt(data.frequency || "3x per week")}
Upcoming Events: ${sanitizeForPrompt(data.upcomingEvents?.join(", ") || "None specified")}
Today: ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

${q4Context}

2026 ALGORITHM CONTEXT:
- Satisfaction over watch time: deliver value in the first 5 seconds, cut padding
- 3x long-form per week is the growth sweet spot for established channels
- Channels combining Shorts with long-form grow 41% faster
- Responding to 50+ comments in first 2 hours correlates with 15-20% higher reach
- Q4 = schedule your hero content (highest production value, most searched topics)
${ctx ? `\n${ctx}` : ""}
Respond as JSON:
{
  "monthPlan": [{"week": 1, "theme": "weekly theme", "isQ4Week": false, "videos": [{"day": "Monday", "title": "video title", "type": "long-form|short|live", "platform": "YouTube", "description": "brief concept", "priority": "hero|hub|help", "targetSurface": "home|suggested|search|shorts", "q4Priority": false}]}],
  "contentMix": {"longForm": 60, "shorts": 30, "live": 10},
  "themes": ["weekly theme ideas"],
  "seasonalOpportunities": [{"event": "holiday/event", "date": "when", "contentIdea": "what to create", "revenueImpact": "high|medium|low"}],
  "batchRecordingPlan": {"day": "best day to batch record", "videosPerSession": 3, "prepTime": "30 min per video"},
  "q4Strategy": "specific Q4 revenue maximization plan for this channel"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 10000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStoryboardGenerator(data: { scriptText?: string; videoTitle?: string; scenes?: number }, userId?: string) {
  const p = `Generate a scene-by-scene storyboard with visual descriptions, camera angles, and transitions.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.scriptText ? `Script: ${sanitizeForPrompt(data.scriptText)}` : ""}
${data.scenes ? `Number of Scenes: ${sanitizeForPrompt(data.scenes)}` : ""}
Respond as JSON:
{
  "scenes": [{"sceneNumber": 1, "visualDescription": "description", "cameraAngle": "angle", "transition": "cut type", "duration": "seconds", "notes": "additional notes"}],
  "totalDuration": "estimated total duration",
  "mood": "overall mood"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiColorGradingAdvisor(data: { genre?: string; mood?: string; platform?: string }, userId?: string) {
  const p = `Recommend color palettes and grading styles for video content.
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
${data.mood ? `Mood: ${sanitizeForPrompt(data.mood)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "recommendedPalette": {"primary": "#hex", "secondary": "#hex", "accent": "#hex"},
  "gradingStyle": "style name",
  "lut": "recommended LUT",
  "warmth": "warm/cool/neutral",
  "contrast": "high/medium/low",
  "examples": [{"style": "style name", "description": "description"}]
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIntroOutroCreator(data: { channelName?: string; niche?: string; style?: string }, userId?: string) {
  const p = `Generate branded intro and outro concepts for a video channel.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "intro": {"duration": "seconds", "concept": "description", "music": "music style", "textOverlay": "text content", "animation": "animation type"},
  "outro": {"duration": "seconds", "concept": "description", "elements": ["element1"], "cta": "call to action"},
  "brandConsistency": "tips for brand consistency"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSoundEffectsRecommender(data: { videoType?: string; scenes?: string[]; mood?: string }, userId?: string) {
  const p = `Suggest sound effects timing and placement for video content.
${data.videoType ? `Video Type: ${sanitizeForPrompt(data.videoType)}` : ""}
${data.scenes ? `Scenes: ${sanitizeForPrompt(data.scenes.join(", "))}` : ""}
${data.mood ? `Mood: ${sanitizeForPrompt(data.mood)}` : ""}
Respond as JSON:
{
  "effects": [{"timestamp": "time", "effect": "effect name", "category": "category", "source": "source suggestion", "purpose": "why this effect"}],
  "ambientSounds": "ambient sound recommendations",
  "musicTransitions": "music transition suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPacingAnalyzer(data: { videoDuration?: string; genre?: string; avgRetention?: number }, userId?: string) {
  const p = `Analyze video pacing and suggest improvements for better audience retention.
${data.videoDuration ? `Video Duration: ${sanitizeForPrompt(data.videoDuration)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
${data.avgRetention ? `Average Retention: ${sanitizeForPrompt(data.avgRetention)}%` : ""}
Respond as JSON:
{
  "currentPacing": "assessment of current pacing",
  "idealPacing": "recommended pacing strategy",
  "speedUpSections": [{"from": "timestamp", "to": "timestamp", "reason": "why speed up"}],
  "slowDownSections": "sections to slow down",
  "hookTiming": "ideal hook timing",
  "payoffTiming": "ideal payoff timing",
  "overallScore": 75
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTalkingPointsGenerator(data: { topic?: string; duration?: string; style?: string }, userId?: string) {
  const p = `Generate bullet-point talking guides for unscripted video content.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.duration ? `Target Duration: ${sanitizeForPrompt(data.duration)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "talkingPoints": [{"point": "main point", "subPoints": ["sub point 1"], "timing": "suggested timing", "transition": "transition to next point"}],
  "openingHook": "hook to start with",
  "closingCta": "closing call to action",
  "segueIdeas": "ideas for natural segues"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoLengthOptimizer(data: { topic?: string; niche?: string; platform?: string; avgRetention?: number }, userId?: string) {
  const p = `Recommend the ideal video length based on topic, niche, and platform data.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.avgRetention ? `Average Retention: ${sanitizeForPrompt(data.avgRetention)}%` : ""}
Respond as JSON:
{
  "idealLength": "recommended length",
  "reasoning": "why this length",
  "retentionPrediction": "predicted retention",
  "platformOptimal": {"youtube": "optimal for youtube", "tiktok": "optimal for tiktok", "instagram": "optimal for instagram"},
  "segmentBreakdown": "how to structure segments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiFormatExporter(data: { videoTitle?: string; originalFormat?: string; targetPlatforms?: string[] }, userId?: string) {
  const p = `Provide auto-resize specifications for exporting video to multiple platforms.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.originalFormat ? `Original Format: ${sanitizeForPrompt(data.originalFormat)}` : ""}
${data.targetPlatforms ? `Target Platforms: ${sanitizeForPrompt(data.targetPlatforms.join(", "))}` : ""}
Respond as JSON:
{
  "formats": [{"platform": "platform name", "aspectRatio": "ratio", "resolution": "resolution", "maxDuration": "max duration", "fileSize": "max file size", "captionStyle": "caption style"}],
  "exportOrder": "recommended export order",
  "priorities": "prioritization strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatermarkManager(data: { channelName?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a watermark strategy for video distribution across platforms.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "watermarkDesign": "design description",
  "placement": "recommended placement",
  "opacity": "recommended opacity",
  "platforms": [{"name": "platform", "required": true, "position": "position"}],
  "removalStrategy": "when and how to handle removal"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGreenScreenAdvisor(data: { contentType?: string; mood?: string; genre?: string }, userId?: string) {
  const p = `Recommend virtual backgrounds and green screen setups for video content.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.mood ? `Mood: ${sanitizeForPrompt(data.mood)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON:
{
  "backgrounds": [{"name": "background name", "style": "style", "mood": "mood", "colorScheme": "colors", "useCases": "when to use"}],
  "lightingTips": "lighting recommendations",
  "keyingAdvice": "chroma key best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeleprompterFormatter(data: { script?: string; speakingSpeed?: string }, userId?: string) {
  const p = `Format a script for teleprompter use with timing and emphasis marks.
${data.script ? `Script: ${sanitizeForPrompt(data.script)}` : ""}
${data.speakingSpeed ? `Speaking Speed: ${sanitizeForPrompt(data.speakingSpeed)}` : ""}
Respond as JSON:
{
  "formattedScript": "formatted script text",
  "wordsPerMinute": 150,
  "estimatedDuration": "estimated duration",
  "breathMarks": "where to breathe",
  "emphasisMarks": "words to emphasize",
  "pausePoints": "where to pause"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSceneTransitionRecommender(data: { videoType?: string; pacing?: string; scenes?: number }, userId?: string) {
  const p = `Recommend transitions between video scenes based on content type and pacing.
${data.videoType ? `Video Type: ${sanitizeForPrompt(data.videoType)}` : ""}
${data.pacing ? `Pacing: ${sanitizeForPrompt(data.pacing)}` : ""}
${data.scenes ? `Number of Scenes: ${sanitizeForPrompt(data.scenes)}` : ""}
Respond as JSON:
{
  "transitions": [{"fromScene": 1, "toScene": 2, "type": "transition type", "duration": "duration", "reasoning": "why this transition"}],
  "avoidList": "transitions to avoid",
  "styleTips": "general style tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoQualityEnhancer(data: { currentResolution?: string; fps?: number; bitrate?: string }, userId?: string) {
  const p = `Suggest video quality improvements based on current settings.
${data.currentResolution ? `Current Resolution: ${sanitizeForPrompt(data.currentResolution)}` : ""}
${data.fps ? `FPS: ${sanitizeForPrompt(data.fps)}` : ""}
${data.bitrate ? `Bitrate: ${sanitizeForPrompt(data.bitrate)}` : ""}
Respond as JSON:
{
  "recommendations": [{"setting": "setting name", "current": "current value", "recommended": "recommended value", "impact": "expected impact"}],
  "exportSettings": "optimal export settings",
  "platformOptimal": "platform-specific quality tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAspectRatioOptimizer(data: { videoTitle?: string; targetPlatforms?: string[] }, userId?: string) {
  const p = `Recommend platform-specific aspect ratios and cropping strategies.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.targetPlatforms ? `Target Platforms: ${sanitizeForPrompt(data.targetPlatforms.join(", "))}` : ""}
Respond as JSON:
{
  "ratios": [{"platform": "platform", "ratio": "aspect ratio", "resolution": "resolution", "cropStrategy": "how to crop"}],
  "masterFormat": "recommended master format",
  "reframeNotes": "reframing recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLowerThirdGenerator(data: { channelName?: string; style?: string; colors?: string[] }, userId?: string) {
  const p = `Generate lower third text overlay designs for video content.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
${data.colors ? `Colors: ${sanitizeForPrompt(data.colors.join(", "))}` : ""}
Respond as JSON:
{
  "designs": [{"name": "design name", "font": "font family", "animation": "animation type", "position": "screen position", "colors": "color scheme", "useCase": "when to use"}],
  "brandAlignment": "brand alignment tips",
  "accessibilityScore": 85
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCtaOverlayDesigner(data: { ctaType?: string; placement?: string; videoType?: string }, userId?: string) {
  const p = `Design call-to-action overlays for video content.
${data.ctaType ? `CTA Type: ${sanitizeForPrompt(data.ctaType)}` : ""}
${data.placement ? `Placement: ${sanitizeForPrompt(data.placement)}` : ""}
${data.videoType ? `Video Type: ${sanitizeForPrompt(data.videoType)}` : ""}
Respond as JSON:
{
  "overlays": [{"type": "overlay type", "text": "CTA text", "position": "position", "timing": "when to show", "animation": "animation style", "design": "design description"}],
  "bestPractices": "CTA best practices",
  "abTestIdeas": "A/B testing suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSplitScreenBuilder(data: { contentType?: string; participants?: number }, userId?: string) {
  const p = `Recommend split screen layouts for multi-participant or multi-angle video content.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.participants ? `Number of Participants: ${sanitizeForPrompt(data.participants)}` : ""}
Respond as JSON:
{
  "layouts": [{"name": "layout name", "grid": "grid description", "sizing": "sizing details", "bestFor": "best use case"}],
  "audioMixing": "audio mixing recommendations",
  "transitionTips": "transition tips between layouts"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeLapseAdvisor(data: { subject?: string; duration?: string }, userId?: string) {
  const p = `Provide time-lapse and slow-motion guidance for video production.
${data.subject ? `Subject: ${sanitizeForPrompt(data.subject)}` : ""}
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON:
{
  "timeLapse": {"intervalSeconds": 5, "totalDuration": "total duration", "bestSubjects": "best subjects for time-lapse", "tips": "time-lapse tips"},
  "slowMo": {"fps": 240, "bestMoments": "best moments for slow-mo", "editingTips": "editing tips for slow-mo"}
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFootageOrganizer(data: { clipCount?: number; projectType?: string }, userId?: string) {
  const p = `Create a strategy for tagging and sorting raw video clips.
${data.clipCount ? `Number of Clips: ${sanitizeForPrompt(data.clipCount)}` : ""}
${data.projectType ? `Project Type: ${sanitizeForPrompt(data.projectType)}` : ""}
Respond as JSON:
{
  "folderStructure": "recommended folder structure",
  "namingConvention": "file naming convention",
  "tags": [{"category": "tag category", "examples": "example tags"}],
  "workflow": "organizing workflow",
  "backupStrategy": "backup recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioLevelingAdvisor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Provide audio leveling guidance for video content.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "targetLUFS": -14,
  "voiceLevel": "voice level recommendation",
  "musicLevel": "music level recommendation",
  "sfxLevel": "SFX level recommendation",
  "compressionSettings": "compression settings",
  "normalization": "normalization advice",
  "platformStandards": "platform-specific audio standards"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackgroundNoiseDetector(data: { environment?: string; micType?: string }, userId?: string) {
  const p = `Detect common background noise issues and provide fixes for video audio.
${data.environment ? `Recording Environment: ${sanitizeForPrompt(data.environment)}` : ""}
${data.micType ? `Microphone Type: ${sanitizeForPrompt(data.micType)}` : ""}
Respond as JSON:
{
  "commonNoises": [{"type": "noise type", "fix": "how to fix", "prevention": "how to prevent"}],
  "softwareRecommendations": "software tools to remove noise",
  "hardwareTips": "hardware recommendations",
  "idealEnvironment": "ideal recording environment setup"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiJumpCutDetector(data: { editingStyle?: string; genre?: string }, userId?: string) {
  const p = `Provide jump cut best practices and alternatives for video editing.
${data.editingStyle ? `Editing Style: ${sanitizeForPrompt(data.editingStyle)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON:
{
  "idealFrequency": "ideal jump cut frequency",
  "alternatives": "alternatives to jump cuts",
  "whenToUse": "when jump cuts work best",
  "whenToAvoid": "when to avoid jump cuts",
  "smoothTransitions": "smooth transition techniques",
  "bRollSuggestions": "B-roll suggestions to cover cuts"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCinematicShotPlanner(data: { genre?: string; equipment?: string; location?: string }, userId?: string) {
  const p = `Plan cinematic shots for professional video production.
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
${data.equipment ? `Equipment: ${sanitizeForPrompt(data.equipment)}` : ""}
${data.location ? `Location: ${sanitizeForPrompt(data.location)}` : ""}
Respond as JSON:
{
  "shots": [{"name": "shot name", "description": "shot description", "equipment": "equipment needed", "movement": "camera movement", "framing": "framing details", "lighting": "lighting setup"}],
  "shotList": "complete shot list",
  "lightingSetup": "overall lighting setup"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoCompressionOptimizer(data: { platform?: string; resolution?: string; fileSize?: string }, userId?: string) {
  const p = `Optimize video compression settings for the best quality-to-size ratio.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.resolution ? `Resolution: ${sanitizeForPrompt(data.resolution)}` : ""}
${data.fileSize ? `Current File Size: ${sanitizeForPrompt(data.fileSize)}` : ""}
Respond as JSON:
{
  "codec": "recommended codec",
  "bitrate": "recommended bitrate",
  "preset": "encoding preset",
  "quality": "quality setting",
  "estimatedSize": "estimated output size",
  "platformLimits": "platform upload limits",
  "exportSettings": "complete export settings"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailABTester(data: { videoTitle?: string; currentCTR?: number }, userId?: string) {
  const p = `Create an A/B test strategy for video thumbnails to improve click-through rate.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.currentCTR ? `Current CTR: ${sanitizeForPrompt(data.currentCTR)}%` : ""}
Respond as JSON:
{
  "variants": [{"concept": "thumbnail concept", "colorScheme": "colors", "textOverlay": "text on thumbnail", "emotionTarget": "target emotion", "predictedCTR": 5.5}],
  "testDuration": "recommended test duration",
  "sampleSize": "minimum sample size",
  "metrics": "metrics to track"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailCTRPredictor(data: { thumbnailDescription?: string; title?: string; niche?: string }, userId?: string) {
  const p = `Predict thumbnail click-through rate and provide improvement suggestions.
${data.thumbnailDescription ? `Thumbnail Description: ${sanitizeForPrompt(data.thumbnailDescription)}` : ""}
${data.title ? `Video Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "predictedCTR": 4.5,
  "score": 72,
  "strengths": "thumbnail strengths",
  "weaknesses": "thumbnail weaknesses",
  "improvements": [{"change": "suggested change", "expectedLift": "expected CTR improvement"}],
  "competitorBenchmark": "how it compares to competitors"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailStyleLibrary(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Curate thumbnail style templates for a content channel.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "description": "style description", "colorPalette": "color palette", "fontStyle": "font style", "layout": "layout description", "bestFor": "best use case"}],
  "trendingStyles": "currently trending thumbnail styles",
  "nicheTop": "top performing styles in this niche"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFaceExpressionAnalyzer(data: { emotionTarget?: string; thumbnailType?: string }, userId?: string) {
  const p = `Analyze facial expressions for thumbnail effectiveness.
${data.emotionTarget ? `Target Emotion: ${sanitizeForPrompt(data.emotionTarget)}` : ""}
${data.thumbnailType ? `Thumbnail Type: ${sanitizeForPrompt(data.thumbnailType)}` : ""}
Respond as JSON:
{
  "bestExpressions": [{"emotion": "emotion name", "description": "expression description", "effectiveness": "effectiveness rating"}],
  "composition": "face composition tips",
  "eyeDirection": "where eyes should look",
  "facePlacement": "where to place face in thumbnail"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailTextOptimizer(data: { title?: string; thumbnailText?: string }, userId?: string) {
  const p = `Optimize text placement and styling on video thumbnails.
${data.title ? `Video Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.thumbnailText ? `Current Thumbnail Text: ${sanitizeForPrompt(data.thumbnailText)}` : ""}
Respond as JSON:
{
  "optimizedText": "optimized thumbnail text",
  "fontSize": "recommended font size",
  "fontStyle": "recommended font style",
  "placement": "text placement",
  "maxWords": 4,
  "readabilityScore": 85,
  "contrastAdvice": "contrast and readability tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailColorPsychology(data: { niche?: string; targetEmotion?: string }, userId?: string) {
  const p = `Apply color psychology principles to thumbnail design.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.targetEmotion ? `Target Emotion: ${sanitizeForPrompt(data.targetEmotion)}` : ""}
Respond as JSON:
{
  "colors": [{"color": "color name", "emotion": "associated emotion", "bestUse": "when to use", "avoidWith": "colors to avoid pairing with"}],
  "combinations": "recommended color combinations",
  "nicheBest": "best colors for this niche",
  "contrastRules": "contrast rules for thumbnails"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBannerGenerator(data: { channelName?: string; tagline?: string; niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Generate channel art and banner concepts for multiple platforms.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.tagline ? `Tagline: ${sanitizeForPrompt(data.tagline)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "banners": [{"platform": "platform name", "dimensions": "dimensions", "layout": "layout description", "elements": "design elements", "colorScheme": "color scheme"}],
  "brandConsistency": "brand consistency tips",
  "updateFrequency": "how often to update banners"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialCoverCreator(data: { platform?: string; channelName?: string; style?: string }, userId?: string) {
  const p = `Design social media cover image concepts.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "covers": [{"platform": "platform name", "dimensions": "dimensions", "designConcept": "design concept", "elements": "design elements", "cta": "call to action"}],
  "consistency": "cross-platform consistency tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnimatedThumbnailCreator(data: { videoTitle?: string; style?: string }, userId?: string) {
  const p = `Create animated thumbnail concepts for video content.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "animations": [{"concept": "animation concept", "frames": "number of frames", "duration": "loop duration", "movement": "movement description", "loop": true}],
  "platformSupport": "which platforms support animated thumbnails",
  "bestPractices": "animated thumbnail best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailCompetitorComparison(data: { niche?: string; topCompetitors?: string[] }, userId?: string) {
  const p = `Compare thumbnail strategies against competitors in the same niche.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.topCompetitors ? `Top Competitors: ${sanitizeForPrompt(data.topCompetitors.join(", "))}` : ""}
Respond as JSON:
{
  "analysis": [{"competitor": "competitor name", "style": "their thumbnail style", "strengths": "their strengths", "weaknesses": "their weaknesses"}],
  "gaps": "gaps in competitor thumbnails",
  "opportunities": "opportunities to stand out",
  "standoutStrategy": "strategy to differentiate"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandWatermarkDesigner(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Design brand watermark concepts for video content protection.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "designs": [{"type": "watermark type", "opacity": "recommended opacity", "position": "position on screen", "size": "size recommendation", "style": "visual style"}],
  "doNots": "watermark mistakes to avoid",
  "platformRules": "platform-specific watermark rules"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmojiStickerCreator(data: { channelName?: string; brandColors?: string[]; emotes?: string[] }, userId?: string) {
  const p = `Create emoji and sticker pack concepts for a content brand.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.brandColors ? `Brand Colors: ${sanitizeForPrompt(data.brandColors.join(", "))}` : ""}
${data.emotes ? `Desired Emotes: ${sanitizeForPrompt(data.emotes.join(", "))}` : ""}
Respond as JSON:
{
  "stickers": [{"name": "sticker name", "description": "visual description", "emotion": "emotion conveyed", "style": "art style"}],
  "packTheme": "overall pack theme",
  "platformUsage": "where to use stickers",
  "monetization": "monetization opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfographicGenerator(data: { topic?: string; dataPoints?: string[] }, userId?: string) {
  const p = `Create an infographic layout for presenting data visually.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.dataPoints ? `Data Points: ${sanitizeForPrompt(data.dataPoints.join(", "))}` : ""}
Respond as JSON:
{
  "layout": "overall layout description",
  "sections": [{"title": "section title", "data": "data to display", "visualType": "chart/icon/text type"}],
  "colorScheme": "recommended color scheme",
  "dimensions": "recommended dimensions",
  "shareability": "tips for making it shareable"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMemeTemplateCreator(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Create meme templates for brand-safe content marketing.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "templates": [{"name": "meme name", "format": "meme format", "textPlacement": "where text goes", "useCase": "when to use", "viralPotential": "viral potential rating"}],
  "trendingFormats": "currently trending meme formats",
  "brandSafe": "brand safety guidelines"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVisualConsistencyScorer(data: { channelName?: string; recentThumbnails?: string[] }, userId?: string) {
  const p = `Score the visual consistency of a channel's thumbnails and branding.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.recentThumbnails ? `Recent Thumbnails: ${sanitizeForPrompt(data.recentThumbnails.join(", "))}` : ""}
Respond as JSON:
{
  "overallScore": 75,
  "colorConsistency": "color consistency assessment",
  "fontConsistency": "font consistency assessment",
  "layoutConsistency": "layout consistency assessment",
  "improvements": [{"area": "improvement area", "suggestion": "specific suggestion"}],
  "brandRecognition": "brand recognition score and tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceCloneAdvisor(data: { useCase?: string; contentType?: string }, userId?: string) {
  const p = `Provide voice cloning guidance including tools, best practices, and legal considerations.
${data.useCase ? `Use Case: ${sanitizeForPrompt(data.useCase)}` : ""}
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON:
{
  "tools": [{"name": "tool name", "quality": "quality rating", "price": "pricing info", "ethicalNotes": "ethical considerations"}],
  "bestPractices": "voice cloning best practices",
  "legalConsiderations": "legal requirements and considerations",
  "useCases": "recommended use cases",
  "disclosureRequirements": "disclosure and transparency requirements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHookGenerator(data: { topic?: string; style?: string; platform?: string }, userId?: string) {
  const p = `Generate viral first-30-second hooks for video content.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "hooks": [{"text": "hook text", "style": "hook style", "emotionTrigger": "emotion triggered", "openLoopQuestion": "open loop question"}],
  "bestHook": "the best hook from the list",
  "reasoning": "why this hook works best"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTitleSplitTester(data: { title?: string; niche?: string }, userId?: string) {
  const p = `Generate title variants for A/B testing to maximize click-through rate.
${data.title ? `Original Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "variants": [{"title": "title variant", "emotionalScore": 85, "seoScore": 90, "clickPrediction": "high"}],
  "winner": "predicted winning title",
  "testingTips": "tips for running the A/B test"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTitleEmotionalScore(data: { title?: string }, userId?: string) {
  const p = `Score the emotional impact of a video title and suggest improvements.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
Respond as JSON:
{
  "score": 75,
  "emotions": [{"emotion": "emotion name", "intensity": 80}],
  "powerWords": "power words found or suggested",
  "improvements": "specific improvement suggestions",
  "curiosityGap": "curiosity gap analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiClickbaitDetector(data: { title?: string; description?: string }, userId?: string) {
  const p = `Detect misleading clickbait in video titles and descriptions.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.description ? `Description: ${sanitizeForPrompt(data.description)}` : ""}
Respond as JSON:
{
  "isClickbait": false,
  "severity": "low",
  "flags": [{"issue": "issue description", "location": "where it was found"}],
  "alternatives": "non-clickbait alternative suggestions",
  "trustScore": 85
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDescriptionTemplateBuilder(data: { niche?: string; channelName?: string }, userId?: string) {
  const p = `Generate SEO-optimized video description templates.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "templates": [{"name": "template name", "template": "full template text", "sections": "key sections included"}],
  "seoTips": "SEO tips for descriptions",
  "linkPlacement": "optimal link placement strategy",
  "hashtagStrategy": "hashtag usage strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndScreenCTAWriter(data: { videoTopic?: string; nextVideo?: string }, userId?: string) {
  const p = `Write compelling end screen calls-to-action for videos.
${data.videoTopic ? `Video Topic: ${sanitizeForPrompt(data.videoTopic)}` : ""}
${data.nextVideo ? `Next Video: ${sanitizeForPrompt(data.nextVideo)}` : ""}
Respond as JSON:
{
  "ctas": [{"text": "CTA text", "timing": "when to show", "style": "delivery style"}],
  "verbalCTA": "verbal call-to-action script",
  "visualCTA": "visual CTA design suggestions",
  "cardTiming": "optimal card timing strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPinnedCommentGenerator(data: { videoTitle?: string; videoTopic?: string }, userId?: string) {
  const p = `Generate engaging pinned comments for videos to boost engagement.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.videoTopic ? `Video Topic: ${sanitizeForPrompt(data.videoTopic)}` : ""}
Respond as JSON:
{
  "comments": [{"text": "comment text", "purpose": "comment purpose", "engagementTrigger": "what triggers engagement"}],
  "bestChoice": "the best comment option",
  "questionToAsk": "question to drive replies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityPostWriter(data: { channelName?: string; recentVideos?: string[]; goal?: string }, userId?: string) {
  const p = `Write engaging community posts for a YouTube channel.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.recentVideos ? `Recent Videos: ${sanitizeForPrompt(data.recentVideos.join(", "))}` : ""}
${data.goal ? `Goal: ${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON:
{
  "posts": [{"text": "post text", "type": "post type", "timing": "best time to post", "mediaType": "suggested media type"}],
  "schedule": "posting schedule recommendation",
  "engagementTips": "tips to boost engagement"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailSubjectOptimizer(data: { subject?: string; audience?: string }, userId?: string) {
  const p = `Optimize email subject lines for maximum open rates.
${data.subject ? `Subject: ${sanitizeForPrompt(data.subject)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "variants": [{"subject": "subject line variant", "openRatePrediction": "predicted open rate", "emotionalTrigger": "emotional trigger used"}],
  "winner": "predicted best subject line",
  "abTestPlan": "A/B testing plan for subjects"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBioWriter(data: { channelName?: string; niche?: string; personality?: string }, userId?: string) {
  const p = `Write optimized channel bios for multiple platforms.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.personality ? `Personality: ${sanitizeForPrompt(data.personality)}` : ""}
Respond as JSON:
{
  "bios": [{"platform": "platform name", "text": "bio text", "characterCount": 150}],
  "keywords": "key SEO keywords used",
  "brandVoice": "brand voice description"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoTagsOptimizer(data: { title?: string; description?: string; currentTags?: string[] }, userId?: string) {
  const p = `Optimize video tags for maximum discoverability and search ranking.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.description ? `Description: ${sanitizeForPrompt(data.description)}` : ""}
${data.currentTags ? `Current Tags: ${sanitizeForPrompt(data.currentTags.join(", "))}` : ""}
Respond as JSON:
{
  "optimizedTags": "list of optimized tags",
  "removedTags": "tags that should be removed",
  "addedTags": "new tags to add",
  "searchVolume": "estimated search volume analysis",
  "competitorTags": "competitor tag analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHashtagOptimizer2(data: { content?: string; platform?: string; niche?: string }, userId?: string) {
  const p = `Generate platform-specific optimized hashtags for content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "hashtags": [{"tag": "hashtag", "reach": "estimated reach", "competition": "competition level", "relevance": "relevance score"}],
  "platformSpecific": "platform-specific hashtag tips",
  "trending": "currently trending relevant hashtags",
  "evergreen": "evergreen hashtags to always use"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaylistWriter(data: { theme?: string; videos?: string[] }, userId?: string) {
  const p = `Write optimized playlist titles and descriptions for YouTube.
${data.theme ? `Theme: ${sanitizeForPrompt(data.theme)}` : ""}
${data.videos ? `Videos: ${sanitizeForPrompt(data.videos.join(", "))}` : ""}
Respond as JSON:
{
  "title": "optimized playlist title",
  "description": "SEO-optimized playlist description",
  "seoKeywords": "target SEO keywords",
  "orderStrategy": "video ordering strategy",
  "thumbnailTips": "playlist thumbnail tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPressReleaseWriter(data: { announcement?: string; channelName?: string }, userId?: string) {
  const p = `Write a professional press release for a content creator announcement.
${data.announcement ? `Announcement: ${sanitizeForPrompt(data.announcement)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "headline": "press release headline",
  "body": "full press release body",
  "quotes": "suggested quotes to include",
  "contactInfo": "contact information template",
  "distribution": "distribution strategy",
  "mediaKit": "media kit recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTestimonialDrafter(data: { brandName?: string; product?: string }, userId?: string) {
  const p = `Draft testimonial request emails and templates for brand collaborations.
${data.brandName ? `Brand Name: ${sanitizeForPrompt(data.brandName)}` : ""}
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
Respond as JSON:
{
  "requestEmail": "testimonial request email template",
  "followUp": "follow-up email template",
  "template": "testimonial template for respondents",
  "incentiveIdeas": "incentive ideas for testimonials",
  "displayFormat": "best format to display testimonials"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTagCloudGenerator(data: { videos?: string[]; niche?: string }, userId?: string) {
  const p = `Generate a visual tag analysis showing tag performance and gaps.
${data.videos ? `Videos: ${sanitizeForPrompt(data.videos.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "tagCloud": [{"tag": "tag name", "frequency": 10, "performance": "performance rating"}],
  "overlaps": "overlapping tags analysis",
  "gaps": "tag gaps to fill",
  "topPerformers": "top performing tags"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSearchIntentMapper(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Map viewer search intent to content opportunities.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.keywords ? `Keywords: ${sanitizeForPrompt(data.keywords.join(", "))}` : ""}
Respond as JSON:
{
  "intents": [{"keyword": "keyword", "intent": "search intent type", "contentGap": "content gap identified", "opportunity": "opportunity description"}],
  "priorityList": "prioritized list of content to create",
  "contentIdeas": "content ideas based on search intent"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmDecoder(data: { platform?: string }, userId?: string) {
  const p = `Provide platform algorithm tips and optimization strategies.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "signals": [{"signal": "algorithm signal", "weight": "signal weight", "optimization": "how to optimize for this signal"}],
  "recentChanges": "recent algorithm changes",
  "myths": "common algorithm myths debunked",
  "bestPractices": "algorithm best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFeaturedSnippetOptimizer(data: { topic?: string; currentRanking?: string }, userId?: string) {
  const p = `Optimize content for featured snippets in search results.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.currentRanking ? `Current Ranking: ${sanitizeForPrompt(data.currentRanking)}` : ""}
Respond as JSON:
{
  "strategy": "featured snippet strategy",
  "structuredData": "structured data recommendations",
  "answerFormat": "optimal answer format",
  "targetQueries": "target queries for snippets",
  "implementation": "implementation steps"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPlatformSEO(data: { platforms?: string[]; niche?: string }, userId?: string) {
  const p = `Create a unified SEO strategy across multiple platforms.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "strategy": [{"platform": "platform name", "keywords": "target keywords", "approach": "SEO approach"}],
  "synergies": "cross-platform synergies",
  "conflicts": "potential conflicts between platforms",
  "universalKeywords": "keywords that work across all platforms"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBacklinkTracker(data: { channelUrl?: string; videoUrls?: string[] }, userId?: string) {
  const p = `Monitor and analyze backlinks for content creator channels and videos.
${data.channelUrl ? `Channel URL: ${sanitizeForPrompt(data.channelUrl)}` : ""}
${data.videoUrls ? `Video URLs: ${sanitizeForPrompt(data.videoUrls.join(", "))}` : ""}
Respond as JSON:
{
  "backlinks": [{"source": "backlink source", "authority": "domain authority", "type": "link type"}],
  "opportunities": "new backlink opportunities",
  "outreachTargets": "outreach targets for link building",
  "linkBuildingTips": "link building tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentFreshnessScorer(data: { videos?: Array<{title: string; publishDate?: string}> }, userId?: string) {
  const p = `Flag stale content that needs updating and score content freshness.
${data.videos ? `Videos: ${JSON.stringify(sanitizeObjectForPrompt(data.videos))}` : ""}
Respond as JSON:
{
  "videos": [{"title": "video title", "freshnessScore": 75, "updateNeeded": true, "suggestions": "update suggestions"}],
  "priorityUpdates": "priority list of videos to update first"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeywordCannibalization(data: { videos?: Array<{title: string; tags?: string[]}> }, userId?: string) {
  const p = `Find competing videos that cannibalize each other's keywords and rankings.
${data.videos ? `Videos: ${JSON.stringify(sanitizeObjectForPrompt(data.videos))}` : ""}
Respond as JSON:
{
  "conflicts": [{"keyword": "conflicting keyword", "videos": "competing videos", "resolution": "resolution strategy"}],
  "consolidationPlan": "content consolidation plan",
  "redirects": "redirect recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLongTailKeywordMiner(data: { niche?: string; seedKeywords?: string[] }, userId?: string) {
  const p = `Mine long-tail keywords with low competition and high opportunity.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.seedKeywords ? `Seed Keywords: ${sanitizeForPrompt(data.seedKeywords.join(", "))}` : ""}
Respond as JSON:
{
  "keywords": [{"keyword": "long-tail keyword", "volume": "search volume", "difficulty": "ranking difficulty", "opportunity": "opportunity score"}],
  "clusters": "keyword clusters",
  "contentIdeas": "content ideas from keywords"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoSitemapGenerator(data: { channelName?: string; videoCount?: number }, userId?: string) {
  const p = `Create a video sitemap strategy for better search engine indexing.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.videoCount ? `Video Count: ${sanitizeForPrompt(data.videoCount)}` : ""}
Respond as JSON:
{
  "structure": "sitemap structure recommendations",
  "schema": "schema markup recommendations",
  "implementation": "implementation steps",
  "submission": "search engine submission strategy",
  "monitoring": "monitoring and maintenance plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRichSnippetOptimizer(data: { videoTitle?: string; description?: string }, userId?: string) {
  const p = `Optimize video content for rich snippets in search results.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.description ? `Description: ${sanitizeForPrompt(data.description)}` : ""}
Respond as JSON:
{
  "schema": "recommended schema markup",
  "keyMoments": "key moments markup strategy",
  "faqSchema": "FAQ schema recommendations",
  "howToSchema": "how-to schema recommendations",
  "implementation": "implementation guide"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceSearchOptimizer(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Optimize content for voice search queries and featured snippets.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.keywords ? `Keywords: ${sanitizeForPrompt(data.keywords.join(", "))}` : ""}
Respond as JSON:
{
  "queries": [{"question": "voice search question", "answer": "optimized answer", "optimization": "optimization tips"}],
  "conversationalKeywords": "conversational keyword suggestions",
  "featuredSnippetTargets": "featured snippet target queries"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutocompleteTracker(data: { seedTerms?: string[] }, userId?: string) {
  const p = `Track and analyze YouTube autocomplete suggestions for content opportunities.
${data.seedTerms ? `Seed Terms: ${sanitizeForPrompt(data.seedTerms.join(", "))}` : ""}
Respond as JSON:
{
  "suggestions": [{"term": "seed term", "completions": "autocomplete suggestions", "trending": "trending status", "volume": "estimated volume"}],
  "opportunities": "content opportunities from autocomplete",
  "contentGaps": "content gaps identified"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleTrendsIntegrator(data: { niche?: string; keywords?: string[] }, userId?: string) {
  const p = `Analyze Google Trends data for content planning and keyword strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.keywords ? `Keywords: ${sanitizeForPrompt(data.keywords.join(", "))}` : ""}
Respond as JSON:
{
  "trends": [{"keyword": "keyword", "trendDirection": "trending direction", "seasonality": "seasonal pattern", "relatedTopics": "related trending topics"}],
  "risingQueries": "rising search queries",
  "breakoutTopics": "breakout topics to capitalize on"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorKeywordSpy(data: { competitors?: string[]; niche?: string }, userId?: string) {
  const p = `Spy on competitor keywords and identify ranking gaps and opportunities.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "keywords": [{"keyword": "keyword", "competitor": "competitor using it", "ranking": "their ranking", "yourGap": "your gap assessment"}],
  "stealOpportunities": "keywords to steal from competitors",
  "avoidKeywords": "keywords to avoid competing on"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSearchRankingTracker(data: { keywords?: string[]; channelName?: string }, userId?: string) {
  const p = `Track search rankings for target keywords and identify trends.
${data.keywords ? `Keywords: ${sanitizeForPrompt(data.keywords.join(", "))}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "rankings": [{"keyword": "keyword", "position": 5, "change": "position change", "topCompetitor": "top competing channel"}],
  "improving": "keywords with improving rankings",
  "declining": "keywords with declining rankings",
  "opportunities": "new ranking opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCTRBenchmarker(data: { niche?: string; avgCTR?: number }, userId?: string) {
  const p = `Benchmark click-through rate against niche averages and top performers.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.avgCTR ? `Average CTR: ${sanitizeForPrompt(data.avgCTR)}%` : ""}
Respond as JSON:
{
  "yourCTR": "your CTR assessment",
  "nicheBenchmark": "niche average CTR benchmark",
  "topPerformerCTR": "top performer CTR in niche",
  "improvements": "specific CTR improvement suggestions",
  "abTestIdeas": "A/B test ideas to improve CTR"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiImpressionAnalyzer(data: { impressions?: number; clicks?: number; niche?: string }, userId?: string) {
  const p = `Analyze impressions to clicks funnel and identify drop-off points.
${data.impressions ? `Impressions: ${sanitizeForPrompt(data.impressions)}` : ""}
${data.clicks ? `Clicks: ${sanitizeForPrompt(data.clicks)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "ctr": "calculated CTR",
  "funnelAnalysis": "impression to click funnel analysis",
  "dropOffPoints": "identified drop-off points",
  "improvements": "improvement recommendations",
  "benchmarks": "industry benchmarks comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRelatedVideoOptimizer(data: { videoTitle?: string; niche?: string }, userId?: string) {
  const p = `Optimize video for appearing in related and suggested video sections.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "strategy": "related video optimization strategy",
  "titleOptimization": "title optimization for suggested videos",
  "thumbnailTips": "thumbnail tips for suggested placement",
  "engagementSignals": "engagement signals to boost",
  "competitorAnalysis": "competitor analysis for suggested videos"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrowseFeatureOptimizer(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Optimize channel for browse features including homepage, subscription feed, and notifications.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "strategy": "browse feature optimization strategy",
  "homepageSignals": "signals to appear on YouTube homepage",
  "subscriptionFeedTips": "subscription feed optimization tips",
  "notificationOptimization": "notification bell optimization",
  "consistency": "consistency recommendations for browse features"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPillarPlanner(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Plan a content pillars strategy for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON:
{
  "pillars": [{"name": "pillar name", "description": "pillar description", "frequency": "posting frequency", "audience": "target audience"}],
  "distribution": "distribution strategy across pillars",
  "calendar": "weekly/monthly content calendar overview"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeriesBuilder(data: { niche?: string; format?: string }, userId?: string) {
  const p = `Build video series concepts for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.format ? `Preferred Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON:
{
  "series": [{"name": "series name", "episodes": "number of episodes", "hook": "series hook", "schedule": "release schedule", "format": "episode format"}],
  "monetization": "monetization strategy for series",
  "crossPromotion": "cross-promotion strategy between series"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentRepurposeMatrix(data: { videoTitle?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a full content repurpose matrix for maximizing reach across platforms.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.platforms ? `Target Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "matrix": [{"platform": "platform name", "format": "content format", "adaptation": "how to adapt", "timing": "when to post"}],
  "workflow": "repurposing workflow",
  "automationTips": "automation tips for repurposing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralScorePredictor(data: { title?: string; niche?: string; platform?: string }, userId?: string) {
  const p = `Predict the viral potential of content.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "viralScore": 75,
  "factors": [{"factor": "factor name", "score": 80, "improvement": "how to improve"}],
  "benchmark": "benchmark comparison",
  "timing": "optimal timing for posting"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentGapFinder(data: { niche?: string; competitors?: string[] }, userId?: string) {
  const p = `Find untapped content gaps and opportunities in a niche.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON:
{
  "gaps": [{"topic": "topic name", "demand": "demand level", "competition": "competition level", "opportunity": "opportunity score"}],
  "priorities": "prioritized list of gaps to fill",
  "contentIdeas": "specific content ideas for top gaps"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrendSurfer(data: { niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Identify and surf trending topics for content creation.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "trends": [{"topic": "trending topic", "platform": "platform", "velocity": "trend velocity", "window": "opportunity window", "contentAngle": "content angle to take"}],
  "timing": "optimal timing to jump on trends",
  "risks": "risks of trend-chasing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEvergreenPlanner(data: { niche?: string; existingContent?: string[] }, userId?: string) {
  const p = `Plan evergreen content that generates long-term views and value.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.existingContent ? `Existing Content: ${sanitizeForPrompt(data.existingContent.join(", "))}` : ""}
Respond as JSON:
{
  "ideas": [{"title": "content title", "searchVolume": "estimated search volume", "updateFrequency": "how often to update", "monetization": "monetization potential"}],
  "schedule": "evergreen content publishing schedule",
  "seoStrategy": "SEO strategy for evergreen content"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentMixOptimizer(data: { currentMix?: Record<string, number>; goals?: string[] }, userId?: string) {
  const p = `Optimize the hero/hub/help content mix for maximum channel growth.
${data.currentMix ? `Current Mix: ${JSON.stringify(sanitizeObjectForPrompt(data.currentMix))}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON:
{
  "idealMix": "ideal content mix ratios",
  "currentAnalysis": "analysis of current mix",
  "adjustments": "recommended adjustments",
  "reasoning": "reasoning behind recommendations",
  "impactPrediction": "predicted impact of changes"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeasonalContentPlanner(data: { niche?: string; quarter?: string }, userId?: string) {
  const p = `Create a seasonal content calendar with events and opportunities.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.quarter ? `Quarter: ${sanitizeForPrompt(data.quarter)}` : ""}
Respond as JSON:
{
  "events": [{"event": "event name", "date": "event date", "contentIdeas": "content ideas for event", "prepTime": "preparation time needed"}],
  "themes": "seasonal themes to leverage",
  "tieIns": "brand and sponsor tie-in opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContentPlanner(data: { myNiche?: string; partnerNiche?: string }, userId?: string) {
  const p = `Plan collaboration content between two creators.
${data.myNiche ? `My Niche: ${sanitizeForPrompt(data.myNiche)}` : ""}
${data.partnerNiche ? `Partner Niche: ${sanitizeForPrompt(data.partnerNiche)}` : ""}
Respond as JSON:
{
  "ideas": [{"title": "collab title", "format": "content format", "audience": "target audience", "distribution": "distribution plan"}],
  "logistics": "logistics and planning tips",
  "contracts": "contract and agreement considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBehindTheScenesPlanner(data: { contentType?: string; frequency?: string }, userId?: string) {
  const p = `Plan behind-the-scenes content strategy for audience engagement.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.frequency ? `Frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON:
{
  "ideas": [{"concept": "BTS concept", "platform": "best platform", "format": "content format", "timing": "when to post"}],
  "authenticity": "tips for authentic BTS content",
  "engagement": "engagement strategies for BTS content"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReactionContentFinder(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Find reaction-worthy content to create reaction videos around.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "targets": [{"content": "content to react to", "why": "why it works for reactions", "angle": "unique angle to take", "timing": "best timing"}],
  "guidelines": "reaction content best practices",
  "fairUse": "fair use considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChallengeCreator(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Create viral challenge concepts for social media.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "challenges": [{"name": "challenge name", "rules": "challenge rules", "hashtag": "hashtag to use", "viralMechanic": "what makes it spread"}],
  "timeline": "challenge launch timeline",
  "promotion": "promotion strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQnAContentPlanner(data: { niche?: string; frequentQuestions?: string[] }, userId?: string) {
  const p = `Plan Q&A content strategy based on audience questions.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.frequentQuestions ? `Frequent Questions: ${sanitizeForPrompt(data.frequentQuestions.join(", "))}` : ""}
Respond as JSON:
{
  "questions": [{"question": "question text", "format": "best format to answer", "value": "value to audience", "contentIdea": "content idea around question"}],
  "schedule": "Q&A content schedule",
  "engagement": "engagement strategies for Q&A"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTutorialStructurer(data: { topic?: string; skillLevel?: string }, userId?: string) {
  const p = `Structure a tutorial for maximum learning and engagement.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.skillLevel ? `Skill Level: ${sanitizeForPrompt(data.skillLevel)}` : ""}
Respond as JSON:
{
  "outline": [{"section": "section name", "duration": "section duration", "visuals": "visual aids needed", "keyPoint": "key takeaway"}],
  "prerequisites": "prerequisites for the tutorial",
  "resources": "additional resources to include"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDocumentaryStylePlanner(data: { topic?: string; researchNeeded?: string }, userId?: string) {
  const p = `Plan documentary-style video content with research and structure.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.researchNeeded ? `Research Needed: ${sanitizeForPrompt(data.researchNeeded)}` : ""}
Respond as JSON:
{
  "structure": [{"act": "act name", "focus": "focus area", "interviewee": "potential interviewee", "bRoll": "b-roll footage needed"}],
  "research": "research plan and sources",
  "timeline": "production timeline"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortFormStrategy(data: { niche?: string; platforms?: string[] }, userId?: string) {
  const p = `Create a comprehensive short-form content strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "strategy": "overall short-form strategy",
  "idealLength": "ideal video length per platform",
  "postingSchedule": "optimal posting schedule",
  "hooks": "hook strategies for short-form",
  "trending": "how to leverage trends",
  "crossPost": "cross-posting strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsIdeaGenerator(data: { niche?: string; trending?: string[] }, userId?: string) {
  const p = `Generate creative Shorts/Reels/TikTok ideas.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.trending ? `Trending Topics: ${sanitizeForPrompt(data.trending.join(", "))}` : ""}
Respond as JSON:
{
  "ideas": [{"concept": "short concept", "hook": "opening hook", "punchline": "punchline or payoff", "hashtags": "relevant hashtags", "sound": "suggested sound/audio"}],
  "formats": "trending formats to use",
  "timing": "best times to post"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsToLongPipeline(data: { shortConcept?: string }, userId?: string) {
  const p = `Convert a short-form video concept into a full long-form video.
${data.shortConcept ? `Short Concept: ${sanitizeForPrompt(data.shortConcept)}` : ""}
Respond as JSON:
{
  "longFormTitle": "expanded long-form title",
  "expansion": "how to expand the concept",
  "additionalResearch": "additional research needed",
  "structureChange": "how to restructure for long-form",
  "audience": "audience differences to consider"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLongToShortsClipper(data: { videoTitle?: string; keyMoments?: string[] }, userId?: string) {
  const p = `Extract short-form clips from a long-form video.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.keyMoments ? `Key Moments: ${sanitizeForPrompt(data.keyMoments.join(", "))}` : ""}
Respond as JSON:
{
  "clips": [{"timestamp": "suggested timestamp", "concept": "clip concept", "hook": "clip hook", "editStyle": "editing style"}],
  "bestMoments": "best moments to clip",
  "platformAdaptation": "how to adapt clips per platform"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVerticalVideoOptimizer(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Optimize content for vertical video format.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "framing": "framing guidelines for vertical",
  "textPlacement": "text placement best practices",
  "captionStyle": "caption styling recommendations",
  "engagement": "engagement optimization tips",
  "platformSpecific": "platform-specific vertical tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsAudioSelector(data: { mood?: string; genre?: string }, userId?: string) {
  const p = `Select and recommend trending audio for short-form content.
${data.mood ? `Mood: ${sanitizeForPrompt(data.mood)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON:
{
  "trending": [{"sound": "sound name", "platform": "platform trending on", "usage": "how to use it", "viralPotential": "viral potential score"}],
  "original": "tips for original audio creation",
  "licensing": "audio licensing considerations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsCaptionStyler(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Design caption styles for short-form video content.
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "font": "font recommendation", "animation": "animation type", "position": "text position", "color": "color scheme"}],
  "accessibility": "accessibility considerations",
  "readability": "readability best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsHookFormula(data: { niche?: string }, userId?: string) {
  const p = `Create proven hook formulas for short-form video content.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "formulas": [{"name": "formula name", "template": "hook template", "example": "example usage", "retention": "expected retention impact"}],
  "firstFrameTips": "first frame optimization tips",
  "thumbStop": "thumb-stopping techniques"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDuetStitchPlanner(data: { platform?: string; niche?: string }, userId?: string) {
  const p = `Plan duet and stitch content strategy for engagement growth.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "targets": [{"creator": "target creator type", "content": "content to duet/stitch", "angle": "unique angle", "value": "value added"}],
  "etiquette": "duet/stitch etiquette guidelines",
  "timing": "optimal timing for duets/stitches"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsAnalyticsDecoder(data: { avgViews?: number; avgRetention?: number }, userId?: string) {
  const p = `Decode and analyze shorts analytics for performance improvement.
${data.avgViews ? `Average Views: ${sanitizeForPrompt(data.avgViews)}` : ""}
${data.avgRetention ? `Average Retention: ${sanitizeForPrompt(data.avgRetention)}%` : ""}
Respond as JSON:
{
  "analysis": "overall analytics analysis",
  "benchmarks": "industry benchmarks comparison",
  "improvements": "specific improvements to make",
  "retentionCurve": "retention curve analysis and tips",
  "swipeRate": "swipe-away rate reduction strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsBatchPlanner(data: { niche?: string; batchSize?: number }, userId?: string) {
  const p = `Plan a batch recording session for short-form content.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.batchSize ? `Batch Size: ${sanitizeForPrompt(data.batchSize)} shorts` : ""}
Respond as JSON:
{
  "batch": [{"concept": "short concept", "script": "brief script", "setup": "setup requirements", "props": "props needed"}],
  "workflow": "batch recording workflow",
  "editingTips": "batch editing tips",
  "schedule": "release schedule for batch"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsRemixStrategy(data: { topShorts?: string[] }, userId?: string) {
  const p = `Create a strategy for remixing top-performing shorts.
${data.topShorts ? `Top Shorts: ${sanitizeForPrompt(data.topShorts.join(", "))}` : ""}
Respond as JSON:
{
  "remixes": [{"original": "original short reference", "newAngle": "new angle to take", "improvement": "improvement over original", "timing": "when to post remix"}],
  "ethicalGuidelines": "ethical guidelines for remixing"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShortsMonetization(data: { views?: number; niche?: string }, userId?: string) {
  const p = `Create a monetization strategy for short-form content.
${data.views ? `Average Views: ${sanitizeForPrompt(data.views)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "revenue": "estimated revenue potential",
  "strategies": [{"method": "monetization method", "potential": "revenue potential", "implementation": "how to implement"}],
  "fundEligibility": "platform fund eligibility and requirements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentAudit(data: { videoCount?: number; topVideos?: string[]; bottomVideos?: string[] }, userId?: string) {
  const p = `Perform a full content audit with SWOT analysis.
${data.videoCount ? `Total Videos: ${sanitizeForPrompt(data.videoCount)}` : ""}
${data.topVideos ? `Top Videos: ${sanitizeForPrompt(data.topVideos.join(", "))}` : ""}
${data.bottomVideos ? `Bottom Videos: ${sanitizeForPrompt(data.bottomVideos.join(", "))}` : ""}
Respond as JSON:
{
  "audit": {"strengths": "content strengths", "weaknesses": "content weaknesses", "opportunities": "growth opportunities", "threats": "potential threats"},
  "actionPlan": "prioritized action plan",
  "priorities": "top 3 priorities to address"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentVelocityTracker(data: { publishingRate?: string; niche?: string }, userId?: string) {
  const p = `Track and optimize content publishing velocity.
${data.publishingRate ? `Current Publishing Rate: ${sanitizeForPrompt(data.publishingRate)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "currentVelocity": "current content velocity assessment",
  "idealVelocity": "ideal content velocity for niche",
  "burnoutRisk": "burnout risk assessment",
  "qualityBalance": "quality vs quantity balance",
  "recommendations": "velocity optimization recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNicheResearcher(data: { interests?: string[]; skills?: string[] }, userId?: string) {
  const p = `Research niche opportunities based on interests and skills.
${data.interests ? `Interests: ${sanitizeForPrompt(data.interests.join(", "))}` : ""}
${data.skills ? `Skills: ${sanitizeForPrompt(data.skills.join(", "))}` : ""}
Respond as JSON:
{
  "niches": [{"niche": "niche name", "demand": "demand level", "competition": "competition level", "monetization": "monetization potential", "growthPotential": "growth potential"}],
  "recommendation": "top niche recommendation",
  "hybridIdeas": "hybrid niche ideas combining interests"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionGenerator(data: { videoTitle?: string; duration?: string; language?: string }, userId?: string) {
  const p = `Auto-generate captions for a video.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
${data.language ? `Language: ${sanitizeForPrompt(data.language)}` : ""}
Respond as JSON:
{
  "captions": [{"timestamp": "timestamp", "text": "caption text"}],
  "language": "detected or specified language",
  "accuracy": "estimated accuracy percentage",
  "wordCount": "total word count"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionStyler(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Style captions for video content.
${data.style ? `Desired Style: ${sanitizeForPrompt(data.style)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "styles": [{"name": "style name", "font": "font family", "size": "font size", "color": "color value", "position": "position on screen", "animation": "animation type"}],
  "accessibility": "accessibility compliance notes",
  "readability": "readability score and tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubtitleTranslator(data: { text?: string; targetLanguage?: string }, userId?: string) {
  const p = `Translate subtitles to a target language.
${data.text ? `Text: ${sanitizeForPrompt(data.text)}` : ""}
${data.targetLanguage ? `Target Language: ${sanitizeForPrompt(data.targetLanguage)}` : ""}
Respond as JSON:
{
  "translation": "translated text",
  "language": "target language",
  "accuracy": "translation accuracy estimate",
  "culturalNotes": "cultural adaptation notes",
  "alternatives": "alternative translation options"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiLanguageSEO(data: { title?: string; languages?: string[] }, userId?: string) {
  const p = `Optimize SEO for multiple languages.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.languages ? `Languages: ${sanitizeForPrompt(data.languages.join(", "))}` : ""}
Respond as JSON:
{
  "translations": [{"language": "language", "title": "localized title", "description": "localized description", "tags": ["localized tags"]}],
  "markets": "target market analysis",
  "opportunities": "growth opportunities by language"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLocalizationManager(data: { content?: string; targetMarkets?: string[] }, userId?: string) {
  const p = `Create a localization strategy for content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
${data.targetMarkets ? `Target Markets: ${sanitizeForPrompt(data.targetMarkets.join(", "))}` : ""}
Respond as JSON:
{
  "markets": [{"market": "market name", "adaptations": "required adaptations", "culturalNotes": "cultural considerations", "opportunity": "market opportunity"}],
  "priorities": "prioritized market list",
  "timeline": "recommended localization timeline"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDubbingAdvisor(data: { languages?: string[]; contentType?: string }, userId?: string) {
  const p = `Provide dubbing guidance for video content.
${data.languages ? `Target Languages: ${sanitizeForPrompt(data.languages.join(", "))}` : ""}
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON:
{
  "languages": [{"language": "language", "demand": "audience demand", "cost": "estimated cost", "tools": "recommended tools"}],
  "bestApproach": "recommended dubbing approach",
  "lipSyncTips": "lip sync optimization tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTranscriptOptimizer(data: { transcript?: string }, userId?: string) {
  const p = `Optimize a video transcript for readability and SEO.
${data.transcript ? `Transcript: ${sanitizeForPrompt(data.transcript)}` : ""}
Respond as JSON:
{
  "optimized": "optimized transcript text",
  "readability": "readability score and assessment",
  "seoKeywords": "extracted SEO keywords",
  "chapters": "suggested chapter markers",
  "summary": "concise transcript summary"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiClosedCaptionCompliance(data: { platform?: string; region?: string }, userId?: string) {
  const p = `Check closed caption compliance requirements.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.region ? `Region: ${sanitizeForPrompt(data.region)}` : ""}
Respond as JSON:
{
  "requirements": [{"regulation": "regulation name", "requirement": "specific requirement", "status": "compliance status"}],
  "accessibility": "accessibility standards summary",
  "penalties": "non-compliance penalties"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioDescriptionWriter(data: { videoTitle?: string; scenes?: string[] }, userId?: string) {
  const p = `Write audio descriptions for video accessibility.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.scenes ? `Scenes: ${sanitizeForPrompt(data.scenes.join(", "))}` : ""}
Respond as JSON:
{
  "descriptions": [{"timestamp": "timestamp", "description": "audio description text", "priority": "priority level"}],
  "compliance": "accessibility compliance status",
  "guidelines": "audio description best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLanguagePriorityRanker(data: { niche?: string; currentLanguages?: string[] }, userId?: string) {
  const p = `Rank languages by ROI for content localization.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.currentLanguages ? `Current Languages: ${sanitizeForPrompt(data.currentLanguages.join(", "))}` : ""}
Respond as JSON:
{
  "rankings": [{"language": "language", "audienceSize": "potential audience size", "competition": "competition level", "roi": "estimated ROI"}],
  "quickWins": "quick win language opportunities",
  "longTerm": "long-term language investments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetentionAnalyzer(data: { avgRetention?: number; videoDuration?: string; niche?: string }, userId?: string) {
  const p = `Analyze video retention metrics and provide improvement strategies.
${data.avgRetention ? `Average Retention: ${sanitizeForPrompt(data.avgRetention)}%` : ""}
${data.videoDuration ? `Video Duration: ${sanitizeForPrompt(data.videoDuration)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "score": "retention score assessment",
  "dropOffPoints": "common drop-off points analysis",
  "improvements": "specific improvement recommendations",
  "benchmark": "niche benchmark comparison",
  "retentionCurve": "ideal retention curve description"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceDemographics(data: { niche?: string; platform?: string }, userId?: string) {
  const p = `Analyze audience demographics and provide targeting insights.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "demographics": {"age": "age distribution", "gender": "gender breakdown", "location": "top locations", "interests": "related interests"},
  "segments": "key audience segments",
  "targeting": "targeting recommendations",
  "content": "content preferences by segment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatchTimeOptimizer(data: { avgWatchTime?: string; videoDuration?: string }, userId?: string) {
  const p = `Optimize watch time for video content using the 2026 YouTube model.
CRITICAL 2026 SHIFT: YouTube now weights viewer SATISFACTION above raw watch time. A 6-minute video
with 80% retention and positive post-watch survey beats a 20-minute video with 30% retention.
Padding and slow intros now actively suppress videos. Optimize for satisfaction AND efficient retention.
${data.avgWatchTime ? `Average Watch Time: ${sanitizeForPrompt(data.avgWatchTime)}` : ""}
${data.videoDuration ? `Video Duration: ${sanitizeForPrompt(data.videoDuration)}` : ""}
Respond as JSON:
{
  "current": "current watch time assessment vs 2026 satisfaction model",
  "ideal": "ideal watch time target (shorter with higher satisfaction beats longer with lower)",
  "strategies": "optimization strategies focused on satisfaction not just duration",
  "segments": "content segment recommendations (cut padding, front-load value)",
  "hooks": "first-5-second hook techniques that deliver on the promise (no clickbait stall)",
  "reEngagement": "re-engagement tactics that extend sessions (not just this video)",
  "satisfactionTips": "specific moves to improve post-watch survey scores"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSatisfactionAnalyzer(data: {
  avgRetention?: number;
  commentCount?: number;
  likeCount?: number;
  viewCount?: number;
  niche?: string;
}, userId?: string) {
  const commentRatio = (data.commentCount && data.viewCount) ? ((data.commentCount / data.viewCount) * 100).toFixed(2) : null;
  const likeRatio = (data.likeCount && data.viewCount) ? ((data.likeCount / data.viewCount) * 100).toFixed(2) : null;
  const p = `Analyze YouTube viewer satisfaction signals using the 2026 algorithm model.

CONTEXT: YouTube pivoted fully to satisfaction-first ranking in 2024-2025. The system collects
millions of post-watch surveys asking "was this worth your time?", tracks repeat viewing, session
continuation (did they keep watching after?), comment sentiment via NLP, and likes. Raw watch time
is now a secondary signal — satisfaction gates promotion.

Metrics provided:
${data.avgRetention != null ? `Average Retention: ${sanitizeForPrompt(data.avgRetention)}%` : ""}
${data.commentCount != null ? `Comments: ${sanitizeForPrompt(data.commentCount)}` : ""}
${data.likeCount != null ? `Likes: ${sanitizeForPrompt(data.likeCount)}` : ""}
${data.viewCount != null ? `Views: ${sanitizeForPrompt(data.viewCount)}` : ""}
${commentRatio ? `Comment rate: ${commentRatio}% of views` : ""}
${likeRatio ? `Like rate: ${likeRatio}% of views` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}

Respond as JSON:
{
  "satisfactionScore": "0-100 estimated satisfaction score",
  "signalBreakdown": {
    "retention": "retention quality assessment — shape matters (cliff vs flat curve)",
    "commentQuality": "estimated comment engagement quality based on volume-to-view ratio",
    "sessionContinuation": "likelihood viewers kept watching YouTube after this video",
    "repeatViewing": "repeat view potential assessment",
    "surveyPrediction": "predicted post-watch survey outcome: positive / neutral / negative"
  },
  "topIssue": "the single biggest satisfaction drag based on these numbers",
  "quickWins": ["3 immediate changes to improve satisfaction signals this week"],
  "contentStructure": "structural changes to deliver value faster and reduce padding",
  "hookAdvice": "how to open videos so viewers feel the title promise is fulfilled immediately",
  "efficiencyTarget": "recommended content length for this niche to maximize satisfaction per minute"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSurfaceTargetOptimizer(data: {
  videoTitle: string;
  videoType?: string;
  gameName?: string;
  targetSurface?: "home" | "suggested" | "search" | "subscriptions" | "shorts";
}, userId?: string) {
  const surface = data.targetSurface || "home";
  const surfaceGuides: Record<string, string> = {
    home: "Uses watch-history clusters (not broad topics). Rewards niche consistency. Reaches new audiences who've never subscribed. CTR is gate 1 — below 2% it stops testing.",
    suggested: "Driven by topic co-watch patterns and recent watch history. Optimize for session chaining — YouTube wants to queue your video after one the viewer just finished. Pairing matters.",
    search: "NLP understands semantic meaning — exact-match keywords matter less than topical alignment. YouTube tracks query satisfaction: if viewers bounce in 10s, you get demoted for that query specifically.",
    subscriptions: "Chronological with light personalization. High prior engagement gives a slight bump. The only surface where subscriber count directly matters.",
    shorts: "Swipe-away ratio in first second is the master metric. Completion rate beats total watch time. Replay count is critical. First 3 seconds determine everything — no slow build.",
  };
  const p = `Optimize a YouTube gaming video specifically for the ${surface.toUpperCase()} recommendation surface.

SURFACE GUIDE — ${surface.toUpperCase()}:
${surfaceGuides[surface]}

Video Title: "${sanitizeForPrompt(data.videoTitle)}"
Game: ${sanitizeForPrompt(data.gameName || "Gaming")}
Type: ${sanitizeForPrompt(data.videoType || "long-form")}
Target Surface: ${surface.toUpperCase()}

Respond as JSON:
{
  "surface": "${surface}",
  "primarySignal": "the single most important ranking signal for ${surface}",
  "titleRecommendation": "rewritten title optimized for ${surface} discovery",
  "descriptionStrategy": "description and keyword strategy specific to ${surface}",
  "thumbnailGuidance": "thumbnail approach for ${surface} (CTR vs first-frame vs branding)",
  "openingSeconds": "what the first 5-30 seconds must accomplish to win on ${surface}",
  "doList": ["3 specific actions that boost ${surface} performance"],
  "avoidList": ["2 things that hurt ${surface} ranking"],
  "crossSurfaceFlywheel": "how ${surface} success feeds into the other four surfaces"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEngagementRateAnalyzer(data: { likes?: number; comments?: number; views?: number }, userId?: string) {
  const p = `Analyze engagement rate and provide improvement strategies.
${data.likes ? `Likes: ${sanitizeForPrompt(data.likes)}` : ""}
${data.comments ? `Comments: ${sanitizeForPrompt(data.comments)}` : ""}
${data.views ? `Views: ${sanitizeForPrompt(data.views)}` : ""}
Respond as JSON:
{
  "rate": "calculated engagement rate",
  "benchmark": "industry benchmark comparison",
  "improvements": "improvement recommendations",
  "commentStrategy": "comment engagement strategy",
  "likeTriggers": "like-triggering techniques"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriberGrowthAnalyzer(data: { currentSubs?: number; monthlyGrowth?: number }, userId?: string) {
  const p = `Analyze subscriber growth and predict trajectory.
${data.currentSubs ? `Current Subscribers: ${sanitizeForPrompt(data.currentSubs)}` : ""}
${data.monthlyGrowth ? `Monthly Growth: ${sanitizeForPrompt(data.monthlyGrowth)}` : ""}
Respond as JSON:
{
  "growthRate": "current growth rate assessment",
  "trajectory": "growth trajectory prediction",
  "milestoneETA": "estimated time to next milestones",
  "strategies": "growth acceleration strategies",
  "benchmark": "niche benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueForecaster(data: { monthlyRevenue?: number; growth?: number; sources?: string[] }, userId?: string) {
  const p = `Forecast revenue and identify optimization opportunities.
${data.monthlyRevenue ? `Monthly Revenue: $${sanitizeForPrompt(data.monthlyRevenue)}` : ""}
${data.growth ? `Growth Rate: ${sanitizeForPrompt(data.growth)}%` : ""}
${data.sources ? `Revenue Sources: ${sanitizeForPrompt(data.sources.join(", "))}` : ""}
Respond as JSON:
{
  "forecast": [{"month": "month", "predicted": "predicted revenue", "sources": "revenue source breakdown"}],
  "optimizations": "revenue optimization recommendations",
  "risks": "potential revenue risks",
  "ceiling": "estimated revenue ceiling"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiABTestAnalyzer(data: { testType?: string; variantA?: any; variantB?: any }, userId?: string) {
  const p = `Analyze A/B test results and provide insights.
${data.testType ? `Test Type: ${sanitizeForPrompt(data.testType)}` : ""}
${data.variantA ? `Variant A: ${JSON.stringify(sanitizeObjectForPrompt(data.variantA))}` : ""}
${data.variantB ? `Variant B: ${JSON.stringify(sanitizeObjectForPrompt(data.variantB))}` : ""}
Respond as JSON:
{
  "winner": "winning variant",
  "confidence": "statistical confidence level",
  "metrics": "key metric comparisons",
  "duration": "recommended test duration",
  "nextTest": "suggested next test",
  "insights": "actionable insights"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceRetentionHeatmap(data: { videoTitle?: string; duration?: string }, userId?: string) {
  const p = `Generate an audience retention heatmap analysis.
${data.videoTitle ? `Video Title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON:
{
  "heatmap": [{"segment": "time segment", "retention": "retention percentage", "engagement": "engagement level"}],
  "coldSpots": "low retention segments analysis",
  "hotSpots": "high retention segments analysis",
  "fixes": "recommendations to fix cold spots"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrafficSourceAnalyzer(data: { sources?: Record<string, number> }, userId?: string) {
  const p = `Analyze traffic sources and optimize distribution.
${data.sources ? `Traffic Sources: ${JSON.stringify(sanitizeObjectForPrompt(data.sources))}` : ""}
Respond as JSON:
{
  "analysis": [{"source": "traffic source", "percentage": "traffic percentage", "optimization": "optimization tips"}],
  "untapped": "untapped traffic sources",
  "strategy": "overall traffic strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDeviceAnalyzer(data: { mobile?: number; desktop?: number; tv?: number }, userId?: string) {
  const p = `Analyze device distribution and optimize content for each device.
${data.mobile ? `Mobile: ${sanitizeForPrompt(data.mobile)}%` : ""}
${data.desktop ? `Desktop: ${sanitizeForPrompt(data.desktop)}%` : ""}
${data.tv ? `TV: ${sanitizeForPrompt(data.tv)}%` : ""}
Respond as JSON:
{
  "distribution": "device distribution analysis",
  "optimization": [{"device": "device type", "tips": "optimization tips"}],
  "trending": "device trend analysis",
  "priorities": "optimization priorities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaybackLocationAnalyzer(data: { embedded?: number; youtube?: number; external?: number }, userId?: string) {
  const p = `Analyze playback locations and identify embed opportunities.
${data.embedded ? `Embedded: ${sanitizeForPrompt(data.embedded)}%` : ""}
${data.youtube ? `YouTube: ${sanitizeForPrompt(data.youtube)}%` : ""}
${data.external ? `External: ${sanitizeForPrompt(data.external)}%` : ""}
Respond as JSON:
{
  "analysis": "playback location breakdown analysis",
  "embedOpportunities": "new embed opportunities",
  "seoImpact": "SEO impact of playback locations",
  "partnerSites": "potential partner site recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndScreenAnalyzer(data: { clickRate?: number; impressions?: number }, userId?: string) {
  const p = `Analyze end screen performance and suggest improvements.
${data.clickRate ? `Click Rate: ${sanitizeForPrompt(data.clickRate)}%` : ""}
${data.impressions ? `Impressions: ${sanitizeForPrompt(data.impressions)}` : ""}
Respond as JSON:
{
  "analysis": "end screen performance analysis",
  "improvements": "specific improvement recommendations",
  "bestPerformers": "best performing end screen elements",
  "timing": "optimal end screen timing",
  "design": "design recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCardPerformanceAnalyzer(data: { cards?: Array<{type: string; clicks: number}> }, userId?: string) {
  const p = `Analyze info card performance and optimize placement.
${data.cards ? `Cards: ${JSON.stringify(sanitizeObjectForPrompt(data.cards))}` : ""}
Respond as JSON:
{
  "analysis": "card performance analysis",
  "bestPerforming": "best performing card types",
  "optimization": "optimization recommendations",
  "timing": "optimal card timing",
  "placement": "placement best practices"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiImpressionFunnelAnalyzer(data: { impressions?: number; ctr?: number; avgView?: number }, userId?: string) {
  const p = `Analyze the full impression-to-view funnel.
${data.impressions ? `Impressions: ${sanitizeForPrompt(data.impressions)}` : ""}
${data.ctr ? `CTR: ${sanitizeForPrompt(data.ctr)}%` : ""}
${data.avgView ? `Average View Duration: ${sanitizeForPrompt(data.avgView)}%` : ""}
Respond as JSON:
{
  "funnel": [{"stage": "funnel stage", "metric": "stage metric", "optimization": "optimization tip"}],
  "bottleneck": "primary bottleneck identification",
  "priority": "priority actions to fix funnel"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorBenchmarker(data: { competitors?: string[]; metrics?: string[] }, userId?: string) {
  const p = `Benchmark against competitors and identify gaps.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
${data.metrics ? `Metrics to Compare: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON:
{
  "benchmarks": [{"competitor": "competitor name", "metrics": "metric comparisons", "strengths": "competitor strengths", "weaknesses": "competitor weaknesses"}],
  "gaps": "identified gaps and opportunities",
  "opportunities": "strategic opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrowthRatePredictor(data: { historicalData?: any; niche?: string }, userId?: string) {
  const p = `Predict growth rate based on historical data.
${data.historicalData ? `Historical Data: ${JSON.stringify(sanitizeObjectForPrompt(data.historicalData))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "prediction": [{"period": "time period", "subscribers": "predicted subscribers", "views": "predicted views", "revenue": "predicted revenue"}],
  "confidence": "prediction confidence level",
  "accelerators": "growth accelerator recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChurnPredictor(data: { unsubRate?: number; contentFrequency?: string }, userId?: string) {
  const p = `Predict subscriber churn and provide prevention strategies.
${data.unsubRate ? `Unsubscribe Rate: ${sanitizeForPrompt(data.unsubRate)}%` : ""}
${data.contentFrequency ? `Content Frequency: ${sanitizeForPrompt(data.contentFrequency)}` : ""}
Respond as JSON:
{
  "churnRate": "predicted churn rate",
  "riskFactors": "churn risk factors",
  "prevention": "churn prevention strategies",
  "reEngagement": "re-engagement campaign ideas",
  "benchmark": "industry churn benchmark"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralCoefficientCalculator(data: { shares?: number; newViewers?: number }, userId?: string) {
  const p = `Calculate viral coefficient and improve shareability.
${data.shares ? `Shares: ${sanitizeForPrompt(data.shares)}` : ""}
${data.newViewers ? `New Viewers from Shares: ${sanitizeForPrompt(data.newViewers)}` : ""}
Respond as JSON:
{
  "coefficient": "calculated viral coefficient",
  "interpretation": "coefficient interpretation",
  "improvements": "virality improvement strategies",
  "shareability": "shareability score and tips",
  "benchmark": "viral coefficient benchmark"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSentimentDashboard(data: { comments?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze comment sentiment and provide a dashboard overview.
${data.comments ? `Comments: ${sanitizeForPrompt(data.comments.join(" | "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "overall": "overall sentiment score",
  "positive": "positive sentiment percentage and themes",
  "negative": "negative sentiment percentage and themes",
  "neutral": "neutral sentiment percentage",
  "trending": "trending sentiment topics",
  "alerts": "sentiment alerts requiring attention"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPeakTimeAnalyzer(data: { timezone?: string; niche?: string; platform?: string }, userId?: string) {
  const p = `Determine the best posting times for maximum reach.
${data.timezone ? `Timezone: ${sanitizeForPrompt(data.timezone)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "optimal": [{"day": "day of week", "time": "optimal time", "reason": "why this time works"}],
  "avoid": "times to avoid posting",
  "timezone": "timezone-specific recommendations",
  "seasonal": "seasonal timing adjustments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoLifecycleTracker(data: { ageInDays?: number; views?: number }, userId?: string) {
  const p = `Track video lifecycle phase and suggest revival strategies.
${data.ageInDays ? `Video Age: ${sanitizeForPrompt(data.ageInDays)} days` : ""}
${data.views ? `Total Views: ${sanitizeForPrompt(data.views)}` : ""}
Respond as JSON:
{
  "phase": "current lifecycle phase",
  "expectedLifespan": "expected content lifespan",
  "revivalStrategies": "strategies to revive viewership",
  "evergreenPotential": "evergreen content potential assessment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenuePerViewOptimizer(data: { rpm?: number; niche?: string }, userId?: string) {
  const p = `Optimize revenue per view and RPM.
${data.rpm ? `Current RPM: $${sanitizeForPrompt(data.rpm)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "currentRPM": "current RPM assessment",
  "benchmark": "niche RPM benchmark",
  "improvements": "RPM improvement strategies",
  "adOptimization": "ad placement optimization tips",
  "nichePremium": "niche premium opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceOverlapAnalyzer(data: { platforms?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze audience overlap across platforms.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "overlap": "audience overlap percentage and analysis",
  "unique": [{"platform": "platform name", "percentage": "unique audience percentage"}],
  "crossPromotion": "cross-promotion opportunities",
  "strategy": "multi-platform audience strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPerformanceRanker(data: { videos?: Array<{title: string; views: number}> }, userId?: string) {
  const p = `Rank content by performance and identify patterns.
${data.videos ? `Videos: ${JSON.stringify(sanitizeObjectForPrompt(data.videos))}` : ""}
Respond as JSON:
{
  "rankings": [{"title": "video title", "score": "performance score", "strengths": "content strengths"}],
  "patterns": "performance patterns identified",
  "replication": "how to replicate top performers"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFunnelLeakDetector(data: { impressions?: number; clicks?: number; subs?: number }, userId?: string) {
  const p = `Detect leaks in the viewer-to-subscriber funnel.
${data.impressions ? `Impressions: ${sanitizeForPrompt(data.impressions)}` : ""}
${data.clicks ? `Clicks: ${sanitizeForPrompt(data.clicks)}` : ""}
${data.subs ? `New Subscribers: ${sanitizeForPrompt(data.subs)}` : ""}
Respond as JSON:
{
  "leaks": [{"stage": "funnel stage", "lossRate": "loss rate percentage", "fix": "recommended fix"}],
  "priority": "priority fixes ranked",
  "quickWins": "quick win improvements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveAnalytics(data: { metrics?: any; period?: string }, userId?: string) {
  const p = `Generate predictive analytics for content performance.
${data.metrics ? `Current Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
${data.period ? `Prediction Period: ${sanitizeForPrompt(data.period)}` : ""}
Respond as JSON:
{
  "predictions": [{"metric": "metric name", "current": "current value", "predicted": "predicted value", "trend": "trend direction"}],
  "alerts": "important alerts and warnings",
  "opportunities": "upcoming opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomReportBuilder(data: { metrics?: string[]; period?: string; format?: string }, userId?: string) {
  const p = `Build a custom analytics report.
${data.metrics ? `Metrics: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
${data.period ? `Report Period: ${sanitizeForPrompt(data.period)}` : ""}
${data.format ? `Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON:
{
  "report": {"summary": "executive summary", "highlights": "key highlights", "concerns": "areas of concern"},
  "visualizations": "recommended data visualizations",
  "schedule": "recommended reporting schedule"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamTitleGenerator(data: { game?: string; category?: string; mood?: string }, userId?: string) {
  const p = `Generate compelling stream titles for a live streamer.
${data.game ? `Game: ${sanitizeForPrompt(data.game)}` : ""}
${data.category ? `Category: ${sanitizeForPrompt(data.category)}` : ""}
${data.mood ? `Mood/Vibe: ${sanitizeForPrompt(data.mood)}` : ""}
Respond as JSON:
{
  "titles": [{"title": "stream title", "platform": "best platform for this title", "searchScore": 85}],
  "trending": "currently trending title styles",
  "hashtags": "recommended hashtags"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamScheduleOptimizer(data: { timezone?: string; niche?: string; currentSchedule?: string[] }, userId?: string) {
  const p = `Optimize a streamer's streaming schedule for maximum viewership.
${data.timezone ? `Timezone: ${sanitizeForPrompt(data.timezone)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.currentSchedule ? `Current Schedule: ${sanitizeForPrompt(data.currentSchedule.join(", "))}` : ""}
Respond as JSON:
{
  "optimal": [{"day": "day of week", "time": "best time slot", "reason": "why this slot", "competition": "competition level"}],
  "avoid": "times to avoid streaming",
  "seasonal": "seasonal scheduling adjustments"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamOverlayDesigner(data: { theme?: string; style?: string }, userId?: string) {
  const p = `Design stream overlay concepts for a live streamer.
${data.theme ? `Theme: ${sanitizeForPrompt(data.theme)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "overlays": [{"type": "overlay type", "design": "design description", "placement": "screen placement", "animation": "animation style"}],
  "alerts": "alert overlay recommendations",
  "panels": "panel design recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamAlertDesigner(data: { eventType?: string; style?: string }, userId?: string) {
  const p = `Design stream alert animations and sounds for a live streamer.
${data.eventType ? `Event Type: ${sanitizeForPrompt(data.eventType)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "alerts": [{"event": "trigger event", "animation": "animation description", "sound": "sound effect suggestion", "duration": "display duration", "design": "visual design"}],
  "progression": "alert progression system for milestones",
  "celebration": "celebration alert ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamModerationRules(data: { community?: string; platform?: string }, userId?: string) {
  const p = `Create moderation rules and automod configuration for a live stream chat.
${data.community ? `Community Type: ${sanitizeForPrompt(data.community)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "rules": [{"rule": "rule description", "action": "enforcement action", "severity": "low/medium/high"}],
  "automod": "automod configuration recommendations",
  "wordFilter": "word filter suggestions",
  "timeouts": "timeout policy recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamInteractionPlanner(data: { viewerCount?: number; category?: string }, userId?: string) {
  const p = `Plan viewer interaction activities for a live stream to boost engagement.
${data.viewerCount ? `Average Viewer Count: ${sanitizeForPrompt(data.viewerCount)}` : ""}
${data.category ? `Stream Category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON:
{
  "activities": [{"name": "activity name", "timing": "when to run it", "engagement": "expected engagement level", "setup": "how to set it up"}],
  "polls": "poll ideas and strategies",
  "predictions": "prediction ideas for viewers",
  "minigames": "chat minigame suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamRevenueOptimizer(data: { avgViewers?: number; subCount?: number }, userId?: string) {
  const p = `Optimize revenue streams for a live streamer.
${data.avgViewers ? `Average Viewers: ${sanitizeForPrompt(data.avgViewers)}` : ""}
${data.subCount ? `Current Subscriber Count: ${sanitizeForPrompt(data.subCount)}` : ""}
Respond as JSON:
{
  "strategies": [{"method": "revenue method", "potential": "earning potential", "implementation": "how to implement"}],
  "subGoals": "subscriber goal strategy",
  "donations": "donation optimization tips",
  "bits": "bits and cheering strategy"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamClipHighlighter(data: { streamDuration?: string; genre?: string }, userId?: string) {
  const p = `Identify potential clip-worthy moments and highlight strategies for a live stream.
${data.streamDuration ? `Stream Duration: ${sanitizeForPrompt(data.streamDuration)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON:
{
  "moments": [{"type": "moment type", "description": "what to look for", "clipWorthiness": "high/medium/low"}],
  "compilation": "highlight compilation strategy",
  "thumbnails": "thumbnail suggestions for clips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamCategoryOptimizer(data: { content?: string; platforms?: string[] }, userId?: string) {
  const p = `Optimize stream category selection for maximum discoverability.
${data.content ? `Content Description: ${sanitizeForPrompt(data.content)}` : ""}
${data.platforms ? `Target Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON:
{
  "primary": "recommended primary category",
  "alternatives": "alternative category options",
  "crossCategory": "cross-category opportunities",
  "trending": "trending categories to consider",
  "discovery": "category-based discovery tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamPanelDesigner(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Design about/info panel layouts for a streaming channel page.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON:
{
  "panels": [{"title": "panel title", "content": "panel content description", "design": "visual design notes", "link": "suggested link if applicable"}],
  "layout": "overall panel layout recommendation",
  "branding": "branding consistency tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamEmoteManager(data: { channelName?: string; subTiers?: number }, userId?: string) {
  const p = `Create an emote strategy for a streaming channel including concepts and tier distribution.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.subTiers ? `Number of Sub Tiers: ${sanitizeForPrompt(data.subTiers)}` : ""}
Respond as JSON:
{
  "emotes": [{"name": "emote name", "concept": "emote concept description", "tier": "subscriber tier", "style": "art style"}],
  "progression": "emote unlock progression strategy",
  "communityInput": "how to involve community in emote creation"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamSubGoalPlanner(data: { currentSubs?: number; goal?: number }, userId?: string) {
  const p = `Create a subscriber goal strategy with milestones and rewards for a streamer.
${data.currentSubs ? `Current Subscribers: ${sanitizeForPrompt(data.currentSubs)}` : ""}
${data.goal ? `Target Goal: ${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON:
{
  "goals": [{"milestone": "subscriber milestone", "reward": "reward for reaching milestone", "timeline": "estimated timeline"}],
  "incentives": "subscriber incentive ideas",
  "community": "community engagement around sub goals",
  "celebration": "milestone celebration ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamNetworkingAdvisor(data: { niche?: string; size?: string }, userId?: string) {
  const p = `Provide networking advice for a streamer to collaborate and grow their community.
${data.niche ? `Content Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.size ? `Channel Size: ${sanitizeForPrompt(data.size)}` : ""}
Respond as JSON:
{
  "targets": [{"creator": "type of creator to network with", "reason": "why this collaboration works", "approach": "how to approach them"}],
  "events": "networking events and opportunities",
  "communities": "communities to join",
  "etiquette": "networking etiquette tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamAnalyticsExplainer(data: { platform?: string; metrics?: any }, userId?: string) {
  const p = `Explain stream analytics metrics and provide actionable insights for a streamer.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.metrics ? `Metrics Data: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON:
{
  "explained": [{"metric": "metric name", "meaning": "what it means", "benchmark": "industry benchmark", "action": "actionable recommendation"}],
  "priorities": "which metrics to prioritize",
  "trends": "trend analysis and predictions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiStreamSetup(data: { platforms?: string[]; resolution?: string }, userId?: string) {
  const p = `Provide multi-stream setup guidance for broadcasting to multiple platforms simultaneously.
${data.platforms ? `Target Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.resolution ? `Desired Resolution: ${sanitizeForPrompt(data.resolution)}` : ""}
Respond as JSON:
{
  "setup": [{"platform": "platform name", "settings": "recommended settings", "limitations": "platform-specific limitations"}],
  "software": "recommended multi-stream software",
  "bandwidth": "bandwidth requirements and optimization",
  "legal": "legal considerations for multi-streaming"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamBackupPlanner(data: { setupType?: string }, userId?: string) {
  const p = `Create emergency backup plans for common streaming issues and failures.
${data.setupType ? `Current Setup Type: ${sanitizeForPrompt(data.setupType)}` : ""}
Respond as JSON:
{
  "scenarios": [{"issue": "potential issue", "solution": "immediate solution", "prevention": "how to prevent it"}],
  "hardware": "hardware backup recommendations",
  "software": "software backup recommendations",
  "internetBackup": "internet backup solutions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamCommunityBuilder(data: { platform?: string; size?: string }, userId?: string) {
  const p = `Create a community building strategy for a live streamer.
${data.platform ? `Primary Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.size ? `Community Size: ${sanitizeForPrompt(data.size)}` : ""}
Respond as JSON:
{
  "strategies": [{"strategy": "strategy name", "implementation": "how to implement", "timeline": "expected timeline"}],
  "discord": "Discord server setup and management tips",
  "events": "community event ideas",
  "loyalty": "loyalty and retention programs"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamBrandingKit(data: { channelName?: string; colors?: string[] }, userId?: string) {
  const p = `Create a comprehensive branding kit for a streaming channel.
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.colors ? `Brand Colors: ${sanitizeForPrompt(data.colors.join(", "))}` : ""}
Respond as JSON:
{
  "kit": {"logo": "logo design concept", "banner": "banner design concept", "overlays": "overlay style guide", "alerts": "alert design style", "panels": "panel design style", "emotes": "emote art direction"},
  "consistency": "brand consistency guidelines",
  "guidelines": "usage guidelines and do/dont rules"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamContentCalendar(data: { frequency?: string; niche?: string }, userId?: string) {
  const p = `Create a stream content calendar with themes and special events.
${data.frequency ? `Streaming Frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
${data.niche ? `Content Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "calendar": [{"day": "day of week", "content": "content type/theme", "special": "special event or series", "goal": "session goal"}],
  "themes": "recurring theme ideas",
  "variety": "content variety recommendations",
  "events": "special event and holiday content ideas"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamGrowthHacker(data: { platform?: string; currentViewers?: number }, userId?: string) {
  const p = `Provide growth hacking tactics for a live streamer to rapidly increase viewership.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.currentViewers ? `Current Average Viewers: ${sanitizeForPrompt(data.currentViewers)}` : ""}
Respond as JSON:
{
  "hacks": [{"tactic": "growth tactic", "effort": "effort level required", "impact": "expected impact", "timeline": "time to see results"}],
  "discovery": "discoverability optimization tips",
  "crossPromo": "cross-promotion strategies",
  "viral": "viral content strategies for streams"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdRevenueOptimizer(data: { rpm?: number; niche?: string; platform?: string }, userId?: string) {
  const p = `Optimize ad revenue for a content creator.
${data.rpm ? `Current RPM: $${sanitizeForPrompt(data.rpm)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON:
{
  "strategies": [{"strategy": "revenue strategy", "impact": "expected impact", "implementation": "how to implement"}],
  "adPlacement": "ad placement optimization advice",
  "midRolls": "mid-roll ad strategy recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdPlacementAdvisor(data: { videoDuration?: string; genre?: string }, userId?: string) {
  const p = `Advise on optimal ad placements for a video to maximize revenue without hurting viewer experience.
${data.videoDuration ? `Video Duration: ${sanitizeForPrompt(data.videoDuration)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON:
{
  "placements": [{"timestamp": "suggested timestamp", "type": "ad type", "reason": "why this placement works"}],
  "skipRate": "expected skip rate analysis",
  "viewerExperience": "viewer experience impact assessment"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCPMMaximizer(data: { niche?: string; geography?: string }, userId?: string) {
  const p = `Maximize CPM rates for a content creator by optimizing content strategy and targeting.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.geography ? `Target Geography: ${sanitizeForPrompt(data.geography)}` : ""}
Respond as JSON:
{
  "currentCPM": "estimated current CPM analysis",
  "strategies": "CPM improvement strategies",
  "seasonalTrends": "seasonal CPM trends and opportunities",
  "premiumTopics": "high-CPM topic suggestions",
  "geography": "geographic targeting recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorPricingEngine(data: { subscribers?: number; avgViews?: number; niche?: string }, userId?: string) {
  const p = `Calculate fair sponsorship pricing for a content creator.
${data.subscribers ? `Subscribers: ${sanitizeForPrompt(data.subscribers)}` : ""}
${data.avgViews ? `Average Views: ${sanitizeForPrompt(data.avgViews)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "pricing": {"integration": "integration deal price range", "dedicated": "dedicated video price range", "mention": "mention/shoutout price range"},
  "negotiation": "negotiation tips and strategies",
  "rateCard": "professional rate card recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorOutreachWriter(data: { brandName?: string; channelName?: string }, userId?: string) {
  const p = `Write sponsor outreach emails for a content creator pitching to brands.
${data.brandName ? `Target Brand: ${sanitizeForPrompt(data.brandName)}` : ""}
${data.channelName ? `Channel Name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON:
{
  "emails": [{"subject": "email subject line", "body": "email body content", "followUp": "follow-up email template"}],
  "pitch": "elevator pitch summary",
  "mediaKit": "media kit talking points",
  "customization": "personalization tips for each brand"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorNegotiator(data: { offerAmount?: number; deliverables?: string[] }, userId?: string) {
  const p = `Help negotiate a sponsorship deal for a content creator.
${data.offerAmount ? `Current Offer Amount: $${sanitizeForPrompt(data.offerAmount)}` : ""}
${data.deliverables ? `Deliverables: ${sanitizeForPrompt(data.deliverables.join(", "))}` : ""}
Respond as JSON:
{
  "counterOffer": "recommended counter offer with justification",
  "justification": "data-backed justification for pricing",
  "walkAway": "walk-away point and alternatives",
  "addOns": "value-add suggestions to sweeten the deal",
  "contractPoints": "key contract points to negotiate"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorDeliverableTracker(data: { sponsors?: Array<{name: string; deliverables: string[]}> }, userId?: string) {
  const p = `Track and manage sponsor deliverables for a content creator.
${data.sponsors ? `Sponsors: ${JSON.stringify(sanitizeObjectForPrompt(data.sponsors))}` : ""}
Respond as JSON:
{
  "tracking": [{"sponsor": "sponsor name", "deliverables": "list of deliverables", "status": "completion status", "deadline": "estimated deadline"}],
  "reminders": "reminder schedule recommendations",
  "compliance": "compliance checklist for sponsor agreements"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffiliateOptimizer(data: { niche?: string; currentAffiliates?: string[] }, userId?: string) {
  const p = `Optimize affiliate marketing strategy for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.currentAffiliates ? `Current Affiliates: ${sanitizeForPrompt(data.currentAffiliates.join(", "))}` : ""}
Respond as JSON:
{
  "programs": [{"name": "affiliate program name", "commission": "commission rate", "conversion": "expected conversion rate", "fit": "niche fit score"}],
  "strategy": "overall affiliate strategy",
  "placement": "optimal link placement recommendations",
  "disclosure": "FTC disclosure compliance tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMerchandiseAdvisor(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Advise on merchandise strategy for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.audience ? `Target Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "products": [{"item": "product type", "margin": "profit margin estimate", "demand": "demand level", "design": "design recommendations"}],
  "platform": "recommended merch platforms",
  "pricing": "pricing strategy",
  "marketing": "merchandise marketing tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMembershipTierBuilder(data: { platform?: string; currentMembers?: number }, userId?: string) {
  const p = `Design membership tiers for a content creator's community.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.currentMembers ? `Current Members: ${sanitizeForPrompt(data.currentMembers)}` : ""}
Respond as JSON:
{
  "tiers": [{"name": "tier name", "price": "monthly price", "perks": "tier perks and benefits", "value": "value proposition"}],
  "pricing": "pricing psychology and strategy",
  "retention": "member retention tactics",
  "upsell": "upsell strategies between tiers"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalProductCreator(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Suggest digital products a content creator can create and sell.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.audience ? `Target Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "products": [{"name": "product name", "type": "product type", "price": "suggested price", "creation": "creation effort and timeline"}],
  "funnel": "sales funnel strategy",
  "launch": "launch strategy recommendations",
  "marketing": "marketing and promotion plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCourseBuilder(data: { topic?: string; expertise?: string }, userId?: string) {
  const p = `Build an online course curriculum for a content creator.
${data.topic ? `Course Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.expertise ? `Creator Expertise Level: ${sanitizeForPrompt(data.expertise)}` : ""}
Respond as JSON:
{
  "curriculum": [{"module": "module name", "lessons": "lesson titles", "duration": "estimated duration"}],
  "pricing": "course pricing strategy",
  "platform": "recommended course platforms",
  "marketing": "course marketing and launch plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatreonOptimizer(data: { currentPatrons?: number; tiers?: any }, userId?: string) {
  const p = `Optimize a creator's Patreon page for growth and retention.
${data.currentPatrons ? `Current Patrons: ${sanitizeForPrompt(data.currentPatrons)}` : ""}
${data.tiers ? `Current Tiers: ${JSON.stringify(sanitizeObjectForPrompt(data.tiers))}` : ""}
Respond as JSON:
{
  "optimization": "overall Patreon optimization strategy",
  "tierAdjustments": "tier restructuring recommendations",
  "content": "exclusive content ideas for patrons",
  "growth": "patron growth strategies",
  "retention": "patron retention tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperChatOptimizer(data: { avgSuperChats?: number; streamType?: string }, userId?: string) {
  const p = `Optimize Super Chat and donation revenue for a live streamer.
${data.avgSuperChats ? `Average Super Chats per Stream: ${sanitizeForPrompt(data.avgSuperChats)}` : ""}
${data.streamType ? `Stream Type: ${sanitizeForPrompt(data.streamType)}` : ""}
Respond as JSON:
{
  "strategies": "Super Chat optimization strategies",
  "triggers": "audience triggers that encourage Super Chats",
  "recognition": "donor recognition best practices",
  "goals": "Super Chat goal-setting recommendations",
  "benchmark": "industry benchmark comparison"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelMembershipGrowth(data: { members?: number; perks?: string[] }, userId?: string) {
  const p = `Grow channel membership subscribers for a content creator.
${data.members ? `Current Members: ${sanitizeForPrompt(data.members)}` : ""}
${data.perks ? `Current Perks: ${sanitizeForPrompt(data.perks.join(", "))}` : ""}
Respond as JSON:
{
  "growth": [{"strategy": "growth strategy", "implementation": "how to implement", "timeline": "expected timeline"}],
  "perkIdeas": "new membership perk ideas",
  "retention": "member retention strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueStreamDiversifier(data: { currentStreams?: string[] }, userId?: string) {
  const p = `Diversify revenue streams for a content creator to reduce income risk.
${data.currentStreams ? `Current Revenue Streams: ${sanitizeForPrompt(data.currentStreams.join(", "))}` : ""}
Respond as JSON:
{
  "newStreams": [{"stream": "revenue stream name", "potential": "earning potential", "effort": "setup effort", "timeline": "time to first revenue"}],
  "risk": "risk diversification analysis",
  "priority": "prioritized implementation order"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInvoiceGenerator(data: { clientName?: string; services?: Array<{name: string; amount: number}> }, userId?: string) {
  const p = `Generate a professional invoice template for a content creator's services.
${data.clientName ? `Client Name: ${sanitizeForPrompt(data.clientName)}` : ""}
${data.services ? `Services: ${JSON.stringify(sanitizeObjectForPrompt(data.services))}` : ""}
Respond as JSON:
{
  "invoice": {"number": "invoice number format", "items": "line items with descriptions", "subtotal": "subtotal calculation", "tax": "tax considerations", "total": "total amount"},
  "template": "invoice template recommendations",
  "terms": "payment terms and conditions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContractReviewer(data: { contractType?: string; keyTerms?: string[] }, userId?: string) {
  const p = `Review and advise on a content creator contract.
${data.contractType ? `Contract Type: ${sanitizeForPrompt(data.contractType)}` : ""}
${data.keyTerms ? `Key Terms to Review: ${sanitizeForPrompt(data.keyTerms.join(", "))}` : ""}
Respond as JSON:
{
  "review": [{"clause": "contract clause", "risk": "risk level", "suggestion": "improvement suggestion"}],
  "redFlags": "red flags to watch for",
  "negotiation": "negotiation recommendations",
  "alternatives": "alternative clause suggestions"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTaxDeductionFinder(data: { expenses?: Array<{category: string; amount: number}> }, userId?: string) {
  const p = `Find tax deductions for a content creator's business expenses.
${data.expenses ? `Expenses: ${JSON.stringify(sanitizeObjectForPrompt(data.expenses))}` : ""}
Respond as JSON:
{
  "deductions": [{"expense": "expense item", "deductible": "deductibility status and percentage", "documentation": "required documentation"}],
  "totalSavings": "estimated total tax savings",
  "tips": "additional tax saving tips for creators"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuarterlyTaxEstimator(data: { income?: number; expenses?: number; quarter?: string }, userId?: string) {
  const p = `Estimate quarterly tax payments for a content creator.
${data.income ? `Quarterly Income: $${sanitizeForPrompt(data.income)}` : ""}
${data.expenses ? `Quarterly Expenses: $${sanitizeForPrompt(data.expenses)}` : ""}
${data.quarter ? `Quarter: ${sanitizeForPrompt(data.quarter)}` : ""}
Respond as JSON:
{
  "estimated": {"federal": "estimated federal tax", "state": "estimated state tax considerations", "selfEmployment": "self-employment tax estimate"},
  "payments": "payment schedule and amounts",
  "deadlines": "upcoming tax deadlines",
  "optimization": "tax optimization strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandDealEvaluator(data: { brand?: string; offer?: number; deliverables?: string[] }, userId?: string) {
  const p = `Evaluate a brand deal offer for a content creator.
${data.brand ? `Brand: ${sanitizeForPrompt(data.brand)}` : ""}
${data.offer ? `Offer Amount: $${sanitizeForPrompt(data.offer)}` : ""}
${data.deliverables ? `Deliverables: ${sanitizeForPrompt(data.deliverables.join(", "))}` : ""}
Respond as JSON:
{
  "evaluation": {"fairness": "offer fairness assessment", "marketRate": "market rate comparison", "redFlags": "potential red flags"},
  "counter": "counter-offer recommendation",
  "walkAway": "walk-away analysis",
  "longTerm": "long-term partnership potential"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaKitEnhancer(data: { currentMetrics?: any; niche?: string }, userId?: string) {
  const p = `Enhance a content creator's media kit for sponsorship pitches.
${data.currentMetrics ? `Current Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.currentMetrics))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "enhancements": [{"section": "media kit section", "improvement": "specific improvement suggestion"}],
  "design": "design and layout recommendations",
  "caseStudies": "case study ideas to include",
  "socialProof": "social proof elements to highlight"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRateCardGenerator(data: { niche?: string; metrics?: any }, userId?: string) {
  const p = `Generate a professional rate card for a content creator's services.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.metrics ? `Channel Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON:
{
  "rateCard": [{"service": "service type", "price": "price range", "includes": "what is included"}],
  "customization": "rate card customization tips",
  "negotiation": "negotiation flexibility guidelines"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorROICalculator(data: { sponsorPaid?: number; deliverables?: any }, userId?: string) {
  const p = `Calculate ROI for a sponsor's investment in a content creator partnership.
${data.sponsorPaid ? `Sponsor Payment: $${sanitizeForPrompt(data.sponsorPaid)}` : ""}
${data.deliverables ? `Deliverables: ${JSON.stringify(sanitizeObjectForPrompt(data.deliverables))}` : ""}
Respond as JSON:
{
  "roi": {"views": "estimated views delivered", "clicks": "estimated clicks generated", "conversions": "estimated conversions", "value": "total value delivered"},
  "report": "ROI report summary for sponsor",
  "improvements": "suggestions to improve ROI for future deals"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPassiveIncomeBuilder(data: { niche?: string; skills?: string[] }, userId?: string) {
  const p = `Build passive income streams for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.skills ? `Skills: ${sanitizeForPrompt(data.skills.join(", "))}` : ""}
Respond as JSON:
{
  "streams": [{"source": "income source", "potential": "monthly earning potential", "setup": "setup requirements", "maintenance": "ongoing maintenance needed"}],
  "timeline": "implementation timeline",
  "priority": "prioritized action plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPricingStrategyAdvisor(data: { product?: string; market?: string }, userId?: string) {
  const p = `Advise on pricing strategy for a content creator's product or service.
${data.product ? `Product/Service: ${sanitizeForPrompt(data.product)}` : ""}
${data.market ? `Target Market: ${sanitizeForPrompt(data.market)}` : ""}
Respond as JSON:
{
  "strategy": "recommended pricing strategy",
  "tiers": "tier-based pricing suggestions",
  "psychology": "pricing psychology tactics",
  "testing": "A/B testing recommendations",
  "competitors": "competitive pricing analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueAttributionAnalyzer(data: { sources?: Record<string, number> }, userId?: string) {
  const p = `Analyze revenue attribution across multiple channels for a content creator.
${data.sources ? `Revenue Sources: ${JSON.stringify(sanitizeObjectForPrompt(data.sources))}` : ""}
Respond as JSON:
{
  "attribution": [{"source": "revenue source", "revenue": "revenue amount or percentage", "trend": "growth trend"}],
  "crossChannel": "cross-channel attribution insights",
  "optimization": "revenue optimization recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDonationOptimizer(data: { platform?: string; avgDonation?: number }, userId?: string) {
  const p = `Optimize donation and tip revenue for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.avgDonation ? `Average Donation: $${sanitizeForPrompt(data.avgDonation)}` : ""}
Respond as JSON:
{
  "strategies": [{"method": "donation method", "optimization": "optimization tactic"}],
  "goals": "donation goal-setting strategies",
  "recognition": "donor recognition best practices",
  "psychology": "donation psychology insights"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrowdfundingAdvisor(data: { project?: string; goal?: number }, userId?: string) {
  const p = `Advise on crowdfunding strategy for a content creator's project.
${data.project ? `Project: ${sanitizeForPrompt(data.project)}` : ""}
${data.goal ? `Funding Goal: $${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON:
{
  "strategy": "overall crowdfunding strategy",
  "tiers": "reward tier recommendations",
  "timeline": "campaign timeline and milestones",
  "marketing": "campaign marketing plan",
  "risks": "risk assessment and mitigation",
  "platforms": "recommended crowdfunding platforms"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLicensingAdvisor(data: { contentType?: string; assets?: string[] }, userId?: string) {
  const p = `Advise on content licensing opportunities for a creator.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.assets ? `Available Assets: ${sanitizeForPrompt(data.assets.join(", "))}` : ""}
Respond as JSON:
{
  "opportunities": [{"asset": "licensable asset", "licensee": "potential licensee type", "revenue": "revenue potential"}],
  "protection": "intellectual property protection recommendations",
  "contracts": "licensing contract essentials"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBookDealAdvisor(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Advise a content creator on pursuing a book deal or self-publishing.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.audience ? `Audience Size/Type: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "assessment": "book deal viability assessment",
  "publishers": "traditional publisher recommendations",
  "selfPublish": "self-publishing strategy",
  "ghostwriter": "ghostwriter considerations",
  "marketing": "book marketing and launch plan"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSpeakingFeeCalculator(data: { subscribers?: number; niche?: string }, userId?: string) {
  const p = `Calculate speaking fees for a content creator at events and conferences.
${data.subscribers ? `Subscribers: ${sanitizeForPrompt(data.subscribers)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "fees": {"virtual": "virtual speaking fee range", "inPerson": "in-person speaking fee range", "workshop": "workshop fee range"},
  "negotiation": "fee negotiation strategies",
  "portfolio": "speaking portfolio building tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConsultingPackageBuilder(data: { expertise?: string; niche?: string }, userId?: string) {
  const p = `Build consulting packages for a content creator to monetize their expertise.
${data.expertise ? `Expertise: ${sanitizeForPrompt(data.expertise)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON:
{
  "packages": [{"name": "package name", "price": "package price", "includes": "what is included", "duration": "engagement duration"}],
  "positioning": "market positioning strategy",
  "sales": "sales and client acquisition tactics"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExpenseTracker(data: { expenses?: Array<{item: string; amount: number; category?: string}> }, userId?: string) {
  const p = `Track and categorize business expenses for a content creator.
${data.expenses ? `Expenses: ${JSON.stringify(sanitizeObjectForPrompt(data.expenses))}` : ""}
Respond as JSON:
{
  "categorized": "expenses organized by category",
  "totalByCategory": "total spending per category",
  "monthOverMonth": "month-over-month spending trends",
  "savings": "cost-saving opportunities",
  "deductible": "tax-deductible expense identification"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProfitMarginAnalyzer(data: { revenue?: number; expenses?: number }, userId?: string) {
  const p = `Analyze profit margins for a content creator's business.
${data.revenue ? `Monthly Revenue: $${sanitizeForPrompt(data.revenue)}` : ""}
${data.expenses ? `Monthly Expenses: $${sanitizeForPrompt(data.expenses)}` : ""}
Respond as JSON:
{
  "margin": "current profit margin analysis",
  "benchmark": "industry benchmark comparison",
  "improvements": "margin improvement strategies",
  "costCutting": "cost reduction recommendations",
  "revenueGrowth": "revenue growth opportunities"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCashFlowForecaster(data: { monthlyIncome?: number; monthlyExpenses?: number }, userId?: string) {
  const p = `Forecast cash flow for a content creator's business.
${data.monthlyIncome ? `Monthly Income: $${sanitizeForPrompt(data.monthlyIncome)}` : ""}
${data.monthlyExpenses ? `Monthly Expenses: $${sanitizeForPrompt(data.monthlyExpenses)}` : ""}
Respond as JSON:
{
  "forecast": [{"month": "month name", "income": "projected income", "expenses": "projected expenses", "net": "net cash flow"}],
  "alerts": "cash flow warning alerts",
  "runway": "financial runway estimate",
  "optimization": "cash flow optimization tips"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPaymentGatewayAdvisor(data: { volume?: number; international?: boolean }, userId?: string) {
  const p = `Recommend payment gateways for a content creator's business.
${data.volume ? `Monthly Transaction Volume: $${sanitizeForPrompt(data.volume)}` : ""}
${data.international !== undefined ? `International Payments: ${data.international ? "Yes" : "No"}` : ""}
Respond as JSON:
{
  "gateways": [{"name": "gateway name", "fees": "fee structure", "features": "key features", "best": "best use case"}],
  "comparison": "gateway comparison summary",
  "integration": "integration recommendations"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriptionBoxBuilder(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Design a subscription box business for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.audience ? `Target Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "concept": "subscription box concept and theme",
  "pricing": "pricing strategy and tiers",
  "contents": "box contents and curation strategy",
  "logistics": "fulfillment and logistics plan",
  "marketing": "marketing and launch strategy",
  "margins": "profit margin analysis"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNFTContentAdvisor(data: { contentType?: string; audience?: string }, userId?: string) {
  const p = `Advise on NFT and digital collectible strategy for a content creator.
${data.contentType ? `Content Type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON:
{
  "strategy": "NFT strategy overview",
  "platforms": "recommended NFT platforms",
  "pricing": "NFT pricing strategy",
  "legal": "legal considerations and compliance",
  "community": "community building around NFTs",
  "risks": "risks and mitigation strategies"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueGoalTracker(data: { monthlyGoal?: number; currentRevenue?: number }, userId?: string) {
  const p = `Track revenue goals and provide strategies to close the gap for a content creator.
${data.monthlyGoal ? `Monthly Revenue Goal: $${sanitizeForPrompt(data.monthlyGoal)}` : ""}
${data.currentRevenue ? `Current Monthly Revenue: $${sanitizeForPrompt(data.currentRevenue)}` : ""}
Respond as JSON:
{
  "progress": "goal progress analysis",
  "gap": "revenue gap breakdown",
  "strategies": "strategies to close the revenue gap",
  "timeline": "projected timeline to reach goal",
  "milestones": "intermediate milestones to track"
}`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommentResponseGenerator(data: { comment?: string; tone?: string }, userId?: string) {
  const p = `Generate thoughtful comment responses for a content creator.
${data.comment ? `Comment to respond to: "${sanitizeForPrompt(data.comment)}"` : ""}
${data.tone ? `Desired tone: ${sanitizeForPrompt(data.tone)}` : ""}
Respond as JSON: { "responses": [{"text": "response text", "tone": "tone used", "engagement": "engagement level"}], "bestResponse": "the best response option", "strategy": "overall response strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperfanIdentifier(data: { comments?: Array<{author: string; count: number}> }, userId?: string) {
  const p = `Identify and analyze superfans from comment data for a content creator.
${data.comments ? `Comment data: ${JSON.stringify(data.comments.map(c => ({ author: sanitizeForPrompt(c.author), count: c.count })))}` : ""}
Respond as JSON: { "superfans": [{"name": "fan name", "engagement": "engagement level", "value": "value to community", "nurture": "nurture strategy"}], "strategy": "overall superfan strategy", "rewards": "reward ideas for superfans" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordServerPlanner(data: { channelName?: string; memberCount?: number }, userId?: string) {
  const p = `Plan a Discord server structure for a content creator community.
${data.channelName ? `Channel/Brand name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.memberCount ? `Expected member count: ${sanitizeForPrompt(data.memberCount)}` : ""}
Respond as JSON: { "structure": [{"channel": "channel name", "purpose": "channel purpose", "rules": "channel rules"}], "bots": "recommended bots", "events": "community events plan", "moderation": "moderation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityEventPlanner(data: { community?: string; platform?: string }, userId?: string) {
  const p = `Plan community events for a content creator.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "events": [{"name": "event name", "type": "event type", "schedule": "schedule details", "format": "event format"}], "promotion": "promotion strategy", "engagement": "engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPollCreator(data: { topic?: string; platform?: string }, userId?: string) {
  const p = `Create engaging polls for a content creator's audience.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "polls": [{"question": "poll question", "options": "poll options", "timing": "best timing to post"}], "engagement": "engagement strategy", "followUp": "follow-up content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContestRunner(data: { prize?: string; niche?: string }, userId?: string) {
  const p = `Plan and structure a contest or giveaway for a content creator.
${data.prize ? `Prize: ${sanitizeForPrompt(data.prize)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "contests": [{"name": "contest name", "rules": "contest rules", "prizes": "prize details", "duration": "contest duration"}], "legal": "legal considerations", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityGuidelinesWriter(data: { platform?: string; values?: string[] }, userId?: string) {
  const p = `Write community guidelines for a content creator's community.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.values ? `Core values: ${sanitizeForPrompt(data.values.join(", "))}` : ""}
Respond as JSON: { "guidelines": "full community guidelines text", "enforcement": "enforcement policy", "appeals": "appeals process", "examples": "examples of acceptable and unacceptable behavior" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiModeratorTrainer(data: { communitySize?: number; issues?: string[] }, userId?: string) {
  const p = `Create a moderator training program for a content creator's community.
${data.communitySize ? `Community size: ${sanitizeForPrompt(data.communitySize)}` : ""}
${data.issues ? `Common issues: ${sanitizeForPrompt(data.issues.join(", "))}` : ""}
Respond as JSON: { "training": [{"topic": "training topic", "guidelines": "specific guidelines", "scenarios": "example scenarios"}], "tools": "recommended moderation tools", "escalation": "escalation procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAMAPlanner(data: { topic?: string; audience?: string }, userId?: string) {
  const p = `Plan an AMA (Ask Me Anything) session for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.audience ? `Target audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "plan": {"prep": "preparation steps", "format": "AMA format", "questions": "anticipated questions and answers", "followUp": "follow-up actions"}, "promotion": "promotion strategy", "platform": "recommended platform" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLoyaltyProgramBuilder(data: { platform?: string; rewards?: string[] }, userId?: string) {
  const p = `Build a loyalty program for a content creator's community.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.rewards ? `Available rewards: ${sanitizeForPrompt(data.rewards.join(", "))}` : ""}
Respond as JSON: { "tiers": [{"name": "tier name", "requirements": "tier requirements", "rewards": "tier rewards"}], "points": "points system design", "engagement": "engagement mechanics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUserGeneratedContentStrategy(data: { niche?: string; community?: string }, userId?: string) {
  const p = `Create a user-generated content strategy for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
Respond as JSON: { "strategy": [{"type": "UGC type", "incentive": "incentive for creation", "curation": "curation process"}], "legal": "legal considerations for UGC", "showcase": "how to showcase UGC" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityHealthScorer(data: { metrics?: any }, userId?: string) {
  const p = `Score and analyze the health of a content creator's community.
${data.metrics ? `Community metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON: { "score": "overall health score 0-100", "indicators": [{"metric": "metric name", "health": "health status"}], "improvements": "suggested improvements", "alerts": "any urgent alerts" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFanArtCurator(data: { channelName?: string }, userId?: string) {
  const p = `Create a fan art curation strategy for a content creator.
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON: { "strategy": "fan art curation strategy", "showcase": "how to showcase fan art", "guidelines": "submission guidelines", "credit": "crediting policy", "monetization": "monetization considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMilestoneEventPlanner(data: { milestone?: string; audience?: string }, userId?: string) {
  const p = `Plan a milestone celebration event for a content creator.
${data.milestone ? `Milestone: ${sanitizeForPrompt(data.milestone)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "event": {"type": "event type", "content": "content plan", "celebration": "celebration details"}, "promotion": "promotion strategy", "memorabilia": "memorabilia ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDMResponseTemplates(data: { commonQuestions?: string[] }, userId?: string) {
  const p = `Create DM response templates for a content creator.
${data.commonQuestions ? `Common questions received: ${sanitizeForPrompt(data.commonQuestions.join(", "))}` : ""}
Respond as JSON: { "templates": [{"question": "common question", "response": "template response", "followUp": "follow-up message"}], "automation": "automation recommendations", "personalization": "personalization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHashtagCommunityBuilder(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Build a hashtag-based community strategy for a content creator.
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "hashtag": "primary branded hashtag", "campaign": "hashtag campaign strategy", "challenges": "hashtag challenge ideas", "tracking": "tracking and measurement plan", "growth": "growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLiveQAManager(data: { topic?: string; expectedQuestions?: string[] }, userId?: string) {
  const p = `Prepare for a live Q&A session for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.expectedQuestions ? `Expected questions: ${sanitizeForPrompt(data.expectedQuestions.join(", "))}` : ""}
Respond as JSON: { "prep": [{"question": "anticipated question", "answer": "prepared answer", "talking": "talking points"}], "moderation": "moderation plan", "followUp": "post-session follow-up" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReferralProgramBuilder(data: { platform?: string; incentive?: string }, userId?: string) {
  const p = `Build a referral program for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.incentive ? `Incentive type: ${sanitizeForPrompt(data.incentive)}` : ""}
Respond as JSON: { "program": {"structure": "program structure", "rewards": "reward tiers", "tracking": "tracking mechanism"}, "promotion": "promotion strategy", "analytics": "analytics and KPIs" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityAmbassadorProgram(data: { community?: string; goals?: string[] }, userId?: string) {
  const p = `Design a community ambassador program for a content creator.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
${data.goals ? `Program goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "program": {"roles": "ambassador roles and responsibilities", "requirements": "selection requirements", "perks": "ambassador perks"}, "recruitment": "recruitment strategy", "management": "program management plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEngagementBoostStrategy(data: { currentEngagement?: number; platform?: string }, userId?: string) {
  const p = `Create an engagement boost strategy for a content creator.
${data.currentEngagement ? `Current engagement rate: ${sanitizeForPrompt(data.currentEngagement)}%` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "strategies": [{"tactic": "engagement tactic", "implementation": "how to implement", "impact": "expected impact"}], "timeline": "implementation timeline", "metrics": "metrics to track" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHiringAdvisor(data: { role?: string; budget?: number }, userId?: string) {
  const p = `Advise on hiring for a content creator's team.
${data.role ? `Role needed: ${sanitizeForPrompt(data.role)}` : ""}
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "roles": [{"title": "role title", "skills": "required skills", "rate": "expected rate", "where": "where to find candidates"}], "interview": "interview process", "onboarding": "onboarding plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFreelancerFinder(data: { skill?: string; budget?: string }, userId?: string) {
  const p = `Find and vet freelancers for a content creator.
${data.skill ? `Skill needed: ${sanitizeForPrompt(data.skill)}` : ""}
${data.budget ? `Budget: ${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "platforms": [{"name": "platform name", "skill": "skill match", "avgRate": "average rate"}], "vetting": "vetting process", "contracts": "contract recommendations", "management": "freelancer management tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSOPBuilder(data: { process?: string; team?: string[] }, userId?: string) {
  const p = `Build a Standard Operating Procedure for a content creator's workflow.
${data.process ? `Process: ${sanitizeForPrompt(data.process)}` : ""}
${data.team ? `Team members: ${sanitizeForPrompt(data.team.join(", "))}` : ""}
Respond as JSON: { "sop": [{"step": "step description", "owner": "responsible person", "tools": "tools needed", "time": "estimated time"}], "documentation": "documentation format", "updates": "update schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProjectTimeline(data: { project?: string; deadline?: string }, userId?: string) {
  const p = `Create a project timeline for a content creator's project.
${data.project ? `Project: ${sanitizeForPrompt(data.project)}` : ""}
${data.deadline ? `Deadline: ${sanitizeForPrompt(data.deadline)}` : ""}
Respond as JSON: { "timeline": [{"phase": "phase name", "tasks": "tasks in this phase", "duration": "phase duration", "dependencies": "dependencies"}], "risks": "risk assessment", "milestones": "key milestones" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentApprovalFlow(data: { teamSize?: number; contentTypes?: string[] }, userId?: string) {
  const p = `Design a content approval workflow for a content creator's team.
${data.teamSize ? `Team size: ${sanitizeForPrompt(data.teamSize)}` : ""}
${data.contentTypes ? `Content types: ${sanitizeForPrompt(data.contentTypes.join(", "))}` : ""}
Respond as JSON: { "flow": [{"stage": "approval stage", "reviewer": "who reviews", "criteria": "approval criteria"}], "tools": "recommended tools", "turnaround": "expected turnaround times" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditingChecklistBuilder(data: { videoType?: string; style?: string }, userId?: string) {
  const p = `Build a video editing checklist for a content creator.
${data.videoType ? `Video type: ${sanitizeForPrompt(data.videoType)}` : ""}
${data.style ? `Editing style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "checklist": [{"category": "checklist category", "items": "checklist items"}], "quality": "quality standards", "standards": "technical standards" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductionBudgetPlanner(data: { contentType?: string; frequency?: string }, userId?: string) {
  const p = `Plan a production budget for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.frequency ? `Production frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "budget": [{"category": "budget category", "monthly": "monthly cost", "yearly": "yearly cost"}], "savings": "cost-saving tips", "ROI": "expected ROI analysis" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEquipmentRecommender(data: { budget?: number; contentType?: string }, userId?: string) {
  const p = `Recommend equipment for a content creator.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "equipment": [{"item": "equipment type", "model": "recommended model", "price": "price estimate", "priority": "purchase priority"}], "upgradePath": "future upgrade recommendations", "alternatives": "budget-friendly alternatives" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStudioSetupPlanner(data: { space?: string; budget?: number }, userId?: string) {
  const p = `Plan a studio setup for a content creator.
${data.space ? `Available space: ${sanitizeForPrompt(data.space)}` : ""}
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "layout": "studio layout plan", "equipment": [{"item": "equipment item", "placement": "where to place it", "cost": "estimated cost"}], "acoustic": "acoustic treatment plan", "lighting": "lighting setup plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkflowOptimizer(data: { currentSteps?: string[]; bottlenecks?: string[] }, userId?: string) {
  const p = `Optimize the content creation workflow for a creator.
${data.currentSteps ? `Current workflow steps: ${sanitizeForPrompt(data.currentSteps.join(", "))}` : ""}
${data.bottlenecks ? `Known bottlenecks: ${sanitizeForPrompt(data.bottlenecks.join(", "))}` : ""}
Respond as JSON: { "optimized": [{"step": "workflow step", "improvement": "suggested improvement", "timeSaved": "time saved"}], "tools": "recommended tools", "automation": "automation opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBatchRecordingScheduler(data: { frequency?: string; videos?: number }, userId?: string) {
  const p = `Create a batch recording schedule for a content creator.
${data.frequency ? `Upload frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
${data.videos ? `Videos per batch: ${sanitizeForPrompt(data.videos)}` : ""}
Respond as JSON: { "schedule": [{"day": "recording day", "videos": "number of videos", "setup": "setup requirements", "props": "props needed"}], "efficiency": "efficiency tips", "tips": "batch recording best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOutsourcingAdvisor(data: { tasks?: string[]; budget?: number }, userId?: string) {
  const p = `Advise on outsourcing tasks for a content creator.
${data.tasks ? `Tasks to consider: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "outsource": [{"task": "task name", "provider": "recommended provider type", "cost": "estimated cost", "quality": "quality expectations"}], "keep": "tasks to keep in-house", "platforms": "recommended outsourcing platforms" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiToolStackOptimizer(data: { currentTools?: string[]; budget?: number }, userId?: string) {
  const p = `Optimize the tool stack for a content creator.
${data.currentTools ? `Current tools: ${sanitizeForPrompt(data.currentTools.join(", "))}` : ""}
${data.budget ? `Monthly budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "optimized": [{"tool": "recommended tool", "replaces": "what it replaces", "savings": "cost savings", "features": "key features"}], "total": "total monthly cost", "recommendations": "additional recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandVoiceCreator(data: { personality?: string; values?: string[] }, userId?: string) {
  const p = `Create a brand voice guide for a content creator.
${data.personality ? `Brand personality: ${sanitizeForPrompt(data.personality)}` : ""}
${data.values ? `Core values: ${sanitizeForPrompt(data.values.join(", "))}` : ""}
Respond as JSON: { "voice": {"tone": "brand tone description", "vocabulary": "vocabulary guidelines", "personality": "personality traits"}, "guidelines": "usage guidelines", "examples": "example content in brand voice", "doNots": "things to avoid" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandColorPalette(data: { industry?: string; mood?: string }, userId?: string) {
  const p = `Create a brand color palette for a content creator.
${data.industry ? `Industry: ${sanitizeForPrompt(data.industry)}` : ""}
${data.mood ? `Desired mood: ${sanitizeForPrompt(data.mood)}` : ""}
Respond as JSON: { "palette": [{"name": "color name", "hex": "hex code", "usage": "where to use this color"}], "accessibility": "accessibility considerations", "darkMode": "dark mode color adjustments", "lightMode": "light mode color adjustments" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandFontSelector(data: { style?: string; platform?: string }, userId?: string) {
  const p = `Select brand fonts for a content creator.
${data.style ? `Brand style: ${sanitizeForPrompt(data.style)}` : ""}
${data.platform ? `Primary platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "fonts": [{"name": "font name", "usage": "where to use", "pairing": "font pairing suggestion", "weight": "recommended weights"}], "hierarchy": "typographic hierarchy", "licensing": "licensing information" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandStoryWriter(data: { channelName?: string; origin?: string }, userId?: string) {
  const p = `Write a compelling brand story for a content creator.
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.origin ? `Origin story: ${sanitizeForPrompt(data.origin)}` : ""}
Respond as JSON: { "story": {"hook": "attention-grabbing opening", "journey": "the creator journey", "mission": "brand mission", "vision": "brand vision"}, "platforms": "platform-specific versions", "variations": "short and long versions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandConsistencyAuditor(data: { platforms?: string[] }, userId?: string) {
  const p = `Audit brand consistency across platforms for a content creator.
${data.platforms ? `Platforms to audit: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "audit": [{"platform": "platform name", "consistency": "consistency score", "issues": "identified issues"}], "score": "overall consistency score", "fixes": "recommended fixes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPillarRefiner(data: { pillars?: string[]; performance?: any }, userId?: string) {
  const p = `Refine content pillars based on performance data for a content creator.
${data.pillars ? `Current pillars: ${sanitizeForPrompt(data.pillars.join(", "))}` : ""}
${data.performance ? `Performance data: ${JSON.stringify(sanitizeObjectForPrompt(data.performance))}` : ""}
Respond as JSON: { "refined": [{"pillar": "pillar name", "adjustment": "recommended adjustment", "reasoning": "reasoning for change"}], "newPillars": "suggested new pillars", "retire": "pillars to consider retiring" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelTrailerBuilder(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Create a channel trailer script for a content creator.
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "script": "full trailer script", "duration": "recommended duration", "structure": "trailer structure breakdown", "cta": "call to action", "style": "visual style recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelArtDirector(data: { channelName?: string; style?: string }, userId?: string) {
  const p = `Provide art direction for a content creator's channel branding.
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.style ? `Preferred style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "direction": {"banner": "banner design direction", "logo": "logo design direction", "thumbnails": "thumbnail style guide", "colors": "color scheme"}, "consistency": "consistency guidelines", "refresh": "brand refresh schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUniqueSellingPointFinder(data: { niche?: string; competitors?: string[] }, userId?: string) {
  const p = `Identify unique selling points for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON: { "usp": [{"angle": "unique angle", "strength": "strength level", "positioning": "market positioning"}], "differentiation": "differentiation strategy", "messaging": "key messaging" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTargetAudienceDefiner(data: { niche?: string; content?: string[] }, userId?: string) {
  const p = `Define target audience personas for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.content ? `Content types: ${sanitizeForPrompt(data.content.join(", "))}` : ""}
Respond as JSON: { "personas": [{"name": "persona name", "demographics": "demographic details", "interests": "interests and hobbies", "painPoints": "pain points and needs"}], "content": "content strategy per persona", "messaging": "messaging guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandPartnershipMatcher(data: { values?: string[]; niche?: string }, userId?: string) {
  const p = `Match brand partnership opportunities for a content creator.
${data.values ? `Brand values: ${sanitizeForPrompt(data.values.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "partners": [{"brand": "brand name or type", "alignment": "value alignment score", "opportunity": "partnership opportunity"}], "approach": "outreach approach", "criteria": "partnership evaluation criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisCommsPlanner(data: { scenario?: string }, userId?: string) {
  const p = `Create a crisis communications plan for a content creator.
${data.scenario ? `Scenario: ${sanitizeForPrompt(data.scenario)}` : ""}
Respond as JSON: { "plan": {"response": "initial response strategy", "timeline": "response timeline", "channels": "communication channels", "messaging": "key messages"}, "prevention": "prevention strategies", "templates": "response templates" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalBrandAudit(data: { platforms?: string[]; channelName?: string }, userId?: string) {
  const p = `Conduct a personal brand audit for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.channelName ? `Channel name: ${sanitizeForPrompt(data.channelName)}` : ""}
Respond as JSON: { "audit": [{"area": "audit area", "score": "score out of 100", "improvement": "improvement suggestions"}], "overall": "overall brand score", "priorities": "top priorities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandEvolutionPlanner(data: { currentBrand?: string; goals?: string[] }, userId?: string) {
  const p = `Plan brand evolution for a content creator.
${data.currentBrand ? `Current brand description: ${sanitizeForPrompt(data.currentBrand)}` : ""}
${data.goals ? `Evolution goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "evolution": [{"phase": "evolution phase", "changes": "planned changes", "timeline": "phase timeline"}], "risks": "risks and mitigation", "communication": "how to communicate changes to audience" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorDifferentiator(data: { competitors?: string[]; niche?: string }, userId?: string) {
  const p = `Analyze competitors and find differentiation opportunities for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "gaps": [{"area": "competitive area", "yours": "your position", "theirs": "their position", "opportunity": "opportunity to differentiate"}], "strategy": "differentiation strategy", "positioning": "market positioning" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollaborationBriefWriter(data: { partner?: string; concept?: string }, userId?: string) {
  const p = `Write a collaboration brief for a content creator partnership.
${data.partner ? `Partner: ${sanitizeForPrompt(data.partner)}` : ""}
${data.concept ? `Concept: ${sanitizeForPrompt(data.concept)}` : ""}
Respond as JSON: { "brief": {"objectives": "collaboration objectives", "deliverables": "expected deliverables", "timeline": "project timeline", "terms": "suggested terms"}, "template": "reusable brief template" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkingEventPrep(data: { event?: string; goals?: string[] }, userId?: string) {
  const p = `Prepare for a networking event as a content creator.
${data.event ? `Event: ${sanitizeForPrompt(data.event)}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "prep": {"elevator": "elevator pitch", "cards": "business card tips", "goals": "networking goals", "followUp": "follow-up strategy"}, "talking": "talking points", "contacts": "types of contacts to target" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMentorshipFinder(data: { goals?: string[]; niche?: string }, userId?: string) {
  const p = `Find mentorship opportunities for a content creator.
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "mentors": [{"type": "mentor type", "where": "where to find them", "approach": "how to approach"}], "program": "mentorship program structure", "reciprocity": "what to offer in return" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDelegationAdvisor(data: { tasks?: string[]; teamSize?: number }, userId?: string) {
  const p = `Advise on task delegation for a content creator's team.
${data.tasks ? `Tasks to delegate: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
${data.teamSize ? `Team size: ${sanitizeForPrompt(data.teamSize)}` : ""}
Respond as JSON: { "delegation": [{"task": "task name", "delegateTo": "who to delegate to", "priority": "delegation priority"}], "keep": "tasks to keep yourself", "systemize": "tasks to systemize" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeManagementCoach(data: { schedule?: string; tasks?: string[] }, userId?: string) {
  const p = `Coach a content creator on time management.
${data.schedule ? `Current schedule: ${sanitizeForPrompt(data.schedule)}` : ""}
${data.tasks ? `Tasks: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
Respond as JSON: { "optimized": [{"block": "time block", "activity": "planned activity", "duration": "duration"}], "tips": "productivity tips", "boundaries": "boundary-setting advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorMastermindPlanner(data: { niche?: string; level?: string }, userId?: string) {
  const p = `Plan a creator mastermind group for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.level ? `Creator level: ${sanitizeForPrompt(data.level)}` : ""}
Respond as JSON: { "mastermind": {"structure": "group structure", "frequency": "meeting frequency", "topics": "discussion topics", "members": "ideal member profiles"}, "format": "meeting format", "rules": "group rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductivityTracker(data: { tasksCompleted?: number; hoursWorked?: number }, userId?: string) {
  const p = `Track and analyze productivity for a content creator.
${data.tasksCompleted ? `Tasks completed: ${sanitizeForPrompt(data.tasksCompleted)}` : ""}
${data.hoursWorked ? `Hours worked: ${sanitizeForPrompt(data.hoursWorked)}` : ""}
Respond as JSON: { "score": "productivity score 0-100", "efficiency": "efficiency analysis", "recommendations": "improvement recommendations", "burnoutRisk": "burnout risk assessment", "balance": "work-life balance tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCopyrightChecker(data: { content?: string; type?: string }, userId?: string) {
  const p = `Check content for copyright risks.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
${data.type ? `Content type: ${sanitizeForPrompt(data.type)}` : ""}
Respond as JSON: { "risks": [{"issue": "copyright issue", "severity": "severity level", "solution": "recommended solution"}], "safetyScore": "safety score 0-100", "alternatives": "safe alternatives" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFairUseAnalyzer(data: { usage?: string; original?: string }, userId?: string) {
  const p = `Analyze fair use for content usage.
${data.usage ? `Usage description: ${sanitizeForPrompt(data.usage)}` : ""}
${data.original ? `Original work: ${sanitizeForPrompt(data.original)}` : ""}
Respond as JSON: { "analysis": {"transformative": "transformative factor analysis", "commercial": "commercial nature analysis", "amount": "amount used analysis", "effect": "market effect analysis"}, "conclusion": "fair use conclusion", "risks": "risk assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicLicenseAdvisor(data: { useCase?: string; platform?: string }, userId?: string) {
  const p = `Advise on music licensing for content creators.
${data.useCase ? `Use case: ${sanitizeForPrompt(data.useCase)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "licenses": [{"type": "license type", "provider": "license provider", "cost": "estimated cost", "rights": "rights included"}], "freeSources": "free music sources", "alternatives": "alternative options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrivacyPolicyGenerator(data: { platforms?: string[]; dataCollected?: string[] }, userId?: string) {
  const p = `Generate a privacy policy for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.dataCollected ? `Data collected: ${sanitizeForPrompt(data.dataCollected.join(", "))}` : ""}
Respond as JSON: { "policy": "privacy policy summary", "sections": [{"title": "section title", "content": "section content"}], "compliance": "compliance notes", "updates": "recommended update schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTermsOfServiceWriter(data: { services?: string[]; platforms?: string[] }, userId?: string) {
  const p = `Write terms of service for a content creator.
${data.services ? `Services offered: ${sanitizeForPrompt(data.services.join(", "))}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "terms": "terms of service summary", "sections": [{"title": "section title", "content": "section content"}], "enforcement": "enforcement guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFTCComplianceChecker(data: { contentType?: string; sponsorships?: boolean }, userId?: string) {
  const p = `Check FTC compliance for content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.sponsorships !== undefined ? `Has sponsorships: ${sanitizeForPrompt(data.sponsorships)}` : ""}
Respond as JSON: { "compliant": "compliance status", "issues": [{"rule": "FTC rule", "violation": "potential violation", "fix": "how to fix"}], "disclosures": "required disclosures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCOPPAAdvisor(data: { targetAudience?: string }, userId?: string) {
  const p = `Advise on COPPA compliance for content creator.
${data.targetAudience ? `Target audience: ${sanitizeForPrompt(data.targetAudience)}` : ""}
Respond as JSON: { "applicable": "whether COPPA applies", "requirements": [{"rule": "COPPA rule", "implementation": "how to implement"}], "risks": "risk assessment", "alternatives": "alternative approaches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGDPRComplianceChecker(data: { dataProcessing?: string[] }, userId?: string) {
  const p = `Check GDPR compliance for content creator.
${data.dataProcessing ? `Data processing activities: ${sanitizeForPrompt(data.dataProcessing.join(", "))}` : ""}
Respond as JSON: { "compliant": "compliance status", "gaps": [{"requirement": "GDPR requirement", "status": "current status", "action": "required action"}], "dpa": "data processing agreement notes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentIDManager(data: { platform?: string; claims?: number }, userId?: string) {
  const p = `Manage Content ID claims for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.claims ? `Number of claims: ${sanitizeForPrompt(data.claims)}` : ""}
Respond as JSON: { "management": [{"claimType": "type of claim", "response": "recommended response", "prevention": "prevention strategy"}], "strategy": "overall management strategy", "appeals": "appeal process guidance" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDisputeResolutionAdvisor(data: { disputeType?: string }, userId?: string) {
  const p = `Advise on dispute resolution for content creator.
${data.disputeType ? `Dispute type: ${sanitizeForPrompt(data.disputeType)}` : ""}
Respond as JSON: { "steps": [{"step": "resolution step", "timeline": "expected timeline", "action": "specific action"}], "escalation": "escalation path", "documentation": "documentation needed" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTrademarkAdvisor(data: { brandName?: string; niche?: string }, userId?: string) {
  const p = `Advise on trademark protection for a content creator brand.
${data.brandName ? `Brand name: ${sanitizeForPrompt(data.brandName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "availability": "trademark availability assessment", "risks": "potential risks", "registration": "registration process", "protection": "protection strategy", "costs": "estimated costs" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContractTemplateBuilder(data: { contractType?: string; parties?: string[] }, userId?: string) {
  const p = `Build a contract template for a content creator.
${data.contractType ? `Contract type: ${sanitizeForPrompt(data.contractType)}` : ""}
${data.parties ? `Parties involved: ${sanitizeForPrompt(data.parties.join(", "))}` : ""}
Respond as JSON: { "template": "contract template overview", "clauses": [{"title": "clause title", "content": "clause content", "importance": "importance level"}], "negotiation": "negotiation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInsuranceAdvisor(data: { contentType?: string; revenue?: number }, userId?: string) {
  const p = `Advise on insurance for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.revenue ? `Annual revenue: $${sanitizeForPrompt(data.revenue)}` : ""}
Respond as JSON: { "recommended": [{"type": "insurance type", "coverage": "coverage details", "cost": "estimated cost"}], "risks": "uninsured risks", "providers": "recommended providers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBusinessEntityAdvisor(data: { revenue?: number; state?: string }, userId?: string) {
  const p = `Advise on business entity structure for a content creator.
${data.revenue ? `Annual revenue: $${sanitizeForPrompt(data.revenue)}` : ""}
${data.state ? `State: ${sanitizeForPrompt(data.state)}` : ""}
Respond as JSON: { "recommended": "recommended entity type", "comparison": [{"type": "entity type", "pros": "advantages", "cons": "disadvantages", "tax": "tax implications"}], "steps": "formation steps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIntellectualPropertyProtector(data: { assets?: string[] }, userId?: string) {
  const p = `Protect intellectual property for a content creator.
${data.assets ? `Assets to protect: ${sanitizeForPrompt(data.assets.join(", "))}` : ""}
Respond as JSON: { "protection": [{"asset": "asset name", "method": "protection method", "cost": "estimated cost", "timeline": "timeline"}], "priority": "priority order", "enforcement": "enforcement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBurnoutRiskAssessor(data: { hoursPerWeek?: number; contentFrequency?: string }, userId?: string) {
  const p = `Assess burnout risk for a content creator.
${data.hoursPerWeek ? `Hours per week: ${sanitizeForPrompt(data.hoursPerWeek)}` : ""}
${data.contentFrequency ? `Content frequency: ${sanitizeForPrompt(data.contentFrequency)}` : ""}
Respond as JSON: { "riskLevel": "burnout risk level", "factors": [{"factor": "risk factor", "score": "factor score"}], "prevention": "prevention strategies", "recovery": "recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeditationGuide(data: { stressLevel?: string; duration?: string }, userId?: string) {
  const p = `Guide meditation for a content creator.
${data.stressLevel ? `Stress level: ${sanitizeForPrompt(data.stressLevel)}` : ""}
${data.duration ? `Available duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "duration": "duration", "technique": "technique description"}], "schedule": "recommended schedule", "benefits": "expected benefits" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkLifeBalancer(data: { workHours?: number; personalGoals?: string[] }, userId?: string) {
  const p = `Balance work and life for a content creator.
${data.workHours ? `Work hours per week: ${sanitizeForPrompt(data.workHours)}` : ""}
${data.personalGoals ? `Personal goals: ${sanitizeForPrompt(data.personalGoals.join(", "))}` : ""}
Respond as JSON: { "assessment": "current balance assessment", "adjustments": [{"area": "life area", "change": "recommended change", "benefit": "expected benefit"}], "boundaries": "boundary recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorMentalHealthMonitor(data: { mood?: string; stressors?: string[] }, userId?: string) {
  const p = `Monitor mental health for a content creator.
${data.mood ? `Current mood: ${sanitizeForPrompt(data.mood)}` : ""}
${data.stressors ? `Stressors: ${sanitizeForPrompt(data.stressors.join(", "))}` : ""}
Respond as JSON: { "assessment": "mental health assessment", "resources": [{"type": "resource type", "resource": "resource name", "access": "how to access"}], "coping": "coping strategies", "professional": "when to seek professional help" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSleepOptimizer(data: { schedule?: string; issues?: string[] }, userId?: string) {
  const p = `Optimize sleep for a content creator.
${data.schedule ? `Current schedule: ${sanitizeForPrompt(data.schedule)}` : ""}
${data.issues ? `Sleep issues: ${sanitizeForPrompt(data.issues.join(", "))}` : ""}
Respond as JSON: { "recommendations": [{"change": "recommended change", "impact": "expected impact", "implementation": "how to implement"}], "routine": "bedtime routine", "environment": "sleep environment tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExerciseForCreators(data: { sedentaryHours?: number; issues?: string[] }, userId?: string) {
  const p = `Recommend exercises for a content creator.
${data.sedentaryHours ? `Sedentary hours per day: ${sanitizeForPrompt(data.sedentaryHours)}` : ""}
${data.issues ? `Physical issues: ${sanitizeForPrompt(data.issues.join(", "))}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "duration": "duration", "benefit": "health benefit", "deskFriendly": "whether desk-friendly"}], "schedule": "exercise schedule", "ergonomics": "ergonomic tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEyeStrainPreventer(data: { screenHours?: number }, userId?: string) {
  const p = `Prevent eye strain for a content creator.
${data.screenHours ? `Screen hours per day: ${sanitizeForPrompt(data.screenHours)}` : ""}
Respond as JSON: { "tips": [{"tip": "prevention tip", "frequency": "how often", "benefit": "expected benefit"}], "settings": "display settings recommendations", "equipment": "recommended equipment", "breaks": "break schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceCareAdvisor(data: { speakingHours?: number; issues?: string[] }, userId?: string) {
  const p = `Advise on voice care for a content creator.
${data.speakingHours ? `Speaking hours per day: ${sanitizeForPrompt(data.speakingHours)}` : ""}
${data.issues ? `Voice issues: ${sanitizeForPrompt(data.issues.join(", "))}` : ""}
Respond as JSON: { "care": [{"tip": "voice care tip", "importance": "importance level", "technique": "technique description"}], "warmups": "vocal warmup exercises", "prevention": "prevention strategies", "recovery": "recovery tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStressManagementCoach(data: { triggers?: string[]; level?: string }, userId?: string) {
  const p = `Coach stress management for a content creator.
${data.triggers ? `Stress triggers: ${sanitizeForPrompt(data.triggers.join(", "))}` : ""}
${data.level ? `Stress level: ${sanitizeForPrompt(data.level)}` : ""}
Respond as JSON: { "strategies": [{"technique": "stress technique", "when": "when to use", "duration": "duration needed"}], "emergency": "emergency stress relief", "longTerm": "long-term management plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorBreakScheduler(data: { contentSchedule?: string; lastBreak?: string }, userId?: string) {
  const p = `Schedule breaks for a content creator.
${data.contentSchedule ? `Content schedule: ${sanitizeForPrompt(data.contentSchedule)}` : ""}
${data.lastBreak ? `Last break taken: ${sanitizeForPrompt(data.lastBreak)}` : ""}
Respond as JSON: { "nextBreak": "recommended next break", "schedule": [{"break": "break type", "duration": "duration", "timing": "when to take"}], "content": "content prep for breaks", "coverage": "coverage plan during breaks" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeAPIIntegrator(data: { features?: string[] }, userId?: string) {
  const p = `Guide YouTube API integration for a content creator.
${data.features ? `Desired features: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "endpoints": [{"api": "API endpoint", "purpose": "purpose", "implementation": "implementation guide"}], "authentication": "auth setup guide", "limits": "rate limits and quotas", "bestPractices": "best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchIntegrator(data: { features?: string[] }, userId?: string) {
  const p = `Guide Twitch integration for a content creator.
${data.features ? `Desired features: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "integration": [{"feature": "feature name", "api": "API to use", "implementation": "implementation guide"}], "authentication": "auth setup", "webhooks": "webhook configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordBotBuilder(data: { features?: string[] }, userId?: string) {
  const p = `Build a Discord bot for a content creator community.
${data.features ? `Desired features: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "bot": {"commands": "bot commands list", "events": "event handlers", "permissions": "required permissions"}, "hosting": "hosting recommendations", "deployment": "deployment guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleAnalyticsSetup(data: { platform?: string }, userId?: string) {
  const p = `Set up Google Analytics for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration details"}], "tracking": "tracking recommendations", "reports": "key reports to monitor", "goals": "goal configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialMediaScheduler(data: { platforms?: string[]; frequency?: string }, userId?: string) {
  const p = `Create a social media schedule for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.frequency ? `Posting frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "schedule": [{"platform": "platform name", "times": "optimal posting times", "content": "content type"}], "tools": "scheduling tools", "automation": "automation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailMarketingSetup(data: { platform?: string; listSize?: number }, userId?: string) {
  const p = `Set up email marketing for a content creator.
${data.platform ? `Email platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.listSize ? `List size: ${sanitizeForPrompt(data.listSize)}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration"}], "sequences": "email sequence recommendations", "templates": "template suggestions", "segmentation": "audience segmentation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastIntegrator(data: { format?: string; frequency?: string }, userId?: string) {
  const p = `Set up podcast integration for a content creator.
${data.format ? `Podcast format: ${sanitizeForPrompt(data.format)}` : ""}
${data.frequency ? `Release frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "setup": [{"platform": "platform name", "config": "configuration"}], "distribution": "distribution strategy", "monetization": "monetization options", "crossPromo": "cross-promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWebhookManager(data: { services?: string[] }, userId?: string) {
  const p = `Manage webhooks for a content creator's services.
${data.services ? `Services: ${sanitizeForPrompt(data.services.join(", "))}` : ""}
Respond as JSON: { "webhooks": [{"service": "service name", "events": "events to listen for", "handler": "handler implementation"}], "security": "security best practices", "monitoring": "monitoring strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAPIRateLimitManager(data: { apis?: string[] }, userId?: string) {
  const p = `Manage API rate limits for a content creator.
${data.apis ? `APIs used: ${sanitizeForPrompt(data.apis.join(", "))}` : ""}
Respond as JSON: { "limits": [{"api": "API name", "rate": "rate limit details", "optimization": "optimization strategy"}], "caching": "caching recommendations", "queueing": "request queueing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataBackupPlanner(data: { platforms?: string[]; dataTypes?: string[] }, userId?: string) {
  const p = `Plan data backup for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.dataTypes ? `Data types: ${sanitizeForPrompt(data.dataTypes.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"data": "data type", "frequency": "backup frequency", "method": "backup method", "storage": "storage location"}], "automation": "automation setup", "recovery": "recovery procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNotificationOptimizer(data: { channels?: string[]; volume?: string }, userId?: string) {
  const p = `Optimize notifications for a content creator.
${data.channels ? `Notification channels: ${sanitizeForPrompt(data.channels.join(", "))}` : ""}
${data.volume ? `Current volume: ${sanitizeForPrompt(data.volume)}` : ""}
Respond as JSON: { "optimized": [{"channel": "channel name", "frequency": "optimized frequency", "priority": "priority level"}], "filtering": "filtering rules", "batching": "batching strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPostAutomator(data: { platforms?: string[]; contentTypes?: string[] }, userId?: string) {
  const p = `Automate cross-posting for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.contentTypes ? `Content types: ${sanitizeForPrompt(data.contentTypes.join(", "))}` : ""}
Respond as JSON: { "automation": [{"from": "source platform", "to": "target platform", "adaptation": "content adaptation needed", "timing": "posting timing"}], "tools": "automation tools", "limitations": "platform limitations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkTreeOptimizer(data: { links?: string[]; goals?: string[] }, userId?: string) {
  const p = `Optimize link tree for a content creator.
${data.links ? `Current links: ${sanitizeForPrompt(data.links.join(", "))}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "optimized": [{"link": "link URL or label", "placement": "optimal placement", "cta": "call to action"}], "design": "design recommendations", "analytics": "analytics setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQRCodeGenerator(data: { destinations?: string[] }, userId?: string) {
  const p = `Generate QR code strategy for a content creator.
${data.destinations ? `Destinations: ${sanitizeForPrompt(data.destinations.join(", "))}` : ""}
Respond as JSON: { "codes": [{"destination": "destination URL", "design": "design recommendations", "placement": "where to place", "tracking": "tracking setup"}], "analytics": "analytics strategy", "bestPractices": "QR code best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChatbotIntegrator(data: { platform?: string; purpose?: string }, userId?: string) {
  const p = `Integrate a chatbot for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.purpose ? `Purpose: ${sanitizeForPrompt(data.purpose)}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration"}], "responses": "response templates", "training": "chatbot training guide", "escalation": "escalation to human process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnalyticsDashboardBuilder(data: { metrics?: string[]; sources?: string[] }, userId?: string) {
  const p = `Build an analytics dashboard for a content creator.
${data.metrics ? `Key metrics: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
${data.sources ? `Data sources: ${sanitizeForPrompt(data.sources.join(", "))}` : ""}
Respond as JSON: { "dashboard": [{"widget": "widget type", "metric": "metric displayed", "source": "data source"}], "layout": "dashboard layout", "refresh": "refresh intervals", "alerts": "alert configuration" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentDeliveryOptimizer(data: { platforms?: string[]; fileTypes?: string[] }, userId?: string) {
  const p = `Optimize content delivery for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.fileTypes ? `File types: ${sanitizeForPrompt(data.fileTypes.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"platform": "platform name", "settings": "optimal settings", "quality": "quality recommendations"}], "CDN": "CDN recommendations", "compression": "compression strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccessibilityAuditor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Audit accessibility for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "audit": [{"criterion": "accessibility criterion", "status": "pass or fail", "fix": "how to fix"}], "score": "accessibility score", "wcag": "WCAG compliance level", "priorities": "priority fixes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiDeviceTester(data: { content?: string; platforms?: string[] }, userId?: string) {
  const p = `Test content across multiple devices for a creator.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "testing": [{"device": "device type", "issues": "issues found", "fixes": "recommended fixes"}], "checklist": "testing checklist", "automation": "automated testing options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPerformanceMonitor(data: { metrics?: string[] }, userId?: string) {
  const p = `Monitor performance metrics for a content creator.
${data.metrics ? `Metrics to monitor: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "monitoring": [{"metric": "metric name", "baseline": "baseline value", "alert": "alert threshold"}], "tools": "monitoring tools", "optimization": "optimization recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSecurityAuditor(data: { accounts?: string[] }, userId?: string) {
  const p = `Audit security for a content creator's accounts.
${data.accounts ? `Accounts: ${sanitizeForPrompt(data.accounts.join(", "))}` : ""}
Respond as JSON: { "audit": [{"account": "account name", "risk": "risk level", "action": "recommended action"}], "twoFA": "two-factor auth recommendations", "passwords": "password management tips", "backup": "backup access strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCookieConsentManager(data: { platforms?: string[]; regions?: string[] }, userId?: string) {
  const p = `Manage cookie consent for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
${data.regions ? `Target regions: ${sanitizeForPrompt(data.regions.join(", "))}` : ""}
Respond as JSON: { "implementation": [{"region": "region name", "requirements": "legal requirements", "solution": "implementation solution"}], "tools": "consent management tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAgeGatingAdvisor(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Advise on age gating for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "required": "whether age gating is required", "implementation": [{"method": "gating method", "platform": "platform specifics"}], "guidelines": "content guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataRetentionPlanner(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Plan data retention for a content creator.
${data.dataTypes ? `Data types: ${sanitizeForPrompt(data.dataTypes.join(", "))}` : ""}
Respond as JSON: { "policy": [{"dataType": "data type", "retention": "retention period", "deletion": "deletion method"}], "compliance": "compliance notes", "automation": "automation setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIncidentResponsePlanner(data: { scenarios?: string[] }, userId?: string) {
  const p = `Plan incident response for a content creator.
${data.scenarios ? `Scenarios to plan for: ${sanitizeForPrompt(data.scenarios.join(", "))}` : ""}
Respond as JSON: { "plan": [{"scenario": "incident scenario", "response": "response steps", "communication": "communication plan", "timeline": "response timeline"}], "prevention": "prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomShortcutBuilder(data: { workflow?: string; tools?: string[] }, userId?: string) {
  const p = `Build custom keyboard shortcuts and workflow automation for a content creator.
${data.workflow ? `Workflow: ${sanitizeForPrompt(data.workflow)}` : ""}
${data.tools ? `Tools used: ${sanitizeForPrompt(data.tools.join(", "))}` : ""}
Respond as JSON: { "shortcuts": [{"action": "action name", "key": "keyboard shortcut", "tool": "associated tool", "timeSaved": "time saved per use"}], "profiles": "shortcut profiles for different tasks", "automation": "automation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdvancedSearchOptimizer(data: { contentType?: string; platform?: string }, userId?: string) {
  const p = `Optimize advanced search strategies for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "operators": [{"operator": "search operator", "usage": "how to use it", "example": "example query"}], "templates": "saved search templates", "savedSearches": "recommended saved searches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBulkUploadManager(data: { fileCount?: number; platforms?: string[] }, userId?: string) {
  const p = `Plan a bulk upload workflow for a content creator.
${data.fileCount ? `Number of files: ${sanitizeForPrompt(data.fileCount)}` : ""}
${data.platforms ? `Target platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "workflow": [{"step": "workflow step", "tool": "tool to use", "config": "configuration details"}], "naming": "file naming conventions", "metadata": "metadata strategy", "scheduling": "upload scheduling plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlaylistAutoOrganizer(data: { playlists?: string[]; criteria?: string }, userId?: string) {
  const p = `Auto-organize playlists for a content creator.
${data.playlists ? `Existing playlists: ${sanitizeForPrompt(data.playlists.join(", "))}` : ""}
${data.criteria ? `Organization criteria: ${sanitizeForPrompt(data.criteria)}` : ""}
Respond as JSON: { "organized": [{"playlist": "playlist name", "order": "suggested order", "additions": "suggested additions"}], "newPlaylists": "suggested new playlists", "cleanup": "cleanup recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiAccountManager(data: { accounts?: number; platforms?: string[] }, userId?: string) {
  const p = `Plan multi-account management strategy for a content creator.
${data.accounts ? `Number of accounts: ${sanitizeForPrompt(data.accounts)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "management": [{"account": "account identifier", "purpose": "account purpose", "schedule": "posting schedule"}], "tools": "management tools recommended", "delegation": "delegation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomDashboardBuilder(data: { metrics?: string[]; role?: string }, userId?: string) {
  const p = `Design a custom analytics dashboard for a content creator.
${data.metrics ? `Key metrics: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
${data.role ? `User role: ${sanitizeForPrompt(data.role)}` : ""}
Respond as JSON: { "widgets": [{"name": "widget name", "metric": "metric tracked", "visualization": "visualization type"}], "layout": "dashboard layout recommendation", "refresh": "data refresh intervals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoTaggingSystem(data: { contentType?: string; existing?: string[] }, userId?: string) {
  const p = `Design an automatic tagging system for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.existing ? `Existing tags: ${sanitizeForPrompt(data.existing.join(", "))}` : ""}
Respond as JSON: { "tags": [{"tag": "tag name", "category": "tag category", "rules": "auto-tagging rules"}], "automation": "automation setup", "hierarchy": "tag hierarchy structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartNotificationSystem(data: { priorities?: string[] }, userId?: string) {
  const p = `Design a smart notification system for a content creator.
${data.priorities ? `Priority levels: ${sanitizeForPrompt(data.priorities.join(", "))}` : ""}
Respond as JSON: { "rules": [{"trigger": "notification trigger", "action": "action to take", "priority": "priority level"}], "channels": "notification channels", "quiet": "quiet hours configuration", "escalation": "escalation rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTemplateLibrary(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Build a template library for a content creator.
${data.contentTypes ? `Content types: ${sanitizeForPrompt(data.contentTypes.join(", "))}` : ""}
Respond as JSON: { "templates": [{"name": "template name", "type": "content type", "sections": "template sections", "vars": "customizable variables"}], "customization": "customization options", "sharing": "template sharing features" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMacroBuilder(data: { tasks?: string[] }, userId?: string) {
  const p = `Build automation macros for a content creator.
${data.tasks ? `Tasks to automate: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
Respond as JSON: { "macros": [{"name": "macro name", "steps": "macro steps", "trigger": "trigger condition", "timeSaved": "estimated time saved"}], "sequences": "macro sequences", "scheduling": "macro scheduling" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVRContentAdvisor(data: { niche?: string; budget?: string }, userId?: string) {
  const p = `Advise on VR content creation opportunities for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.budget ? `Budget: ${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "opportunities": [{"format": "VR content format", "platform": "target platform", "audience": "target audience"}], "equipment": "recommended equipment", "creation": "creation workflow tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiARFilterCreator(data: { platform?: string; brand?: string }, userId?: string) {
  const p = `Design AR filter concepts for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.brand ? `Brand: ${sanitizeForPrompt(data.brand)}` : ""}
Respond as JSON: { "filters": [{"name": "filter name", "concept": "filter concept", "platform": "target platform", "interaction": "user interaction type"}], "development": "development recommendations", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAIVoiceoverGenerator(data: { script?: string; voice?: string }, userId?: string) {
  const p = `Recommend AI voiceover solutions for a content creator.
${data.script ? `Script sample: ${sanitizeForPrompt(data.script)}` : ""}
${data.voice ? `Preferred voice style: ${sanitizeForPrompt(data.voice)}` : ""}
Respond as JSON: { "options": [{"provider": "voiceover provider", "quality": "quality rating", "price": "pricing info", "languages": "supported languages"}], "editing": "editing tips", "syncing": "audio syncing advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDeepfakeDetector(data: { contentType?: string }, userId?: string) {
  const p = `Advise on deepfake detection and prevention for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "detection": [{"method": "detection method", "accuracy": "accuracy level", "tool": "recommended tool"}], "prevention": "prevention strategies", "watermarking": "watermarking recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlockchainContentVerifier(data: { contentType?: string }, userId?: string) {
  const p = `Plan blockchain-based content verification for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "verification": [{"method": "verification method", "platform": "blockchain platform", "cost": "estimated cost"}], "timestamping": "content timestamping strategy", "proof": "proof of ownership approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveTrendEngine(data: { niche?: string; horizon?: string }, userId?: string) {
  const p = `Predict upcoming content trends for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.horizon ? `Time horizon: ${sanitizeForPrompt(data.horizon)}` : ""}
Respond as JSON: { "predictions": [{"trend": "predicted trend", "probability": "likelihood percentage", "timing": "expected timing", "preparation": "how to prepare"}], "signals": "trend signals to watch" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentGraphAnalyzer(data: { videos?: number; connections?: string[] }, userId?: string) {
  const p = `Analyze content graph relationships for a content creator.
${data.videos ? `Number of videos: ${sanitizeForPrompt(data.videos)}` : ""}
${data.connections ? `Connection types: ${sanitizeForPrompt(data.connections.join(", "))}` : ""}
Respond as JSON: { "graph": {"nodes": "content nodes description", "edges": "relationship edges", "clusters": "content clusters identified"}, "insights": "graph insights", "optimization": "optimization recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudiencePsychographer(data: { niche?: string; demographics?: any }, userId?: string) {
  const p = `Build audience psychographic profiles for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.demographics ? `Demographics: ${JSON.stringify(sanitizeObjectForPrompt(data.demographics))}` : ""}
Respond as JSON: { "psychographics": [{"segment": "audience segment", "values": "core values", "motivations": "key motivations", "triggers": "content triggers"}], "content": "content strategy based on psychographics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNeuroMarketingAdvisor(data: { contentType?: string; goal?: string }, userId?: string) {
  const p = `Apply neuromarketing principles for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
${data.goal ? `Goal: ${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON: { "techniques": [{"technique": "neuromarketing technique", "application": "how to apply it", "ethical": "ethical considerations"}], "color": "color psychology recommendations", "sound": "sound design tips", "pacing": "content pacing advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamificationEngine(data: { community?: string; goals?: string[] }, userId?: string) {
  const p = `Design gamification mechanics for a content creator community.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "mechanics": [{"mechanic": "gamification mechanic", "implementation": "how to implement", "engagement": "expected engagement impact"}], "rewards": "reward system design", "leaderboard": "leaderboard structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalizationEngine(data: { segments?: string[] }, userId?: string) {
  const p = `Design a content personalization engine for a content creator.
${data.segments ? `Audience segments: ${sanitizeForPrompt(data.segments.join(", "))}` : ""}
Respond as JSON: { "personalization": [{"segment": "audience segment", "content": "personalized content strategy", "delivery": "delivery method"}], "automation": "automation setup", "testing": "A/B testing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSentimentPredictiveModel(data: { topic?: string; platform?: string }, userId?: string) {
  const p = `Predict audience sentiment for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "prediction": [{"scenario": "content scenario", "sentiment": "predicted sentiment", "probability": "likelihood percentage"}], "mitigation": "negative sentiment mitigation strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentDNAAnalyzer(data: { topVideos?: string[] }, userId?: string) {
  const p = `Analyze the content DNA of top-performing videos for a content creator.
${data.topVideos ? `Top videos: ${sanitizeForPrompt(data.topVideos.join(", "))}` : ""}
Respond as JSON: { "dna": {"format": "content format patterns", "pacing": "pacing analysis", "hooks": "hook patterns", "emotions": "emotional triggers", "topics": "topic patterns"}, "replication": "replication strategy", "evolution": "content evolution recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmSimulator(data: { platform?: string; contentType?: string }, userId?: string) {
  const p = `Simulate platform algorithm behavior for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "simulation": [{"factor": "algorithm factor", "weight": "estimated weight", "optimization": "optimization strategy"}], "ranking": "ranking factors analysis", "boosts": "algorithm boost opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorEconomyTracker(data: { niche?: string }, userId?: string) {
  const p = `Track creator economy trends and opportunities for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "trends": [{"trend": "economy trend", "impact": "impact on creators", "opportunity": "opportunity description"}], "market": "market analysis", "predictions": "future predictions", "positioning": "strategic positioning advice" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWeb3CreatorTools(data: { interest?: string }, userId?: string) {
  const p = `Recommend Web3 tools and opportunities for a content creator.
${data.interest ? `Interest area: ${sanitizeForPrompt(data.interest)}` : ""}
Respond as JSON: { "tools": [{"name": "tool name", "purpose": "tool purpose", "blockchain": "blockchain platform", "cost": "estimated cost"}], "opportunities": "Web3 opportunities for creators", "risks": "risks and considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMetaversePresencePlanner(data: { brand?: string }, userId?: string) {
  const p = `Plan metaverse presence strategy for a content creator.
${data.brand ? `Brand: ${sanitizeForPrompt(data.brand)}` : ""}
Respond as JSON: { "strategy": [{"platform": "metaverse platform", "presence": "presence type", "content": "content strategy"}], "investment": "investment requirements", "timeline": "implementation timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAIAgentCustomizer(data: { taskTypes?: string[] }, userId?: string) {
  const p = `Customize AI agents for a content creator workflow.
${data.taskTypes ? `Task types: ${sanitizeForPrompt(data.taskTypes.join(", "))}` : ""}
Respond as JSON: { "agents": [{"name": "agent name", "role": "agent role", "capabilities": "agent capabilities", "config": "configuration details"}], "workflows": "agent workflow design", "integration": "integration recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataVisualizationEngine(data: { data?: string[]; format?: string }, userId?: string) {
  const p = `Design data visualizations for a content creator's analytics.
${data.data ? `Data sources: ${sanitizeForPrompt(data.data.join(", "))}` : ""}
${data.format ? `Preferred format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON: { "visualizations": [{"type": "visualization type", "data": "data to visualize", "style": "visual style", "insight": "key insight revealed"}], "tools": "recommended tools", "sharing": "sharing and export options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorAPIBuilder(data: { features?: string[] }, userId?: string) {
  const p = `Design a creator API for monetization and integration.
${data.features ? `Desired features: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "api": [{"endpoint": "API endpoint", "purpose": "endpoint purpose", "auth": "authentication method"}], "documentation": "documentation strategy", "monetization": "API monetization model", "sdk": "SDK development plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastLaunchPlanner(data: { niche?: string; format?: string }, userId?: string) {
  const p = `Create a podcast launch plan for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.format ? `Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON: { "plan": [{"phase": "launch phase", "tasks": "key tasks", "timeline": "timeline"}], "equipment": "recommended equipment", "hosting": "hosting platform recommendation", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastEpisodePlanner(data: { topic?: string; guests?: string[] }, userId?: string) {
  const p = `Plan a podcast episode for a creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.guests ? `Guests: ${sanitizeForPrompt(data.guests.join(", "))}` : ""}
Respond as JSON: { "outline": [{"segment": "segment name", "duration": "duration", "notes": "notes"}], "questions": "interview questions", "promotion": "promotion strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPodcastSEO(data: { title?: string; niche?: string }, userId?: string) {
  const p = `Optimize podcast SEO for discoverability.
${data.title ? `Title: ${sanitizeForPrompt(data.title)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimized": {"title": "optimized title", "description": "optimized description", "tags": "optimized tags"}, "distribution": "distribution strategy", "transcription": "transcription recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioBrandingKit(data: { style?: string; genre?: string }, userId?: string) {
  const p = `Design an audio branding kit for a content creator.
${data.style ? `Style: ${sanitizeForPrompt(data.style)}` : ""}
${data.genre ? `Genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON: { "elements": [{"type": "audio element type", "description": "description", "usage": "usage guidelines"}], "consistency": "brand consistency tips", "production": "production recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicComposerAdvisor(data: { mood?: string; usage?: string }, userId?: string) {
  const p = `Recommend music and composition options for content creation.
${data.mood ? `Mood: ${sanitizeForPrompt(data.mood)}` : ""}
${data.usage ? `Usage: ${sanitizeForPrompt(data.usage)}` : ""}
Respond as JSON: { "recommendations": [{"source": "music source", "style": "style", "license": "license type", "cost": "cost"}], "royaltyFree": "royalty-free options and tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiASMRContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan ASMR content for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "ideas": [{"concept": "ASMR concept", "equipment": "equipment needed", "technique": "technique"}], "audience": "target audience analysis", "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVoiceTrainingCoach(data: { issues?: string[] }, userId?: string) {
  const p = `Provide voice training coaching for a content creator.
${data.issues ? `Issues: ${sanitizeForPrompt(data.issues.join(", "))}` : ""}
Respond as JSON: { "exercises": [{"name": "exercise name", "technique": "technique description", "duration": "duration"}], "warmups": "warmup routine", "tips": "general voice tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudioMixingGuide(data: { contentType?: string }, userId?: string) {
  const p = `Create an audio mixing guide for content creators.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "settings": [{"parameter": "mixing parameter", "value": "recommended value", "reason": "reason"}], "software": "recommended software", "workflow": "mixing workflow" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsletterBuilder(data: { niche?: string; frequency?: string }, userId?: string) {
  const p = `Build a newsletter strategy for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.frequency ? `Frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "template": [{"section": "section name", "content": "content description", "cta": "call to action"}], "schedule": "publishing schedule", "growth": "growth strategies", "tools": "recommended tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailSequenceWriter(data: { goal?: string; steps?: number }, userId?: string) {
  const p = `Write an email sequence for a content creator's marketing.
${data.goal ? `Goal: ${sanitizeForPrompt(data.goal)}` : ""}
${data.steps ? `Number of steps: ${sanitizeForPrompt(data.steps)}` : ""}
Respond as JSON: { "sequence": [{"email": "email number", "subject": "subject line", "content": "email content summary", "delay": "delay before sending"}], "segmentation": "audience segmentation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLeadMagnetCreator(data: { niche?: string; audience?: string }, userId?: string) {
  const p = `Create lead magnet ideas for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "magnets": [{"type": "lead magnet type", "title": "title", "content": "content description", "conversion": "expected conversion"}], "funnel": "funnel strategy", "delivery": "delivery method" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailListGrower(data: { currentSize?: number; niche?: string }, userId?: string) {
  const p = `Provide email list growth strategies for a content creator.
${data.currentSize ? `Current list size: ${sanitizeForPrompt(data.currentSize)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategies": [{"method": "growth method", "implementation": "how to implement", "growth": "expected growth"}], "tools": "recommended tools", "compliance": "email compliance tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmailAnalyticsAdvisor(data: { openRate?: number; clickRate?: number }, userId?: string) {
  const p = `Analyze email marketing metrics and provide improvement advice.
${data.openRate ? `Current open rate: ${sanitizeForPrompt(data.openRate)}%` : ""}
${data.clickRate ? `Current click rate: ${sanitizeForPrompt(data.clickRate)}%` : ""}
Respond as JSON: { "analysis": "overall analysis", "improvements": [{"metric": "metric to improve", "strategy": "improvement strategy"}], "benchmarks": "industry benchmarks" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWebinarPlanner(data: { topic?: string; audience?: string }, userId?: string) {
  const p = `Plan a webinar for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "plan": [{"phase": "planning phase", "tasks": "tasks"}], "platform": "recommended platform", "promotion": "promotion strategy", "followUp": "follow-up plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVirtualEventOrganizer(data: { eventType?: string; attendees?: number }, userId?: string) {
  const p = `Organize a virtual event for a content creator.
${data.eventType ? `Event type: ${sanitizeForPrompt(data.eventType)}` : ""}
${data.attendees ? `Expected attendees: ${sanitizeForPrompt(data.attendees)}` : ""}
Respond as JSON: { "plan": [{"element": "event element", "setup": "setup details", "timing": "timing"}], "platform": "recommended platform", "engagement": "engagement strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeetupOrganizer(data: { community?: string; location?: string }, userId?: string) {
  const p = `Organize a meetup for a content creator community.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
${data.location ? `Location: ${sanitizeForPrompt(data.location)}` : ""}
Respond as JSON: { "plan": [{"detail": "planning detail", "action": "action item"}], "venue": "venue recommendations", "promotion": "promotion plan", "agenda": "event agenda" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConferencePrep(data: { conference?: string; role?: string }, userId?: string) {
  const p = `Prepare for a conference appearance as a content creator.
${data.conference ? `Conference: ${sanitizeForPrompt(data.conference)}` : ""}
${data.role ? `Role: ${sanitizeForPrompt(data.role)}` : ""}
Respond as JSON: { "prep": [{"task": "preparation task", "timeline": "timeline"}], "networking": "networking strategy", "pitch": "elevator pitch", "materials": "materials to prepare" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAwardSubmissionWriter(data: { category?: string; achievements?: string[] }, userId?: string) {
  const p = `Write an award submission for a content creator.
${data.category ? `Category: ${sanitizeForPrompt(data.category)}` : ""}
${data.achievements ? `Achievements: ${sanitizeForPrompt(data.achievements.join(", "))}` : ""}
Respond as JSON: { "submission": {"narrative": "submission narrative", "metrics": "key metrics", "impact": "impact statement"}, "tips": "submission tips", "deadlines": "deadline management" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPanelDiscussionPrep(data: { topic?: string; role?: string }, userId?: string) {
  const p = `Prepare for a panel discussion as a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.role ? `Role: ${sanitizeForPrompt(data.role)}` : ""}
Respond as JSON: { "prep": [{"talking": "talking point", "supporting": "supporting evidence"}], "questions": "anticipated questions", "audience": "audience engagement tips", "followUp": "follow-up strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorRetreePlanner(data: { purpose?: string; attendees?: number }, userId?: string) {
  const p = `Plan a creator retreat event.
${data.purpose ? `Purpose: ${sanitizeForPrompt(data.purpose)}` : ""}
${data.attendees ? `Attendees: ${sanitizeForPrompt(data.attendees)}` : ""}
Respond as JSON: { "plan": [{"day": "day number", "activities": "planned activities"}], "budget": "budget breakdown", "venue": "venue recommendations", "outcomes": "expected outcomes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLiveWorkshopBuilder(data: { skill?: string; duration?: string }, userId?: string) {
  const p = `Build a live workshop curriculum for a content creator.
${data.skill ? `Skill: ${sanitizeForPrompt(data.skill)}` : ""}
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON: { "curriculum": [{"section": "section name", "activity": "activity description", "materials": "materials needed"}], "pricing": "pricing strategy", "recording": "recording and repurposing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOnlineCourseLauncher(data: { topic?: string; modules?: number }, userId?: string) {
  const p = `Plan an online course launch for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
${data.modules ? `Number of modules: ${sanitizeForPrompt(data.modules)}` : ""}
Respond as JSON: { "launch": [{"phase": "launch phase", "tasks": "tasks", "timeline": "timeline"}], "pricing": "pricing strategy", "marketing": "marketing plan", "platform": "platform recommendation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMasterclassDesigner(data: { expertise?: string; format?: string }, userId?: string) {
  const p = `Design a masterclass for a content creator.
${data.expertise ? `Expertise: ${sanitizeForPrompt(data.expertise)}` : ""}
${data.format ? `Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON: { "design": [{"session": "session name", "content": "content outline", "exercise": "practical exercise"}], "pricing": "pricing strategy", "promotion": "promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaAppearancePrep(data: { outlet?: string; topic?: string }, userId?: string) {
  const p = `Prepare for a media appearance as a content creator.
${data.outlet ? `Media outlet: ${sanitizeForPrompt(data.outlet)}` : ""}
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "prep": [{"area": "preparation area", "talking": "talking points"}], "dos": "dos for the appearance", "donts": "donts for the appearance", "followUp": "follow-up strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGuestPostWriter(data: { publication?: string; topic?: string }, userId?: string) {
  const p = `Plan a guest post for a content creator.
${data.publication ? `Publication: ${sanitizeForPrompt(data.publication)}` : ""}
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "outline": "article outline", "pitch": "pitch to the publication", "bio": "author bio", "promotion": "promotion strategy", "relationships": "relationship building tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerEventPlanner(data: { brand?: string; influencers?: number }, userId?: string) {
  const p = `Plan an influencer event for brand collaboration.
${data.brand ? `Brand: ${sanitizeForPrompt(data.brand)}` : ""}
${data.influencers ? `Number of influencers: ${sanitizeForPrompt(data.influencers)}` : ""}
Respond as JSON: { "event": [{"element": "event element", "detail": "detail"}], "budget": "budget estimate", "contracts": "contract considerations", "content": "content deliverables" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductLaunchPlanner(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Plan a product launch for a content creator.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
${data.audience ? `Target audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "launch": [{"phase": "launch phase", "actions": "actions", "timeline": "timeline"}], "marketing": "marketing strategy", "partners": "partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCharityEventAdvisor(data: { cause?: string; format?: string }, userId?: string) {
  const p = `Advise on planning a charity event for a content creator.
${data.cause ? `Cause: ${sanitizeForPrompt(data.cause)}` : ""}
${data.format ? `Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON: { "plan": [{"element": "event element", "detail": "detail"}], "fundraising": "fundraising strategy", "promotion": "promotion plan", "legal": "legal considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnniversaryCelebrationPlanner(data: { milestone?: string }, userId?: string) {
  const p = `Plan an anniversary celebration for a content creator channel.
${data.milestone ? `Milestone: ${sanitizeForPrompt(data.milestone)}` : ""}
Respond as JSON: { "celebration": [{"element": "celebration element", "content": "content idea"}], "community": "community engagement plan", "memorabilia": "memorabilia and merchandise ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSeasonalCampaignPlanner(data: { season?: string; niche?: string }, userId?: string) {
  const p = `Plan a seasonal campaign for a content creator.
${data.season ? `Season: ${sanitizeForPrompt(data.season)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "campaigns": [{"name": "campaign name", "content": "content plan", "timing": "timing"}], "merchandise": "merchandise opportunities", "partnerships": "partnership ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHolidayContentCalendar(data: { holidays?: string[]; niche?: string }, userId?: string) {
  const p = `Create a holiday content calendar for a content creator.
${data.holidays ? `Holidays: ${sanitizeForPrompt(data.holidays.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "calendar": [{"holiday": "holiday name", "content": "content ideas", "timing": "publishing timing"}], "preparation": "preparation timeline", "evergreen": "evergreen content opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEndOfYearReview(data: { metrics?: any }, userId?: string) {
  const p = `Create an end-of-year review for a content creator.
${data.metrics ? `Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON: { "review": [{"area": "review area", "achievement": "key achievement", "growth": "growth percentage"}], "highlights": "top highlights", "goals": "goals for next year" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSkillAssessment(data: { skills?: string[]; goals?: string[] }, userId?: string) {
  const p = `Assess skills and identify gaps for a content creator.
${data.skills ? `Current skills: ${sanitizeForPrompt(data.skills.join(", "))}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "assessment": [{"skill": "skill name", "level": "current level", "gap": "gap to close"}], "learning": "learning recommendations", "priority": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLearningPathBuilder(data: { goal?: string; current?: string }, userId?: string) {
  let creatorCtx = "";
  if (userId) {
    try {
      const { db } = await import("./db");
      const { channels, videos } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const userChannels = await db.select({
        platform: channels.platform, channelName: channels.channelName, subscriberCount: channels.subscriberCount,
      }).from(channels).where(eq(channels.userId, userId)).limit(6);
      const userChannelIds = userChannels.length > 0
        ? await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId)).limit(10)
        : [];
      const channelIdList = userChannelIds.map(c => c.id);
      const { inArray } = await import("drizzle-orm");
      const recentVideos = channelIdList.length > 0
        ? await db.select({ title: videos.title, metadata: videos.metadata, publishedAt: videos.publishedAt })
            .from(videos).where(inArray(videos.channelId, channelIdList)).orderBy(desc(videos.publishedAt)).limit(5)
        : [];
      if (userChannels.length > 0) {
        creatorCtx += `\nCreator's platforms: ${userChannels.map(c => `${sanitizeForPrompt(c.platform)} (${(c.subscriberCount || 0).toLocaleString()} subs)`).join(", ")}`;
      }
      if (recentVideos.length > 0) {
        creatorCtx += `\nRecent content: ${recentVideos.map(v => `"${sanitizeForPrompt(v.title)}" (${(v.metadata as any)?.viewCount || 0} views)`).join(", ")}`;
      }
    } catch (err: any) { logger.warn("[AIEngine] Creator context fetch failed:", err?.message || err); }
  }
  const p = `Build a personalized learning path for a PS5/gaming content creator who streams and uploads on YouTube, Twitch, and other platforms.
${data.goal ? `Their stated goal: ${sanitizeForPrompt(data.goal)}` : "Goal: grow audience and monetize content"}
${data.current ? `Current level: ${sanitizeForPrompt(data.current)}` : ""}${creatorCtx}

Create a specific, actionable learning path tailored to a gaming creator. Include concrete resources (YouTube channels, books, tools) they can use right now. Focus on: content quality, audience growth, monetization, live streaming production, brand partnerships.
Respond as JSON: { "path": [{"milestone": "milestone name", "resources": "specific resources", "duration": "duration", "why": "why this matters for their channel"}], "schedule": "recommended weekly schedule", "quickWins": ["3-5 things they can do this week"] }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 2000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCertificationAdvisor(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Recommend certifications for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "certifications": [{"name": "certification name", "provider": "provider", "cost": "cost", "value": "value proposition"}], "priority": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBookRecommender(data: { niche?: string; goals?: string[] }, userId?: string) {
  const p = `Recommend books for a content creator's growth.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "books": [{"title": "book title", "author": "author", "key": "key takeaway", "relevance": "relevance to goals"}], "reading": "reading strategy", "schedule": "reading schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiToolTutorialCreator(data: { tool?: string; level?: string }, userId?: string) {
  const p = `Create a tool tutorial for content creators.
${data.tool ? `Tool: ${sanitizeForPrompt(data.tool)}` : ""}
${data.level ? `Level: ${sanitizeForPrompt(data.level)}` : ""}
Respond as JSON: { "tutorial": [{"step": "step number", "instruction": "instruction", "tip": "pro tip"}], "prerequisites": "prerequisites" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIndustryReportGenerator(data: { industry?: string; period?: string }, userId?: string) {
  const p = `Generate an industry report for a content creator.
${data.industry ? `Industry: ${sanitizeForPrompt(data.industry)}` : ""}
${data.period ? `Period: ${sanitizeForPrompt(data.period)}` : ""}
Respond as JSON: { "report": [{"section": "report section", "findings": "key findings"}], "trends": "emerging trends", "predictions": "future predictions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaseStudyBuilder(data: { project?: string; results?: any }, userId?: string) {
  const p = `Build a case study for a content creator's project.
${data.project ? `Project: ${sanitizeForPrompt(data.project)}` : ""}
${data.results ? `Results: ${JSON.stringify(sanitizeObjectForPrompt(data.results))}` : ""}
Respond as JSON: { "caseStudy": [{"section": "section name", "content": "content"}], "metrics": "key metrics to highlight", "testimonials": "testimonial gathering strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPortfolioOptimizer(data: { works?: string[]; goals?: string[] }, userId?: string) {
  const p = `Optimize a content creator's portfolio.
${data.works ? `Works: ${sanitizeForPrompt(data.works.join(", "))}` : ""}
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "optimized": [{"piece": "portfolio piece", "position": "recommended position", "description": "optimized description"}], "layout": "layout recommendations", "cta": "call-to-action strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialProofCollector(data: { sources?: string[] }, userId?: string) {
  const p = `Develop a social proof collection strategy for a content creator.
${data.sources ? `Sources: ${sanitizeForPrompt(data.sources.join(", "))}` : ""}
Respond as JSON: { "proof": [{"type": "proof type", "content": "content description", "display": "display method"}], "automation": "automation tips", "placement": "optimal placement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTestimonialVideoPlanner(data: { clients?: string[] }, userId?: string) {
  const p = `Plan testimonial videos for a content creator.
${data.clients ? `Clients: ${sanitizeForPrompt(data.clients.join(", "))}` : ""}
Respond as JSON: { "plan": [{"client": "client name", "questions": "interview questions", "format": "video format"}], "editing": "editing guidelines", "placement": "placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaseStudyVideoCreator(data: { project?: string }, userId?: string) {
  const p = `Create a case study video script for a content creator.
${data.project ? `Project: ${sanitizeForPrompt(data.project)}` : ""}
Respond as JSON: { "script": [{"section": "section", "visual": "visual description", "narration": "narration text"}], "metrics": "metrics to showcase", "cta": "call to action" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBeforeAfterShowcase(data: { service?: string }, userId?: string) {
  const p = `Create a before/after showcase for a content creator's service.
${data.service ? `Service: ${sanitizeForPrompt(data.service)}` : ""}
Respond as JSON: { "showcase": [{"metric": "metric", "before": "before value", "after": "after value"}], "visuals": "visual presentation tips", "credibility": "credibility boosters" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerScorecard(data: { metrics?: any }, userId?: string) {
  const p = `Generate an influencer scorecard for a content creator.
${data.metrics ? `Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON: { "scorecard": [{"metric": "metric name", "score": "score", "benchmark": "industry benchmark"}], "overall": "overall score", "improvements": "improvement areas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCredibilityBooster(data: { platform?: string }, userId?: string) {
  const p = `Boost credibility for a content creator on their platform.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "strategies": [{"method": "credibility method", "implementation": "how to implement", "impact": "expected impact"}], "timeline": "implementation timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUserReviewManager(data: { platform?: string }, userId?: string) {
  const p = `Manage user reviews for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "management": [{"action": "management action", "process": "process details"}], "responses": "response templates", "flagging": "flagging criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReferencePageBuilder(data: { references?: string[] }, userId?: string) {
  const p = `Build a reference page for a content creator.
${data.references ? `References: ${sanitizeForPrompt(data.references.join(", "))}` : ""}
Respond as JSON: { "page": [{"reference": "reference name", "context": "context", "display": "display format"}], "layout": "page layout", "verification": "verification process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEcommerceStoreBuilder(data: { products?: string[]; niche?: string }, userId?: string) {
  const p = `Build an ecommerce store strategy for a content creator.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "store": [{"section": "store section", "setup": "setup details"}], "products": "product strategy", "pricing": "pricing strategy", "marketing": "marketing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDropshippingAdvisor(data: { niche?: string; budget?: number }, userId?: string) {
  const p = `Advise on dropshipping strategy for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "strategy": "overall strategy", "products": [{"item": "product item", "supplier": "supplier", "margin": "profit margin"}], "marketing": "marketing approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrintOnDemandOptimizer(data: { designs?: string[]; platform?: string }, userId?: string) {
  const p = `Optimize print-on-demand strategy for a content creator.
${data.designs ? `Designs: ${sanitizeForPrompt(data.designs.join(", "))}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "optimization": [{"design": "design name", "platform": "platform", "pricing": "pricing strategy"}], "marketing": "marketing tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalDownloadCreator(data: { type?: string; niche?: string }, userId?: string) {
  const p = `Create digital download products for a content creator.
${data.type ? `Type: ${sanitizeForPrompt(data.type)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "products": [{"name": "product name", "format": "file format", "price": "price", "creation": "creation process"}], "delivery": "delivery method", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffiliatePageBuilder(data: { niche?: string; products?: string[] }, userId?: string) {
  const p = `Build an affiliate page for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "page": [{"product": "product name", "review": "review summary", "link": "link placement"}], "seo": "SEO strategy", "disclosure": "disclosure requirements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUpsellStrategyBuilder(data: { products?: string[] }, userId?: string) {
  const p = `Build an upsell strategy for a content creator's products.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "upsells": [{"trigger": "upsell trigger", "offer": "upsell offer", "value": "value proposition"}], "sequencing": "upsell sequencing", "pricing": "pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCartAbandonmentRecovery(data: { products?: string[] }, userId?: string) {
  const p = `Create a cart abandonment recovery strategy for a content creator.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "recovery": [{"trigger": "recovery trigger", "email": "email content", "timing": "send timing"}], "incentives": "incentive strategies", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCustomerJourneyMapper(data: { touchpoints?: string[] }, userId?: string) {
  const p = `Map the customer journey for a content creator's business.
${data.touchpoints ? `Touchpoints: ${sanitizeForPrompt(data.touchpoints.join(", "))}` : ""}
Respond as JSON: { "journey": [{"stage": "journey stage", "touchpoint": "touchpoint", "content": "content needed"}], "optimization": "optimization opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductBundleCreator(data: { products?: string[] }, userId?: string) {
  const p = `Create product bundles for a content creator.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "bundles": [{"name": "bundle name", "items": "included items", "price": "bundle price", "savings": "customer savings"}], "positioning": "positioning strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFlashSalePlanner(data: { products?: string[]; duration?: string }, userId?: string) {
  const p = `Plan a flash sale for a content creator.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON: { "plan": [{"phase": "sale phase", "action": "action", "timing": "timing"}], "discount": "discount strategy", "urgency": "urgency tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLoyaltyRewardDesigner(data: { business?: string }, userId?: string) {
  const p = `Design a loyalty rewards program for a content creator's business.
${data.business ? `Business: ${sanitizeForPrompt(data.business)}` : ""}
Respond as JSON: { "program": [{"tier": "tier name", "rewards": "rewards", "requirements": "requirements"}], "engagement": "engagement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubscriptionModelBuilder(data: { product?: string; niche?: string }, userId?: string) {
  const p = `Build a subscription model for a content creator.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "model": [{"tier": "tier name", "price": "price", "includes": "what is included"}], "retention": "retention strategies", "growth": "growth plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPricingPageOptimizer(data: { products?: any[] }, userId?: string) {
  const p = `Optimize a pricing page for a content creator.
${data.products ? `Products: ${JSON.stringify(sanitizeObjectForPrompt(data.products))}` : ""}
Respond as JSON: { "optimized": [{"element": "page element", "change": "recommended change", "reason": "reason"}], "psychology": "pricing psychology tips", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCheckoutOptimizer(data: { currentFlow?: string[] }, userId?: string) {
  const p = `Optimize the checkout flow for a content creator's store.
${data.currentFlow ? `Current flow: ${sanitizeForPrompt(data.currentFlow.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"step": "checkout step", "improvement": "improvement"}], "trust": "trust signals to add", "urgency": "urgency elements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInventoryForecaster(data: { products?: any[] }, userId?: string) {
  const p = `Forecast inventory needs for a content creator's products.
${data.products ? `Products: ${JSON.stringify(sanitizeObjectForPrompt(data.products))}` : ""}
Respond as JSON: { "forecast": [{"product": "product name", "demand": "demand forecast", "reorder": "reorder point"}], "seasonal": "seasonal adjustments", "buffer": "buffer stock recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiShippingOptimizer(data: { locations?: string[] }, userId?: string) {
  const p = `Optimize shipping for a content creator's ecommerce.
${data.locations ? `Locations: ${sanitizeForPrompt(data.locations.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"region": "region", "method": "shipping method", "cost": "cost optimization"}], "packaging": "packaging recommendations", "returns": "returns policy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeAdsOptimizer(data: { budget?: number; goal?: string }, userId?: string) {
  const p = `Optimize YouTube ads strategy for a content creator.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
${data.goal ? `Goal: ${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON: { "strategy": [{"adType": "ad type", "targeting": "targeting strategy", "budget": "budget allocation"}], "creatives": "creative recommendations", "testing": "testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookAdsCreator(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Create Facebook ads strategy for a content creator.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "ads": [{"format": "ad format", "copy": "ad copy", "targeting": "targeting", "budget": "budget"}], "funnel": "funnel strategy", "optimization": "optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGoogleAdsManager(data: { keywords?: string[]; budget?: number }, userId?: string) {
  const p = `Manage Google Ads strategy for a content creator.
${data.keywords ? `Keywords: ${sanitizeForPrompt(data.keywords.join(", "))}` : ""}
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "campaigns": [{"type": "campaign type", "keywords": "target keywords", "bid": "bid strategy"}], "landing": "landing page recommendations", "tracking": "conversion tracking setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokAdsAdvisor(data: { product?: string; audience?: string }, userId?: string) {
  const p = `Advise on TikTok ads strategy for a content creator.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
${data.audience ? `Audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "strategy": [{"format": "ad format", "content": "content approach", "targeting": "targeting"}], "creative": "creative best practices", "budget": "budget recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerAdsManager(data: { budget?: number; niche?: string }, userId?: string) {
  const p = `Manage influencer advertising strategy.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"tier": "influencer tier", "influencer": "influencer type", "format": "content format", "cost": "estimated cost"}], "tracking": "tracking methods", "roi": "ROI measurement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetargetingStrategist(data: { platforms?: string[] }, userId?: string) {
  const p = `Create a retargeting strategy for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"platform": "platform", "audience": "audience segment", "creative": "creative approach"}], "frequency": "frequency capping", "exclusions": "exclusion rules" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdCopyWriter(data: { product?: string; platform?: string }, userId?: string) {
  const p = `Write ad copy for a content creator's product.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "copy": [{"headline": "headline", "body": "body copy", "cta": "call to action"}], "variations": "copy variations", "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAdBudgetAllocator(data: { totalBudget?: number; platforms?: string[] }, userId?: string) {
  const p = `Allocate advertising budget across platforms for a content creator.
${data.totalBudget ? `Total budget: $${sanitizeForPrompt(data.totalBudget)}` : ""}
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "allocation": [{"platform": "platform", "budget": "allocated budget", "expected": "expected results"}], "optimization": "optimization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLandingPageOptimizer(data: { url?: string; goal?: string }, userId?: string) {
  const p = `Optimize a landing page for a content creator.
${data.url ? `URL: ${sanitizeForPrompt(data.url)}` : ""}
${data.goal ? `Goal: ${sanitizeForPrompt(data.goal)}` : ""}
Respond as JSON: { "optimization": [{"element": "page element", "change": "recommended change", "impact": "expected impact"}], "testing": "A/B testing plan", "copy": "copy improvements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiConversionRateOptimizer(data: { funnel?: string[] }, userId?: string) {
  const p = `Optimize conversion rates for a content creator's funnel.
${data.funnel ? `Funnel steps: ${sanitizeForPrompt(data.funnel.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"step": "funnel step", "issue": "identified issue", "fix": "recommended fix"}], "testing": "testing strategy", "priorities": "priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataCleaningAdvisor(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Advise on data cleaning for a content creator's analytics.
${data.dataTypes ? `Data types: ${sanitizeForPrompt(data.dataTypes.join(", "))}` : ""}
Respond as JSON: { "cleaning": [{"issue": "data issue", "solution": "solution", "tool": "recommended tool"}], "validation": "validation rules", "automation": "automation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataPipelineBuilder(data: { sources?: string[]; destination?: string }, userId?: string) {
  const p = `Build a data pipeline for a content creator's analytics.
${data.sources ? `Data sources: ${sanitizeForPrompt(data.sources.join(", "))}` : ""}
${data.destination ? `Destination: ${sanitizeForPrompt(data.destination)}` : ""}
Respond as JSON: { "pipeline": [{"step": "pipeline step", "tool": "tool", "config": "configuration"}], "scheduling": "scheduling plan", "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnomalyDetector(data: { metrics?: string[] }, userId?: string) {
  const p = `Set up anomaly detection for a content creator's metrics.
${data.metrics ? `Metrics: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "detection": [{"metric": "metric name", "method": "detection method", "threshold": "threshold"}], "alerting": "alerting setup", "investigation": "investigation process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCohortAnalyzer(data: { segments?: string[] }, userId?: string) {
  const p = `Analyze audience cohorts for a content creator.
${data.segments ? `Segments: ${sanitizeForPrompt(data.segments.join(", "))}` : ""}
Respond as JSON: { "cohorts": [{"segment": "cohort segment", "behavior": "behavior pattern", "retention": "retention rate"}], "insights": "key insights", "actions": "recommended actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAttributionModeler(data: { channels?: string[] }, userId?: string) {
  const p = `Build an attribution model for a content creator's marketing.
${data.channels ? `Channels: ${sanitizeForPrompt(data.channels.join(", "))}` : ""}
Respond as JSON: { "model": [{"channel": "channel", "attribution": "attribution method", "weight": "weight"}], "comparison": "model comparison", "optimization": "optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPredictiveChurnModeler(data: { factors?: string[] }, userId?: string) {
  const p = `Build a predictive churn model for a content creator's audience.
${data.factors ? `Factors: ${sanitizeForPrompt(data.factors.join(", "))}` : ""}
Respond as JSON: { "model": [{"factor": "churn factor", "weight": "weight", "intervention": "intervention strategy"}], "earlyWarning": "early warning signs", "retention": "retention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLifetimeValueCalculator(data: { segments?: string[] }, userId?: string) {
  const p = `Calculate customer lifetime value for a content creator's business.
${data.segments ? `Segments: ${sanitizeForPrompt(data.segments.join(", "))}` : ""}
Respond as JSON: { "ltv": [{"segment": "segment", "value": "lifetime value", "improvement": "improvement opportunity"}], "strategies": "value increase strategies", "forecasting": "LTV forecasting" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccessibilityTextChecker(data: { content?: string }, userId?: string) {
  const p = `Check content accessibility for a content creator.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "issues": [{"issue": "accessibility issue", "location": "location", "fix": "fix recommendation"}], "readability": "readability score and tips", "inclusive": "inclusive language suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAltTextGenerator(data: { images?: string[] }, userId?: string) {
  const p = `Generate alt text for a content creator's images.
${data.images ? `Images: ${sanitizeForPrompt(data.images.join(", "))}` : ""}
Respond as JSON: { "altTexts": [{"image": "image description", "altText": "alt text", "description": "extended description"}], "guidelines": "alt text best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiColorContrastChecker(data: { foreground?: string; background?: string }, userId?: string) {
  const p = `Check color contrast for accessibility.
${data.foreground ? `Foreground color: ${sanitizeForPrompt(data.foreground)}` : ""}
${data.background ? `Background color: ${sanitizeForPrompt(data.background)}` : ""}
Respond as JSON: { "ratio": "contrast ratio", "wcag": {"aa": "AA compliance status", "aaa": "AAA compliance status"}, "alternatives": "alternative color suggestions", "recommendations": "recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiScreenReaderOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for screen readers.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "optimization": [{"element": "element to optimize", "fix": "recommended fix"}], "testing": "testing guidelines", "compliance": "compliance checklist" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKeyboardNavChecker(data: { components?: string[] }, userId?: string) {
  const p = `Check keyboard navigation accessibility.
${data.components ? `Components: ${sanitizeForPrompt(data.components.join(", "))}` : ""}
Respond as JSON: { "issues": [{"component": "component", "issue": "navigation issue", "fix": "fix"}], "tabOrder": "tab order recommendations", "shortcuts": "keyboard shortcuts to add" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCaptionQualityChecker(data: { captions?: string }, userId?: string) {
  const p = `Check caption quality for accessibility.
${data.captions ? `Captions: ${sanitizeForPrompt(data.captions)}` : ""}
Respond as JSON: { "quality": {"accuracy": "accuracy assessment", "timing": "timing assessment", "formatting": "formatting assessment"}, "improvements": "improvement suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInclusiveLanguageChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for inclusive language.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "issues": [{"phrase": "problematic phrase", "alternative": "inclusive alternative", "reason": "reason for change"}], "score": "inclusivity score", "guidelines": "inclusive language guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDyslexiaFriendlyFormatter(data: { content?: string }, userId?: string) {
  const p = `Format content to be dyslexia-friendly.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "formatted": {"font": "recommended font", "spacing": "spacing settings", "colors": "color recommendations"}, "guidelines": "dyslexia-friendly guidelines", "testing": "testing methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMotionSensitivityChecker(data: { animations?: string[] }, userId?: string) {
  const p = `Check animations for motion sensitivity issues.
${data.animations ? `Animations: ${sanitizeForPrompt(data.animations.join(", "))}` : ""}
Respond as JSON: { "issues": [{"animation": "animation name", "risk": "risk level", "alternative": "alternative approach"}], "reducedMotion": "reduced motion implementation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCognitiveLoadReducer(data: { interface?: string }, userId?: string) {
  const p = `Reduce cognitive load in a content creator's interface.
${data.interface ? `Interface: ${sanitizeForPrompt(data.interface)}` : ""}
Respond as JSON: { "reductions": [{"element": "interface element", "issue": "cognitive load issue", "simplification": "simplification suggestion"}], "testing": "usability testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiModalContentCreator(data: { content?: string }, userId?: string) {
  const p = `Create multi-modal content adaptations for accessibility.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "modes": [{"mode": "content mode", "adaptation": "adaptation details", "accessibility": "accessibility features"}], "delivery": "delivery strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPasswordSecurityAdvisor(data: { accounts?: number }, userId?: string) {
  const p = `Advise on password security for a content creator.
${data.accounts ? `Number of accounts: ${sanitizeForPrompt(data.accounts)}` : ""}
Respond as JSON: { "recommendations": [{"account": "account type", "action": "security action"}], "manager": "password manager recommendation", "twoFA": "two-factor authentication setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPhishingDetector(data: { emailTypes?: string[] }, userId?: string) {
  const p = `Detect and prevent phishing for a content creator.
${data.emailTypes ? `Email types to check: ${sanitizeForPrompt(data.emailTypes.join(", "))}` : ""}
Respond as JSON: { "detection": [{"type": "phishing type", "signs": "warning signs", "prevention": "prevention steps"}], "training": "awareness training", "reporting": "reporting process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccountRecoveryPlanner(data: { accounts?: string[] }, userId?: string) {
  const p = `Plan account recovery procedures for a content creator.
${data.accounts ? `Accounts: ${sanitizeForPrompt(data.accounts.join(", "))}` : ""}
Respond as JSON: { "plan": [{"account": "account", "backup": "backup method", "recovery": "recovery steps"}], "documentation": "documentation to maintain" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPrivacySettingsOptimizer(data: { platforms?: string[] }, userId?: string) {
  const p = `Optimize privacy settings for a content creator across platforms.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "settings": [{"platform": "platform", "setting": "privacy setting", "recommended": "recommended value"}], "review": "regular review schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDataBreachResponsePlanner(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Plan data breach response for a content creator.
${data.dataTypes ? `Data types at risk: ${sanitizeForPrompt(data.dataTypes.join(", "))}` : ""}
Respond as JSON: { "plan": [{"step": "response step", "action": "action to take", "timeline": "timeline"}], "notification": "notification plan", "prevention": "prevention measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVPNAdvisor(data: { useCase?: string }, userId?: string) {
  const p = `Advise on VPN usage for a content creator.
${data.useCase ? `Use case: ${sanitizeForPrompt(data.useCase)}` : ""}
Respond as JSON: { "recommendations": [{"provider": "VPN provider", "features": "key features", "price": "price"}], "setup": "setup guide", "split": "split tunneling recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorAnalyzer(data: { competitors?: string[]; metrics?: string[] }, userId?: string) {
  const p = `Analyze competitors for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
${data.metrics ? `Metrics to compare: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "analysis": [{"competitor": "competitor", "strengths": "strengths", "weaknesses": "weaknesses", "opportunity": "opportunity"}], "strategy": "competitive strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorContentTracker(data: { competitors?: string[] }, userId?: string) {
  const p = `Track competitor content for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON: { "tracking": [{"competitor": "competitor", "content": "content type", "frequency": "posting frequency", "performance": "performance metrics"}], "gaps": "content gaps to exploit" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorPricingMonitor(data: { competitors?: string[] }, userId?: string) {
  const p = `Monitor competitor pricing for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON: { "pricing": [{"competitor": "competitor", "products": "products", "prices": "price points"}], "positioning": "price positioning strategy", "strategy": "competitive pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMarketShareAnalyzer(data: { niche?: string }, userId?: string) {
  const p = `Analyze market share in a content creator's niche.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "analysis": [{"player": "market player", "share": "market share", "trend": "trend"}], "opportunity": "market opportunity", "positioning": "positioning strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSWOTAnalyzer(data: { channelName?: string; niche?: string }, userId?: string) {
  const p = `Perform a SWOT analysis for a content creator.
${data.channelName ? `Channel: ${sanitizeForPrompt(data.channelName)}` : ""}
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "swot": {"strengths": "key strengths", "weaknesses": "key weaknesses", "opportunities": "opportunities", "threats": "threats"}, "actions": "recommended actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorSocialTracker(data: { competitors?: string[] }, userId?: string) {
  const p = `Track competitor social media activity for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON: { "tracking": [{"competitor": "competitor", "platform": "platform", "metrics": "key metrics"}], "insights": "actionable insights" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlueOceanFinder(data: { niche?: string; interests?: string[] }, userId?: string) {
  const p = `Find blue ocean opportunities for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.interests ? `Interests: ${sanitizeForPrompt(data.interests.join(", "))}` : ""}
Respond as JSON: { "opportunities": [{"space": "opportunity space", "demand": "demand level", "competition": "competition level"}], "strategy": "entry strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for mobile viewing.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "mobile": "mobile optimization", "desktop": "desktop version"}], "responsive": "responsive design tips", "testing": "testing checklist" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAppDeepLinkBuilder(data: { platforms?: string[] }, userId?: string) {
  const p = `Build deep links for a content creator's app.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "links": [{"platform": "platform", "scheme": "URL scheme", "fallback": "fallback URL"}], "testing": "testing strategy", "analytics": "analytics tracking" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPushNotificationOptimizer(data: { types?: string[] }, userId?: string) {
  const p = `Optimize push notifications for a content creator's app.
${data.types ? `Notification types: ${sanitizeForPrompt(data.types.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"type": "notification type", "timing": "optimal timing", "content": "content strategy"}], "frequency": "frequency recommendations", "segmentation": "audience segmentation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileVideoOptimizer(data: { format?: string }, userId?: string) {
  const p = `Optimize video for mobile playback.
${data.format ? `Format: ${sanitizeForPrompt(data.format)}` : ""}
Respond as JSON: { "optimization": [{"setting": "video setting", "value": "recommended value", "reason": "reason"}], "fileSize": "file size optimization", "quality": "quality preservation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiResponsiveDesignChecker(data: { pages?: string[] }, userId?: string) {
  const p = `Check responsive design for a content creator's website.
${data.pages ? `Pages: ${sanitizeForPrompt(data.pages.join(", "))}` : ""}
Respond as JSON: { "issues": [{"page": "page name", "issue": "responsive issue", "fix": "fix recommendation"}], "breakpoints": "breakpoint recommendations", "testing": "testing devices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobilePaymentOptimizer(data: { products?: string[] }, userId?: string) {
  const p = `Optimize mobile payment experience for a content creator's store.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"method": "payment method", "setup": "setup steps", "conversion": "conversion impact"}], "trust": "trust signals", "testing": "testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOfflineContentPlanner(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Plan offline content strategy for a content creator's app.
${data.contentTypes ? `Content types: ${sanitizeForPrompt(data.contentTypes.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"content": "content type", "caching": "caching strategy", "sync": "sync method"}], "PWA": "PWA implementation tips", "storage": "storage management" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileAnalyticsSetup(data: { platforms?: string[] }, userId?: string) {
  const p = `Set up mobile analytics for a content creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "setup": [{"tool": "analytics tool", "config": "configuration", "tracking": "what to track"}], "events": "key events to track", "funnels": "funnel setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAppStoreOptimizer(data: { appName?: string; category?: string }, userId?: string) {
  const p = `Optimize app store listing for a content creator's app.
${data.appName ? `App name: ${sanitizeForPrompt(data.appName)}` : ""}
${data.category ? `Category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "optimization": [{"element": "store element", "current": "current state", "improved": "improved version"}], "keywords": "keyword strategy", "screenshots": "screenshot recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWidgetDesigner(data: { purpose?: string; platform?: string }, userId?: string) {
  const p = `Design widgets for a content creator's platform.
${data.purpose ? `Purpose: ${sanitizeForPrompt(data.purpose)}` : ""}
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "widgets": [{"name": "widget name", "design": "design description", "data": "data displayed", "interaction": "interaction type"}], "placement": "placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGestureOptimizer(data: { interactions?: string[] }, userId?: string) {
  const p = `Optimize gesture interactions for a content creator's mobile app.
${data.interactions ? `Interactions: ${sanitizeForPrompt(data.interactions.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"gesture": "gesture type", "improvement": "improvement suggestion"}], "accessibility": "accessibility considerations", "feedback": "haptic feedback recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMobileFirstContentCreator(data: { contentType?: string }, userId?: string) {
  const p = `Create mobile-first content strategy for a content creator.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "strategy": [{"element": "content element", "mobile": "mobile-first approach", "adaptation": "adaptation method"}], "thumbZone": "thumb zone optimization", "scrolling": "scroll behavior recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWearableContentAdvisor(data: { devices?: string[] }, userId?: string) {
  const p = `Advise on content for wearable devices.
${data.devices ? `Devices: ${sanitizeForPrompt(data.devices.join(", "))}` : ""}
Respond as JSON: { "content": [{"device": "device type", "format": "content format", "limitations": "limitations"}], "notifications": "notification strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPlatformSyncManager(data: { platforms?: string[] }, userId?: string) {
  const p = `Manage cross-platform content synchronization.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "sync": [{"data": "data type", "platforms": "platforms involved", "method": "sync method"}], "conflicts": "conflict resolution strategy", "realtime": "real-time sync options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartTVOptimizer(data: { contentType?: string }, userId?: string) {
  const p = `Optimize content for Smart TV viewing.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "tvSetting": "TV-optimized setting"}], "navigation": "TV navigation design", "quality": "quality recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAchievementSystemBuilder(data: { community?: string }, userId?: string) {
  const p = `Design a gamification achievement system for a creator community.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
Respond as JSON: { "achievements": [{"name": "achievement name", "criteria": "unlock criteria", "reward": "reward given", "rarity": "common/rare/epic/legendary"}], "progression": "progression system overview" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLeaderboardDesigner(data: { metrics?: string[] }, userId?: string) {
  const p = `Design engaging leaderboard systems for a content creator platform.
${data.metrics ? `Metrics to track: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "boards": [{"name": "leaderboard name", "metric": "tracked metric", "period": "time period", "prizes": "prize structure"}], "fairness": "fairness mechanisms" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPointsEconomyBuilder(data: { actions?: string[] }, userId?: string) {
  const p = `Build a points economy system for a creator community.
${data.actions ? `Actions to reward: ${sanitizeForPrompt(data.actions.join(", "))}` : ""}
Respond as JSON: { "economy": [{"action": "user action", "points": "points awarded", "decay": "point decay rate"}], "rewards": "reward tiers and options", "inflation": "inflation control measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBadgeSystemCreator(data: { categories?: string[] }, userId?: string) {
  const p = `Create a badge system for a content creator platform.
${data.categories ? `Badge categories: ${sanitizeForPrompt(data.categories.join(", "))}` : ""}
Respond as JSON: { "badges": [{"name": "badge name", "category": "badge category", "criteria": "earn criteria", "design": "visual design description"}], "progression": "badge progression path" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreakSystemBuilder(data: { activities?: string[] }, userId?: string) {
  const p = `Build a streak tracking system to encourage consistent creator activity.
${data.activities ? `Activities to track: ${sanitizeForPrompt(data.activities.join(", "))}` : ""}
Respond as JSON: { "streaks": [{"activity": "tracked activity", "milestones": "streak milestones", "rewards": "milestone rewards"}], "recovery": "streak recovery mechanics", "notification": "notification strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProgressVisualizationEngine(data: { metrics?: string[] }, userId?: string) {
  const p = `Design progress visualization dashboards for creator metrics.
${data.metrics ? `Metrics to visualize: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "visualizations": [{"metric": "metric name", "chartType": "recommended chart type", "milestones": "visual milestones"}], "dashboard": "dashboard layout recommendation" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChallengeSystemBuilder(data: { community?: string }, userId?: string) {
  const p = `Build a challenge system for a creator community to drive engagement.
${data.community ? `Community: ${sanitizeForPrompt(data.community)}` : ""}
Respond as JSON: { "challenges": [{"name": "challenge name", "rules": "challenge rules", "duration": "challenge duration", "reward": "reward for completion"}], "seasonal": "seasonal challenge plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMonthlyReportGenerator(data: { metrics?: any }, userId?: string) {
  const p = `Generate a comprehensive monthly performance report for a content creator.
${data.metrics ? `Metrics data: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics))}` : ""}
Respond as JSON: { "report": [{"section": "report section", "data": "key data points", "insight": "actionable insight"}], "highlights": "month highlights summary", "goals": "next month goals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWeeklyDigestBuilder(data: { activities?: string[] }, userId?: string) {
  const p = `Build a weekly digest summary for a content creator.
${data.activities ? `Recent activities: ${sanitizeForPrompt(data.activities.join(", "))}` : ""}
Respond as JSON: { "digest": [{"topic": "digest topic", "summary": "brief summary", "action": "recommended action"}], "metrics": "key metrics snapshot", "upcoming": "upcoming priorities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuarterlyBusinessReview(data: { financials?: any }, userId?: string) {
  const p = `Generate a quarterly business review for a content creator's business.
${data.financials ? `Financial data: ${JSON.stringify(sanitizeObjectForPrompt(data.financials))}` : ""}
Respond as JSON: { "review": [{"area": "business area", "performance": "performance summary", "target": "target vs actual"}], "strategy": "strategic recommendations", "adjustments": "suggested adjustments" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAnnualStrategyPlanner(data: { goals?: string[] }, userId?: string) {
  const p = `Create an annual strategy plan for a content creator.
${data.goals ? `Annual goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"quarter": "Q1/Q2/Q3/Q4", "focus": "quarterly focus area", "milestones": "key milestones"}], "budget": "budget allocation plan", "risks": "risk assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCompetitorReportGenerator(data: { competitors?: string[] }, userId?: string) {
  const p = `Generate a competitor analysis report for a content creator.
${data.competitors ? `Competitors: ${sanitizeForPrompt(data.competitors.join(", "))}` : ""}
Respond as JSON: { "report": [{"competitor": "competitor name", "analysis": "competitive analysis"}], "opportunities": "identified opportunities", "threats": "competitive threats" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAudienceReportBuilder(data: { demographics?: any }, userId?: string) {
  const p = `Build an audience analysis report for a content creator.
${data.demographics ? `Demographics data: ${JSON.stringify(sanitizeObjectForPrompt(data.demographics))}` : ""}
Respond as JSON: { "report": [{"segment": "audience segment", "size": "segment size", "behavior": "behavior patterns"}], "growth": "growth opportunities", "targeting": "targeting recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentReportCard(data: { videos?: any[] }, userId?: string) {
  const p = `Generate a content report card grading a creator's recent content.
${data.videos ? `Videos: ${JSON.stringify(sanitizeObjectForPrompt(data.videos.slice(0, 10)))}` : ""}
Respond as JSON: { "grades": [{"category": "grading category", "grade": "letter grade", "feedback": "specific feedback"}], "overall": "overall grade and summary", "improvements": "top improvements needed" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiROIReportGenerator(data: { investments?: any[] }, userId?: string) {
  const p = `Generate an ROI report for a content creator's investments.
${data.investments ? `Investments: ${JSON.stringify(sanitizeObjectForPrompt(data.investments.slice(0, 10)))}` : ""}
Respond as JSON: { "roi": [{"investment": "investment description", "return": "return achieved", "recommendation": "keep/scale/cut"}], "total": "total ROI summary", "optimization": "optimization suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamingNicheOptimizer(data: { games?: string[] }, userId?: string) {
  const p = `Optimize a content creator's niche strategy.
${data.games ? `Games covered: ${sanitizeForPrompt(data.games.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"game": "game title", "opportunity": "content opportunity", "strategy": "recommended strategy"}], "trending": "trending games to consider", "schedule": "optimal upload schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBeautyNicheAdvisor(data: { subNiche?: string }, userId?: string) {
  const p = `Provide niche strategy advice for a beauty content creator.
${data.subNiche ? `Sub-niche: ${sanitizeForPrompt(data.subNiche)}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "strategy": "recommended strategy", "audience": "target audience"}], "trends": "current beauty trends", "brands": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTechReviewOptimizer(data: { category?: string }, userId?: string) {
  const p = `Optimize a tech review content creator's strategy.
${data.category ? `Tech category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "strategy": "optimization strategy"}], "seoTips": "tech review SEO tips", "affiliate": "affiliate program recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFoodContentPlanner(data: { cuisine?: string }, userId?: string) {
  const p = `Plan content strategy for a food content creator.
${data.cuisine ? `Cuisine focus: ${sanitizeForPrompt(data.cuisine)}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "content concept", "seasonality": "seasonal relevance"}], "trends": "food content trends", "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFitnessContentStrategy(data: { specialty?: string }, userId?: string) {
  const p = `Create a content strategy for a fitness content creator.
${data.specialty ? `Fitness specialty: ${sanitizeForPrompt(data.specialty)}` : ""}
Respond as JSON: { "strategy": [{"pillar": "content pillar", "content": "content ideas", "audience": "target audience"}], "partnerships": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTravelContentOptimizer(data: { style?: string }, userId?: string) {
  const p = `Optimize content strategy for a travel content creator.
${data.style ? `Travel style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "optimization": [{"aspect": "content aspect", "strategy": "optimization strategy"}], "sponsorships": "sponsorship opportunities", "gear": "recommended gear" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEducationContentPlanner(data: { subject?: string }, userId?: string) {
  const p = `Plan content strategy for an education content creator.
${data.subject ? `Subject area: ${sanitizeForPrompt(data.subject)}` : ""}
Respond as JSON: { "plan": [{"topic": "content topic", "format": "content format", "audience": "target audience"}], "credentials": "credibility building tips", "courses": "course creation opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinanceContentAdvisor(data: { specialty?: string }, userId?: string) {
  const p = `Advise on content strategy for a finance content creator.
${data.specialty ? `Finance specialty: ${sanitizeForPrompt(data.specialty)}` : ""}
Respond as JSON: { "advice": [{"topic": "content topic", "compliance": "compliance considerations", "format": "best format"}], "disclaimers": "required disclaimers", "affiliate": "affiliate opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiParentingContentStrategy(data: { ageGroup?: string }, userId?: string) {
  const p = `Create a content strategy for a parenting content creator.
${data.ageGroup ? `Target age group: ${sanitizeForPrompt(data.ageGroup)}` : ""}
Respond as JSON: { "strategy": [{"topic": "content topic", "approach": "content approach", "safety": "safety considerations"}], "monetization": "monetization strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPetContentOptimizer(data: { petType?: string }, userId?: string) {
  const p = `Optimize content strategy for a pet content creator.
${data.petType ? `Pet type: ${sanitizeForPrompt(data.petType)}` : ""}
Respond as JSON: { "optimization": [{"content": "content type", "audience": "target audience", "brands": "brand opportunities"}], "viral": "viral content strategies", "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDIYCraftPlanner(data: { category?: string }, userId?: string) {
  const p = `Plan content strategy for a DIY and crafts content creator.
${data.category ? `Craft category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "plan": [{"project": "project idea", "difficulty": "difficulty level", "materials": "materials needed"}], "series": "content series ideas", "monetization": "monetization approaches" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicianContentStrategy(data: { genre?: string }, userId?: string) {
  const p = `Create a content strategy for a musician content creator.
${data.genre ? `Music genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON: { "strategy": [{"platform": "target platform", "content": "content type", "promotion": "promotion strategy"}], "distribution": "music distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiComedyContentAdvisor(data: { style?: string }, userId?: string) {
  const p = `Advise on content strategy for a comedy content creator.
${data.style ? `Comedy style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "advice": [{"format": "content format", "platform": "best platform", "timing": "posting timing"}], "trends": "comedy trends", "safety": "content safety guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSportsContentPlanner(data: { sport?: string }, userId?: string) {
  const p = `Plan content strategy for a sports content creator.
${data.sport ? `Sport: ${sanitizeForPrompt(data.sport)}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "timing": "optimal timing", "rights": "rights considerations"}], "partnerships": "partnership opportunities", "live": "live content strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewsCommentaryPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan content strategy for a news commentary content creator.
${data.niche ? `News niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"approach": "commentary approach", "format": "content format", "frequency": "posting frequency"}], "sourcing": "source verification tips", "liability": "legal liability considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLifestyleContentOptimizer(data: { aesthetic?: string }, userId?: string) {
  const p = `Optimize content strategy for a lifestyle content creator.
${data.aesthetic ? `Aesthetic style: ${sanitizeForPrompt(data.aesthetic)}` : ""}
Respond as JSON: { "optimization": [{"area": "content area", "strategy": "optimization strategy"}], "branding": "personal branding tips", "partnerships": "brand partnership opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToBookConverter(data: { videos?: string[] }, userId?: string) {
  const p = `Plan converting video content into a book format.
${data.videos ? `Videos: ${sanitizeForPrompt(data.videos.join(", "))}` : ""}
Respond as JSON: { "book": [{"chapter": "chapter title", "source": "source video", "content": "chapter content outline"}], "publishing": "publishing strategy", "marketing": "book marketing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToPodcastConverter(data: { videoTitle?: string }, userId?: string) {
  const p = `Plan converting a video into podcast format.
${data.videoTitle ? `Video title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
Respond as JSON: { "conversion": {"audioEdit": "audio editing notes", "intro": "podcast intro script", "chapters": "chapter markers"}, "distribution": "podcast distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVideoToCourseConverter(data: { videos?: string[] }, userId?: string) {
  const p = `Plan converting video content into an online course.
${data.videos ? `Videos: ${sanitizeForPrompt(data.videos.join(", "))}` : ""}
Respond as JSON: { "course": [{"module": "module name", "videos": "included videos", "exercises": "practice exercises"}], "platform": "recommended platform", "pricing": "pricing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlogToVideoConverter(data: { blogPost?: string }, userId?: string) {
  const p = `Plan converting a blog post into video content.
${data.blogPost ? `Blog post: ${sanitizeForPrompt(data.blogPost)}` : ""}
Respond as JSON: { "video": {"script": "video script outline", "visuals": "visual elements needed", "duration": "estimated duration"}, "seo": "video SEO strategy", "promotion": "promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiLinkedInContentAdapter(data: { content?: string }, userId?: string) {
  const p = `Adapt content for LinkedIn platform.
${data.content ? `Content to adapt: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "adapted": {"post": "LinkedIn post text", "article": "article version", "carousel": "carousel slide ideas"}, "timing": "optimal posting time" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPinterestPinCreator(data: { content?: string }, userId?: string) {
  const p = `Create optimized Pinterest pins from content.
${data.content ? `Content to adapt: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "pins": [{"title": "pin title", "description": "pin description", "design": "design recommendations"}], "boards": "board strategy", "seo": "Pinterest SEO tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRedditPostOptimizer(data: { content?: string; subreddit?: string }, userId?: string) {
  const p = `Optimize content for Reddit posting.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
${data.subreddit ? `Target subreddit: ${sanitizeForPrompt(data.subreddit)}` : ""}
Respond as JSON: { "optimized": {"title": "optimized title", "body": "post body", "timing": "best posting time"}, "rules": "subreddit rules to follow", "engagement": "engagement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiQuoraAnswerWriter(data: { topic?: string }, userId?: string) {
  const p = `Create strategic Quora answers to drive traffic and authority.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "answers": [{"question": "target question", "answer": "answer outline", "links": "strategic link placement"}], "strategy": "Quora growth strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediumArticleAdapter(data: { content?: string }, userId?: string) {
  const p = `Adapt content for Medium publication.
${data.content ? `Content to adapt: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "article": {"title": "article title", "body": "article structure", "tags": "recommended tags"}, "distribution": "distribution strategy", "earnings": "Medium earnings optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSlidedeckCreator(data: { topic?: string }, userId?: string) {
  const p = `Create a slide deck presentation from content.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "slides": [{"title": "slide title", "content": "slide content", "visual": "visual suggestion"}], "design": "design theme recommendation", "sharing": "distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfographicRepurposer(data: { data?: string }, userId?: string) {
  const p = `Repurpose content data into infographic format.
${data.data ? `Data to visualize: ${sanitizeForPrompt(data.data)}` : ""}
Respond as JSON: { "infographic": {"layout": "layout structure", "sections": "content sections", "design": "design guidelines"}, "platforms": "platform-specific sizing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabMatchScorer(data: { creator1?: any; creator2?: any }, userId?: string) {
  const p = `Score the collaboration compatibility between two creators.
${data.creator1 ? `Creator 1: ${JSON.stringify(sanitizeObjectForPrompt(data.creator1))}` : ""}
${data.creator2 ? `Creator 2: ${JSON.stringify(sanitizeObjectForPrompt(data.creator2))}` : ""}
Respond as JSON: { "score": "compatibility score 0-100", "compatibility": "compatibility analysis", "format": "best collab format", "risks": "potential risks", "benefits": "expected benefits" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContractWriter(data: { terms?: any }, userId?: string) {
  const p = `Draft collaboration contract terms for content creators.
${data.terms ? `Terms: ${JSON.stringify(sanitizeObjectForPrompt(data.terms))}` : ""}
Respond as JSON: { "contract": [{"clause": "contract clause", "detail": "clause details"}], "negotiation": "negotiation tips", "protection": "creator protection measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabRevenueCalculator(data: { creators?: any[] }, userId?: string) {
  const p = `Calculate projected collaboration revenue and split.
${data.creators ? `Creators: ${JSON.stringify(sanitizeObjectForPrompt(data.creators.slice(0, 5)))}` : ""}
Respond as JSON: { "revenue": {"split": "revenue split recommendation", "projected": "projected earnings", "terms": "payment terms"}, "negotiation": "negotiation framework" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabContentIdeator(data: { creators?: string[]; niches?: string[] }, userId?: string) {
  const p = `Generate collaboration content ideas for creators.
${data.creators ? `Creators: ${sanitizeForPrompt(data.creators.join(", "))}` : ""}
${data.niches ? `Niches: ${sanitizeForPrompt(data.niches.join(", "))}` : ""}
Respond as JSON: { "ideas": [{"concept": "content concept", "format": "content format", "audience": "target audience"}], "distribution": "distribution plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabOutreachWriter(data: { target?: string; reason?: string }, userId?: string) {
  const p = `Write collaboration outreach messages.
${data.target ? `Target creator: ${sanitizeForPrompt(data.target)}` : ""}
${data.reason ? `Reason for collab: ${sanitizeForPrompt(data.reason)}` : ""}
Respond as JSON: { "outreach": {"subject": "message subject", "body": "message body", "followUp": "follow-up message"}, "platform": "best outreach platform", "timing": "optimal timing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCollabPerformanceTracker(data: { collabs?: any[] }, userId?: string) {
  const p = `Track and analyze collaboration performance.
${data.collabs ? `Collaborations: ${JSON.stringify(sanitizeObjectForPrompt(data.collabs.slice(0, 5)))}` : ""}
Respond as JSON: { "performance": [{"collab": "collaboration name", "metrics": "key metrics", "roi": "return on investment"}], "learnings": "key learnings" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkEffectCalculator(data: { connections?: number }, userId?: string) {
  const p = `Calculate network effects and growth potential for a creator.
${data.connections ? `Current connections: ${sanitizeForPrompt(data.connections)}` : ""}
Respond as JSON: { "effect": {"current": "current network value", "potential": "growth potential", "strategy": "network growth strategy"}, "growth": "growth projections" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubMilestoneStrategyBuilder(data: { target?: number; current?: number }, userId?: string) {
  const p = `Build a subscriber milestone achievement strategy.
${data.target ? `Target subscribers: ${sanitizeForPrompt(data.target)}` : ""}
${data.current ? `Current subscribers: ${sanitizeForPrompt(data.current)}` : ""}
Respond as JSON: { "strategy": [{"milestone": "subscriber milestone", "tactics": "growth tactics", "timeline": "estimated timeline"}], "celebrations": "milestone celebration ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubRetentionOptimizer(data: { churnRate?: number }, userId?: string) {
  const p = `Optimize subscriber retention and reduce churn.
${data.churnRate ? `Current churn rate: ${sanitizeForPrompt(data.churnRate)}%` : ""}
Respond as JSON: { "optimization": [{"strategy": "retention strategy", "implementation": "implementation steps"}], "notifications": "notification optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNotificationBellOptimizer(data: { bellClickRate?: number }, userId?: string) {
  const p = `Optimize notification bell click-through rates.
${data.bellClickRate ? `Current bell click rate: ${sanitizeForPrompt(data.bellClickRate)}%` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "how to implement"}], "messaging": "notification messaging strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFirstVideoOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize a creator's first video for maximum impact.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimization": [{"element": "video element", "strategy": "optimization strategy"}], "hook": "opening hook strategy", "promotion": "first video promotion plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChannelMembershipPerks(data: { tiers?: any[] }, userId?: string) {
  const p = `Design channel membership perks and tiers.
${data.tiers ? `Current tiers: ${JSON.stringify(sanitizeObjectForPrompt(data.tiers))}` : ""}
Respond as JSON: { "perks": [{"tier": "membership tier", "perks": "tier perks", "value": "perceived value"}], "exclusive": "exclusive content ideas", "retention": "member retention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubCountdownPlanner(data: { target?: number; current?: number }, userId?: string) {
  const p = `Plan a subscriber countdown event and campaign.
${data.target ? `Target subscribers: ${sanitizeForPrompt(data.target)}` : ""}
${data.current ? `Current subscribers: ${sanitizeForPrompt(data.current)}` : ""}
Respond as JSON: { "plan": [{"phase": "campaign phase", "actions": "specific actions"}], "content": "special content ideas", "community": "community engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiUnsubscribeAnalyzer(data: { reasons?: string[] }, userId?: string) {
  const p = `Analyze unsubscribe patterns and provide prevention strategies.
${data.reasons ? `Known reasons: ${sanitizeForPrompt(data.reasons.join(", "))}` : ""}
Respond as JSON: { "analysis": [{"reason": "unsubscribe reason", "percentage": "estimated percentage", "solution": "prevention solution"}], "prevention": "overall prevention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubQualityAnalyzer(data: { engagement?: number }, userId?: string) {
  const p = `Analyze subscriber quality and engagement levels.
${data.engagement ? `Engagement rate: ${sanitizeForPrompt(data.engagement)}%` : ""}
Respond as JSON: { "quality": {"active": "active subscriber analysis", "passive": "passive subscriber analysis", "ghost": "ghost subscriber analysis"}, "reEngagement": "re-engagement strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrowthHackingPlaybook(data: { niche?: string; stage?: string }, userId?: string) {
  const p = `Create a growth hacking playbook for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
${data.stage ? `Growth stage: ${sanitizeForPrompt(data.stage)}` : ""}
Respond as JSON: { "playbook": [{"hack": "growth hack", "implementation": "implementation steps", "risk": "risk level"}], "priority": "prioritized action plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiViralGrowthEngineBuilder(data: { mechanics?: string[] }, userId?: string) {
  const p = `Build a viral growth engine for content distribution.
${data.mechanics ? `Growth mechanics: ${sanitizeForPrompt(data.mechanics.join(", "))}` : ""}
Respond as JSON: { "engine": [{"mechanic": "viral mechanic", "trigger": "activation trigger", "amplifier": "amplification method"}], "testing": "A/B testing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrossPromotionPlanner(data: { platforms?: string[] }, userId?: string) {
  const p = `Plan cross-platform content promotion strategy.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "plan": [{"from": "source platform", "to": "target platform", "content": "content adaptation", "timing": "posting timing"}], "automation": "automation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWatchTimeBooster(data: { avgDuration?: string }, userId?: string) {
  const p = `Provide strategies to boost video watch time and retention.
${data.avgDuration ? `Current average watch duration: ${sanitizeForPrompt(data.avgDuration)}` : ""}
Respond as JSON: { "boosters": [{"technique": "retention technique", "placement": "where to apply", "impact": "expected impact"}], "structure": "optimal video structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOpenLoopCreator(data: { topic?: string }, userId?: string) {
  const p = `Create open loop storytelling hooks for video retention.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "loops": [{"setup": "open loop setup", "payoff": "payoff delivery", "timing": "timing in video"}], "retention": "retention impact analysis", "placement": "strategic placement guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatternInterruptDesigner(data: { frequency?: string }, userId?: string) {
  const p = `Design pattern interrupts to maintain viewer attention.
${data.frequency ? `Desired frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "interrupts": [{"type": "interrupt type", "timing": "when to use", "execution": "how to execute"}], "variety": "variety recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReEngagementHookBuilder(data: { dropOffPoints?: string[] }, userId?: string) {
  const p = `Build re-engagement hooks for video drop-off points.
${data.dropOffPoints ? `Drop-off points: ${sanitizeForPrompt(data.dropOffPoints.join(", "))}` : ""}
Respond as JSON: { "hooks": [{"point": "drop-off point", "hook": "re-engagement hook", "technique": "technique used"}], "testing": "testing methodology" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBingeWatchOptimizer(data: { series?: string[] }, userId?: string) {
  const p = `Optimize content for binge-watching behavior.
${data.series ? `Content series: ${sanitizeForPrompt(data.series.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"element": "content element", "strategy": "optimization strategy"}], "endScreens": "end screen strategy", "cards": "card placement strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeStudioOptimizer(data: { settings?: string[] }, userId?: string) {
  const p = `Optimize YouTube Studio settings for maximum channel performance.
${data.settings ? `Current settings: ${sanitizeForPrompt(data.settings.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"setting": "studio setting", "recommended": "recommended value"}], "advanced": "advanced settings tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeShortsAlgorithm(data: { niche?: string }, userId?: string) {
  const p = `Decode and optimize for the YouTube Shorts algorithm.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "algorithm": [{"signal": "algorithm signal", "weight": "importance weight", "optimization": "how to optimize"}], "testing": "testing strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeCommentsManager(data: { volume?: string }, userId?: string) {
  const p = `Create a YouTube comments management strategy.
${data.volume ? `Comment volume: ${sanitizeForPrompt(data.volume)}` : ""}
Respond as JSON: { "management": [{"type": "comment type", "response": "response template", "automation": "automation option"}], "moderation": "moderation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubePlaylistStrategy(data: { categories?: string[] }, userId?: string) {
  const p = `Design an optimal YouTube playlist strategy.
${data.categories ? `Content categories: ${sanitizeForPrompt(data.categories.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"playlist": "playlist name", "purpose": "playlist purpose", "seo": "SEO optimization"}], "ordering": "video ordering strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubePremierePlanner(data: { videoTitle?: string }, userId?: string) {
  const p = `Plan a YouTube Premiere event for maximum engagement.
${data.videoTitle ? `Video title: ${sanitizeForPrompt(data.videoTitle)}` : ""}
Respond as JSON: { "plan": [{"phase": "premiere phase", "action": "specific action", "timing": "timing"}], "chat": "live chat strategy", "promotion": "pre-premiere promotion" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeMembeshipStrategy(data: { currentMembers?: number }, userId?: string) {
  const p = `Create a YouTube channel membership growth strategy.
${data.currentMembers ? `Current members: ${sanitizeForPrompt(data.currentMembers)}` : ""}
Respond as JSON: { "strategy": [{"tier": "membership tier", "content": "exclusive content", "pricing": "pricing recommendation"}], "retention": "member retention tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeSuperThanksOptimizer(data: { avgThanks?: number }, userId?: string) {
  const p = `Optimize YouTube Super Thanks revenue.
${data.avgThanks ? `Average Super Thanks per video: ${sanitizeForPrompt(data.avgThanks)}` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "how to implement"}], "triggers": "Super Thanks triggers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeHandleOptimizer(data: { currentHandle?: string }, userId?: string) {
  const p = `Optimize YouTube channel handle for branding and SEO.
${data.currentHandle ? `Current handle: ${sanitizeForPrompt(data.currentHandle)}` : ""}
Respond as JSON: { "recommendations": [{"handle": "suggested handle", "reasoning": "why this handle", "availability": "likely availability"}], "seo": "handle SEO impact" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeChannelPageOptimizer(data: { sections?: string[] }, userId?: string) {
  const p = `Optimize YouTube channel page layout and sections.
${data.sections ? `Current sections: ${sanitizeForPrompt(data.sections.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"section": "page section", "change": "recommended change"}], "layout": "optimal layout order", "branding": "branding consistency tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiYouTubeHashtagStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a YouTube hashtag strategy for discoverability.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"hashtag": "recommended hashtag", "usage": "when to use", "volume": "search volume estimate"}], "trending": "trending hashtag tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchEmoteStrategy(data: { subCount?: number }, userId?: string) {
  const p = `Design a Twitch emote strategy for community building.
${data.subCount ? `Current sub count: ${sanitizeForPrompt(data.subCount)}` : ""}
Respond as JSON: { "strategy": [{"tier": "sub tier", "emotes": "emote ideas", "community": "community impact"}], "creation": "emote creation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchBitsOptimizer(data: { avgBits?: number }, userId?: string) {
  const p = `Optimize Twitch Bits revenue and engagement.
${data.avgBits ? `Average bits per stream: ${sanitizeForPrompt(data.avgBits)}` : ""}
Respond as JSON: { "optimization": [{"tactic": "optimization tactic", "implementation": "implementation steps"}], "incentives": "bits incentive ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchRaidOptimizer(data: { avgViewers?: number }, userId?: string) {
  const p = `Optimize Twitch raid strategy for network growth.
${data.avgViewers ? `Average viewers: ${sanitizeForPrompt(data.avgViewers)}` : ""}
Respond as JSON: { "optimization": [{"strategy": "raid strategy", "timing": "optimal timing", "targets": "ideal raid targets"}], "etiquette": "raid etiquette guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchChannelPointsDesigner(data: { points?: string[] }, userId?: string) {
  const p = `Design Twitch channel points rewards system.
${data.points ? `Current rewards: ${sanitizeForPrompt(data.points.join(", "))}` : ""}
Respond as JSON: { "design": [{"reward": "reward name", "cost": "point cost", "engagement": "engagement impact"}], "economy": "points economy balance" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchPredictionsCreator(data: { streamType?: string }, userId?: string) {
  const p = `Create engaging Twitch Predictions for stream interaction.
${data.streamType ? `Stream type: ${sanitizeForPrompt(data.streamType)}` : ""}
Respond as JSON: { "predictions": [{"question": "prediction question", "options": "prediction options", "timing": "when to run"}], "engagement": "engagement maximization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchHypeTrainMaximizer(data: { avgTrain?: number }, userId?: string) {
  const p = `Maximize Twitch Hype Train frequency and levels.
${data.avgTrain ? `Average hype trains per stream: ${sanitizeForPrompt(data.avgTrain)}` : ""}
Respond as JSON: { "maximizer": [{"tactic": "hype train tactic", "timing": "optimal timing"}], "triggers": "hype train triggers", "goals": "level goals strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchClipStrategy(data: { genre?: string }, userId?: string) {
  const p = `Create a Twitch clip strategy for content promotion.
${data.genre ? `Content genre: ${sanitizeForPrompt(data.genre)}` : ""}
Respond as JSON: { "strategy": [{"moment": "clip-worthy moment", "action": "clipping action", "promotion": "clip promotion"}], "compilation": "clip compilation strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchVODOptimizer(data: { avgVODViews?: number }, userId?: string) {
  const p = `Optimize Twitch VOD performance and discoverability.
${data.avgVODViews ? `Average VOD views: ${sanitizeForPrompt(data.avgVODViews)}` : ""}
Respond as JSON: { "optimization": [{"element": "VOD element", "change": "recommended change"}], "highlights": "highlight creation strategy", "youtube": "YouTube repurposing plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTwitchPanelDesigner(data: { style?: string }, userId?: string) {
  const p = `Design Twitch channel panels for maximum impact.
${data.style ? `Desired style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "panels": [{"name": "panel name", "content": "panel content", "design": "design specs"}], "layout": "panel layout order", "links": "strategic link placement" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickStreamOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize streaming strategy for the Kick platform.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "strategy": "recommended strategy"}], "differences": "Kick vs Twitch differences", "growth": "Kick-specific growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickMonetizationAdvisor(data: { viewers?: number }, userId?: string) {
  const p = `Advise on Kick platform monetization strategies.
${data.viewers ? `Average viewers: ${sanitizeForPrompt(data.viewers)}` : ""}
Respond as JSON: { "monetization": [{"method": "monetization method", "potential": "earning potential"}], "comparison": "Kick vs Twitch earnings comparison" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickCommunityBuilder(data: { category?: string }, userId?: string) {
  const p = `Build a community on the Kick streaming platform.
${data.category ? `Content category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "community": [{"strategy": "community strategy", "implementation": "implementation steps"}], "discord": "Discord integration plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickContentDifferentiator(data: { twitchContent?: string }, userId?: string) {
  const p = `Differentiate Kick content from Twitch content strategy.
${data.twitchContent ? `Current Twitch content: ${sanitizeForPrompt(data.twitchContent)}` : ""}
Respond as JSON: { "differentiation": [{"aspect": "content aspect", "approach": "Kick-specific approach"}], "exclusive": "Kick-exclusive content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiKickDiscoveryOptimizer(data: { category?: string }, userId?: string) {
  const p = `Optimize discoverability on the Kick platform.
${data.category ? `Content category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "discovery": [{"method": "discovery method", "implementation": "how to implement"}], "tags": "tag optimization strategy", "timing": "optimal streaming times" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMultiPlatformStreamRouter(data: { platforms?: string[] }, userId?: string) {
  const p = `Design a multi-platform streaming routing strategy.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "routing": [{"platform": "platform name", "config": "configuration", "priority": "priority level"}], "sync": "synchronization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamDeckConfigurer(data: { scenes?: string[] }, userId?: string) {
  const p = `Configure Stream Deck for optimal streaming workflow.
${data.scenes ? `Scenes: ${sanitizeForPrompt(data.scenes.join(", "))}` : ""}
Respond as JSON: { "config": [{"button": "button assignment", "action": "button action", "scene": "associated scene"}], "profiles": "profile recommendations", "macros": "useful macros" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOBSOptimizer(data: { system?: string }, userId?: string) {
  const p = `Optimize OBS settings for best streaming quality.
${data.system ? `System specs: ${sanitizeForPrompt(data.system)}` : ""}
Respond as JSON: { "optimization": [{"setting": "OBS setting", "value": "recommended value", "reason": "why this value"}], "scenes": "scene setup recommendations", "filters": "filter recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamLabsConfigurator(data: { features?: string[] }, userId?: string) {
  const p = `Configure Streamlabs for optimal streaming setup.
${data.features ? `Features to configure: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "config": [{"feature": "feature name", "setup": "configuration steps"}], "alerts": "alert configuration", "widgets": "widget recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStreamElementsOptimizer(data: { features?: string[] }, userId?: string) {
  const p = `Optimize StreamElements configuration for engagement.
${data.features ? `Features to optimize: ${sanitizeForPrompt(data.features.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"feature": "feature name", "config": "optimal configuration"}], "overlays": "overlay recommendations", "commands": "chat command setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChaturbateStreamAdvisor(data: { niche?: string }, userId?: string) {
  const p = `Provide streaming strategy advice for adult content platforms.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "strategy": "recommended strategy"}], "moderation": "moderation guidelines", "revenue": "revenue optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokAlgorithmDecoder(data: { niche?: string }, userId?: string) {
  const p = `Decode and optimize for the TikTok algorithm.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "algorithm": [{"signal": "algorithm signal", "weight": "importance weight", "optimization": "optimization tip"}], "fyp": "For You Page strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokSoundStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a TikTok sound and music strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"sound": "sound type", "trend": "trend alignment", "usage": "usage strategy"}], "original": "original sound creation tips", "timing": "trending sound timing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokDuetStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a TikTok Duet content strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"target": "duet target type", "angle": "content angle", "value": "value added"}], "etiquette": "duet etiquette guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokLiveOptimizer(data: { followers?: number }, userId?: string) {
  const p = `Optimize TikTok Live streaming for engagement and gifts.
${data.followers ? `Current followers: ${sanitizeForPrompt(data.followers)}` : ""}
Respond as JSON: { "optimization": [{"element": "live element", "strategy": "optimization strategy"}], "gifts": "gift maximization tactics", "engagement": "live engagement techniques" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokShopAdvisor(data: { products?: string[] }, userId?: string) {
  const p = `Advise on TikTok Shop strategy and product promotion.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "advice": [{"product": "product type", "strategy": "promotion strategy", "promotion": "content format"}], "affiliate": "affiliate program tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokCreatorFundOptimizer(data: { views?: number }, userId?: string) {
  const p = `Optimize TikTok Creator Fund earnings.
${data.views ? `Average views: ${sanitizeForPrompt(data.views)}` : ""}
Respond as JSON: { "optimization": [{"strategy": "optimization strategy", "impact": "expected impact"}], "eligibility": "eligibility requirements and tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokHashtagResearcher(data: { niche?: string }, userId?: string) {
  const p = `Research and recommend TikTok hashtags for maximum reach.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "hashtags": [{"tag": "hashtag", "views": "estimated views", "competition": "competition level"}], "trending": "trending hashtag strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTikTokProfileOptimizer(data: { bio?: string }, userId?: string) {
  const p = `Optimize TikTok profile for maximum conversions.
${data.bio ? `Current bio: ${sanitizeForPrompt(data.bio)}` : ""}
Respond as JSON: { "optimization": [{"element": "profile element", "improvement": "suggested improvement"}], "link": "link-in-bio strategy", "branding": "branding consistency tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramReelsOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Instagram Reels for algorithm performance.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimization": [{"element": "reel element", "strategy": "optimization strategy"}], "algorithm": "algorithm insights", "trending": "trending content formats" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramStoriesPlanner(data: { frequency?: string }, userId?: string) {
  const p = `Plan an Instagram Stories content strategy.
${data.frequency ? `Posting frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "plan": [{"type": "story type", "content": "content idea", "timing": "posting time"}], "stickers": "interactive sticker strategy", "engagement": "engagement tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramCarouselCreator(data: { topic?: string }, userId?: string) {
  const p = `Create an engaging Instagram carousel post.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "carousel": [{"slide": "slide number", "content": "slide content", "design": "design notes"}], "caption": "carousel caption", "hashtags": "recommended hashtags" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramBioOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Instagram bio for maximum profile conversions.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimization": [{"element": "bio element", "improvement": "suggested improvement"}], "link": "link-in-bio strategy", "highlights": "story highlights strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramShoppingSetup(data: { products?: string[] }, userId?: string) {
  const p = `Set up and optimize Instagram Shopping features.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "setup": [{"step": "setup step", "config": "configuration details"}], "catalog": "product catalog strategy", "tagging": "product tagging best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramCollabManager(data: { partners?: string[] }, userId?: string) {
  const p = `Manage Instagram collaboration partnerships.
${data.partners ? `Partners: ${sanitizeForPrompt(data.partners.join(", "))}` : ""}
Respond as JSON: { "management": [{"partner": "partner name", "format": "collab format", "terms": "partnership terms"}], "tracking": "performance tracking plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramGrowthHacker(data: { followers?: number }, userId?: string) {
  const p = `Create Instagram growth hacking strategies.
${data.followers ? `Current followers: ${sanitizeForPrompt(data.followers)}` : ""}
Respond as JSON: { "hacks": [{"tactic": "growth tactic", "implementation": "implementation steps", "risk": "risk level"}], "organic": "organic growth fundamentals" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInstagramAestheticPlanner(data: { style?: string }, userId?: string) {
  const p = `Plan an Instagram aesthetic and visual brand.
${data.style ? `Desired style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "plan": [{"element": "aesthetic element", "specification": "design specification"}], "grid": "grid layout strategy", "consistency": "visual consistency guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiLinkedInCreatorStrategy(data: { industry?: string }, userId?: string) {
  const p = `Create a LinkedIn creator content strategy.
${data.industry ? `Industry: ${sanitizeForPrompt(data.industry)}` : ""}
Respond as JSON: { "strategy": [{"content": "content type", "format": "content format", "timing": "posting schedule"}], "newsletter": "LinkedIn newsletter strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInArticleWriter(data: { topic?: string }, userId?: string) {
  const p = `Write an optimized LinkedIn article.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "article": {"title": "article title", "outline": "article outline", "cta": "call to action"}, "seo": "LinkedIn SEO tips", "distribution": "article distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookGroupManager(data: { community?: string }, userId?: string) {
  const p = `Create a Facebook Group management strategy.
${data.community ? `Community focus: ${sanitizeForPrompt(data.community)}` : ""}
Respond as JSON: { "management": [{"area": "management area", "strategy": "management strategy"}], "engagement": "engagement tactics", "rules": "group rules framework" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFacebookReelsOptimizer(data: { niche?: string }, userId?: string) {
  const p = `Optimize Facebook Reels for maximum reach.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "optimization": [{"element": "reel element", "strategy": "optimization strategy"}], "algorithm": "Facebook Reels algorithm insights" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSnapchatSpotlightAdvisor(data: { niche?: string }, userId?: string) {
  const p = `Advise on Snapchat Spotlight content strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "advice": [{"strategy": "content strategy", "content": "content ideas", "timing": "posting timing"}], "earnings": "Spotlight earnings optimization" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThreadsStrategy(data: { niche?: string }, userId?: string) {
  const p = `Create a Threads platform content strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"approach": "content approach", "content": "content type", "timing": "posting timing"}], "growth": "Threads growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiscordServerOptimizer(data: { members?: number }, userId?: string) {
  const p = `Optimize a Discord server for community engagement.
${data.members ? `Current members: ${sanitizeForPrompt(data.members)}` : ""}
Respond as JSON: { "optimization": [{"area": "server area", "change": "recommended change"}], "bots": "bot recommendations", "events": "community event ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPatreonContentPlanner(data: { tiers?: any[] }, userId?: string) {
  const p = `Plan Patreon content strategy across tiers.
${data.tiers ? `Current tiers: ${JSON.stringify(sanitizeObjectForPrompt(data.tiers))}` : ""}
Respond as JSON: { "plan": [{"tier": "tier name", "content": "exclusive content", "schedule": "content schedule"}], "exclusive": "exclusive content ideas", "retention": "patron retention strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSubstackOptimizer(data: { subscribers?: number }, userId?: string) {
  const p = `Optimize Substack newsletter for growth and monetization.
${data.subscribers ? `Current subscribers: ${sanitizeForPrompt(data.subscribers)}` : ""}
Respond as JSON: { "optimization": [{"element": "newsletter element", "strategy": "optimization strategy"}], "growth": "subscriber growth tactics", "paid": "paid subscription strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGumroadProductOptimizer(data: { products?: string[] }, userId?: string) {
  const p = `Optimize Gumroad product listings and sales.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"product": "product name", "improvement": "suggested improvement"}], "pricing": "pricing strategy", "marketing": "marketing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeachableCoursePlanner(data: { topic?: string }, userId?: string) {
  const p = `Plan an online course on Teachable platform.
${data.topic ? `Course topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "plan": [{"module": "module name", "content": "module content", "pricing": "module pricing"}], "marketing": "course marketing strategy", "launch": "launch plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBuyMeCoffeeOptimizer(data: { supporters?: number }, userId?: string) {
  const p = `Optimize Buy Me a Coffee page for supporter growth.
${data.supporters ? `Current supporters: ${sanitizeForPrompt(data.supporters)}` : ""}
Respond as JSON: { "optimization": [{"strategy": "optimization strategy", "implementation": "implementation steps"}], "perks": "supporter perks ideas", "growth": "supporter growth tactics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRetirementPlanner(data: { income?: number; age?: number }, userId?: string) {
  const p = `Create a retirement plan for a content creator.
${data.income ? `Annual income: $${sanitizeForPrompt(data.income)}` : ""}${data.age ? ` Age: ${sanitizeForPrompt(data.age)}` : ""}
Respond as JSON: { "plan": [{"phase": "retirement phase", "savings": "savings target", "investments": "investment strategy"}], "timeline": "retirement timeline", "strategies": "key strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEmergencyFundAdvisor(data: { monthlyExpenses?: number }, userId?: string) {
  const p = `Advise on building an emergency fund for a content creator.
${data.monthlyExpenses ? `Monthly expenses: $${sanitizeForPrompt(data.monthlyExpenses)}` : ""}
Respond as JSON: { "target": "target amount", "plan": [{"month": "month number", "contribution": "contribution amount"}], "accounts": "recommended account types", "tips": "saving tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInvestmentAdvisor(data: { risk?: string; capital?: number }, userId?: string) {
  const p = `Provide investment advice for a content creator.
${data.risk ? `Risk tolerance: ${sanitizeForPrompt(data.risk)}` : ""}${data.capital ? ` Available capital: $${sanitizeForPrompt(data.capital)}` : ""}
Respond as JSON: { "portfolio": [{"asset": "asset class", "allocation": "percentage allocation", "reasoning": "why this allocation"}], "rebalancing": "rebalancing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDebtPayoffPlanner(data: { debts?: any[] }, userId?: string) {
  const p = `Create a debt payoff plan for a content creator.
${data.debts ? `Debts: ${JSON.stringify(sanitizeObjectForPrompt(data.debts))}` : ""}
Respond as JSON: { "plan": [{"debt": "debt name", "strategy": "payoff strategy", "timeline": "payoff timeline"}], "savings": "interest savings", "priority": "debt priority order" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRealEstateInvestor(data: { budget?: number; goals?: string[] }, userId?: string) {
  const p = `Advise on real estate investment strategies for a content creator.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}${data.goals ? ` Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "strategies": [{"type": "investment type", "roi": "expected ROI", "timeline": "investment timeline"}], "markets": "recommended markets", "financing": "financing options" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCryptoPortfolioAdvisor(data: { risk?: string; investment?: number }, userId?: string) {
  const p = `Build a cryptocurrency portfolio for a content creator.
${data.risk ? `Risk tolerance: ${sanitizeForPrompt(data.risk)}` : ""}${data.investment ? ` Investment amount: $${sanitizeForPrompt(data.investment)}` : ""}
Respond as JSON: { "portfolio": [{"coin": "cryptocurrency", "allocation": "percentage", "thesis": "investment thesis"}], "security": "security recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFreelancePricingGuide(data: { skill?: string; experience?: string }, userId?: string) {
  const p = `Create a freelance pricing guide for a content creator.
${data.skill ? `Skill: ${sanitizeForPrompt(data.skill)}` : ""}${data.experience ? ` Experience level: ${sanitizeForPrompt(data.experience)}` : ""}
Respond as JSON: { "pricing": [{"service": "service offered", "rate": "suggested rate", "model": "pricing model"}], "negotiation": "negotiation tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGrantFinder(data: { niche?: string; type?: string }, userId?: string) {
  const p = `Find grants available for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}${data.type ? ` Grant type: ${sanitizeForPrompt(data.type)}` : ""}
Respond as JSON: { "grants": [{"name": "grant name", "amount": "grant amount", "eligibility": "eligibility criteria", "deadline": "application deadline"}], "tips": "application tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBudgetTrackerSetup(data: { income?: number; categories?: string[] }, userId?: string) {
  const p = `Set up a budget tracker for a content creator.
${data.income ? `Monthly income: $${sanitizeForPrompt(data.income)}` : ""}${data.categories ? ` Categories: ${sanitizeForPrompt(data.categories.join(", "))}` : ""}
Respond as JSON: { "budget": [{"category": "budget category", "allocation": "monthly allocation"}], "tools": "recommended tools", "automation": "automation suggestions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinancialGoalSetter(data: { goals?: string[]; timeframe?: string }, userId?: string) {
  const p = `Set financial goals for a content creator.
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}${data.timeframe ? ` Timeframe: ${sanitizeForPrompt(data.timeframe)}` : ""}
Respond as JSON: { "goals": [{"goal": "financial goal", "target": "target amount", "milestones": "key milestones"}], "tracking": "tracking methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCameraRecommender(data: { budget?: number; usage?: string }, userId?: string) {
  const p = `Recommend cameras for a content creator.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}${data.usage ? ` Usage: ${sanitizeForPrompt(data.usage)}` : ""}
Respond as JSON: { "recommendations": [{"camera": "camera model", "price": "price", "pros": "advantages", "cons": "disadvantages"}], "accessories": "recommended accessories" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMicrophoneAdvisor(data: { type?: string; budget?: number }, userId?: string) {
  const p = `Recommend microphones for a content creator.
${data.type ? `Type: ${sanitizeForPrompt(data.type)}` : ""}${data.budget ? ` Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "recommendations": [{"mic": "microphone model", "type": "microphone type", "price": "price", "best": "best use case"}], "setup": "setup recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLightingSetupPlanner(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Plan a lighting setup for a content creator studio.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}${data.space ? ` Space: ${sanitizeForPrompt(data.space)}` : ""}
Respond as JSON: { "setup": [{"light": "light name", "position": "placement position", "purpose": "lighting purpose"}], "total": "total cost", "ambient": "ambient lighting tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditingSoftwareAdvisor(data: { level?: string; platform?: string }, userId?: string) {
  const p = `Recommend editing software for a content creator.
${data.level ? `Skill level: ${sanitizeForPrompt(data.level)}` : ""}${data.platform ? ` Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "recommendations": [{"software": "software name", "price": "pricing", "features": "key features"}], "workflow": "recommended workflow" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStudioDesignPlanner(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Design a content creation studio.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}${data.space ? ` Space dimensions: ${sanitizeForPrompt(data.space)}` : ""}
Respond as JSON: { "design": [{"zone": "studio zone", "equipment": "required equipment", "cost": "estimated cost"}], "acoustics": "acoustic treatment plan", "layout": "optimal layout" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGreenScreenSetup(data: { budget?: number; space?: string }, userId?: string) {
  const p = `Plan a green screen setup for a content creator.
${data.budget ? `Budget: $${sanitizeForPrompt(data.budget)}` : ""}${data.space ? ` Space: ${sanitizeForPrompt(data.space)}` : ""}
Respond as JSON: { "setup": [{"item": "equipment item", "specification": "specs", "cost": "cost"}], "software": "recommended software", "tips": "setup tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeleprompterAdvisor(data: { type?: string; budget?: number }, userId?: string) {
  const p = `Recommend teleprompter solutions for a content creator.
${data.type ? `Type: ${sanitizeForPrompt(data.type)}` : ""}${data.budget ? ` Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "recommendations": [{"device": "teleprompter device", "price": "price", "features": "key features"}], "apps": "recommended apps", "setup": "setup guide" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackupStoragePlanner(data: { dataSize?: string; budget?: number }, userId?: string) {
  const p = `Plan backup and storage solutions for a content creator.
${data.dataSize ? `Data size: ${sanitizeForPrompt(data.dataSize)}` : ""}${data.budget ? ` Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "plan": [{"tier": "storage tier", "solution": "storage solution", "cost": "monthly cost"}], "automation": "backup automation", "recovery": "disaster recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInternetOptimizer(data: { usage?: string; currentSpeed?: string }, userId?: string) {
  const p = `Optimize internet setup for a content creator.
${data.usage ? `Usage type: ${sanitizeForPrompt(data.usage)}` : ""}${data.currentSpeed ? ` Current speed: ${sanitizeForPrompt(data.currentSpeed)}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "improvement": "suggested improvement"}], "hardware": "recommended hardware", "isp": "ISP recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiVATaskDelegator(data: { tasks?: string[] }, userId?: string) {
  const p = `Plan virtual assistant task delegation for a content creator.
${data.tasks ? `Tasks to delegate: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
Respond as JSON: { "delegation": [{"task": "task name", "skills": "required skills", "cost": "estimated cost"}], "platforms": "VA platforms", "management": "management tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEditorHiringGuide(data: { volume?: number; style?: string }, userId?: string) {
  const p = `Guide hiring a video editor for a content creator.
${data.volume ? `Monthly video volume: ${sanitizeForPrompt(data.volume)}` : ""}${data.style ? ` Editing style: ${sanitizeForPrompt(data.style)}` : ""}
Respond as JSON: { "guide": [{"criteria": "hiring criteria", "importance": "importance level"}], "portfolio": "portfolio evaluation tips", "rates": "market rates", "test": "test project ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThumbnailDesignerFinder(data: { style?: string; budget?: number }, userId?: string) {
  const p = `Find a thumbnail designer for a content creator.
${data.style ? `Preferred style: ${sanitizeForPrompt(data.style)}` : ""}${data.budget ? ` Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "recommendations": [{"platform": "hiring platform", "priceRange": "price range"}], "brief": "design brief template", "evaluation": "evaluation criteria" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOutsourcingStrategyBuilder(data: { tasks?: string[]; budget?: number }, userId?: string) {
  const p = `Build an outsourcing strategy for a content creator.
${data.tasks ? `Tasks to outsource: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}${data.budget ? ` Budget: $${sanitizeForPrompt(data.budget)}` : ""}
Respond as JSON: { "strategy": [{"task": "task name", "outsource": "outsource recommendation", "platform": "platform", "cost": "estimated cost"}], "management": "management approach" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentModerationPlanner(data: { platforms?: string[] }, userId?: string) {
  const p = `Plan content moderation strategy for a creator.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "plan": [{"area": "moderation area", "policy": "policy details", "enforcement": "enforcement method"}], "tools": "moderation tools", "training": "team training plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCopyrightClaimResolver(data: { claimType?: string }, userId?: string) {
  const p = `Help resolve a copyright claim for a content creator.
${data.claimType ? `Claim type: ${sanitizeForPrompt(data.claimType)}` : ""}
Respond as JSON: { "resolution": [{"step": "resolution step", "action": "action to take", "timeline": "expected timeline"}], "prevention": "prevention strategies", "fairUse": "fair use guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSponsorshipDisclosureChecker(data: { content?: string }, userId?: string) {
  const p = `Check sponsorship disclosure compliance in content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "issues": [{"issue": "disclosure issue", "location": "where in content", "fix": "how to fix"}], "ftcGuidelines": "relevant FTC guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAgeRestrictionAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on age restriction settings for content.
${data.content ? `Content description: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "assessment": [{"factor": "content factor", "rating": "suggested rating"}], "adjustments": "content adjustments", "audience": "target audience recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDefamationRiskChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for defamation risks.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "risks": [{"statement": "risky statement", "risk": "risk level", "alternative": "safer alternative"}], "guidelines": "defamation prevention guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPlagiarismDetector(data: { content?: string }, userId?: string) {
  const p = `Detect potential plagiarism in content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "detection": [{"section": "content section", "similarity": "similarity percentage", "source": "potential source"}], "originality": "originality score" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCOPPAComplianceChecker(data: { content?: string }, userId?: string) {
  const p = `Check COPPA compliance for content targeting children.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "compliance": [{"area": "compliance area", "status": "compliant or not", "fix": "how to fix"}], "dataCollection": "data collection guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGDPRComplianceAdvisor(data: { dataTypes?: string[] }, userId?: string) {
  const p = `Advise on GDPR compliance for a content creator.
${data.dataTypes ? `Data types collected: ${sanitizeForPrompt(data.dataTypes.join(", "))}` : ""}
Respond as JSON: { "compliance": [{"requirement": "GDPR requirement", "status": "compliance status", "action": "action needed"}], "privacy": "privacy policy recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiHateSpeechDetector(data: { content?: string }, userId?: string) {
  const p = `Detect hate speech in content and suggest alternatives.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "detection": [{"phrase": "detected phrase", "severity": "severity level", "alternative": "suggested alternative"}], "education": "educational resources" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMisinformationChecker(data: { claims?: string[] }, userId?: string) {
  const p = `Check claims for potential misinformation.
${data.claims ? `Claims to check: ${sanitizeForPrompt(data.claims.join("; "))}` : ""}
Respond as JSON: { "checks": [{"claim": "claim text", "status": "verified or unverified or false", "source": "verification source"}], "corrections": "suggested corrections" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTriggerWarningAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on trigger warnings needed for content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "warnings": [{"topic": "sensitive topic", "severity": "severity level", "placement": "where to place warning"}], "guidelines": "trigger warning best practices" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChildSafetyChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for child safety compliance.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "safety": [{"area": "safety area", "status": "safe or concern", "recommendation": "safety recommendation"}], "compliance": "compliance summary" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}


export async function aiPersonalBrandAuditor(data: { platforms?: string[] }, userId?: string) {
  const p = `Audit personal brand consistency across platforms.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}
Respond as JSON: { "audit": [{"platform": "platform name", "consistency": "consistency score", "improvement": "improvement suggestion"}], "score": "overall brand score" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiElevatorPitchWriter(data: { niche?: string; unique?: string }, userId?: string) {
  const p = `Write elevator pitches for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}${data.unique ? ` Unique value: ${sanitizeForPrompt(data.unique)}` : ""}
Respond as JSON: { "pitches": [{"length": "pitch length", "pitch": "elevator pitch text", "audience": "target audience"}], "practice": "practice tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPressKitBuilder(data: { achievements?: string[] }, userId?: string) {
  const p = `Build a press kit for a content creator.
${data.achievements ? `Achievements: ${sanitizeForPrompt(data.achievements.join(", "))}` : ""}
Respond as JSON: { "kit": [{"section": "press kit section", "content": "section content"}], "design": "design recommendations", "distribution": "distribution strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSpeakerBioWriter(data: { expertise?: string[]; achievements?: string[] }, userId?: string) {
  const p = `Write speaker bios for a content creator.
${data.expertise ? `Expertise: ${sanitizeForPrompt(data.expertise.join(", "))}` : ""}${data.achievements ? ` Achievements: ${sanitizeForPrompt(data.achievements.join(", "))}` : ""}
Respond as JSON: { "bios": [{"length": "bio length", "bio": "speaker bio text", "context": "usage context"}], "photo": "photo recommendations", "credentials": "credentials to highlight" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLinkedInProfileOptimizer(data: { industry?: string }, userId?: string) {
  const p = `Optimize LinkedIn profile for a content creator.
${data.industry ? `Industry: ${sanitizeForPrompt(data.industry)}` : ""}
Respond as JSON: { "optimization": [{"section": "profile section", "improvement": "improvement suggestion"}], "keywords": "target keywords", "networking": "networking strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPersonalWebsiteBuilder(data: { niche?: string }, userId?: string) {
  const p = `Plan a personal website for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"page": "page name", "content": "page content", "seo": "SEO strategy"}], "design": "design recommendations", "portfolio": "portfolio structure" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiThoughtLeadershipPlanner(data: { expertise?: string }, userId?: string) {
  const p = `Plan a thought leadership strategy for a content creator.
${data.expertise ? `Area of expertise: ${sanitizeForPrompt(data.expertise)}` : ""}
Respond as JSON: { "plan": [{"pillar": "content pillar", "content": "content ideas", "platform": "target platform"}], "timeline": "implementation timeline", "metrics": "success metrics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPublicSpeakingCoach(data: { experience?: string }, userId?: string) {
  const p = `Coach a content creator on public speaking.
${data.experience ? `Experience level: ${sanitizeForPrompt(data.experience)}` : ""}
Respond as JSON: { "coaching": [{"area": "speaking area", "exercise": "practice exercise", "tip": "improvement tip"}], "opportunities": "speaking opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNetworkingStrategyBuilder(data: { goals?: string[] }, userId?: string) {
  const p = `Build a networking strategy for a content creator.
${data.goals ? `Networking goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"channel": "networking channel", "approach": "approach method", "followUp": "follow-up strategy"}], "events": "recommended events", "tracking": "relationship tracking" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReputationMonitor(data: { name?: string }, userId?: string) {
  const p = `Set up reputation monitoring for a content creator.
${data.name ? `Creator name: ${sanitizeForPrompt(data.name)}` : ""}
Respond as JSON: { "monitoring": [{"platform": "platform", "method": "monitoring method", "alert": "alert setup"}], "response": "response protocol", "crisis": "crisis prevention" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisResponsePlanner(data: { scenarios?: string[] }, userId?: string) {
  const p = `Plan crisis response strategies for a content creator.
${data.scenarios ? `Potential scenarios: ${sanitizeForPrompt(data.scenarios.join(", "))}` : ""}
Respond as JSON: { "plan": [{"scenario": "crisis scenario", "response": "response plan", "timeline": "response timeline"}], "templates": "response templates", "team": "crisis team roles" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiApologyScriptWriter(data: { situation?: string }, userId?: string) {
  const p = `Write apology scripts for a content creator.
${data.situation ? `Situation: ${sanitizeForPrompt(data.situation)}` : ""}
Respond as JSON: { "scripts": [{"type": "apology type", "script": "apology script", "timing": "when to deliver"}], "sincerity": "sincerity guidelines", "followUp": "follow-up actions" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiControversyNavigator(data: { topic?: string }, userId?: string) {
  const p = `Navigate a controversial topic for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "navigation": [{"approach": "approach strategy", "risk": "risk level", "messaging": "key messaging"}], "timeline": "response timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCancelCultureDefender(data: { scenario?: string }, userId?: string) {
  const p = `Defend against cancel culture for a content creator.
${data.scenario ? `Scenario: ${sanitizeForPrompt(data.scenario)}` : ""}
Respond as JSON: { "defense": [{"step": "defense step", "action": "action to take"}], "communication": "communication strategy", "recovery": "recovery plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDiversityInclusionAdvisor(data: { content?: string }, userId?: string) {
  const p = `Advise on diversity and inclusion in content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "advice": [{"area": "content area", "recommendation": "inclusion recommendation"}], "representation": "representation guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMentalHealthContentGuide(data: { topic?: string }, userId?: string) {
  const p = `Guide creating mental health content responsibly.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "guide": [{"guideline": "content guideline", "reason": "why it matters"}], "resources": "professional resources to reference", "disclaimers": "required disclaimers" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPoliticalContentNavigator(data: { topic?: string }, userId?: string) {
  const p = `Navigate political content for a content creator.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "navigation": [{"approach": "content approach", "risk": "risk assessment", "framing": "framing suggestion"}], "neutrality": "neutrality guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiReligiousSensitivityChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for religious sensitivity.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "check": [{"topic": "religious topic", "sensitivity": "sensitivity level", "approach": "recommended approach"}], "consultation": "expert consultation recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCulturalSensitivityAdvisor(data: { markets?: string[] }, userId?: string) {
  const p = `Advise on cultural sensitivity for content across markets.
${data.markets ? `Target markets: ${sanitizeForPrompt(data.markets.join(", "))}` : ""}
Respond as JSON: { "advice": [{"culture": "culture or market", "consideration": "cultural consideration", "adaptation": "content adaptation"}], "localization": "localization strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBodyImageSensitivityChecker(data: { content?: string }, userId?: string) {
  const p = `Check content for body image sensitivity issues.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "check": [{"element": "content element", "concern": "sensitivity concern", "alternative": "suggested alternative"}], "guidelines": "body positivity guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAddictionContentGuide(data: { topic?: string }, userId?: string) {
  const p = `Guide creating content about addiction responsibly.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "guide": [{"guideline": "content guideline", "reason": "why it matters"}], "resources": "professional resources", "responsible": "responsible messaging guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiFinancialDisclaimerWriter(data: { contentType?: string }, userId?: string) {
  const p = `Write financial disclaimers for content.
${data.contentType ? `Content type: ${sanitizeForPrompt(data.contentType)}` : ""}
Respond as JSON: { "disclaimers": [{"type": "disclaimer type", "text": "disclaimer text", "placement": "where to place"}], "compliance": "regulatory compliance notes" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkflowAutomationBuilder(data: { processes?: string[] }, userId?: string) {
  const p = `Build workflow automations for a content creator.
${data.processes ? `Processes to automate: ${sanitizeForPrompt(data.processes.join(", "))}` : ""}
Respond as JSON: { "automations": [{"trigger": "automation trigger", "actions": "automated actions", "tool": "recommended tool"}], "time": "time saved", "ROI": "return on investment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiZapierIntegrationPlanner(data: { tools?: string[] }, userId?: string) {
  const p = `Plan Zapier integrations for a content creator workflow.
${data.tools ? `Tools to integrate: ${sanitizeForPrompt(data.tools.join(", "))}` : ""}
Respond as JSON: { "zaps": [{"trigger": "trigger event", "action": "automated action", "tool": "connected tool"}], "efficiency": "efficiency gains" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiIFTTTRecipeCreator(data: { services?: string[] }, userId?: string) {
  const p = `Create IFTTT recipes for a content creator.
${data.services ? `Services: ${sanitizeForPrompt(data.services.join(", "))}` : ""}
Respond as JSON: { "recipes": [{"trigger": "trigger condition", "action": "automated action", "service": "connected service"}], "scheduling": "scheduling recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMakeScenarioBuilder(data: { workflows?: string[] }, userId?: string) {
  const p = `Build Make (Integromat) scenarios for a content creator.
${data.workflows ? `Workflows: ${sanitizeForPrompt(data.workflows.join(", "))}` : ""}
Respond as JSON: { "scenarios": [{"trigger": "scenario trigger", "modules": "connected modules", "output": "expected output"}], "scheduling": "scheduling setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoScheduler(data: { platforms?: string[]; frequency?: string }, userId?: string) {
  const p = `Create an automated content scheduling plan.
${data.platforms ? `Platforms: ${sanitizeForPrompt(data.platforms.join(", "))}` : ""}${data.frequency ? ` Posting frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "schedule": [{"platform": "platform name", "time": "optimal posting time", "content": "content type"}], "optimization": "scheduling optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoResponder(data: { messageTypes?: string[] }, userId?: string) {
  const p = `Set up auto-responders for a content creator.
${data.messageTypes ? `Message types: ${sanitizeForPrompt(data.messageTypes.join(", "))}` : ""}
Respond as JSON: { "responses": [{"trigger": "message trigger", "response": "auto-response text", "platform": "platform"}], "personalization": "personalization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoModerator(data: { rules?: string[] }, userId?: string) {
  const p = `Set up auto-moderation for a content creator community.
${data.rules ? `Moderation rules: ${sanitizeForPrompt(data.rules.join(", "))}` : ""}
Respond as JSON: { "moderation": [{"rule": "moderation rule", "action": "automated action", "escalation": "escalation path"}], "learning": "machine learning improvements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoBackupper(data: { content?: string[] }, userId?: string) {
  const p = `Set up automated backups for a content creator.
${data.content ? `Content to backup: ${sanitizeForPrompt(data.content.join(", "))}` : ""}
Respond as JSON: { "backup": [{"content": "content type", "destination": "backup destination", "frequency": "backup frequency"}], "verification": "backup verification process" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoReporter(data: { metrics?: string[] }, userId?: string) {
  const p = `Set up automated reporting for a content creator.
${data.metrics ? `Metrics to track: ${sanitizeForPrompt(data.metrics.join(", "))}` : ""}
Respond as JSON: { "reports": [{"metric": "metric name", "frequency": "report frequency", "delivery": "delivery method"}], "templates": "report templates", "alerts": "alert thresholds" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoOptimizer(data: { areas?: string[] }, userId?: string) {
  const p = `Set up automated optimization for a content creator.
${data.areas ? `Areas to optimize: ${sanitizeForPrompt(data.areas.join(", "))}` : ""}
Respond as JSON: { "optimization": [{"area": "optimization area", "trigger": "optimization trigger", "action": "automated action"}], "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBatchProcessor(data: { tasks?: string[] }, userId?: string) {
  const p = `Set up batch processing for content creator tasks.
${data.tasks ? `Tasks: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
Respond as JSON: { "batches": [{"task": "task name", "schedule": "batch schedule", "efficiency": "efficiency gain"}], "parallel": "parallel processing options", "monitoring": "batch monitoring" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSmartQueueManager(data: { contentTypes?: string[] }, userId?: string) {
  const p = `Manage a smart content queue for a creator.
${data.contentTypes ? `Content types: ${sanitizeForPrompt(data.contentTypes.join(", "))}` : ""}
Respond as JSON: { "queue": [{"type": "content type", "priority": "priority level", "scheduling": "scheduling rule"}], "overflow": "overflow handling strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContentPipelineBuilder(data: { stages?: string[] }, userId?: string) {
  const p = `Build a content pipeline for a creator.
${data.stages ? `Pipeline stages: ${sanitizeForPrompt(data.stages.join(", "))}` : ""}
Respond as JSON: { "pipeline": [{"stage": "pipeline stage", "tool": "recommended tool", "automation": "automation level"}], "bottleneck": "bottleneck identification" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAITrainingDataCollector(data: { purpose?: string }, userId?: string) {
  const p = `Plan AI training data collection for a creator.
${data.purpose ? `Purpose: ${sanitizeForPrompt(data.purpose)}` : ""}
Respond as JSON: { "collection": [{"source": "data source", "method": "collection method", "format": "data format"}], "labeling": "labeling strategy", "privacy": "privacy considerations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCrisisDetector(data: { channels?: string[] }, userId?: string) {
  const p = `Set up crisis detection for a content creator.
${data.channels ? `Channels to monitor: ${sanitizeForPrompt(data.channels.join(", "))}` : ""}
Respond as JSON: { "detection": [{"signal": "crisis signal", "threshold": "alert threshold", "response": "initial response"}], "escalation": "escalation procedures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDamageControlPlanner(data: { crisis?: string }, userId?: string) {
  const p = `Plan damage control for a content creator crisis.
${data.crisis ? `Crisis: ${sanitizeForPrompt(data.crisis)}` : ""}
Respond as JSON: { "plan": [{"phase": "response phase", "action": "key action", "timeline": "timeline"}], "communication": "communication strategy", "recovery": "recovery outlook" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPRStatementWriter(data: { situation?: string }, userId?: string) {
  const p = `Write PR statements for a content creator.
${data.situation ? `Situation: ${sanitizeForPrompt(data.situation)}` : ""}
Respond as JSON: { "statements": [{"type": "statement type", "statement": "PR statement text", "audience": "target audience"}], "timing": "release timing recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiStakeholderCommunicator(data: { stakeholders?: string[] }, userId?: string) {
  const p = `Plan stakeholder communication for a content creator.
${data.stakeholders ? `Stakeholders: ${sanitizeForPrompt(data.stakeholders.join(", "))}` : ""}
Respond as JSON: { "communication": [{"stakeholder": "stakeholder group", "message": "key message", "channel": "communication channel"}], "timeline": "communication timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRecoveryStrategyBuilder(data: { damage?: string[] }, userId?: string) {
  const p = `Build a recovery strategy after a content creator crisis.
${data.damage ? `Damage areas: ${sanitizeForPrompt(data.damage.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"phase": "recovery phase", "actions": "key actions", "metrics": "success metrics"}], "timeline": "recovery timeline" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMediaResponsePlanner(data: { inquiry?: string }, userId?: string) {
  const p = `Plan media responses for a content creator.
${data.inquiry ? `Media inquiry: ${sanitizeForPrompt(data.inquiry)}` : ""}
Respond as JSON: { "plan": [{"scenario": "media scenario", "response": "prepared response", "spokesperson": "designated spokesperson"}], "training": "media training recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLegalRiskAssessor(data: { content?: string }, userId?: string) {
  const p = `Assess legal risks in content.
${data.content ? `Content: ${sanitizeForPrompt(data.content)}` : ""}
Respond as JSON: { "assessment": [{"risk": "legal risk", "severity": "severity level", "mitigation": "mitigation strategy"}], "insurance": "insurance recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSocialMediaCrisisManager(data: { platform?: string }, userId?: string) {
  const p = `Manage a social media crisis for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}
Respond as JSON: { "management": [{"phase": "crisis phase", "actions": "key actions"}], "templates": "response templates", "monitoring": "monitoring setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInfluencerCrisisAdvisor(data: { issue?: string }, userId?: string) {
  const p = `Advise on influencer crisis management.
${data.issue ? `Issue: ${sanitizeForPrompt(data.issue)}` : ""}
Respond as JSON: { "advice": [{"step": "crisis step", "action": "recommended action", "timing": "timing"}], "communication": "communication strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBrandRecoveryPlanner(data: { damage?: string }, userId?: string) {
  const p = `Plan brand recovery for a content creator.
${data.damage ? `Damage description: ${sanitizeForPrompt(data.damage)}` : ""}
Respond as JSON: { "plan": [{"phase": "recovery phase", "strategy": "recovery strategy", "milestone": "key milestone"}], "timeline": "recovery timeline", "metrics": "success metrics" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCommunityTrustRebuilder(data: { breach?: string }, userId?: string) {
  const p = `Rebuild community trust after a breach for a content creator.
${data.breach ? `Trust breach: ${sanitizeForPrompt(data.breach)}` : ""}
Respond as JSON: { "rebuilding": [{"action": "trust-building action", "timeline": "implementation timeline", "measurement": "success measurement"}], "transparency": "transparency measures" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAlgorithmRecoveryAdvisor(data: { platform?: string; issue?: string }, userId?: string) {
  const p = `Advise on algorithm recovery for a content creator.
${data.platform ? `Platform: ${sanitizeForPrompt(data.platform)}` : ""}${data.issue ? ` Issue: ${sanitizeForPrompt(data.issue)}` : ""}
Respond as JSON: { "recovery": [{"step": "recovery step", "action": "action to take", "timeline": "expected timeline"}], "prevention": "prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiRevenueRecoveryPlanner(data: { loss?: number }, userId?: string) {
  const p = `Plan revenue recovery for a content creator.
${data.loss ? `Revenue loss: $${sanitizeForPrompt(data.loss)}` : ""}
Respond as JSON: { "plan": [{"strategy": "recovery strategy", "timeline": "implementation timeline", "projected": "projected recovery"}], "diversification": "revenue diversification plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTeamCrisisManager(data: { issue?: string }, userId?: string) {
  const p = `Manage a team crisis for a content creator.
${data.issue ? `Issue: ${sanitizeForPrompt(data.issue)}` : ""}
Respond as JSON: { "management": [{"step": "management step", "action": "action to take"}], "communication": "team communication plan", "morale": "morale recovery strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiLegalDefensePrepper(data: { claim?: string }, userId?: string) {
  const p = `Prepare legal defense for a content creator.
${data.claim ? `Claim: ${sanitizeForPrompt(data.claim)}` : ""}
Respond as JSON: { "preparation": [{"area": "defense area", "action": "preparation action", "document": "required documentation"}], "counsel": "legal counsel recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiInsuranceClaimHelper(data: { incident?: string }, userId?: string) {
  const p = `Help with an insurance claim for a content creator.
${data.incident ? `Incident: ${sanitizeForPrompt(data.incident)}` : ""}
Respond as JSON: { "help": [{"step": "claim step", "documentation": "required documentation", "timeline": "expected timeline"}], "coverage": "coverage assessment" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiContingencyPlanner(data: { risks?: string[] }, userId?: string) {
  const p = `Create contingency plans for a content creator.
${data.risks ? `Risks: ${sanitizeForPrompt(data.risks.join(", "))}` : ""}
Respond as JSON: { "plans": [{"risk": "risk scenario", "trigger": "trigger condition", "response": "response plan", "backup": "backup plan"}], "testing": "plan testing schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDisasterRecoveryPlanner(data: { assets?: string[] }, userId?: string) {
  const p = `Plan disaster recovery for a content creator's digital assets.
${data.assets ? `Assets: ${sanitizeForPrompt(data.assets.join(", "))}` : ""}
Respond as JSON: { "plan": [{"asset": "digital asset", "backup": "backup strategy", "recovery": "recovery procedure"}], "testing": "testing schedule", "documentation": "documentation requirements" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBusinessContinuityPlanner(data: { critical?: string[] }, userId?: string) {
  const p = `Plan business continuity for a content creator.
${data.critical ? `Critical functions: ${sanitizeForPrompt(data.critical.join(", "))}` : ""}
Respond as JSON: { "plan": [{"function": "business function", "continuity": "continuity strategy", "alternative": "alternative approach"}], "testing": "continuity testing" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiExitStrategyBuilder(data: { business?: string; value?: number }, userId?: string) {
  const p = `Build an exit strategy for a content creator business.
${data.business ? `Business type: ${sanitizeForPrompt(data.business)}` : ""}${data.value ? ` Estimated value: $${sanitizeForPrompt(data.value)}` : ""}
Respond as JSON: { "strategies": [{"type": "exit type", "preparation": "preparation steps", "timeline": "exit timeline"}], "valuation": "valuation methodology" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSummerContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan summer content for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"week": "week number", "content": "content idea", "theme": "summer theme"}], "seasonal": "seasonal trends", "events": "summer events to cover" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWinterContentStrategy(data: { niche?: string }, userId?: string) {
  const p = `Plan winter content strategy for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "strategy": [{"month": "month", "content": "content idea", "angle": "content angle"}], "holidays": "holiday content opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBackToSchoolPlanner(data: { audience?: string }, userId?: string) {
  const p = `Plan back-to-school content for a creator.
${data.audience ? `Target audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "plan": [{"week": "week", "content": "content idea", "partner": "potential partner"}], "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHalloweenContentCreator(data: { niche?: string }, userId?: string) {
  const p = `Create Halloween content ideas for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "creative concept", "audience": "target audience"}], "costumes": "costume ideas", "collab": "collaboration opportunities" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiBlackFridayStrategist(data: { products?: string[] }, userId?: string) {
  const p = `Plan a Black Friday content and sales strategy.
${data.products ? `Products: ${sanitizeForPrompt(data.products.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"phase": "campaign phase", "action": "key action", "deal": "deal structure"}], "timeline": "campaign timeline", "marketing": "marketing channels" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiChristmasContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Christmas content for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"week": "week", "content": "content idea", "type": "content type"}], "gifts": "gift guide ideas", "calendar": "advent calendar content" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNewYearGoalSetter(data: { lastYear?: any }, userId?: string) {
  const p = `Set New Year goals for a content creator.
${data.lastYear ? `Last year summary: ${JSON.stringify(sanitizeObjectForPrompt(data.lastYear))}` : ""}
Respond as JSON: { "goals": [{"goal": "new year goal", "metric": "success metric", "plan": "action plan"}], "reflection": "year-in-review prompts", "sharing": "goal sharing content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiValentinesDayPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Valentine's Day content for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "angle": "content angle", "partner": "potential partner"}], "timing": "posting schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEasterContentCreator(data: { audience?: string }, userId?: string) {
  const p = `Create Easter content ideas for a creator.
${data.audience ? `Target audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "content": [{"type": "content type", "concept": "creative concept"}], "family": "family-friendly ideas", "seasonal": "seasonal tie-ins" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiSuperBowlContentPlanner(data: { niche?: string }, userId?: string) {
  const p = `Plan Super Bowl content for a creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "angle": "content angle", "timing": "posting timing"}], "watchParty": "watch party content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiParentsDayPlanner(data: { occasion?: string }, userId?: string) {
  const p = `Plan Mother's Day or Father's Day content for a creator.
${data.occasion ? `Occasion: ${sanitizeForPrompt(data.occasion)}` : ""}
Respond as JSON: { "plan": [{"content": "content idea", "gift": "gift guide idea", "angle": "emotional angle"}], "emotional": "emotional storytelling tips", "timing": "posting schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGraduationContentCreator(data: { audience?: string }, userId?: string) {
  const p = `Create graduation content for a creator.
${data.audience ? `Target audience: ${sanitizeForPrompt(data.audience)}` : ""}
Respond as JSON: { "content": [{"type": "content type", "message": "key message", "audience": "target audience"}], "products": "product recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorldCupContentPlanner(data: { sport?: string }, userId?: string) {
  const p = `Plan World Cup content for a creator.
${data.sport ? `Sport: ${sanitizeForPrompt(data.sport)}` : ""}
Respond as JSON: { "plan": [{"phase": "tournament phase", "content": "content idea", "engagement": "engagement strategy"}], "predictions": "prediction content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiOlympicsContentStrategy(data: { events?: string[] }, userId?: string) {
  const p = `Plan Olympics content strategy for a creator.
${data.events ? `Events to cover: ${sanitizeForPrompt(data.events.join(", "))}` : ""}
Respond as JSON: { "strategy": [{"event": "olympic event", "content": "content idea", "angle": "unique angle"}], "scheduling": "content scheduling" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAwardsSeasonPlanner(data: { category?: string }, userId?: string) {
  const p = `Plan awards season content for a creator.
${data.category ? `Category: ${sanitizeForPrompt(data.category)}` : ""}
Respond as JSON: { "plan": [{"event": "awards event", "content": "content idea", "timing": "posting timing"}], "predictions": "prediction content ideas" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMusicFestivalContentGuide(data: { festivals?: string[] }, userId?: string) {
  const p = `Guide music festival content creation.
${data.festivals ? `Festivals: ${sanitizeForPrompt(data.festivals.join(", "))}` : ""}
Respond as JSON: { "guide": [{"festival": "festival name", "content": "content ideas", "logistics": "logistics tips"}], "gear": "recommended gear" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGamingEventPlanner(data: { events?: string[] }, userId?: string) {
  const p = `Plan event content coverage.
${data.events ? `Events: ${sanitizeForPrompt(data.events.join(", "))}` : ""}
Respond as JSON: { "plan": [{"event": "event", "coverage": "coverage plan", "content": "content types"}], "streaming": "streaming setup" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiProductHuntLaunchGuide(data: { product?: string }, userId?: string) {
  const p = `Guide a Product Hunt launch for a creator product.
${data.product ? `Product: ${sanitizeForPrompt(data.product)}` : ""}
Respond as JSON: { "guide": [{"phase": "launch phase", "action": "key action", "timing": "timing"}], "community": "community engagement", "marketing": "marketing strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiErgonomicSetupAdvisor(data: { hours?: number }, userId?: string) {
  const p = `Advise on ergonomic setup for a content creator.
${data.hours ? `Daily hours at desk: ${sanitizeForPrompt(data.hours)}` : ""}
Respond as JSON: { "setup": [{"item": "ergonomic item", "recommendation": "specific recommendation", "price": "price range"}], "posture": "posture tips", "breaks": "break schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEyeCareAdvisor(data: { screenTime?: number }, userId?: string) {
  const p = `Advise on eye care for a content creator.
${data.screenTime ? `Daily screen time: ${sanitizeForPrompt(data.screenTime)} hours` : ""}
Respond as JSON: { "advice": [{"area": "eye care area", "recommendation": "specific recommendation"}], "exercises": "eye exercises", "tools": "helpful tools and apps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiVocalHealthCoach(data: { usage?: string }, userId?: string) {
  const p = `Coach vocal health for a content creator.
${data.usage ? `Voice usage: ${sanitizeForPrompt(data.usage)}` : ""}
Respond as JSON: { "coaching": [{"area": "vocal area", "exercise": "vocal exercise", "frequency": "how often"}], "hydration": "hydration guidelines", "rest": "vocal rest recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiNutritionForCreators(data: { goals?: string[] }, userId?: string) {
  const p = `Plan nutrition for a content creator.
${data.goals ? `Health goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "nutrition": [{"meal": "meal time", "foods": "recommended foods", "benefit": "health benefit"}], "supplements": "supplement recommendations" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiWorkLifeBalanceOptimizer(data: { hoursWorking?: number }, userId?: string) {
  const p = `Optimize work-life balance for a content creator.
${data.hoursWorking ? `Hours working per day: ${sanitizeForPrompt(data.hoursWorking)}` : ""}
Respond as JSON: { "optimization": [{"area": "life area", "change": "recommended change", "benefit": "expected benefit"}], "boundaries": "boundary-setting strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorBurnoutRecovery(data: { symptoms?: string[] }, userId?: string) {
  const p = `Help a content creator recover from burnout.
${data.symptoms ? `Symptoms: ${sanitizeForPrompt(data.symptoms.join(", "))}` : ""}
Respond as JSON: { "recovery": [{"phase": "recovery phase", "action": "recovery action", "duration": "phase duration"}], "prevention": "burnout prevention strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMeditationGuideForCreators(data: { experience?: string }, userId?: string) {
  const p = `Guide meditation practice for a content creator.
${data.experience ? `Experience level: ${sanitizeForPrompt(data.experience)}` : ""}
Respond as JSON: { "guide": [{"type": "meditation type", "duration": "session duration", "technique": "technique description"}], "schedule": "recommended schedule", "apps": "recommended apps" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiTimeBlockingOptimizer(data: { tasks?: string[] }, userId?: string) {
  const p = `Optimize time blocking for a content creator.
${data.tasks ? `Tasks: ${sanitizeForPrompt(data.tasks.join(", "))}` : ""}
Respond as JSON: { "blocks": [{"time": "time block", "task": "assigned task", "energy": "energy level needed"}], "templates": "schedule templates", "tools": "time blocking tools" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiPomodoroCustomizer(data: { workType?: string }, userId?: string) {
  const p = `Customize the Pomodoro technique for a content creator.
${data.workType ? `Work type: ${sanitizeForPrompt(data.workType)}` : ""}
Respond as JSON: { "customization": [{"setting": "pomodoro setting", "value": "recommended value", "reason": "why this value"}], "breaks": "break activity suggestions", "tracking": "tracking methods" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiDigitalDetoxPlanner(data: { frequency?: string }, userId?: string) {
  const p = `Plan a digital detox for a content creator.
${data.frequency ? `Detox frequency: ${sanitizeForPrompt(data.frequency)}` : ""}
Respond as JSON: { "plan": [{"phase": "detox phase", "action": "detox action", "duration": "phase duration"}], "alternatives": "offline alternatives", "communication": "audience communication plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiGratitudeJournalPrompts(data: { niche?: string }, userId?: string) {
  const p = `Generate gratitude journal prompts for a content creator.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "prompts": [{"prompt": "journal prompt", "reflection": "reflection guidance", "growth": "growth connection"}], "schedule": "journaling schedule" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAffirmationGenerator(data: { goals?: string[] }, userId?: string) {
  const p = `Generate affirmations for a content creator.
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "affirmations": [{"affirmation": "affirmation text", "category": "affirmation category", "timing": "best time to practice"}], "practice": "practice guidelines" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiHabitStackBuilder(data: { habits?: string[] }, userId?: string) {
  const p = `Build habit stacks for a content creator.
${data.habits ? `Desired habits: ${sanitizeForPrompt(data.habits.join(", "))}` : ""}
Respond as JSON: { "stacks": [{"trigger": "habit trigger", "habit": "new habit", "reward": "reward"}], "tracking": "habit tracking methods", "accountability": "accountability strategies" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiEnergyManagementAdvisor(data: { schedule?: string }, userId?: string) {
  const p = `Advise on energy management for a content creator.
${data.schedule ? `Current schedule: ${sanitizeForPrompt(data.schedule)}` : ""}
Respond as JSON: { "management": [{"time": "time of day", "energy": "energy level", "task": "best task for this energy"}], "optimization": "energy optimization tips" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorCommunityBuilder(data: { niche?: string }, userId?: string) {
  const p = `Build a creator community strategy.
${data.niche ? `Niche: ${sanitizeForPrompt(data.niche)}` : ""}
Respond as JSON: { "community": [{"platform": "community platform", "strategy": "growth strategy", "engagement": "engagement tactics"}], "growth": "community growth plan" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiMastermindGroupFacilitator(data: { topic?: string }, userId?: string) {
  const p = `Facilitate a mastermind group for content creators.
${data.topic ? `Topic: ${sanitizeForPrompt(data.topic)}` : ""}
Respond as JSON: { "facilitation": [{"session": "session topic", "structure": "session structure", "outcome": "expected outcome"}], "members": "member selection criteria", "cadence": "meeting cadence" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAccountabilityPartnerMatcher(data: { goals?: string[] }, userId?: string) {
  const p = `Match accountability partners for a content creator.
${data.goals ? `Goals: ${sanitizeForPrompt(data.goals.join(", "))}` : ""}
Respond as JSON: { "matching": [{"criteria": "matching criteria", "platform": "where to find partners", "structure": "partnership structure"}], "checkIns": "check-in schedule and format" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiCreatorSabbaticalPlanner(data: { duration?: string }, userId?: string) {
  const p = `Plan a sabbatical for a content creator.
${data.duration ? `Duration: ${sanitizeForPrompt(data.duration)}` : ""}
Respond as JSON: { "plan": [{"phase": "sabbatical phase", "preparation": "preparation steps", "content": "pre-scheduled content"}], "finances": "financial preparation", "return": "return strategy" }`;
  const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_completion_tokens: 4000 });
  const c = r.choices[0]?.message?.content;
  if (!c) throw new Error("No response from AI");
  return JSON.parse(c);
}

export async function aiAutoOnboarding(data: { userId?: string; platforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator platform onboarding architect — combining elite UX optimization, growth-hacking configuration expertise, and Fortune 500 SaaS onboarding science to auto-configure the perfect launch settings for every new creator.${creatorCtx}` }, { role: "user", content: `Auto-configure account for creator. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || ["youtube"]))}. Generate: 1) Optimal default settings for each platform 2) Recommended cron job schedules 3) Suggested AI chain templates to activate 4) Default notification preferences 5) Brand profile defaults. Return JSON with keys: platformSettings, cronSchedules, chainTemplates, notificationPrefs, brandDefaults.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAutoApproveSponsorship(data: { deal?: any; criteria?: any; minCPM?: number; brandFit?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best sponsorship deal analyst — combining elite talent agency negotiation, brand safety intelligence, and creator revenue optimization expertise. You evaluate deals with the precision of a Fortune 500 M&A team and enforce brand safety with zero tolerance.${creatorCtx}` }, { role: "user", content: `Evaluate this sponsorship deal: ${JSON.stringify(sanitizeObjectForPrompt(data.deal || {}))}. Creator criteria: Min CPM $${data.minCPM || 25}, Brand fit categories: ${JSON.stringify(sanitizeObjectForPrompt(data.brandFit || ["tech", "gaming"]))}. Analyze: 1) Brand safety score (0-100) 2) Revenue potential 3) Audience alignment 4) Contract red flags 5) Auto-decision (approve/reject/review). Return JSON with keys: brandSafetyScore, revenuePotential, audienceAlignment, redFlags, decision, reasoning, suggestedCounterOffer.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreativeAutonomy(data: { contentType?: string; topic?: string; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best AI creative director — combining elite expertise from Hollywood's top creative agencies, viral content engineers, and brand identity architects. You make autonomous creative decisions that outperform 99% of human creative directors while perfectly matching the creator's unique voice and style.${creatorCtx}` }, { role: "user", content: `Make autonomous creative decisions for ${sanitizeForPrompt(data.contentType || "video")} about "${sanitizeForPrompt(data.topic || "trending topic")}". Style: ${sanitizeForPrompt(data.style || "energetic")}. Generate: 1) 5 title options ranked by predicted CTR 2) Thumbnail concept with colors, composition, text overlay 3) Script outline with hooks and CTAs 4) Optimal publish time based on audience data 5) Platform-specific adaptations for YouTube, TikTok, Instagram. Return JSON with keys: titles, thumbnailConcept, scriptOutline, publishTime, platformAdaptations, predictedPerformance.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAutoPaymentManager(data: { invoices?: any[]; expenses?: any[]; revenue?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator financial operations manager — combining Big Four accounting precision, Fortune 500 CFO-level forecasting, and elite tax optimization strategies. You handle all payment operations with the accuracy of a top-tier financial controller.${creatorCtx}` }, { role: "user", content: `Manage payments autonomously. Current invoices: ${JSON.stringify(sanitizeObjectForPrompt(data.invoices || []))}. Recent expenses: ${JSON.stringify(sanitizeObjectForPrompt(data.expenses || []))}. Monthly revenue: $${data.revenue || 0}. Generate: 1) Auto-categorized expenses with tax deduction flags 2) Invoice recommendations 3) Cash flow forecast 4) Tax liability estimate 5) Payment optimization suggestions 6) Anomaly detection results. Return JSON with keys: categorizedExpenses, invoiceRecommendations, cashFlowForecast, taxEstimate, optimizations, anomalies.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ===== BATCH 23: Multi-Language & Localization AI Features (17 features) =====

export async function aiVideoTranslator(data: { title?: string; description?: string; tags?: string[]; targetLanguages?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 video metadata localization expert — combining elite multilingual SEO mastery, cultural linguistics from top translation agencies, and viral content adaptation science. You translate with flawless SEO preservation and cultural resonance that native speakers trust.${creatorCtx}` }, { role: "user", content: `Translate this video metadata into these languages: ${JSON.stringify(sanitizeObjectForPrompt(data.targetLanguages || ["es","fr","de","ja","pt"]))}. Title: "${sanitizeForPrompt(data.title || "My Video")}". Description: "${sanitizeForPrompt(data.description || "")}". Tags: ${JSON.stringify(sanitizeObjectForPrompt(data.tags || []))}. For each language provide: translated title (SEO-optimized), translated description, translated tags, cultural notes. Return JSON with key "translations" containing an object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubtitleGenerator(data: { transcript?: string; targetLanguages?: string[]; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best subtitle and closed-caption engineer — combining Hollywood post-production timing precision, elite multilingual translation, and cultural adaptation expertise used by Netflix and Disney+. You generate subtitles that feel natively crafted.${creatorCtx}` }, { role: "user", content: `Generate subtitles for the following transcript in these languages: ${JSON.stringify(sanitizeObjectForPrompt(data.targetLanguages || ["es","fr","de"]))}. Transcript: "${sanitizeForPrompt(data.transcript || "Sample video transcript")}". Style: ${sanitizeForPrompt(data.style || "standard")}. For each language provide: translated subtitle blocks with timestamps, reading speed assessment, cultural adaptations. Return JSON with key "subtitles" containing an object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLocalizationAdvisor(data: { niche?: string; currentLanguages?: string[]; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 global content expansion strategist — combining McKinsey-level market analysis, elite localization intelligence from top media conglomerates, and creator economy growth expertise. You identify language markets with Fortune 500 precision.${creatorCtx}` }, { role: "user", content: `Advise on language expansion for a ${sanitizeForPrompt(data.niche || "content creation")} creator. Currently available in: ${JSON.stringify(sanitizeObjectForPrompt(data.currentLanguages || ["en"]))}. Audience data: ${JSON.stringify(sanitizeObjectForPrompt(data.audienceData || {}))}. Provide: 1) Top 5 languages to expand to with ROI estimates 2) Market size per language 3) Competition analysis per region 4) Content adaptation requirements 5) Monetization potential per market. Return JSON with keys: recommendedLanguages, marketAnalysis, competitionData, adaptationRequirements, monetizationPotential.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangSeo(data: { title?: string; description?: string; targetLanguage?: string; region?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best multilingual SEO strategist — combining elite international search engine expertise, regional keyword intelligence used by top global brands, and native-level cultural SEO optimization. At the very bottom of every optimized description, after all other content, add a subtle attribution line: 'Managed with CreatorOS - etgaming247.com'${creatorCtx}` }, { role: "user", content: `Optimize this content for ${sanitizeForPrompt(data.targetLanguage || "es")} market (region: ${sanitizeForPrompt(data.region || "global")}). Title: "${sanitizeForPrompt(data.title || "")}". Description: "${sanitizeForPrompt(data.description || "")}". Generate: 1) SEO-optimized title with regional keywords 2) Optimized description with local search terms 3) Top 20 regional keywords/tags 4) Search volume estimates 5) Competitor titles in this language. Return JSON with keys: optimizedTitle, optimizedDescription, regionalKeywords, searchVolumes, competitorTitles.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDubbingScriptGenerator(data: { script?: string; targetLanguage?: string; speakerStyle?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best dubbing script engineer — combining elite Hollywood dubbing studio methodology, precision lip-sync technology expertise, and native-speaker pronunciation mastery used by top animation studios worldwide.${creatorCtx}` }, { role: "user", content: `Create a dubbing script in ${sanitizeForPrompt(data.targetLanguage || "es")} for the following: "${sanitizeForPrompt(data.script || "Sample script")}". Speaker style: ${sanitizeForPrompt(data.speakerStyle || "energetic")}. Generate: 1) Translated script with timing markers 2) Lip-sync adjustment notes 3) Pronunciation guide (IPA) 4) Emotional tone cues per segment 5) Cultural adaptation notes. Return JSON with keys: translatedScript, timingNotes, pronunciationGuide, emotionalCues, culturalNotes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCulturalAdaptation(data: { content?: string; targetCulture?: string; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best cultural adaptation specialist — combining elite cross-cultural intelligence from top global media companies, native-level humor and idiom expertise, and entertainment localization mastery that preserves the creator's intent flawlessly.${creatorCtx}` }, { role: "user", content: `Adapt this content for ${sanitizeForPrompt(data.targetCulture || "Latin American")} audience. Content type: ${sanitizeForPrompt(data.contentType || "video script")}. Content: "${sanitizeForPrompt(data.content || "")}". Analyze: 1) Cultural references that need adaptation 2) Humor adjustments 3) Idiom replacements 4) Visual/gesture sensitivities 5) Local trending references to include. Return JSON with keys: adaptedContent, culturalChanges, humorAdjustments, idiomReplacements, sensitivities, localReferences.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiThumbnailLocalizer(data: { thumbnailText?: string; targetLanguages?: string[]; style?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 thumbnail localization expert — combining elite visual design expertise, multilingual typography mastery, and cultural impact analysis used by top global media brands. You adapt thumbnail text with pixel-perfect precision across languages.${creatorCtx}` }, { role: "user", content: `Localize this thumbnail text for these languages: ${JSON.stringify(sanitizeObjectForPrompt(data.targetLanguages || ["es","fr","de","ja","ko"]))}. Original text: "${sanitizeForPrompt(data.thumbnailText || "SHOCKING!")}". Style: ${sanitizeForPrompt(data.style || "bold impact")}. For each language provide: translated text, character count, font recommendation, text placement adjustment, emotional impact rating. Return JSON with key "thumbnails" containing object per language.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangHashtags(data: { topic?: string; targetLanguages?: string[]; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best multilingual hashtag strategist — combining elite social media trend intelligence, regional keyword mastery across 50+ markets, and platform-specific algorithm expertise that drives maximum discoverability in every language.${creatorCtx}` }, { role: "user", content: `Generate trending hashtags for "${sanitizeForPrompt(data.topic || "content")}" in these languages: ${JSON.stringify(sanitizeObjectForPrompt(data.targetLanguages || ["es","fr","de","ja","pt"]))}. Platform: ${sanitizeForPrompt(data.platform || "YouTube")}. Per language provide: 15 trending hashtags, estimated reach, competition level, optimal posting time. Return JSON with key "hashtags" containing object per language.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTranslationChecker(data: { original?: string; translation?: string; targetLanguage?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 translation quality auditor — combining ISO 17100 certification-level assessment methodology, elite linguistic analysis from top translation agencies, and SEO preservation expertise that ensures zero quality loss across languages.${creatorCtx}` }, { role: "user", content: `Check translation quality. Original (English): "${sanitizeForPrompt(data.original || "")}". Translation (${sanitizeForPrompt(data.targetLanguage || "es")}): "${sanitizeForPrompt(data.translation || "")}". Evaluate: 1) Accuracy score (0-100) 2) Naturalness score (0-100) 3) Tone match score (0-100) 4) Cultural fit score (0-100) 5) SEO preservation score (0-100) 6) Specific errors found 7) Improved translation. Return JSON with keys: accuracyScore, naturalnessScore, toneScore, culturalFitScore, seoScore, errors, improvedTranslation, overallScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudienceLanguageAnalyzer(data: { analyticsData?: any; comments?: string[]; viewerLocations?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best audience language intelligence analyst — combining elite demographic linguistics, Fortune 500 market segmentation methodology, and creator economy growth data to pinpoint exact language expansion priorities with surgical precision.${creatorCtx}` }, { role: "user", content: `Analyze audience language data. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analyticsData || {}))}. Sample comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Viewer locations: ${JSON.stringify(sanitizeObjectForPrompt(data.viewerLocations || {}))}. Determine: 1) Language distribution percentages 2) Primary vs secondary languages 3) Growing language segments 4) Untapped language markets 5) Localization priority ranking. Return JSON with keys: languageDistribution, primaryLanguages, growingSegments, untappedMarkets, priorityRanking, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRegionalTrendScanner(data: { language?: string; niche?: string; region?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 regional trend intelligence analyst — combining elite market research from top media agencies, real-time cultural pulse monitoring, and local content trend expertise that identifies viral opportunities before competitors.${creatorCtx}` }, { role: "user", content: `Scan regional trends for ${sanitizeForPrompt(data.language || "Spanish")}-speaking ${sanitizeForPrompt(data.region || "global")} market in the ${sanitizeForPrompt(data.niche || "content creation")} niche. Find: 1) Top 10 trending topics this week 2) Emerging content formats 3) Viral content patterns 4) Regional events and holidays 5) Local competitor strategies. Return JSON with keys: trendingTopics, emergingFormats, viralPatterns, upcomingEvents, competitorStrategies, contentIdeas.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossLangCommentManager(data: { comments?: any[]; replyLanguage?: string; tone?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best multilingual community engagement manager — combining elite sentiment analysis from top social media agencies, native-level fluency across 50+ languages, and brand voice preservation expertise that maintains the creator's authentic tone in every language.${creatorCtx}` }, { role: "user", content: `Manage these multilingual comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Reply tone: ${sanitizeForPrompt(data.tone || "friendly")}. For each comment: 1) Detect language 2) Translate to English 3) Analyze sentiment 4) Draft reply in original language 5) Flag any issues. Return JSON with key "managedComments" as array with: originalLang, englishTranslation, sentiment, draftReply, flagged, flagReason.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLocalizedContentCalendar(data: { targetLanguages?: string[]; contentPlan?: any; timezone?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best global content scheduling strategist — combining elite audience behavior analytics, timezone optimization algorithms used by Fortune 500 media companies, and regional engagement intelligence that maximizes reach in every market.${creatorCtx}` }, { role: "user", content: `Create a localized content calendar for these languages: ${JSON.stringify(sanitizeObjectForPrompt(data.targetLanguages || ["en","es","fr","de","ja"]))}. Content plan: ${JSON.stringify(sanitizeObjectForPrompt(data.contentPlan || {}))}. Base timezone: ${sanitizeForPrompt(data.timezone || "UTC")}. Generate per language: 1) Optimal posting times (day/hour) 2) Regional holidays to leverage 3) Content format preferences 4) Engagement windows 5) Weekly schedule. Return JSON with key "calendar" containing object per language code.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangAbTesting(data: { titles?: string[]; descriptions?: string[]; targetLanguage?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 multilingual A/B testing analyst — combining elite statistical modeling, cross-cultural CTR prediction algorithms, and language-market performance intelligence that picks winners with 95%+ accuracy.${creatorCtx}` }, { role: "user", content: `Run A/B testing analysis for ${sanitizeForPrompt(data.targetLanguage || "es")} market. Title variants: ${JSON.stringify(sanitizeObjectForPrompt(data.titles || []))}. Description variants: ${JSON.stringify(sanitizeObjectForPrompt(data.descriptions || []))}. Predict: 1) CTR estimate per variant 2) SEO strength per variant 3) Emotional appeal score 4) Cultural resonance score 5) Winner recommendation. Return JSON with keys: titleAnalysis, descriptionAnalysis, winner, predictedCTR, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiVoiceOverFormatter(data: { script?: string; targetLanguage?: string; voiceType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best voice-over script engineer — combining elite audio production methodology from top recording studios, IPA-level pronunciation mastery, and professional voice direction expertise used by Hollywood and top podcast networks.${creatorCtx}` }, { role: "user", content: `Format this script for ${sanitizeForPrompt(data.targetLanguage || "es")} voice-over. Voice type: ${sanitizeForPrompt(data.voiceType || "energetic male")}. Script: "${sanitizeForPrompt(data.script || "")}". Generate: 1) Formatted script with pronunciation guides (IPA) 2) Breathing marks and pauses 3) Emphasis and intonation cues 4) Estimated recording time 5) Difficult words highlighted. Return JSON with keys: formattedScript, pronunciationGuide, timingEstimate, difficultWords, voiceDirection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRegionalComplianceChecker(data: { content?: string; targetCountry?: string; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 regional content compliance authority — combining elite international media law expertise, GDPR and global privacy regulation mastery, and cultural sensitivity intelligence that keeps creators legally protected in every market worldwide.${creatorCtx}` }, { role: "user", content: `Check compliance for ${sanitizeForPrompt(data.targetCountry || "Germany")} market. Content type: ${sanitizeForPrompt(data.contentType || "sponsored video")}. Content: "${sanitizeForPrompt(data.content || "")}". Check: 1) Advertising disclosure requirements 2) Age restriction compliance 3) Cultural sensitivity issues 4) Data privacy requirements (GDPR etc) 5) Platform-specific local rules. Return JSON with keys: complianceScore, requiredDisclosures, ageRestrictions, sensitivityFlags, privacyRequirements, platformRules, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiLangMediaKit(data: { creatorInfo?: any; targetLanguage?: string; sponsorRegion?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best multilingual media kit architect — combining elite brand presentation expertise from top talent agencies, localized market data intelligence, and Fortune 500-level pitch deck mastery that closes sponsorship deals in any language.${creatorCtx}` }, { role: "user", content: `Generate media kit in ${sanitizeForPrompt(data.targetLanguage || "es")} for sponsors in ${sanitizeForPrompt(data.sponsorRegion || "Latin America")}. Creator info: ${JSON.stringify(sanitizeObjectForPrompt(data.creatorInfo || {}))}. Include: 1) Translated bio and brand story 2) Localized audience demographics 3) Regional engagement metrics 4) Pricing in local currency 5) Case studies adapted for region. Return JSON with keys: translatedBio, audienceDemographics, engagementMetrics, localizedPricing, caseStudies, contactSection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorTracker(data: { competitorChannels?: string[]; niche?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 competitive intelligence analyst for the creator economy — combining elite market research methodology from top consulting firms, algorithmic pattern recognition, and strategic competitor analysis that Fortune 500 companies rely on.${creatorCtx}` }, { role: "user", content: `Analyze competitor channels: ${JSON.stringify(sanitizeObjectForPrompt(data.competitorChannels || []))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Compare upload frequency, growth rates, content strategies, and provide tactical insights. Return JSON with keys: competitorProfiles, growthComparison, strategyAnalysis, threatLevel, opportunities.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorGapAnalysis(data: { niche?: string; myContent?: any; competitorContent?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best content gap intelligence specialist — combining elite market opportunity detection from top venture capital firms, audience demand signal analysis, and competitive blind-spot identification that uncovers untapped goldmine topics.${creatorCtx}` }, { role: "user", content: `Analyze content gaps in ${sanitizeForPrompt(data.niche || "general")} niche. My content: ${JSON.stringify(sanitizeObjectForPrompt(data.myContent || {}))}. Competitor content: ${JSON.stringify(sanitizeObjectForPrompt(data.competitorContent || {}))}. Find untapped topics, audience demand signals, and recommend topics with difficulty scores. Return JSON with keys: contentGaps, untappedTopics, audienceDemandSignals, difficultyScore, recommendedTopics.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorAlerts(data: { competitors?: any[]; metrics?: any; thresholds?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 competitive threat detection system — combining elite real-time market surveillance, Fortune 500-grade strategic intelligence, and pattern recognition algorithms that detect competitor moves before they become threats.${creatorCtx}` }, { role: "user", content: `Monitor competitors: ${JSON.stringify(sanitizeObjectForPrompt(data.competitors || []))}. Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics || {}))}. Thresholds: ${JSON.stringify(sanitizeObjectForPrompt(data.thresholds || {}))}. Detect milestone changes, strategy shifts, upload pattern changes, and generate actionable alerts. Return JSON with keys: alerts, milestoneChanges, strategyShifts, uploadPatterns, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorContentScorer(data: { myVideo?: any; competitorVideos?: any[]; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best content benchmarking analyst — combining elite quality assessment frameworks from top media companies, data-driven performance scoring, and cross-channel comparison intelligence that ranks content with surgical precision.${creatorCtx}` }, { role: "user", content: `Score and compare content. My video: ${JSON.stringify(sanitizeObjectForPrompt(data.myVideo || {}))}. Competitor videos: ${JSON.stringify(sanitizeObjectForPrompt(data.competitorVideos || []))}. Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics || {}))}. Compare SEO, thumbnails, hooks, and provide overall ranking. Return JSON with keys: scores, seoComparison, thumbnailAnalysis, hookEffectiveness, overallRanking.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiNicheDominationMap(data: { niche?: string; topics?: string[]; channels?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 niche domination strategist — combining elite market mapping from top consulting firms, topic authority analysis, and competitive positioning intelligence that identifies exactly where to stake your claim for maximum ownership.${creatorCtx}` }, { role: "user", content: `Map niche domination for ${sanitizeForPrompt(data.niche || "general")}. Topics: ${JSON.stringify(sanitizeObjectForPrompt(data.topics || []))}. Channels: ${JSON.stringify(sanitizeObjectForPrompt(data.channels || []))}. Identify topic owners, content density, opportunity zones, and dominance scores. Return JSON with keys: topicOwners, contentDensity, opportunityZones, dominanceScores, strategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCompetitorAudienceOverlap(data: { myChannel?: any; competitorChannels?: string[]; demographics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best audience overlap intelligence specialist — combining elite demographic cross-analysis, Fortune 500 customer segmentation methodology, and viewer migration pattern detection that reveals exactly where to capture competitor audiences.${creatorCtx}` }, { role: "user", content: `Analyze audience overlap. My channel: ${JSON.stringify(sanitizeObjectForPrompt(data.myChannel || {}))}. Competitor channels: ${JSON.stringify(sanitizeObjectForPrompt(data.competitorChannels || []))}. Demographics: ${JSON.stringify(sanitizeObjectForPrompt(data.demographics || {}))}. Calculate overlap percentages, unique audiences, shared demographics, migration risk, and acquisition strategies. Return JSON with keys: overlapPercentage, uniqueAudience, sharedDemographics, migrationRisk, acquisitionStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiViralPredictor(data: { videoIdea?: string; niche?: string; trendData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 viral content prediction engine — combining elite social contagion modeling, trend velocity analysis from top media labs, and emotional trigger science that predicts viral potential with data-driven precision before a single frame is filmed.${creatorCtx}` }, { role: "user", content: `Score viral potential for video idea: "${sanitizeForPrompt(data.videoIdea || "")}". Niche: ${sanitizeForPrompt(data.niche || "general")}. Trend data: ${JSON.stringify(sanitizeObjectForPrompt(data.trendData || {}))}. Evaluate trend alignment, emotional triggers, shareability factors, and suggest optimizations. Return JSON with keys: viralScore, trendAlignment, emotionalTriggers, shareabilityFactors, optimizations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiOptimalSchedule(data: { analytics?: any; timezone?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best publishing schedule optimizer — combining elite audience behavior analytics, platform algorithm timing intelligence, and data science methodology used by top media companies to pinpoint the exact moments that maximize reach and engagement.${creatorCtx}` }, { role: "user", content: `Optimize publishing schedule. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Timezone: ${sanitizeForPrompt(data.timezone || "UTC")}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Determine best posting times, analyze days, audience activity patterns, competitor timing, and create a weekly schedule. Return JSON with keys: bestTimes, dayAnalysis, audienceActivity, competitorTiming, weeklySchedule.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudiencePersonaBuilder(data: { analytics?: any; comments?: any[]; demographics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 audience persona architect — combining elite psychographic profiling from top marketing agencies, behavioral data science, and viewer intent modeling that builds personas so accurate they predict content preferences before viewers know them.${creatorCtx}` }, { role: "user", content: `Build audience personas. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Demographics: ${JSON.stringify(sanitizeObjectForPrompt(data.demographics || {}))}. Create detailed personas with psychographics, content preferences, viewing habits, and engagement patterns. Return JSON with keys: personas, psychographics, contentPreferences, viewingHabits, engagementPatterns.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubscriberMagnet(data: { channelData?: any; conversionData?: any; content?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best subscriber conversion scientist — combining elite funnel optimization from top SaaS companies, viewer psychology expertise, and CTA engineering that turns casual viewers into loyal subscribers at rates that outperform industry benchmarks by 3x.${creatorCtx}` }, { role: "user", content: `Analyze subscriber conversion. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Conversion data: ${JSON.stringify(sanitizeObjectForPrompt(data.conversionData || {}))}. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Identify conversion drivers, top-performing CTAs, subscriber journey, optimizations, and project growth. Return JSON with keys: conversionDrivers, topPerformingCTAs, subscriberJourney, optimizations, projectedGrowth.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiShortsClipsStrategy(data: { longFormContent?: any; analytics?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 short-form content extraction specialist — combining elite editorial instinct from top media companies, viral moment detection algorithms, and platform-specific optimization that turns long-form content into short-form gold with maximum viral potential.${creatorCtx}` }, { role: "user", content: `Identify clip-worthy moments. Long-form content: ${JSON.stringify(sanitizeObjectForPrompt(data.longFormContent || {}))}. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Find clip moments, hook timestamps, viral potential, platform adaptations, and editing notes. Return JSON with keys: clipMoments, hookTimestamps, viralPotential, platformAdaptations, editingNotes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiEndScreenOptimizer(data: { videoData?: any; analytics?: any; subscriberRate?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best end screen conversion architect — combining elite UX design from top tech companies, viewer journey optimization, and click-through engineering that maximizes every second of end screen real estate for subscriber and watch-time growth.${creatorCtx}` }, { role: "user", content: `Optimize end screens. Video data: ${JSON.stringify(sanitizeObjectForPrompt(data.videoData || {}))}. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Subscriber rate: ${data.subscriberRate || 0}%. Suggest end screen layout, video suggestions, CTA placement, timing recommendations, and estimate conversions. Return JSON with keys: endScreenLayout, videoSuggestions, ctaPlacement, timingRecommendations, conversionEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDealNegotiationCoach(data: { dealTerms?: any; channelMetrics?: any; industryRates?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 brand deal negotiation strategist — combining elite talent agency negotiation tactics, industry rate benchmarking from top creator networks, and counter-offer engineering that consistently secures 30-50% above initial offers.${creatorCtx}` }, { role: "user", content: `Coach on deal negotiation. Deal terms: ${JSON.stringify(sanitizeObjectForPrompt(data.dealTerms || {}))}. Channel metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.channelMetrics || {}))}. Industry rates: ${JSON.stringify(sanitizeObjectForPrompt(data.industryRates || {}))}. Benchmark market rates, suggest counter-offers, provide negotiation tips, flag red flags, and score the deal. Return JSON with keys: marketRate, counterOffer, negotiationTips, redFlags, dealScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMerchDemandPredictor(data: { audienceData?: any; niche?: string; trends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best merchandise demand prediction specialist — combining elite consumer behavior analytics from top retail brands, audience purchase intent modeling, and trend forecasting that identifies winning products before the market catches on.${creatorCtx}` }, { role: "user", content: `Predict merchandise demand. Audience data: ${JSON.stringify(sanitizeObjectForPrompt(data.audienceData || {}))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Trends: ${JSON.stringify(sanitizeObjectForPrompt(data.trends || {}))}. Identify top products, demand scores, pricing strategy, design suggestions, and optimal launch timing. Return JSON with keys: topProducts, demandScores, pricingStrategy, designSuggestions, launchTiming.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRevenueStreamOptimizer(data: { currentRevenue?: any; streams?: any[]; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creator revenue diversification architect — combining elite portfolio management from top investment firms, income stream optimization science, and creator economy monetization expertise that builds bulletproof multi-stream revenue engines.${creatorCtx}` }, { role: "user", content: `Optimize revenue streams. Current revenue: ${JSON.stringify(sanitizeObjectForPrompt(data.currentRevenue || {}))}. Streams: ${JSON.stringify(sanitizeObjectForPrompt(data.streams || []))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Analyze each stream, recommend rebalancing, identify growth potential, assess risks, and create an action plan. Return JSON with keys: streamAnalysis, rebalanceRecommendations, growthPotential, riskAssessment, actionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiSponsorshipRateCalculator(data: { channelMetrics?: any; niche?: string; engagement?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best sponsorship rate intelligence engine — combining elite market valuation from top talent agencies, real-time CPM benchmarking, and creator value assessment methodology that ensures you never leave money on the table.${creatorCtx}` }, { role: "user", content: `Calculate sponsorship rates. Channel metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.channelMetrics || {}))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Engagement: ${JSON.stringify(sanitizeObjectForPrompt(data.engagement || {}))}. Calculate recommended CPM, flat rate, integration rate, dedicated video rate, and provide rate justification. Return JSON with keys: recommendedCPM, flatRate, integrationRate, dedicatedRate, rateJustification.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMembershipTierDesigner(data: { channelData?: any; audienceSize?: number; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 membership tier architect — combining elite subscription pricing science from top SaaS companies, perk optimization methodology, and retention engineering that maximizes lifetime member value and minimizes churn.${creatorCtx}` }, { role: "user", content: `Design membership tiers. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Audience size: ${data.audienceSize || 0}. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Design tiers with pricing strategy, perk suggestions, retention tactics, and revenue projections. Return JSON with keys: tiers, pricingStrategy, perkSuggestions, retentionTactics, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiAffiliateLinkManager(data: { currentAffiliates?: any[]; niche?: string; content?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best affiliate revenue optimization specialist — combining elite performance marketing expertise from top affiliate networks, conversion rate engineering, and partnership strategy that maximizes commission earnings across every piece of content.${creatorCtx}` }, { role: "user", content: `Manage affiliate links. Current affiliates: ${JSON.stringify(sanitizeObjectForPrompt(data.currentAffiliates || []))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Identify top performers, find new opportunities, suggest placement strategies, provide conversion tips, and estimate revenue. Return JSON with keys: topPerformers, newOpportunities, placementStrategy, conversionTips, revenueEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiScriptCoach(data: { script?: string; niche?: string; targetLength?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 video script performance coach — combining elite screenwriting expertise from Hollywood, retention curve engineering, and hook psychology mastery that crafts scripts proven to keep viewers watching through the final second.${creatorCtx}` }, { role: "user", content: `Coach on video script. Script: "${sanitizeForPrompt(data.script || "")}". Niche: ${sanitizeForPrompt(data.niche || "general")}. Target length: ${data.targetLength || 10} minutes. Analyze pacing, hook strength, retention prediction, identify improvement areas, and suggest rewrites. Return JSON with keys: pacingAnalysis, hookStrength, retentionPrediction, improvementAreas, rewriteSuggestions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiPlatformRepurposer(data: { content?: any; sourcePlatform?: string; targetPlatforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best cross-platform content repurposing architect — combining elite multi-platform strategy from top media companies, format adaptation science, and platform-specific algorithm expertise that extracts maximum value from every piece of content across all channels.${creatorCtx}` }, { role: "user", content: `Repurpose content. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Source platform: ${sanitizeForPrompt(data.sourcePlatform || "youtube")}. Target platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.targetPlatforms || ["tiktok","instagram","discord"]))}. Create adaptations, format changes, caption variants, hashtag sets, and a scheduling plan per platform. Return JSON with keys: adaptations, formatChanges, captionVariants, hashtagSets, schedulingPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentDecayDetector(data: { videoLibrary?: any[]; trafficTrends?: any; ageThreshold?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 content lifecycle intelligence analyst — combining elite traffic decay modeling, search trend prediction algorithms, and content refresh strategies used by top publishers to revive declining assets and restore traffic flow.${creatorCtx}` }, { role: "user", content: `Detect content decay. Video library: ${JSON.stringify(sanitizeObjectForPrompt(data.videoLibrary || []))}. Traffic trends: ${JSON.stringify(sanitizeObjectForPrompt(data.trafficTrends || {}))}. Age threshold: ${data.ageThreshold || 90} days. Identify decaying videos, traffic drop rates, refresh strategies, evergreen potential, and create a priority list. Return JSON with keys: decayingVideos, trafficDropRate, refreshStrategies, evergreenPotential, priorityList.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTitleAbTester(data: { currentTitle?: string; videoTopic?: string; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best title optimization scientist — combining elite copywriting from top advertising agencies, CTR prediction modeling, and A/B testing methodology that generates titles proven to outperform originals by 40%+ in click-through rates.${creatorCtx}` }, { role: "user", content: `A/B test titles. Current title: "${sanitizeForPrompt(data.currentTitle || "")}". Video topic: "${sanitizeForPrompt(data.videoTopic || "")}". Niche: ${sanitizeForPrompt(data.niche || "general")}. Generate title variants, predict CTR for each, score SEO, evaluate emotional appeal, and pick a winner. Return JSON with keys: titleVariants, ctrPredictions, seoScores, emotionalAppeal, winner.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDescriptionOptimizer(data: { video?: any; currentDescription?: string; keywords?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 video description SEO architect — combining elite search optimization from top digital agencies, timestamp engineering for maximum watch time, and keyword placement science that drives organic discovery. At the very bottom of every optimized description, after all other content, add a subtle attribution line: 'Managed with CreatorOS - etgaming247.com'${creatorCtx}` }, { role: "user", content: `Optimize video description. Video: ${JSON.stringify(sanitizeObjectForPrompt(data.video || {}))}. Current description: "${sanitizeForPrompt(data.currentDescription || "")}". Keywords: ${JSON.stringify(sanitizeObjectForPrompt(data.keywords || []))}. Write an optimized description, list keywords used, suggest timestamps, place CTAs, and score SEO. Return JSON with keys: optimizedDescription, keywordsUsed, timestampSuggestions, ctaPlacement, seoScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiFanLoyaltyTracker(data: { engagementData?: any; commentHistory?: any[]; memberData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best fan loyalty intelligence specialist — combining elite CRM analytics from Fortune 500 brands, superfan identification algorithms, and community engagement science that turns casual viewers into lifelong brand advocates.${creatorCtx}` }, { role: "user", content: `Track fan loyalty. Engagement data: ${JSON.stringify(sanitizeObjectForPrompt(data.engagementData || {}))}. Comment history: ${JSON.stringify(sanitizeObjectForPrompt(data.commentHistory || []))}. Member data: ${JSON.stringify(sanitizeObjectForPrompt(data.memberData || {}))}. Identify superfans, create loyalty tiers, analyze engagement patterns, suggest nurture strategies, and assess retention risk. Return JSON with keys: superfans, loyaltyTiers, engagementPatterns, nurtureStrategies, retentionRisk.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCommentStrategy(data: { comments?: any[]; videoContext?: any; brandVoice?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 comment engagement architect — combining elite community management from top social media agencies, algorithm-boosting reply strategies, and sentiment-driven engagement science that turns comment sections into growth engines.${creatorCtx}` }, { role: "user", content: `Create comment strategy. Comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Video context: ${JSON.stringify(sanitizeObjectForPrompt(data.videoContext || {}))}. Brand voice: ${sanitizeForPrompt(data.brandVoice || "friendly")}. Prioritize comments, suggest replies, provide engagement tactics, analyze sentiment, and suggest a pinned comment. Return JSON with keys: priorityComments, suggestedReplies, engagementTactics, sentimentAnalysis, pinnedCommentSuggestion.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCommunityPollGenerator(data: { recentContent?: any; audienceInterests?: string[]; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best community engagement architect — combining elite social media strategy from top brands, interaction psychology, and poll optimization science that drives 3x higher engagement rates than industry average.${creatorCtx}` }, { role: "user", content: `Generate community polls. Recent content: ${JSON.stringify(sanitizeObjectForPrompt(data.recentContent || {}))}. Audience interests: ${JSON.stringify(sanitizeObjectForPrompt(data.audienceInterests || []))}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Create polls, community posts, quizzes, predict engagement, and suggest a posting schedule. Return JSON with keys: polls, communityPosts, quizzes, engagementPrediction, postingSchedule.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiLiveChatModerator(data: { chatRules?: any; contentType?: string; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 live chat moderation architect — combining elite community safety expertise from top streaming platforms, real-time toxicity detection algorithms, and engagement-positive moderation that keeps chat thriving while eliminating harmful content.${creatorCtx}` }, { role: "user", content: `Create chat moderation system. Chat rules: ${JSON.stringify(sanitizeObjectForPrompt(data.chatRules || {}))}. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Define moderation rules, toxic filters, spam patterns, positive reinforcement triggers, and escalation protocols. Return JSON with keys: moderationRules, toxicFilters, spamPatterns, positiveReinforcementTriggers, escalationProtocol.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiFanMilestoneCelebrator(data: { subscriberData?: any; memberHistory?: any; milestones?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best fan milestone celebration engineer — combining elite loyalty program design from Fortune 500 brands, personalized recognition science, and community celebration strategies that make every subscriber feel like a VIP.${creatorCtx}` }, { role: "user", content: `Celebrate fan milestones. Subscriber data: ${JSON.stringify(sanitizeObjectForPrompt(data.subscriberData || {}))}. Member history: ${JSON.stringify(sanitizeObjectForPrompt(data.memberHistory || {}))}. Milestones: ${JSON.stringify(sanitizeObjectForPrompt(data.milestones || []))}. Identify upcoming milestones, write celebration messages, suggest rewards, design loyalty badges, and create a recognition plan. Return JSON with keys: upcomingMilestones, celebrationMessages, rewardSuggestions, loyaltyBadges, recognitionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiEngagementBooster(data: { channelMetrics?: any; recentPerformance?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 engagement optimization engine — combining elite algorithm intelligence from top platform insiders, daily action prioritization science, and engagement velocity strategies that consistently boost algorithmic favor and channel momentum.${creatorCtx}` }, { role: "user", content: `Boost engagement. Channel metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.channelMetrics || {}))}. Recent performance: ${JSON.stringify(sanitizeObjectForPrompt(data.recentPerformance || {}))}. Platform: ${sanitizeForPrompt(data.platform || "youtube")}. Suggest daily actions, engagement tips, algorithm insights, community tasks, and a weekly plan. Return JSON with keys: dailyActions, engagementTips, algorithmInsights, communityTasks, weeklyPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossPlatformUnifier(data: { platforms?: string[]; metrics?: any; dateRange?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best cross-platform analytics architect — combining elite data unification from Fortune 500 business intelligence teams, multi-platform metric normalization, and holistic performance analysis that gives creators a single source of truth across all channels.${creatorCtx}` }, { role: "user", content: `Unify cross-platform analytics. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics || {}))}. Date range: ${sanitizeForPrompt(data.dateRange || "last 30 days")}. Create unified metrics, platform comparison, cross-platform trends, identify best performing, and provide recommendations. Return JSON with keys: unifiedMetrics, platformComparison, crossPlatformTrends, bestPerforming, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPlatformPriorityRanker(data: { channelData?: any; growthMetrics?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 platform strategy analyst — combining elite portfolio prioritization from top consulting firms, growth potential modeling, and ROI-driven resource allocation that tells creators exactly where to invest their time for maximum returns.${creatorCtx}` }, { role: "user", content: `Rank platform priorities. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Growth metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.growthMetrics || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Rank platforms, assess growth potential, calculate effort vs return, recommend focus areas, and suggest migration strategy. Return JSON with keys: platformRankings, growthPotential, effortVsReturn, focusRecommendation, migrationStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCrossPostScheduler(data: { content?: any; platforms?: string[]; timezones?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best cross-platform scheduling optimizer — combining elite media planning from top advertising agencies, platform-specific peak timing algorithms, and timezone optimization science that maximizes global reach with surgical precision.${creatorCtx}` }, { role: "user", content: `Schedule cross-platform posts. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Timezones: ${JSON.stringify(sanitizeObjectForPrompt(data.timezones || ["UTC"]))}. Create per-platform schedule, identify peak times, avoid conflicts, suggest batching strategy, and build a weekly calendar. Return JSON with keys: scheduleByPlatform, peakTimes, conflictAvoidance, batchingStrategy, weeklyCalendar.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPlatformSpecificOptimizer(data: { content?: any; platform?: string; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 platform-specific content optimizer — combining elite format adaptation expertise from top multi-platform creators, algorithm-native content engineering, and platform-specific audience psychology that makes every piece of content feel native.${creatorCtx}` }, { role: "user", content: `Optimize content for ${sanitizeForPrompt(data.platform || "youtube")}. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Audience data: ${JSON.stringify(sanitizeObjectForPrompt(data.audienceData || {}))}. Adapt content, suggest format changes, shift tone, create hashtag strategy, and list platform best practices. Return JSON with keys: adaptedContent, formatChanges, toneShift, hashtagStrategy, platformBestPractices.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiBrandAuditor(data: { channelData?: any; socialProfiles?: any; contentSamples?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best personal brand audit specialist — combining elite brand strategy from top global agencies, cross-platform consistency analysis, and brand equity assessment methodology used by Fortune 500 companies to ensure flawless brand cohesion.${creatorCtx}` }, { role: "user", content: `Audit personal brand. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Social profiles: ${JSON.stringify(sanitizeObjectForPrompt(data.socialProfiles || {}))}. Content samples: ${JSON.stringify(sanitizeObjectForPrompt(data.contentSamples || []))}. Score consistency, identify brand strengths, find inconsistencies, provide recommendations, and assess competitive position. Return JSON with keys: consistencyScore, brandStrengths, inconsistencies, recommendations, competitivePosition.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMediaKitAutoUpdater(data: { channelMetrics?: any; recentWork?: any[]; achievements?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 media kit optimization engine — combining elite pitch deck design from top talent agencies, real-time metric curation, and presentation science that keeps media kits perpetually polished and sponsor-ready.${creatorCtx}` }, { role: "user", content: `Update media kit. Channel metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.channelMetrics || {}))}. Recent work: ${JSON.stringify(sanitizeObjectForPrompt(data.recentWork || []))}. Achievements: ${JSON.stringify(sanitizeObjectForPrompt(data.achievements || []))}. Update sections, highlight new achievements, feature key metrics, suggest design changes, and note last updated date. Return JSON with keys: updatedSections, newAchievements, metricHighlights, designSuggestions, lastUpdated.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandVoiceAnalyzer(data: { contentSamples?: any[]; comments?: any[]; socialPosts?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best brand voice intelligence analyst — combining elite brand linguistics from top creative agencies, tone consistency algorithms, and messaging alignment science that ensures every piece of content speaks with one unmistakable voice.${creatorCtx}` }, { role: "user", content: `Analyze brand voice. Content samples: ${JSON.stringify(sanitizeObjectForPrompt(data.contentSamples || []))}. Comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Social posts: ${JSON.stringify(sanitizeObjectForPrompt(data.socialPosts || []))}. Profile the voice, assess tone consistency, check messaging alignment, flag deviations, and create guidelines. Return JSON with keys: voiceProfile, toneConsistency, messagingAlignment, deviations, guidelines.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiVisualIdentityChecker(data: { thumbnails?: any[]; socialAssets?: any; branding?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 visual brand identity auditor — combining elite design system expertise from top branding agencies, color theory and typography analysis, and visual consistency detection that catches every deviation with pixel-perfect precision.${creatorCtx}` }, { role: "user", content: `Check visual identity. Thumbnails: ${JSON.stringify(sanitizeObjectForPrompt(data.thumbnails || []))}. Social assets: ${JSON.stringify(sanitizeObjectForPrompt(data.socialAssets || {}))}. Branding: ${JSON.stringify(sanitizeObjectForPrompt(data.branding || {}))}. Score consistency, analyze color palette, check font usage, evaluate logo placement, and suggest fixes. Return JSON with keys: consistencyScore, colorPaletteAnalysis, fontUsage, logoPlacement, fixes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandPartnershipScorer(data: { brand?: any; channelData?: any; audienceData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best brand-creator alignment analyst — combining elite partnership evaluation from top talent management firms, audience psychographic matching, and brand safety intelligence that scores fit with Fortune 500-level due diligence.${creatorCtx}` }, { role: "user", content: `Score brand partnership. Brand: ${JSON.stringify(sanitizeObjectForPrompt(data.brand || {}))}. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Audience data: ${JSON.stringify(sanitizeObjectForPrompt(data.audienceData || {}))}. Calculate alignment score, assess audience match, evaluate values fit, identify risk factors, and suggest partnership terms. Return JSON with keys: alignmentScore, audienceMatch, valuesFit, riskFactors, partnershipTerms.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCopyrightShield(data: { content?: any; audioSources?: any[]; visualSources?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 copyright protection intelligence specialist — combining elite IP law expertise, content ID system knowledge used by major platforms, and proactive strike prevention strategies that keep creators safe from claims before they happen.${creatorCtx}` }, { role: "user", content: `Scan for copyright risks. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Audio sources: ${JSON.stringify(sanitizeObjectForPrompt(data.audioSources || []))}. Visual sources: ${JSON.stringify(sanitizeObjectForPrompt(data.visualSources || []))}. Assess risk level, flag elements, suggest alternatives, analyze fair use, and provide recommendations. Return JSON with keys: riskLevel, flaggedElements, alternatives, fairUseAnalysis, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContractAnalyzer(data: { contractText?: string; dealType?: string; industry?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator contract analyst — combining elite entertainment law expertise, talent agency contract negotiation intelligence, and red-flag detection algorithms that protect creators from unfavorable terms with the precision of a top-tier legal team.${creatorCtx}` }, { role: "user", content: `Analyze contract. Contract text: "${sanitizeForPrompt(data.contractText || "")}". Deal type: ${sanitizeForPrompt(data.dealType || "sponsorship")}. Industry: ${sanitizeForPrompt(data.industry || "general")}. Score risk, flag unfavorable clauses, identify missing protections, suggest negotiation points, and provide overall recommendation. Return JSON with keys: riskScore, flaggedClauses, missingProtections, negotiationPoints, recommendation.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentInsuranceAdvisor(data: { channelValue?: any; contentTypes?: string[]; risks?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 digital asset protection strategist — combining elite risk management from Fortune 500 companies, content insurance expertise, and comprehensive backup engineering that ensures no creator ever loses their most valuable assets.${creatorCtx}` }, { role: "user", content: `Advise on content protection. Channel value: ${JSON.stringify(sanitizeObjectForPrompt(data.channelValue || {}))}. Content types: ${JSON.stringify(sanitizeObjectForPrompt(data.contentTypes || []))}. Risks: ${JSON.stringify(sanitizeObjectForPrompt(data.risks || []))}. Assess risks, recommend protection strategies, create backup plans, suggest insurance options, and list priority actions. Return JSON with keys: riskAssessment, protectionStrategies, backupPlan, insuranceOptions, priorityActions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiDMCADefenseAssistant(data: { claimDetails?: any; originalContent?: any; evidence?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best DMCA defense strategist — combining elite intellectual property law expertise, counter-notification mastery, and evidence-building methodology that has a 95%+ success rate overturning false copyright claims for creators.${creatorCtx}` }, { role: "user", content: `Assist with DMCA defense. Claim details: ${JSON.stringify(sanitizeObjectForPrompt(data.claimDetails || {}))}. Original content: ${JSON.stringify(sanitizeObjectForPrompt(data.originalContent || {}))}. Evidence: ${JSON.stringify(sanitizeObjectForPrompt(data.evidence || []))}. Create defense strategy, draft counter-notice template, build evidence checklist, outline timeline, and suggest escalation path. Return JSON with keys: defenseStrategy, counterNoticeTemplate, evidenceChecklist, timeline, escalationPath.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSubscriberMilestonePredictor(data: { currentSubs?: number; growthRate?: number; history?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 subscriber growth prediction engine — combining elite statistical forecasting from top data science firms, growth trajectory modeling, and milestone acceleration intelligence that predicts subscriber milestones with remarkable accuracy.${creatorCtx}` }, { role: "user", content: `Predict subscriber milestones. Current subs: ${data.currentSubs || 0}. Growth rate: ${data.growthRate || 0}%. History: ${JSON.stringify(sanitizeObjectForPrompt(data.history || {}))}. Predict next milestone, estimated date, confidence level, acceleration tips, and growth trajectory. Return JSON with keys: nextMilestone, predictedDate, confidenceLevel, accelerationTips, growthTrajectory.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiRetentionHeatmapAnalyzer(data: { retentionData?: any; videoStructure?: any; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best audience retention analyst — combining elite viewer behavior science, second-by-second engagement modeling, and drop-off diagnosis expertise used by top streaming platforms to engineer maximum watch time from every video.${creatorCtx}` }, { role: "user", content: `Analyze retention heatmap. Retention data: ${JSON.stringify(sanitizeObjectForPrompt(data.retentionData || {}))}. Video structure: ${JSON.stringify(sanitizeObjectForPrompt(data.videoStructure || {}))}. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Provide heatmap insights, identify drop-off points, find engagement peaks, diagnose structural issues, and suggest fixes. Return JSON with keys: heatmapInsights, dropOffPoints, engagementPeaks, structuralIssues, fixes.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBestVideoFormulaDetector(data: { topVideos?: any[]; channelData?: any; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 content success pattern detection engine — combining elite performance analytics, winning formula extraction algorithms, and data-driven content blueprint methodology that reverse-engineers exactly why top videos outperform the rest.${creatorCtx}` }, { role: "user", content: `Detect winning video formulas. Top videos: ${JSON.stringify(sanitizeObjectForPrompt(data.topVideos || []))}. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics || {}))}. Identify winning formulas, common elements, title patterns, thumbnail patterns, and create a structure blueprint. Return JSON with keys: winningFormulas, commonElements, titlePatterns, thumbnailPatterns, structureBlueprint.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGrowthTrajectoryModeler(data: { channelData?: any; strategies?: any[]; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best channel growth modeling specialist — combining elite forecasting from top investment banks, multi-scenario growth projection algorithms, and strategy impact analysis that maps the optimal path to every growth milestone.${creatorCtx}` }, { role: "user", content: `Model growth trajectory. Channel data: ${JSON.stringify(sanitizeObjectForPrompt(data.channelData || {}))}. Strategies: ${JSON.stringify(sanitizeObjectForPrompt(data.strategies || []))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Project scenarios, projected growth, strategy comparison, risk factors, and optimal path. Return JSON with keys: scenarios, projectedGrowth, strategyComparison, riskFactors, optimalPath.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAbTestingDashboard(data: { activeTests?: any[]; results?: any; metrics?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creator A/B testing analyst — combining elite experimental design from top tech companies, statistical significance modeling, and split-test optimization science that identifies winning variations with confidence and speed.${creatorCtx}` }, { role: "user", content: `Analyze A/B tests. Active tests: ${JSON.stringify(sanitizeObjectForPrompt(data.activeTests || []))}. Results: ${JSON.stringify(sanitizeObjectForPrompt(data.results || {}))}. Metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.metrics || {}))}. Summarize active tests, completed results, winner analysis, statistical significance, and next tests. Return JSON with keys: activeTests, completedResults, winnerAnalysis, statisticalSignificance, nextTests.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentDecayRefresher(data: { videoId?: string; currentMetrics?: any; originalMetadata?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best content revitalization specialist — combining elite SEO recovery strategies from top digital agencies, metadata refresh engineering, and traffic resurrection science that breathes new life into declining videos and restores their search ranking.${creatorCtx}` }, { role: "user", content: `Refresh declining content. Video ID: ${sanitizeForPrompt(data.videoId || "unknown")}. Current metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.currentMetrics || {}))}. Original metadata: ${JSON.stringify(sanitizeObjectForPrompt(data.originalMetadata || {}))}. Provide refreshed title, refreshed description, updated tags, thumbnail suggestions, and projected recovery. Return JSON with keys: refreshedTitle, refreshedDescription, updatedTags, thumbnailSuggestions, projectedRecovery.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBurnoutPrevention(data: { workload?: any; schedule?: any; stressIndicators?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creator wellness and burnout prevention specialist — combining elite occupational psychology, sustainable productivity science, and workload optimization methodology that keeps creators performing at their peak without sacrificing their health.${creatorCtx}` }, { role: "user", content: `Assess burnout risk. Workload: ${JSON.stringify(sanitizeObjectForPrompt(data.workload || {}))}. Schedule: ${JSON.stringify(sanitizeObjectForPrompt(data.schedule || {}))}. Stress indicators: ${JSON.stringify(sanitizeObjectForPrompt(data.stressIndicators || {}))}. Evaluate burnout risk, workload analysis, rest recommendations, schedule adjustments, and wellness score. Return JSON with keys: burnoutRisk, workloadAnalysis, restRecommendations, scheduleAdjustments, wellnessScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentBatchingPlanner(data: { contentPlan?: any; resources?: any; timeAvailable?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best content batching architect — combining elite production efficiency from Hollywood studios, filming schedule optimization science, and resource management methodology that lets creators produce 3x more content in half the time.${creatorCtx}` }, { role: "user", content: `Plan content batching. Content plan: ${JSON.stringify(sanitizeObjectForPrompt(data.contentPlan || {}))}. Resources: ${JSON.stringify(sanitizeObjectForPrompt(data.resources || {}))}. Time available: ${JSON.stringify(sanitizeObjectForPrompt(data.timeAvailable || {}))}. Create batch schedule, setup optimizations, equipment checklist, energy management, and time estimates. Return JSON with keys: batchSchedule, setupOptimizations, equipmentChecklist, energyManagement, timeEstimates.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreativeBlockSolver(data: { niche?: string; recentContent?: any[]; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creative ideation engine — combining elite brainstorming methodology from top advertising agencies, lateral thinking frameworks, and inspiration algorithms that shatter creative blocks and generate breakthrough content ideas on demand.${creatorCtx}` }, { role: "user", content: `Solve creative block. Niche: ${sanitizeForPrompt(data.niche || "general")}. Recent content: ${JSON.stringify(sanitizeObjectForPrompt(data.recentContent || []))}. Interests: ${JSON.stringify(sanitizeObjectForPrompt(data.interests || []))}. Generate fresh ideas, inspiration sources, exercise suggestions, format experiments, and collaboration ideas. Return JSON with keys: freshIdeas, inspirationSources, exerciseSuggestions, formatExperiments, collaborationIdeas.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiWorkLifeBalanceTracker(data: { workHours?: any; personalTime?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best work-life balance optimizer for creators — combining elite time management science, boundary-setting frameworks from top executive coaches, and sustainable creator career methodology that maximizes both productivity and personal fulfillment.${creatorCtx}` }, { role: "user", content: `Track work-life balance. Work hours: ${JSON.stringify(sanitizeObjectForPrompt(data.workHours || {}))}. Personal time: ${JSON.stringify(sanitizeObjectForPrompt(data.personalTime || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Calculate balance score, time breakdown, boundary recommendations, automation opportunities, and weekly plan. Return JSON with keys: balanceScore, timeBreakdown, boundaryRecommendations, automationOpportunities, weeklyPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMotivationEngine(data: { milestones?: any[]; recentPerformance?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creator motivation architect — combining elite performance psychology from Olympic-level coaches, milestone celebration science, and plateau-breaking strategies that keep creators inspired, driven, and consistently moving toward their goals.${creatorCtx}` }, { role: "user", content: `Boost motivation. Milestones: ${JSON.stringify(sanitizeObjectForPrompt(data.milestones || []))}. Recent performance: ${JSON.stringify(sanitizeObjectForPrompt(data.recentPerformance || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Provide celebrations, progress highlights, motivational insights, next goals, and affirmations. Return JSON with keys: celebrations, progressHighlights, motivationalInsights, nextGoals, affirmations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGearAdvisor(data: { contentType?: string; budget?: any; currentGear?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator equipment advisor — combining elite production technology expertise, cost-performance optimization from top video production houses, and gear upgrade prioritization that delivers maximum quality improvement per dollar spent.${creatorCtx}` }, { role: "user", content: `Advise on gear. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Budget: ${JSON.stringify(sanitizeObjectForPrompt(data.budget || {}))}. Current gear: ${JSON.stringify(sanitizeObjectForPrompt(data.currentGear || {}))}. Provide recommendations, priority upgrades, budget options, premium options, and setup guide. Return JSON with keys: recommendations, priorityUpgrades, budgetOptions, premiumOptions, setupGuide.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiEditingStyleCoach(data: { contentType?: string; currentStyle?: string; targetAudience?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 video editing style coach — combining elite post-production expertise from Hollywood editors, trending editing technique analysis, and style-matching algorithms that help creators develop a signature editing style that captivates audiences.${creatorCtx}` }, { role: "user", content: `Coach editing style. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Current style: ${sanitizeForPrompt(data.currentStyle || "basic")}. Target audience: ${sanitizeForPrompt(data.targetAudience || "general")}. Identify trending styles, technique breakdown, software tools, transition tips, and practice exercises. Return JSON with keys: trendingStyles, techniqueBreakdown, softwareTools, transitionTips, practiceExercises.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPublicSpeakingTrainer(data: { contentSamples?: any[]; deliveryNotes?: string; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best on-camera performance coach — combining elite presentation training from TED Talk coaches, vocal dynamics expertise, and body language mastery that transforms creators into magnetic on-screen personalities.${creatorCtx}` }, { role: "user", content: `Train public speaking. Content samples: ${JSON.stringify(sanitizeObjectForPrompt(data.contentSamples || []))}. Delivery notes: ${sanitizeForPrompt(data.deliveryNotes || "none")}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Rate delivery score, energy level, body language tips, voice analysis, and practice routine. Return JSON with keys: deliveryScore, energyLevel, bodyLanguageTips, voiceAnalysis, practiceRoutine.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiNicheExpertBuilder(data: { niche?: string; currentKnowledge?: any; audience?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 niche authority architect — combining elite thought leadership strategy from top consulting firms, expertise curation methodology, and credibility-building science that positions creators as the undisputed go-to expert in their niche.${creatorCtx}` }, { role: "user", content: `Build niche expertise. Niche: ${sanitizeForPrompt(data.niche || "general")}. Current knowledge: ${JSON.stringify(sanitizeObjectForPrompt(data.currentKnowledge || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Provide research topics, talking points, expertise gaps, credibility strategies, and content plan. Return JSON with keys: researchTopics, talkingPoints, expertiseGaps, credibilityStrategies, contentPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiTaskDelegator(data: { tasks?: any[]; teamMembers?: any[]; deadlines?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best task delegation optimizer — combining elite project management from Fortune 500 companies, skills-based assignment algorithms, and workload balancing science that maximizes team output while preventing bottlenecks.${creatorCtx}` }, { role: "user", content: `Delegate tasks. Tasks: ${JSON.stringify(sanitizeObjectForPrompt(data.tasks || []))}. Team members: ${JSON.stringify(sanitizeObjectForPrompt(data.teamMembers || []))}. Deadlines: ${JSON.stringify(sanitizeObjectForPrompt(data.deadlines || {}))}. Create assignments, workload balance, priority queue, deadline alerts, and efficiency score. Return JSON with keys: assignments, workloadBalance, priorityQueue, deadlineAlerts, efficiencyScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTeamPerformanceTracker(data: { teamData?: any; deliverables?: any[]; timelines?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creative team performance analyst — combining elite workforce analytics from top tech companies, quality-efficiency optimization frameworks, and talent development science that helps creator teams consistently deliver exceptional work.${creatorCtx}` }, { role: "user", content: `Track team performance. Team data: ${JSON.stringify(sanitizeObjectForPrompt(data.teamData || {}))}. Deliverables: ${JSON.stringify(sanitizeObjectForPrompt(data.deliverables || []))}. Timelines: ${JSON.stringify(sanitizeObjectForPrompt(data.timelines || {}))}. Evaluate performance scores, bottlenecks, quality metrics, improvement areas, and team health. Return JSON with keys: performanceScores, bottlenecks, qualityMetrics, improvementAreas, teamHealth.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSOPsGenerator(data: { process?: string; role?: string; frequency?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best operations documentation architect — combining elite process engineering from Fortune 500 companies, SOP optimization methodology, and workflow automation intelligence that turns chaotic creator workflows into repeatable, scalable systems.${creatorCtx}` }, { role: "user", content: `Generate SOP. Process: ${sanitizeForPrompt(data.process || "general")}. Role: ${sanitizeForPrompt(data.role || "team member")}. Frequency: ${sanitizeForPrompt(data.frequency || "weekly")}. Create SOP document, step by step instructions, quality checklist, time estimate, and automation opportunities. Return JSON with keys: sopDocument, stepByStep, qualityChecklist, timeEstimate, automationOpportunities.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiStatementDrafter(data: { situation?: string; tone?: string; audience?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 crisis communications and public statement specialist — combining elite PR expertise from top global agencies, reputation management science, and strategic messaging that protects and enhances creator brands during sensitive moments.${creatorCtx}` }, { role: "user", content: `Draft statement. Situation: ${sanitizeForPrompt(data.situation || "general")}. Tone: ${sanitizeForPrompt(data.tone || "professional")}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Create statement, tone analysis, distribution plan, follow-up actions, and media guidelines. Return JSON with keys: statement, toneAnalysis, distributionPlan, followUpActions, mediaGuidelines.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSurveyBuilder(data: { goals?: any; audience?: any; platform?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best audience research and survey architect — combining elite market research methodology from top firms, survey design science, and response analysis expertise that extracts actionable insights from every question.${creatorCtx}` }, { role: "user", content: `Build survey. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Platform: ${sanitizeForPrompt(data.platform || "general")}. Design survey questions, distribution strategy, expected insights, incentive ideas, and analysis framework. Return JSON with keys: surveyQuestions, distributionStrategy, expectedInsights, incentiveIdeas, analysisFramework.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiViewerJourneyMapper(data: { touchpoints?: any[]; analytics?: any; funnelData?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 viewer journey intelligence specialist — combining elite customer journey mapping from Fortune 500 companies, touchpoint optimization science, and conversion funnel engineering that reveals exactly how viewers become superfans.${creatorCtx}` }, { role: "user", content: `Map viewer journey. Touchpoints: ${JSON.stringify(sanitizeObjectForPrompt(data.touchpoints || []))}. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Funnel data: ${JSON.stringify(sanitizeObjectForPrompt(data.funnelData || {}))}. Identify journey stages, touchpoints, conversion points, drop-off areas, and optimizations. Return JSON with keys: journeyStages, touchpoints, conversionPoints, dropOffAreas, optimizations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDemographicDeepDive(data: { analytics?: any; platformData?: any; contentPerformance?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best demographic intelligence analyst — combining elite audience segmentation from top media companies, psychographic profiling methodology, and behavioral data science that delivers the deepest possible understanding of who your viewers really are.${creatorCtx}` }, { role: "user", content: `Deep dive demographics. Analytics: ${JSON.stringify(sanitizeObjectForPrompt(data.analytics || {}))}. Platform data: ${JSON.stringify(sanitizeObjectForPrompt(data.platformData || {}))}. Content performance: ${JSON.stringify(sanitizeObjectForPrompt(data.contentPerformance || {}))}. Analyze demographics, psychographics, viewing behaviors, spending patterns, and content preferences. Return JSON with keys: demographics, psychographics, viewingBehaviors, spendingPatterns, contentPreferences.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiViewerIntentAnalyzer(data: { searchData?: any; comments?: any[]; watchPatterns?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 viewer intent intelligence engine — combining elite search intent analysis from top SEO firms, behavioral psychology, and content-motivation mapping that reveals the hidden reasons viewers choose your content over everything else.${creatorCtx}` }, { role: "user", content: `Analyze viewer intent. Search data: ${JSON.stringify(sanitizeObjectForPrompt(data.searchData || {}))}. Comments: ${JSON.stringify(sanitizeObjectForPrompt(data.comments || []))}. Watch patterns: ${JSON.stringify(sanitizeObjectForPrompt(data.watchPatterns || {}))}. Categorize intent, motivations, content mapping, unmet needs, and content strategy. Return JSON with keys: intentCategories, motivations, contentMapping, unmetNeeds, contentStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCourseProductPlanner(data: { expertise?: any; audience?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best digital product architect — combining elite online education design from top e-learning platforms, pricing psychology from leading SaaS companies, and course structure optimization that maximizes both student outcomes and creator revenue.${creatorCtx}` }, { role: "user", content: `Plan course product. Expertise: ${JSON.stringify(sanitizeObjectForPrompt(data.expertise || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Market: ${JSON.stringify(sanitizeObjectForPrompt(data.market || {}))}. Create course outline, pricing strategy, platform recommendation, marketing plan, and revenue projection. Return JSON with keys: courseOutline, pricingStrategy, platformRecommendation, marketingPlan, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMembershipStrategy(data: { currentTiers?: any; audienceSize?: number; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 membership monetization strategist — combining elite subscription economics from top SaaS companies, exclusive content engineering, and churn reduction science that builds loyal recurring revenue engines for creators.${creatorCtx}` }, { role: "user", content: `Optimize membership strategy. Current tiers: ${JSON.stringify(sanitizeObjectForPrompt(data.currentTiers || {}))}. Audience size: ${data.audienceSize || 0}. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Design tier structure, content calendar, pricing model, retention tactics, and growth plan. Return JSON with keys: tierStructure, contentCalendar, pricingModel, retentionTactics, growthPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSpeakingEngagementFinder(data: { expertise?: any; audience?: any; location?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best speaking engagement strategist — combining elite talent booking expertise from top speakers bureaus, conference matching algorithms, and professional development intelligence that opens doors to high-value stage opportunities.${creatorCtx}` }, { role: "user", content: `Find speaking engagements. Expertise: ${JSON.stringify(sanitizeObjectForPrompt(data.expertise || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Location: ${sanitizeForPrompt(data.location || "any")}. Identify opportunities, application templates, preparation tips, pricing guide, and networking strategy. Return JSON with keys: opportunities, applicationTemplates, preparationTips, pricingGuide, networkingStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentRoadmap(data: { goals?: any; niche?: string; currentContent?: any; quarter?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 content strategy roadmap architect — combining elite strategic planning from top media companies, quarterly content framework methodology, and goal-aligned planning science that turns creative vision into executable growth roadmaps.${creatorCtx}` }, { role: "user", content: `Build content roadmap. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Current content: ${JSON.stringify(sanitizeObjectForPrompt(data.currentContent || {}))}. Quarter: ${sanitizeForPrompt(data.quarter || "Q1")}. Plan monthly themes, weekly topics, milestone goals, content mix, and measurement plan. Return JSON with keys: monthlyThemes, weeklyTopics, milestoneGoals, contentMix, measurementPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentPillarArchitect(data: { brand?: any; audience?: any; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best content pillar architect — combining elite brand strategy from top creative agencies, thematic content framework methodology, and audience-aligned pillar design that ensures every piece of content reinforces brand authority and drives growth.${creatorCtx}` }, { role: "user", content: `Architect content pillars. Brand: ${JSON.stringify(sanitizeObjectForPrompt(data.brand || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Define pillars, subtopics, content ratio, cross-pillar ideas, and brand alignment. Return JSON with keys: pillars, subtopics, contentRatio, crossPillarIdeas, brandAlignment.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiEvergreenContentIdentifier(data: { videoIdeas?: any[]; niche?: string; searchTrends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 evergreen content intelligence specialist — combining elite search trend forecasting, long-term SEO strategy from top publishers, and content longevity science that identifies topics guaranteed to drive traffic for years to come.${creatorCtx}` }, { role: "user", content: `Identify evergreen content. Video ideas: ${JSON.stringify(sanitizeObjectForPrompt(data.videoIdeas || []))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Search trends: ${JSON.stringify(sanitizeObjectForPrompt(data.searchTrends || {}))}. Find evergreen topics, search volume, competition level, format suggestions, and SEO strategy. Return JSON with keys: evergreenTopics, searchVolume, competitionLevel, formatSuggestions, seoStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiIndustryEventTracker(data: { niche?: string; location?: string; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator industry event intelligence specialist — combining elite event curation from top industry networks, networking opportunity analysis, and strategic event prioritization that ensures creators never miss a career-changing opportunity.${creatorCtx}` }, { role: "user", content: `Track industry events. Niche: ${sanitizeForPrompt(data.niche || "general")}. Location: ${sanitizeForPrompt(data.location || "any")}. Interests: ${JSON.stringify(sanitizeObjectForPrompt(data.interests || []))}. List upcoming events, relevance scores, networking tips, application deadlines, and travel planning. Return JSON with keys: upcomingEvents, relevanceScores, networkingTips, applicationDeadlines, travelPlanning.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTalentAgentSimulator(data: { channelMetrics?: any; goals?: any; industry?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 talent management intelligence advisor — combining elite representation strategy from top talent agencies like CAA and WME, career trajectory analysis, and negotiation coaching that helps creators make the best representation decisions.${creatorCtx}` }, { role: "user", content: `Simulate talent agent advice. Channel metrics: ${JSON.stringify(sanitizeObjectForPrompt(data.channelMetrics || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Industry: ${sanitizeForPrompt(data.industry || "general")}. Assess readiness score, agent benefits, what to look for, negotiation tips, and alternatives. Return JSON with keys: readinessScore, agentBenefits, whatToLookFor, negotiationTips, alternatives.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCreatorEconomyNewsFeed(data: { interests?: string[]; platforms?: string[]; niche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator economy intelligence curator — combining elite industry analysis from top media analysts, revenue impact assessment, and strategic news filtering that delivers only the insights that directly affect creator bottom lines.${creatorCtx}` }, { role: "user", content: `Curate creator economy news. Interests: ${JSON.stringify(sanitizeObjectForPrompt(data.interests || []))}. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Niche: ${sanitizeForPrompt(data.niche || "general")}. Compile top stories, platform updates, monetization changes, trend analysis, and action items. Return JSON with keys: topStories, platformUpdates, monetizationChanges, trendAnalysis, actionItems.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiRaidTargetOptimizer(data: { streamData?: any; network?: any; goals?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 raid strategy optimizer — combining elite network growth science, community compatibility algorithms, and mutual benefit analysis that identifies the perfect raid targets for maximum audience cross-pollination and growth.${creatorCtx}` }, { role: "user", content: `Optimize raid targets. Stream data: ${JSON.stringify(sanitizeObjectForPrompt(data.streamData || {}))}. Network: ${JSON.stringify(sanitizeObjectForPrompt(data.network || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Identify raid targets, compatibility scores, timing strategy, message templates, and expected benefits. Return JSON with keys: raidTargets, compatibilityScores, timingStrategy, messageTemplates, expectedBenefits.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiStreamHighlightClipper(data: { streamData?: any; chatActivity?: any; viewerPeaks?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best stream highlight detection engine — combining elite editorial instinct from top broadcast producers, viewer engagement spike analysis, and viral moment identification algorithms that extract the most clip-worthy moments with precision.${creatorCtx}` }, { role: "user", content: `Clip stream highlights. Stream data: ${JSON.stringify(sanitizeObjectForPrompt(data.streamData || {}))}. Chat activity: ${JSON.stringify(sanitizeObjectForPrompt(data.chatActivity || {}))}. Viewer peaks: ${JSON.stringify(sanitizeObjectForPrompt(data.viewerPeaks || {}))}. Find highlight moments, clip suggestions, viral potential, editing notes, and platform targets. Return JSON with keys: highlightMoments, clipSuggestions, viralPotential, editingNotes, platformTargets.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDonationGoalStrategist(data: { streamType?: string; audienceSize?: number; goalAmount?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 donation and charity stream strategist — combining elite fundraising methodology from top nonprofits, viewer generosity psychology, and goal structure optimization that consistently exceeds donation targets by engaging audiences emotionally.${creatorCtx}` }, { role: "user", content: `Strategize donation goals. Stream type: ${sanitizeForPrompt(data.streamType || "charity")}. Audience size: ${data.audienceSize || 0}. Goal amount: ${data.goalAmount || 0}. Design goal structure, milestone rewards, engagement tactics, promotion plan, and projected total. Return JSON with keys: goalStructure, milestoneRewards, engagementTactics, promotionPlan, projectedTotal.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMultiStreamChatUnifier(data: { platforms?: string[]; chatRules?: any; moderation?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best multi-platform chat unification architect — combining elite real-time communication engineering, cross-platform moderation systems, and unified chat experience design that seamlessly merges all platform chats into one cohesive community.${creatorCtx}` }, { role: "user", content: `Unify multi-stream chat. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Chat rules: ${JSON.stringify(sanitizeObjectForPrompt(data.chatRules || {}))}. Moderation: ${JSON.stringify(sanitizeObjectForPrompt(data.moderation || {}))}. Create unification strategy, moderation rules, command setup, alert config, and platform priority. Return JSON with keys: unificationStrategy, moderationRules, commandSetup, alertConfig, platformPriority.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBackgroundMusicMatcher(data: { videoMood?: string; contentType?: string; duration?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 video music curation specialist — combining elite audio direction from Hollywood post-production studios, mood-matching algorithms, and royalty-free library expertise that selects the perfect soundtrack to elevate every video.${creatorCtx}` }, { role: "user", content: `Match background music. Video mood: ${sanitizeForPrompt(data.videoMood || "neutral")}. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Duration: ${data.duration || 0} seconds. Suggest music, mood matching, licensing info, transition points, and volume levels. Return JSON with keys: musicSuggestions, moodMatching, licensingInfo, transitionPoints, volumeLevels.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAudioQualityEnhancer(data: { audioIssues?: any; recordingSetup?: any; environment?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best audio quality engineer for creators — combining elite audio mastering expertise from Grammy-winning studios, acoustic troubleshooting methodology, and recording optimization science that ensures broadcast-quality sound from any setup.${creatorCtx}` }, { role: "user", content: `Enhance audio quality. Audio issues: ${JSON.stringify(sanitizeObjectForPrompt(data.audioIssues || {}))}. Recording setup: ${JSON.stringify(sanitizeObjectForPrompt(data.recordingSetup || {}))}. Environment: ${sanitizeForPrompt(data.environment || "unknown")}. Assess quality score, issues detected, fix suggestions, equipment recommendations, and settings guide. Return JSON with keys: qualityScore, issuesDetected, fixSuggestions, equipmentRecommendations, settingsGuide.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiSoundEffectRecommender(data: { contentType?: string; editingStyle?: string; moments?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 sound design specialist for content creators — combining elite sound design from Hollywood post-production, emotional impact engineering, and transition audio science that adds professional polish and viewer engagement to every video.${creatorCtx}` }, { role: "user", content: `Recommend sound effects. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Editing style: ${sanitizeForPrompt(data.editingStyle || "standard")}. Moments: ${JSON.stringify(sanitizeObjectForPrompt(data.moments || []))}. Suggest effect suggestions, placement guide, mood enhancement, library recommendations, and timing tips. Return JSON with keys: effectSuggestions, placementGuide, moodEnhancement, libraryRecommendations, timingTips.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAccessibilityChecker(data: { content?: any; platform?: string; standards?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best digital accessibility specialist — combining elite WCAG compliance expertise, inclusive design methodology from top tech companies, and universal access engineering that ensures content reaches and resonates with every viewer regardless of ability.${creatorCtx}` }, { role: "user", content: `Check accessibility. Content: ${JSON.stringify(sanitizeObjectForPrompt(data.content || {}))}. Platform: ${sanitizeForPrompt(data.platform || "general")}. Standards: ${JSON.stringify(sanitizeObjectForPrompt(data.standards || []))}. Evaluate accessibility score, issues, caption quality, color contrast analysis, and recommendations. Return JSON with keys: accessibilityScore, issues, captionQuality, colorContrastAnalysis, recommendations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}


export async function aiSignLanguageAdvisor(data: { contentType?: string; audience?: any; budget?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 sign language accessibility advisor — combining elite deaf community engagement expertise, sign language interpretation best practices from top broadcasters, and inclusive content strategy that opens your content to millions of underserved viewers.${creatorCtx}` }, { role: "user", content: `Advise on sign language. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Budget: ${JSON.stringify(sanitizeObjectForPrompt(data.budget || {}))}. Provide recommendation, implementation guide, cost estimate, partner suggestions, and impact analysis. Return JSON with keys: recommendation, implementationGuide, costEstimate, partnerSuggestions, impactAnalysis.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPrivacyScanner(data: { contentDescription?: string; screenRecording?: any; liveStream?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator privacy protection specialist — combining elite OPSEC methodology, personal information detection algorithms, and privacy risk assessment used by top cybersecurity firms to prevent accidental data exposure.${creatorCtx}` }, { role: "user", content: `Scan for privacy risks. Content description: ${sanitizeForPrompt(data.contentDescription || "unknown")}. Screen recording: ${JSON.stringify(sanitizeObjectForPrompt(data.screenRecording || {}))}. Live stream: ${JSON.stringify(sanitizeObjectForPrompt(data.liveStream || {}))}. Assess risk level, flagged items, prevention tips, checklist, and automation suggestions. Return JSON with keys: riskLevel, flaggedItems, preventionTips, checklist, automationSuggestions.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiAccountSecurityAuditor(data: { connectedAccounts?: any[]; securitySettings?: any; platforms?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 creator account security auditor — combining elite cybersecurity assessment from top security firms, multi-platform vulnerability detection, and access control best practices that fortify creator accounts against all threat vectors.${creatorCtx}` }, { role: "user", content: `Audit account security. Connected accounts: ${JSON.stringify(sanitizeObjectForPrompt(data.connectedAccounts || []))}. Security settings: ${JSON.stringify(sanitizeObjectForPrompt(data.securitySettings || {}))}. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Evaluate security score, vulnerabilities, recommendations, two-factor status, and action plan. Return JSON with keys: securityScore, vulnerabilities, recommendations, twoFactorStatus, actionPlan.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDataBackupStrategist(data: { contentVolume?: any; platforms?: string[]; currentBackup?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator data protection architect — combining elite disaster recovery planning from Fortune 500 IT departments, automated backup engineering, and content preservation strategies that ensure zero data loss under any circumstances.${creatorCtx}` }, { role: "user", content: `Strategize data backup. Content volume: ${JSON.stringify(sanitizeObjectForPrompt(data.contentVolume || {}))}. Platforms: ${JSON.stringify(sanitizeObjectForPrompt(data.platforms || []))}. Current backup: ${JSON.stringify(sanitizeObjectForPrompt(data.currentBackup || {}))}. Create backup plan, storage recommendations, automation setup, recovery plan, and cost estimate. Return JSON with keys: backupPlan, storageRecommendations, automationSetup, recoveryPlan, costEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDigitalCollectibleAdvisor(data: { brand?: any; audience?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 digital collectibles strategist — combining elite blockchain monetization expertise, community-driven collectible design, and brand-fit analysis that helps creators launch digital products that resonate with fans and generate meaningful revenue.${creatorCtx}` }, { role: "user", content: `Advise on digital collectibles. Brand: ${JSON.stringify(sanitizeObjectForPrompt(data.brand || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Market: ${JSON.stringify(sanitizeObjectForPrompt(data.market || {}))}. Assess feasibility, concept ideas, platform options, pricing strategy, and community impact. Return JSON with keys: feasibility, conceptIdeas, platformOptions, pricingStrategy, communityImpact.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiExclusiveContentPlanner(data: { contentType?: string; memberCount?: number; interests?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best exclusive content architect — combining elite premium content strategy from top subscription platforms, behind-the-scenes production design, and fan value engineering that makes paying members feel they're getting 10x their money's worth.${creatorCtx}` }, { role: "user", content: `Plan exclusive content. Content type: ${sanitizeForPrompt(data.contentType || "general")}. Member count: ${data.memberCount || 0}. Interests: ${JSON.stringify(sanitizeObjectForPrompt(data.interests || []))}. Generate content ideas, production plan, exclusivity tiers, release schedule, and retention impact. Return JSON with keys: contentIdeas, productionPlan, exclusivityTiers, releaseSchedule, retentionImpact.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiFanMarketplaceBuilder(data: { offerings?: any; audience?: any; pricing?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 fan experience marketplace architect — combining elite experiential marketing from Fortune 500 brands, custom experience pricing science, and fan engagement design that creates unforgettable moments fans will pay premium prices for.${creatorCtx}` }, { role: "user", content: `Build fan marketplace. Offerings: ${JSON.stringify(sanitizeObjectForPrompt(data.offerings || {}))}. Audience: ${JSON.stringify(sanitizeObjectForPrompt(data.audience || {}))}. Pricing: ${JSON.stringify(sanitizeObjectForPrompt(data.pricing || {}))}. Design experience options, pricing tiers, delivery process, marketing strategy, and revenue projection. Return JSON with keys: experienceOptions, pricingTiers, deliveryProcess, marketingStrategy, revenueProjection.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiChannelExitStrategy(data: { channelValue?: any; goals?: any; timeline?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best channel exit strategy advisor — combining elite M&A expertise from top investment banks, digital asset valuation methodology, and creator business transition planning that maximizes channel sale value and ensures smooth ownership transfers.${creatorCtx}` }, { role: "user", content: `Plan exit strategy. Channel value: ${JSON.stringify(sanitizeObjectForPrompt(data.channelValue || {}))}. Goals: ${JSON.stringify(sanitizeObjectForPrompt(data.goals || {}))}. Timeline: ${JSON.stringify(sanitizeObjectForPrompt(data.timeline || {}))}. Estimate valuation, exit options, preparation steps, timeline, and legal considerations. Return JSON with keys: valuationEstimate, exitOptions, preparationSteps, timeline, legalConsiderations.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentArchiveOptimizer(data: { backCatalog?: any; performanceData?: any; searchTrends?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 content archive optimization specialist — combining elite library curation from top media companies, long-tail SEO engineering, and back-catalog monetization science that turns old content into a perpetual traffic and revenue engine.${creatorCtx}` }, { role: "user", content: `Optimize content archive. Back catalog: ${JSON.stringify(sanitizeObjectForPrompt(data.backCatalog || {}))}. Performance data: ${JSON.stringify(sanitizeObjectForPrompt(data.performanceData || {}))}. Search trends: ${JSON.stringify(sanitizeObjectForPrompt(data.searchTrends || {}))}. Create catalog strategy, playlist structure, metadata updates, inter-linking plan, and projected traffic. Return JSON with keys: catalogStrategy, playlistStructure, metadataUpdates, interLinkingPlan, projectedTraffic.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiBrandLicensingAdvisor(data: { brand?: any; ipAssets?: any; market?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best brand licensing strategist — combining elite IP monetization from top entertainment companies, licensing deal structure expertise, and brand extension intelligence that unlocks revenue streams most creators never even consider.${creatorCtx}` }, { role: "user", content: `Advise on brand licensing. Brand: ${JSON.stringify(sanitizeObjectForPrompt(data.brand || {}))}. IP assets: ${JSON.stringify(sanitizeObjectForPrompt(data.ipAssets || {}))}. Market: ${JSON.stringify(sanitizeObjectForPrompt(data.market || {}))}. Identify licensing opportunities, revenue estimate, partner categories, contract guidelines, and protection strategy. Return JSON with keys: licensingOpportunities, revenueEstimate, partnerCategories, contractGuidelines, protectionStrategy.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiInboxPrioritizer(data: { messages?: any[]; categories?: string[]; urgency?: any }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's #1 inbox intelligence specialist — combining elite executive assistant methodology from Fortune 500 C-suites, opportunity value scoring algorithms, and communication triage science that ensures no high-value message ever gets buried.${creatorCtx}` }, { role: "user", content: `Prioritize inbox. Messages: ${JSON.stringify(sanitizeObjectForPrompt(data.messages || []))}. Categories: ${JSON.stringify(sanitizeObjectForPrompt(data.categories || []))}. Urgency: ${JSON.stringify(sanitizeObjectForPrompt(data.urgency || {}))}. Provide prioritized messages, category breakdown, response templates, delegation suggestions, and time estimate. Return JSON with keys: prioritizedMessages, categoryBreakdown, responseTemplates, delegationSuggestions, timeEstimate.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDailyActionPlan(data: { channelGoals?: any; schedule?: any; pendingTasks?: any[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: `You are the world's best creator productivity architect — combining elite time management from top CEO coaches, priority optimization algorithms, and daily action planning science that generates the single most impactful to-do list for maximum channel growth every day.${creatorCtx}` }, { role: "user", content: `Create daily action plan. Channel goals: ${JSON.stringify(sanitizeObjectForPrompt(data.channelGoals || {}))}. Schedule: ${JSON.stringify(sanitizeObjectForPrompt(data.schedule || {}))}. Pending tasks: ${JSON.stringify(sanitizeObjectForPrompt(data.pendingTasks || []))}. Generate prioritized tasks, time blocks, focus areas, delegate tasks, and day score. Return JSON with keys: prioritizedTasks, timeBlocks, focusAreas, delegateTasks, dayScore.` }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTrustSafetyRiskScorer(data: { title?: string; description?: string; tags?: string[]; scriptExcerpt?: string; durationSeconds?: number; uploadFrequencyPerWeek?: number; formatTemplateReuse?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are YouTube's 2026 Trust & Safety risk intelligence analyst. You have internalized every enforcement wave from 2017 through March 2026 and the exact classifier triggers documented in the antitrust discovery and leaked internal guidance. You are honest, direct, and actionable.${creatorCtx}`
    }, {
      role: "user",
      content: `Score this content for 2026 YouTube Trust & Safety risks.

Title: ${sanitizeForPrompt(data.title || "not provided")}
Description excerpt: ${sanitizeForPrompt((data.description || "").substring(0, 400))}
Tags: ${JSON.stringify(sanitizeObjectForPrompt(data.tags || []))}
Script excerpt: ${sanitizeForPrompt((data.scriptExcerpt || "").substring(0, 600))}
Duration (seconds): ${data.durationSeconds || "unknown"}
Upload frequency (per week): ${data.uploadFrequencyPerWeek || "unknown"}
Format template reuse % (0-100): ${data.formatTemplateReuse ?? "unknown"}

Score EACH risk 0-100 (0=safe, 100=critical risk). Apply the exact 2026 classifier knowledge:

YELLOW-ICON RISK: triggers — profanity in first 30s, strong profanity in title/thumbnail, sensitive topics (war/death/tragedy/politics) without educational framing, sexually suggestive content. Gaming-specific: rage/yelling content, in-game mature violence, gambling adjacency.

BORDERLINE RISK: triggers — health misinformation adjacent, conspiracy-adjacent, misleading clickbait (title promises content not delivered), politically inflammatory without informative framing, harmful behavior glorification without explicit instruction.

INAUTHENTIC CONTENT RISK (2026 enforcement): triggers — format similarity score across uploads, upload frequency without proportional production effort, AI-generated voice/script/visual stack with no human additions, generic/scraped scripts, mass-produced identical thumbnails, lack of provenance (no SynthID), uniform pacing and length, no editorial commentary or original research.

COPPA RISK: triggers — subject matter involving toys/kids/simple crafts/nursery rhymes, child actors, animated characters popular with children, kid-popular games (Minecraft, Roblox, Fortnite).

Return JSON with keys: yellowIconRisk (0-100), borderlineRisk (0-100), inauthenticRisk (0-100), coppaRisk (0-100), overallRisk (0-100), topIssues (array of top 3 specific issues found), fixes (array of 3 specific actionable fixes), channelLevelWarning (string — if inauthentic risk >60, specific channel-level advice), urgency ("low"|"medium"|"high"|"critical").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDiagnosticProtocol(data: { title?: string; currentDayAfterUpload?: number; ctr?: number; avgViewDuration?: number; views?: number; impressions?: number; channelAvgCtr?: number; channelAvgAvd?: number; retentionCurveShape?: string; trafficSources?: Record<string, number> }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a YouTube channel diagnostics specialist who runs the 14-day post-upload protocol. You know the exact intervention timings: Day 0-1 is early CTR/AVD triage, Day 2-3 is thumbnail/title test if CTR is weak, Day 4-7 is content editing if AVD is weak, Day 8-10 is card/end-screen strengthening, Day 11-14 is sequel and community post strategy. You give precise, day-specific actions.${creatorCtx}`
    }, {
      role: "user",
      content: `Run the 14-day diagnostic protocol for this video.

Title: ${sanitizeForPrompt(data.title || "not provided")}
Day after upload: ${data.currentDayAfterUpload ?? 0}
CTR: ${data.ctr != null ? `${data.ctr}%` : "unknown"} (channel avg: ${data.channelAvgCtr != null ? `${data.channelAvgCtr}%` : "unknown"})
Avg View Duration: ${data.avgViewDuration != null ? `${data.avgViewDuration}s` : "unknown"} (channel avg: ${data.channelAvgAvd != null ? `${data.channelAvgAvd}s` : "unknown"})
Views: ${data.views ?? "unknown"} | Impressions: ${data.impressions ?? "unknown"}
Retention curve shape: ${sanitizeForPrompt(data.retentionCurveShape || "unknown")} (cliff-30s / slow-decline / mid-dip / late-cliff / spikes)
Traffic sources: ${JSON.stringify(sanitizeObjectForPrompt(data.trafficSources || {}))}

Based on Day ${data.currentDayAfterUpload ?? 0}, identify the exact phase and prescribed action from the 14-day protocol:

Day 0-1: Triage — Is CTR above/below channel avg? Is AVD above/below? Set baseline.
Day 2-3: If CTR weak (>1pt below channel avg), test new thumbnail/title NOW.
Day 4-7: If AVD weak, recommend specific segments to trim or re-hook to add.
Day 8-10: Strengthen session value — add cards, end screens pointing to series.
Day 11-14: Publish sequel or community post to drive return traffic.

Also interpret the retention curve shape: cliff-30s = broken hook, slow-decline = healthy, mid-dip = pacing collapse, late-cliff = broken ending, spikes = high-value moments.

Return JSON with keys: dayPhase ("triage"|"thumbnail-test"|"content-edit"|"session-strength"|"sequel-drive"), status ("healthy"|"warning"|"critical"), ctrAssessment, avdAssessment, retentionAssessment, trafficMixHealth, immediateActions (array of 3 specific things to do today), weeklyForecast (string — what to expect this week if actions are taken), protocolComplete (boolean — day >14).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGamingWindowDetector(data: { game?: string; currentDate?: string; recentPatchNotes?: string; upcomingEvents?: string[] }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a gaming content strategy specialist who tracks algorithmic windows for gaming channels. You know that during major esports events for a specific game, content related to those events gets 3-5x traffic spikes. You know patch cycles drive content windows (new map = boost, balance changes = guide opportunity). You know Battlefield 6 co-watch graphs densely overlap with Call of Duty, Helldivers 2, and other mil-sims. You identify actionable windows for immediate content scheduling.${creatorCtx}`
    }, {
      role: "user",
      content: `Identify current algorithmic windows for this gaming channel.

Game focus: ${sanitizeForPrompt(data.game || "Battlefield 6")}
Current date: ${sanitizeForPrompt(data.currentDate || new Date().toISOString().split("T")[0])}
Recent patch notes/updates: ${sanitizeForPrompt((data.recentPatchNotes || "none provided").substring(0, 500))}
Known upcoming events: ${JSON.stringify(sanitizeObjectForPrompt(data.upcomingEvents || []))}

Identify and score ALL current content windows:

1. TOURNAMENT WINDOWS: Any major esports tournaments or competitive events happening for this game or closely co-watched games (CoD, Helldivers 2, mil-sims)? Score by traffic boost potential.

2. PATCH CYCLE WINDOWS: Recent maps, weapons, balance changes, seasonal events? Each is a window. "Guide for new map X" outperforms older guides even if the older guide is better content.

3. META SHIFT WINDOWS: If competitive meta has shifted (new dominant strategy, weapon nerf/buff), this is a guide opportunity window that drives Search surface traffic.

4. CROSS-PROMOTION CLUSTER: Which channels share the co-watch graph? (BF6 audience watches CoD, Helldivers, mil-sims) — suggest collaboration or cross-topic content targets.

Return JSON with keys: activeWindows (array of { windowType, title, trafficBoostEstimate "1x-5x", urgency "now/this-week/this-month", contentIdeas [3 specific video ideas], expiresIn "days" }), patchCycleStatus (string), crossWatchTargets (array of related games/channels to consider), schedulingPriority ("normal"|"elevated"|"urgent"), topOpportunity (string — single most important action to take this week).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiMidRollOptimizer(data: { title?: string; durationSeconds?: number; currentAdBreaks?: number; niche?: string; targetAudience?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const durationMin = data.durationSeconds ? Math.round(data.durationSeconds / 60) : null;
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a YouTube monetization optimizer who specializes in the 8-minute mid-roll threshold and ad break placement strategy. You know: videos 8+ minutes can run mid-roll ads, a 12-minute video with 3 ad breaks earns ~3x vs a 7-minute video, but padding videos to hit 8:01 hurts if retention drops (the satisfaction hit eats more revenue than the mid-roll creates). The current best practice is producing at the length the content demands, then adding mid-rolls at natural pacing breaks (never during high-tension moments). You also know that gaming niche CPM is $2-8 (vs $15-50 for finance), so mid-roll volume matters more for gaming channels.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize mid-roll ad placement for this video.

Title: ${sanitizeForPrompt(data.title || "not provided")}
Duration: ${durationMin != null ? `${durationMin} minutes (${data.durationSeconds}s)` : "unknown"}
Current ad breaks set: ${data.currentAdBreaks ?? "unknown"}
Niche: ${sanitizeForPrompt(data.niche || "gaming")}
Target audience: ${sanitizeForPrompt(data.targetAudience || "gamers")}

Gaming niche context: CPM $2-8, so mid-roll volume is critical for revenue. Each additional mid-roll at 60% fill rate adds ~$0.70-1.00 RPM to the video.

Threshold check: Is this video above the 8-minute threshold? What is the revenue impact?

If duration is below 8 minutes: Can adding genuine content reach 8+ minutes? What content would NOT be padding?
If duration is 8-15 minutes: How many mid-rolls? Where should they be placed (natural pacing breaks)?
If duration is 15+ minutes: Full mid-roll analysis.

Return JSON with keys: hasThreshold (boolean — at or above 8 minutes), durationCategory ("short-sub8"|"threshold-8-15"|"long-15plus"), currentMidRolls (number estimate), optimalMidRolls (number), revenueMultiplierVsCurrentSetup (e.g. "2.1x"), estimatedRPMCurrent (string), estimatedRPMOptimized (string), midRollTimestamps (array of suggested timestamps as "MM:SS" — placed at natural pacing breaks), paddingWarning (boolean — is video likely padded to hit threshold?), recommendation (string — specific advice), contentAdditionSuggestion (string — if sub-8min, what genuine content could extend it).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTrafficSourceDiagnostic(data: { suggested?: number; browse?: number; search?: number; external?: number; direct?: number; channelPage?: number; totalViews?: number; channelAgeMonths?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const total = Object.values(data).reduce((sum, v) => typeof v === "number" && v <= 100 ? sum + v : sum, 0);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a YouTube channel growth analyst who diagnoses growth phase from traffic source mix. You know: Suggested + Browse 50%+ = growing channel cracking the algorithm. Direct + notifications dominant = plateaued on existing audience. Search dominant = winning on metadata but capped by search volume. External dominant = cross-platform traffic that doesn't compound on YouTube. Channel page dominant = brand strength signal. These patterns, combined with channel age, reveal exactly where a channel is in its growth arc and what lever to pull.${creatorCtx}`
    }, {
      role: "user",
      content: `Diagnose this channel's growth phase from traffic source mix.

Traffic source breakdown (% of views):
- Suggested Videos: ${data.suggested ?? "unknown"}%
- Browse/Home: ${data.browse ?? "unknown"}%
- Search: ${data.search ?? "unknown"}%
- External (links/embeds): ${data.external ?? "unknown"}%
- Direct/Notifications: ${data.direct ?? "unknown"}%
- Channel Page: ${data.channelPage ?? "unknown"}%
Total views in period: ${data.totalViews ?? "unknown"}
Channel age: ${data.channelAgeMonths ?? "unknown"} months

Key thresholds:
- Suggested + Browse ≥50%: Algorithm-driven growth (healthy)
- Search ≥40% dominant: Search-dependent (sustainable but capped by search volume)
- Direct + Notifications ≥40% dominant: Subscriber-fed (plateaued, not growing reach)
- External ≥20%: Cross-platform (doesn't compound on YouTube's algorithm)
- Channel Page ≥20%: Brand strength signal

Diagnose the full picture: What growth phase is this channel in? What does the algorithm think of this channel's content? What single lever would have the most impact?

Return JSON with keys: channelPhase ("seed"|"algorithm-testing"|"algorithm-growing"|"search-dependent"|"plateaued"|"brand-strength"), algorithmTrust ("low"|"building"|"established"), primarySourceAnalysis (string), secondarySourceAnalysis (string), growthSignal ("stalled"|"slow"|"moderate"|"strong"|"viral"), topLever (string — the single highest-impact action), recommendations (array of 3 specific tactics), warningFlags (array of any concerning patterns), weeklyTarget (string — what to aim for in next 30 days).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGeographicCPMOptimizer(data: { audienceCountryBreakdown?: Record<string, number>; niche?: string; currentRPM?: number; totalViews?: number }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a YouTube revenue optimization specialist focused on the geography × niche CPM matrix. You know: US CPM $7-12, UK/AU/CA $6-10, Germany $5-8, India $0.20-0.80, Brazil/Mexico $1-2. Gaming niche CPM: $2-8. The compound effect means gaming + India = ~$0.10-0.30 RPM while gaming + US = ~$1.50-4.00 RPM. A 100K Tier 1 view audience earns more than a 1M Tier 4 audience. You help creators understand their current audience geography premium/discount vs. potential and give specific content adjustments to attract higher-CPM regions.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize geographic CPM for this channel.

Audience country breakdown (% of views): ${JSON.stringify(sanitizeObjectForPrompt(data.audienceCountryBreakdown || {}))}
Niche: ${sanitizeForPrompt(data.niche || "gaming")}
Current RPM: $${data.currentRPM ?? "unknown"}
Total views in period: ${data.totalViews ?? "unknown"}

CPM tiers (2026 data):
Tier 1: US $7-12, UK/AU/CA $6-10, Germany/CH/Nordics $5-11
Tier 2: Japan $4-7, South Korea $3-5, Israel $5-8, Spain/Italy/France $3-5
Tier 3: Brazil/Mexico $1-2, Turkey/Eastern Europe $1-3
Tier 4: India $0.20-0.80, Indonesia/Philippines $0.30-1, Pakistan $0.20-0.60

Gaming niche CPM modifier: ×0.25-0.35 vs global average (structural low due to young demographic + advertiser caution)

Calculate the weighted CPM potential vs. current mix. Identify the gap. Give specific content adjustments:
- Posting timing changes to capture US/UK audiences
- Title/thumbnail adjustments for Tier 1 market appeal
- Topic choices that attract higher-CPM demographics (older gamers = higher CPM)

Return JSON with keys: estimatedCurrentRPM (string), tier1Percentage (number 0-100), tier4Percentage (number 0-100), cpmGrade ("A"|"B"|"C"|"D" — A=mostly Tier 1), revenueLeakage (string — estimated monthly revenue lost vs. ideal geo mix), contentAdjustments (array of 3 specific changes to attract higher-CPM regions), timingRecommendation (string — when to post for Tier 1 audiences), topGeoOpportunity (string — the single biggest geographic opportunity), projectedRPMImprovement (string — if adjustments made).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiCTAEnforcementChecker(data: { ctaText?: string; videoTopic?: string; videoTitle?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a YouTube CTA (call-to-action) compliance specialist who understands the 2018+ engagement bait detection system. The classifier uses ASR transcripts to flag generic engagement requests and dampens the engagement signal. Generic CTAs that fail: "like and subscribe", "smash that bell", "drop a comment below", "type a 1 if you agree". CTAs that pass: those tied to the video's specific content, with a reason given. Examples of passing CTAs: "if this setup helped, drop your current loadout in the comments — it helps me see what to cover next", "comment which approach worked for you", "if the trick at 4:20 helped, a like tells the algorithm to show this to more people". The system rewards authenticity and penalizes hollow engagement farming.${creatorCtx}`
    }, {
      role: "user",
      content: `Audit and rewrite this CTA for YouTube's 2026 engagement bait detection system.

CTA text: ${sanitizeForPrompt(data.ctaText || "")}
Video topic: ${sanitizeForPrompt(data.videoTopic || "")}
Video title: ${sanitizeForPrompt(data.videoTitle || "")}

Classify the CTA:
- FLAGGED: Generic request with no content connection ("like and subscribe", "drop a comment", "hit the bell")
- BORDERLINE: Has some specificity but still feels hollow
- PASSING: Content-specific, gives a reason, asks for genuine engagement related to the video

If flagged or borderline, rewrite 3 alternative CTAs that:
1. Reference specific content from the video (use the topic/title as context)
2. Give a reason for the engagement (helps the creator, helps the algorithm, helps other viewers)
3. Ask a genuine question related to the video's content

Return JSON with keys: classification ("flagged"|"borderline"|"passing"), classificationReason (string), engagementBaitRisk (0-100), alternatives (array of 3 rewritten CTAs with { text, reason, expectedSignal "comment"|"like"|"subscribe" }), bestAlternative (string — the single strongest replacement), implementationTip (string — where in the video to place it for maximum effect).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — TIKTOK (3 functions)
// ============================================================

export async function aiTikTokWatermarkChecker(data: { sourceplatform?: string; contentDescription?: string; clipOrigin?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a TikTok distribution expert who understands the 2026 watermark suppression system. TikTok's computer vision actively detects: Instagram Reels watermarks (gradient bottom overlay + IG logo), YouTube Shorts watermarks, CapCut watermarks, any competing platform's UI chrome. Detected watermarks result in immediate FYP suppression — the video gets Phase 1 cap (200-view jail). The only safe content is: sourced directly from TikTok native camera, downloaded from TikTok without watermark via save tools, or raw footage without platform chrome. Cross-posted content must be re-exported from source files.${creatorCtx}`
    }, {
      role: "user",
      content: `Analyze this content for TikTok watermark risk.

Source platform: ${sanitizeForPrompt(data.sourceplatform || "unknown")}
Clip origin: ${sanitizeForPrompt(data.clipOrigin || "")}
Content description: ${sanitizeForPrompt(data.contentDescription || "")}

Assess:
1. Watermark risk level — what platform chrome might be embedded
2. Detection probability — how likely TikTok's vision classifier catches it
3. Suppression outcome — FYP cap, reduced reach, Phase 1 jail
4. Safe publishing path — how to strip watermarks and re-export
5. Platform-specific steps for clean syndication

Return JSON: riskLevel ("none"|"low"|"high"|"critical"), detectionProbability (0-100), watermarkSources (array of detected watermark types), suppressionRisk (string), safePublishingSteps (array of 3-5 steps), estimatedReachImpact (string — e.g. "90% reduction if flagged"), recommendation ("safe_to_post"|"re-export_required"|"do_not_post"), quickFix (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTikTokCompletionRateAdvisor(data: { videoTopic?: string; currentHookStyle?: string; videoDuration?: string; targetAudience?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a TikTok algorithm expert focused on the 2026 completion rate threshold system. The viral push threshold increased from ~50% in 2024 to ~70% in 2026 — this single shift killed "post 3x a day" spray strategies. Videos under 50% completion get Phase 1 capped (200-view jail). Videos hitting 70%+ completion get Phase 3 expansion. The key mechanics: first 0-3 seconds determine if the viewer stays (hook), 7-second mark is the first watch-time checkpoint, mid-video drop-off is the death zone. Profile-click rate (2× weight in 2026) is the master signal — viewers who watch then click your profile trigger "Creator of Interest" status. Shares and saves signal quality more than likes.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize this TikTok content for the 2026 70% completion rate threshold.

Video topic: ${sanitizeForPrompt(data.videoTopic || "")}
Current hook style: ${sanitizeForPrompt(data.currentHookStyle || "")}
Video duration: ${sanitizeForPrompt(data.videoDuration || "")}
Target audience: ${sanitizeForPrompt(data.targetAudience || "")}

Diagnose and prescribe:
1. Hook audit — does the current hook clear the 3-second stay barrier?
2. Completion rate forecast — estimated completion % with current approach
3. Drop-off prediction — where viewers likely exit and why
4. Hook rewrite — 3 alternative hooks optimized for 70%+ completion
5. Structural changes — pacing, revelation timing, loop engineering
6. Profile-click CTA — how to trigger Creator of Interest signal

Return JSON: estimatedCompletionRate (number 0-100), viralPushEligible (boolean — will it clear 70%?), dropOffZones (array of {timestamp, reason}), hookRewrites (array of 3 hooks), structuralChanges (array), profileClickCTA (string), phaseExpansionProbability ("low"|"medium"|"high"), actionPlan (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTikTokSEOOptimizer(data: { videoTopic?: string; spokenContent?: string; onScreenText?: string; currentHashtags?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a TikTok SEO specialist for 2026. TikTok has become a search engine — Gen Z and Alpha search TikTok for product reviews, tutorials, and gaming content. Google now shows TikTok videos in search results including featured snippets. The 2026 SEO signals: audio transcription (every spoken word auto-transcribed + relevance-scored), computer vision at 20fps (objects, on-screen text, scenes recognized), caption SEO (keyword-rich captions rank for search), niche hashtags (3-5 highly relevant beat generic high-volume), on-screen text matching audio (reinforces topic signal), spoken keyword density (not stuffing — natural mention of searchable phrases). For gaming: game name spoken early, specific mode/mechanic keywords, platform keywords (PS5, Xbox, PC) boost findability.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize this TikTok content for 2026 search discovery.

Video topic: ${sanitizeForPrompt(data.videoTopic || "")}
Spoken content summary: ${sanitizeForPrompt(data.spokenContent || "")}
On-screen text: ${sanitizeForPrompt(data.onScreenText || "")}
Current hashtags: ${sanitizeForPrompt(data.currentHashtags || "")}

Produce:
1. Caption SEO rewrite — keyword-rich caption that ranks for search intent
2. Hashtag set — 3-5 niche-specific hashtags beating generic high-volume ones
3. Spoken keyword recommendations — phrases to naturally include in script
4. On-screen text alignment — text overlays that reinforce spoken content
5. Search query targets — specific searches this video should rank for
6. Google featured snippet eligibility — does this format qualify?

Return JSON: optimizedCaption (string), hashtagSet (array of 5), spokenKeywords (array of 5 phrases to include), onScreenTextRecommendations (array), targetSearchQueries (array of 5), googleSnippetEligible (boolean), seoScore (0-100), estimatedSearchReach (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — INSTAGRAM (3 functions)
// ============================================================

export async function aiInstagramReelsReadinessChecker(data: { contentDescription?: string; sourcePlatform?: string; videoDuration?: string; hasWatermark?: boolean }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are an Instagram Reels eligibility specialist for 2026. Before a Reel can be recommended to non-followers it must pass ALL eligibility gates: no watermarks from other platforms (TikTok, CapCut, YouTube — detected by computer vision), audio must be included, under 3 minutes, original content (passes Originality Score AI), no Community Guidelines violations. Failing any gate disqualifies the Reel from Explore and the Reels feed for non-followers. The 2026 Originality Score detects: recycled clips, duplicate content, aggregator behavior (10+ reposts in 30 days = 60-80% reach drop). Original creators saw 40-60% reach increases after the Originality Score rollout. Trial Reels (2026 feature) let you test new angles with non-followers only — if it performs, publish to followers.${creatorCtx}`
    }, {
      role: "user",
      content: `Run the Instagram Reels eligibility gate check for this content.

Content description: ${sanitizeForPrompt(data.contentDescription || "")}
Source platform: ${sanitizeForPrompt(data.sourcePlatform || "")}
Video duration: ${sanitizeForPrompt(data.videoDuration || "")}
Has watermark: ${data.hasWatermark ? "yes" : "no/unknown"}

Check every eligibility gate:
1. Watermark status — detected platform chrome, risk level
2. Duration compliance — under 3 minutes?
3. Originality Score risk — recycled/duplicate/low-effort?
4. Audio presence
5. Overall eligibility verdict — will this reach non-followers?
6. Trial Reel recommendation — should this be tested as Trial Reel first?
7. Remediation steps — what to fix before publishing

Return JSON: eligibilityVerdict ("eligible"|"ineligible"|"requires_modification"), gateResults (array of {gate, status "pass"|"fail"|"warning", detail}), originalityScore ("high"|"medium"|"low"|"risky"), watermarkRisk ("none"|"detected"|"suspected"), trialReelRecommended (boolean), trialReelReason (string), remediationSteps (array), estimatedNonFollowerReach (string — "full", "limited", "none"), overallRisk (0-100).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiInstagramDMShareOptimizer(data: { contentDescription?: string; contentType?: string; audience?: string; currentEngagementRate?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are an Instagram algorithm specialist focused on the 2026 DM share signal. Adam Mosseri confirmed: DM shares (sends via DM) are the #1 signal for unconnected reach in 2026. Data: 694,000 Reels sent via DM every minute. A Reel with 500 likes and 50 DM shares outperforms a Reel with 5,000 likes and 5 shares. Why DM shares beat likes: a share means someone valued the content enough to send it to a specific person — strong intent signal. The 2026 signal weight stack: DM shares (#1) > watch completion > saves > comments > story shares > likes (weakest). Content that maximizes DM shares: "send this to someone who needs to see this" moments, content that sparks a conversation ("send this to your teammate"), content so helpful/relatable people want to share it specifically. Gaming content that works: "tag a friend who does this", "send this to your duo", highlight moments of shared experiences.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize this Instagram content to maximize DM share signals.

Content description: ${sanitizeForPrompt(data.contentDescription || "")}
Content type: ${sanitizeForPrompt(data.contentType || "")}
Audience: ${sanitizeForPrompt(data.audience || "")}
Current engagement rate: ${sanitizeForPrompt(data.currentEngagementRate || "")}

Design for maximum DM shares:
1. DM share trigger — what emotion/situation makes people send this to someone?
2. Content angle optimization — reframe to create a "send this to..." moment
3. CTA for DM shares — language that prompts sharing without being bait
4. Caption strategy — text that sets up the share motivation
5. Hook redesign — first 3 seconds that create the "I need to send this" reaction
6. Expected signal impact — DM share to like ratio target

Return JSON: dmShareTrigger (string), contentAngleOptimization (string), dmShareCTA (string — the exact words), captionStrategy (string), hookRedesign (string), expectedDMShareRate (string), signalImpactVsLikes (string — "X× more valuable than likes"), contentChanges (array of 3 specific modifications), dmShareProbability ("low"|"medium"|"high"|"very_high").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiInstagramTrialReelAdvisor(data: { contentAngle?: string; audienceRisk?: string; pastPerformance?: string; isExperimental?: boolean }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are an Instagram strategy advisor specializing in the 2026 Trial Reels feature. Trial Reels: post a Reel shown only to non-followers initially. If it performs well in the trial (clears 5-8% engagement rate in Phase 1), you can publish to followers. This lets creators test risky or new content angles without damaging feed performance with existing audience. Use Trial Reels when: trying a new content format, testing a different topic angle, experimenting with a new persona, or when content might not land with existing followers but could appeal to new audiences. The Phase 1 window for Trial Reels is 24-48 hours — if metrics are strong, publish to followers; if weak, the content stays hidden.${creatorCtx}`
    }, {
      role: "user",
      content: `Advise on whether to use Trial Reels for this content.

Content angle: ${sanitizeForPrompt(data.contentAngle || "")}
Audience risk: ${sanitizeForPrompt(data.audienceRisk || "")}
Past performance on similar content: ${sanitizeForPrompt(data.pastPerformance || "")}
Is this experimental: ${data.isExperimental ? "yes" : "no"}

Assess:
1. Trial Reel recommendation — should this be trialled vs. direct published?
2. Risk profile — what's the downside if published directly to followers?
3. Trial success criteria — what Phase 1 metrics trigger promotion to followers?
4. Optimization for non-follower appeal — how to make Phase 1 succeed with strangers
5. Publish decision framework — at what engagement rate do you publish?

Return JSON: useTrialReel (boolean), trialReelReason (string), directPublishRisk (string), trialSuccessCriteria ({engagementRateThreshold: number, dmSharesNeeded: string, completionRateMin: number}), nonFollowerOptimizations (array of 3), publishDecision (string — "publish if X, hold if Y"), estimatedTrialOutcome ("strong"|"moderate"|"weak"|"unknown"), recommendation (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — THREADS (2 functions)
// ============================================================

export async function aiThreadsEngagementVelocityPlanner(data: { postContent?: string; targetPostingTime?: string; audienceTimezone?: string; currentFollowers?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Threads algorithm expert for 2026. The #1 ranking factor confirmed by Meta: engagement velocity — how quickly a post accumulates engagement after publishing. A post with 50 likes in 30 minutes outperforms a post with 100 likes over 24 hours. Early engagement is exponentially more valuable than late engagement. The make-or-break window is the first 60 minutes. Key signals (in weight order): engagement velocity (#1), reply depth (back-and-forth conversations, not just one-line replies), reposts and shares, likes, profile visits. What Threads penalizes: external links in main posts (kill reach — Meta wants users to stay), engagement bait (downranked actively per Mosseri), inconsistent posting (10x one day then disappearing = algorithm confusion), duplicate content. Threads rewards: 3-5 posts per day, images over pure text (+60% reach), reply depth, conversation threading.${creatorCtx}`
    }, {
      role: "user",
      content: `Design the engagement velocity strategy for this Threads post.

Post content: ${sanitizeForPrompt(data.postContent || "")}
Target posting time: ${sanitizeForPrompt(data.targetPostingTime || "")}
Audience timezone: ${sanitizeForPrompt(data.audienceTimezone || "")}
Current followers: ${sanitizeForPrompt(data.currentFollowers || "")}

Plan the first-60-minute velocity strategy:
1. Optimal posting time — when your followers are most active for immediate engagement
2. Engagement bait check — does the post contain phrases Threads penalizes?
3. Content rewrite for velocity — changes that increase reply depth probability
4. First-reply strategy — what to say in first reply to your own post (threading trick)
5. External link audit — is there a link that will kill reach?
6. Image recommendation — should an image be added?
7. 60-minute engagement target — what velocity means Phase 2 expansion?

Return JSON: optimalPostingTime (string), engagementBaitRisk ("none"|"low"|"high"), externalLinkPenalty (boolean), contentRewrite (string), firstReplyStrategy (string), imageRecommendation (string), velocityTarget ({likesIn30min: number, repliesIn30min: number, shareTarget: number}), estimatedReach ("limited"|"moderate"|"high"|"viral"), postingFrequencyAdvice (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiThreadsCommunityAdvisor(data: { postTopic?: string; contentType?: string; targetCommunities?: string; currentEngagementStyle?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Threads community strategy expert for 2026. Threads Communities launched October 2025 (100+ topics), expanded December 2025 (200+ topics with badges, flair, custom emoji). Communities have their own feeds — active community members get surfaced to interested users. Trending Now (expanded 2025-2026) identifies sudden engagement spikes around topics — posts using trending topics appear in search and related feeds. Threads has full keyword search (launched globally late 2024) — keyword-rich posts rank for queries. The cross-platform Instagram signal matters: accounts with active, engaged Instagram followings get early Threads distribution boost. Gaming creators should join: gaming-adjacent communities, specific game communities, tech communities, esports discussions. "Dear Algo" (September 2025): users can tell Threads what they want to see — meaning audience volatility is higher on Threads than passive platforms.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize this Threads content for community discovery and trending topics.

Post topic: ${sanitizeForPrompt(data.postTopic || "")}
Content type: ${sanitizeForPrompt(data.contentType || "")}
Target communities: ${sanitizeForPrompt(data.targetCommunities || "")}
Current engagement style: ${sanitizeForPrompt(data.currentEngagementStyle || "")}

Advise:
1. Community targeting — which Threads Communities to post in for this topic
2. Trending topic alignment — hashtags and topics currently trending for gaming/creator content
3. Keyword SEO for Threads search — phrases to include for search discoverability
4. Cross-Instagram signal optimization — how to leverage Instagram audience for Threads boost
5. Post format for community reach — text + image vs pure text vs thread format
6. Reply engagement strategy — how to spark reply depth (the #2 ranking signal)

Return JSON: recommendedCommunities (array of 3-5 community names), trendingTopics (array of 5), threadsSEOKeywords (array of 5), instagramCrossSignal (string), postFormatRecommendation (string), replyEngagementStrategy (string), contentRewrite (string — version optimized for community discovery), estimatedCommunityReach ("low"|"medium"|"high").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — TWITCH (3 functions)
// ============================================================

export async function aiTwitchCategoryOptimizer(data: { gameName?: string; currentViewerCount?: string; competitorCount?: string; streamingGoal?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Twitch growth strategist specializing in category selection for 2026. The category math is critical for non-established streamers. Avoid top 10 categories (League of Legends, Just Chatting, GTA RP, Valorant, FNITE) — too saturated, buried under big streamers. Target 100-2,000 viewer categories — enough audience browsing, not enough competition to bury you. Avoid dead categories under 50 viewers total — no one's browsing. The 2026 Discovery Feed (mobile-first vertical scroll) is the key growth lever: it uses personalized algorithm to serve clip previews and live snippets. Featured Clips (via Twitch's Clips Editor) get 40% higher tap-through rate. Channels using the Clips Editor compound on Discovery Feed. Stream Together (Drop Ins feature) is algorithmically boosted — combining streams expands both audiences.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize Twitch category strategy for maximum discoverability.

Game/category: ${sanitizeForPrompt(data.gameName || "")}
Current average viewers: ${sanitizeForPrompt(data.currentViewerCount || "")}
Estimated competitor count in category: ${sanitizeForPrompt(data.competitorCount || "")}
Streaming goal: ${sanitizeForPrompt(data.streamingGoal || "")}

Analyze and prescribe:
1. Category viability — is this category in the 100-2,000 viewer sweet spot?
2. Saturation assessment — too crowded, dead, or optimal?
3. Alternative categories — adjacent categories in the sweet spot
4. Discovery Feed optimization — clip style, vertical aspect ratio, length recommendations
5. Schedule for category — when the category is least crowded for maximum browse visibility
6. Stream Together opportunity — complementary categories for collaboration

Return JSON: categoryViability ("avoid"|"suboptimal"|"optimal"|"sweet_spot"), currentCategoryViewers (string), saturationLevel ("dead"|"low"|"optimal"|"saturated"|"oversaturated"), alternativeCategories (array of 3 with {name, estimatedViewers, competitionLevel}), discoveryFeedStrategy (string), optimalStreamingTimes (array of 3), streamTogetherOpportunity (string), expectedRankingPosition (string), actionPlan (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTwitchStreamHealthDiagnostic(data: { avgCCV?: string; chatVelocity?: string; avgWatchTime?: string; clipCreationRate?: string; streamDuration?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Twitch stream performance diagnostician. The 2026 Twitch ranking signals: CCV (concurrent viewers — primary browse sorting), chat velocity (messages per minute relative to CCV — high velocity signals engaged community), watch time per viewer (avg time per viewer — high avg = better signal), first 15 seconds retention (viewer clicks off in first 15s = immediate ranking penalty), follower conversion rate (follows per stream vs. viewer count), clip creation rate (viewers creating clips = high entertainment signal), raid and host network (raids = vote of confidence), schedule consistency (regular streaming builds algorithm data points), stream length (2-4 hours sweet spot — long enough for discovery, short enough to maintain energy). VOD storage: 100-hour cap since April 2025 — export important VODs before cap hits.${creatorCtx}`
    }, {
      role: "user",
      content: `Diagnose Twitch stream health from these performance metrics.

Average CCV: ${sanitizeForPrompt(data.avgCCV || "")}
Chat velocity (msgs/min): ${sanitizeForPrompt(data.chatVelocity || "")}
Average watch time per viewer: ${sanitizeForPrompt(data.avgWatchTime || "")}
Clip creation rate: ${sanitizeForPrompt(data.clipCreationRate || "")}
Stream duration: ${sanitizeForPrompt(data.streamDuration || "")}

Diagnose:
1. Signal health per metric — is each signal healthy, borderline, or failing?
2. Biggest ranking drag — which metric is hurting discovery most?
3. Chat velocity optimization — how to increase messages per minute
4. First-15-second retention — opening segment improvements
5. Clip strategy for Discovery Feed — how to get more viewer-created and self-created clips
6. VOD management — 100-hour cap exposure assessment

Return JSON: overallStreamHealth ("excellent"|"good"|"average"|"poor"|"critical"), signalScores ({ccv: number, chatVelocity: number, watchTime: number, clipRate: number}), biggestRankingDrag (string), chatVelocityFixes (array of 3), first15sStrategy (string), clipDiscoveryPlan (string), vodCapRisk (boolean), vodExportUrgency (string), weeklyActionPlan (array of 5 actions), discoveryFeedEligibility (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiTwitchRaidNetworkAdvisor(data: { channelName?: string; avgViewers?: string; category?: string; recentRaidHistory?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Twitch raid strategy specialist. Raids are Twitch's signature growth feature — sending your live audience to another streamer at end of stream. The strategic mechanics: reciprocal raids compound (similar-size streamers raid each other back), raids count toward Partner status (75 average CCV), receiving raids brings new viewers + signals community engagement. The 2026 network tools: Frostytools Vibe Raider does semantic community matching, Streams Charts Raid Finder provides historical raid data. Smart raid strategy: target similar-size streamers in your category (within 50-200% of your CCV), use the "Raided You" filter to identify reciprocal raiders, look at category overlap for natural audience fit, timing matters (raid at stream end when you have maximum viewers for impact). Stream Together (Drop Ins) is algorithmically boosted — treated as episodes, splits sub/bits revenue, combines audiences.${creatorCtx}`
    }, {
      role: "user",
      content: `Design a raid network strategy for this Twitch channel.

Channel name: ${sanitizeForPrompt(data.channelName || "")}
Average viewers: ${sanitizeForPrompt(data.avgViewers || "")}
Primary category: ${sanitizeForPrompt(data.category || "")}
Recent raid history: ${sanitizeForPrompt(data.recentRaidHistory || "")}

Build the network:
1. Ideal raid target profile — what channel size and category overlap to target
2. Reciprocal raid identification — how to find channels likely to raid back
3. Raid timing optimization — when to raid for maximum audience transfer
4. Stream Together candidates — categories/channels for collaboration boost
5. Raid cadence — how often to raid and in what sequence
6. Partner status acceleration — how raids contribute to 75 CCV requirement

Return JSON: idealRaidTargetProfile ({viewerRange: string, categoryOverlap: string, communityVibe: string}), reciprocalRaidStrategy (string), raidTimingRecommendation (string), streamTogetherCandidates (array of 3 channel types), raidCadence (string), partnerImpact (string), networkBuildingPlan (array of 5 weekly steps), estimatedCCVBoostFromRaids (string), toolRecommendations (array).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — KICK (2 functions)
// ============================================================

export async function aiKickPartnerQualificationTracker(data: { currentCCV?: string; monthlyStreamHours?: string; uniqueChatters?: string; followers?: string; activeSubscribers?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Kick Partner Program (KPP) qualification specialist. The 2026 KPP requirements: Verified tier — 30 days consistent streaming, 75 average CCV, 30 stream hours/month, 250 unique chatters, 250 followers. Partner tier — Verified + additional metrics around active subs and engagement. Hourly pay: $16-$32/hour for active streamers (unique to Kick — salary-like income). Pay frequency: weekly. Minimum payout: $10. The 95/5 revenue split: creator 95%, platform 5% (vs. Twitch 50/50). For 1,000 subs at $4.99/month: Kick = $4,740 to creator vs. Twitch standard = $2,495. The multistream toggle (2026): allows simulcast while maintaining Partner income, BUT income reduces 50% when multistreaming to other horizontal platforms (YouTube, Twitch). Kick-exclusive sessions maximize payout. Kick's discovery is minimal — viewer acquisition must come from TikTok, YouTube, Discord, Twitter.${creatorCtx}`
    }, {
      role: "user",
      content: `Analyze Kick Partner Program qualification status and gap plan.

Current average CCV: ${sanitizeForPrompt(data.currentCCV || "")}
Monthly stream hours: ${sanitizeForPrompt(data.monthlyStreamHours || "")}
Unique chatters per month: ${sanitizeForPrompt(data.uniqueChatters || "")}
Followers: ${sanitizeForPrompt(data.followers || "")}
Active subscribers: ${sanitizeForPrompt(data.activeSubscribers || "")}

Compute:
1. Current qualification status — Verified tier or Partner tier?
2. Gap analysis — which metrics need improvement and by how much?
3. Time-to-qualification estimate — at current growth rate, weeks/months to qualify
4. Hourly payout estimate — projected $16-32/hour income at current metrics
5. Monthly revenue projection — KPP + subs at 95/5
6. Multistream strategy — exclusive vs. simulcast income tradeoff

Return JSON: qualificationStatus ("not_eligible"|"close"|"verified"|"partner"), tierProgress ({ccv: {current, required, gap}, hours: {current, required, gap}, chatters: {current, required, gap}, followers: {current, required, gap}}), estimatedTimeToVerified (string), hourlyPayEstimate (string), monthlyRevenueProjection ({kpp: string, subscriptions: string, total: string}), multiStreamIncomeImpact (string), priorityActions (array of 3 highest-impact actions), kickVsTwitchRevenueDelta (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiKickMultistreamStrategy(data: { currentRevenue?: string; primaryPlatform?: string; averageViewers?: string; streamingDaysPerWeek?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Kick multistream income strategy advisor. The 2026 Kick multistream mechanics: the Multistream toggle enables simulcasting while maintaining Partner income, but reduces Partner income by 50% when streaming to other "horizontal" platforms (YouTube, Twitch). Kick-exclusive streams maximize per-stream payout. The optimal strategy: use multistream for discovery/community sessions, schedule some Kick-exclusive sessions to maximize payout. The economics work because even at 50% reduced rate, the 95/5 split still beats Twitch's 50/50 on subscription revenue. The revenue stack for a mid-tier streamer: KPP hourly ($16-32/hr), subscriptions (95% of $4.99-$24.99/mo), donations/tips via Stripe integration (~80% to creator). Kick's audience must come from off-platform — it's a monetization upgrade for already-established audiences, not a discovery play.${creatorCtx}`
    }, {
      role: "user",
      content: `Design the optimal Kick multistream vs. exclusive session schedule.

Current monthly revenue: ${sanitizeForPrompt(data.currentRevenue || "")}
Primary streaming platform: ${sanitizeForPrompt(data.primaryPlatform || "")}
Average concurrent viewers: ${sanitizeForPrompt(data.averageViewers || "")}
Streaming days per week: ${sanitizeForPrompt(data.streamingDaysPerWeek || "")}

Model the strategy:
1. Multistream schedule — how many days to simulcast vs. Kick-exclusive
2. Revenue comparison — multistream (50% KPP) vs. exclusive (100% KPP) per session
3. Discovery vs. monetization balance — when to multistream for growth, when for revenue
4. Kick-exclusive content types — what content works best for Kick-only audiences
5. Monthly revenue uplift — how Kick additions impact total income
6. Viewer migration strategy — how to move viewers from other platforms to Kick

Return JSON: recommendedSchedule ({multistreamDays: number, kickExclusiveDays: number, weeklyPattern: string}), revenueModel ({multistreamDayRevenue: string, exclusiveDayRevenue: string, monthlyUplift: string}), discoveryVsMonetizationBalance (string), kickExclusiveContentTypes (array of 3), viewerMigrationStrategy (string), kickRevenueAtCurrentScale (string), breakEvenAnalysis (string), implementationTimeline (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — RUMBLE (2 functions)
// ============================================================

export async function aiRumbleLicenseAdvisor(data: { contentType?: string; isPrimaryOnYouTube?: boolean; viralPotential?: string; monetizationPriority?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Rumble monetization strategist. When uploading to Rumble, creators choose a licensing option that determines revenue rights: Rumble Only (exclusive to Rumble, highest revenue share — best for viral potential), Non-Exclusive Video Management (Rumble can syndicate/license content to third parties — good for additional licensing revenue from news outlets), Personal Use (lowest revenue share, maintains all rights — use when YouTube is primary and you want to keep YouTube monetization). Rumble's economics: RPM $2-10/1000 views (vs. YouTube $1-5), 60/40 revenue split (creator gets 60%), Creator Program bonus from Rumble Premium signups and watch time, Rumble Rants donations (~80% to creator). Creator Program eligibility: stream 30+ hours via Rumble Studio/month, 5+ hours to Rumble Premium, good standing. Viral content licensing to news media can generate substantial one-time payments.${creatorCtx}`
    }, {
      role: "user",
      content: `Recommend the optimal Rumble license type for this content.

Content type: ${sanitizeForPrompt(data.contentType || "")}
Primary platform is YouTube: ${data.isPrimaryOnYouTube ? "yes" : "no/unknown"}
Viral potential assessment: ${sanitizeForPrompt(data.viralPotential || "")}
Monetization priority: ${sanitizeForPrompt(data.monetizationPriority || "")}

Advise on:
1. License recommendation — Rumble Only, Non-Exclusive, or Personal Use?
2. Revenue impact — how much each license type earns per 10,000 views
3. YouTube compatibility — does this choice conflict with YouTube monetization?
4. Licensing revenue opportunity — is this content newsworthy/syndication-worthy?
5. Creator Program qualification — does upload frequency and type qualify?
6. Upload timing — 24-48 hour YouTube-first delay strategy

Return JSON: recommendedLicense ("rumble_only"|"non_exclusive"|"personal_use"), licenseReason (string), revenueComparison ({rumbleOnly: string, nonExclusive: string, personalUse: string}), youtubeCompatibility (string), licensingRevenuePotential ("none"|"low"|"medium"|"high"), creatorProgramEligibility (boolean), uploadStrategy (string), estimatedMonthlyRevenue (string), rumbleVsYouTubeStrategy (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRumbleAudienceFitAnalyzer(data: { contentTopic?: string; contentStyle?: string; targetAge?: string; currentYouTubeAudience?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Rumble audience fit analyst. Rumble's 2026 audience demographics are structurally different from YouTube: older skew (35-65 dominant), more US-centric, news/politics/comedy heavy interest, lower tolerance for advertising, higher engagement per viewer, more likely to support creators directly via Rumble Rants. Content that performs on Rumble: commentary, news, alternative perspectives, IRL gaming commentary, veteran gaming content. Content that struggles: trend-chasing, lifestyle, fashion, younger-skewing gaming content (Fortnite, Roblox). For gaming specifically: commentary and analysis performs better than pure gameplay, veteran game titles outperform current trends, "old school" gaming nostalgia resonates, military shooters (Battlefield, CoD) align better than battle royale trends.${creatorCtx}`
    }, {
      role: "user",
      content: `Analyze this content's fit with Rumble's 2026 audience.

Content topic: ${sanitizeForPrompt(data.contentTopic || "")}
Content style: ${sanitizeForPrompt(data.contentStyle || "")}
Target age demographic: ${sanitizeForPrompt(data.targetAge || "")}
Current YouTube audience description: ${sanitizeForPrompt(data.currentYouTubeAudience || "")}

Assess:
1. Audience fit score — how aligned is this content with Rumble's 35-65 demographic?
2. Content adaptation — what changes make it land better with Rumble audience?
3. Rumble-specific opportunity — what about this content uniquely suits Rumble?
4. Title and description optimization — how to adjust for Rumble's search and older audience
5. Rumble Rants potential — will this audience donate?
6. Cross-post timing — YouTube first then Rumble 24-48h delay, or simultaneous?

Return JSON: audienceFitScore (0-100), fitAssessment ("poor"|"below_average"|"average"|"good"|"excellent"), contentAdaptations (array of 3 specific changes), rumbleSpecificOpportunity (string), titleOptimization (string), descriptionOptimization (string), rumbleRantsPotential ("low"|"medium"|"high"), crossPostStrategy (string), estimatedRumbleRPM (string), recommendation ("primary"|"secondary"|"skip").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — REDDIT (2 functions)
// ============================================================

export async function aiRedditDemandSensor(data: { subreddit?: string; topPosts?: string; timeframe?: string; contentNiche?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Reddit demand sensing specialist for creator content strategy. Reddit's value to creators is listening, not posting — it's where specific audiences openly express what they want, complain about gaps, ask unanswered questions, and celebrate content they love. The listening use cases: demand sensing (what questions does my audience ask in r/Battlefield?), trend detection (emerging memes and inside jokes, pre-launch hype, patch/update sentiment), content idea sourcing (high-upvote questions become video topics, common complaints become tutorial opportunities, disputed claims become fact-check content), competitive intelligence (what competitors get praised/criticized). Reddit's Hot algorithm: upvote velocity in first hour is the key signal — 50-200 upvotes at 60 min = alive, 200+ = strong position for mid-size subreddits.${creatorCtx}`
    }, {
      role: "user",
      content: `Analyze these Reddit top posts to extract content ideas and demand signals.

Subreddit: ${sanitizeForPrompt(data.subreddit || "")}
Top posts (titles/scores): ${sanitizeForPrompt(data.topPosts || "")}
Timeframe: ${sanitizeForPrompt(data.timeframe || "past week")}
Creator content niche: ${sanitizeForPrompt(data.contentNiche || "")}

Extract actionable intelligence:
1. Top content gaps — questions community asks that no creator has answered well
2. Video ideas — top 5 high-upvote post topics converted to YouTube video concepts
3. Community pain points — recurring complaints that become tutorial opportunities
4. Trending topics — sudden spikes around specific subjects (patches, releases, meta shifts)
5. Competitor intelligence — what types of content the community praises/criticizes
6. Optimal Reddit posting strategy — when and how to post for maximum upvote velocity

Return JSON: contentGaps (array of 3 {gap, videoTitle, estimatedDemand}), videoIdeas (array of 5 {title, concept, subredditSource, upvoteSignal}), communityPainPoints (array of 3), trendingTopics (array of 3 {topic, trend, urgencyWindow}), competitorInsights (string), optimalPostingStrategy ({timing: string, format: string, subredditApproach: string}), demandStrength ("weak"|"moderate"|"strong"|"very_strong"), topOpportunity (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiRedditSubredditTargeter(data: { videoTopic?: string; targetAudience?: string; currentSubreddits?: string; contentType?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Reddit subreddit strategy advisor. Each subreddit is a semi-autonomous ecosystem with custom rules, karma requirements, account age requirements, AutoModerator filters. Mid-size subreddits (100K-1M members) are the strategic sweet spot — competition is lower, decay rate more forgiving (posts can sustain visibility for 3-6 hours), real traffic potential. Large subreddits (1M+) require hundreds of upvotes in the first hour. Small subreddits (under 100K) have slower decay but limited audience. The 9:1 rule: at most 1 in 10 posts should be self-promotion — violations get downvoted. The first-hour window matters most. Subreddit culture varies — r/gamingleaksandrumours vs. r/Games have completely different post norms even in "gaming."${creatorCtx}`
    }, {
      role: "user",
      content: `Identify the best subreddits to monitor and selectively post in for this content.

Video topic: ${sanitizeForPrompt(data.videoTopic || "")}
Target audience: ${sanitizeForPrompt(data.targetAudience || "")}
Currently monitored subreddits: ${sanitizeForPrompt(data.currentSubreddits || "")}
Content type: ${sanitizeForPrompt(data.contentType || "")}

Recommend:
1. Monitoring targets — subreddits to listen to for demand sensing (not necessarily post in)
2. Posting opportunities — subreddits where this content could get upvotes (with rules check)
3. Subreddit size tier — optimal size range for this content type
4. Account karma requirements — are there barriers to posting in these subreddits?
5. Post format guidance — what works in each subreddit (video link, text post, discussion)
6. 9:1 compliance plan — how to build Reddit karma legitimately before self-promotion

Return JSON: monitoringTargets (array of 5 {subreddit, memberCount, purpose, monitorFor}), postingOpportunities (array of 3 {subreddit, fit: "excellent"|"good"|"risky", rules, postFormat}), optimalSizeRange (string), karmaBarriers (string), postFormatBySubreddit ({subreddit: string, format: string}[]), karmaStrategy (string), redditNativeStrategy (string), estimatedTrafficPotential (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — DISCORD (2 functions)
// ============================================================

export async function aiDiscordCommunityHealthAnalyzer(data: { memberCount?: string; activeMembersLast7Days?: string; serverSubscriptionRate?: string; streamAlertClickRate?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Discord community health specialist. Discord's five creator functions: community center (audience between content drops), tier-1 fan conversion (Discord members are 10-100× more engaged than passive YouTube subs, conversion to paid membership dramatically higher), mobilization layer (first audience for new content/merch/events), feedback mechanism (higher signal than comment sections), social proof generator ("10K member Discord" builds credibility). Discord Server Subscriptions: creator gets ~85% (Discord takes ~15%), $0.99-$99.99/mo tiers, conversion from active Discord member to paid sub is significantly higher than from social followers. Rate limits matter: global 50 req/sec, 120 events/60s per WebSocket, 1,000 identifies/24h. Sharding recommended at 2,000 guilds, mandatory at 2,500+.${creatorCtx}`
    }, {
      role: "user",
      content: `Diagnose Discord community health and optimize for retention and conversion.

Total members: ${sanitizeForPrompt(data.memberCount || "")}
Active members (messages in last 7 days): ${sanitizeForPrompt(data.activeMembersLast7Days || "")}
Server Subscription conversion rate: ${sanitizeForPrompt(data.serverSubscriptionRate || "")}
Stream alert click-through rate: ${sanitizeForPrompt(data.streamAlertClickRate || "")}

Diagnose:
1. Community health score — healthy, at risk, or dormant?
2. Active/total member ratio — engagement depth assessment
3. Server Subscription conversion opportunity — how to increase paid conversion
4. Stream alert effectiveness — is Discord actually driving viewers to streams?
5. Server structure optimization — channel organization for maximum engagement
6. Cross-platform role sync — YouTube member → Discord role integration

Return JSON: communityHealthScore (0-100), healthGrade ("excellent"|"healthy"|"average"|"at_risk"|"dormant"), activeRatio (number — active/total), activationSuggestions (array of 3 to boost active members), subscriptionConversionPlan (string), streamAlertOptimization (string), serverStructureRecommendations (array of 3), crossPlatformRoleSync (string), monthlyRevenueFromServerSubs (string), topPriorityFix (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiDiscordAlertStrategyAdvisor(data: { platforms?: string; currentAlertChannels?: string; typicalStreamTime?: string; discordMemberTimezone?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Discord cross-platform alert strategy specialist. Discord's role in the creator stack: it's the mobilization layer — the first audience that shows up for new content, live streams, and events. Alert mechanics that work: timing (ping when audience is online, avoid off-hours), @mention discipline (reserve @everyone for major events only — overuse causes notification fatigue), embed formatting (rich embeds with thumbnail and stream title get higher click-through than plain text), cross-platform integration (stream start → Discord ping, YouTube upload → Discord announcement, TikTok milestone → community celebration). Discord's Announcement channels broadcast to other servers — if partnered with other creators, this extends alert reach. Stage channels for live AMAs → exportable content. Rate limits: don't exceed 50 req/sec global.${creatorCtx}`
    }, {
      role: "user",
      content: `Design the optimal Discord cross-platform alert strategy.

Platforms: ${sanitizeForPrompt(data.platforms || "")}
Current alert channels: ${sanitizeForPrompt(data.currentAlertChannels || "")}
Typical stream time: ${sanitizeForPrompt(data.typicalStreamTime || "")}
Discord member timezone concentration: ${sanitizeForPrompt(data.discordMemberTimezone || "")}

Design:
1. Alert channel architecture — which channels serve which alert types
2. Stream go-live alert — optimal format, timing, embed fields
3. Upload announcement — YouTube/TikTok post notification format
4. @mention strategy — when to use @everyone vs. @here vs. role mentions
5. Rate limit safety — how to batch alerts to stay under 50 req/sec
6. Stage channel content calendar — AMAs and listening parties

Return JSON: channelArchitecture ({channelName: string, purpose: string}[]), streamGoLiveTemplate (string), uploadAnnouncementTemplate (string), mentionStrategy ({everyone: string, here: string, roles: string}), rateLimitSafetyPlan (string), stageChannelCalendar (string), alertTimingWindows (array of 2-3), estimatedAlertClickThrough (string), crossPlatformSyncPlan (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — GMAIL (2 functions)
// ============================================================

export async function aiGmailSponsorshipTriager(data: { emailSubject?: string; emailSender?: string; emailBody?: string; senderDomain?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a creator business email triage specialist. For a gaming creator, inbound emails fall into priority tiers: TIER 1 — Brand partnership inquiry from known company (real budget, named brand, specific campaign), TIER 2 — Agency outreach for a named client (intermediary but real deal), TIER 3 — Affiliate/product seeding offer (free product, no guarantee), TIER 4 — Fan mail or community message (no business value, but relationship value), TIER 5 — Spam/scam (fake brand deals, phishing, irrelevant). High-value indicators: company email domain (not gmail.com), specific campaign brief or budget mentioned, relevant brand to gaming audience, professional signature. Red flags: gmail/hotmail sender, vague "collaboration" language, requests for personal info first, no mention of budget or deliverables. First-touch auto-reply: acknowledge receipt, set expectation for response time, ask for media kit requirements.${creatorCtx}`
    }, {
      role: "user",
      content: `Triage and assess this inbound email for sponsorship potential.

Subject: ${sanitizeForPrompt(data.emailSubject || "")}
Sender: ${sanitizeForPrompt(data.emailSender || "")}
Sender domain: ${sanitizeForPrompt(data.senderDomain || "")}
Email body: ${sanitizeForPrompt(data.emailBody || "")}

Triage:
1. Tier classification — what type of email is this?
2. Legitimacy score — is this a real opportunity?
3. Revenue potential — estimated deal value if genuine
4. Priority response time — how quickly to respond?
5. First-touch reply — draft a professional first response
6. Red flags or green flags — what signals legitimacy or fraud

Return JSON: tier (1-5), tierLabel (string), legitimacyScore (0-100), estimatedDealValue (string), priorityResponseTime (string — e.g. "within 2 hours", "24 hours", "skip"), firstTouchReply (string — draft reply), greenFlags (array), redFlags (array), recommendedAction ("respond_immediately"|"respond_within_24h"|"request_more_info"|"decline"|"ignore"), followUpSteps (array of 2-3).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiGmailDeliverabilityAdvisor(data: { senderDomain?: string; emailType?: string; estimatedVolume?: string; currentSpamRate?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Gmail deliverability specialist for 2026. The 2024-2026 deliverability transformation: Google, Yahoo, and Apple require all bulk senders (5,000+/day) to implement SPF, DKIM, DMARC. November 2025: Postmaster Tools v2 replaced legacy reputation with binary Pass/Fail Compliance Status. Non-compliant traffic gets 4xx temporary deferrals, slower delivery, and 5xx rejections. The authentication trinity: SPF (DNS record specifying authorized IPs), DKIM (cryptographic signature on messages — 2048-bit recommended), DMARC (policy tying SPF/DKIM together — minimum p=quarantine for serious senders). Spam rate thresholds: below 0.1% = healthy, 0.1-0.3% = inbox delivery impacted, above 0.3% = ineligible for mitigation, above 0.3% for 7+ days = account flagged. Gmail tabs: Promotions tab has 30-50% lower open rates than Primary. Cold outreach for sponsorships requires warmed domains.${creatorCtx}`
    }, {
      role: "user",
      content: `Audit email deliverability setup and recommend compliance improvements.

Sender domain: ${sanitizeForPrompt(data.senderDomain || "")}
Email type: ${sanitizeForPrompt(data.emailType || "")}
Estimated monthly send volume: ${sanitizeForPrompt(data.estimatedVolume || "")}
Current spam rate: ${sanitizeForPrompt(data.currentSpamRate || "")}

Audit:
1. SPF/DKIM/DMARC compliance status — configured correctly?
2. Postmaster Tools v2 risk — Pass or likely Fail status?
3. Spam rate health — is current rate sustainable?
4. Inbox tab placement — Primary or Promotions?
5. Cold outreach compliance — domain warmed enough for sponsorship outreach?
6. Immediate fixes — what to configure today

Return JSON: complianceStatus ("compliant"|"at_risk"|"non_compliant"|"unknown"), spfStatus ("configured"|"missing"|"incorrect"), dkimStatus ("configured_2048bit"|"configured_1024bit"|"missing"), dmarcPolicy ("reject"|"quarantine"|"none"|"missing"), spamRateHealth ("healthy"|"warning"|"critical"|"flagged"), inboxPlacement (string), postmasterRisk ("pass"|"fail_risk"|"unknown"), immediateActions (array of 3-5 specific DNS/settings changes), coldOutreachReadiness (string), estimatedDeliveryRate (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// PLATFORM INTELLIGENCE — STRIPE (2 functions)
// ============================================================

export async function aiStripeRevenueHealthAnalyzer(data: { mrr?: string; churnRate?: string; trialToPaidRate?: string; averageSubscriptionValue?: string; failedPaymentRate?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a creator subscription revenue health analyst. The key metrics for a creator subscription business: MRR (monthly recurring revenue — target growth rate 10-20% MoM for early stage), churn rate (monthly % of subscribers who cancel — healthy SaaS is under 5%/mo, creator subs under 3%/mo for engaged communities), trial-to-paid conversion (healthy is 15-25% for free trials), average subscription value (blend of tier pricing), CLV (customer lifetime value — avg sub value / monthly churn rate). Revenue recovery via Stripe Smart Retries saves 30-40% of failed payments. The subscription status lifecycle: trialing → active → past_due → canceled. past_due recovery within 7-14 days is critical — after 14 days, churn probability spikes 70%. Discord Server Subscriptions and Stripe can work in parallel.${creatorCtx}`
    }, {
      role: "user",
      content: `Diagnose subscription revenue health and identify growth opportunities.

Monthly recurring revenue: ${sanitizeForPrompt(data.mrr || "")}
Monthly churn rate: ${sanitizeForPrompt(data.churnRate || "")}
Trial-to-paid conversion rate: ${sanitizeForPrompt(data.trialToPaidRate || "")}
Average subscription value: ${sanitizeForPrompt(data.averageSubscriptionValue || "")}
Failed payment rate: ${sanitizeForPrompt(data.failedPaymentRate || "")}

Diagnose and prescribe:
1. Revenue health grade — is this business growing, stable, or declining?
2. Churn assessment — is churn rate healthy or unsustainable?
3. LTV calculation — customer lifetime value at current metrics
4. Biggest revenue leak — which metric to fix first?
5. Growth levers — what changes have highest ROI?
6. 90-day revenue forecast — at current trajectory

Return JSON: revenueHealthGrade ("A"|"B"|"C"|"D"|"F"), mrrGrowthAssessment (string), churnAssessment ("excellent"|"healthy"|"concerning"|"critical"), calculatedLTV (string), biggestRevenueLeak (string), topGrowthLevers (array of 3 {lever, estimatedImpact, implementation}), ninetyDayForecast (string), benchmarkComparisons (object), immediateActions (array of 3), revenueOptimizationScore (0-100).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiStripeSubscriptionRecoveryAdvisor(data: { failedPaymentCount?: string; pastDueRevenue?: string; avgDaysBeforeChurn?: string; retrySchedule?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a Stripe subscription payment recovery specialist. Stripe's Smart Retries uses ML to time retries when cards are most likely to succeed (avoids days 1-3 post-failure when users are most likely to cancel if notified). Stripe's revenue recovery features: Smart Retries (ML retry timing), Card Updater (auto-updates card numbers from networks — catches physical card replacements), dunning emails (automated failure notifications). Past-due recovery window: if payment fails on day 1, retry within 3-7 days has 40-60% recovery rate; after 14 days, recovery rate drops to under 20%. The 30-40% savings claim: Stripe's revenue recovery genuinely saves ~30-40% of failed payments that would otherwise churn. Critical implementation: use webhook events (invoice.payment_failed, customer.subscription.updated, invoice.payment_action_required) not polling. Customer self-service portal lets subscribers update cards without contacting support.${creatorCtx}`
    }, {
      role: "user",
      content: `Optimize failed payment recovery to reduce involuntary churn.

Failed payment count: ${sanitizeForPrompt(data.failedPaymentCount || "")}
Past-due revenue at risk: ${sanitizeForPrompt(data.pastDueRevenue || "")}
Average days before subscriber churns: ${sanitizeForPrompt(data.avgDaysBeforeChurn || "")}
Current retry schedule: ${sanitizeForPrompt(data.retrySchedule || "")}

Prescribe:
1. Smart Retry configuration — optimal retry timing based on failure patterns
2. Recovery email sequence — what to send and when after payment failure
3. Customer portal urgency — self-service card update flow
4. Revenue recovery estimate — how much of at-risk revenue is recoverable?
5. Webhook events to handle — which events require immediate action
6. Dunning escalation — when to pause access vs. maintain while retrying

Return JSON: smartRetryRecommendation (string), recoveryEmailSequence (array of {day: number, action: string, message: string}), estimatedRecoveryRate (string), estimatedRecoverableRevenue (string), webhookPriority (array of {event, action, urgency}), accessPauseThreshold (string), customerPortalUrgency (string), monthlyRevenueProtected (string), implementationSteps (array of 4).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

// ============================================================
// CROSS-PLATFORM INTELLIGENCE (4 functions)
// ============================================================

export async function aiWatermarkIntegrityChecker(data: { sourceplatform?: string; targetPlatform?: string; contentType?: string; syndication?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a cross-platform content integrity specialist focused on watermark suppression risks. In 2026, all major platforms have AI-powered watermark detection: TikTok detects Instagram Reels watermarks (gradient overlay + IG logo), CapCut watermarks, YouTube Shorts watermarks. Instagram detects TikTok watermarks. YouTube Shorts detects both. Detected watermarks result in immediate FYP suppression, Reels exclusion from non-follower reach, and Shorts downranking. The 2025-2026 Originality Score systems on TikTok and Instagram de-prioritize recycled content even beyond watermarks — they detect visual fingerprints. The correct cross-posting pattern: always source from raw files without platform chrome, re-export per-platform with native specs, never just download from one platform and reupload to another. Don't crop watermarks — visual classifiers detect the underlying content fingerprint.${creatorCtx}`
    }, {
      role: "user",
      content: `Assess the watermark risk for cross-posting this content.

Source platform: ${sanitizeForPrompt(data.sourceplatform || "")}
Target platform: ${sanitizeForPrompt(data.targetPlatform || "")}
Content type: ${sanitizeForPrompt(data.contentType || "")}
Syndication method: ${sanitizeForPrompt(data.syndication || "")}

Assess every watermark risk vector:
1. Platform pair risk — source → target suppression probability
2. Specific watermarks present — what the target platform's classifier will detect
3. Fingerprint risk — even if watermarks removed, is the visual fingerprint flagged?
4. Reach suppression estimate — how much reach is lost if flagged?
5. Clean syndication path — exact steps to remove watermarks and re-export
6. Safe cross-posting matrix — which platform pairs are low/high risk

Return JSON: riskLevel ("safe"|"low"|"medium"|"high"|"critical"), specificWatermarkRisks (array of {watermark, platform, detectability}), fingerprintRisk (string), estimatedReachSuppression (string), cleanSyndicationPath (array of steps), safePlatformPairs (array of {from, to, riskLevel}), riskySyndicationMethods (array), recommendation ("safe_to_post"|"re_export_first"|"source_raw_files"|"do_not_syndicate").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiConnectionHealthScorer(data: { platforms?: string; recentErrors?: string; tokenStatus?: string; webhookStatus?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a CreatorOS Connection Fabric health diagnostician. Each platform in the stack has distinct failure modes: YouTube — quota exhaustion (10K units/day, resets midnight Pacific), token expiry (1 hour access tokens), API rate limits. TikTok — 1000 req/day per token, 2-hour access tokens, 1-year refresh. Instagram — 200 calls/hour per user, 60-day long-lived tokens. Twitch — 800 req/min authenticated, 4-hour tokens. Kick — WebSocket Pusher based, less strict limits. Discord — 50 req/sec global, 120 events/60s WebSocket, 1000 identifies/24h. Gmail — 1B quota units/day, 250 units/sec per user. Stripe — 100 read/write ops/sec. Token health states: healthy, expiring_soon (within 24h), failed_refresh, invalid. Webhook health: active, inactive, failed. Per-platform fallback behaviors should activate when health degrades.${creatorCtx}`
    }, {
      role: "user",
      content: `Score the health of these platform connections and recommend remediation.

Connected platforms: ${sanitizeForPrompt(data.platforms || "")}
Recent API errors: ${sanitizeForPrompt(data.recentErrors || "")}
Token statuses: ${sanitizeForPrompt(data.tokenStatus || "")}
Webhook statuses: ${sanitizeForPrompt(data.webhookStatus || "")}

Compute composite health scores:
1. Per-platform health grade — each platform scored 0-100
2. Critical failures — platforms that need immediate attention
3. Token refresh priorities — which tokens expire soonest
4. Rate limit headroom — which platforms are near quota limits
5. Webhook reliability — which webhooks are failing or inactive
6. Recommended fallback activations — what to do when each platform degrades

Return JSON: overallFabricHealth (0-100), platformScores ({platform: string, score: number, status: "healthy"|"degraded"|"failing"|"critical", issues: string[]}[]), criticalFailures (array), tokenRefreshPriorities (array), rateLimitWarnings (array), webhookIssues (array), recommendedFallbacks ({platform, fallback}[]), actionPlan (array of {priority: number, action: string, platform: string}), fabricStatus ("all_systems_go"|"degraded"|"partial_outage"|"critical").`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiContentSyndicationPlanner(data: { contentType?: string; primaryPlatform?: string; contentDuration?: string; targetPlatforms?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a cross-platform content syndication strategist for a gaming creator. The 2026 syndication matrix: Long-form → Short-form pipeline (YouTube long-form → AI highlight extraction → vertical 30-60s → auto-publish to YouTube Shorts, TikTok, Instagram Reels). Live → VOD → Clips pipeline (YouTube+Twitch+Kick+Rumble live → VOD captured → AI highlights → clips to short-form → stream summary to Threads, Reddit → Discord community announcement). Content repurposing matrix: long video → multiple short clips, stream highlights → TikTok/Reels/Shorts, tutorial content → Threads posts, Q&A content → Reddit, engagement content → Discord polls. Critical 2026 rule: never directly cross-post with watermarks — always re-export from raw. The originality score on both TikTok and Instagram penalizes recycled content, so each platform needs slightly adapted framing even if the core content is the same.${creatorCtx}`
    }, {
      role: "user",
      content: `Plan the full cross-platform syndication strategy for this content.

Content type: ${sanitizeForPrompt(data.contentType || "")}
Primary platform: ${sanitizeForPrompt(data.primaryPlatform || "")}
Content duration: ${sanitizeForPrompt(data.contentDuration || "")}
Target platforms: ${sanitizeForPrompt(data.targetPlatforms || "")}

Build the syndication map:
1. Primary publish — first platform and optimal time
2. Short-form derivatives — clip strategy for TikTok, Reels, Shorts
3. Text derivatives — Threads posts, Reddit moments
4. Community distribution — Discord announcement, Reddit post timing
5. Timing sequence — exact order and delays between platform publishes
6. Platform adaptation — what changes for each platform (title, description, format)
7. Watermark safety plan — clean export path per platform pair

Return JSON: publishSequence (array of {step: number, platform, action, delay, adaptations}), shortFormDerivatives (array of {platform, clipLength, hookStrategy, timing}), textDerivatives (array of {platform, format, content}), communityDistribution (string), syndicationTimeline (string), platformAdaptations ({platform: string, changes: string[]}[]), watermarkSafetyPlan (string), totalReachMultiplier (string), estimatedPlatformReach ({platform: string, estimatedViews: string}[]).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

export async function aiPlatformComplianceAuditor(data: { contentDescription?: string; contentTitle?: string; platforms?: string; contentCategory?: string }, userId?: string) {
  const creatorCtx = await getCreatorContext(userId);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "system",
      content: `You are a multi-platform content compliance specialist for 2026. Each platform has different content policies with different consequences for violations: YouTube — Community Guidelines strikes (1st strike: warning/restriction, 2nd: 2-week upload ban, 3rd: channel termination), YPP suspension risk, age-restriction reduces reach by 80-90%. TikTok — account strike system, FYP suppression for 24-72 hours even for minor violations, originality score. Instagram — Reels exclusion from recommendations for guideline violations. Twitch — partnership suspension, stream removal. Kick — more permissive but gambling-adjacent content and advertiser-cautious categories. Rumble — more permissive than YouTube on commentary, stricter than Kick. Discord — server trust and safety review. Cross-platform trust bands: YouTube = red (highest caution), YouTube Live = orange, TikTok/Instagram/Threads/Reddit = yellow, Discord = green, Gmail/Stripe = blue.${creatorCtx}`
    }, {
      role: "user",
      content: `Run a multi-platform compliance audit on this content before publishing.

Content description: ${sanitizeForPrompt(data.contentDescription || "")}
Content title: ${sanitizeForPrompt(data.contentTitle || "")}
Target platforms: ${sanitizeForPrompt(data.platforms || "")}
Content category: ${sanitizeForPrompt(data.contentCategory || "")}

Audit per platform:
1. YouTube risk — monetization, age-restriction, or strike risk?
2. TikTok risk — FYP suppression, originality, strike risk?
3. Instagram risk — Reels recommendation exclusion risk?
4. Twitch risk — partnership-safe?
5. Kick risk — KPP-eligible content?
6. Cross-platform compliance summary — which platforms are safe to publish on?

Return JSON: overallComplianceRisk ("clean"|"caution"|"high_risk"|"do_not_publish"), platformAudits ({platform: string, riskLevel: "safe"|"caution"|"high"|"prohibited", issues: string[], recommendation: string}[]), monetizationRisk (string), ageRestrictionRisk (string), strikeRisk (string), safePlatforms (array), riskyPlatforms (array), contentModifications (array of changes that reduce risk), trustBandAssignment (string), finalRecommendation (string).`
    }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}
