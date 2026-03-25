import { db } from "../db";
import { capabilityDegradationPlaybooks } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const PLAYBOOK_SEEDS = [
  {
    capabilityName: "database",
    degradationLevel: "connection_degraded",
    playbookName: "Database Connection Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor connection pool health and query latency" },
      { order: 2, action: "contain", description: "Reduce connection pool pressure; defer non-critical writes" },
      { order: 3, action: "pause_automations", description: "Pause background engines (smart-edit, catalog, performance)" },
      { order: 4, action: "safe_mode", description: "Continue read-only operations and health checks" },
      { order: 5, action: "notify_user", description: "Surface degradation in System Pulse HUD with 'degraded' state" },
      { order: 6, action: "escalate", description: "If connection pool drops below 10%, alert Exception Desk" },
      { order: 7, action: "recover", description: "Resume operations when pool utilization returns below 70% for 5 minutes" },
      { order: 8, action: "verify", description: "Run one governed workflow end-to-end to confirm recovery" },
      { order: 9, action: "audit", description: "Log playbook activation and recovery as domain events" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "storage",
    degradationLevel: "capacity_approaching_limit",
    playbookName: "Storage Capacity Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor storage usage against configured thresholds (80%, 90%, 95%)" },
      { order: 2, action: "contain", description: "Block new media downloads; defer thumbnail generation" },
      { order: 3, action: "pause_automations", description: "Pause smart-edit downloads, clip factory, replay factory" },
      { order: 4, action: "safe_mode", description: "Continue metadata operations, learning signals, and analytics" },
      { order: 5, action: "notify_user", description: "Surface storage warning in System Pulse HUD with capacity percentage" },
      { order: 6, action: "escalate", description: "If usage exceeds 95%, mark storage as 'blocked' in HUD" },
      { order: 7, action: "recover", description: "Resume when usage drops below 80% after cleanup or expansion" },
      { order: 8, action: "verify", description: "Confirm one media write succeeds before clearing degradation" },
      { order: 9, action: "audit", description: "Log playbook activation and recovery as domain events" },
    ],
    autoActivate: true,
  },
];

export async function seedDegradationPlaybooks(): Promise<void> {
  for (const seed of PLAYBOOK_SEEDS) {
    const [existing] = await db
      .select({ id: capabilityDegradationPlaybooks.id })
      .from(capabilityDegradationPlaybooks)
      .where(
        and(
          eq(capabilityDegradationPlaybooks.capabilityName, seed.capabilityName),
          eq(capabilityDegradationPlaybooks.degradationLevel, seed.degradationLevel)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(capabilityDegradationPlaybooks).values(seed);
    }
  }
}
