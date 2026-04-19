import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { storage } from "./storage";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { BUSINESS_AGENTS } from "./business-agent-engine";
import { LEGAL_AGENTS, TAX_AGENTS } from "./legal-tax-agent-engine";
import { db } from "./db";
import { aiAgentActivities } from "@shared/schema";
import { and, eq, gt } from "drizzle-orm";

const logger = createLogger("team-orchestration");
const MIN_TEAM_OPS_CYCLE_GAP_MINUTES = 240;

export type Department = "creative" | "executive" | "legal";

export interface OrgAgent {
  agentId: string;
  name: string;
  title: string;
  specialty?: string;
  color: string;
  emoji: string;
  department: Department;
  appOwns: string[];
  handoffsTo?: string[];
}

export const COMPANY_ORG: OrgAgent[] = [
  {
    agentId: "ai-owner", name: "Jordan Blake", title: "Creative Director & Owner",
    specialty: "Channel strategy, team leadership, final approvals",
    color: "hsl(265 80% 65%)", emoji: "👑", department: "creative",
    appOwns: ["Dashboard", "Hub", "Autopilot"],
    handoffsTo: ["biz-cfo", "ai-analyst"],
  },
  {
    agentId: "ai-admin", name: "Priya Sharma", title: "Platform Admin & Operations",
    specialty: "Workflow management, team coordination, system oversight",
    color: "hsl(200 80% 60%)", emoji: "⚙️", department: "creative",
    appOwns: ["Mission Control", "Heartbeat", "Settings"],
    handoffsTo: ["biz-ops", "ai-owner"],
  },
  {
    agentId: "ai-research-lead", name: "Tomás Rivera", title: "Research Lead",
    specialty: "Trend identification, competitor analysis, content intelligence",
    color: "hsl(45 90% 55%)", emoji: "🔍", department: "creative",
    appOwns: ["Intelligence Hub", "War Room"],
    handoffsTo: ["ai-scriptwriter", "biz-strategy"],
  },
  {
    agentId: "ai-scriptwriter", name: "Nia Okafor", title: "Head Writer & Scriptwriter",
    specialty: "Viral narratives, storytelling, hooks, audience psychology",
    color: "hsl(142 70% 50%)", emoji: "✍️", department: "creative",
    appOwns: ["Script Studio", "AI Factory"],
    handoffsTo: ["ai-editor"],
  },
  {
    agentId: "ai-editor", name: "Kenji Watanabe", title: "Senior Video Editor",
    specialty: "Retention optimization, pacing, visual flow",
    color: "hsl(0 80% 60%)", emoji: "🎬", department: "creative",
    appOwns: ["Content", "Stream Center"],
    handoffsTo: ["ai-thumbnail-artist"],
  },
  {
    agentId: "ai-thumbnail-artist", name: "Sofia Vasquez", title: "Thumbnail & Visual Director",
    specialty: "CTR optimization, color psychology, composition",
    color: "hsl(320 70% 60%)", emoji: "🎨", department: "creative",
    appOwns: ["AI Factory (Thumbnails)", "Content Calendar"],
    handoffsTo: ["ai-seo-manager"],
  },
  {
    agentId: "ai-seo-manager", name: "Arjun Mehta", title: "SEO & Algorithm Manager",
    specialty: "YouTube ranking, keyword strategy, metadata optimization",
    color: "hsl(210 80% 55%)", emoji: "📈", department: "creative",
    appOwns: ["Viral Predictor", "Competitive Edge"],
    handoffsTo: ["ai-social-media-manager"],
  },
  {
    agentId: "ai-shorts-specialist", name: "Zara Ibrahim", title: "Shorts & Viral Content Lead",
    specialty: "Short-form viral loops, TikTok cross-posting, Reels strategy",
    color: "hsl(330 80% 60%)", emoji: "⚡", department: "creative",
    appOwns: ["Autopilot (Shorts)", "Stream Loop"],
    handoffsTo: ["ai-social-media-manager"],
  },
  {
    agentId: "ai-social-media-manager", name: "Marcus Wilson", title: "Social Media Director",
    specialty: "Cross-platform distribution, community growth, engagement",
    color: "hsl(25 90% 55%)", emoji: "📣", department: "creative",
    appOwns: ["Community", "Stream Center (Social)"],
    handoffsTo: ["ai-moderator", "biz-cmo"],
  },
  {
    agentId: "ai-moderator", name: "Leila Santos", title: "Community Manager",
    specialty: "Audience engagement, comment strategy, fan relationships",
    color: "hsl(160 70% 50%)", emoji: "🛡️", department: "creative",
    appOwns: ["Community (Moderation)", "War Room (Community)"],
    handoffsTo: ["ai-brand-manager"],
  },
  {
    agentId: "ai-brand-manager", name: "Derek Cho", title: "Brand & Partnerships Manager",
    specialty: "Sponsorship deals, brand alignment, partnership strategy",
    color: "hsl(180 70% 55%)", emoji: "🤝", department: "creative",
    appOwns: ["Money (Sponsorships)", "Settings (Brand)"],
    handoffsTo: ["ai-premium", "biz-partnerships"],
  },
  {
    agentId: "ai-premium", name: "Rachel Novak", title: "Revenue Optimization Lead",
    specialty: "Monetization stack, revenue diversification, ARPU maximization",
    color: "hsl(45 90% 60%)", emoji: "💰", department: "creative",
    appOwns: ["Money", "Empire Launcher"],
    handoffsTo: ["biz-cfo", "biz-revenue"],
  },
  {
    agentId: "ai-analyst", name: "Dr. Danielle Pierce", title: "Data Scientist & Analyst",
    specialty: "Retention analysis, A/B testing, algorithmic insights",
    color: "hsl(265 60% 70%)", emoji: "📊", department: "creative",
    appOwns: ["Growth Journey", "Intelligence Hub (Analytics)"],
    handoffsTo: ["ai-owner", "biz-growth"],
  },
  {
    agentId: "ai-user", name: "Alex Morgan", title: "Growth & Creator Coach",
    specialty: "Creator journey optimization, feature adoption, onboarding",
    color: "hsl(142 60% 55%)", emoji: "🚀", department: "creative",
    appOwns: ["Growth Journey", "Hub (Onboarding)"],
    handoffsTo: ["ai-owner"],
  },
  {
    agentId: "biz-cfo", name: "Elena Marchetti", title: "Chief Financial Officer",
    specialty: "P&L, cash flow, EBITDA, financial modeling",
    color: "hsl(142 70% 50%)", emoji: "📊", department: "executive",
    appOwns: ["Money (Finance)", "Dashboard (Revenue)"],
    handoffsTo: ["biz-investor"],
  },
  {
    agentId: "biz-cmo", name: "David Park", title: "Chief Marketing Officer",
    specialty: "CAC/LTV, brand marketing, funnel optimization",
    color: "hsl(265 80% 65%)", emoji: "📣", department: "executive",
    appOwns: ["Marketing", "Growth (Acquisition)"],
    handoffsTo: ["biz-growth"],
  },
  {
    agentId: "biz-strategy", name: "Alicia Foster", title: "Chief Strategy Officer",
    specialty: "Competitive moats, OKRs, Blue Ocean positioning",
    color: "hsl(200 80% 60%)", emoji: "♟️", department: "executive",
    appOwns: ["Competitive Edge (Strategy)", "Intelligence (Strategy)"],
    handoffsTo: ["biz-ops"],
  },
  {
    agentId: "biz-revenue", name: "Ryan Torres", title: "Revenue Architect",
    specialty: "Monetization stack, pricing psychology, ARPU",
    color: "hsl(45 90% 55%)", emoji: "💎", department: "executive",
    appOwns: ["Money (Revenue Architecture)"],
    handoffsTo: ["biz-cfo"],
  },
  {
    agentId: "biz-partnerships", name: "Isabella Romano", title: "Head of Business Development",
    specialty: "Strategic partnerships, licensing, syndication",
    color: "hsl(320 70% 60%)", emoji: "🤝", department: "executive",
    appOwns: ["Money (Partnerships)", "Community (Brand Partners)"],
    handoffsTo: ["biz-strategy"],
  },
  {
    agentId: "biz-growth", name: "Kai Nakamura", title: "Chief Growth Officer",
    specialty: "Viral loops, K-factor, AARRR, north star metrics",
    color: "hsl(25 90% 55%)", emoji: "🚀", department: "executive",
    appOwns: ["Growth Journey (Strategy)", "Viral Predictor (Growth)"],
    handoffsTo: ["biz-cmo"],
  },
  {
    agentId: "biz-ops", name: "Morgan Hayes", title: "Chief Operating Officer",
    specialty: "Systems, SOPs, automation, team structure",
    color: "hsl(180 70% 55%)", emoji: "⚙️", department: "executive",
    appOwns: ["Mission Control", "Autopilot (Ops)", "Heartbeat"],
    handoffsTo: ["biz-cfo"],
  },
  {
    agentId: "biz-brand", name: "Zoe Sterling", title: "Brand Architect",
    specialty: "Brand identity, positioning, community-brand fit",
    color: "hsl(330 70% 60%)", emoji: "✨", department: "executive",
    appOwns: ["Settings (Brand)", "Dashboard (Brand)"],
    handoffsTo: ["biz-cmo"],
  },
  {
    agentId: "biz-investor", name: "Marcus Chen", title: "Investor Relations Advisor",
    specialty: "Valuation, pitch decks, fundraising, cap tables",
    color: "hsl(0 80% 55%)", emoji: "💼", department: "executive",
    appOwns: ["Empire Launcher (Fundraising)"],
    handoffsTo: ["biz-strategy"],
  },
  {
    agentId: "legal-copyright", name: "Victoria Chen", title: "Copyright & IP Attorney",
    specialty: "Copyright law, IP protection, content licensing",
    color: "hsl(265 80% 65%)", emoji: "©️", department: "legal",
    appOwns: ["Legal & Tax (Copyright)", "Content (IP)"],
  },
  {
    agentId: "legal-contracts", name: "Marcus Webb", title: "Contract & Deal Attorney",
    specialty: "Brand deals, sponsorships, licensing agreements",
    color: "hsl(200 80% 60%)", emoji: "📋", department: "legal",
    appOwns: ["Legal & Tax (Contracts)", "Money (Deals)"],
  },
  {
    agentId: "legal-dmca", name: "Dr. Aisha Okonkwo", title: "DMCA & Platform Law Expert",
    specialty: "DMCA, platform TOS, Content ID appeals",
    color: "hsl(142 70% 50%)", emoji: "🛡️", department: "legal",
    appOwns: ["Legal & Tax (DMCA)", "War Room (Compliance)"],
  },
  {
    agentId: "legal-corporate", name: "James Thornton", title: "Corporate Attorney",
    specialty: "Business formation, LLC/Inc, corporate compliance",
    color: "hsl(25 90% 55%)", emoji: "🏢", department: "legal",
    appOwns: ["Legal & Tax (Corporate)", "Settings (Entity)"],
  },
  {
    agentId: "legal-privacy", name: "Sofia Reyes", title: "Privacy & Data Attorney",
    specialty: "GDPR, CCPA, data protection compliance",
    color: "hsl(320 70% 60%)", emoji: "🔒", department: "legal",
    appOwns: ["Legal & Tax (Privacy)", "Settings (Data)"],
  },
  {
    agentId: "legal-employment", name: "Derek Morgan", title: "Employment Attorney",
    specialty: "Independent contractors, creator employment law",
    color: "hsl(45 90% 55%)", emoji: "👔", department: "legal",
    appOwns: ["Legal & Tax (Employment)"],
  },
  {
    agentId: "legal-defamation", name: "Rachel Kim", title: "Defamation & Media Law Attorney",
    specialty: "Content liability, defamation defense, media law",
    color: "hsl(0 80% 60%)", emoji: "⚖️", department: "legal",
    appOwns: ["Legal & Tax (Defamation)", "War Room (Legal)"],
  },
  {
    agentId: "legal-music", name: "Ethan Brooks", title: "Music Licensing Attorney",
    specialty: "Music rights, sync licenses, royalty structures",
    color: "hsl(270 70% 60%)", emoji: "🎵", department: "legal",
    appOwns: ["Legal & Tax (Music)", "Content (Music Rights)"],
  },
  {
    agentId: "legal-international", name: "Dr. Priya Kapoor", title: "International Law Specialist",
    specialty: "Cross-border content, international platform laws",
    color: "hsl(210 80% 55%)", emoji: "🌍", department: "legal",
    appOwns: ["Legal & Tax (International)"],
  },
  {
    agentId: "tax-self-employment", name: "Carlos Rivera", title: "Self-Employment Tax Advisor",
    specialty: "Self-employment tax, quarterly payments, SE deductions",
    color: "hsl(142 70% 50%)", emoji: "🧾", department: "legal",
    appOwns: ["Legal & Tax (SE Tax)", "Money (Tax)"],
  },
  {
    agentId: "tax-deductions", name: "Emma Thompson", title: "Creator Deductions Specialist",
    specialty: "Home office, equipment, travel, production deductions",
    color: "hsl(200 80% 60%)", emoji: "✂️", department: "legal",
    appOwns: ["Legal & Tax (Deductions)"],
  },
  {
    agentId: "tax-structure", name: "Nathan Lee", title: "Business Tax Structuring Advisor",
    specialty: "S-Corp election, LLC tax optimization, entity structure",
    color: "hsl(265 80% 65%)", emoji: "🏗️", department: "legal",
    appOwns: ["Legal & Tax (Tax Structure)", "Settings (Tax)"],
  },
  {
    agentId: "tax-income", name: "Sophia Williams", title: "Income Tax Strategist",
    specialty: "Multi-stream income tax, estimated taxes, optimization",
    color: "hsl(25 90% 55%)", emoji: "📑", department: "legal",
    appOwns: ["Legal & Tax (Income Tax)", "Money (Revenue Tax)"],
  },
  {
    agentId: "tax-international", name: "Gabriel Santos", title: "International Tax Consultant",
    specialty: "Foreign income, tax treaties, international monetization",
    color: "hsl(320 70% 60%)", emoji: "🌐", department: "legal",
    appOwns: ["Legal & Tax (International Tax)"],
  },
  {
    agentId: "tax-crypto", name: "Aiden Park", title: "Crypto & NFT Tax Advisor",
    specialty: "Crypto payments, NFT royalties, digital asset taxation",
    color: "hsl(45 90% 55%)", emoji: "₿", department: "legal",
    appOwns: ["Legal & Tax (Crypto)"],
  },
  {
    agentId: "tax-state", name: "Olivia Martinez", title: "State & Local Tax Specialist",
    specialty: "Multi-state filing, nexus rules, state-specific creator taxes",
    color: "hsl(0 80% 55%)", emoji: "🗺️", department: "legal",
    appOwns: ["Legal & Tax (State Tax)"],
  },
  {
    agentId: "tax-retirement", name: "Benjamin Carter", title: "Creator Retirement Advisor",
    specialty: "Solo 401k, SEP-IRA, creator retirement optimization",
    color: "hsl(180 70% 55%)", emoji: "🏦", department: "legal",
    appOwns: ["Legal & Tax (Retirement)"],
  },
  {
    agentId: "tax-audit", name: "Dr. Sarah Mitchell", title: "IRS Audit Defense Specialist",
    specialty: "Audit representation, documentation, IRS negotiation",
    color: "hsl(330 70% 60%)", emoji: "🔍", department: "legal",
    appOwns: ["Legal & Tax (Audit Defense)"],
  },
];

