import { sanitizeObjectForPrompt } from "./lib/ai-attack-shield";
import { callClaudeBackground, CLAUDE_MODELS } from "./lib/claude";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { creatorDnaProfiles, videos, channels } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";
import { humanizeText } from "./ai-humanizer-engine";

export async function buildDnaProfile(userId: string) {
  const userChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId));

  const channelIds = userChannels.map((c) => c.id);

  let allVideos: any[] = [];
  for (const cid of channelIds) {
    const vids = await db
      .select()
      .from(videos)
      .where(eq(videos.channelId, cid))
      .orderBy(desc(videos.createdAt))
      .limit(50);
    allVideos.push(...vids);
  }

  const contentSamples = allVideos.slice(0, 80).map((v) => ({
    title: v.title,
    description: v.description || "",
    tags: v.metadata?.tags || [],
    type: v.type,
    platform: v.platform,
    views: v.metadata?.viewCount || 0,
    likes: v.metadata?.likeCount || 0,
  }));

  const prompt = `You are a creator DNA analyst. Deeply analyze this creator's content to extract their unique creative fingerprint - their style, voice, humor, energy, and patterns.

CONTENT SAMPLES (${contentSamples.length} pieces):
${JSON.stringify(sanitizeObjectForPrompt(contentSamples), null, 2)}

Build a comprehensive DNA profile with:

1. Style Vector: Numeric scores (0-1) for dimensions like formality, energy, humor, education, entertainment, controversy, authenticity, production_quality, pacing, storytelling
2. Voice Patterns: How they write/speak - sentence structure, vocabulary, tone shifts, signature phrases
3. Humor Profile: Type of humor used, frequency, timing patterns, topics they joke about
4. Energy Map: Energy levels across content types, openings vs middles vs endings, high-energy triggers
5. Editing Style: Pacing preferences, transition types, visual effects usage, music choices
6. Catchphrases: Recurring phrases, sign-offs, greetings, reactions
7. Banned Phrases: Things this creator would NEVER say (based on their style)
8. Content Themes: Recurring topics, narrative arcs, audience relationships

Respond as JSON:
{
  "styleVector": {
    "formality": number,
    "energy": number,
    "humor": number,
    "education": number,
    "entertainment": number,
    "controversy": number,
    "authenticity": number,
    "productionQuality": number,
    "pacing": number,
    "storytelling": number
  },
  "voicePatterns": {
    "sentenceStyle": "string",
    "vocabularyLevel": "string",
    "toneShifts": "string",
    "signaturePhrases": ["string"],
    "openingStyle": "string",
    "closingStyle": "string"
  },
  "humorProfile": {
    "type": "string",
    "frequency": "string",
    "timing": "string",
    "topics": ["string"],
    "avoids": ["string"]
  },
  "energyMap": {
    "openingEnergy": "string",
    "midContentEnergy": "string",
    "closingEnergy": "string",
    "peakMoments": ["string"],
    "calmMoments": ["string"]
  },
  "editingStyle": {
    "pacing": "string",
    "transitions": "string",
    "effectsUsage": "string",
    "musicPreference": "string",
    "thumbnailStyle": "string"
  },
  "catchphrases": ["string"],
  "bannedPhrases": ["string"],
  "contentThemes": [
    {
      "theme": "string",
      "frequency": "string",
      "audienceReaction": "string"
    }
  ],
  "maturityScore": number
}`;

  const response = await callClaudeBackground({
    model: CLAUDE_MODELS.opus,
    prompt,
    maxTokens: 4000,
  });

  const content = response.content;
  if (!content) throw new Error("No response from AI for DNA profile");

  const dna = JSON.parse(content);

  const existing = await db
    .select()
    .from(creatorDnaProfiles)
    .where(eq(creatorDnaProfiles.userId, userId))
    .limit(1);

  let profile;

  if (existing.length > 0) {
    [profile] = await db
      .update(creatorDnaProfiles)
      .set({
        styleVector: dna.styleVector || {},
        voicePatterns: dna.voicePatterns || {},
        humorProfile: dna.humorProfile || {},
        energyMap: dna.energyMap || {},
        editingStyle: dna.editingStyle || {},
        catchphrases: dna.catchphrases || [],
        bannedPhrases: dna.bannedPhrases || [],
        contentThemes: dna.contentThemes || [],
        sampleCount: contentSamples.length,
        maturityScore: dna.maturityScore || 0.5,
        lastAnalyzedAt: new Date(),
      })
      .where(eq(creatorDnaProfiles.userId, userId))
      .returning();
  } else {
    [profile] = await db
      .insert(creatorDnaProfiles)
      .values({
        userId,
        styleVector: dna.styleVector || {},
        voicePatterns: dna.voicePatterns || {},
        humorProfile: dna.humorProfile || {},
        energyMap: dna.energyMap || {},
        editingStyle: dna.editingStyle || {},
        catchphrases: dna.catchphrases || [],
        bannedPhrases: dna.bannedPhrases || [],
        contentThemes: dna.contentThemes || [],
        sampleCount: contentSamples.length,
        maturityScore: dna.maturityScore || 0.5,
        lastAnalyzedAt: new Date(),
      })
      .returning();
  }

  sendSSEEvent(userId, "dna_profile_built", {
    sampleCount: contentSamples.length,
    maturityScore: dna.maturityScore,
    catchphraseCount: dna.catchphrases?.length || 0,
  });

  return profile;
}

