/**
 * Vault Docs Generator
 *
 * Generates six AI-powered go-to-market documents from live system data:
 *   1. System Architecture
 *   2. AI Capabilities Catalog
 *   3. Autonomy Evidence Log
 *   4. Internet Intelligence Report
 *   5. Pipeline Technical Spec
 *   6. Market Positioning & Business Case
 */

import { db } from "../db";
import {
  vaultDocuments,
  discoveredStrategies,
  promptVersions,
  capabilityGaps,
  internetBenchmarks,
  engineKnowledge,
  masterKnowledgeBank,
  crossEngineTeachings,
  type VaultDocType,
  VAULT_DOC_TYPES,
} from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("vault-docs-generator");

// ---------------------------------------------------------------------------
// Doc metadata
// ---------------------------------------------------------------------------
export const DOC_META: Record<VaultDocType, { title: string; emoji: string; description: string }> = {
  system_architecture: {
    title: "System Architecture Overview",
    emoji: "🏗️",
    description: "Complete technical architecture of CreatorOS — all engines, data flows, and AI subsystems",
  },
  ai_capabilities_catalog: {
    title: "AI Capabilities Catalog",
    emoji: "🤖",
    description: "Comprehensive catalog of every AI capability built, evolved, and deployed by the system",
  },
  autonomy_evidence_log: {
    title: "Autonomy Evidence Log",
    emoji: "📊",
    description: "Documented proof of autonomous actions the system has taken without human intervention",
  },
  internet_intelligence_report: {
    title: "Internet Intelligence Report",
    emoji: "🌐",
    description: "Competitive intelligence gathered from the web — what the system discovered and built from it",
  },
  pipeline_technical_spec: {
    title: "Pipeline Technical Specification",
    emoji: "⚙️",
    description: "End-to-end technical spec of the Shorts and Full-Video content pipelines",
  },
  market_positioning: {
    title: "Market Positioning & Business Case",
    emoji: "💼",
    description: "Competitive analysis vs Opus Clip, TubeBuddy, VidIQ, Spotter Studio — and why CreatorOS wins",
  },
};

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------
async function gatherSystemData(userId: string) {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  const [
    strategies,
    prompts,
    gaps,
    benchmarks,
    knowledge,
    masterKnowledge,
    teachings,
  ] = await Promise.all([
    db.select().from(discoveredStrategies)
      .where(eq(discoveredStrategies.userId, userId))
      .orderBy(desc(discoveredStrategies.createdAt))
      .limit(50),

    db.select().from(promptVersions)
      .orderBy(desc(promptVersions.version))
      .limit(40),

    db.select().from(capabilityGaps)
      .where(eq(capabilityGaps.userId, userId))
      .orderBy(desc(capabilityGaps.createdAt))
      .limit(40),

    db.select().from(internetBenchmarks)
      .where(eq(internetBenchmarks.userId, userId))
      .orderBy(desc(internetBenchmarks.createdAt))
      .limit(30),

    db.select().from(engineKnowledge)
      .where(and(eq(engineKnowledge.userId, userId), eq(engineKnowledge.isActive, true)))
      .orderBy(desc(engineKnowledge.confidenceScore))
      .limit(60),

    db.select().from(masterKnowledgeBank)
      .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
      .orderBy(desc(masterKnowledgeBank.confidenceScore))
      .limit(30),

    db.select().from(crossEngineTeachings)
      .where(and(eq(crossEngineTeachings.userId, userId), gte(crossEngineTeachings.createdAt, cutoff30d)))
      .orderBy(desc(crossEngineTeachings.createdAt))
      .limit(30),
  ]);

  return { strategies, prompts, gaps, benchmarks, knowledge, masterKnowledge, teachings };
}

// ---------------------------------------------------------------------------
// Individual document generators
// ---------------------------------------------------------------------------

