import type { Express, Request, Response } from "express";
import { requireAuth } from "./helpers";

const clients = new Map<string, Set<Response>>();

export function sendSSEEvent(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of Array.from(userClients)) {
    try { res.write(payload); } catch { userClients.delete(res); }
  }
}

export function broadcastSSEEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, userClients] of Array.from(clients)) {
    for (const res of Array.from(userClients)) {
      try { res.write(payload); } catch { userClients.delete(res); }
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

    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 30000);

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId)!.add(res);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.get(userId)?.delete(res);
      if (clients.get(userId)?.size === 0) clients.delete(userId);
    });
  });
}
