import { db } from "../db";
import { aiMusicTracks } from "@shared/schema";
import { eq, and, desc, gte, count } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";

const logger = createLogger("ai-music-composer");

const COMPOSITION_CYCLE_MS = 6 * 3600_000;
let composerInterval: ReturnType<typeof setInterval> | null = null;

const GAMING_MUSIC_GENRES = [
  { genre: "ambient", mood: "atmospheric", desc: "Ethereal pads, reverb-heavy textures, slow-evolving soundscapes" },
  { genre: "synthwave", mood: "energetic", desc: "80s-inspired synths, driving bass, neon-tinged melodies" },
  { genre: "lo-fi", mood: "chill", desc: "Warm vinyl crackle, jazzy chords, relaxed hip-hop beats" },
  { genre: "orchestral", mood: "epic", desc: "Full orchestra, dramatic swells, cinematic tension and release" },
  { genre: "electronic", mood: "intense", desc: "Hard-hitting drops, glitchy textures, pulsing rhythms" },
  { genre: "dark-ambient", mood: "suspenseful", desc: "Drones, industrial textures, unsettling harmonics" },
  { genre: "chiptune", mood: "nostalgic", desc: "8-bit arpeggios, retro game sounds, catchy melodies" },
  { genre: "cinematic", mood: "dramatic", desc: "Film-score style, emotional themes, dynamic range" },
  { genre: "jazz-fusion", mood: "smooth", desc: "Complex chords, walking bass, improvisational feel" },
  { genre: "post-rock", mood: "building", desc: "Delayed guitars, crescendo builds, emotional climaxes" },
];

const GAME_MOOD_MAP: Record<string, string[]> = {
  "horror": ["dark-ambient", "suspenseful", "cinematic"],
  "action": ["synthwave", "electronic", "orchestral"],
  "adventure": ["orchestral", "cinematic", "ambient"],
  "rpg": ["orchestral", "ambient", "post-rock"],
  "racing": ["electronic", "synthwave", "energetic"],
  "sports": ["electronic", "hip-hop", "energetic"],
  "puzzle": ["lo-fi", "ambient", "chiptune"],
  "fighting": ["electronic", "synthwave", "intense"],
  "souls-like": ["dark-ambient", "orchestral", "cinematic"],
  "open-world": ["ambient", "orchestral", "post-rock"],
  "stealth": ["jazz-fusion", "ambient", "suspenseful"],
  "platformer": ["chiptune", "lo-fi", "energetic"],
};

async function researchMusicStyles(gameName: string, mood: string): Promise<Array<{ title: string; artist: string; style: string; source: string }>> {
  const inspirations: Array<{ title: string; artist: string; style: string; source: string }> = [];

  try {
    const queries = [
      `${gameName} soundtrack music style composition`,
      `${gameName} game music analysis instruments`,
      `${mood} gaming music theory techniques`,
    ];

    for (const query of queries) {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`;
        const resp = await fetch(wikiUrl, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "CreatorOS/1.0 (music-research)" },
        });

        if (resp.ok) {
          const data = await resp.json() as any;
          const results = data?.query?.search || [];
          for (const r of results.slice(0, 2)) {
            const snippet = (r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200);
            if (snippet.length > 20) {
              inspirations.push({
                title: r.title,
                artist: "various",
                style: snippet,
                source: `wikipedia: ${r.title}`,
              });
            }
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }

    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(`${gameName} soundtrack music style`)}&format=json&no_html=1&skip_disambig=1`;
      const resp = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "CreatorOS/1.0 (music-research)" },
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data.AbstractText) {
          inspirations.push({
            title: `${gameName} Soundtrack Overview`,
            artist: data.AbstractSource || "various",
            style: data.AbstractText.substring(0, 300),
            source: data.AbstractURL || "duckduckgo",
          });
        }
        const related = (data.RelatedTopics || []).slice(0, 3);
        for (const topic of related) {
          if (topic.Text) {
            inspirations.push({
              title: topic.Text.substring(0, 100),
              artist: "reference",
              style: topic.Text.substring(0, 200),
              source: topic.FirstURL || "duckduckgo",
            });
          }
        }
      }
    } catch {}
  } catch {}

  return inspirations.slice(0, 8);
}

