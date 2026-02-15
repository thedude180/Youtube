import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { users, aiResults } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

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

export async function buildEmpireFromIdea(userId: string, idea: string) {
  sendSSEEvent(userId, "empire-progress", { step: "niche", status: "started", message: "Analyzing your idea and refining your niche..." });

  const nicheAndBrandPrompt = `You are an elite content strategy consultant who has helped hundreds of creators build million-subscriber channels from scratch. A complete beginner has come to you with this idea: "${idea}"

Your job is to turn this raw idea into a refined, profitable content niche with a full brand identity.

Respond with JSON containing these exact fields:
{
  "niche": {
    "primary": "The main refined niche (e.g., 'Competitive FPS Gaming' instead of just 'gaming')",
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
      "role": "Role of this platform",
      "contentTypes": ["What to post here"],
      "postingFrequency": "How often",
      "growthTactic": "Specific growth strategy",
      "whenToStart": "When to add this platform"
    },
    "kick": {
      "priority": 3,
      "role": "Role of this platform",
      "contentTypes": ["What to post here"],
      "postingFrequency": "How often",
      "growthTactic": "Specific growth strategy",
      "whenToStart": "When to add this platform"
    },
    "tiktok": {
      "priority": 4,
      "role": "Role of this platform",
      "contentTypes": ["What to post here"],
      "postingFrequency": "How often",
      "growthTactic": "Specific growth strategy",
      "whenToStart": "When to add this platform"
    },
    "x": {
      "priority": 5,
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

  if (existing.length > 0) {
    await db
      .update(aiResults)
      .set({ result: blueprintData, createdAt: new Date() })
      .where(eq(aiResults.id, existing[0].id));
  } else {
    await db.insert(aiResults).values({
      userId,
      featureKey: "empire-blueprint",
      result: blueprintData,
    });
  }

  const nicheLabel = nicheAndBrand.niche?.primary || idea;
  await db
    .update(users)
    .set({ contentNiche: nicheLabel })
    .where(eq(users.id, userId));

  sendSSEEvent(userId, "empire-progress", { step: "complete", status: "completed", message: "Your content empire blueprint is ready!" });

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
      "description": "Full YouTube-style description (100+ words) with timestamps, links placeholder, and SEO keywords naturally included",
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
          "platform": "tiktok/x/discord",
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
