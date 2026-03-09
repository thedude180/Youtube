import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { users, aiResults, streamPipelines } from "@shared/schema";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";
import {
  generateHumanScheduledTime,
  generateStaggeredSchedule,
  addHumanMicroDelay,
  shouldPostToday,
  getActivityWindow,
  simulateTypingDelay,
  getCommentResponseDelay,
} from "./human-behavior-engine";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import { getKeywordContext } from "./services/keyword-learning-engine";
import { autoApplyKeywordsToNewVideo } from "./services/traffic-growth-engine";
import {
  getCreatorVideosCreated,
  getCreatorMaturityPrompt,
  getSkillLevelFromVideosCreated,
  getYouTubeLearningContext,
  researchYouTubeNiche,
  getYouTubeResearch,
} from "./youtube-learning-engine";
import { creatorSkillProgress } from "@shared/schema";

const openai = getOpenAIClient();

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

export async function buildEmpireFromIdea(userId: string, idea: string) {
  sendSSEEvent(userId, "empire-progress", { step: "research", status: "started", message: "Researching YouTube trends and successful creators in your niche..." });

  let researchSucceeded = false;
  try {
    await researchYouTubeNiche(userId, idea);
    researchSucceeded = true;
    sendSSEEvent(userId, "empire-progress", { step: "research", status: "completed", message: "YouTube niche intelligence gathered!" });
  } catch (err: any) {
    console.error(`[Empire] YouTube research failed (non-fatal):`, err.message);
    sendSSEEvent(userId, "empire-progress", { step: "research", status: "completed", message: "Proceeding with AI knowledge base..." });
  }

  const [existingSkill] = await db.select().from(creatorSkillProgress)
    .where(eq(creatorSkillProgress.userId, userId)).limit(1);

  if (!existingSkill) {
    await db.insert(creatorSkillProgress).values({
      userId,
      videosCreated: 0,
      skillLevel: 1,
      skillLabel: "complete_beginner",
      qualityMultiplier: 0.15,
      youtubeResearchSeeded: researchSucceeded,
    });
  } else if (researchSucceeded && !existingSkill.youtubeResearchSeeded) {
    await db.update(creatorSkillProgress).set({ youtubeResearchSeeded: true })
      .where(eq(creatorSkillProgress.id, existingSkill.id));
  }

  sendSSEEvent(userId, "empire-progress", { step: "niche", status: "started", message: "Analyzing your idea and refining your niche..." });

  const youtubeContext = await getYouTubeLearningContext(userId, idea);

  const nicheAndBrandPrompt = `You are an elite content strategy consultant who has helped hundreds of creators build million-subscriber channels from scratch. A complete beginner has come to you with this idea: "${idea}"

${youtubeContext ? `YOUTUBE INTELLIGENCE (use this to inform your strategy):\n${youtubeContext}\n` : ""}

Your job is to turn this raw idea into a refined, profitable content niche with a full brand identity.

Respond with JSON containing these exact fields:
{
  "niche": {
    "primary": "The main refined niche (e.g., 'Specific sub-niche relevant to the creator's content')",
    "subNiches": ["5 specific sub-niches they can create content around"],
    "targetAudience": "Detailed description of the ideal viewer (age range, interests, pain points, where they hang out online)",
    "marketSize": "Estimated audience size and growth trend",
    "competitionLevel": "low/medium/high with explanation",
    "uniqueAngle": "What makes this creator's approach different from existing creators in the space"
  },
  "brandIdentity": {
    "nameOptions": [
      {"name": "BrandName1", "reasoning": "Why this name works"},
      {"name": "BrandName2", "reasoning": "Why this name works"},
      {"name": "BrandName3", "reasoning": "Why this name works"}
    ],
    "tagline": "A catchy, memorable tagline",
    "colorPalette": {
      "primary": "#hex color",
      "secondary": "#hex color",
      "accent": "#hex color",
      "reasoning": "Why these colors work for this niche"
    },
    "personality": "Description of the brand voice and personality (e.g., 'Energetic, slightly sarcastic, always helpful - like your coolest friend who happens to be an expert')",
    "contentTone": "The specific tone to use in videos, descriptions, and social posts"
  }
}

Be extremely specific and actionable. No generic advice.`;

  const nicheAndBrand = await aiGenerate(nicheAndBrandPrompt);
  sendSSEEvent(userId, "empire-progress", { step: "niche", status: "completed", message: "Niche and brand identity defined!" });

  sendSSEEvent(userId, "empire-progress", { step: "pillars", status: "started", message: "Building your content pillars and platform strategy..." });

  const pillarsPrompt = `You are a content strategy expert. Based on this niche and brand:

Niche: ${JSON.stringify(nicheAndBrand.niche)}
Brand: ${JSON.stringify(nicheAndBrand.brandIdentity)}

Create 5 content pillars (recurring content themes/series) and a platform strategy.

Respond with JSON:
{
  "contentPillars": [
    {
      "name": "Series/Pillar Name",
      "description": "What this series is about",
      "frequency": "How often to post (e.g., 'Every Tuesday and Thursday')",
      "format": "Video format (e.g., '10-15 min deep dive', '60-second short', 'live stream')",
      "exampleTitles": ["5 specific video title examples with hooks"],
      "whyItWorks": "Why this pillar will attract and retain viewers",
      "difficulty": "beginner/intermediate/advanced - how hard this is to produce",
      "equipmentNeeded": ["List of equipment/software needed"]
    }
  ],
  "platformStrategy": {
    "youtube": {
      "priority": 1,
      "role": "Primary long-form home base",
      "contentTypes": ["What to post here"],
      "postingFrequency": "How often",
      "growthTactic": "Specific growth strategy for this platform",
      "whenToStart": "Day 1, Week 2, etc."
    },
    "twitch": {
      "priority": 2,
      "role": "STREAMING ONLY — no content posting. AI optimizes stream titles, tags, and categories during live broadcasts",
      "contentTypes": ["Live streaming only — no video uploads or content posts"],
      "postingFrequency": "Stream schedule only",
      "growthTactic": "Specific live streaming growth strategy",
      "whenToStart": "When to add this streaming platform"
    },
    "kick": {
      "priority": 3,
      "role": "STREAMING ONLY — no content posting. AI optimizes stream metadata during live broadcasts",
      "contentTypes": ["Live streaming only — no video uploads or content posts"],
      "postingFrequency": "Stream schedule only",
      "growthTactic": "Specific live streaming growth strategy",
      "whenToStart": "When to add this streaming platform"
    },
    "tiktok": {
      "priority": 4,
      "role": "Role of this platform",
      "contentTypes": ["What to post here"],
      "postingFrequency": "How often",
      "growthTactic": "Specific growth strategy",
      "whenToStart": "When to add this platform"
    },
    "discord": {
      "priority": 6,
      "role": "Role of this platform",
      "contentTypes": ["What to do here"],
      "postingFrequency": "How often to engage",
      "growthTactic": "Community building strategy",
      "whenToStart": "When to launch Discord"
    }
  }
}

Rank platforms by priority (1 = most important). Be specific about WHEN to start each platform - beginners shouldn't try all 6 at once. Give specific, actionable tactics, not vague advice.`;

  const pillarsAndPlatform = await aiGenerate(pillarsPrompt);
  sendSSEEvent(userId, "empire-progress", { step: "pillars", status: "completed", message: "Content pillars and platform strategy ready!" });

  sendSSEEvent(userId, "empire-progress", { step: "plan", status: "started", message: "Creating your 30-day launch plan..." });

  const planPrompt = `You are a content launch strategist. Create a detailed 30-day content plan for a beginner creator.

Niche: ${JSON.stringify(nicheAndBrand.niche)}
Content Pillars: ${JSON.stringify(pillarsAndPlatform.contentPillars?.map((p: any) => p.name))}
Platform Priority: ${JSON.stringify(Object.entries(pillarsAndPlatform.platformStrategy || {}).sort((a: any, b: any) => a[1].priority - b[1].priority).map(([k]: any) => k))}

Respond with JSON:
{
  "first30DaysPlan": [
    {
      "day": 1,
      "theme": "Setup & Foundation",
      "tasks": [
        {
          "task": "Specific task description",
          "platform": "youtube/tiktok/all",
          "timeEstimate": "30 minutes",
          "priority": "must-do/should-do/nice-to-have"
        }
      ],
      "contentToPost": {
        "title": "Specific video/post title if posting today",
        "type": "video/short/stream/post",
        "platform": "where to post",
        "description": "Brief content description"
      },
      "tip": "A helpful tip for this day"
    }
  ]
}

RULES:
- Days 1-3 should focus on setup (channel art, about section, first video prep)
- First video should go live by Day 4-5
- Include at least 15 specific content pieces across the 30 days
- Each content piece needs a SPECIFIC title with a hook, not generic like "Video about topic"
- Mix content types: long-form, shorts, streams, community posts
- Build complexity gradually - start simple, add platforms over time
- Include rest days (not every day needs content)
- Add milestones: "By Day 10 you should have X subscribers"`;

  const plan = await aiGenerate(planPrompt);
  sendSSEEvent(userId, "empire-progress", { step: "plan", status: "completed", message: "30-day plan created!" });

  sendSSEEvent(userId, "empire-progress", { step: "growth", status: "started", message: "Mapping your growth roadmap and monetization timeline..." });

  const growthPrompt = `You are a creator economy analyst. Build a growth roadmap and monetization timeline.

Niche: ${JSON.stringify(nicheAndBrand.niche)}
Platforms: ${JSON.stringify(Object.keys(pillarsAndPlatform.platformStrategy || {}))}

Respond with JSON:
{
  "growthRoadmap": {
    "threeMonths": {
      "subscriberGoal": "Realistic subscriber count across platforms",
      "viewGoal": "Monthly view target",
      "milestones": ["5 specific milestones to hit"],
      "focusAreas": ["What to prioritize this phase"],
      "biggestChallenge": "The main obstacle and how to overcome it",
      "keyMetrics": ["Metrics to track"]
    },
    "sixMonths": {
      "subscriberGoal": "Subscriber target",
      "viewGoal": "Monthly view target",
      "milestones": ["5 specific milestones"],
      "focusAreas": ["Priorities for this phase"],
      "biggestChallenge": "Main obstacle and solution",
      "keyMetrics": ["Metrics to track"],
      "newOpportunities": ["What becomes possible at this stage"]
    },
    "twelveMonths": {
      "subscriberGoal": "Subscriber target",
      "viewGoal": "Monthly view target",
      "milestones": ["5 specific milestones"],
      "focusAreas": ["Priorities for this phase"],
      "revenueTarget": "Realistic monthly revenue range",
      "teamConsiderations": "When/if to hire help and what roles",
      "brandDeals": "What brand deals become realistic"
    }
  },
  "monetizationTimeline": {
    "month1": {
      "streams": ["Available revenue streams"],
      "estimatedRevenue": "$0-X range",
      "actions": ["Specific steps to take"]
    },
    "month3": {
      "streams": ["Revenue streams to activate"],
      "estimatedRevenue": "$X-Y range",
      "actions": ["Steps to unlock each stream"]
    },
    "month6": {
      "streams": ["All active revenue streams"],
      "estimatedRevenue": "$X-Y range",
      "actions": ["Optimization steps"]
    },
    "month12": {
      "streams": ["Full revenue portfolio"],
      "estimatedRevenue": "$X-Y range",
      "actions": ["Scaling strategies"]
    }
  }
}

Be realistic with numbers. Don't promise viral success. Base estimates on typical creator growth in this niche. Include specific dollar amounts and subscriber counts.`;

  const growth = await aiGenerate(growthPrompt);
  sendSSEEvent(userId, "empire-progress", { step: "growth", status: "completed", message: "Growth roadmap and monetization plan ready!" });

  sendSSEEvent(userId, "empire-progress", { step: "formulas", status: "started", message: "Building your content formulas and thumbnail strategy..." });

  const formulasPrompt = `You are a viral content expert. Create content formulas and thumbnail strategy for this niche.

Niche: ${JSON.stringify(nicheAndBrand.niche)}
Brand Personality: ${nicheAndBrand.brandIdentity?.personality || "Energetic and helpful"}

Respond with JSON:
{
  "contentFormulas": [
    {
      "name": "Formula Name (e.g., 'The Challenge Video')",
      "structure": "Step-by-step video structure (intro hook -> setup -> main content -> climax -> CTA)",
      "hookTemplate": "Fill-in-the-blank hook template (e.g., 'I tried [X] for [TIME] and here is what happened...')",
      "titleTemplates": ["3 title templates with blanks to fill"],
      "idealLength": "Optimal video length",
      "bestFor": "When to use this formula",
      "exampleVideo": "A specific example title using this formula",
      "retentionTips": ["3 tips to keep viewers watching"],
      "cta": "Best call-to-action for this type of video"
    }
  ],
  "thumbnailStyle": {
    "overallApproach": "Description of the thumbnail aesthetic",
    "colorStrategy": "What colors to use and avoid",
    "textRules": "How to use text on thumbnails (max words, font style, placement)",
    "faceExpression": "Whether/how to use face in thumbnails",
    "composition": "Layout and composition guidelines",
    "examples": [
      {
        "videoType": "Type of video",
        "thumbnailDescription": "Detailed description of what the thumbnail should look like",
        "textOverlay": "What text to put on it",
        "emotionalTrigger": "What emotion this triggers in the viewer"
      }
    ],
    "commonMistakes": ["5 thumbnail mistakes to avoid"],
    "tools": ["Recommended thumbnail creation tools"]
  },
  "streamSchedule": {
    "optimalDays": ["Best days to stream and why"],
    "optimalTimes": ["Best time slots with timezone considerations"],
    "sessionLength": "Recommended stream length",
    "warmupRoutine": "What to do before going live",
    "streamStructure": "How to structure a typical stream",
    "interactionTips": ["5 tips for engaging chat during streams"],
    "growthHacks": ["3 stream-specific growth tactics"]
  }
}

Every formula should be so specific that a beginner can follow it like a recipe. Include exact timing, hooks, and structures.`;

  const formulas = await aiGenerate(formulasPrompt);
  sendSSEEvent(userId, "empire-progress", { step: "formulas", status: "completed", message: "Content formulas and strategies complete!" });

  const blueprintData = {
    idea,
    generatedAt: new Date().toISOString(),
    niche: nicheAndBrand.niche,
    brandIdentity: nicheAndBrand.brandIdentity,
    contentPillars: pillarsAndPlatform.contentPillars,
    platformStrategy: pillarsAndPlatform.platformStrategy,
    first30DaysPlan: plan.first30DaysPlan,
    growthRoadmap: growth.growthRoadmap,
    monetizationTimeline: growth.monetizationTimeline,
    contentFormulas: formulas.contentFormulas,
    thumbnailStyle: formulas.thumbnailStyle,
    streamSchedule: formulas.streamSchedule,
  };

  const existing = await db
    .select()
    .from(aiResults)
    .where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, "empire-blueprint")))
    .limit(1);

  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .update(aiResults)
        .set({ result: blueprintData, createdAt: new Date() })
        .where(eq(aiResults.id, existing[0].id));
    } else {
      await tx.insert(aiResults).values({
        userId,
        featureKey: "empire-blueprint",
        result: blueprintData,
      });
    }

    const nicheLabel = nicheAndBrand.niche?.primary || idea;
    await tx
      .update(users)
      .set({ contentNiche: nicheLabel, autopilotActive: true })
      .where(eq(users.id, userId));
  });

  try {
    const { updateAutopilotFeatureConfig } = await import("./autopilot-engine");
    const autopilotFeatures = ["auto-clip", "smart-schedule", "comment-responder", "discord-announce", "content-recycler", "cross-promo", "stealth-mode"];
    for (const feature of autopilotFeatures) {
      await updateAutopilotFeatureConfig(userId, feature, true, {});
    }
  } catch (err: any) {
    console.error(`[Empire] Autopilot setup failed (non-fatal):`, err.message);
  }

  sendSSEEvent(userId, "empire-progress", { step: "complete", status: "completed", message: "Your content empire blueprint is ready!" });

  sendSSEEvent(userId, "empire-progress", { step: "auto-video", status: "started", message: "Auto-creating videos and spawning VOD pipelines from your blueprint..." });
  autoLaunchEmpireContent(userId, 3).then(launchResult => {
    sendSSEEvent(userId, "empire-progress", { step: "auto-video", status: "completed", message: `Auto-launched ${launchResult.totalLaunched} videos into VOD pipelines!` });
  }).catch(err => {
    console.error(`[Empire] Auto-launch failed for user ${userId}:`, err.message);
    sendSSEEvent(userId, "empire-progress", { step: "auto-video", status: "error", message: "Auto-launch encountered an issue but your blueprint is saved." });
  });

  return blueprintData;
}

