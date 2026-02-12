import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface StyleProfile {
  tone: string;
  commonPhrases: string[];
  sentenceStructure: string;
  vocabularyLevel: string;
  emojiUsage: string;
  capitalizationStyle: string;
  hookPatterns: string[];
}

export async function runStyleScan(userId: string, channelId: number): Promise<StyleProfile> {
  const videos = await storage.getVideosByChannel(channelId);

  const contentSamples = videos.slice(0, 50).map(v => ({
    title: v.title,
    description: v.description || "",
    tags: v.metadata?.tags || [],
  }));

  const prompt = `You are a writing style analyst. Analyze these video titles, descriptions, and tags from a single creator and identify their unique writing style.

Content samples:
${JSON.stringify(contentSamples, null, 2)}

Provide your analysis as JSON with exactly these fields:
{
  "tone": "description of writing tone (e.g. casual, formal, energetic, sarcastic, hype-driven)",
  "commonPhrases": ["list of recurring phrases or expressions the creator uses"],
  "sentenceStructure": "description of sentence patterns (e.g. short punchy, long descriptive, question-heavy)",
  "vocabularyLevel": "description of vocabulary (e.g. simple/casual, technical, gaming slang, internet culture)",
  "emojiUsage": "description of emoji usage patterns (e.g. heavy, minimal, none, specific emojis used)",
  "capitalizationStyle": "description of capitalization habits (e.g. all caps for emphasis, standard, lowercase aesthetic)",
  "hookPatterns": ["list of hook patterns used (e.g. question-based, challenge-based, curiosity gap, shock value)"]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for style scan");
  const profile: StyleProfile = JSON.parse(content);

  const entries: Array<{ key: string; value: string }> = [
    { key: "tone", value: profile.tone },
    { key: "common_phrases", value: JSON.stringify(profile.commonPhrases) },
    { key: "sentence_structure", value: profile.sentenceStructure },
    { key: "vocabulary_level", value: profile.vocabularyLevel },
    { key: "emoji_usage", value: profile.emojiUsage },
    { key: "capitalization_style", value: profile.capitalizationStyle },
    { key: "hook_patterns", value: JSON.stringify(profile.hookPatterns) },
  ];

  for (const entry of entries) {
    const existing = await storage.getCreatorMemoryByKey(userId, entry.key);
    if (existing) {
      await storage.updateCreatorMemory(existing.id, {
        value: entry.value,
        confidence: 0.9,
        source: "style_scan",
      });
    } else {
      await storage.createCreatorMemory({
        userId,
        memoryType: "style_profile",
        key: entry.key,
        value: entry.value,
        confidence: 0.9,
        source: "style_scan",
        metadata: {
          lastUsed: new Date().toISOString(),
          platform: "youtube",
        },
      });
    }
  }

  return profile;
}

export async function getCreatorStyleContext(userId: string): Promise<string> {
  const memories = await storage.getCreatorMemory(userId);

  if (memories.length === 0) {
    return "";
  }

  const styleEntries = memories.filter(m => m.memoryType === "style_profile");
  const preferenceEntries = memories.filter(m => m.memoryType === "preference");

  let context = "CREATOR STYLE PROFILE:";

  for (const entry of styleEntries) {
    const label = entry.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    let displayValue = entry.value;
    try {
      const parsed = JSON.parse(entry.value);
      if (Array.isArray(parsed)) {
        displayValue = parsed.map((p: string) => `'${p}'`).join(", ");
      }
    } catch {
      // not JSON, use raw value
    }
    context += `\n- ${label}: ${displayValue}`;
  }

  if (preferenceEntries.length > 0) {
    context += "\n\nCREATOR PREFERENCES:";
    for (const entry of preferenceEntries) {
      context += `\n- ${entry.key}: ${entry.value}`;
    }
  }

  return context;
}

export async function recordFeedback(
  userId: string,
  targetType: string,
  targetId: number,
  rating: "up" | "down",
  aiFunction: string
): Promise<void> {
  await storage.createUserFeedback({
    userId,
    targetType,
    targetId,
    rating,
    metadata: {
      aiFunction,
    },
  });

  const categoryMap: Record<string, string> = {
    title_generation: "title_performance",
    thumbnail_generation: "thumbnail_ctr",
    description_generation: "title_performance",
    tag_generation: "tag_effectiveness",
    schedule_suggestion: "posting_time",
  };

  const category = categoryMap[aiFunction] || "content_type_performance";
  const pattern = rating === "up"
    ? `${aiFunction}_positive_signal`
    : `${aiFunction}_negative_signal`;

  const existing = await storage.getLearningInsights(userId);
  const matchingInsight = existing.find(
    i => i.category === category && i.pattern === pattern
  );

  if (matchingInsight) {
    const currentSampleSize = matchingInsight.sampleSize || 0;
    const newSampleSize = currentSampleSize + 1;
    const currentConfidence = matchingInsight.confidence || 0.5;
    const adjustment = rating === "up" ? 0.05 : -0.05;
    const newConfidence = Math.max(0, Math.min(1, currentConfidence + adjustment));

    await storage.updateLearningInsight(matchingInsight.id, {
      sampleSize: newSampleSize,
      confidence: newConfidence,
      data: {
        ...matchingInsight.data,
        lastValidated: new Date().toISOString(),
      },
    });
  } else {
    await storage.createLearningInsight({
      userId,
      category,
      pattern,
      confidence: rating === "up" ? 0.6 : 0.4,
      sampleSize: 1,
      data: {
        finding: `User ${rating === "up" ? "approved" : "rejected"} output from ${aiFunction}`,
        evidence: [`${rating} vote on ${targetType} #${targetId}`],
        recommendation: rating === "up"
          ? `Continue using similar approach for ${aiFunction}`
          : `Adjust approach for ${aiFunction} based on negative feedback`,
      },
    });
  }
}

