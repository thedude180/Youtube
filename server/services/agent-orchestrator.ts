import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("agent-orchestrator");

interface AgentHealth {
  consecutiveFails: number;
  lastSuccess: Date | null;
  lastAttempt: Date | null;
  backoffUntil: Date | null;
  totalRuns: number;
  totalFails: number;
}

interface UserSession {
  userId: string;
  tier: string;
  intervals: ReturnType<typeof setInterval>[];
  startedAt: Date;
  agentsRunning: string[];
  health: Record<string, AgentHealth>;
  manuallyPaused: boolean;
}

const activeSessions = new Map<string, UserSession>();
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let isWatchdogRunning = false;

const TIER_CAPABILITIES: Record<string, {
  runAITeam: boolean; aiTeamIntervalMs: number;
  runBusinessAgents: boolean; businessAgentIntervalMs: number;
  runLegalTaxAgents: boolean; legalTaxIntervalMs: number;
  runTeamOps: boolean; teamOpsIntervalMs: number;
  runConsistencyAgent: boolean;
}> = {
  free: {
    runAITeam: false, aiTeamIntervalMs: 0,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: false,
  },
  youtube: {
    runAITeam: true, aiTeamIntervalMs: 4 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  starter: {
    runAITeam: true, aiTeamIntervalMs: 3 * 60 * 60 * 1000,
    runBusinessAgents: false, businessAgentIntervalMs: 0,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  pro: {
    runAITeam: true, aiTeamIntervalMs: 2 * 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 6 * 60 * 60 * 1000,
    runLegalTaxAgents: false, legalTaxIntervalMs: 0,
    runTeamOps: false, teamOpsIntervalMs: 0,
    runConsistencyAgent: true,
  },
  ultimate: {
    runAITeam: true, aiTeamIntervalMs: 60 * 60 * 1000,
    runBusinessAgents: true, businessAgentIntervalMs: 4 * 60 * 60 * 1000,
    runLegalTaxAgents: true, legalTaxIntervalMs: 6 * 60 * 60 * 1000,
    runTeamOps: true, teamOpsIntervalMs: 8 * 60 * 60 * 1000,
    runConsistencyAgent: true,
  },
};

const MAX_CONSECUTIVE_FAILS = 5;
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;

function freshHealth(): AgentHealth {
  return { consecutiveFails: 0, lastSuccess: null, lastAttempt: null, backoffUntil: null, totalRuns: 0, totalFails: 0 };
}

function recordSuccess(health: AgentHealth): void {
  health.consecutiveFails = 0;
  health.lastSuccess = new Date();
  health.lastAttempt = new Date();
  health.backoffUntil = null;
  health.totalRuns++;
}

function recordFailure(health: AgentHealth, agentName: string, userId: string): void {
  health.consecutiveFails++;
  health.lastAttempt = new Date();
  health.totalRuns++;
  health.totalFails++;

  if (health.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    const backoffMs = Math.min(30 * 60 * 1000 * Math.pow(2, health.consecutiveFails - MAX_CONSECUTIVE_FAILS), MAX_BACKOFF_MS);
    health.backoffUntil = new Date(Date.now() + backoffMs);
    logger.warn(`[${userId}] ${agentName} in backoff for ${Math.round(backoffMs / 60000)}min after ${health.consecutiveFails} consecutive failures`);
  }
}

function isInBackoff(health: AgentHealth): boolean {
  if (!health.backoffUntil) return false;
  return health.backoffUntil > new Date();
}

async function getUserTier(userId: string): Promise<string> {
  try {
    const user = await storage.getUser(userId);
    return (user as any)?.tier || "free";
  } catch {
    return "free";
  }
}

function makeAgentRunner(
  userId: string,
  agentName: string,
  session: UserSession,
  runFn: () => Promise<void>
): () => void {
  return async () => {
    if (session.manuallyPaused) return;
    const health = session.health[agentName] || (session.health[agentName] = freshHealth());
    if (isInBackoff(health)) return;
    try {
      await runFn();
      recordSuccess(health);
    } catch (err: any) {
      recordFailure(health, agentName, userId);
      logger.warn(`[${userId}] ${agentName} failed: ${err.message}`);
    }
  };
}

async function runAITeam(userId: string): Promise<void> {
  const { runTeamCycle } = await import("../ai-team-engine");
  await runTeamCycle(userId);
}

async function runBusinessAgents(userId: string): Promise<void> {
  const { runBusinessAgentCycle } = await import("../business-agent-engine");
  await runBusinessAgentCycle(userId);
}

async function runLegalTax(userId: string): Promise<void> {
  const { runLegalTaxAgentCycle } = await import("../legal-tax-agent-engine");
  await runLegalTaxAgentCycle(userId, "all");
}

async function runTeamOps(userId: string): Promise<void> {
  const { runCompanyCycle } = await import("../team-orchestration");
  await runCompanyCycle(userId);
}

export async function startUserAgentSession(userId: string, initialDelayMs = 0): Promise<{ tier: string; agentsStarted: string[] }> {
  stopUserAgentSession(userId);

  const tier = await getUserTier(userId);
  const caps = TIER_CAPABILITIES[tier] || TIER_CAPABILITIES.free;
  const intervals: ReturnType<typeof setInterval>[] = [];
  const agentsStarted: string[] = [];
  const health: Record<string, AgentHealth> = {};

  const session: UserSession = { userId, tier, intervals, startedAt: new Date(), agentsRunning: agentsStarted, health, manuallyPaused: false };
  activeSessions.set(userId, session);

  const schedule = (agentName: string, runFn: () => Promise<void>, intervalMs: number, firstRunDelayMs: number) => {
    const runner = makeAgentRunner(userId, agentName, session, runFn);
    setTimeout(runner, initialDelayMs + firstRunDelayMs);
    const iv = setInterval(runner, intervalMs);
    intervals.push(iv);
    agentsStarted.push(agentName);
  };

  if (caps.runAITeam && caps.aiTeamIntervalMs > 0)
    schedule("ai_team", () => runAITeam(userId), caps.aiTeamIntervalMs, 20_000);

  if (caps.runBusinessAgents && caps.businessAgentIntervalMs > 0)
    schedule("business_agents", () => runBusinessAgents(userId), caps.businessAgentIntervalMs, 40_000);

  if (caps.runLegalTaxAgents && caps.legalTaxIntervalMs > 0)
    schedule("legal_tax", () => runLegalTax(userId), caps.legalTaxIntervalMs, 60_000);

  if (caps.runTeamOps && caps.teamOpsIntervalMs > 0)
    schedule("team_ops", () => runTeamOps(userId), caps.teamOpsIntervalMs, 90_000);

  if (agentsStarted.length > 0) {
    logger.info(`[${userId}] Session armed — tier: ${tier}, agents: [${agentsStarted.join(", ")}]`);
  }

  try {
    const { initUploadWatcherForUser } = await import("./youtube-upload-watcher");
    await initUploadWatcherForUser(userId);
  } catch (err: any) {
    logger.warn(`[${userId}] Upload watcher init failed: ${err.message}`);
  }

  if (caps.runConsistencyAgent) {
    try {
      const { initConsistencyAgentForUser } = await import("./content-consistency-agent");
      await initConsistencyAgentForUser(userId);
    } catch (err: any) {
      logger.warn(`[${userId}] Consistency agent init failed: ${err.message}`);
    }
  }

  try {
    const { initStreamAgentForUser } = await import("./stream-agent");
    await initStreamAgentForUser(userId);
  } catch (err: any) {
    logger.warn(`[${userId}] Stream agent init failed: ${err.message}`);
  }

  try {
    const { initCopyrightGuardianForUser } = await import("./copyright-guardian");
    await initCopyrightGuardianForUser(userId);
  } catch (err: any) {
    logger.warn(`[${userId}] Copyright guardian init failed: ${err.message}`);
  }

  try {
    const { fireAgentEvent } = await import("./agent-events");
    fireAgentEvent("agent.session.started", userId, { tier, agentsStarted });
  } catch {}

  return { tier, agentsStarted };
}

export async function initializeUserSystems(userId: string): Promise<void> {
  try { await startUserAgentSession(userId, 0); } catch (err: any) {
    logger.warn(`[${userId}] initializeUserSystems failed: ${err.message}`);
  }
}

export function stopUserAgentSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (session) {
    session.intervals.forEach(iv => clearInterval(iv));
    activeSessions.delete(userId);
  }
}

export function pauseUserAgentSession(userId: string): boolean {
  const session = activeSessions.get(userId);
  if (!session) return false;
  session.manuallyPaused = true;
  logger.info(`[${userId}] Agent session paused by user`);
  return true;
}

export function resumeUserAgentSession(userId: string): boolean {
  const session = activeSessions.get(userId);
  if (!session) return false;
  session.manuallyPaused = false;
  logger.info(`[${userId}] Agent session resumed by user`);
  return true;
}

export function getSessionInfo(userId: string): { tier: string; agentsRunning: string[]; startedAt: string; active: boolean; paused: boolean; health: Record<string, { consecutiveFails: number; lastSuccess: string | null; backoffUntil: string | null; totalRuns: number }> } {
  const session = activeSessions.get(userId);
  if (!session) return { tier: "free", agentsRunning: [], startedAt: "", active: false, paused: false, health: {} };
  const healthSummary: Record<string, { consecutiveFails: number; lastSuccess: string | null; backoffUntil: string | null; totalRuns: number }> = {};
  for (const [k, v] of Object.entries(session.health)) {
    healthSummary[k] = { consecutiveFails: v.consecutiveFails, lastSuccess: v.lastSuccess?.toISOString() ?? null, backoffUntil: v.backoffUntil?.toISOString() ?? null, totalRuns: v.totalRuns };
  }
  return { tier: session.tier, agentsRunning: session.agentsRunning, startedAt: session.startedAt.toISOString(), active: true, paused: session.manuallyPaused, health: healthSummary };
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getAllSessionsInfo(): { userId: string; tier: string; agentsRunning: string[]; startedAt: string; paused: boolean }[] {
  return Array.from(activeSessions.values()).map(s => ({
    userId: s.userId, tier: s.tier, agentsRunning: s.agentsRunning, startedAt: s.startedAt.toISOString(), paused: s.manuallyPaused,
  }));
}

async function watchdogScan(): Promise<void> {
  if (isWatchdogRunning) return;
  isWatchdogRunning = true;
  try {
    const allUsers = await storage.getAllUsers();
    const paidUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");

    for (let i = 0; i < paidUsers.length; i++) {
      const user = paidUsers[i];
      const userId = user.id;
      const currentTier = (user as any).tier || "free";

      const existing = activeSessions.get(userId);

      const needsStart = !existing;
      const tierChanged = existing && existing.tier !== currentTier;
      const sessionDead = existing && existing.intervals.length === 0 && (TIER_CAPABILITIES[currentTier]?.runAITeam || false);

      if (needsStart || tierChanged || sessionDead) {
        const reason = needsStart ? "no session" : tierChanged ? `tier ${existing?.tier} → ${currentTier}` : "dead intervals";
        logger.info(`[Watchdog] Restarting session for ${userId} — reason: ${reason}`);
        setTimeout(async () => {
          try {
            await startUserAgentSession(userId, i * 500);
          } catch (err: any) {
            logger.warn(`[Watchdog] Failed to restart session for ${userId}: ${err.message}`);
          }
        }, i * 500);
      }
    }

    const activeIds = new Set(paidUsers.map((u: any) => u.id));
    for (const [sessionUserId] of activeSessions) {
      if (!activeIds.has(sessionUserId)) {
        logger.info(`[Watchdog] Cleaning up session for removed/downgraded user ${sessionUserId}`);
        stopUserAgentSession(sessionUserId);
      }
    }
  } catch (err: any) {
    logger.warn(`[Watchdog] Scan error (will retry next cycle): ${err.message}`);
  } finally {
    isWatchdogRunning = false;
  }
}

export async function bootstrapAllUserSessions(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const eligibleUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[Orchestrator] Bootstrapping ${eligibleUsers.length} paid users of ${allUsers.length} total`);
    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      setTimeout(async () => {
        try { await startUserAgentSession(user.id, 0); } catch (err: any) {
          logger.warn(`[Orchestrator] Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 3000);
    }
  } catch (err: any) {
    logger.error(`[Orchestrator] Bootstrap DB error: ${err.message}`);
  }
}

export function startWatchdog(): void {
  if (watchdogInterval) return;

  logger.info("[Orchestrator] Watchdog starting — scans every 5 minutes");

  setTimeout(() => watchdogScan().catch(() => {}), 60_000);

  watchdogInterval = setInterval(() => {
    watchdogScan().catch((err: any) => {
      logger.warn(`[Watchdog] Unhandled error, continuing: ${err.message}`);
    });
  }, 5 * 60 * 1000);
}

export function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}