export async function generateContentIdeasFromEmpire(userId: string, count: number = 10) {
  const blueprint = await getEmpireBlueprint(userId);
  if (!blueprint) {
    throw new Error("No empire blueprint found. Please build your empire first.");
  }

  const prompt = `You are a content idea machine. Based on this creator's empire blueprint, generate ${count} fresh, specific content ideas.

EMPIRE BLUEPRINT:
- Niche: ${JSON.stringify(blueprint.niche)}
- Content Pillars: ${JSON.stringify(blueprint.contentPillars?.map((p: any) => ({ name: p.name, description: p.description })))}
- Brand Personality: ${blueprint.brandIdentity?.personality || "Energetic and helpful"}
- Content Formulas: ${JSON.stringify(blueprint.contentFormulas?.map((f: any) => ({ name: f.name, hookTemplate: f.hookTemplate })))}

Generate ${count} content ideas. Each should be UNIQUE and SPECIFIC - not generic suggestions.

Respond with JSON:
{
  "ideas": [
    {
      "title": "Specific, click-worthy title with a hook",
      "description": "2-3 sentence description of the video content",
      "pillar": "Which content pillar this belongs to",
      "format": "long-form/short/stream/community post",
      "platform": "Best platform for this content",
      "tags": ["10 relevant SEO tags"],
      "estimatedPerformance": {
        "viewPotential": "low/medium/high/viral",
        "difficulty": "easy/medium/hard",
        "timeToCreate": "Estimated production time",
        "trendRelevance": "evergreen/trending/seasonal"
      },
      "thumbnailConcept": "Brief description of the ideal thumbnail",
      "hookScript": "The exact first 5 seconds of the video (the hook)"
    }
  ]
}

Make titles that a viewer would actually click on. Use proven hook patterns: curiosity gaps, challenges, transformations, lists, controversies, and behind-the-scenes reveals.`;

  const result = await aiGenerate(prompt);
  return result.ideas || [];
}

