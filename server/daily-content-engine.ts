import { db } from "./db";
import { videos, streams, autopilotQueue, channels, notifications, audienceActivityPatterns } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNotNull, ne, inArray } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { getUserTimezone, getTimezoneOffsetHours } from "./human-behavior-engine";
import { sendSSEEvent } from "./routes/events";
import { shouldRunDailyContent } from "./priority-orchestrator";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { detectGamingContext, buildGamingPromptSection, detectContentContext, buildContentPromptSection, getNicheLabel, ContentContext } from "./ai-engine";
import { getActiveTrendOverride, getCooldownTrendOverrides, selectStreamByTrend, onStreamDetected } from "./trend-rider-engine";

const logger = createLogger("stream-exhaust");
const openai = getOpenAIClient();

function isVideoPostable(video: any): boolean {
  const meta = (video.metadata as any) || {};
  const privacy = meta.privacyStatus || "";

  if (privacy === "unlisted") {
    logger.info("Skipping unlisted video for content extraction", { videoId: video.id, title: video.title });
    return false;
  }

  if (privacy === "public") return true;

  if (privacy === "private") {
    logger.info("Skipping private video for content extraction", { videoId: video.id, title: video.title });
    return false;
  }

  return true;
}

const LONG_FORM_MAX_MINUTES = 60;
const SHORTS_PER_BATCH = 3;
const LONG_FORM_PER_BATCH = 1;
const MINUTES_PER_BATCH = 75; // 60 min long-form + ~15 min headroom for 3 shorts
const CORE_YOUTUBE_PER_DAY = LONG_FORM_PER_BATCH + SHORTS_PER_BATCH; // 4 (1 long-form + 3 shorts per batch)
const MIN_DAY_OFFSET = 0; // start from today — first batch fires ASAP, subsequent batches fill sequential future days
const VIDEO_PLATFORMS = ["tiktok"];
const TEXT_PLATFORMS = ["discord"];
const CROSS_PLATFORMS = [...VIDEO_PLATFORMS, ...TEXT_PLATFORMS];
// Hard wall-clock safety valve per engine invocation.
// Each batch awaits a real OpenAI API call (~5-15 s), so the event loop is
// freed between batches — no starvation occurs.  The 10-minute cap only
// protects against runaway scenarios (e.g. 50+ unprocessed streams).
// Stream progress is persisted after every batch, so the next cron cycle
// resumes exactly where this one left off — no content is ever skipped.
const ENGINE_RUN_BUDGET_MS = 600_000; // 10 minutes


async function getNextAvailableDayOffset(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduledDays = await db
    .select({ scheduledDate: sql<string>`DATE(${autopilotQueue.scheduledAt})` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      eq(autopilotQueue.targetPlatform, "youtube"),
      eq(autopilotQueue.type, "auto-clip" as any),
      gte(autopilotQueue.scheduledAt, today),
    ))
    .groupBy(sql`DATE(${autopilotQueue.scheduledAt})`)
    .having(sql`count(*) >= ${CORE_YOUTUBE_PER_DAY}`);

  // AUDIT FIX: Normalize scheduledDate to YYYY-MM-DD string regardless of whether Drizzle returns Date or string
  const filledDays = new Set(
    scheduledDays.map(r => {
      const raw = r.scheduledDate;
      if (!raw) return null;
      return (raw instanceof Date ? raw : new Date(String(raw))).toISOString().split("T")[0];
    }).filter(Boolean)
  );

  for (let offset = MIN_DAY_OFFSET; offset < 365; offset++) {
    const checkDate = new Date(today.getTime() + offset * 86400000);
    const dateStr = checkDate.toISOString().split("T")[0];
    if (!filledDays.has(dateStr)) return offset;
  }

  return Math.max(MIN_DAY_OFFSET, filledDays.size);
}

/**
 * Returns the optimal scheduled time for a piece of content on `today + dayOffset` days.
 *
 * Priority order:
 *  1. Real audience activity data (audienceActivityPatterns) — uses the top-performing
 *     hours learned from actual viewer behaviour on YouTube.
 *  2. Creator's home timezone + platform peak hours — if no audience data has been
 *     collected yet, schedules during known-good YouTube windows but expressed in the
 *     creator's local timezone (taken from their notification preferences).
 *  3. UTC fallback — if timezone lookup fails entirely, schedules in UTC.
 */
