import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { aiResults, videos, channels, learningInsights, creatorDnaProfiles, contentDnaProfiles } from "@shared/schema";
import { recordLearningEvent } from "./learning-engine";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function aiGenerate(prompt: string): Promise<any> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16384,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function researchYouTubeNiche(userId: string, niche: string): Promise<any> {
  const prompt = `You are a YouTube algorithm expert and content research analyst who has studied thousands of successful YouTube channels. Research this niche deeply using your knowledge of YouTube trends, successful creators, and content patterns.

NICHE TO RESEARCH: "${niche}"

Analyze YouTube as if you were studying the platform's top performers in this niche. Use your knowledge of real YouTube trends, successful video formats, and what actually works on the platform.

Respond with JSON:
{
  "nicheAnalysis": {
    "topPerformingFormats": ["List the 5 video formats that perform best in this niche on YouTube right now"],
    "averageVideoLength": "What video length performs best for this niche",
    "thumbnailTrends": ["What thumbnail styles get the most clicks in this niche"],
    "titlePatterns": ["5 title patterns that consistently get high CTR"],
    "hookStyles": ["5 opening hook styles that retain viewers past 30 seconds"],
    "audienceRetentionTips": ["5 specific retention techniques used by top creators in this niche"],
    "algorithmInsights": ["5 things the YouTube algorithm favors for this type of content"],
    "commonMistakes": ["5 mistakes new creators in this niche always make"],
    "growthVelocity": "Typical subscriber growth rate for a new channel in this niche (first 6 months)"
  },
  "topCreatorPatterns": [
    {
      "archetype": "Type of successful creator (e.g., 'The Expert Educator', 'The Entertainer')",
      "whatTheyDo": "What makes this archetype successful",
      "uploadFrequency": "How often they post",
      "averageViews": "Typical view count range",
      "contentStyle": "Brief style description",
      "keyStrength": "Their biggest differentiator"
    }
  ],
  "contentGaps": ["5 underserved content areas in this niche that a new creator could exploit"],
  "trendingSubTopics": ["10 currently trending sub-topics within this niche"],
  "crossPlatformInsights": {
    "tiktokAngle": "How to adapt this niche for TikTok shorts",
    "twitchAngle": "How live streaming fits this niche",
    "xAngle": "How to build audience on X for this niche",
    "discordAngle": "Community building strategies for this niche"
  },
  "seasonalTrends": ["4 seasonal content opportunities throughout the year"],
  "monetizationInsights": {
    "bestRevenueStreams": ["Top 5 revenue streams for this niche"],
    "sponsorTypes": ["Types of sponsors that target this niche"],
    "averageCPM": "Estimated CPM range for this niche",
    "affiliateOpportunities": ["3 affiliate opportunities"]
  },
  "beginner_quality_benchmarks": {
    "day1_expectations": "What a day-1 creator's video realistically looks like",
    "month1_expectations": "What videos look like after 1 month of consistent uploading",
    "month3_expectations": "How quality should improve by month 3",
    "month6_expectations": "What quality level to aim for by month 6",
    "year1_expectations": "Professional quality benchmarks by year 1"
  }
}

Be extremely specific. Reference real YouTube trends and patterns. This data will be used to train an AI content system that needs to produce realistic, niche-appropriate content that evolves over time.`;

  const research = await aiGenerate(prompt);

  await db.insert(aiResults).values({
    userId,
    featureKey: "youtube-niche-research",
    result: {
      niche,
      research,
      researchedAt: new Date().toISOString(),
      source: "youtube_learning_engine",
      version: 1,
    },
  });

  await seedLearningFromResearch(userId, niche, research);

  return research;
}

