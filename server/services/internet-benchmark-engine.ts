/**
 * Internet Benchmark Engine
 *
 * Continuously scans the web to discover what top YouTube gaming creators are
 * doing that this system doesn't yet know how to do, then builds those
 * capabilities directly — new prompts, strategies, and knowledge entries —
 * and applies them to BOTH the Shorts pipeline and the full-video pipeline.
 *
 * Cycle: runs every 24 h and covers all 12 benchmark domains on a 3-day
 * rolling window (each domain re-scanned every 3 days max).
 */

import { db } from "../db";
import {
  internetBenchmarks, discoveredStrategies, promptVersions, users,
  type InternetBenchmark,
} from "@shared/schema";
import { eq, and, desc, gte, lt, sql as drizzleSql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";
import {
  recordEngineKnowledge,
  getMasterKnowledgeForPrompt,
  getEngineKnowledgeForContext,
} from "./knowledge-mesh";

const logger = createLogger("internet-benchmark");

const CYCLE_MS   = 24 * 60 * 60_000;        // every 24 h
const STALENESS  = 3 * 24 * 60 * 60_000;    // re-scan after 3 days
const INITIAL_DELAY_MS = 18 * 60_000;        // first run 18 min after boot
const MAX_DOMAINS_PER_CYCLE = 4;             // spread load across days

// ---------------------------------------------------------------------------
// Benchmark domain definitions — each touches specific pipeline(s)
// ---------------------------------------------------------------------------
export const BENCHMARK_DOMAINS = [
  {
    id: "shorts_hooks",
    label: "Shorts Hook Techniques",
    pipelines: ["shorts"],
    queries: ["viral youtube gaming shorts hook techniques 2026", "best gaming shorts opening 3 seconds creator tips"],
    promptKey: "hook_writing",
    strategyType: "hook_design",
  },
  {
    id: "clip_moment_detection",
    label: "Viral Clip Moment Science",
    pipelines: ["shorts"],
    queries: ["how top gaming channels identify viral clip moments 2026", "criteria selecting best gaming moments for shorts"],
    promptKey: "clip_extraction",
    strategyType: "content_extraction",
  },
  {
    id: "title_formula",
    label: "Title Formula Science",
    pipelines: ["full_video"],
    queries: ["best youtube gaming video title formulas 2026", "high CTR gaming channel title writing techniques"],
    promptKey: "title_generation",
    strategyType: "title_formula",
  },
  {
    id: "thumbnail_psychology",
    label: "Thumbnail Psychology & CTR",
    pipelines: ["shorts", "full_video"],
    queries: ["youtube gaming thumbnail CTR psychology 2026", "highest performing gaming channel thumbnail design patterns"],
    promptKey: "thumbnail_concept",
    strategyType: "thumbnail_design",
  },
  {
    id: "seo_metadata",
    label: "SEO & Metadata Mastery",
    pipelines: ["full_video"],
    queries: ["youtube gaming SEO description tags optimization 2026", "gaming channel metadata ranking strategy"],
    promptKey: "seo_optimization",
    strategyType: "seo_optimization",
  },
  {
    id: "algorithm_signals",
    label: "Algorithm Ranking Signals",
    pipelines: ["full_video", "shorts"],
    queries: ["youtube algorithm ranking signals gaming 2026", "how youtube ranks gaming content newest changes"],
    promptKey: "growth_strategy",
    strategyType: "growth_strategy",
  },
  {
    id: "audience_retention",
    label: "Audience Retention Science",
    pipelines: ["full_video"],
    queries: ["youtube audience retention techniques gaming 2026", "watch time optimization long form gaming videos"],
    promptKey: "audience_retention",
    strategyType: "audience_retention",
  },
  {
    id: "shorts_structure",
    label: "Shorts Pacing & Structure",
    pipelines: ["shorts"],
    queries: ["youtube gaming shorts structure pacing best practices 2026", "ideal gaming short form video format length"],
    promptKey: "short_form_adaptation",
    strategyType: "shorts_strategy",
  },
  {
    id: "cross_platform",
    label: "Cross-Platform Repurposing",
    pipelines: ["full_video", "shorts"],
    queries: ["gaming content cross platform tiktok youtube repurposing 2026", "multi-platform gaming channel content strategy"],
    promptKey: "short_form_adaptation",
    strategyType: "cross_platform_adaptation",
  },
  {
    id: "monetization",
    label: "Revenue Maximization",
    pipelines: ["full_video"],
    queries: ["gaming youtube channel monetization strategies 2026", "no commentary gaming channel revenue optimization"],
    promptKey: "revenue_optimization",
    strategyType: "revenue_optimization",
  },
  {
    id: "community_engagement",
    label: "Community & Viral Growth",
    pipelines: ["full_video"],
    queries: ["youtube gaming community building viral growth 2026", "gaming channel engagement subscriber growth tactics"],
    promptKey: "community_post_writing",
    strategyType: "community_engagement",
  },
  {
    id: "emerging_formats",
    label: "Emerging Gaming Content Formats",
    pipelines: ["full_video", "shorts"],
    queries: ["new gaming content formats youtube trending 2026", "emerging gaming video styles creators adopting 2026"],
    promptKey: "trend_riding_angle",
    strategyType: "trend_exploitation",
  },
] as const;

type BenchmarkDomain = typeof BENCHMARK_DOMAINS[number];

// ---------------------------------------------------------------------------
// Web search helpers
// ---------------------------------------------------------------------------
async function searchWebForDomain(domain: BenchmarkDomain): Promise<string> {
  const parts: string[] = [];

  for (const query of domain.queries) {
    // Wikipedia
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const resp = await fetch(wikiUrl, {
        signal: ctrl.signal,
        headers: { "User-Agent": "CreatorOS/1.0 (internet-benchmark)" },
      });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json() as any;
        const results: any[] = data?.query?.search || [];
        const text = results.map((r: any) =>
          `${r.title}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 250)}`
        ).join("\n");
        if (text) parts.push(`[Wikipedia — ${query}]\n${text}`);
      }
    } catch { /* swallow */ }

    // DuckDuckGo
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`;
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 10_000);
      const resp2 = await fetch(ddgUrl, {
        signal: ctrl2.signal,
        headers: { "User-Agent": "CreatorOS/1.0 (internet-benchmark)" },
      });
      clearTimeout(t2);
      if (resp2.ok) {
        const data2 = await resp2.json() as any;
        const chunks: string[] = [];
        if (data2.AbstractText) chunks.push(data2.AbstractText.slice(0, 400));
        if (data2.RelatedTopics?.length) {
          chunks.push(
            data2.RelatedTopics.slice(0, 4)
              .map((t: any) => t.Text?.slice(0, 180))
              .filter(Boolean)
              .join(" | ")
          );
        }
        if (chunks.length) parts.push(`[DuckDuckGo — ${query}]\n${chunks.join("\n")}`);
      }
    } catch { /* swallow */ }
  }

  return parts.join("\n\n") || "No web data retrieved — using AI training knowledge.";
}

// ---------------------------------------------------------------------------
// Gap analysis — what does the web know that we don't?
// ---------------------------------------------------------------------------
interface GapAnalysis {
  hasGap: boolean;
  severity: number;            // 0-10
  gapDescription: string;
  suggestedCapabilityType: "strategy" | "prompt" | "knowledge";
  webInsight: string;          // key lesson from the web
}

async function analyzeGap(
  userId: string,
  domain: BenchmarkDomain,
  webData: string,
  existingKnowledge: string,
): Promise<GapAnalysis> {
  const systemPrompt = `You are an expert at identifying knowledge and capability gaps in AI systems for YouTube gaming channels. You compare what the internet currently teaches about a topic against what a system already knows, and identify precise, actionable gaps. Always return valid JSON only.`;

  const userPrompt = `DOMAIN: ${domain.label}
AFFECTS PIPELINES: ${domain.pipelines.join(", ")}

WHAT THE INTERNET SAYS RIGHT NOW:
${webData}

WHAT OUR SYSTEM ALREADY KNOWS ABOUT THIS:
${existingKnowledge || "Very little — this domain is under-represented in our knowledge base."}

Identify whether there is a meaningful, actionable gap between the current best internet knowledge and what our system knows.

Return ONLY valid JSON:
{
  "hasGap": true,
  "severity": 7,
  "gapDescription": "One specific, precise description of the gap (what the system is missing)",
  "suggestedCapabilityType": "strategy",
  "webInsight": "The single most impactful technique or principle from the web research that we should implement"
}

severity: 1-10 (10 = critical gap, 1 = minor nuance)
suggestedCapabilityType: "strategy" (for tactical approaches) | "prompt" (for AI instruction improvements) | "knowledge" (for factual/contextual knowledge)
If there is no meaningful gap (we already know this well), set hasGap to false and severity to 0.`;

  const result = await executeRoutedAICall(
    { taskType: "competitive_intel", userId, maxTokens: 600, priority: "low" },
    systemPrompt,
    userPrompt,
  );

  const parsed = safeParseJSON<GapAnalysis>(result.content, {
    hasGap: false,
    severity: 0,
    gapDescription: "",
    suggestedCapabilityType: "knowledge",
    webInsight: "",
  });

  return parsed;
}

// ---------------------------------------------------------------------------
// Build a capability from the gap — writes to DB tables
// ---------------------------------------------------------------------------
async function buildCapability(
  userId: string,
  domain: BenchmarkDomain,
  gap: GapAnalysis,
  webData: string,
  benchmarkId: number,
): Promise<{ type: string; ref: string; summary: string }> {

  if (gap.suggestedCapabilityType === "strategy") {
    return buildStrategyCapability(userId, domain, gap, webData);
  } else if (gap.suggestedCapabilityType === "prompt") {
    return buildPromptCapability(userId, domain, gap, webData);
  } else {
    return buildKnowledgeCapability(userId, domain, gap, webData);
  }
}

async function buildStrategyCapability(
  userId: string,
  domain: BenchmarkDomain,
  gap: GapAnalysis,
  webData: string,
): Promise<{ type: string; ref: string; summary: string }> {
  const systemPrompt = `You are a YouTube gaming channel strategy architect. You translate internet research into specific, tested, immediately-deployable strategies for an autonomous AI content pipeline. Always return valid JSON only.`;

  const userPrompt = `Create a specific, actionable strategy based on this internet research gap:

DOMAIN: ${domain.label}
PIPELINES: ${domain.pipelines.join(", ")}
GAP IDENTIFIED: ${gap.gapDescription}
KEY WEB INSIGHT: ${gap.webInsight}
WEB DATA: ${webData.slice(0, 800)}

Return ONLY valid JSON:
{
  "title": "Concise strategy title (max 60 chars)",
  "description": "Specific, actionable description of exactly what to do differently. Include concrete examples, numbers, patterns. Min 150 words.",
  "applicableTo": ["shorts_pipeline", "full_video_pipeline"],
  "initialEffectiveness": 68,
  "keyTactics": ["Tactic 1", "Tactic 2", "Tactic 3"],
  "reasoning": "Why this addresses the gap and will improve channel performance"
}

applicableTo should include the relevant pipelines.
initialEffectiveness: 50-80 (confidence in the strategy before testing).`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 900, priority: "low" },
    systemPrompt,
    userPrompt,
  );

  const parsed = safeParseJSON<Record<string, any>>(result.content, {});

  if (!parsed?.title || !parsed?.description) {
    throw new Error("AI returned invalid strategy structure");
  }

  // Check for duplicates
  const existing = await db.select({ id: discoveredStrategies.id })
    .from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.userId, userId),
      eq(discoveredStrategies.title, parsed.title),
    ))
    .limit(1);

  let ref = "";
  if (!existing.length) {
    const [inserted] = await db.insert(discoveredStrategies).values({
      userId,
      strategyType: domain.strategyType,
      title: parsed.title,
      description: parsed.description,
      source: "internet-benchmark-engine",
      applicableTo: parsed.applicableTo ?? domain.pipelines,
      effectiveness: parsed.initialEffectiveness ?? 65,
      isActive: true,
      metadata: {
        generatedBy: "internet-benchmark-engine",
        domain: domain.id,
        gapDescription: gap.gapDescription,
        webInsight: gap.webInsight,
        keyTactics: parsed.keyTactics ?? [],
        reasoning: parsed.reasoning,
      },
    }).returning({ id: discoveredStrategies.id });
    ref = `strategy:${inserted.id}`;
    logger.info(`[InternetBenchmark] Built strategy "${parsed.title}" for ${domain.id} (user ${userId.slice(0, 8)})`);
  } else {
    ref = `strategy:${existing[0].id} (existing)`;
  }

  // Always add to knowledge mesh so all engines benefit
  await recordEngineKnowledge(
    "internet-benchmark-engine", userId, "web_discovery",
    `Internet benchmark: ${domain.label}`,
    `Web research revealed: ${gap.webInsight} → Strategy created: ${parsed.title}`,
    `Gap severity: ${gap.severity}/10. Pipelines: ${domain.pipelines.join(", ")}`,
    Math.min(95, 55 + gap.severity * 4),
  );

  return {
    type: "strategy",
    ref,
    summary: `Created strategy "${parsed.title}" for ${domain.label} (${domain.pipelines.join(" & ")} pipeline)`,
  };
}

async function buildPromptCapability(
  userId: string,
  domain: BenchmarkDomain,
  gap: GapAnalysis,
  webData: string,
): Promise<{ type: string; ref: string; summary: string }> {
  const systemPrompt = `You are a prompt engineering expert for YouTube gaming AI systems. You create highly effective AI prompts that implement specific techniques discovered through internet research. Always return valid JSON only.`;

  const userPrompt = `Create an improved AI prompt for this domain based on internet research:

DOMAIN: ${domain.label}
PROMPT KEY: ${domain.promptKey}
PIPELINES: ${domain.pipelines.join(", ")}
GAP: ${gap.gapDescription}
KEY INSIGHT FROM INTERNET: ${gap.webInsight}
WEB CONTEXT: ${webData.slice(0, 600)}

Create a prompt template that incorporates the latest internet-discovered techniques.
Return ONLY valid JSON:
{
  "systemPrompt": "Complete system prompt incorporating the new technique (150-300 words)",
  "userPromptTemplate": "User prompt template with {{variables}} for dynamic content (100-200 words)",
  "temperature": 0.8,
  "reasoning": "Why this prompt better implements the discovered technique"
}`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 1000, priority: "low" },
    systemPrompt,
    userPrompt,
  );

  const parsed = safeParseJSON<Record<string, any>>(result.content, {});

  if (!parsed?.systemPrompt || !parsed?.userPromptTemplate) {
    // Fall back to strategy if prompt generation fails
    return buildStrategyCapability(userId, domain, gap, webData);
  }

  const existing = await db.select({ version: promptVersions.version })
    .from(promptVersions)
    .where(eq(promptVersions.promptKey, domain.promptKey))
    .orderBy(desc(promptVersions.version))
    .limit(1);

  const newVersion = (existing[0]?.version ?? 0) + 1;

  await db.insert(promptVersions).values({
    promptKey: domain.promptKey,
    version: newVersion,
    model: "auto",
    systemPrompt: parsed.systemPrompt,
    userPromptTemplate: parsed.userPromptTemplate,
    temperature: parsed.temperature ?? 0.8,
    status: "active",
    metadata: {
      generatedBy: "internet-benchmark-engine",
      domain: domain.id,
      gapDescription: gap.gapDescription,
      webInsight: gap.webInsight,
      reasoning: parsed.reasoning,
    },
  });

  await recordEngineKnowledge(
    "internet-benchmark-engine", userId, "web_discovery",
    `Prompt upgrade: ${domain.label}`,
    `Internet research drove prompt upgrade for ${domain.promptKey} v${newVersion}: ${gap.webInsight}`,
    `Domain: ${domain.id}, Gap severity: ${gap.severity}/10`,
    Math.min(95, 60 + gap.severity * 4),
  );

  const ref = `prompt:${domain.promptKey}_v${newVersion}`;
  logger.info(`[InternetBenchmark] Built prompt ${domain.promptKey} v${newVersion} for ${domain.id} (user ${userId.slice(0, 8)})`);

  return {
    type: "prompt",
    ref,
    summary: `Upgraded prompt "${domain.promptKey}" to v${newVersion} with web-discovered technique for ${domain.label}`,
  };
}

async function buildKnowledgeCapability(
  userId: string,
  domain: BenchmarkDomain,
  gap: GapAnalysis,
  webData: string,
): Promise<{ type: string; ref: string; summary: string }> {
  await recordEngineKnowledge(
    "internet-benchmark-engine", userId, "web_discovery",
    `Internet research: ${domain.label}`,
    `${gap.webInsight} — Gap: ${gap.gapDescription}`,
    `Web data: ${webData.slice(0, 400)}`,
    Math.min(90, 50 + gap.severity * 4),
  );

  logger.info(`[InternetBenchmark] Recorded knowledge for ${domain.id} (user ${userId.slice(0, 8)})`);

  return {
    type: "knowledge",
    ref: `knowledge:${domain.id}`,
    summary: `Added internet-sourced knowledge about ${domain.label} to the knowledge mesh`,
  };
}

// ---------------------------------------------------------------------------
// Per-domain orchestration
// ---------------------------------------------------------------------------
async function runBenchmarkForDomain(
  userId: string,
  domain: BenchmarkDomain,
): Promise<void> {
  // Create a benchmark record in "searching" state
  const [record] = await db.insert(internetBenchmarks).values({
    userId,
    domain: domain.id,
    domainLabel: domain.label,
    searchQueries: [...domain.queries],
    status: "searching",
    pipelinesUpdated: [],
  }).returning({ id: internetBenchmarks.id });

  const benchmarkId = record.id;

  try {
    // 1 — Gather web data
    const webData = await searchWebForDomain(domain);

    await db.update(internetBenchmarks)
      .set({ webSummary: webData.slice(0, 2000) })
      .where(eq(internetBenchmarks.id, benchmarkId));

    // 2 — Get what we already know
    const existingKnowledge = await getEngineKnowledgeForContext(
      "internet-benchmark-engine", userId
    );

    // 3 — Analyze gap
    const masterWisdom = await getMasterKnowledgeForPrompt(userId);
    const combinedKnowledge = [existingKnowledge, masterWisdom].filter(Boolean).join("\n\n");

    const gap = await analyzeGap(userId, domain, webData, combinedKnowledge);

    if (!gap.hasGap || gap.severity < 2) {
      // No meaningful gap — system already knows this well
      await db.update(internetBenchmarks)
        .set({ status: "no_gap", gapSeverity: gap.severity })
        .where(eq(internetBenchmarks.id, benchmarkId));
      logger.info(`[InternetBenchmark] No gap for ${domain.id} (user ${userId.slice(0, 8)}) — already well covered`);
      return;
    }

    await db.update(internetBenchmarks)
      .set({
        status: "gap_found",
        gapFound: gap.gapDescription,
        gapSeverity: gap.severity,
      })
      .where(eq(internetBenchmarks.id, benchmarkId));

    // 4 — Build the capability
    const built = await buildCapability(userId, domain, gap, webData, benchmarkId);

    // 5 — Mark complete
    await db.update(internetBenchmarks)
      .set({
        status: "built",
        capabilityBuilt: built.summary,
        capabilityType: built.type,
        capabilityRef: built.ref,
        pipelinesUpdated: [...domain.pipelines],
      })
      .where(eq(internetBenchmarks.id, benchmarkId));

    logger.info(`[InternetBenchmark] ${domain.label}: gap(${gap.severity}/10) → built ${built.type} (user ${userId.slice(0, 8)})`);

  } catch (err: any) {
    await db.update(internetBenchmarks)
      .set({ status: "failed", errorMessage: String(err).slice(0, 300) })
      .where(eq(internetBenchmarks.id, benchmarkId));
    logger.error(`[InternetBenchmark] Domain ${domain.id} failed for user ${userId.slice(0, 8)}`, { err: String(err).slice(0, 200) });
  }
}

// ---------------------------------------------------------------------------
// Staleness check — which domains haven't been scanned recently?
// ---------------------------------------------------------------------------
async function getStaleDomainsForUser(userId: string): Promise<typeof BENCHMARK_DOMAINS[number][]> {
  const cutoff = new Date(Date.now() - STALENESS);

  const recentRuns = await db.select({
    domain: internetBenchmarks.domain,
    latestRun: drizzleSql<string>`MAX(${internetBenchmarks.createdAt})`,
  })
    .from(internetBenchmarks)
    .where(eq(internetBenchmarks.userId, userId))
    .groupBy(internetBenchmarks.domain);

  const recentMap = new Map(recentRuns.map(r => [r.domain, new Date(r.latestRun)]));

  const stale = BENCHMARK_DOMAINS.filter(d => {
    const last = recentMap.get(d.id);
    return !last || last < cutoff;
  });

  // Sort by how long since they were last scanned (oldest first)
  stale.sort((a, b) => {
    const aLast = recentMap.get(a.id)?.getTime() ?? 0;
    const bLast = recentMap.get(b.id)?.getTime() ?? 0;
    return aLast - bLast;
  });

  return stale;
}

// ---------------------------------------------------------------------------
// Per-user orchestration
// ---------------------------------------------------------------------------
async function runBenchmarkForUser(userId: string): Promise<void> {
  const stale = await getStaleDomainsForUser(userId);

  if (stale.length === 0) {
    logger.info(`[InternetBenchmark] All domains fresh for user ${userId.slice(0, 8)}`);
    return;
  }

  // Process up to MAX_DOMAINS_PER_CYCLE stale domains
  const toRun = stale.slice(0, MAX_DOMAINS_PER_CYCLE);
  logger.info(`[InternetBenchmark] Running ${toRun.length} domain(s) for user ${userId.slice(0, 8)}: ${toRun.map(d => d.id).join(", ")}`);

  for (const domain of toRun) {
    try {
      await runBenchmarkForDomain(userId, domain);
      // Small pause between domains to avoid hammering external APIs
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      logger.error(`[InternetBenchmark] Error in domain ${domain.id}`, { err: String(err).slice(0, 150) });
    }
  }
}

// ---------------------------------------------------------------------------
// Full cycle — runs for all users
// ---------------------------------------------------------------------------
export async function runInternetBenchmarkCycle(): Promise<void> {
  logger.info("[InternetBenchmark] Cycle starting — scanning internet for capability gaps");
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await runBenchmarkForUser(user.id);
    } catch (err) {
      logger.error(`[InternetBenchmark] User ${user.id.slice(0, 8)} cycle failed`, { err: String(err).slice(0, 150) });
    }
  }
  logger.info("[InternetBenchmark] Cycle complete");
}

// Manual trigger for a specific user (called from API)
export async function runInternetBenchmarkForUser(userId: string): Promise<{ domainsQueued: number }> {
  const stale = await getStaleDomainsForUser(userId);
  const toRun = stale.slice(0, MAX_DOMAINS_PER_CYCLE);
  if (toRun.length === 0) return { domainsQueued: 0 };

  // Run async (don't block HTTP response)
  setImmediate(async () => {
    for (const domain of toRun) {
      try {
        await runBenchmarkForDomain(userId, domain);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        logger.error(`[InternetBenchmark] Manual run domain ${domain.id} failed`, { err: String(err).slice(0, 150) });
      }
    }
  });

  return { domainsQueued: toRun.length };
}

// ---------------------------------------------------------------------------
// Get benchmark overview stats for a user
// ---------------------------------------------------------------------------
export async function getInternetBenchmarkStats(userId: string) {
  const all = await db.select().from(internetBenchmarks)
    .where(eq(internetBenchmarks.userId, userId))
    .orderBy(desc(internetBenchmarks.createdAt))
    .limit(100);

  const recent = all.slice(0, 20);
  const builtCount = all.filter(r => r.status === "built").length;
  const gapCount = all.filter(r => ["gap_found", "built"].includes(r.status ?? "")).length;
  const domainsScanned = new Set(all.map(r => r.domain)).size;

  // Domain coverage — for each domain, latest status + last run
  const domainStatus: Record<string, {
    label: string; lastRun: Date | null; lastStatus: string | null;
    builtCount: number; pipelines: readonly string[];
  }> = {};

  for (const d of BENCHMARK_DOMAINS) {
    const domainRuns = all.filter(r => r.domain === d.id);
    domainStatus[d.id] = {
      label: d.label,
      pipelines: d.pipelines,
      lastRun: domainRuns[0]?.createdAt ?? null,
      lastStatus: domainRuns[0]?.status ?? null,
      builtCount: domainRuns.filter(r => r.status === "built").length,
    };
  }

  return {
    totalRuns: all.length,
    domainsScanned,
    totalDomains: BENCHMARK_DOMAINS.length,
    builtCount,
    gapCount,
    domainStatus,
    recent,
  };
}

// ---------------------------------------------------------------------------
// Initialise the engine
// ---------------------------------------------------------------------------
let benchmarkTimer: ReturnType<typeof setInterval> | null = null;

export function initInternetBenchmarkEngine(): ReturnType<typeof setInterval> {
  logger.info("[InternetBenchmark] Engine initialized — watching internet for capability gaps");

  setTimeout(() => {
    runInternetBenchmarkCycle().catch(err =>
      logger.error("[InternetBenchmark] Initial cycle failed", { err: String(err).slice(0, 200) })
    );
  }, INITIAL_DELAY_MS);

  benchmarkTimer = setInterval(() => {
    runInternetBenchmarkCycle().catch(err =>
      logger.error("[InternetBenchmark] Scheduled cycle failed", { err: String(err).slice(0, 200) })
    );
  }, CYCLE_MS);

  return benchmarkTimer;
}