async function getScheduledTimeForDay(dayOffset: number, userId: string): Promise<Date> {
  // dayOffset=0 (today): schedule for RIGHT NOW with a small jitter (2-8 min) so the
  // 1-minute publish cron picks it up almost immediately.
  if (dayOffset === 0) {
    const asapMs = Date.now() + (2 + Math.random() * 6) * 60_000; // 2–8 minutes from now
    const t = new Date(asapMs);
    logger.info("Scheduled time determined (ASAP)", { userId, dayOffset, scheduledAt: t.toISOString() });
    return t;
  }

  const PLATFORM = "youtube";
  const YOUTUBE_PEAK_HOURS = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
  const MIN_DATA_POINTS = 3;

  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  const targetDate = new Date(baseDate.getTime() + dayOffset * 86400000);

  let targetLocalHour: number;
  let sourceLabel: string;

  try {
    const patterns = await db
      .select({
        hourOfDay: audienceActivityPatterns.hourOfDay,
        activityLevel: audienceActivityPatterns.activityLevel,
      })
      .from(audienceActivityPatterns)
      .where(
        and(
          eq(audienceActivityPatterns.userId, userId),
          eq(audienceActivityPatterns.platform, PLATFORM),
        ),
      )
      .orderBy(desc(audienceActivityPatterns.activityLevel))
      .limit(10);

    if (patterns.length >= MIN_DATA_POINTS) {
      const topSlots = patterns.slice(0, 5);
      const picked = topSlots[Math.floor(Math.random() * topSlots.length)];
      targetLocalHour = picked.hourOfDay;
      sourceLabel = "audience-data";
    } else {
      targetLocalHour = YOUTUBE_PEAK_HOURS[Math.floor(Math.random() * YOUTUBE_PEAK_HOURS.length)];
      sourceLabel = "platform-peak";
    }
  } catch {
    targetLocalHour = YOUTUBE_PEAK_HOURS[Math.floor(Math.random() * YOUTUBE_PEAK_HOURS.length)];
    sourceLabel = "fallback";
  }

  const timezone = await getUserTimezone(userId);
  const offsetHours = getTimezoneOffsetHours(timezone, targetDate);
  const targetUtcHour = ((targetLocalHour - offsetHours) % 24 + 24) % 24;
  const targetMinute = Math.floor(Math.random() * 60);

  targetDate.setUTCHours(Math.round(targetUtcHour), targetMinute, Math.floor(Math.random() * 60), 0);

  // If the target time has already passed (or is within 90 min), push to next day.
  // This guard only applies to future-day batches (dayOffset>=1) — dayOffset=0 handled above.
  if (targetDate.getTime() <= Date.now() + 90 * 60000) {
    targetDate.setTime(targetDate.getTime() + 86400000);
  }

  logger.info("Scheduled time determined", { userId, dayOffset, targetLocalHour, timezone, sourceLabel, scheduledAt: targetDate.toISOString() });

  return targetDate;
}

interface ContentPlan {
  longForm: {
    title: string;
    description: string;
    segments: Array<{ startMinute: number; endMinute: number; hook: string }>;
    totalDurationEstimate: string;
    tags: string[];
    thumbnailConcept: string;
    retentionBrief?: {
      hookStrategy?: string;
      reHookAt30s?: string;
      curiosityLoops?: string[];
      endScreenCTA?: string;
    };
    titleVariants?: string[];
  };
  shorts: Array<{
    title: string;
    description: string;
    startMinute: number;
    endMinute: number;
    hook: string;
    hashtags: string[];
    targetDuration: string;
    tiktokCaption?: string;
  }>;
}

async function notify(userId: string, title: string, message: string, severity: string) {
  if (severity === "info") return;
  await db.insert(notifications).values({ userId, type: "autopilot", title, message, severity });
  sendSSEEvent(userId, "notification", { type: "new" });
}

async function getUserIdsWithYouTube(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"));
  return rows.map(r => r.userId).filter((id): id is string => !!id);
}

interface ConnectedPlatforms {
  all: string[];
  video: string[];
  text: string[];
}

async function getUserConnectedPlatforms(userId: string): Promise<ConnectedPlatforms> {
  const userChannels = await db
    .select({ platform: channels.platform, accessToken: channels.accessToken })
    .from(channels)
    .where(eq(channels.userId, userId));
  const connected = userChannels
    .filter(c => c.accessToken && CROSS_PLATFORMS.includes(c.platform))
    .map(c => c.platform);
  return {
    all: connected,
    video: connected.filter(p => VIDEO_PLATFORMS.includes(p)),
    text: connected.filter(p => TEXT_PLATFORMS.includes(p)),
  };
}

interface StreamWithRemaining {
  stream: typeof streams.$inferSelect;
  totalMinutes: number;
  extractedMinutes: number;
  remainingMinutes: number;
  nextSegmentStart: number;
}

async function getStreamsWithRemainingContent(userId: string): Promise<StreamWithRemaining[]> {
  const endedStreams = await db.select().from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      isNotNull(streams.startedAt),
      eq(streams.contentFullyExhausted, false),
    ))
    .orderBy(desc(streams.startedAt))
    .limit(100);

  const results: StreamWithRemaining[] = [];
  for (const stream of endedStreams) {
    if (!stream.startedAt || !stream.endedAt) continue;
    const totalMinutes = Math.floor(
      (new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000
    );
    if (totalMinutes < 5) continue;

    const extractedMinutes = stream.contentMinutesExtracted || 0;
    const remainingMinutes = totalMinutes - extractedMinutes;
    if (remainingMinutes < 1) {
      await db.update(streams)
        .set({ contentFullyExhausted: true })
        .where(eq(streams.id, stream.id));
      continue;
    }

    results.push({
      stream,
      totalMinutes,
      extractedMinutes,
      remainingMinutes,
      nextSegmentStart: extractedMinutes,
    });
  }

  return results;
}

async function getCurrentLiveStream(userId: string): Promise<typeof streams.$inferSelect | null> {
  const [live] = await db.select().from(streams)
    .where(and(eq(streams.userId, userId), eq(streams.status, "live")))
    .limit(1);
  return live || null;
}