async function seedLearningFromResearch(userId: string, niche: string, research: any) {
  try {
    if (research.nicheAnalysis?.topPerformingFormats) {
      await recordLearningEvent(userId, "content_format_performance", "youtube_top_formats", {
        finding: `Top performing formats in ${niche}: ${research.nicheAnalysis.topPerformingFormats.join(", ")}`,
        evidence: [`YouTube niche research for ${niche}`],
        recommendation: `Focus on these formats: ${research.nicheAnalysis.topPerformingFormats.slice(0, 3).join(", ")}`,
        platform: "youtube",
      });
    }

    if (research.nicheAnalysis?.titlePatterns) {
      await recordLearningEvent(userId, "title_performance", "youtube_title_patterns", {
        finding: `High-CTR title patterns: ${research.nicheAnalysis.titlePatterns.join("; ")}`,
        evidence: [`YouTube pattern analysis`],
        recommendation: `Use these title patterns as templates, especially: ${research.nicheAnalysis.titlePatterns[0]}`,
        platform: "youtube",
      });
    }

    if (research.nicheAnalysis?.hookStyles) {
      await recordLearningEvent(userId, "retention_patterns", "youtube_hook_styles", {
        finding: `Effective hooks for ${niche}: ${research.nicheAnalysis.hookStyles.join("; ")}`,
        evidence: [`YouTube retention research`],
        recommendation: `Open videos with these hook styles to maximize 30-second retention`,
        platform: "youtube",
      });
    }

    if (research.nicheAnalysis?.commonMistakes) {
      await recordLearningEvent(userId, "creator_pitfalls", "youtube_common_mistakes", {
        finding: `Common mistakes to avoid: ${research.nicheAnalysis.commonMistakes.join("; ")}`,
        evidence: [`YouTube competitor analysis`],
        recommendation: `Actively avoid these mistakes that plague new creators in ${niche}`,
        platform: "youtube",
      });
    }

    if (research.nicheAnalysis?.algorithmInsights) {
      await recordLearningEvent(userId, "algorithm_patterns", "youtube_algorithm_factors", {
        finding: `Algorithm favors: ${research.nicheAnalysis.algorithmInsights.join("; ")}`,
        evidence: [`YouTube algorithm analysis for ${niche}`],
        recommendation: `Optimize content for these algorithm signals`,
        platform: "youtube",
      });
    }

    if (research.contentGaps) {
      await recordLearningEvent(userId, "content_opportunities", "youtube_content_gaps", {
        finding: `Underserved content areas: ${research.contentGaps.join("; ")}`,
        evidence: [`Gap analysis in ${niche}`],
        recommendation: `Target these gaps for faster growth with less competition`,
        platform: "youtube",
      });
    }

    if (research.monetizationInsights?.bestRevenueStreams) {
      await recordLearningEvent(userId, "monetization_patterns", "youtube_revenue_streams", {
        finding: `Best revenue streams for ${niche}: ${research.monetizationInsights.bestRevenueStreams.join(", ")}`,
        evidence: [`Monetization research for ${niche}`],
        recommendation: `Focus monetization efforts on: ${research.monetizationInsights.bestRevenueStreams[0]}`,
        platform: "youtube",
      });
    }
  } catch (err: any) {
    console.error(`[YouTubeLearning] Failed to seed learning insights:`, err.message);
  }
}

export async function analyzeVideoPerformanceAndLearn(userId: string, videoId: number): Promise<any> {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return null;

    const existingResearch = await getYouTubeResearch(userId);
    const nicheContext = existingResearch
      ? `\nNICHE CONTEXT:\n${JSON.stringify(existingResearch.nicheAnalysis || {})}`
      : "";

    const stats = video.metadata?.stats;
    if (!stats) return null;

    const prompt = `You are a YouTube analytics expert studying this video's performance to improve future content.

VIDEO DATA:
- Title: "${video.title}"
- Views: ${stats.views || 0}
- Likes: ${stats.likes || 0}
- Comments: ${stats.comments || 0}
- CTR: ${stats.ctr || 0}%
- Avg Watch Time: ${stats.avgWatchTime || 0} seconds
- Platform: ${video.platform || "youtube"}
${nicheContext}

Analyze this video's performance and extract learning signals. What worked? What didn't? How should the next video be different?

Respond with JSON:
{
  "performanceGrade": "A/B/C/D/F",
  "whatWorked": ["3 things that worked well"],
  "whatFailed": ["3 things that underperformed"],
  "titleAnalysis": "Was the title effective? Why or why not?",
  "retentionInsights": "What the watch time tells us",
  "engagementInsights": "What likes/comments ratio tells us",
  "improvements": ["5 specific improvements for the next video"],
  "skillLevelSignal": "beginner/developing/intermediate/advanced - what quality level this video represents",
  "nextVideoSuggestion": {
    "title": "Suggested next video title based on learnings",
    "format": "Suggested format",
    "improvement_focus": "What specific skill to improve"
  },
  "externalSourceSuggestions": ["2-3 types of external video content to study to improve (e.g., 'watch how top gaming channels do transitions', 'study how cooking channels handle close-up shots')"]
}`;

    const analysis = await aiGenerate(prompt);

    if (analysis.whatWorked) {
      for (const insight of analysis.whatWorked) {
        await recordLearningEvent(userId, "content_type_performance", `video_success_pattern`, {
          finding: insight,
          evidence: [`Video #${videoId}: "${video.title}" - Grade: ${analysis.performanceGrade}`],
          recommendation: "Continue using this approach",
          platform: video.platform || "youtube",
        });
      }
    }

    if (analysis.whatFailed) {
      for (const insight of analysis.whatFailed) {
        await recordLearningEvent(userId, "content_type_performance", `video_improvement_area`, {
          finding: `Underperformed: ${insight}`,
          evidence: [`Video #${videoId}: "${video.title}"`],
          recommendation: analysis.improvements?.[0] || "Iterate and improve",
          platform: video.platform || "youtube",
        });
      }
    }

    return analysis;
  } catch (err: any) {
    console.error(`[YouTubeLearning] Performance analysis failed:`, err.message);
    return null;
  }
}