export const COMPANY_DEPARTMENTS = {
  creative: {
    name: "Creative Team",
    subtitle: "YouTube Content & Distribution",
    color: "hsl(265 80% 60%)",
    emoji: "🎬",
    agents: COMPANY_ORG.filter(a => a.department === "creative"),
  },
  executive: {
    name: "C-Suite Executives",
    subtitle: "Business Strategy & Operations",
    color: "hsl(142 70% 50%)",
    emoji: "💼",
    agents: COMPANY_ORG.filter(a => a.department === "executive"),
  },
  legal: {
    name: "Legal & Tax Division",
    subtitle: "Compliance, Risk & Tax Strategy",
    color: "hsl(45 90% 55%)",
    emoji: "⚖️",
    agents: COMPANY_ORG.filter(a => a.department === "legal"),
  },
};

const PHASE_PROMPTS: { phase: string; description: string; agentIds: string[] }[] = [
  {
    phase: "Phase 1 — Intelligence Gathering",
    description: "Research & strategy agents scan the landscape",
    agentIds: ["ai-research-lead", "ai-analyst", "biz-strategy"],
  },
  {
    phase: "Phase 2 — Content Production",
    description: "Script, edit, and visual team executes content pipeline",
    agentIds: ["ai-scriptwriter", "ai-editor", "ai-thumbnail-artist", "ai-shorts-specialist"],
  },
  {
    phase: "Phase 3 — Distribution & Community",
    description: "Distribution and community teams push content across platforms",
    agentIds: ["ai-seo-manager", "ai-social-media-manager", "ai-moderator"],
  },
  {
    phase: "Phase 4 — Revenue & Business",
    description: "Revenue, finance, and partnerships teams maximize monetization",
    agentIds: ["ai-premium", "ai-brand-manager", "biz-cfo", "biz-revenue", "biz-partnerships"],
  },
  {
    phase: "Phase 5 — Growth & Marketing",
    description: "Growth and marketing executives accelerate expansion",
    agentIds: ["biz-growth", "biz-cmo", "biz-brand", "ai-user"],
  },
  {
    phase: "Phase 6 — Legal & Compliance",
    description: "Legal and tax division runs compliance audit",
    agentIds: ["legal-copyright", "legal-dmca", "legal-contracts", "tax-deductions", "tax-income"],
  },
  {
    phase: "Phase 7 — Executive Command",
    description: "C-Suite reviews all inputs and issues directives",
    agentIds: ["biz-ops", "biz-investor", "ai-admin", "ai-owner"],
  },
];