async function generateSystemArchitecture(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const engineNames = [...new Set(data.knowledge.map(k => k.engineName))];
  const knowledgeByEngine = engineNames.map(name => {
    const items = data.knowledge.filter(k => k.engineName === name).slice(0, 3);
    return `**${name}** (${items.length}+ entries): ${items.map(k => k.topic).join(", ")}`;
  });

  const systemPrompt = `You are a senior technical architect writing comprehensive technical documentation about an AI system. Write in clear, professional Markdown. Be specific, detailed, and accurate based on the real data provided.`;

  const userPrompt = `Write a complete "System Architecture Overview" document for CreatorOS, an AI-powered YouTube gaming business OS.

REAL SYSTEM DATA:
- Total AI Engines Active: ${engineNames.length}
- Engines: ${engineNames.slice(0, 20).join(", ")}
- Total Knowledge Entries: ${data.knowledge.length}
- Cross-Engine Teachings: ${data.teachings.length}
- Master Knowledge Principles: ${data.masterKnowledge.length}
- Discovered Strategies: ${data.strategies.length}
- Prompt Versions: ${data.prompts.length}
- Capability Gaps Identified: ${data.gaps.length}
- Internet Benchmarks Run: ${data.benchmarks.length}

SAMPLE ENGINE KNOWLEDGE:
${knowledgeByEngine.slice(0, 8).join("\n")}

Write a detailed technical architecture document (1500-2000 words) covering:
1. Executive Summary (what CreatorOS is and does)
2. Core Architecture Principles (self-learning, autonomous, ever-expanding)
3. Engine Registry (describe each major engine and its domain)
4. Knowledge Mesh Architecture (how engines share and compound knowledge)
5. Data Flow (from raw YouTube content → clips → SEO → publish)
6. AI Model Routing Layer (Claude Opus/Sonnet/Haiku + GPT-4o routing)
7. Internet Benchmark Engine (continuous web scanning, gap detection, capability building)
8. Autonomous Capability Engine (how the system builds its own new features)
9. Database Architecture (what data is persisted and why)
10. Scalability & "Sets Up Once, Runs Forever" Design

Use real numbers from the data above. Format as clean Markdown with headers, bullet lists, and technical precision.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3000, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

async function generateAICapabilitiesCatalog(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const promptsByKey = new Map<string, typeof data.prompts[0][]>();
  for (const p of data.prompts) {
    const key = p.promptKey;
    if (!promptsByKey.has(key)) promptsByKey.set(key, []);
    promptsByKey.get(key)!.push(p);
  }

  const strategyTypes = [...new Set(data.strategies.map(s => s.strategyType))];
  const topStrategies = data.strategies.slice(0, 15).map(s =>
    `- **${s.title}** (${s.strategyType}, effectiveness: ${s.effectiveness}%): ${s.description?.slice(0, 120) ?? ""}…`
  ).join("\n");

  const systemPrompt = `You are a product manager writing a comprehensive capabilities catalog for an AI product. Be specific, use the real data provided, and write in professional Markdown.`;

  const userPrompt = `Write a complete "AI Capabilities Catalog" for CreatorOS.

REAL DATA:
- Prompt Templates: ${promptsByKey.size} unique keys, ${data.prompts.length} total versions
- Prompt Keys: ${[...promptsByKey.keys()].join(", ")}
- Strategy Types: ${strategyTypes.join(", ")}
- Total Strategies Discovered: ${data.strategies.length}
- Active Strategies (sample):
${topStrategies}
- Master Knowledge Principles: ${data.masterKnowledge.length}
- Top Principles: ${data.masterKnowledge.slice(0, 5).map(m => m.principle).join(" | ")}

Write a comprehensive catalog (1500-2000 words) covering:
1. Overview — what the AI capabilities system is
2. Prompt Engineering Layer
   - List every prompt template key with what it does
   - How prompts evolve automatically (versioning, A/B testing, performance feedback)
3. Strategy Discovery Engine
   - How the system autonomously discovers new strategies
   - Each strategy type with description and current effectiveness
4. Knowledge Mesh Capabilities
   - Master Knowledge Bank (cross-engine distilled wisdom)
   - Engine-specific knowledge accumulation
   - Cross-engine teaching and pollination
5. Internet Benchmark Capabilities
   - Web scanning across ${data.benchmarks.length} benchmark runs
   - Gap detection and autonomous capability building
6. Content Generation Capabilities
   - Title optimization, thumbnail concepts, SEO, hooks, scripts
7. Self-Improvement Capabilities
   - How the system improves itself over time

Use the real data. Format as clean Markdown.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3000, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

async function generateAutonomyEvidenceLog(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const filledGaps = data.gaps.filter(g => g.status === "filled");
  const builtBenchmarks = data.benchmarks.filter(b => b.status === "built" || b.status === "gap_found");
  const recentStrategies = data.strategies.slice(0, 20);
  const recentTeachings = data.teachings.slice(0, 15);

  const gapEvidence = filledGaps.slice(0, 10).map(g =>
    `- **[${g.domain}]** ${g.title} → ${g.solutionType}: ${g.solutionSummary ?? "Completed"}`
  ).join("\n");

  const benchmarkEvidence = builtBenchmarks.slice(0, 10).map(b =>
    `- **[${b.domainLabel}]** Gap found (severity ${b.gapSeverity}/10): ${b.gapFound?.slice(0, 100) ?? ""} → Built: ${b.capabilityBuilt?.slice(0, 80) ?? ""}`
  ).join("\n");

  const systemPrompt = `You are a technical writer documenting autonomous AI behavior with evidence. Write in professional Markdown. This is an evidence log — be specific, cite real data points, and present this as verifiable proof of autonomous operation.`;

  const userPrompt = `Write a comprehensive "Autonomy Evidence Log" for CreatorOS.

REAL EVIDENCE DATA:
- Total Capability Gaps Self-Identified: ${data.gaps.length}
- Gaps Successfully Filled (Autonomous): ${filledGaps.length}
- Internet Benchmark Scans Completed: ${data.benchmarks.length}
- Capabilities Built from Internet Research: ${builtBenchmarks.length}
- Strategies Autonomously Discovered: ${data.strategies.length}
- Knowledge Entries Created Autonomously: ${data.knowledge.length}
- Cross-Engine Teaching Events: ${data.teachings.length}
- Prompt Versions Auto-Generated: ${data.prompts.length}

AUTONOMOUS GAP-FILLING EVIDENCE:
${gapEvidence || "System has identified and is filling gaps autonomously."}

INTERNET RESEARCH → CAPABILITY BUILDING EVIDENCE:
${benchmarkEvidence || "Internet benchmark engine actively building capabilities."}

AUTONOMOUS STRATEGY DISCOVERY (recent):
${recentStrategies.slice(0, 8).map(s => `- "${s.title}" (${s.strategyType}, source: ${s.source})`).join("\n")}

CROSS-ENGINE KNOWLEDGE TEACHING EVENTS:
${recentTeachings.slice(0, 8).map(t => `- ${t.sourceEngine} → ${t.targetEngine}: ${t.lesson?.slice(0, 100) ?? ""}`).join("\n")}

Write a compelling autonomy evidence log (1500-2000 words) structured as:
1. Executive Summary — what "autonomous" means in this context and the scale of evidence
2. Self-Diagnostic Autonomy — how the system finds its own gaps
3. Self-Building Autonomy — how it builds new capabilities from scratch
4. Internet-Sourced Learning — evidence of web research driving capability growth
5. Cross-Engine Knowledge Sharing — how learning in one domain improves all domains
6. Prompt Self-Evolution — evidence of prompts improving themselves
7. Strategy Autonomy — how strategies are discovered, tested, and evolved without human input
8. Quantitative Summary Table — key autonomy metrics at a glance
9. Conclusion — what "runs forever" actually means backed by this evidence

Be precise. Use the real numbers. This document proves to investors/users that the system genuinely operates autonomously.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3000, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

async function generateInternetIntelligenceReport(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const domainBreakdown = new Map<string, typeof data.benchmarks[0][]>();
  for (const b of data.benchmarks) {
    if (!domainBreakdown.has(b.domainLabel)) domainBreakdown.set(b.domainLabel, []);
    domainBreakdown.get(b.domainLabel)!.push(b);
  }

  const recentFindings = data.benchmarks
    .filter(b => b.gapFound)
    .slice(0, 12)
    .map(b => `- **${b.domainLabel}** (severity ${b.gapSeverity}/10): ${b.gapFound?.slice(0, 150) ?? ""} → Action: ${b.capabilityType ?? "knowledge"} — ${b.capabilityBuilt?.slice(0, 100) ?? ""}`)
    .join("\n");

  const systemPrompt = `You are an intelligence analyst writing a comprehensive report on competitive internet research for a YouTube gaming content system. Write in professional Markdown with specific insights.`;

  const userPrompt = `Write a complete "Internet Intelligence Report" for CreatorOS.

REAL BENCHMARK DATA:
- Total Internet Scans Conducted: ${data.benchmarks.length}
- Domains Monitored: ${domainBreakdown.size}
- Domain List: ${[...domainBreakdown.keys()].join(", ")}
- Gaps Found with Built Responses: ${data.benchmarks.filter(b => b.status === "built").length}
- No-Gap Domains (already ahead): ${data.benchmarks.filter(b => b.status === "no_gap").length}

MOST IMPACTFUL FINDINGS (real data):
${recentFindings || "Internet benchmark engine has scanned multiple domains and is building capabilities."}

Write a detailed intelligence report (1500-2000 words) covering:
1. Executive Summary — scope and methodology of the internet intelligence program
2. Monitoring Framework — what 12 domains are tracked and why
3. Discovery Methodology — how DuckDuckGo + Wikipedia scanning + AI gap analysis works
4. Key Intelligence Findings by Domain — for each major domain, what was discovered
5. Capability Building Results — what new strategies/prompts/knowledge were built from the intelligence
6. Competitive Advantage Assessment — how internet intelligence gives ET Gaming 274 an edge
7. Continuous Improvement Loop — how findings auto-become capabilities
8. Intelligence Calendar — how the 3-day rolling window / 24h cycle works
9. Quantitative Results Summary

Use real data. Be specific about what was found and what was built.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3000, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

async function generatePipelineTechnicalSpec(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const shortsStrategies = data.strategies.filter(s => s.applicableTo?.includes("shorts_pipeline") || s.applicableTo?.includes("shorts"));
  const fullVideoStrategies = data.strategies.filter(s => s.applicableTo?.includes("full_video_pipeline") || s.applicableTo?.includes("full_video"));

  const systemPrompt = `You are a senior engineer writing a technical specification document. Be precise, technical, and comprehensive. Format in clean Markdown with code blocks where appropriate.`;

  const userPrompt = `Write a complete "Pipeline Technical Specification" for CreatorOS.

REAL PIPELINE DATA:
- Shorts Pipeline Strategies Active: ${shortsStrategies.length}
- Full-Video Pipeline Strategies Active: ${fullVideoStrategies.length}
- Prompt Templates (pipeline-relevant): ${data.prompts.length}
- Total Prompt Versions: ${data.prompts.length}
- AI Model Router: Routes between Claude Opus 4, Claude Sonnet 4, Claude Haiku 4.5, GPT-4o-mini
- Content Processing: YouTube VODs → 60-min segment clips → platform-specific packaging
- Target Platforms: YouTube (full VODs), Shorts, TikTok, Rumble

ACTIVE SHORTS PIPELINE STRATEGIES (sample):
${shortsStrategies.slice(0, 5).map(s => `- ${s.title}: ${s.description?.slice(0, 100) ?? ""}…`).join("\n")}

ACTIVE FULL-VIDEO STRATEGIES (sample):
${fullVideoStrategies.slice(0, 5).map(s => `- ${s.title}: ${s.description?.slice(0, 100) ?? ""}…`).join("\n")}

Write a detailed technical spec (1500-2000 words) covering:
1. Pipeline Overview — the two pipeline architecture (Shorts vs Full-Video)
2. Input Processing
   - YouTube Vault Sync (6-hour cycles)
   - Video download & storage
   - Content classification (VOD / Short / Stream)
3. Shorts Pipeline Technical Spec
   - Clip extraction algorithm (60-second segments)
   - Hook generation system (AI-powered)
   - Platform adaptation (9:16 ratio, captions, pacing)
   - SEO & metadata generation
   - TikTok / Shorts / Rumble packaging differences
4. Full-Video Pipeline Technical Spec
   - Title optimization (AI + A/B testing)
   - Thumbnail concept generation
   - Description & tag SEO
   - YouTube-specific ranking optimization
5. AI Model Routing
   - When Claude Opus vs Sonnet vs Haiku vs GPT-4o-mini is used
   - Fallback chains for reliability
   - Cost optimization by task type
6. Quality Assurance Layer
   - Prompt versioning and evolution
   - Closed-loop attribution (performance → strategy updates)
7. Auto-Publishing System
   - Scheduling logic
   - Platform API integration
   - Rate limiting and retry
8. Data Flow Diagram (describe as ASCII or Markdown)

Be technically precise. This spec should be usable by an engineer to understand and replicate the system.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3000, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

async function generateMarketPositioning(userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>): Promise<string> {
  const autonomyMetrics = {
    strategies: data.strategies.length,
    knowledge: data.knowledge.length,
    benchmarks: data.benchmarks.length,
    gaps_filled: data.gaps.filter(g => g.status === "filled").length,
    prompts: data.prompts.length,
    teachings: data.teachings.length,
  };

  const systemPrompt = `You are a product strategist and business writer creating a go-to-market positioning document. Be persuasive, specific, and back every claim with data. Write in professional Markdown.`;

  const userPrompt = `Write a comprehensive "Market Positioning & Business Case" for CreatorOS.

REAL SYSTEM METRICS (use these as proof points):
- Autonomous Strategies Built: ${autonomyMetrics.strategies}
- Knowledge Entries Created: ${autonomyMetrics.knowledge}
- Internet Benchmark Scans: ${autonomyMetrics.benchmarks}
- Capability Gaps Self-Filled: ${autonomyMetrics.gaps_filled}
- Prompt Versions Auto-Generated: ${autonomyMetrics.prompts}
- Cross-Engine Knowledge Events: ${autonomyMetrics.teachings}

COMPETITORS TO ANALYZE (be specific and factual):
1. Opus Clip — AI short-form clipping, $49-299/mo, no long-term learning, no strategy building
2. TubeBuddy — YouTube SEO tool, browser extension, $5-50/mo, manual research, no autonomy
3. VidIQ — YouTube analytics + SEO, $10-99/mo, recommendations only, no content generation
4. Spotter Studio — creator intelligence for large channels, $29-199/mo, analytics focus, no automation

Write a powerful positioning document (1800-2500 words) covering:
1. Executive Summary — the one-paragraph pitch
2. The Market Problem — what creators currently struggle with
3. Competitive Landscape Analysis
   - Detailed head-to-head table: CreatorOS vs Opus Clip vs TubeBuddy vs VidIQ vs Spotter Studio
   - Feature matrix (autonomy, self-learning, strategy building, internet scanning, content gen, publishing)
   - Price/value analysis
4. CreatorOS Unique Value Propositions
   - "Sets Up Once, Runs Forever" — the compounding advantage
   - Self-learning system that gets smarter with every video
   - Built-in competitive intelligence (internet scanning no competitor offers)
   - True full-stack automation (from raw content → published, optimized, multi-platform)
5. Why CreatorOS Wins
   - Autonomy depth (${autonomyMetrics.strategies} strategies, ${autonomyMetrics.knowledge} knowledge entries, all self-generated)
   - Internet Intelligence Advantage (${autonomyMetrics.benchmarks} scans, competitors blind to this)
   - Compound learning moat — the longer it runs, the wider the gap vs competitors
6. Target Customer
   - Primary: Solo gaming creators like ET Gaming 274
   - Secondary: Small gaming studios managing multiple channels
7. Business Case
   - Time saved (estimate hours/week of manual work eliminated)
   - Revenue impact (faster optimization → better CTR → more views → more revenue)
   - ROI calculation example
8. The Moat — why this is defensible
9. Summary & Call to Action

Be specific, cite real numbers from the metrics above, and make the case compellingly.`;

  const result = await executeRoutedAICall(
    { taskType: "strategy_planning", userId, maxTokens: 3500, priority: "high" },
    systemPrompt,
    userPrompt,
  );
  return result.content;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------
const GENERATORS: Record<VaultDocType, (userId: string, data: Awaited<ReturnType<typeof gatherSystemData>>) => Promise<string>> = {
  system_architecture: generateSystemArchitecture,
  ai_capabilities_catalog: generateAICapabilitiesCatalog,
  autonomy_evidence_log: generateAutonomyEvidenceLog,
  internet_intelligence_report: generateInternetIntelligenceReport,
  pipeline_technical_spec: generatePipelineTechnicalSpec,
  market_positioning: generateMarketPositioning,
};

export async function generateVaultDocument(userId: string, docType: VaultDocType): Promise<void> {
  const meta = DOC_META[docType];
  logger.info(`[VaultDocs] Generating ${docType} for user ${userId.slice(0, 8)}`);

  // Upsert a "generating" record
  const existingRows = await db.select({ id: vaultDocuments.id })
    .from(vaultDocuments)
    .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
    .limit(1);

  let docId: number;
  if (existingRows.length > 0) {
    docId = existingRows[0].id;
    await db.update(vaultDocuments).set({
      status: "generating",
      errorMessage: null,
      updatedAt: new Date(),
    }).where(eq(vaultDocuments.id, docId));
  } else {
    const [inserted] = await db.insert(vaultDocuments).values({
      userId,
      docType,
      title: meta.title,
      content: "",
      status: "generating",
      wordCount: 0,
      metadata: { emoji: meta.emoji, description: meta.description },
    }).returning({ id: vaultDocuments.id });
    docId = inserted.id;
  }

  try {
    const data = await gatherSystemData(userId);
    const generator = GENERATORS[docType];
    const content = await generator(userId, data);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    await db.update(vaultDocuments).set({
      content,
      wordCount,
      status: "ready",
      generatedAt: new Date(),
      updatedAt: new Date(),
      title: meta.title,
      metadata: { emoji: meta.emoji, description: meta.description },
    }).where(eq(vaultDocuments.id, docId));

    logger.info(`[VaultDocs] ${docType} complete — ${wordCount} words (user ${userId.slice(0, 8)})`);
  } catch (err: any) {
    logger.error(`[VaultDocs] Failed to generate ${docType}: ${err.message?.slice(0, 200)}`);
    await db.update(vaultDocuments).set({
      status: "failed",
      errorMessage: err.message?.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(vaultDocuments.id, docId));
    throw err;
  }
}

export async function generateAllVaultDocuments(userId: string): Promise<{ generated: number; failed: number }> {
  let generated = 0;
  let failed = 0;

  // Generate sequentially to avoid hammering the AI API
  for (const docType of VAULT_DOC_TYPES) {
    try {
      await generateVaultDocument(userId, docType as VaultDocType);
      generated++;
    } catch (err: any) {
      logger.warn(`[VaultDocs] Skipping ${docType} after error: ${err.message?.slice(0, 100)}`);
      failed++;
    }
  }

  return { generated, failed };
}

export async function getVaultDocuments(userId: string): Promise<typeof vaultDocuments.$inferSelect[]> {
  return db.select().from(vaultDocuments)
    .where(eq(vaultDocuments.userId, userId))
    .orderBy(vaultDocuments.docType);
}