export async function getYouTubeResearch(userId: string): Promise<any> {
  const results = await db
    .select()
    .from(aiResults)
    .where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, "youtube-niche-research")))
    .orderBy(desc(aiResults.createdAt))
    .limit(1);

  if (results.length === 0) return null;
  return (results[0].result as any)?.research || null;
}

export async function refreshYouTubeResearch(userId: string, niche: string): Promise<any> {
  const existing = await getYouTubeResearch(userId);

  const userVideos = await db
    .select()
    .from(videos)
    .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
    .orderBy(desc(videos.createdAt))
    .limit(20);

  const videoSummary = userVideos.map(v => ({
    title: v.title,
    views: v.metadata?.stats?.views || 0,
    likes: v.metadata?.stats?.likes || 0,
    ctr: v.metadata?.stats?.ctr || 0,
    platform: v.platform,
  }));

  const prompt = `You are a YouTube research analyst updating your niche research based on the creator's actual performance data.

NICHE: "${niche}"
PREVIOUS RESEARCH HIGHLIGHTS: ${existing ? JSON.stringify({
    topFormats: existing.nicheAnalysis?.topPerformingFormats,
    titlePatterns: existing.nicheAnalysis?.titlePatterns,
    contentGaps: existing.contentGaps,
  }) : "No previous research"}

CREATOR'S ACTUAL VIDEO PERFORMANCE (most recent ${videoSummary.length} videos):
${JSON.stringify(videoSummary)}

Based on how their videos are actually performing vs the niche benchmarks, update the research with PERSONALIZED insights.

Also scan YouTube and broader internet video trends to find new patterns, emerging formats, or cross-platform video techniques that could improve this creator's content.

Respond with JSON:
{
  "updatedInsights": {
    "performanceTrend": "improving/stable/declining based on their data",
    "strongAreas": ["What they're doing well based on actual performance"],
    "weakAreas": ["Where they need improvement based on actual performance"],
    "newTrends": ["5 new YouTube trends or techniques to incorporate"],
    "externalVideoSources": [
      {
        "source": "Platform/type of content to study (e.g., 'Masterclass editing tutorials', 'TikTok viral format adaptations')",
        "whatToLearn": "Specific technique or approach to extract",
        "howToApply": "How to incorporate into their YouTube content"
      }
    ],
    "competitorMoves": ["3 things competitors in this niche are doing that this creator isn't"],
    "algorithmShifts": ["Any recent YouTube algorithm changes relevant to this niche"],
    "nextPhaseGoals": ["5 specific goals for the next phase of growth"]
  },
  "skillAssessment": {
    "currentLevel": 1-100,
    "strengths": ["List actual skill strengths"],
    "developmentAreas": ["Skills to develop next"],
    "recommendedStudy": ["Specific types of content to study for improvement"]
  }
}`;

  const updated = await aiGenerate(prompt);

  await db.insert(aiResults).values({
    userId,
    featureKey: "youtube-research-update",
    result: {
      niche,
      update: updated,
      videoCount: videoSummary.length,
      updatedAt: new Date().toISOString(),
      source: "youtube_learning_engine_refresh",
    },
  });

  if (updated.updatedInsights?.newTrends) {
    await recordLearningEvent(userId, "trend_analysis", "youtube_new_trends", {
      finding: `New trends: ${updated.updatedInsights.newTrends.join("; ")}`,
      evidence: [`Research refresh at ${new Date().toISOString()}`],
      recommendation: `Incorporate these emerging trends into upcoming content`,
      platform: "youtube",
    });
  }

  if (updated.updatedInsights?.externalVideoSources) {
    for (const source of updated.updatedInsights.externalVideoSources) {
      await recordLearningEvent(userId, "external_learning", `external_source_${source.source?.replace(/\s/g, '_')?.toLowerCase()?.slice(0, 30)}`, {
        finding: `Study ${source.source}: ${source.whatToLearn}`,
        evidence: [`Cross-platform research`],
        recommendation: source.howToApply,
      });
    }
  }

  return updated;
}