export async function getEmpireBlueprint(userId: string) {
  const results = await db
    .select()
    .from(aiResults)
    .where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, "empire-blueprint")))
    .orderBy(desc(aiResults.createdAt))
    .limit(1);

  if (results.length === 0) return null;
  return results[0].result as any;
}

export async function expandEmpirePillar(userId: string, pillarIndex: number) {
  const blueprint = await getEmpireBlueprint(userId);
  if (!blueprint) {
    throw new Error("No empire blueprint found. Please build your empire first.");
  }

  const pillars = blueprint.contentPillars || [];
  if (pillarIndex < 0 || pillarIndex >= pillars.length) {
    throw new Error(`Invalid pillar index. You have ${pillars.length} pillars (0-${pillars.length - 1}).`);
  }

  const pillar = pillars[pillarIndex];

  const prompt = `You are an SEO and content strategy expert. Expand this content pillar into 10 fully developed video ideas with complete SEO strategy.

CONTENT PILLAR:
Name: ${pillar.name}
Description: ${pillar.description}
Format: ${pillar.format}
Frequency: ${pillar.frequency}

CREATOR CONTEXT:
Niche: ${JSON.stringify(blueprint.niche)}
Brand: ${blueprint.brandIdentity?.personality || "Energetic and helpful"}
Thumbnail Style: ${JSON.stringify(blueprint.thumbnailStyle?.overallApproach || "Bold and eye-catching")}

Respond with JSON:
{
  "pillarName": "${pillar.name}",
  "videoIdeas": [
    {
      "title": "Specific, SEO-optimized, click-worthy title",
      "description": "Full YouTube-style description (100+ words) with actual chapter timestamps (e.g., 0:00 Intro, 1:30 Topic Name), cross-platform links, and SEO keywords naturally included. Write real chapter names - never use placeholders",
      "tags": ["15 SEO-optimized tags ordered by relevance"],
      "seoStrategy": {
        "primaryKeyword": "Main keyword to rank for",
        "secondaryKeywords": ["5 secondary keywords"],
        "searchVolume": "estimated: low/medium/high",
        "competition": "low/medium/high",
        "rankingDifficulty": "easy/medium/hard"
      },
      "scriptOutline": [
        "00:00 - Hook: Exact opening line",
        "00:15 - Intro: What this video covers",
        "01:00 - Section 1: Topic",
        "03:00 - Section 2: Topic",
        "05:00 - Section 3: Topic",
        "08:00 - Conclusion and CTA"
      ],
      "thumbnailPrompt": "Detailed description for creating the thumbnail",
      "estimatedLength": "Video duration",
      "bestPostingTime": "Optimal day and time to publish",
      "crossPromotionPlan": "How to promote this across other platforms",
      "contentSeries": "If this is part of a series, what comes before/after"
    }
  ],
  "seriesStrategy": {
    "publishingOrder": "What order to release these videos for maximum growth",
    "interlinking": "How to link videos together for watch-time",
    "playlistStrategy": "How to organize into playlists"
  }
}

Every title must be something a viewer would genuinely click on. Use power words, numbers, and curiosity gaps. Descriptions should be fully written out, not templates.`;

  const result = await aiGenerate(prompt);
  return result;
}

export async function generateLaunchSequence(userId: string) {
  const blueprint = await getEmpireBlueprint(userId);
  if (!blueprint) {
    throw new Error("No empire blueprint found. Please build your empire first.");
  }

  const prompt = `You are a content launch strategist who has orchestrated hundreds of successful creator launches. Build the perfect launch sequence for this creator.

CREATOR'S EMPIRE BLUEPRINT:
- Niche: ${JSON.stringify(blueprint.niche)}
- Brand: ${JSON.stringify(blueprint.brandIdentity)}
- Platforms: ${JSON.stringify(Object.entries(blueprint.platformStrategy || {}).sort((a: any, b: any) => a[1].priority - b[1].priority).map(([k, v]: any) => ({ platform: k, priority: v.priority, role: v.role })))}
- Content Pillars: ${JSON.stringify(blueprint.contentPillars?.map((p: any) => p.name))}
- Content Formulas: ${JSON.stringify(blueprint.contentFormulas?.map((f: any) => f.name))}

Create a strategic launch sequence that builds momentum over the first 14 days.

Respond with JSON:
{
  "preLaunch": {
    "duration": "How many days before first public content",
    "tasks": [
      {
        "task": "Specific pre-launch task",
        "why": "Why this matters",
        "timeNeeded": "How long this takes",
        "priority": "critical/important/nice-to-have"
      }
    ],
    "contentToPreRecord": [
      {
        "title": "Specific video title",
        "type": "long-form/short",
        "purpose": "Why this should be ready before launch"
      }
    ]
  },
  "launchDay": {
    "schedule": [
      {
        "time": "Specific time (e.g., 9:00 AM EST)",
        "action": "What to do",
        "platform": "Where",
        "content": "Specific content details"
      }
    ],
    "firstVideo": {
      "title": "The exact title of your launch video",
      "type": "long-form/short",
      "hook": "The opening 10 seconds script",
      "description": "Full description text",
      "tags": ["15 launch-day tags"],
      "thumbnailDescription": "Exactly what the thumbnail should look like",
      "cta": "What to tell viewers to do"
    },
    "socialBlitz": {
      "posts": [
        {
          "platform": "tiktok/discord",
          "content": "Exact post text",
          "timing": "When to post relative to video launch",
          "hashtags": ["relevant hashtags"]
        }
      ]
    }
  },
  "week1": {
    "dailyPlan": [
      {
        "day": 1,
        "content": [
          {
            "title": "Specific content title",
            "type": "video/short/stream/post",
            "platform": "Where to post",
            "timing": "Best time to post",
            "crossPromotion": "How to promote on other platforms"
          }
        ],
        "communityActions": ["Engage in X subreddits", "Reply to comments", etc.],
        "analyticsCheck": "What metrics to review today"
      }
    ],
    "keyMilestones": ["Milestones to hit by end of week 1"]
  },
  "week2": {
    "dailyPlan": [
      {
        "day": 8,
        "content": [
          {
            "title": "Specific content title",
            "type": "video/short/stream/post",
            "platform": "Where to post",
            "timing": "Best time to post"
          }
        ],
        "newPlatformLaunch": "If adding a new platform this day, details here",
        "communityActions": ["Community engagement tasks"]
      }
    ],
    "firstStreamPlan": {
      "day": "Which day to do first stream",
      "platform": "Where to stream",
      "title": "Stream title",
      "duration": "How long",
      "structure": "Minute-by-minute stream structure",
      "chatEngagement": "How to interact with early viewers",
      "postStreamContent": "What to create from the stream (clips, shorts, highlights)"
    },
    "adjustmentChecklist": ["What to adjust based on week 1 performance"]
  },
  "momentumBuilders": {
    "collaborationStrategy": "How and when to reach out to other creators",
    "communitySeeding": "Where to share content organically (subreddits, forums, discords)",
    "algorithmHacks": ["Platform-specific tips for getting picked up by algorithms"],
    "crossPlatformSynergy": "How each platform feeds into the others"
  }
}

This should read like a battle plan. Every action should have a clear purpose. The creator should know EXACTLY what to do every single day.`;

  const result = await aiGenerate(prompt);
  return result;
}

