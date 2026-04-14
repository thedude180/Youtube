import type { Express, Request, Response } from "express";
import { requireAuth } from "./helpers";

const STALE_CONNECTION_MS = 5 * 60 * 1000;
const MAX_CLIENTS_PER_USER = 5;
const MAX_TOTAL_CONNECTIONS = 200;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

interface SSEClient {
  res: Response;
  lastHeartbeat: number;
  createdAt: number;
  heartbeatIntervalId?: NodeJS.Timeout;
}

const clients = new Map<string, SSEClient[]>();
let totalConnectionsCreated = 0;
let totalConnectionsClosed = 0;

import { registerCleanup } from "../services/cleanup-coordinator";
import { createLogger } from "../lib/logger";

const logger = createLogger("events");
registerCleanup("sseConnections", () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, userClients] of clients) {
    const validClients: SSEClient[] = [];
    for (const client of userClients) {
      if (now - client.lastHeartbeat > STALE_CONNECTION_MS) {
        try { client.res.end(); } catch {}
        if (client.heartbeatIntervalId) clearInterval(client.heartbeatIntervalId);
        totalConnectionsClosed++;
        cleaned++;
      } else {
        validClients.push(client);
      }
    }
    if (validClients.length === 0) {
      clients.delete(userId);
    } else {
      clients.set(userId, validClients);
    }
  }
}, CLEANUP_INTERVAL_MS);

function getTotalConnections(): number {
  let total = 0;
  for (const userClients of clients.values()) {
    total += userClients.length;
  }
  return total;
}

function removeClientSafely(userId: string, client: SSEClient): void {
  try {
    client.res.end();
  } catch (error) {
    // Client already closed
  }
  if (client.heartbeatIntervalId) clearInterval(client.heartbeatIntervalId);
  
  const userClients = clients.get(userId);
  if (userClients) {
    const index = userClients.indexOf(client);
    if (index > -1) {
      userClients.splice(index, 1);
    }
    if (userClients.length === 0) {
      clients.delete(userId);
    }
  }
}

export function sendSSEEvent(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.length === 0) return;

  let jsonData: string;
  try {
    jsonData = JSON.stringify(data);
  } catch {
    logger.warn(`[SSE] Failed to serialize event ${event} for user ${userId}`);
    return;
  }

  const byteLength = Buffer.byteLength(jsonData, "utf8");
  if (byteLength > MAX_PAYLOAD_BYTES) {
    logger.warn(`[SSE] Dropping oversized event ${event} for user ${userId} (${byteLength} bytes > ${MAX_PAYLOAD_BYTES} limit)`);
    return;
  }

  const payload = `event: ${event}\ndata: ${jsonData}\n\n`;
  const failedClients: SSEClient[] = [];

  for (const client of userClients) {
    try {
      client.res.write(payload);
    } catch (error) {
      failedClients.push(client);
    }
  }

  // Remove failed clients
  for (const client of failedClients) {
    removeClientSafely(userId, client);
    totalConnectionsClosed++;
  }
}

export function broadcastSSEEvent(event: string, data: any) {
  let jsonData: string;
  try {
    jsonData = JSON.stringify(data);
  } catch {
    logger.warn(`[SSE] Failed to serialize broadcast event ${event}`);
    return;
  }

  const byteLength = Buffer.byteLength(jsonData, "utf8");
  if (byteLength > MAX_PAYLOAD_BYTES) {
    logger.warn(`[SSE] Dropping oversized broadcast event ${event} (${byteLength} bytes > ${MAX_PAYLOAD_BYTES} limit)`);
    return;
  }

  const payload = `event: ${event}\ndata: ${jsonData}\n\n`;
  const usersToProcess = Array.from(clients.keys());

  for (const userId of usersToProcess) {
    const userClients = clients.get(userId);
    if (!userClients) continue;

    const failedClients: SSEClient[] = [];

    for (const client of userClients) {
      try {
        client.res.write(payload);
      } catch (error) {
        failedClients.push(client);
      }
    }

    // Remove failed clients
    for (const client of failedClients) {
      removeClientSafely(userId, client);
      totalConnectionsClosed++;
    }
  }
}

export function closeAllConnections(): void {
  const now = Date.now();
  let closedCount = 0;

  for (const [userId, userClients] of Array.from(clients)) {
    for (const client of userClients) {
      try {
        client.res.end();
      } catch (error) {
        // Client already closed
      }
      if (client.heartbeatIntervalId) {
        clearInterval(client.heartbeatIntervalId);
      }
      closedCount++;
    }
    clients.delete(userId);
  }

}

export function registerEventRoutes(app: Express) {
  app.get("/api/events", (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

    const client: SSEClient = {
      res,
      lastHeartbeat: Date.now(),
      createdAt: Date.now(),
    };

    const totalActive = getTotalConnections();
    if (totalActive >= MAX_TOTAL_CONNECTIONS) {
      logger.warn(`[SSE] Rejecting connection for user ${userId}: global limit reached (${totalActive}/${MAX_TOTAL_CONNECTIONS})`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Server connection limit reached, please try again later" })}\n\n`);
      res.end();
      return;
    }

    if (!clients.has(userId)) {
      clients.set(userId, []);
    }

    const userClients = clients.get(userId)!;

    // Enforce maximum connections per user
    if (userClients.length >= MAX_CLIENTS_PER_USER) {
      // Close the oldest connection
      const oldestClient = userClients[0];
      removeClientSafely(userId, oldestClient);
      totalConnectionsClosed++;
    }

    // Add new client
    userClients.push(client);
    totalConnectionsCreated++;

    // Setup heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
        client.lastHeartbeat = Date.now();
      } catch (error) {
        clearInterval(heartbeat);
        removeClientSafely(userId, client);
        totalConnectionsClosed++;
      }
    }, HEARTBEAT_INTERVAL_MS);

    client.heartbeatIntervalId = heartbeat;

    // Handle response close
    res.on("close", () => {
      clearInterval(heartbeat);
      removeClientSafely(userId, client);
      totalConnectionsClosed++;
    });

    // Handle request close
    req.on("close", () => {
      clearInterval(heartbeat);
      removeClientSafely(userId, client);
      totalConnectionsClosed++;
    });
  });

  app.get("/api/sse-stats", (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const totalActive = getTotalConnections();

    res.json({
      totalActive,
      totalCreated: totalConnectionsCreated,
      totalClosed: totalConnectionsClosed,
      myConnections: (clients.get(userId) || []).length,
      maxClientsPerUser: MAX_CLIENTS_PER_USER,
    });
  });
}