export function getSkillLevelFromVideosCreated(videosCreated: number): {
  level: number;
  label: string;
  qualityMultiplier: number;
} {
  if (videosCreated <= 0) return { level: 1, label: "complete_beginner", qualityMultiplier: 0.15 };
  if (videosCreated <= 2) return { level: 5, label: "absolute_novice", qualityMultiplier: 0.20 };
  if (videosCreated <= 5) return { level: 10, label: "novice", qualityMultiplier: 0.30 };
  if (videosCreated <= 10) return { level: 18, label: "learning_basics", qualityMultiplier: 0.40 };
  if (videosCreated <= 20) return { level: 28, label: "getting_comfortable", qualityMultiplier: 0.50 };
  if (videosCreated <= 35) return { level: 38, label: "finding_voice", qualityMultiplier: 0.60 };
  if (videosCreated <= 50) return { level: 48, label: "developing", qualityMultiplier: 0.70 };
  if (videosCreated <= 75) return { level: 58, label: "intermediate", qualityMultiplier: 0.78 };
  if (videosCreated <= 100) return { level: 68, label: "proficient", qualityMultiplier: 0.85 };
  if (videosCreated <= 150) return { level: 78, label: "skilled", qualityMultiplier: 0.90 };
  if (videosCreated <= 250) return { level: 88, label: "advanced", qualityMultiplier: 0.95 };
  return { level: 95, label: "expert", qualityMultiplier: 1.0 };
}

export function getCreatorMaturityPrompt(videosCreated: number): string {
  const skill = getSkillLevelFromVideosCreated(videosCreated);

  if (skill.level <= 5) {
    return `
CREATOR MATURITY: COMPLETE BEGINNER (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator has NEVER made a video before. Their first few videos should be ROUGH:
- Awkward intros ("uh, hey, so this is my first video...")
- No consistent branding or style yet
- Rambling and unfocused structure
- Basic editing (jump cuts only, no fancy transitions)
- Uncertain tone - they don't know their "voice" yet
- Overly long or too short - bad pacing instincts
- Generic thumbnails and titles
- Nervous energy, over-explaining simple things
- No established catchphrases or personality traits
- Descriptions are bare minimum or copy-pasted templates
- Tags are random guesses
- May reference what other creators do instead of having their own approach
THINK: Like the very first video a 19-year-old uploads to YouTube from their bedroom with a phone camera. It's genuine but rough.`;
  }

  if (skill.level <= 18) {
    return `
CREATOR MATURITY: NOVICE (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator has a few videos under their belt. They're learning but still rough:
- Starting to develop a greeting/opening style but inconsistent
- Structure is better but still wanders off topic
- Editing improved slightly (they learned one or two effects)
- Starting to develop opinions and preferences about content
- Still unsure of ideal video length
- Thumbnails improving but not eye-catching yet
- Titles getting better but still not optimized
- Occasional genuine moments of personality breaking through
- Still comparing themselves to bigger creators
- Descriptions slightly better, maybe found a template they like
THINK: A creator who's uploaded 5-10 videos. They're getting the hang of recording but editing is still basic and they're still finding their groove.`;
  }

  if (skill.level <= 38) {
    return `
CREATOR MATURITY: DEVELOPING (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator is finding their voice and getting more comfortable:
- Developing a recognizable opening and closing style
- Content structure is more focused, fewer tangents
- Starting to understand what their audience likes
- Editing getting noticeably better (transitions, pacing, b-roll)
- Beginning to develop a "brand voice" even if not fully consistent
- Thumbnails are better - learning what colors/text pop
- Titles use some proven patterns but still hit-or-miss
- More confident delivery, fewer "ums" and awkward pauses
- Starting to develop their own unique spin on topics
- Learning from analytics - adjusting based on what gets views
THINK: A creator 3-6 months in who's starting to "get it" but still has clear room for growth. Noticeably better than their early videos.`;
  }

  if (skill.level <= 58) {
    return `
CREATOR MATURITY: INTERMEDIATE (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator has solid skills and is building momentum:
- Clear brand identity and consistent personality
- Good video structure with strong hooks and pacing
- Competent editing with personality-driven style choices
- Understanding of SEO and titles that get clicks
- Thumbnails that compete with established creators
- Developing community with inside jokes and callbacks
- Confident delivery with natural energy shifts
- Content ideas are more original, less derivative
- Starting to experiment with formats and series
- Analytics-driven decisions becoming second nature
THINK: A creator 6-12 months in who's clearly improved and starting to build a real audience. Their content quality is solid but not yet polished.`;
  }

  if (skill.level <= 78) {
    return `
CREATOR MATURITY: SKILLED (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator produces consistently good content:
- Professional-level structure and pacing
- Distinctive style that's immediately recognizable
- Strong retention techniques woven throughout
- Excellent thumbnails and titles
- Deep understanding of their audience
- Content experiments and series that build on each other
- Efficient production workflow
- Natural authority on their niche topics
- Cross-platform awareness and strategy
THINK: A creator 1-2 years in who's found their groove. Their content is consistently good with occasional standout videos.`;
  }

  return `
CREATOR MATURITY: ADVANCED/EXPERT (Video #${videosCreated + 1}, Skill Level ${skill.level}/100)
This creator produces high-quality, polished content:
- Expert-level production and storytelling
- Unique, instantly recognizable brand
- Audience psychology mastery
- Innovative formats that others copy
- Highly optimized SEO and distribution
- Strong community and loyal fanbase
- Revenue diversification and brand partnerships
- Every element (title, thumbnail, hook, pacing, CTA) is optimized
THINK: An established creator who knows exactly what they're doing. Content is consistently excellent.`;
}

