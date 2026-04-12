import { db } from "../db";
import { creatorDnaProfiles, type CreatorDnaProfile } from "@shared/schema";
import { eq } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { storage } from "../storage";

export interface CreatorDNA {
  styleVector: Record<string, number>;
  voicePatterns: Record<string, any>;
  humorProfile: Record<string, any>;
  energyMap: Record<string, any>;
  catchphrases: string[];
  bannedPhrases: string[];
  contentThemes: Record<string, any>[];
  sampleCount: number;
  maturityScore: number;
}

export class CreatorDNABuilder {
  /**
   * Builds or updates the Creator DNA for a specific user based on their existing content.
   * @AUTONOMOUS: Critical for personalizing all AI-generated content.
   */
  async buildDNA(userId: string): Promise<CreatorDnaProfile> {
    console.log(`[CreatorDNABuilder] Building DNA for user ${userId}...`);
    
    // 1. Fetch data from storage (channels and videos)
    const channels = await storage.getChannelsByUser(userId);
    const videos = await storage.getVideosByUser(userId, 1, 20); // Last 20 videos for analysis
    
    if (videos.length === 0) {
      console.log(`[CreatorDNABuilder] No videos found for user ${userId}, using defaults.`);
    }

    // 2. Prepare data for AI analysis
    const videoData = videos.map(v => ({
      title: v.title,
      description: v.description,
      metadata: v.metadata
    }));

    const channelData = channels.map(c => ({
      name: c.channelName,
      niche: c.contentNiche,
      platform: c.platform
    }));

    // 3. Call AI to analyze patterns (Claude Opus for deep personality analysis)
    const result = await executeRoutedAICall(
      { taskType: "creator_dna_analysis", userId, priority: "high" },
      `You are an expert brand strategist and personality profiler. 
Analyze the following creator data and extract their unique "DNA" (voice, style, humor, energy).
Return a JSON object matching this structure:
{
  "styleVector": { "professional": 0.1, "energetic": 0.9 },
  "voicePatterns": { "vocabulary": "casual", "sentenceStructure": "short" },
  "humorProfile": { "type": "sarcastic", "frequency": "high" },
  "energyMap": { "baseline": "high", "spikes": "during gameplay" },
  "catchphrases": ["Let's go!", "Actually crazy"],
  "bannedPhrases": ["unethical words", "competitor names"],
  "contentThemes": [{ "topic": "gaming", "sentiment": "positive" }],
  "maturityScore": 0.8
}`,
      JSON.stringify({ channelData, videoData })
    );

    const dnaData = JSON.parse(result.content || "{}");

    // 4. Upsert to creatorDnaProfiles
    const [profile] = await db
      .insert(creatorDnaProfiles)
      .values({
        userId,
        styleVector: dnaData.styleVector || {},
        voicePatterns: dnaData.voicePatterns || {},
        humorProfile: dnaData.humorProfile || {},
        energyMap: dnaData.energyMap || {},
        catchphrases: dnaData.catchphrases || [],
        bannedPhrases: dnaData.bannedPhrases || [],
        contentThemes: dnaData.contentThemes || [],
        sampleCount: videos.length,
        maturityScore: dnaData.maturityScore || 0,
        lastAnalyzedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creatorDnaProfiles.userId,
        set: {
          styleVector: dnaData.styleVector || {},
          voicePatterns: dnaData.voicePatterns || {},
          humorProfile: dnaData.humorProfile || {},
          energyMap: dnaData.energyMap || {},
          catchphrases: dnaData.catchphrases || [],
          bannedPhrases: dnaData.bannedPhrases || [],
          contentThemes: dnaData.contentThemes || [],
          sampleCount: videos.length,
          maturityScore: dnaData.maturityScore || 0,
          lastAnalyzedAt: new Date(),
        }
      })
      .returning();

    return profile;
  }

  async getDNA(userId: string): Promise<CreatorDnaProfile | undefined> {
    const [profile] = await db
      .select()
      .from(creatorDnaProfiles)
      .where(eq(creatorDnaProfiles.userId, userId));
    return profile;
  }

  buildDNAFromProfile(profile: CreatorDnaProfile): CreatorDNA {
    return {
      styleVector: (profile.styleVector as Record<string, number>) || {},
      voicePatterns: (profile.voicePatterns as Record<string, any>) || {},
      humorProfile: (profile.humorProfile as Record<string, any>) || {},
      energyMap: (profile.energyMap as Record<string, any>) || {},
      catchphrases: profile.catchphrases || [],
      bannedPhrases: profile.bannedPhrases || [],
      contentThemes: (profile.contentThemes as Record<string, any>[]) || [],
      sampleCount: profile.sampleCount,
      maturityScore: Number(profile.maturityScore) || 0,
    };
  }
}

export const creatorDNABuilder = new CreatorDNABuilder();

/**
 * standalone exported helper to inject Creator DNA into any AI prompt
 */
export async function withCreatorVoice(userId: string, basePrompt: string): Promise<string> {
  const profile = await creatorDNABuilder.getDNA(userId);

  let voiceBlock = "";
  if (profile) {
    const dna = creatorDNABuilder.buildDNAFromProfile(profile);
    voiceBlock = `
---
CREATOR PERSONALITY DNA (Apply this voice to ALL generated content):
- Tone/Style: ${JSON.stringify(dna.styleVector)}
- Voice Patterns: ${JSON.stringify(dna.voicePatterns)}
- Humor: ${JSON.stringify(dna.humorProfile)}
- Energy Level: ${JSON.stringify(dna.energyMap)}
- Key Catchphrases (Use naturally): ${dna.catchphrases.join(", ")}
- BANNED PHRASES (NEVER USE): ${dna.bannedPhrases.join(", ")}
- Primary Themes: ${dna.contentThemes.map(t => (t as any).topic).join(", ")}
- Maturity/Vibe Score: ${dna.maturityScore}
---
`;
  }

  let knowledgeBlock = "";
  try {
    const { buildKnowledgeContext } = await import("./knowledge-context-builder");
    knowledgeBlock = await buildKnowledgeContext(userId);
  } catch {}

  return `${basePrompt}\n\n${voiceBlock}${knowledgeBlock}`;
}
