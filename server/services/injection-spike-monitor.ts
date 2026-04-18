import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { checkInjectionSpike, getSpikeConfig } from "../lib/ai-attack-shield";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("injection-spike-monitor");

const POLL_INTERVAL_MS = parseInt(process.env.INJECTION_SPIKE_POLL_MS ?? "60000", 10);

let _intervalId: ReturnType<typeof setInterval> | null = null;

async function getAdminUserIds(): Promise<string[]> {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    return admins.map(a => a.id);
  } catch (err: any) {
    logger.warn("[InjectionSpikeMonitor] Failed to fetch admin users", { error: err.message });
    return [];
  }
}

async function tick(): Promise<void> {
  try {
    const spike = checkInjectionSpike();
    if (!spike.shouldAlert) return;

    const windowMinutes = Math.round(spike.windowMs / 60_000);
    const adminIds = await getAdminUserIds();

    if (adminIds.length === 0) {
      logger.warn("[InjectionSpikeMonitor] Spike detected but no admin users found to notify");
      return;
    }

    // Include a time bucket in the title so each cooldown period generates
    // a unique notification title, bypassing storage.createNotification's
    // 4-hour same-title deduplication guard.
    const config = getSpikeConfig();
    const bucketMs = Math.max(config.cooldownMs, 4 * 60 * 60 * 1000);
    const bucket = Math.floor(Date.now() / bucketMs);
    const title = `Injection Attack Spike Detected #${bucket}`;
    const message = `${spike.count} prompt injection attempt${spike.count !== 1 ? "s" : ""} detected in the last ${windowMinutes} minute${windowMinutes !== 1 ? "s" : ""} (threshold: ${spike.threshold}). ${spike.uniqueUsers} unique user${spike.uniqueUsers !== 1 ? "s" : ""} affected.`;

    await Promise.allSettled(
      adminIds.map(adminId =>
        storage.createNotification({
          userId: adminId,
          type: "system",
          title,
          message,
          severity: "warning",
          actionUrl: "/settings/security",
          metadata: { source: "injection-spike-monitor" },
        })
      )
    );

    logger.warn(`[InjectionSpikeMonitor] Notified ${adminIds.length} admin(s) of injection spike`, {
      count: spike.count,
      threshold: spike.threshold,
      windowMinutes,
      uniqueUsers: spike.uniqueUsers,
    });
  } catch (err: any) {
    logger.error("[InjectionSpikeMonitor] Tick error", { error: err.message });
  }
}

export function startInjectionSpikeMonitor(): void {
  if (_intervalId !== null) return;
  _intervalId = setInterval(() => {
    tick().catch(err => logger.error("[InjectionSpikeMonitor] Unhandled tick error", { error: String(err) }));
  }, POLL_INTERVAL_MS);
  logger.info(`[InjectionSpikeMonitor] Started (poll=${POLL_INTERVAL_MS}ms, threshold=${process.env.INJECTION_SPIKE_THRESHOLD ?? "5"}, window=${process.env.INJECTION_SPIKE_WINDOW_MS ?? "300000"}ms)`);
}