export async function getDnaProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(creatorDnaProfiles)
    .where(eq(creatorDnaProfiles.userId, userId))
    .limit(1);

  return profile || null;
}

export async function updateDnaFromContent(userId: string, content: any) {
  const existing = await getDnaProfile(userId);

  if (!existing) {
    return buildDnaProfile(userId);
  }

  const prompt = `You are a creator DNA analyst. A creator has published new content. Update their DNA profile based on this new data point.

CURRENT DNA PROFILE:
- Style Vector: ${JSON.stringify(sanitizeObjectForPrompt(existing.styleVector))}
- Voice Patterns: ${JSON.stringify(sanitizeObjectForPrompt(existing.voicePatterns))}
- Humor Profile: ${JSON.stringify(sanitizeObjectForPrompt(existing.humorProfile))}
- Energy Map: ${JSON.stringify(sanitizeObjectForPrompt(existing.energyMap))}
- Catchphrases: ${JSON.stringify(sanitizeObjectForPrompt(existing.catchphrases))}
- Sample Count: ${existing.sampleCount}

NEW CONTENT:
${JSON.stringify(sanitizeObjectForPrompt(content))}

Incrementally adjust the profile. Small refinements only - don't overhaul based on one piece of content. Return updated values:

Respond as JSON:
{
  "styleVector": { updated style dimensions },
  "voicePatterns": { updated patterns },
  "humorProfile": { updated humor data },
  "energyMap": { updated energy data },
  "newCatchphrases": ["any new catchphrases detected"],
  "contentThemes": [{ "theme": "string", "frequency": "string", "audienceReaction": "string" }],
  "maturityScore": number
}`;

  const response = await callClaudeBackground({
    model: CLAUDE_MODELS.opus,
    prompt,
    maxTokens: 4000,
  });

  const responseContent = response.content;
  if (!responseContent) throw new Error("No response from AI for DNA update");

  const updates = JSON.parse(responseContent);

  const mergedCatchphrases = [
    ...new Set([
      ...(existing.catchphrases || []),
      ...(updates.newCatchphrases || []),
    ]),
  ];

  const [profile] = await db
    .update(creatorDnaProfiles)
    .set({
      styleVector: updates.styleVector || existing.styleVector,
      voicePatterns: updates.voicePatterns || existing.voicePatterns,
      humorProfile: updates.humorProfile || existing.humorProfile,
      energyMap: updates.energyMap || existing.energyMap,
      catchphrases: mergedCatchphrases,
      contentThemes: updates.contentThemes || existing.contentThemes,
      sampleCount: (existing.sampleCount || 0) + 1,
      maturityScore: updates.maturityScore || existing.maturityScore,
      lastAnalyzedAt: new Date(),
    })
    .where(eq(creatorDnaProfiles.userId, userId))
    .returning();

  sendSSEEvent(userId, "dna_profile_updated", {
    newSampleCount: profile.sampleCount,
    maturityScore: profile.maturityScore,
  });

  return profile;
}

export async function generateInCreatorVoice(userId: string, prompt: string) {
  const profile = await getDnaProfile(userId);

  let voiceContext = "";
  if (profile) {
    voiceContext = `
CREATOR DNA PROFILE:
- Style: ${JSON.stringify(sanitizeObjectForPrompt(profile.styleVector))}
- Voice: ${JSON.stringify(sanitizeObjectForPrompt(profile.voicePatterns))}
- Humor: ${JSON.stringify(sanitizeObjectForPrompt(profile.humorProfile))}
- Energy: ${JSON.stringify(sanitizeObjectForPrompt(profile.energyMap))}
- Catchphrases they use: ${JSON.stringify(sanitizeObjectForPrompt(profile.catchphrases))}
- Phrases they NEVER use: ${JSON.stringify(sanitizeObjectForPrompt(profile.bannedPhrases))}
- Content themes: ${JSON.stringify(sanitizeObjectForPrompt(profile.contentThemes))}

CRITICAL RULES:
- Match their exact tone, vocabulary level, and sentence structure
- Use their catchphrases naturally where appropriate
- NEVER use any of their banned phrases
- Match their energy level and humor style
- Sound authentically like them, not like a generic AI`;
  }

  const aiPrompt = `You are ghostwriting as a specific content creator. Generate text that sounds exactly like them.
${voiceContext}

USER REQUEST:
${prompt}

Respond as JSON:
{
  "text": "the generated text in the creator's voice",
  "voiceMatchScore": number between 0-1 indicating how closely this matches their style,
  "catchphrasesUsed": ["any catchphrases naturally incorporated"],
  "toneNotes": "brief note on the tone choices made"
}`;

  const response = await callClaudeBackground({
    model: CLAUDE_MODELS.opus,
    prompt: aiPrompt,
    maxTokens: 4000,
  });

  const content = response.content;
  if (!content) throw new Error("No response from AI for voice generation");

  const parsed = JSON.parse(content);
  if (parsed.text) {
    const humanized = humanizeText(parsed.text, { aggressionLevel: "moderate", contentType: "social-post" });
    parsed.text = humanized.humanized;
    parsed.stealthScore = humanized.stealthScore;
  }
  return parsed;
}