export async function getCreatorVideosCreated(userId: string): Promise<number> {
  try {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(aiResults)
      .where(and(
        eq(aiResults.userId, userId),
        sql`${aiResults.featureKey} LIKE 'video-creation-%'`
      ));
    return Number(result[0]?.count) || 0;
  } catch {
    return 0;
  }
}

export async function getYouTubeLearningContext(userId: string, niche?: string): Promise<string> {
  const parts: string[] = [];

  try {
    const research = await getYouTubeResearch(userId);
    if (research?.nicheAnalysis) {
      parts.push("YOUTUBE NICHE INTELLIGENCE (from YouTube research):");
      if (research.nicheAnalysis.topPerformingFormats) {
        parts.push(`- Top formats: ${research.nicheAnalysis.topPerformingFormats.join(", ")}`);
      }
      if (research.nicheAnalysis.titlePatterns) {
        parts.push(`- Proven title patterns: ${research.nicheAnalysis.titlePatterns.slice(0, 3).join("; ")}`);
      }
      if (research.nicheAnalysis.hookStyles) {
        parts.push(`- Best hooks: ${research.nicheAnalysis.hookStyles.slice(0, 3).join("; ")}`);
      }
      if (research.nicheAnalysis.commonMistakes) {
        parts.push(`- Avoid: ${research.nicheAnalysis.commonMistakes.slice(0, 3).join("; ")}`);
      }
      if (research.nicheAnalysis.averageVideoLength) {
        parts.push(`- Ideal video length: ${research.nicheAnalysis.averageVideoLength}`);
      }
    }

    if (research?.contentGaps) {
      parts.push(`- Content gaps to exploit: ${research.contentGaps.slice(0, 3).join(", ")}`);
    }

    if (research?.crossPlatformInsights) {
      parts.push("\nCROSS-PLATFORM ADAPTATION:");
      const cpi = research.crossPlatformInsights;
      if (cpi.tiktokAngle) parts.push(`- TikTok: ${cpi.tiktokAngle}`);
      if (cpi.twitchAngle) parts.push(`- Twitch: ${cpi.twitchAngle}`);
    }

    const updates = await db.select().from(aiResults)
      .where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, "youtube-research-update")))
      .orderBy(desc(aiResults.createdAt))
      .limit(1);

    if (updates.length > 0) {
      const update = (updates[0].result as any)?.update;
      if (update?.updatedInsights?.newTrends) {
        parts.push(`\nLATEST TRENDS: ${update.updatedInsights.newTrends.slice(0, 3).join("; ")}`);
      }
      if (update?.updatedInsights?.externalVideoSources) {
        parts.push("EXTERNAL VIDEO SOURCES TO STUDY:");
        for (const src of update.updatedInsights.externalVideoSources.slice(0, 2)) {
          parts.push(`- ${src.source}: ${src.whatToLearn}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`[YouTubeLearning] Failed to get learning context:`, err.message);
  }

  return parts.join("\n");
}
