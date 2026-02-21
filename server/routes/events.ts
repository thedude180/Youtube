import type { Express, Request, Response } from "express";
import { requireAuth } from "./helpers";

const STALE_CONNECTION_MS = 5 * 60 * 1000;

interface SSEClient {
  res: Response;
  lastHeartbeat: number;
}

const clients = new Map<string, Set<SSEClient>>();

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, userClients] of Array.from(clients)) {
    for (const client of Array.from(userClients)) {
      if (now - client.lastHeartbeat > STALE_CONNECTION_MS) {
        try { client.res.end(); } catch {}
        userClients.delete(client);
        cleaned++;
      }
    }
    if (userClients.size === 0) clients.delete(userId);
  }
  if (cleaned > 0) {
    console.log(`[SSE] Cleaned up ${cleaned} stale connections`);
  }
}, 60 * 1000);

export function sendSSEEvent(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(userClients)) {
    try { client.res.write(payload); } catch { userClients.delete(client); }
  }
}

export function broadcastSSEEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, userClients] of Array.from(clients)) {
    for (const client of Array.from(userClients)) {
      try { client.res.write(payload); } catch { userClients.delete(client); }
    }
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

    const client: SSEClient = { res, lastHeartbeat: Date.now() };

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
        client.lastHeartbeat = Date.now();
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId)!.add(client);

    res.on("close", () => {
      clearInterval(heartbeat);
      clients.get(userId)?.delete(client);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.get(userId)?.delete(client);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });
  });
}