const FULL_BANNED_AI_PHRASES = [
  "check out", "don't miss", "smash that like", "hit subscribe",
  "ring the bell", "without further ado", "let's dive in",
  "it's worth noting", "furthermore", "leverage", "utilize",
  "at the end of the day", "game-changer", "groundbreaking",
  "revolutionize", "seamlessly", "delve", "elevate your",
  "unlock the", "comprehensive guide", "in conclusion",
  "in today's digital", "in this video", "today we're going to",
  "buckle up", "stay tuned", "moving forward", "on another note",
  "that being said", "having said that", "needless to say",
  "it goes without saying", "last but not least", "first and foremost",
  "navigate the", "landscape", "paradigm", "synergy", "optimize",
  "streamline", "robust", "cutting-edge", "state-of-the-art",
  "take it to the next level", "deep dive", "unpack", "break down",
  "journey", "embark", "explore the world of", "realm of",
  "shed light on", "touch upon", "address the elephant",
  "at its core", "when it comes to", "not only...but also",
  "in order to", "the fact of the matter", "it is important to note",
  "with that being said", "as we all know", "as you may know",
  "without a doubt", "goes without saying", "rest assured",
  "on a daily basis", "each and every", "at this point in time",
  "prior to", "in terms of", "with regards to", "in light of",
  "plays a crucial role", "is a testament to", "stands as a",
  "continues to", "remains a", "has become increasingly",
  "marks a significant", "represents a", "offers a unique",
  "provides a comprehensive", "delivers a", "ensures a seamless",
];

const HUMAN_TITLE_PATTERNS = [
  "Use lowercase or mixed case naturally - not every word needs capitalization",
  "Real creators sometimes use ALL CAPS for one word for emphasis, not the whole title",
  "Include numbers and specifics ('5 things' not 'several things')",
  "Use curiosity gaps but make them feel genuine, not clickbaity",
  "Abbreviate naturally (idk, ngl, fr, lowkey, tbh, imo)",
  "Reference inside jokes or community things the audience would get",
  "Use dashes or pipes instead of perfectly formatted colons",
  "Sometimes just describe what happens, no clever wordplay needed",
  "Use 'I' and personal perspective - this is YOUR video, own it",
  "Real titles are sometimes grammatically imperfect and that's fine",
];

const HUMAN_DESCRIPTION_PATTERNS = [
  "Start with a casual sentence, not a formal summary",
  "Include personal context ('So I was playing ____ and this happened')",
  "Timestamps should look hand-typed (some slightly misformatted is ok)",
  "Don't list every single social media with a pretty format - be messy",
  "Use line breaks inconsistently like a real person typing fast",
  "Add a genuine personal note somewhere ('thanks for watching, seriously')",
  "Social links section should look like you copy-pasted it from last time",
  "Typos in descriptions are actually MORE human (leave one or two subtle ones)",
  "Reference inside jokes or past videos naturally",
  "Some descriptions are literally 2 sentences and that's fine for shorts",
];

