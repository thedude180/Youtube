import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { notifyUser, type NotificationSeverity } from "./notifications";

interface SystemCheck {
  name: string;
  check: (userId: string) => Promise<{ ok: boolean; message?: string; severity?: NotificationSeverity }>;
}

const systemChecks: SystemCheck[] = [
  {
    name: "pipeline_health",
    check: async (userId) => {
      return { ok: true };
    },
  },
  {
    name: "platform_connections",
    check: async (userId) => {
      return { ok: true };
    },
  },
  {
    name: "content_queue",
    check: async (userId) => {
      return { ok: true };
    },
  },
];

let monitorInterval: ReturnType<typeof setInterval> | null = null;

async function runHealthChecks(): Promise<void> {
  try {
    const activeUsers = await db.select().from(users).where(eq(users.autopilotActive, true));

    for (const user of activeUsers) {
      for (const systemCheck of systemChecks) {
        try {
          const result = await systemCheck.check(user.id);
          if (!result.ok && result.message) {
            await notifyUser({
              userId: user.id,
              title: `System Issue: ${systemCheck.name.replace(/_/g, " ")}`,
              message: result.message,
              severity: result.severity || "warning",
              category: systemCheck.name,
            });
          }
        } catch (err) {
          console.error(`[Autopilot] Check "${systemCheck.name}" failed for user ${user.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Autopilot] Health check cycle error:", err);
  }
}

export function startAutopilotMonitor(): void {
  if (monitorInterval) return;

  console.log("[Autopilot] Background monitor started — checking every 30 minutes");

  setTimeout(() => runHealthChecks().catch(console.error), 60_000);

  monitorInterval = setInterval(() => {
    runHealthChecks().catch(console.error);
  }, 30 * 60 * 1000);
}

export function stopAutopilotMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[Autopilot] Monitor stopped");
  }
}
