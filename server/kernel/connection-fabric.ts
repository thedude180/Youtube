import { db } from "../db";
import { domainEvents } from "@shared/schema";
import { emitDomainEvent } from "./index";

export type ConnectionStatus = "connected" | "degraded" | "disconnected" | "expired" | "unknown";

export interface FabricConnection {
  id: string;
  platform: string;
  adapter: string;
  status: ConnectionStatus;
  lastHealthCheck: Date | null;
  metadata: Record<string, any>;
  capabilities: string[];
}

const connectionRegistry = new Map<string, FabricConnection>();

export function registerConnection(conn: FabricConnection): void {
  connectionRegistry.set(conn.id, { ...conn });
}

export function updateConnectionStatus(id: string, status: ConnectionStatus, metadata?: Record<string, any>): void {
  const conn = connectionRegistry.get(id);
  if (!conn) return;
  conn.status = status;
  conn.lastHealthCheck = new Date();
  if (metadata) conn.metadata = { ...conn.metadata, ...metadata };
  connectionRegistry.set(id, conn);
}

export function getConnection(id: string): FabricConnection | null {
  return connectionRegistry.get(id) || null;
}

export function getAllConnections(): FabricConnection[] {
  return Array.from(connectionRegistry.values());
}

export function getConnectionsByPlatform(platform: string): FabricConnection[] {
  return Array.from(connectionRegistry.values()).filter((c) => c.platform === platform);
}

export function getConnectionsByStatus(status: ConnectionStatus): FabricConnection[] {
  return Array.from(connectionRegistry.values()).filter((c) => c.status === status);
}

export function removeConnection(id: string): boolean {
  return connectionRegistry.delete(id);
}

export interface FabricHealthReport {
  totalConnections: number;
  byStatus: Record<ConnectionStatus, number>;
  byPlatform: Record<string, { total: number; healthy: number }>;
  unhealthyConnections: FabricConnection[];
  overallHealth: "healthy" | "degraded" | "critical";
}

export function getHealthReport(): FabricHealthReport {
  const all = getAllConnections();
  const byStatus: Record<ConnectionStatus, number> = {
    connected: 0, degraded: 0, disconnected: 0, expired: 0, unknown: 0,
  };
  const byPlatform: Record<string, { total: number; healthy: number }> = {};

  for (const conn of all) {
    byStatus[conn.status]++;
    if (!byPlatform[conn.platform]) byPlatform[conn.platform] = { total: 0, healthy: 0 };
    byPlatform[conn.platform].total++;
    if (conn.status === "connected") byPlatform[conn.platform].healthy++;
  }

  const unhealthyConnections = all.filter((c) => c.status !== "connected");
  const healthyPct = all.length > 0 ? byStatus.connected / all.length : 1;

  return {
    totalConnections: all.length,
    byStatus,
    byPlatform,
    unhealthyConnections,
    overallHealth: healthyPct >= 0.8 ? "healthy" : healthyPct >= 0.5 ? "degraded" : "critical",
  };
}

export async function runFabricHealthCheck(userId: string): Promise<FabricHealthReport> {
  const report = getHealthReport();

  if (report.overallHealth !== "healthy") {
    try {
      await emitDomainEvent(userId, "connection_fabric.health_degraded", {
        overallHealth: report.overallHealth,
        unhealthyCount: report.unhealthyConnections.length,
        summary: report.byStatus,
      }, "connection-fabric", "fabric");
    } catch (_) {}
  }

  return report;
}

export function seedDefaultConnections(): void {
  const defaults: FabricConnection[] = [
    {
      id: "youtube-primary",
      platform: "youtube",
      adapter: "youtube-data-api-v3",
      status: "connected",
      lastHealthCheck: new Date(),
      metadata: { quotaDailyLimit: 10000 },
      capabilities: ["upload", "metadata_update", "analytics_read", "playlist_manage", "live_broadcast"],
    },
    {
      id: "database-primary",
      platform: "infrastructure",
      adapter: "postgresql",
      status: "connected",
      lastHealthCheck: new Date(),
      metadata: { provider: "replit" },
      capabilities: ["read", "write", "transaction"],
    },
    {
      id: "openai-primary",
      platform: "ai",
      adapter: "openai-api",
      status: "connected",
      lastHealthCheck: new Date(),
      metadata: {},
      capabilities: ["chat_completion", "embedding"],
    },
    {
      id: "anthropic-primary",
      platform: "ai",
      adapter: "anthropic-api",
      status: "connected",
      lastHealthCheck: new Date(),
      metadata: {},
      capabilities: ["chat_completion"],
    },
  ];

  for (const conn of defaults) {
    if (!connectionRegistry.has(conn.id)) {
      registerConnection(conn);
    }
  }
}