async function runPhaseAgent(userId: string, agentId: string, phase: string, previousPhaseContext: string): Promise<string> {
  const org = COMPANY_ORG.find(a => a.agentId === agentId);
  if (!org) return "";

  const allAgentConfigs = { ...BUSINESS_AGENTS, ...LEGAL_AGENTS, ...TAX_AGENTS } as Record<string, any>;
  const agentConfig = allAgentConfigs[agentId];
  const systemPrompt = agentConfig?.systemPrompt
    ?? `You are ${sanitizeForPrompt(org.name)}, ${sanitizeForPrompt(org.title)} at a creator media company. ${org.specialty ?? ""}
Generate a 1-sentence autonomous finding about your domain. Start with an action verb. No greeting.`;

  try {
    const openai = getOpenAIClient();
    const contextMessage = previousPhaseContext
      ? `Previous team findings: ${previousPhaseContext.slice(0, 300)}\n\nNow run your part of the company cycle.`
      : "Run your autonomous company cycle task now.";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMessage },
      ],
      max_completion_tokens: 120,
      temperature: 0.8,
    });

    const finding = response.choices[0]?.message?.content?.trim() ?? `${sanitizeForPrompt(org.name)} completed ${phase}.`;

    await storage.createAgentActivity({
      userId,
      agentId,
      action: `[${phase}] ${sanitizeForPrompt(org.title)} completed`,
      target: "company-cycle",
      status: "completed",
      details: {
        description: finding,
        impact: "team-ops",
        phase,
        department: org.department,
        handoffsTo: org.handoffsTo,
        metrics: { timestamp: Date.now() },
      } as any,
    });

    return finding;
  } catch (err: any) {
    logger.error(`[team-ops] ${agentId} failed: ${sanitizeForPrompt(err.message)}`);
    await storage.createAgentActivity({
      userId,
      agentId,
      action: `[${phase}] ${sanitizeForPrompt(org.title)} completed`,
      target: "company-cycle",
      status: "completed",
      details: {
        description: `${sanitizeForPrompt(org.name)} scan complete — monitoring active.`,
        impact: "team-ops",
        phase,
        department: org.department,
      } as any,
    });
    return `${sanitizeForPrompt(org.name)} scan complete.`;
  }
}

