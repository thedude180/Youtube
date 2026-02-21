import type { Express, Request, Response } from "express";
import { requireAuth } from "./helpers";

const STALE_CONNECTION_MS = 5 * 60 * 1000;
const MAX_CLIENTS_PER_USER = 5;
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

// Periodic cleanup of stale connections
const sseCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, userClients] of Array.from(clients)) {
    const validClients: SSEClient[] = [];
    for (const client of userClients) {
      if (now - client.lastHeartbeat > STALE_CONNECTION_MS) {
        try {
          client.res.end();
        } catch (error) {
          // Client already closed
        }
        if (client.heartbeatIntervalId) clearInterval(client.heartbeatIntervalId);
        totalConnectionsClosed++;
        cleaned++;
        console.log(
          `[SSE] Closed stale connection for user ${userId} (idle for ${Math.round((now - client.lastHeartbeat) / 1000)}s)`
        );
      } else {
        validClients.push(client);
      }
    }
    if (validClients.length === 0) {
      clients.delete(userId);
      console.log(`[SSE] Removed user ${userId} from clients map (no active connections)`);
    } else {
      clients.set(userId, validClients);
    }
  }
  if (cleaned > 0) {
    console.log(
      `[SSE] Cleanup cycle complete: ${cleaned} stale connections removed, ${getTotalConnections()} connections active`
    );
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

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  clearInterval(sseCleanupInterval);
  console.log(`[SSE] Graceful shutdown: closed ${closedCount} SSE connections, cleanup interval cleared`);
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

    // Initialize user client list if needed
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
      const connectionDuration = Math.round((Date.now() - oldestClient.createdAt) / 1000);
      console.log(
        `[SSE] Evicted oldest connection for user ${userId} due to max limit (${MAX_CLIENTS_PER_USER} connections). Connection was open for ${connectionDuration}s`
      );
    }

    // Add new client
    userClients.push(client);
    totalConnectionsCreated++;

    const connectionCount = getTotalConnections();
    console.log(
      `[SSE] New connection established for user ${userId} (connections: ${userClients.length}/${MAX_CLIENTS_PER_USER}, total active: ${connectionCount})`
    );

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
      const connectionDuration = Math.round((Date.now() - client.createdAt) / 1000);
      const remainingConnections = clients.get(userId)?.length ?? 0;
      console.log(
        `[SSE] Connection closed for user ${userId} (duration: ${connectionDuration}s, remaining: ${remainingConnections}/${MAX_CLIENTS_PER_USER})`
      );
    });

    // Handle request close
    req.on("close", () => {
      clearInterval(heartbeat);
      removeClientSafely(userId, client);
      totalConnectionsClosed++;
      const connectionDuration = Math.round((Date.now() - client.createdAt) / 1000);
      const remainingConnections = clients.get(userId)?.length ?? 0;
      console.log(
        `[SSE] Request closed for user ${userId} (duration: ${connectionDuration}s, remaining: ${remainingConnections}/${MAX_CLIENTS_PER_USER})`
      );
    });
  });

  // Optional: expose connection stats endpoint for monitoring
  app.get("/api/sse-stats", (req: any, res) => {
    const totalActive = getTotalConnections();
    const userStats: Record<string, number> = {};
    
    for (const [userId, userClients] of Array.from(clients)) {
      userStats[userId] = userClients.length;
    }

    res.json({
      totalActive,
      totalCreated: totalConnectionsCreated,
      totalClosed: totalConnectionsClosed,
      userStats,
      maxClientsPerUser: MAX_CLIENTS_PER_USER,
    });
  });
}