async function composeTrack(userId: string, gameName: string, context: string): Promise<void> {
  const inspirations = await researchMusicStyles(gameName, context);

  const gameGenre = detectGameGenre(gameName);
  const moods = GAME_MOOD_MAP[gameGenre] || ["ambient", "cinematic", "atmospheric"];
  const selectedGenre = GAMING_MUSIC_GENRES.find(g => moods.includes(g.genre) || moods.includes(g.mood)) || GAMING_MUSIC_GENRES[0];

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are an AI music composer creating ORIGINAL music for a no-commentary PS5 gaming YouTube channel. You create music that is 100% copyright-safe because it is entirely original — inspired by styles but never copying.

GAME: ${gameName}
CONTEXT: ${context}
TARGET GENRE: ${selectedGenre.genre} (${selectedGenre.desc})

RESEARCH — styles and influences to draw from (INSPIRATION ONLY, never copy):
${inspirations.map((i, idx) => `${idx + 1}. "${i.title}" — ${i.style}`).join("\n") || "No specific references found — use genre expertise"}

YOUR MISSION: Design an original music composition that:
1. Captures the emotional essence of ${gameName} gameplay
2. Is inspired by the researched styles but is a NEW, ORIGINAL creation
3. Would work as background music for gaming content
4. Has NO melody, chord progression, or rhythm pattern copied from any existing song
5. Is explicitly designed to be copyright-free

CRITICAL COPYRIGHT RULES:
- Never replicate any specific melody or hook from existing music
- Create novel chord progressions — avoid the 4 most common pop progressions
- Use unique rhythmic patterns that don't match any well-known song
- If citing inspiration, note it as "inspired by the STYLE of X" not a copy
- The composition must pass a Content ID check on YouTube

Return JSON:
{
  "title": "string — original title for this track",
  "genre": "${selectedGenre.genre}",
  "mood": "${selectedGenre.mood}",
  "musicalElements": {
    "tempo": "BPM range",
    "key": "musical key",
    "instruments": ["list of instruments/sounds"],
    "style": "description of the musical style",
    "structure": "verse/chorus structure or form description"
  },
  "compositionPrompt": "detailed prompt that could generate this music via an AI music generator — specific enough to create the audio",
  "copyrightNotes": "why this is 100% original and copyright-safe",
  "usageContext": "when to use this track — intros, boss fights, exploration, etc."
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      temperature: 0.85,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    if (!parsed.title) return;

    await db.insert(aiMusicTracks).values({
      userId,
      title: String(parsed.title).substring(0, 200),
      genre: String(parsed.genre || selectedGenre.genre).substring(0, 50),
      mood: String(parsed.mood || selectedGenre.mood).substring(0, 50),
      gameName: gameName.substring(0, 100),
      durationSec: 60,
      inspirationSources: inspirations as any,
      compositionPrompt: String(parsed.compositionPrompt || "").substring(0, 2000),
      musicalElements: parsed.musicalElements as any,
      copyrightStatus: "original",
      copyrightNotes: String(parsed.copyrightNotes || "AI-generated original composition").substring(0, 500),
      usageContext: String(parsed.usageContext || context).substring(0, 500),
      metadata: {
        gameGenre,
        selectedStyle: selectedGenre,
        researchSources: inspirations.length,
      },
    });

    logger.info(`Composed "${parsed.title}" for ${gameName} (${selectedGenre.genre})`, { userId: userId.substring(0, 8) });
  } catch (err: any) {
    logger.warn(`Composition failed for ${gameName}: ${err.message?.substring(0, 200)}`);
  }
}

function detectGameGenre(gameName: string): string {
  const lower = gameName.toLowerCase();
  const genreMap: Record<string, string[]> = {
    "souls-like": ["elden ring", "dark souls", "demon's souls", "bloodborne", "sekiro", "lies of p", "black myth"],
    "horror": ["resident evil", "silent hill", "alan wake", "dead space", "until dawn", "the medium"],
    "action": ["god of war", "devil may cry", "bayonetta", "spider-man", "batman", "wolverine"],
    "adventure": ["uncharted", "tomb raider", "horizon", "ghost of tsushima", "death stranding"],
    "rpg": ["final fantasy", "baldur's gate", "dragon's dogma", "persona", "hogwarts", "witcher"],
    "racing": ["gran turismo", "forza", "need for speed", "f1"],
    "fighting": ["tekken", "street fighter", "mortal kombat"],
    "stealth": ["metal gear", "hitman", "splinter cell"],
    "open-world": ["gta", "cyberpunk", "starfield", "red dead", "assassin's creed"],
  };

  for (const [genre, games] of Object.entries(genreMap)) {
    if (games.some(g => lower.includes(g))) return genre;
  }
  return "action";
}