/**
 * Extracts and sanitises a JSON object from raw AI output.
 *
 * The AI occasionally returns:
 *  - Unquoted / single-quoted property names  → fixed with regex
 *  - Trailing commas before } or ]           → stripped
 *  - Extra text / another JSON fragment after the main object → trimmed
 *  - Truncated JSON (missing closing braces) → returns null so caller retries
 */
function extractAndSanitizeJSON(raw: string): string | null {
  // Step 1: find the outermost { ... } block by tracking brace depth
  let start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null; // truncated — missing closing braces

  let json = raw.slice(start, end + 1);

  // Step 2: remove JS-style // and /* */ comments
  json = json.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // Step 3: single-quoted string values → double-quoted
  // (handles 'value' → "value" — property names are handled below)
  json = json.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');

  // Step 4: unquoted property names → quoted  (e.g.  key: → "key":)
  json = json.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  // Step 5: trailing commas before ] or }
  json = json.replace(/,(\s*[}\]])/g, "$1");

  return json;
}

async function generateBatchPlan(
  stream: StreamWithRemaining,
  batchNumber: number,
  userId?: string,
): Promise<ContentPlan | null> {
  const segStart = stream.nextSegmentStart;
  const availableMinutes = Math.min(stream.remainingMinutes, MINUTES_PER_BATCH);
  const segEnd = segStart + availableMinutes;

  const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert YouTube content strategist specializing in gaming channels. Your team includes:

1. SEO Specialist: Deep knowledge of YouTube search ranking factors, keyword research, and description optimization for gaming content discoverability.

2. Creative Director: Skilled at writing compelling titles using curiosity gaps and strong hooks. Crafts descriptions that drive subscriptions and watch time.

3. Growth Analyst: Understands what separates high-performing gaming videos from average ones. Focuses on shareability, algorithmic signals, and audience retention patterns.

4. Content Editor: Identifies the most exciting, funny, or dramatic moments in gameplay footage — the highlights viewers want to watch and share.

STREAM INFO:
- Title: "${stream.stream.title}"
- Total Duration: ${stream.totalMinutes} minutes
- Current Segment: ${segStart} min to ${segEnd} min (${availableMinutes} min available)
- Batch #${batchNumber} from this stream
${buildContentPromptSection(detectContentContext(stream.stream.title, null, (stream.stream as any).category || null, { gameName: (stream.stream as any).gameName || null }))}
${retentionContext}

CONTENT-ADAPTIVE REQUIREMENTS:
- ALL content MUST be specifically about what happened in "${stream.stream.title}" — reference the actual topic, specific moments, and events.
- Do NOT create generic content. Every title, description, hook, and caption must relate to the SPECIFIC content of this stream segment.
- Use niche-specific terminology and community language relevant to this stream.

RULES:
- Long-form is a FULL-LENGTH video — target 45-${LONG_FORM_MAX_MINUTES} minutes. Do NOT create a short clip. Cover as much of the ${segStart}-${segEnd} minute range as possible with meaningful, engaging content. This is a complete standalone video, not a highlight reel.
- Create exactly ${SHORTS_PER_BATCH} shorts (30-59 seconds each, sweet spot 40-50 seconds) — pick the 3 best standalone moments from the ${segStart}-${segEnd} minute range
- All timestamps MUST be within the ${segStart}-${segEnd} minute range
- Long-form segments array: provide 4-8 chapter segments spanning the full ${segStart}-${segEnd} range with hooks for each chapter
- Titles: Use curiosity gaps, numbers, and strong hooks. Under 60 chars. Front-load keywords. Examples: "I Can't Believe This Actually Worked..." or "This 1v4 Clutch Changed Everything"
- Descriptions: First 2 lines are shown in search — make them count. Include primary keyword in first sentence. Add timestamps at EVERY chapter for YouTube chapters feature. End with a call-to-action. Include 3-5 related keyword phrases naturally.
- Tags: 15-25 tags mixing broad niche keywords with specific long-tail keywords. Include topic/subject variations and trending terms.
- Shorts: Strong opening moment in first 0.5 seconds. Title must work as both a YouTube Short title AND TikTok caption. Hashtags must include trending + niche-specific tags. Include #Shorts in the description.
- Each batch must feel like a FRESH standalone video — unique angle, unique title.
- Long-form structure: engaging opening in first 3 seconds, chapter breaks every 5-8 minutes, maintain viewer interest throughout, end-screen call-to-action.

CRITICAL JSON RULES — YOU MUST FOLLOW THESE OR THE RESPONSE WILL BE REJECTED:
- NEVER use literal double-quote characters (") inside any JSON string value
- Game titles like Battlefield 6, PS5, etc. must NOT be wrapped in double quotes within descriptions or titles
- For apostrophes in words (don't, won't, player's), always use a real apostrophe (') never a double-quote (")
- All string values must be valid JSON — no unescaped special characters

Return ONLY valid JSON:
{
  "longForm": {
    "title": "string - compelling title under 60 chars with curiosity gap and strong hook",
    "description": "string - SEO-optimized description: keyword-rich first 2 lines, timestamps at chapter breaks, hashtags, and call-to-action",
    "segments": [{"startMinute": number, "endMinute": number, "hook": "string - why this moment is compelling"}],
    "totalDurationEstimate": "string like 52:30 — target 45-60 minutes for long-form",
    "tags": ["array of 15-25 SEO-optimized tags mixing broad and long-tail keywords"],
    "thumbnailConcept": "detailed thumbnail concept: emotion, composition, colors, focal point, contrast technique",
    "retentionBrief": {
      "hookStrategy": "exact first-3-second hook to grab attention",
      "reHookAt30s": "re-engagement moment at 30s to maintain interest",
      "curiosityLoops": ["3 open questions or teases planted throughout to maintain watch time"],
      "endScreenCTA": "specific call-to-action driving to next video or subscribe"
    },
    "titleVariants": ["2 alternative titles for A/B testing with different hook types"]
  },
  "shorts": [
    {
      "title": "string - attention-grabbing title under 50 chars",
      "description": "string - SEO description with keywords and CTA",
      "startMinute": number,
      "endMinute": number,
      "hook": "what makes this moment compelling and shareable",
      "hashtags": ["array of 5-8 hashtags mixing trending + niche"],
      "targetDuration": "string like 0:34",
      "tiktokCaption": "TikTok-optimized caption with hooks and trending hashtags"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Create Batch #${batchNumber} YouTube content from stream "${stream.stream.title}". Use footage from minute ${segStart} to minute ${segEnd}. This is ${availableMinutes} minutes of footage. Make it feel fresh — these are brand new videos, not "part 2". Think of unique angles, compilation themes, or highlight moments.`
        }
      ],
      temperature: 0.85,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content?.trim() || "";

    let plan: ContentPlan;
    try {
      plan = JSON.parse(text) as ContentPlan;
    } catch {
      // AUDIT FIX: Log raw AI response when sanitization is triggered for diagnostic visibility
      logger.warn("[DailyContent] Falling back to JSON sanitization — raw AI response did not parse cleanly", {
        snippet: text.substring(0, 300),
      });

      const sanitized = extractAndSanitizeJSON(text);
      if (!sanitized) {
        logger.error("AI returned non-JSON content plan", { text: text.substring(0, 200) });
        return null;
      }
      try {
        plan = JSON.parse(sanitized) as ContentPlan;
      } catch (parseErr: any) {
        logger.error("AI JSON parse failed after sanitization", {
          batchNumber,
          error: parseErr.message,
          snippet: sanitized.substring(0, 300),
        });
        return null;
      }
    }
    if (!plan.longForm?.title || !plan.shorts || plan.shorts.length === 0) {
      logger.error("AI content plan missing required fields");
      return null;
    }

    if (plan.shorts.length > SHORTS_PER_BATCH) {
      plan.shorts = plan.shorts.slice(0, SHORTS_PER_BATCH);
    }

    return plan;
  } catch (err: any) {
    logger.error("Failed to generate batch plan", { error: err.message, batchNumber });
    return null;
  }
}

async function queueBatchContent(
  userId: string,
  plan: ContentPlan,
  stream: StreamWithRemaining,
  batchNumber: number,
  connectedPlatforms: ConnectedPlatforms,
  dayOffset: number = 0,
): Promise<{ longFormQueued: boolean; shortsQueued: number; crossPostsQueued: number }> {
  let longFormQueued = false;
  let shortsQueued = 0;
  let crossPostsQueued = 0;
  const groupId = `exhaust-${stream.stream.id}-batch-${batchNumber}-${Date.now()}`;

  const longFormTime = await getScheduledTimeForDay(dayOffset, userId);

  const allPlatforms = ["youtube", ...connectedPlatforms.all];

  try {
    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: null,
      type: "auto-clip",
      targetPlatform: "youtube",
      content: plan.longForm.description,
      caption: plan.longForm.title,
      status: "scheduled",
      scheduledAt: longFormTime,
      metadata: {
        contentType: "long-form-compilation",
        contentCategory: "video",
        style: "highlight-reel",
        aiModel: "gpt-4o-mini",
        sourceStreamId: stream.stream.id,
        segmentStartMin: stream.nextSegmentStart,
        segmentEndMin: stream.nextSegmentStart + Math.min(stream.remainingMinutes, MINUTES_PER_BATCH),
        batchNumber,
        crossPlatformGroupId: groupId,
        crossLinkedPlatforms: allPlatforms,
        tags: plan.longForm.tags || [],
        retentionBeatsApplied: true,
        retentionBrief: plan.longForm.retentionBrief || null,
        titleVariants: plan.longForm.titleVariants || [],
        thumbnailConcept: plan.longForm.thumbnailConcept,
      },
    } as any);
    longFormQueued = true;
  } catch (err: any) {
    logger.error("Failed to queue long-form", { userId, error: err.message });
  }

  for (let i = 0; i < plan.shorts.length; i++) {
    const short = plan.shorts[i];
    const shortTime = new Date(longFormTime.getTime() + (i + 1) * 60 * 60 * 1000 + Math.random() * 20 * 60 * 1000);

    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: null,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: `${short.title}\n\n${short.description}\n\n${short.hashtags.join(" ")}`,
        caption: short.title,
        status: "scheduled",
        scheduledAt: shortTime,
        metadata: {
          contentType: "youtube-short",
          contentCategory: "video",
          style: "short-clip",
          aiModel: "gpt-4o-mini",
          sourceStreamId: stream.stream.id,
          segmentStartMin: short.startMinute,
          segmentEndMin: short.endMinute,
          tags: short.hashtags?.map((h: string) => h.replace(/^#/, "")) || [],
          retentionBeatsApplied: true,
          batchNumber,
          crossPlatformGroupId: groupId,
          crossLinkedPlatforms: allPlatforms,
          tiktokCaption: short.tiktokCaption || null,
        },
      } as any);
      shortsQueued++;
    } catch (err: any) {
      logger.error("Failed to queue short", { userId, index: i + 1, error: err.message });
    }
  }

  for (const platform of connectedPlatforms.video) {
    for (let i = 0; i < plan.shorts.length; i++) {
      const short = plan.shorts[i];
      const crossTime = new Date(longFormTime.getTime() + (i + 2) * 60 * 60 * 1000 + Math.random() * 45 * 60 * 1000);
      const platformCaption = platform === "tiktok"
        ? `${short.title} ${short.hashtags.map(h => `#${h.replace('#', '')}`).join(" ")} #fyp`
        : short.title;

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: null,
          type: "auto-clip",
          targetPlatform: platform,
          content: `${short.title}\n\n${short.description}\n\n${short.hashtags.join(" ")}`,
          caption: short.title,
          status: "scheduled",
          scheduledAt: crossTime,
          metadata: {
            contentType: "video-clip",
            contentCategory: "video",
            style: "short-clip",
            aiModel: "gpt-4o-mini",
            sourceStreamId: stream.stream.id,
            segmentStartMin: short.startMinute,
            segmentEndMin: short.endMinute,
            batchNumber,
            crossPlatformGroupId: groupId,
            tiktokCaption: short.tiktokCaption || platformCaption,
            retentionBeatsApplied: true,
          },
        } as any);
        crossPostsQueued++;
      } catch (err: any) {
        logger.error("Failed to queue video cross-post", { platform, error: err.message });
      }
    }
  }

  for (const platform of connectedPlatforms.text) {
    const longFormAnnouncementTime = new Date(longFormTime.getTime() + 15 * 60 * 1000 + Math.random() * 30 * 60 * 1000);
    const topTags = plan.longForm.tags.slice(0, 3).map(t => `#${t.replace('#', '').replace(/\s+/g, '')}`).join(" ");
    const longFormAnnouncement = `**NEW VIDEO**\n\n**${plan.longForm.title}**\n\n${plan.longForm.description.substring(0, 800)}\n\n${topTags}\n\nWatch now on YouTube!`.substring(0, 1997) + "...";

    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: null,
        type: "cross-post",
        targetPlatform: platform,
        content: longFormAnnouncement,
        caption: `New: ${plan.longForm.title}`,
        status: "scheduled",
        scheduledAt: longFormAnnouncementTime,
        metadata: {
          contentType: "text-announcement",
          contentCategory: "text",
          style: "announcement",
          aiModel: "gpt-4o-mini",
          sourceStreamId: stream.stream.id,
          batchNumber,
          crossPlatformGroupId: groupId,
        },
      } as any);
      crossPostsQueued++;
    } catch (err: any) {
      logger.error("Failed to queue text announcement", { platform, error: err.message });
    }

    for (let i = 0; i < plan.shorts.length; i++) {
      const short = plan.shorts[i];
      const crossTime = new Date(longFormTime.getTime() + (i + 3) * 60 * 60 * 1000 + Math.random() * 45 * 60 * 1000);
      const textContent = `**${short.title}**\n\n${short.hook}\n\n${short.hashtags.slice(0, 5).join(" ")}\n\nCheck it out on YouTube!`.substring(0, 1997) + "...";

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: null,
          type: "cross-post",
          targetPlatform: platform,
          content: textContent,
          caption: short.title,
          status: "scheduled",
          scheduledAt: crossTime,
          metadata: {
            contentType: "text-teaser",
            contentCategory: "text",
            style: "teaser",
            aiModel: "gpt-4o-mini",
            sourceStreamId: stream.stream.id,
            segmentStartMin: short.startMinute,
            segmentEndMin: short.endMinute,
            batchNumber,
            crossPlatformGroupId: groupId,
          },
        } as any);
        crossPostsQueued++;
      } catch (err: any) {
        logger.error("Failed to queue text cross-post", { platform, error: err.message });
      }
    }
  }

  const batchEnd = stream.nextSegmentStart + Math.min(stream.remainingMinutes, MINUTES_PER_BATCH);
  const allSegments = [
    ...plan.longForm.segments.map(s => ({ start: s.startMinute, end: s.endMinute })),
    ...plan.shorts.map(s => ({ start: s.startMinute, end: s.endMinute })),
  ];
  const maxEndMinute = allSegments.length > 0
    ? Math.max(batchEnd, ...allSegments.map(s => s.end))
    : batchEnd;
  const minutesConsumed = Math.max(MINUTES_PER_BATCH, maxEndMinute - stream.nextSegmentStart);
  const clampedConsumed = Math.min(minutesConsumed, stream.remainingMinutes);
  const newTotal = (stream.extractedMinutes || 0) + clampedConsumed;
  const fullyExhausted = newTotal >= stream.totalMinutes - 1;

  await db.update(streams)
    .set({
      contentMinutesExtracted: newTotal,
      contentFullyExhausted: fullyExhausted,
    })
    .where(eq(streams.id, stream.stream.id));

  logger.info("Batch queued + stream progress updated", {
    streamId: stream.stream.id,
    batchNumber,
    minutesConsumed,
    totalExtracted: newTotal,
    totalMinutes: stream.totalMinutes,
    fullyExhausted,
    crossPostsQueued,
  });

  return { longFormQueued, shortsQueued, crossPostsQueued };
}

