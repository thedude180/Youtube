import { db } from "../db";
import { liveGameDetections } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const KNOWN_PS5_GAMES = [
  "Elden Ring", "God of War Ragnarok", "Spider-Man 2", "Final Fantasy XVI",
  "Demon's Souls", "Returnal", "Ratchet & Clank", "Horizon Forbidden West",
  "The Last of Us Part I", "Gran Turismo 7", "Stellar Blade", "Astro Bot",
  "Bloodborne", "Dark Souls III", "Sekiro", "Ghost of Tsushima",
  "Death Stranding", "Resident Evil 4", "Silent Hill 2", "Black Myth Wukong",
];

export function detectGame(streamTitle: string, streamDescription?: string): {
  gameTitle: string | null;
  confidence: number;
  method: string;
} {
  const combined = `${streamTitle} ${streamDescription || ""}`.toLowerCase();

  for (const game of KNOWN_PS5_GAMES) {
    if (combined.includes(game.toLowerCase())) {
      return { gameTitle: game, confidence: 0.95, method: "exact_match" };
    }
  }

  const partialMatches = KNOWN_PS5_GAMES.filter(g => {
    const words = g.toLowerCase().split(/\s+/);
    return words.length > 1 && words.some(w => w.length > 3 && combined.includes(w));
  });

  if (partialMatches.length === 1) {
    return { gameTitle: partialMatches[0], confidence: 0.7, method: "partial_match" };
  }

  return { gameTitle: null, confidence: 0, method: "no_match" };
}

export async function recordGameDetection(
  userId: string,
  streamId: string,
  gameTitle: string,
  confidence: number,
  method: string,
): Promise<number> {
  const [row] = await db.insert(liveGameDetections).values({
    userId,
    streamId,
    gameTitle,
    confidence,
    detectionMethod: method,
  }).returning();
  return row.id;
}

export function getGameContext(gameTitle: string): {
  genre: string;
  expectedSessionLength: string;
  clipPotential: string;
  seoKeywords: string[];
} {
  const soulsLike = ["Elden Ring", "Dark Souls III", "Demon's Souls", "Sekiro", "Bloodborne", "Black Myth Wukong"];
  const action = ["Spider-Man 2", "God of War Ragnarok", "Ghost of Tsushima", "Ratchet & Clank", "Stellar Blade", "Astro Bot"];
  const horror = ["Resident Evil 4", "Silent Hill 2", "Returnal"];

  if (soulsLike.includes(gameTitle)) {
    return {
      genre: "souls-like",
      expectedSessionLength: "2-4 hours",
      clipPotential: "very high (boss fights, deaths, clutch plays)",
      seoKeywords: [gameTitle.toLowerCase(), "no commentary", "ps5", "boss fight", "gameplay", "walkthrough", "4k"],
    };
  }
  if (action.includes(gameTitle)) {
    return {
      genre: "action-adventure",
      expectedSessionLength: "1-3 hours",
      clipPotential: "high (set pieces, combat, exploration)",
      seoKeywords: [gameTitle.toLowerCase(), "no commentary", "ps5", "gameplay", "full game", "4k 60fps"],
    };
  }
  if (horror.includes(gameTitle)) {
    return {
      genre: "horror",
      expectedSessionLength: "1-3 hours",
      clipPotential: "high (jump scares, tense moments, deaths)",
      seoKeywords: [gameTitle.toLowerCase(), "no commentary", "ps5", "horror", "gameplay", "walkthrough"],
    };
  }
  return {
    genre: "general",
    expectedSessionLength: "1-3 hours",
    clipPotential: "medium",
    seoKeywords: [gameTitle.toLowerCase(), "no commentary", "ps5", "gameplay"],
  };
}

export async function getGameHistory(userId: string, limit = 20) {
  return db.select().from(liveGameDetections)
    .where(eq(liveGameDetections.userId, userId))
    .orderBy(desc(liveGameDetections.detectedAt))
    .limit(limit);
}
