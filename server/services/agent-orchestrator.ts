import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("agent-orchestrator");

interface UserSession {
  userId: string;
  tier: string;
  intervals: ReturnType<typeof setInterval>[];
  startedAt: Date;
  agentsRunning: string[];
}

const activeSessions = new Map<string, UserSession>();

const TIER_CAPABILITIES: Record<string, {
  runAITeam: boolean;
  aiTeamIntervalMs: number;
  runBusinessAgents: boolean;
  businessAgentIntervalMs: number;
  runLegalTaxAgents: boolean;
  legalTaxIntervalMs: number;
  runTeamOps: boolean;
  teamOpsIntervalMs: number;
}> = {
  free: {
    runAITeam: false, aiTeamIntervalMs: 0,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
  },
  youtube: {
    runAITeam: true, aiTeamIntervalMs: 4 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
  },
  starter: {
    runAITeam: true, aiTeamIntervalMs: 3 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
  },
  pro: {
    runAITeam: true, aiTeamIntervalMs: 2 * 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 6 * 60 * 60 * 1000,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
  },
  ultimate: {
    runAITeam: true, aiTeamIntervalMs: 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 4 * 60 * 60 * 1000,
    runLegalTaxAgents: true, legalTaxIntervalMs: 6 * 60 * 60 * 1000,
    runTeamOps: true, teamOpsIntervalMs: 8 * 60 * 60 * 1000,
  },
};

async function getUserTier(userId: string): Promise<string> {
  try {
    const user = await storage.getUser(userId);
    return (user as any)?.tier || "free";
  } catch {
    return "free";
  }
}

async function safeRunAITeam(userId: string): Promise<void> {
  try {
    const { runTeamCycle } = await import("../ai-team-engine");
    await runTeamCycle(userId);
    logger.info(`[${userId}] AI Team cycle completed`);
  } catch (err: any) {
    logger.warn(`[${userId}] AI Team cycle error: ${err.message}`);
  }
}

async function safeRunBusinessAgents(userId: string): Promise<void> {
  try {
    const { runBusinessAgentCycle } = await import("../business-agent-engine");
    await runBusinessAgentCycle(userId);
    logger.info(`[${userId}] Business Agents cycle completed`);
  } catch (err: any) {
    logger.warn(`[${userId}] Business Agents cycle error: ${err.message}`);
  }
}

async function safeRunLegalTax(userId: string): Promise<void> {
  try {
    const { runLegalTaxAgentCycle } = await import("../legal-tax-agent-engine");
    await runLegalTaxAgentCycle(userId, "all");
    logger.info(`[${userId}] Legal/Tax cycle completed`);
  } catch (err: any) {
    logger.warn(`[${userId}] Legal/Tax cycle error: ${err.message}`);
  }
}

async function safeRunTeamOps(userId: string): Promise<void> {
  try {
    const { runCompanyCycle } = await import("../team-orchestration");
    await runCompanyCycle(userId);
    logger.info(`[${userId}] Team Ops cycle completed`);
  } catch (err: any) {
    logger.warn(`[${userId}] Team Ops cycle error: ${err.message}`);
  }
}

export async function startUserAgentSession(userId: string): Promise<{ tier: string; agentsStarted: string[] }> {
  stopUserAgentSession(userId);

  const tier = await getUserTier(userId);
  const caps = TIER_CAPABILITIES[tier] || TIER_CAPABILITIES.free;
  const intervals: ReturnType<typeof setInterval>[] = [];
  const agentsStarted: string[] = [];

  if (caps.runAITeam && caps.aiTeamIntervalMs > 0) {
    setTimeout(() => safeRunAITeam(userId), 20000);
    intervals.push(setInterval(() => safeRunAITeam(userId), caps.aiTeamIntervalMs));
    agentsStarted.push("ai_team");
  }

  if (caps.runBusinessAgents && caps.businessAgentIntervalMs > 0) {
    setTimeout(() => safeRunBusinessAgents(userId), 40000);
    intervals.push(setInterval(() => safeRunBusinessAgents(userId), caps.businessAgentIntervalMs));
    agentsStarted.push("business_agents");
  }

  if (caps.runLegalTaxAgents && caps.legalTaxIntervalMs > 0) {
    setTimeout(() => safeRunLegalTax(userId), 60000);
    intervals.push(setInterval(() => safeRunLegalTax(userId), caps.legalTaxIntervalMs));
    agentsStarted.push("legal_tax");
  }

  if (caps.runTeamOps && caps.teamOpsIntervalMs > 0) {
    setTimeout(() => safeRunTeamOps(userId), 90000);
    intervals.push(setInterval(() => safeRunTeamOps(userId), caps.teamOpsIntervalMs));
    agentsStarted.push("team_ops");
  }

  activeSessions.set(userId, { userId, tier, intervals, startedAt: new Date(), agentsRunning: agentsStarted });
  logger.info(`[${userId}] Agent session started — tier: ${tier}, agents: [${agentsStarted.join(", ") || "core_only"}]`);
  return { tier, agentsStarted };
}

export function stopUserAgentSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (session) {
    session.intervals.forEach(iv => clearInterval(iv));
    activeSessions.delete(userId);
    logger.info(`[${userId}] Agent session stopped`);
  }
}

export function getSessionInfo(userId: string): { tier: string; agentsRunning: string[]; startedAt: string; active: boolean } {
  const session = activeSessions.get(userId);
  if (!session) return { tier: "free", agentsRunning: [], startedAt: "", active: false };
  return {
    tier: session.tier,
    agentsRunning: session.agentsRunning,
    startedAt: session.startedAt.toISOString(),
    active: true,
  };
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getAllSessionsInfo(): { userId: string; tier: string; agentsRunning: string[]; startedAt: string }[] {
  return Array.from(activeSessions.values()).map(s => ({
    userId: s.userId,
    tier: s.tier,
    agentsRunning: s.agentsRunning,
    startedAt: s.startedAt.toISOString(),
  }));
}