export async function getCreatorPreferences(
  userId: string
): Promise<Record<string, string>> {
  const memories = await storage.getCreatorMemory(userId, "preference");
  const prefs: Record<string, string> = {};
  for (const m of memories) {
    prefs[m.key] = m.value;
  }
  return prefs;
}

export async function humanizeOutput(text: string, userId: string): Promise<string> {
  const humanizationPrompt = await buildHumanizationPrompt(userId);

  const prompt = `${humanizationPrompt}

TEXT TO HUMANIZE:
"""
${text}
"""

Provide your response as JSON with exactly this field:
{
  "humanized": "the humanized version of the text"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for humanization");
  const result = JSON.parse(content);
  return result.humanized || text;
}

export async function buildHumanizationPrompt(userId: string): Promise<string> {
  const styleContext = await getCreatorStyleContext(userId);

  let prompt = `You are a humanization expert. Rewrite the provided text to sound naturally human-written.

RULES (CRITICAL):
- Vary sentence length: mix short punchy sentences with longer explanatory ones
- Use natural contractions (don't, won't, it's, they're)
- Add colloquial phrasing where appropriate
- NEVER use these AI-detectable phrases:
  - "In conclusion"
  - "It's worth noting"
  - "Furthermore"
  - "In today's digital landscape"
  - "Delve into"
  - "It's important to note"
  - "Leverage"
  - "Utilize"
  - "In order to"
  - "At the end of the day"
  - "Moving forward"
  - "Game-changer"
  - "Groundbreaking"
  - "Revolutionize"
  - "Seamlessly"
- Avoid starting consecutive sentences with the same word
- Don't use semicolons (most humans rarely do in casual writing)
- Keep paragraph transitions natural, not formulaic
- Vary paragraph lengths`;

  if (styleContext) {
    prompt += `\n\n${styleContext}

ADDITIONAL VOICE MATCHING INSTRUCTIONS:
- Match the tone and energy level described above
- Use the creator's common phrases naturally where they fit
- Follow their capitalization style
- Match their vocabulary level and slang
- Apply their hook patterns when relevant`;
  }

  return prompt;
}

export async function recordLearningSignal(
  userId: string,
  category: string,
  pattern: string,
  data: Record<string, unknown>
): Promise<void> {
  const existing = await storage.getLearningInsights(userId);
  const match = existing.find(
    i => i.category === category && i.pattern === pattern
  );

  if (match) {
    const currentSampleSize = match.sampleSize || 0;
    await storage.updateLearningInsight(match.id, {
      sampleSize: currentSampleSize + 1,
      data: {
        ...match.data,
        ...data,
        finding: (data.finding as string) || match.data.finding,
        evidence: [
          ...(match.data.evidence || []),
          ...((data.evidence as string[]) || []),
        ].slice(-20),
        recommendation: (data.recommendation as string) || match.data.recommendation,
        lastValidated: new Date().toISOString(),
      },
    });
  } else {
    await storage.createLearningInsight({
      userId,
      category,
      pattern,
      confidence: 0.5,
      sampleSize: 1,
      data: {
        finding: (data.finding as string) || pattern,
        evidence: (data.evidence as string[]) || [],
        recommendation: (data.recommendation as string) || "",
        ...(data.performanceImpact !== undefined
          ? { performanceImpact: data.performanceImpact as number }
          : {}),
        ...(data.platform ? { platform: data.platform as string } : {}),
      },
    });
  }
}

export async function getLearningContext(userId: string): Promise<string> {
  const insights = await storage.getLearningInsights(userId);

  if (insights.length === 0) {
    return "";
  }

  const sorted = [...insights].sort((a, b) => {
    const confA = a.confidence || 0;
    const confB = b.confidence || 0;
    const sizeA = a.sampleSize || 0;
    const sizeB = b.sampleSize || 0;
    return (confB * sizeB) - (confA * sizeA);
  });

  const top = sorted.slice(0, 15);

  let context = "LEARNING INSIGHTS:";
  for (const insight of top) {
    const finding = insight.data?.finding || insight.pattern;
    const recommendation = insight.data?.recommendation;
    const confidence = insight.confidence || 0;
    const confidenceLabel = confidence >= 0.8 ? "high confidence" : confidence >= 0.5 ? "moderate confidence" : "low confidence";

    context += `\n- ${finding} (${confidenceLabel}, ${insight.sampleSize || 0} samples)`;
    if (recommendation) {
      context += `\n  Action: ${recommendation}`;
    }
  }

  return context;
}