const HUMAN_TAG_PATTERNS = [
  "Mix proper tags with casual/slang tags ('minecraft pvp' AND 'minecraft is insane')",
  "Include at least one tag that's slightly misspelled or a common search typo",
  "Add personal brand tags mixed with generic ones",
  "Include trending game/topic names as real people search them",
  "Some tags should be full phrases people actually search ('how to get better at ____')",
  "Don't perfectly optimize every tag - real creators throw in random ones",
  "Include at least one tag that's just a reaction ('bruh moment', 'no way this worked')",
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function generateHumanWritingContext(platform: string, format: string): string {
  const naturalPatterns = [
    "Use contractions ALWAYS (don't, can't, it's, we're, they're, wouldn't) - formal speech is an instant AI tell",
    "Vary sentence length dramatically - some sentences should be 2 words. Others should ramble on for a while like you're thinking out loud and can't quite figure out where to end the thought",
    "Include filler words that humans use when thinking ('honestly', 'look', 'here's the thing', 'okay so', 'right', 'basically', 'like')",
    "Use sentence fragments. On purpose. For emphasis.",
    "Reference personal experience ('I personally think', 'in my experience', 'I swear', 'no joke')",
    "Add natural breath marks and pauses in scripts: [PAUSE], [BREATH], '...', or just '- '",
    "Self-correct mid-thought ('actually, wait - let me rephrase that', 'no that's not right', 'okay scratch that')",
    "Use rhetorical questions then immediately answer them ('Why does this work? Because...')",
    "React genuinely to your own content ('this blew my mind', 'I was NOT expecting that', 'bro WHAT')",
    "Talk to the camera/audience like they're your friend sitting next to you",
    "Start some sentences with 'And' or 'But' - grammar teachers hate it but real people do it",
    "Use emphasis through repetition ('this is good. this is REALLY good')",
    "Include moments where you seem to lose your train of thought and recover",
    "Add personal tangents that feel unscripted then bring it back ('sorry, anyway back to-')",
    "Express uncertainty sometimes ('I think?', 'I'm not 100% sure but', 'don't quote me on this')",
    "Use internet speak where natural ('literally', 'lowkey', 'ngl', 'fr fr', 'deadass')",
  ];

  const platformVoice: Record<string, string> = {
    youtube: `YOUTUBE VOICE: You're talking to ONE person through the camera. Not 'dear viewers' - literally 'you'. 
Use 'you know what I mean?' and 'right?' as conversational anchors.
Imagine you just sat down, hit record, and you're telling your friend about this thing.
Your energy should shift naturally - excited parts, calm parts, confused parts.
Don't open with 'Hey guys welcome back' unless it feels genuinely natural. Sometimes just... start talking about the topic.`,
    tiktok: `TIKTOK VOICE: Ultra-casual. You're recording this on your phone mid-thought.
First 2 seconds are EVERYTHING. No intro, no setup, just the hook.
Use trending audio references, stitch/duet language, 'POV:' format when it fits.
Lowercase energy. Abbreviated everything. This isn't a presentation.
Sound like you're texting your group chat but out loud.`,
    twitch: `TWITCH VOICE: Stream culture runs deep. Reference chat, raids, bits, subs naturally.
You're talking to your chat - real-time energy, reactive, unpredictable.
Gaming callouts, clutch reactions, genuine hype or tilt energy.
Twitch viewers can smell a fake a mile away - be raw.`,
    kick: `KICK VOICE: Even more raw than Twitch. Community-first, unfiltered.
This platform rewards authenticity over production value.
Be real, be edgy (within reason), be yourself with zero corporate polish.`,
    x: `X VOICE: Every. Word. Counts. You have limited characters.
Hot takes > safe takes. Opinions > summaries. Questions > statements.
Write like you're typing fast between games. No drafts, no overthinking.
Sometimes a 4-word post hits harder than a paragraph.`,
    discord: `DISCORD VOICE: You're in your server, talking to your people.
Insider vibes. Reference server jokes, community moments, shared experiences.
This isn't content creation, this is hanging out with your crew.
Use reactions, brief messages, casual energy.`,
  };

  const formatGuidance: Record<string, string> = {
    "long-form": `LONG-FORM PACING: Every 60-90 seconds needs a 'pattern interrupt' - an unexpected joke, surprising fact, sudden energy shift, or 'wait hold on' moment.
Structure should feel organic, not like a numbered list. Real creators don't perfectly outline everything.
Include at least one tangent that adds personality even if it doesn't add information.
The conclusion should NOT summarize everything - just land the final point and move on. Real people don't say 'in conclusion'.
Add 'editor notes' in brackets that feel like an afterthought: [insert clip here], [this is where it gets crazy].`,
    "short": `SHORT-FORM: The first 0.5 seconds decide everything. No warmup. No intro. Just the most interesting thing FIRST.
This should feel like you grabbed your phone mid-realization and started recording.
Under 60 seconds total. Cut everything that isn't essential.
End abruptly - don't wrap up neatly. Just... stop. Or loop back to the start.`,
    "live": `LIVE FORMAT: Write loose talking points, NOT a script. Include:
- Riff points where the creator should go off-script and be spontaneous
- Chat interaction moments ('chat, what do you think?', 'someone in chat said-')
- Tangent topics to fill dead time naturally
- Energy markers showing where to hype up vs calm down
- Leave 40% of the content to be improvised in the moment`,
  };

  const selectedPatterns = pickRandom(naturalPatterns, 5);
  const selectedTitlePatterns = pickRandom(HUMAN_TITLE_PATTERNS, 3);
  const selectedDescPatterns = pickRandom(HUMAN_DESCRIPTION_PATTERNS, 3);
  const selectedTagPatterns = pickRandom(HUMAN_TAG_PATTERNS, 2);

  return `
=== ABSOLUTE PRIORITY: HUMAN AUTHENTICITY ===
This content MUST pass as written by a real human creator. AI detection tools will flag anything that sounds polished, formulaic, or too well-structured.

BANNED PHRASES (instant AI detection flag - NEVER use ANY of these):
${FULL_BANNED_AI_PHRASES.slice(0, 25).join(", ")}
Also avoid: ${FULL_BANNED_AI_PHRASES.slice(25, 50).join(", ")}

WRITING DNA - How real humans write:
${selectedPatterns.map(p => `- ${p}`).join("\n")}

TITLE AUTHENTICITY:
${selectedTitlePatterns.map(p => `- ${p}`).join("\n")}
- The title should look like a real creator typed it in 5 seconds, not like a marketing team workshopped it

DESCRIPTION AUTHENTICITY:
${selectedDescPatterns.map(p => `- ${p}`).join("\n")}

TAG AUTHENTICITY:
${selectedTagPatterns.map(p => `- ${p}`).join("\n")}

${platformVoice[platform.toLowerCase()] || platformVoice.youtube}

${formatGuidance[format] || formatGuidance["long-form"]}

PERSONALITY INJECTION (pick 2-3 and weave throughout):
- A moment of genuine frustration or excitement about the topic
- A personal anecdote that's slightly off-topic but endearing
- An opinion that not everyone agrees with (hot take)
- Self-deprecating humor about your own gameplay/content/editing
- A callback to something 'chat' or 'the community' said
- Breaking the fourth wall ('I know this video is getting long but hear me out')
- Genuine uncertainty about something ('I honestly don't know if this is the best way')

SCRIPT TEXTURE (makes it sound human-recorded, not AI-read):
- Include [LAUGH], [SIGH], [EXCITED], [CONFUSED] cues for the creator
- Mark tone shifts: move between casual chatting, focused explaining, and hyped reactions
- Add breathing room - not every second needs to be filled with words
- Include moments where the script acknowledges the audience might disagree
- Reference time of day, current events, or recent games/updates naturally
- Mix up how you start sections - don't always use the same transition pattern`;
}

function humanizeGeneratedContent(content: any): any {
  if (!content || typeof content !== "object") return content;

  const scrubText = (text: string): string => {
    if (!text || typeof text !== "string") return text;
    let cleaned = text;
    for (const phrase of FULL_BANNED_AI_PHRASES) {
      const regex = new RegExp(phrase, "gi");
      cleaned = cleaned.replace(regex, "").replace(/\s{2,}/g, " ").trim();
    }
    cleaned = cleaned
      .replace(/\bIn conclusion,?\s*/gi, "")
      .replace(/\bFurthermore,?\s*/gi, "Also, ")
      .replace(/\bMoreover,?\s*/gi, "Plus, ")
      .replace(/\bAdditionally,?\s*/gi, "Oh and ")
      .replace(/\bHowever,?\s*/gi, "But ")
      .replace(/\bNevertheless,?\s*/gi, "Still, ")
      .replace(/\bConsequently,?\s*/gi, "So ")
      .replace(/\bSubsequently,?\s*/gi, "Then ")
      .replace(/\bIt is worth noting that\s*/gi, "")
      .replace(/\bIt should be noted that\s*/gi, "")
      .replace(/\bThis (comprehensive|ultimate|definitive) guide\s*/gi, "This ")
      .replace(/\b(Elevate|Unlock|Unleash|Harness|Leverage) your\b/gi, "Improve your")
      .replace(/\bseamless(ly)?\b/gi, "smooth$1")
      .replace(/\brobust\b/gi, "solid")
      .replace(/\bcutting-edge\b/gi, "new")
      .replace(/\bstate-of-the-art\b/gi, "latest")
      .replace(/\bgroundbreaking\b/gi, "cool")
      .replace(/\brevolutionize\b/gi, "change")
      .replace(/\bgame-changer\b/gi, "big deal")
      .replace(/\bparadigm\b/gi, "approach")
      .replace(/\bsynergy\b/gi, "combo")
      .replace(/\boptimize\b/gi, "improve")
      .replace(/\bstreamline\b/gi, "simplify")
      .replace(/\butilize\b/gi, "use")
      .replace(/\bleverage\b/gi, "use")
      .replace(/\bdelve\b/gi, "get into")
      .replace(/\bin order to\b/gi, "to")
      .replace(/\bprior to\b/gi, "before")
      .replace(/\bat this point in time\b/gi, "right now")
      .replace(/\bon a daily basis\b/gi, "every day")
      .replace(/\beach and every\b/gi, "every")
      .replace(/\bwith regards to\b/gi, "about")
      .replace(/\bin terms of\b/gi, "for")
      .replace(/\bin light of\b/gi, "because of");
    return cleaned.replace(/\s{2,}/g, " ").trim();
  };

  const injectTitleImperfections = (title: string): string => {
    if (!title || typeof title !== "string") return title;
    let t = scrubText(title);
    if (Math.random() < 0.3) {
      t = t.charAt(0).toLowerCase() + t.slice(1);
    }
    if (Math.random() < 0.2 && t.length > 20) {
      const words = t.split(" ");
      const idx = Math.floor(Math.random() * (words.length - 2)) + 1;
      if (words[idx] && words[idx].length > 4) {
        words[idx] = words[idx].toUpperCase();
      }
      t = words.join(" ");
    }
    if (Math.random() < 0.15 && t.endsWith("?")) {
      t = t.slice(0, -1) + "??";
    }
    t = t.replace(/: /g, Math.random() < 0.5 ? " - " : " | ");
    return t;
  };

  const injectDescriptionImperfections = (desc: string): string => {
    if (!desc || typeof desc !== "string") return desc;
    let d = scrubText(desc);
    if (Math.random() < 0.2) {
      const lines = d.split("\n");
      if (lines.length > 3) {
        const idx = Math.floor(Math.random() * (lines.length - 2)) + 1;
        lines.splice(idx, 0, "");
      }
      d = lines.join("\n");
    }
    if (Math.random() < 0.15 && d.length > 100) {
      const words = d.split(" ");
      const typoIdx = Math.floor(Math.random() * words.length);
      if (words[typoIdx] && words[typoIdx].length > 5) {
        const w = words[typoIdx];
        const charIdx = Math.floor(Math.random() * (w.length - 2)) + 1;
        words[typoIdx] = w.slice(0, charIdx) + w[charIdx + 1] + w[charIdx] + w.slice(charIdx + 2);
      }
      d = words.join(" ");
    }
    return d;
  };

  const injectTagImperfections = (tags: any[]): any[] => {
    if (!Array.isArray(tags)) return tags;
    const cleaned = tags.map((t: any) => typeof t === "string" ? scrubText(t) : t);
    if (cleaned.length > 5 && Math.random() < 0.3) {
      const idx = Math.floor(Math.random() * cleaned.length);
      const tag = cleaned[idx];
      if (typeof tag === "string" && tag.length > 6) {
        cleaned[idx] = tag.toLowerCase();
      }
    }
    if (Math.random() < 0.2) {
      const casualTags = ["bruh", "no way", "you won't believe this", "actual pain", "lets gooo", "viral moment", "this is wild"];
      cleaned.push(casualTags[Math.floor(Math.random() * casualTags.length)]);
    }
    return cleaned;
  };

  const result = JSON.parse(JSON.stringify(content));

  if (result.videoScript) {
    if (result.videoScript.title) result.videoScript.title = injectTitleImperfections(result.videoScript.title);
    if (result.videoScript.hook?.text) result.videoScript.hook.text = scrubText(result.videoScript.hook.text);
    if (result.videoScript.intro?.text) result.videoScript.intro.text = scrubText(result.videoScript.intro.text);
    if (result.videoScript.climax?.text) result.videoScript.climax.text = scrubText(result.videoScript.climax.text);
    if (result.videoScript.outro?.text) result.videoScript.outro.text = scrubText(result.videoScript.outro.text);
    if (Array.isArray(result.videoScript.sections)) {
      for (const section of result.videoScript.sections) {
        if (section.script) section.script = scrubText(section.script);
        if (section.engagementHook) section.engagementHook = scrubText(section.engagementHook);
      }
    }
  }

  if (result.seoPackage) {
    if (result.seoPackage.finalTitle) result.seoPackage.finalTitle = injectTitleImperfections(result.seoPackage.finalTitle);
    if (result.seoPackage.description) result.seoPackage.description = injectDescriptionImperfections(result.seoPackage.description);
    if (Array.isArray(result.seoPackage.tags)) result.seoPackage.tags = injectTagImperfections(result.seoPackage.tags);
  }

  if (result.voiceoverScript?.fullNarration) {
    result.voiceoverScript.fullNarration = scrubText(result.voiceoverScript.fullNarration);
  }

  if (result.distributionPlan?.platforms) {
    for (const plat of result.distributionPlan.platforms) {
      if (plat.caption) plat.caption = scrubText(plat.caption);
      if (plat.contentVersion) plat.contentVersion = scrubText(plat.contentVersion);
    }
  }

  if (result.thumbnailDesign?.textOverlay) {
    result.thumbnailDesign.textOverlay = scrubText(result.thumbnailDesign.textOverlay);
    if (Math.random() < 0.3) {
      result.thumbnailDesign.textOverlay = result.thumbnailDesign.textOverlay.toUpperCase();
    }
  }

  return result;
}

function humanRealisticDelay(): Promise<void> {
  const delayMs = Math.max(2000, Math.floor(Math.random() * 8000) + 3000);
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function generateHumanScheduleInfo(userId: string, platform: string): {
  scheduledTime: Date;
  humanDelay: string;
  peakHourTarget: boolean;
} {
  const scheduledTime = generateHumanScheduledTime({
    platform,
    userId,
    contentType: "new-video",
    urgency: "normal",
  });

  const now = new Date();
  const diffMs = scheduledTime.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 3600000);
  const humanDelay = diffHours < 1 ? `${Math.round(diffMs / 60000)} minutes` : `${diffHours} hours`;

  const hour = scheduledTime.getHours();
  const peakHourTarget = hour >= 10 && hour <= 20;

  return { scheduledTime, humanDelay, peakHourTarget };
}

export async function createVideoFromIdea(userId: string, contentIdea: {
  title: string;
  description?: string;
  pillar?: string;
  format?: string;
  platform?: string;
}) {
  const blueprint = await getEmpireBlueprint(userId);
  const brandContext = blueprint ? `
Brand Personality: ${blueprint.brandIdentity?.personality || "Energetic and helpful"}
Content Tone: ${blueprint.brandIdentity?.contentTone || "Casual yet authoritative"}
Niche: ${JSON.stringify(blueprint.niche?.primary || "general")}
Thumbnail Style: ${JSON.stringify(blueprint.thumbnailStyle?.overallApproach || "Bold and eye-catching")}` : "";

  let creatorStyleContext = "";
  try {
    creatorStyleContext = await getCreatorStyleContext(userId);
  } catch { /* no style profile yet - that's fine for new creators */ }

  let humanizationPrompt = "";
  try {
    humanizationPrompt = await buildHumanizationPrompt(userId);
  } catch { /* no humanization data yet */ }

  const videosCreated = await getCreatorVideosCreated(userId);
  const creatorMaturityContext = getCreatorMaturityPrompt(videosCreated);
  const skillInfo = getSkillLevelFromVideosCreated(videosCreated);

  let youtubeLearnContext = "";
  try {
    youtubeLearnContext = await getYouTubeLearningContext(userId);
  } catch { /* no research yet */ }

  let learnedKeywordContext = "";
  try {
    learnedKeywordContext = await getKeywordContext(userId);
  } catch { /* no keyword data yet */ }

  sendSSEEvent(userId, "video-creation-progress", { step: "script", status: "started", message: `Writing video script (Creator Skill: ${skillInfo.label}, Video #${videosCreated + 1})...` });

  const humanBehaviorContext = generateHumanWritingContext(contentIdea.platform || "YouTube", contentIdea.format || "long-form");

  const scriptPrompt = `You are NOT an AI assistant. You ARE a content creator sitting in front of your mic, planning your next video. Write like you're brainstorming in your notes app at 2am because you can't sleep and this idea is too good.

IMPORTANT: Everything you write will be checked by AI detection software. If ANY part reads like AI wrote it, the entire package gets rejected. Write messily, authentically, and with genuine human energy.

${creatorMaturityContext}

${youtubeLearnContext ? `\nYOUTUBE INTELLIGENCE (use to inform quality at the creator's current skill level):\n${youtubeLearnContext}` : ""}
${learnedKeywordContext}

CRITICAL SKILL-BASED QUALITY RULE:
The creator's skill level is ${skillInfo.level}/100 (${skillInfo.label}). Quality multiplier: ${skillInfo.qualityMultiplier}.
- At low skill levels, content should have REALISTIC imperfections matching a real beginner
- The quality of hooks, titles, scripts, thumbnails, and SEO should all reflect this skill level
- Do NOT produce polished, professional content for a beginner - that's unrealistic and will trigger suspicion
- Each video should show SLIGHT improvement over the last, never huge jumps
- Think about what video #${videosCreated + 1} from a real creator looks like

VIDEO CONCEPT:
Title: "${contentIdea.title}"
Description: ${contentIdea.description || "Not provided"}
Format: ${contentIdea.format || "long-form"}
Target Platform: ${contentIdea.platform || "YouTube"}
${brandContext}
${creatorStyleContext ? `\nCREATOR'S ESTABLISHED VOICE (match this exactly):\n${creatorStyleContext}` : ""}
${humanizationPrompt ? `\nHUMANIZATION LAYER:\n${humanizationPrompt}` : ""}

HUMAN AUTHENTICITY REQUIREMENTS:
${humanBehaviorContext}

ADDITIONAL ANTI-AI DETECTION RULES FOR EVERY SECTION:
- Scripts must include at least 3 moments of genuine human messiness: self-corrections, tangents, or unfinished thoughts
- Titles should look like a real person typed them fast, not like a copywriter crafted them
- Descriptions should have inconsistent formatting like a real creator who copy-pastes their template
- Tags should mix professional SEO tags with casual search terms real people type
- Voiceover script must include [LAUGH], [SIGH], [PAUSE], [UM], [LIKE], and energy shift markers
- Every section transition should feel different - don't use the same pattern twice
- Include at least one moment where the script breaks the fourth wall or addresses the audience directly in a non-formulaic way
- The thumbnail text should be something a real person would shout, not a marketing slogan

Create a comprehensive video production package. Respond with JSON:
{
  "videoScript": {
    "title": "Final optimized title",
    "totalDuration": "Estimated video length in minutes",
    "hook": {
      "text": "The exact first 5-10 seconds the creator should say (word for word)",
      "visualDirection": "What viewers should see during the hook",
      "musicCue": "Background music style/mood for the hook",
      "onScreenText": "Any text overlays during hook"
    },
    "intro": {
      "text": "Full intro script (15-30 seconds, word for word)",
      "visualDirection": "Camera angles, graphics, transitions",
      "subscribeCTA": "Natural subscribe reminder woven into intro"
    },
    "sections": [
      {
        "sectionNumber": 1,
        "sectionTitle": "Section heading for editor reference",
        "duration": "Estimated length of this section",
        "script": "Full word-for-word script for this section (200+ words per section)",
        "visualNotes": "B-roll suggestions, screen recordings, graphics, animations",
        "transitions": "How to transition into and out of this section",
        "engagementHook": "Mid-section hook to keep viewers watching",
        "editingNotes": "Specific editing instructions (zoom ins, cuts, effects)"
      }
    ],
    "climax": {
      "text": "The most exciting/valuable part of the video (word for word)",
      "visualDirection": "Make this visually impactful",
      "musicShift": "Music change for emotional impact"
    },
    "outro": {
      "text": "Closing script with CTA (word for word)",
      "endScreenSetup": "What to show on end screen",
      "nextVideoTease": "Tease for next video to drive series watching"
    }
  },
  "productionGuide": {
    "recordingSetup": {
      "cameraSettings": "Resolution, frame rate, lighting tips",
      "audioSetup": "Mic placement, background noise tips",
      "screenRecording": "Software and settings for game capture",
      "facecamPosition": "Where to place facecam if using one"
    },
    "editingTimeline": [
      {
        "timestamp": "0:00",
        "action": "Specific editing action",
        "effect": "Effect to apply",
        "duration": "How long this lasts",
        "notes": "Additional editing notes"
      }
    ],
    "bRollList": [
      {
        "description": "What B-roll footage is needed",
        "source": "Where to get it (record, stock, game footage)",
        "timestamp": "When to insert it in the video",
        "duration": "How long the B-roll clip should be"
      }
    ],
    "musicAndSFX": {
      "backgroundMusic": [
        {
          "section": "Which section",
          "mood": "Music mood/genre",
          "source": "Suggested royalty-free source",
          "volume": "Volume level relative to voice"
        }
      ],
      "soundEffects": [
        {
          "timestamp": "When to add",
          "effect": "What sound effect",
          "purpose": "Why this sound effect"
        }
      ]
    },
    "graphicsNeeded": [
      {
        "type": "Lower third / title card / overlay / animation",
        "content": "What text or visual",
        "timestamp": "When it appears",
        "style": "Design direction",
        "duration": "How long on screen"
      }
    ]
  },
  "thumbnailDesign": {
    "concept": "Detailed thumbnail description",
    "mainImage": "What the main visual should be",
    "textOverlay": "Exact text to put on thumbnail (3-5 words max)",
    "colorScheme": ["Primary color", "Secondary color", "Accent color"],
    "emotionalTrigger": "What emotion this thumbnail triggers",
    "composition": "Layout description (rule of thirds, etc.)",
    "faceExpression": "If using face, what expression"
  },
  "seoPackage": {
    "finalTitle": "SEO-optimized title under 60 chars",
    "description": "Full YouTube description with actual chapter timestamps based on the script sections (e.g., 0:00 Introduction, 1:30 Section Name, etc.), cross-platform links, and SEO keywords naturally included (500+ words). Write out the real chapter names and times - never use placeholders like [Add timestamps here] or [Chapters]",
    "tags": ["20 SEO-optimized tags"],
    "hashtags": ["5 hashtags for shorts/social"],
    "category": "YouTube category",
    "language": "Content language"
  },
  "distributionPlan": {
    "platforms": [
      {
        "platform": "YouTube/TikTok/X/Discord/Twitch/Kick",
        "contentVersion": "How to adapt this video for this platform",
        "caption": "Platform-specific caption/description",
        "postingTime": "Optimal time to post",
        "hashtags": ["Platform-specific hashtags"],
        "crossPromotion": "How to cross-promote from this platform"
      }
    ],
    "shortsVersion": {
      "clipTimestamps": [
        {
          "start": "Start time of clip",
          "end": "End time of clip",
          "hook": "Short-form hook for this clip",
          "caption": "TikTok/Shorts caption"
        }
      ]
    }
  },
  "voiceoverScript": {
    "fullNarration": "Complete word-for-word voiceover script from start to finish, including pauses marked as [PAUSE], emphasis marked as [EMPHASIS], and tone shifts marked as [TONE: excited/calm/serious]",
    "wordCount": 0,
    "estimatedReadTime": "X minutes at natural pace",
    "toneNotes": "Overall tone guidance for recording"
  }
}

Make EVERY section extremely detailed and specific. The creator should be able to hand this to any editor and get a professional video back. The script must sound like a real person talking, NOT like an AI template. Include at least 4-6 main sections.

FINAL CHECK: Before outputting, re-read every script section. If any sentence sounds like something ChatGPT would write, rewrite it to sound like a tired creator recording at midnight after their 4th energy drink.`;

  const rawVideoPackage = await aiGenerate(scriptPrompt);

  sendSSEEvent(userId, "video-creation-progress", { step: "humanize", status: "started", message: "Running anti-AI detection scrubber and humanization layer..." });
  const videoPackage = humanizeGeneratedContent(rawVideoPackage);
  sendSSEEvent(userId, "video-creation-progress", { step: "humanize", status: "completed", message: "Content humanized - passed stealth authenticity checks" });

  sendSSEEvent(userId, "video-creation-progress", { step: "script", status: "completed", message: "Human-authentic video script and production guide ready!" });

  const videoKey = `video-creation-${Date.now()}`;
  const newVideoCount = videosCreated + 1;
  const updatedSkill = getSkillLevelFromVideosCreated(newVideoCount);

  await db.transaction(async (tx) => {
    await tx.insert(aiResults).values({
      userId,
      featureKey: videoKey,
      result: {
        ...videoPackage,
        _humanized: true,
        _stealthVersion: 2,
        _skillProgression: {
          videoNumber: newVideoCount,
          skillLevel: skillInfo.level,
          skillLabel: skillInfo.label,
          qualityMultiplier: skillInfo.qualityMultiplier,
          nextSkillLevel: updatedSkill.level,
          nextSkillLabel: updatedSkill.label,
        },
        _antiAiDetection: {
          bannedPhrasesScanned: FULL_BANNED_AI_PHRASES.length,
          postProcessed: true,
          titleImperfections: true,
          descriptionImperfections: true,
          tagImperfections: true,
          creatorIntelligenceUsed: !!creatorStyleContext,
          humanizationLayerUsed: !!humanizationPrompt,
        },
        sourceIdea: contentIdea,
        createdAt: new Date().toISOString(),
      },
    });

    const [existing] = await tx.select().from(creatorSkillProgress)
      .where(eq(creatorSkillProgress.userId, userId)).limit(1);

    if (existing) {
      await tx.update(creatorSkillProgress).set({
        videosCreated: newVideoCount,
        skillLevel: updatedSkill.level,
        skillLabel: updatedSkill.label,
        qualityMultiplier: updatedSkill.qualityMultiplier,
        lastVideoAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(creatorSkillProgress.id, existing.id));
    } else {
      await tx.insert(creatorSkillProgress).values({
        userId,
        videosCreated: newVideoCount,
        skillLevel: updatedSkill.level,
        skillLabel: updatedSkill.label,
        qualityMultiplier: updatedSkill.qualityMultiplier,
        lastVideoAt: new Date(),
      });
    }
  });

  return { videoKey, ...videoPackage };
}

export async function createVideoAndSpawnPipeline(userId: string, contentIdea: {
  title: string;
  description?: string;
  pillar?: string;
  format?: string;
  platform?: string;
}) {
  const platform = contentIdea.platform?.toLowerCase() || "youtube";

  sendSSEEvent(userId, "empire-auto-pipeline", { step: "human-timing", status: "started", message: `Calculating human-realistic schedule for "${contentIdea.title}"...` });

  const scheduleInfo = generateHumanScheduleInfo(userId, platform);
  const activityWindow = getActivityWindow();

  sendSSEEvent(userId, "empire-auto-pipeline", { step: "human-timing", status: "completed", message: `Scheduled for ${scheduleInfo.scheduledTime.toLocaleString()} (${scheduleInfo.peakHourTarget ? "peak hours" : "off-peak"}, ${scheduleInfo.humanDelay} from now)` });

  sendSSEEvent(userId, "empire-auto-pipeline", { step: "video-creation", status: "started", message: `Writing human-authentic script for "${contentIdea.title}" (anti-AI detection active, ${FULL_BANNED_AI_PHRASES.length} phrases blocked)...` });

  const videoPackage = await createVideoFromIdea(userId, contentIdea);

  sendSSEEvent(userId, "empire-auto-pipeline", { step: "vod-spawn", status: "started", message: "Spawning VOD pipeline with human-realistic timing..." });

  const rawDuration = videoPackage.videoScript?.totalDuration || "10";
  const parsedMinutes = parseFloat(String(rawDuration).replace(/[^0-9.]/g, "")) || 10;
  const estimatedDuration = Math.round(Math.max(1, Math.min(180, parsedMinutes)) * 60);
  const finalTitle = videoPackage.seoPackage?.finalTitle || videoPackage.videoScript?.title || contentIdea.title;

  const crossPlatformSchedule = generateStaggeredSchedule(
    ["youtube", "tiktok", "discord"].filter(p => p !== platform),
    "new-video",
    userId,
  );

  const distributionSchedule: Record<string, string> = {};
  crossPlatformSchedule.forEach((time, plat) => {
    distributionSchedule[plat] = time.toISOString();
  });

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find(c => c.platform === "youtube" && c.accessToken && c.channelId);

  let videoRecord: any = null;
  if (ytChannel) {
    let seoDesc = videoPackage.seoPackage?.description || videoPackage.videoScript?.sections?.[0]?.script?.slice(0, 500) || contentIdea.description || "";
    let seoTags = videoPackage.seoPackage?.tags || [];

    try {
      const kwResult = await autoApplyKeywordsToNewVideo(userId, finalTitle, seoTags, seoDesc);
      seoTags = kwResult.optimizedTags;
      seoDesc = kwResult.optimizedDescription;
    } catch { /* keyword optimization is optional */ }

    videoRecord = await storage.createVideo({
      channelId: ytChannel.id,
      title: finalTitle,
      description: seoDesc,
      thumbnailUrl: null,
      type: contentIdea.format === "short" ? "short" : "long",
      status: "queued",
      platform: "youtube",
      metadata: {
        empireGenerated: true,
        videoPackageKey: videoPackage.videoKey,
        tags: seoTags,
        aiOptimized: true,
        aiOptimizedAt: new Date().toISOString(),
        scheduledPublishTime: scheduleInfo.scheduledTime.toISOString(),
        crossPlatformSchedule: distributionSchedule,
        seoPackage: videoPackage.seoPackage,
        contentIdea,
      } as any,
    });

    sendSSEEvent(userId, "empire-auto-pipeline", { step: "video-record", status: "completed", message: `Video record created (ID: ${videoRecord.id}) — queued for YouTube upload` });
  }

  const [pipeline] = await db.insert(streamPipelines).values({
    userId,
    pipelineType: "vod",
    currentStep: "ingest",
    status: "queued",
    completedSteps: [],
    stepResults: {
      _empireSource: true,
      _videoPackage: videoPackage.videoKey,
      _contentIdea: contentIdea,
      _videoDbId: videoRecord?.id || null,
      _humanBehavior: {
        scheduledPublishTime: scheduleInfo.scheduledTime.toISOString(),
        peakHourTarget: scheduleInfo.peakHourTarget,
        activityWindow: activityWindow,
        crossPlatformSchedule: distributionSchedule,
        humanDelayApplied: true,
      },
    },
    vodCutIds: [],
    sourceTitle: finalTitle,
    sourceDuration: estimatedDuration,
    mode: "vod",
    autoProcess: true,
    publishedContentType: "empire_generated",
    startedAt: new Date(),
  }).returning();

  if (videoRecord && ytChannel) {
    try {
      const { queueVideoUpload } = await import("./services/push-scheduler");
      queueVideoUpload(userId, videoRecord.id, "normal", {
        scheduledPublishTime: scheduleInfo.scheduledTime.toISOString(),
        privacyStatus: "public",
      });
      sendSSEEvent(userId, "empire-auto-pipeline", { step: "upload-queued", status: "completed", message: `Video "${finalTitle}" queued for YouTube upload with human-realistic timing` });
    } catch (err: any) {
      console.error(`[Empire] Failed to queue video upload:`, err.message);
    }
  }

  if (videoRecord) {
    try {
      const { processNewVideoUpload } = await import("./autopilot-engine");
      await processNewVideoUpload(userId, videoRecord.id);
    } catch (err: any) {
      console.error(`[Empire] Autopilot distribution trigger failed:`, err.message);
    }
  }

  const distributionPlatforms = Object.keys(distributionSchedule);
  sendSSEEvent(userId, "empire-auto-pipeline", { step: "vod-spawn", status: "completed", message: `VOD pipeline #${pipeline.id} spawned for "${finalTitle}" with human-realistic scheduling across ${distributionPlatforms.length + 1} platforms!` });

  return {
    videoPackage,
    videoDbId: videoRecord?.id || null,
    pipeline: {
      id: pipeline.id,
      title: finalTitle,
      status: pipeline.status,
      pipelineType: "vod",
      totalSteps: 56,
      scheduledPublishTime: scheduleInfo.scheduledTime.toISOString(),
      humanDelay: scheduleInfo.humanDelay,
      peakHourTarget: scheduleInfo.peakHourTarget,
      crossPlatformSchedule: distributionSchedule,
    },
  };
}

export async function autoLaunchEmpireContent(userId: string, count: number = 3) {
  const blueprint = await getEmpireBlueprint(userId);
  if (!blueprint) {
    throw new Error("No empire blueprint found. Build your empire first.");
  }

  sendSSEEvent(userId, "empire-auto-launch", { step: "generating", status: "started", message: `Generating ${count} human-authentic video packages from your empire blueprint...` });

  sendSSEEvent(userId, "empire-auto-launch", { step: "human-behavior", status: "started", message: "Activating Human Behavior Engine for realistic creation patterns..." });

  const activityWindow = getActivityWindow();
  if (!activityWindow.isActive) {
    sendSSEEvent(userId, "empire-auto-launch", { step: "human-behavior", status: "in_progress", message: `Outside waking hours (${activityWindow.start}:00-${activityWindow.end}:00). Queuing for next active window for stealth.` });
  }

  const contentIdeas: Array<{ title: string; description: string; pillar: string; format: string; platform: string }> = [];

  const plan = blueprint.first30DaysPlan || [];
  for (const day of plan) {
    if (contentIdeas.length >= count) break;
    const content = day.contentToPost;
    if (content && content.title && content.title !== "N/A" && content.type !== "post") {
      contentIdeas.push({
        title: content.title,
        description: content.description || `Content from Day ${day.day}: ${day.theme}`,
        pillar: day.theme || "General",
        format: content.type === "stream" ? "live" : content.type === "short" ? "short" : "long-form",
        platform: content.platform || "YouTube",
      });
    }
  }

  if (contentIdeas.length < count) {
    const pillars = blueprint.contentPillars || [];
    for (const pillar of pillars) {
      if (contentIdeas.length >= count) break;
      const titles = pillar.exampleTitles || [];
      for (const title of titles) {
        if (contentIdeas.length >= count) break;
        if (!contentIdeas.some((ci: any) => ci.title === title)) {
          contentIdeas.push({
            title,
            description: pillar.description || "",
            pillar: pillar.name || "General",
            format: pillar.format?.includes("short") ? "short" : pillar.format?.includes("stream") ? "live" : "long-form",
            platform: "YouTube",
          });
        }
      }
    }
  }

  if (contentIdeas.length === 0) {
    const ideas = await generateContentIdeasFromEmpire(userId, count);
    for (const idea of ideas.slice(0, count)) {
      contentIdeas.push({
        title: idea.title,
        description: idea.description || "",
        pillar: idea.pillar || "General",
        format: idea.format || "long-form",
        platform: idea.platform || "YouTube",
      });
    }
  }

  sendSSEEvent(userId, "empire-auto-launch", { step: "human-behavior", status: "completed", message: `Human Behavior Engine active: ${contentIdeas.length} videos queued with gaussian timing, peak-hour targeting, and micro-delays` });

  const results = [];
  for (let i = 0; i < contentIdeas.length; i++) {
    const idea = contentIdeas[i];

    if (i > 0) {
      const typingDelay = Math.max(0, simulateTypingDelay(idea.title.length + (idea.description?.length || 0)));
      const microDelay = Math.max(0, addHumanMicroDelay());
      const totalDelay = Math.max(3000, Math.min(typingDelay + microDelay, 15000));
      sendSSEEvent(userId, "empire-auto-launch", { step: "human-delay", status: "in_progress", message: `Simulating human creation pause before video ${i + 1} (${Math.round(totalDelay / 1000)}s delay)...` });
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }

    const scheduledTime = generateHumanScheduledTime({
      platform: idea.platform.toLowerCase(),
      userId,
      contentType: "new-video",
      urgency: i === 0 ? "normal" : "low",
    });

    sendSSEEvent(userId, "empire-auto-launch", { step: "creating", status: "in_progress", message: `Creating video ${i + 1}/${contentIdeas.length}: "${idea.title}" (publish: ${scheduledTime.toLocaleString()})...`, progress: Math.round(((i) / contentIdeas.length) * 100) });

    try {
      const result = await createVideoAndSpawnPipeline(userId, idea);
      results.push({ success: true, ...result });
    } catch (err: any) {
      console.error(`[Empire] Failed to create video for "${idea.title}":`, err.message);
      results.push({ success: false, title: idea.title, error: err.message });
    }
  }

  const successResults = results.filter(r => r.success);
  sendSSEEvent(userId, "empire-auto-launch", { step: "complete", status: "completed", message: `Launched ${successResults.length}/${contentIdeas.length} videos with human-realistic scheduling into VOD pipelines!` });

  await db.insert(aiResults).values({
    userId,
    featureKey: "empire-auto-launch",
    result: {
      launchedAt: new Date().toISOString(),
      totalRequested: count,
      totalLaunched: successResults.length,
      humanBehaviorEnabled: true,
      activityWindow,
      results: results.map(r => ({
        success: r.success,
        title: r.success ? (r as any).pipeline?.title : r.title,
        pipelineId: r.success ? (r as any).pipeline?.id : null,
        scheduledPublishTime: r.success ? (r as any).pipeline?.scheduledPublishTime : null,
        humanDelay: r.success ? (r as any).pipeline?.humanDelay : null,
        peakHourTarget: r.success ? (r as any).pipeline?.peakHourTarget : null,
        crossPlatformSchedule: r.success ? (r as any).pipeline?.crossPlatformSchedule : null,
        error: r.success ? null : r.error,
      })),
    },
  });

  return {
    totalLaunched: successResults.length,
    totalFailed: results.filter(r => !r.success).length,
    humanBehaviorEnabled: true,
    results,
  };
}

export async function getVideoCreations(userId: string) {
  const results = await db
    .select()
    .from(aiResults)
    .where(and(
      eq(aiResults.userId, userId),
      sql`${aiResults.featureKey} LIKE 'video-creation-%'`
    ))
    .orderBy(desc(aiResults.createdAt))
    .limit(20);

  return results.map(r => ({
    id: r.id,
    featureKey: r.featureKey,
    createdAt: r.createdAt,
    title: (r.result as any)?.videoScript?.title || (r.result as any)?.sourceIdea?.title || "Untitled",
    format: (r.result as any)?.sourceIdea?.format || "long-form",
    platform: (r.result as any)?.sourceIdea?.platform || "YouTube",
  }));
}

export async function getVideoCreation(userId: string, videoKey: string) {
  const [result] = await db
    .select()
    .from(aiResults)
    .where(and(
      eq(aiResults.userId, userId),
      eq(aiResults.featureKey, videoKey)
    ))
    .limit(1);

  if (!result) return null;
  return result.result;
}