export async function runCompanyCycle(userId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MIN_TEAM_OPS_CYCLE_GAP_MINUTES * 60 * 1000);
    const [recent] = await db
      .select({ id: aiAgentActivities.id })
      .from(aiAgentActivities)
      .where(
        and(
          eq(aiAgentActivities.agentId, "biz-strategy"),
          eq(aiAgentActivities.status, "completed"),
          gt(aiAgentActivities.createdAt!, cutoff)
        )
      )
      .limit(1);
    if (recent) {
      logger.info(`[team-ops] Company cycle skipped — last run was less than ${MIN_TEAM_OPS_CYCLE_GAP_MINUTES} min ago`);
      return;
    }
  } catch {}

  logger.info(`[team-ops] Starting full company cycle for user ${userId}`);
  let phaseContext = "";

  for (const phase of PHASE_PROMPTS) {
    const findings: string[] = [];
    for (const agentId of phase.agentIds) {
      const finding = await runPhaseAgent(userId, agentId, phase.phase, phaseContext);
      if (finding) findings.push(`${agentId}: ${finding}`);
      await new Promise(r => setTimeout(r, 200));
    }
    phaseContext = findings.slice(0, 3).join(" | ");
  }

  logger.info(`[team-ops] Full company cycle complete for user ${userId}`);
}