const USAGE_CONTEXTS = [
  "intro music — plays during channel intro before gameplay starts",
  "boss fight background — intense, building tension during major encounters",
  "exploration ambiance — calm, atmospheric for open-world wandering",
  "outro/end screen — wrapping up the video, reflective mood",
  "highlights montage — upbeat, energetic for clip compilations",
  "suspense build — slow tension for horror or stealth sequences",
  "victory fanfare — triumphant moment after beating a boss or section",
  "stream waiting screen — chill loop while waiting for stream to start",
];

export async function runCompositionCycle(): Promise<void> {
  logger.info("Music composition cycle starting");

  try {
    const { users } = await import("@shared/schema");
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        const existingCount = await db.select({ total: count() }).from(aiMusicTracks)
          .where(eq(aiMusicTracks.userId, user.id));

        if ((existingCount[0]?.total || 0) >= 50) continue;

        const { channels } = await import("@shared/schema");
        const { videos } = await import("@shared/schema");
        const userChannels = await db.select().from(channels)
          .where(and(eq(channels.userId, user.id), eq(channels.platform, "youtube")))
          .limit(1);

        if (userChannels.length === 0) continue;

        const recentVideos = await db.select().from(videos)
          .where(eq(videos.channelId, userChannels[0].id))
          .orderBy(desc(videos.createdAt))
          .limit(10);

        const gameNames = new Set<string>();
        for (const v of recentVideos) {
          const meta = (v.metadata as any) || {};
          const game = meta.gameName || meta.game;
          if (game && game !== "Unknown" && game !== "Gaming") {
            gameNames.add(game);
          }
        }

        if (gameNames.size === 0) gameNames.add("PS5 Gameplay");

        const context = USAGE_CONTEXTS[Math.floor(Math.random() * USAGE_CONTEXTS.length)];

        for (const game of Array.from(gameNames).slice(0, 2)) {
          await composeTrack(user.id, game, context);
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (err: any) {
        logger.warn(`[${user.id.substring(0, 8)}] Composition cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Composition cycle error: ${err.message?.substring(0, 300)}`);
  }
}

export async function getMusicLibrary(userId: string): Promise<{
  tracks: any[];
  totalTracks: number;
  genres: string[];
  games: string[];
}> {
  const tracks = await db.select().from(aiMusicTracks)
    .where(eq(aiMusicTracks.userId, userId))
    .orderBy(desc(aiMusicTracks.createdAt))
    .limit(100);

  const genres = [...new Set(tracks.map(t => t.genre))];
  const games = [...new Set(tracks.map(t => t.gameName).filter(Boolean) as string[])];

  return { tracks, totalTracks: tracks.length, genres, games };
}

export async function composeForGame(userId: string, gameName: string, context?: string): Promise<any> {
  const ctx = context || USAGE_CONTEXTS[Math.floor(Math.random() * USAGE_CONTEXTS.length)];
  await composeTrack(userId, gameName, ctx);

  const [latest] = await db.select().from(aiMusicTracks)
    .where(and(eq(aiMusicTracks.userId, userId), eq(aiMusicTracks.gameName, gameName)))
    .orderBy(desc(aiMusicTracks.createdAt))
    .limit(1);

  return latest || null;
}

export function startMusicComposer(): void {
  if (composerInterval) return;

  setTimeout(() => {
    runCompositionCycle().catch(err =>
      logger.warn("Initial composition cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 120_000);

  composerInterval = setInterval(() => {
    runCompositionCycle().catch(err =>
      logger.warn("Periodic composition cycle failed", { error: String(err).substring(0, 200) })
    );
  }, COMPOSITION_CYCLE_MS);

  logger.info("AI Music Composer started (6h cycle) — creating original copyright-safe music");
}

export function stopMusicComposer(): void {
  if (composerInterval) {
    clearInterval(composerInterval);
    composerInterval = null;
  }
}