async function getLiveStreamAsExhaustCandidate(userId: string): Promise<StreamWithRemaining | null> {
  const live = await getCurrentLiveStream(userId);
  if (!live || !live.startedAt) return null;

  const elapsedMinutes = Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 60000);
  const extracted = live.contentMinutesExtracted || 0;
  const availableMinutes = elapsedMinutes - extracted - 10;
  if (availableMinutes < MINUTES_PER_BATCH) return null;

  return {
    stream: live,
    totalMinutes: elapsedMinutes,
    extractedMinutes: extracted,
    remainingMinutes: availableMinutes,
    nextSegmentStart: extracted,
  };
}

export async function runSingleBatchForUser(userId: string): Promise<{ didWork: boolean; exhausted: boolean }> {
  try {
    const connectedPlatforms = await getUserConnectedPlatforms(userId);
    const liveCandidate = await getLiveStreamAsExhaustCandidate(userId);
    const endedStreams = await getStreamsWithRemainingContent(userId);

    let streamsWithContent: StreamWithRemaining[] = [];
    if (liveCandidate) streamsWithContent.push(liveCandidate);
    streamsWithContent.push(...endedStreams);

    if (streamsWithContent.length === 0) {
      return { didWork: false, exhausted: true };
    }

    const activeTrend = await getActiveTrendOverride(userId);
    const cooldownTrends = await getCooldownTrendOverrides(userId);
    streamsWithContent = selectStreamByTrend(streamsWithContent, activeTrend, cooldownTrends) as StreamWithRemaining[];

    const streamData = streamsWithContent[0];
    const dayOffset = await getNextAvailableDayOffset(userId);

    const existingBatches = await db
      .select({ count: sql<number>`count(DISTINCT (${autopilotQueue.metadata}->>'batchNumber'))::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        sql`${autopilotQueue.metadata}->>'sourceStreamId' = ${String(streamData.stream.id)}`,
      ));

    const batchNumber = (existingBatches[0]?.count || 0) + 1;

    logger.info("Loop: generating batch from stream", {
      userId,
      streamId: streamData.stream.id,
      batchNumber,
      dayOffset,
      remainingMinutes: streamData.remainingMinutes,
    });

    const plan = await generateBatchPlan(streamData, batchNumber, userId);
    if (!plan) {
      if (streamsWithContent.length > 1) {
        const consumed = Math.min(streamData.remainingMinutes, MINUTES_PER_BATCH);
        const newTotal = (streamData.extractedMinutes || 0) + consumed;
        await db.update(streams).set({
          contentMinutesExtracted: newTotal,
          contentFullyExhausted: newTotal >= streamData.totalMinutes - 1,
        }).where(eq(streams.id, streamData.stream.id));
        logger.info("Plan generation failed, advancing stream and will retry next stream", { streamId: streamData.stream.id });
        return { didWork: false, exhausted: false };
      }
      return { didWork: false, exhausted: false };
    }

    const result = await queueBatchContent(userId, plan, streamData, batchNumber, connectedPlatforms, dayOffset);

    const ytCount = (result.longFormQueued ? 1 : 0) + result.shortsQueued;
    logger.info("Loop: batch queued", {
      userId,
      batchNumber,
      youtubeItems: ytCount,
      crossPosts: result.crossPostsQueued,
    });

    const remainingAfter = Math.max(0, streamData.remainingMinutes - Math.min(streamData.remainingMinutes, MINUTES_PER_BATCH));

    sendSSEEvent(userId, "content-update", { source: "content-loop", batches: 1 });
    sendSSEEvent(userId, "autopilot-update", { source: "content-loop" });

    const allExhausted = remainingAfter < 1 && streamsWithContent.length <= 1;

    return { didWork: true, exhausted: allExhausted };
  } catch (err: any) {
    logger.error("Loop: single batch failed", { userId, error: err.message });
    return { didWork: false, exhausted: false };
  }
}

export async function runDailyContentGeneration(): Promise<void> {
  logger.info("Stream Exhaust Engine cycle starting");

  const userIds = await getUserIdsWithYouTube();
  if (userIds.length === 0) {
    logger.info("No users with YouTube channels found");
    return;
  }

  for (const userId of userIds) {
    try {
      const connectedPlatforms = await getUserConnectedPlatforms(userId);

      const liveCandidate = await getLiveStreamAsExhaustCandidate(userId);
      if (liveCandidate) {
        logger.info("Live stream has harvestable footage", {
          userId,
          streamId: liveCandidate.stream.id,
          elapsedMinutes: liveCandidate.totalMinutes,
          availableMinutes: liveCandidate.remainingMinutes,
        });
      }

      const endedStreams = shouldRunDailyContent(userId)
        ? await getStreamsWithRemainingContent(userId)
        : [];

      let streamsWithContent: StreamWithRemaining[] = [];
      if (liveCandidate) streamsWithContent.push(liveCandidate);
      streamsWithContent.push(...endedStreams);

      if (streamsWithContent.length === 0) {
        logger.info("No streams with remaining content to exhaust", { userId });
        continue;
      }

      const activeTrend = await getActiveTrendOverride(userId);
      const cooldownTrends = await getCooldownTrendOverrides(userId);
      streamsWithContent = selectStreamByTrend(streamsWithContent, activeTrend, cooldownTrends) as StreamWithRemaining[];

      let totalBatchesThisRun = 0;
      const runStartMs = Date.now();

      for (const streamData of streamsWithContent) {
        let streamRemaining = streamData.remainingMinutes;
        let streamExtracted = streamData.extractedMinutes;
        let streamNextStart = streamData.nextSegmentStart;
        let consecutiveFailures = 0;

        while (streamRemaining >= 1) {
          // Safety valve: stop only when the wall-clock budget is exceeded.
          // Each batch awaits a real API call, so the event loop is freed between
          // iterations — no starvation.  Progress is persisted after every batch.
          if (Date.now() - runStartMs > ENGINE_RUN_BUDGET_MS) {
            logger.info("Per-run time budget reached, deferring remaining content to next cycle", {
              userId, elapsedMs: Date.now() - runStartMs, streamRemainingMinutes: streamRemaining,
            });
            break;
          }
          const dayOffset = await getNextAvailableDayOffset(userId);

          const existingBatches = await db
            .select({ count: sql<number>`count(DISTINCT (${autopilotQueue.metadata}->>'batchNumber'))::int` })
            .from(autopilotQueue)
            .where(and(
              eq(autopilotQueue.userId, userId),
              sql`${autopilotQueue.metadata}->>'sourceStreamId' = ${String(streamData.stream.id)}`,
            ));

          const batchNumber = (existingBatches[0]?.count || 0) + 1;

          const currentStreamData: StreamWithRemaining = {
            ...streamData,
            remainingMinutes: streamRemaining,
            extractedMinutes: streamExtracted,
            nextSegmentStart: streamNextStart,
          };

          logger.info("Generating batch from stream", {
            userId,
            streamId: streamData.stream.id,
            streamTitle: streamData.stream.title,
            batchNumber,
            dayOffset,
            remainingMinutes: streamRemaining,
            totalMinutes: streamData.totalMinutes,
          });

          const plan = await generateBatchPlan(currentStreamData, batchNumber, userId);
          if (!plan) {
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              logger.warn("3 consecutive plan generation failures, moving to next stream", {
                userId,
                streamId: streamData.stream.id,
              });
              break;
            }
            const skipMinutes = Math.min(MINUTES_PER_BATCH, streamRemaining);
            streamRemaining -= skipMinutes;
            streamExtracted += skipMinutes;
            streamNextStart += skipMinutes;
            continue;
          }
          consecutiveFailures = 0;

          const result = await queueBatchContent(userId, plan, currentStreamData, batchNumber, connectedPlatforms, dayOffset);
          totalBatchesThisRun++;

          const consumed = Math.min(MINUTES_PER_BATCH, streamRemaining);
          streamRemaining -= consumed;
          streamExtracted += consumed;
          streamNextStart += consumed;
        }
      }

      if (totalBatchesThisRun > 0) {
        logger.info("Stream exhaust cycle complete for user", { userId, batchesGenerated: totalBatchesThisRun });
        sendSSEEvent(userId, "content-update", { source: "stream-exhaust", batches: totalBatchesThisRun });
        sendSSEEvent(userId, "autopilot-update", { source: "stream-exhaust" });
      }
    } catch (err: any) {
      logger.error("Stream exhaust failed for user", { userId, error: err.message });
    }
  }

  logger.info("Stream Exhaust Engine cycle complete");
}

export async function getStreamExhaustStatus(userId: string): Promise<{
  activeStreamsWithContent: number;
  totalRemainingMinutes: number;
  totalExtractedMinutes: number;
  totalStreamMinutes: number;
  exhaustPercentage: number;
  batchesQueued: number;
  nextBatchEta: string;
  streams: Array<{
    id: number;
    title: string;
    totalMinutes: number;
    extractedMinutes: number;
    remainingMinutes: number;
    exhausted: boolean;
  }>;
}> {
  const allStreams = await db.select().from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      isNotNull(streams.startedAt),
    ))
    .orderBy(desc(streams.startedAt))
    .limit(100);

  let totalRemaining = 0;
  let totalExtracted = 0;
  let totalStreamMinutes = 0;
  let activeCount = 0;
  const streamList: any[] = [];

  for (const stream of allStreams) {
    if (!stream.startedAt || !stream.endedAt) continue;
    const total = Math.floor(
      (new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000
    );
    const extracted = stream.contentMinutesExtracted || 0;
    const remaining = Math.max(0, total - extracted);
    const exhausted = stream.contentFullyExhausted || false;

    totalStreamMinutes += total;
    totalExtracted += extracted;
    totalRemaining += remaining;
    if (!exhausted && remaining >= 1) activeCount++;

    streamList.push({
      id: stream.id,
      title: stream.title,
      totalMinutes: total,
      extractedMinutes: extracted,
      remainingMinutes: remaining,
      exhausted,
    });
  }

  const [batchCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      sql`${autopilotQueue.metadata}->>'sourceStreamId' IS NOT NULL`,
    ));

  return {
    activeStreamsWithContent: activeCount,
    totalRemainingMinutes: totalRemaining,
    totalExtractedMinutes: totalExtracted,
    totalStreamMinutes,
    exhaustPercentage: totalStreamMinutes > 0 ? Math.round((totalExtracted / totalStreamMinutes) * 100) : 0,
    batchesQueued: batchCount?.count || 0,
    nextBatchEta: "Runs every 2 hours",
    streams: streamList,
  };
}

export async function getDailyContentStatus(userId: string): Promise<{
  active: boolean;
  launchDate: string;
  todayPlanned: boolean;
  longFormPerDay: number;
  shortsPerDay: number;
  maxLongFormMinutes: number;
  todayItems: number;
  streamExhaust: Awaited<ReturnType<typeof getStreamExhaustStatus>>;
}> {
  const active = true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      gte(autopilotQueue.scheduledAt, todayStart),
      lte(autopilotQueue.scheduledAt, todayEnd),
    ));

  const streamExhaust = await getStreamExhaustStatus(userId);

  return {
    active,
    launchDate: "2026-02-20T00:00:00.000Z",
    todayPlanned: (todayCount?.count || 0) >= (LONG_FORM_PER_BATCH + SHORTS_PER_BATCH),
    longFormPerDay: LONG_FORM_PER_BATCH,
    shortsPerDay: SHORTS_PER_BATCH,
    maxLongFormMinutes: LONG_FORM_MAX_MINUTES,
    todayItems: todayCount?.count || 0,
    streamExhaust,
  };
}

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 60 + minutes + Math.ceil(seconds / 60);
}

export async function bridgeVodsToStreams(userId: string): Promise<number> {
  const existingStreamVodIds = await db
    .select({ vodVideoId: streams.vodVideoId })
    .from(streams)
    .where(and(eq(streams.userId, userId), isNotNull(streams.vodVideoId)));
  const linkedVodIds = new Set(existingStreamVodIds.map(r => r.vodVideoId).filter(Boolean));

  const userChannels = await db.select({ id: channels.id }).from(channels)
    .where(eq(channels.userId, userId));
  if (userChannels.length === 0) return 0;
  const channelIds = userChannels.map(c => c.id);

  const longVods = await db.select().from(videos)
    .where(and(
      inArray(videos.channelId, channelIds),
      eq(videos.platform, "youtube"),
      eq(videos.type, "long"),
    ))
    .orderBy(desc(videos.createdAt));

  const MIN_STREAM_MINUTES = 20;
  let created = 0;

  for (const vod of longVods) {
    if (linkedVodIds.has(vod.id)) continue;
    if (!isVideoPostable(vod)) continue;

    const meta = (vod.metadata as any) || {};
    const durationStr = meta.duration || meta.contentDetails?.duration || "";
    const totalMinutes = parseIsoDuration(durationStr);

    if (totalMinutes < MIN_STREAM_MINUTES) continue;

    const publishedAt = meta.publishedAt ? new Date(meta.publishedAt) : vod.createdAt;
    const endedAt = new Date(publishedAt!.getTime() + totalMinutes * 60 * 1000);

    try {
      await db.insert(streams).values({
        userId,
        title: vod.title,
        description: vod.description || "",
        category: meta.categoryId || null,
        status: "ended",
        thumbnailUrl: vod.thumbnailUrl || meta.thumbnails?.high?.url || null,
        platforms: ["youtube"],
        startedAt: publishedAt,
        endedAt,
        detectedSource: "vod-bridge",
        isAutoDetected: true,
        vodVideoId: vod.id,
        contentMinutesExtracted: 0,
        contentFullyExhausted: false,
      });
      created++;
      linkedVodIds.add(vod.id);
      logger.info("VOD bridged to stream record", {
        userId,
        videoId: vod.id,
        title: vod.title,
        totalMinutes,
      });

      try {
        const [newStream] = await db.select().from(streams)
          .where(and(eq(streams.userId, userId), eq(streams.vodVideoId, vod.id)))
          .limit(1);
        if (newStream) {
          onStreamDetected(userId, newStream).catch(err =>
            logger.error("Trend detection on bridged VOD failed", { error: String(err) })
          );
        }
      } catch (trendErr: any) {
        logger.warn("Trend detection lookup on bridged VOD failed", { videoId: vod.id, error: trendErr?.message });
      }
    } catch (err: any) {
      logger.error("Failed to bridge VOD to stream", { videoId: vod.id, error: err.message });
    }
  }

  if (created > 0) {
    logger.info("VOD-to-Stream bridge complete", { userId, newStreams: created });
  }

  return created;
}