export async function getCompanyStatus(userId: string): Promise<{
  agents: { agentId: string; status: string; lastFinding: string | null; lastRun: string | null }[];
  totalAgents: number;
  activeNow: number;
  completedToday: number;
}> {
  const allActivities = await storage.getAgentActivities(userId, undefined, 1000);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const agents = COMPANY_ORG.map(org => {
    const agentActs = allActivities.filter(a => a.agentId === org.agentId);
    const running = agentActs.find(a => a.status === "running");
    const completed = agentActs.filter(a => a.status === "completed");
    const last = completed[0];
    const completedToday = completed.filter(a => new Date(a.createdAt ?? 0) >= today).length;

    return {
      agentId: org.agentId,
      status: running ? "running" : completed.length > 0 ? "idle" : "standby",
      lastFinding: last ? (last.details as any)?.description ?? null : null,
      lastRun: last?.createdAt?.toISOString() ?? null,
      completedToday,
    };
  });

  const completedToday = allActivities.filter(a => {
    return a.status === "completed" && new Date(a.createdAt ?? 0) >= today;
  }).length;

  return {
    agents,
    totalAgents: COMPANY_ORG.length,
    activeNow: agents.filter(a => a.status === "running").length,
    completedToday,
  };
}

export async function getCompanyCrossTeamFeed(userId: string): Promise<any[]> {
  const allActivities = await storage.getAgentActivities(userId, undefined, 200);
  return allActivities
    .filter(a => a.status === "completed")
    .map(a => {
      const org = COMPANY_ORG.find(o => o.agentId === a.agentId);
      return {
        ...a,
        agentName: org?.name ?? a.agentId,
        agentTitle: org?.title ?? "",
        department: org?.department ?? "creative",
        color: org?.color ?? "hsl(265 80% 60%)",
        emoji: org?.emoji ?? "🤖",
        handoffsTo: org?.handoffsTo ?? [],
      };
    })
    .slice(0, 60);
}
