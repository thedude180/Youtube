/**
 * Server-Sent Events bus.
 * Clients subscribe via GET /api/events — one long-lived connection per tab.
 * Any server module can publish by calling sseEmit(userId, eventType, data).
 */
import type { Response } from "express";
import { createLogger } from "./logger.js";

const log = createLogger("sse");

type Client = { userId: string; res: Response; connectedAt: number };
const clients = new Map<string, Set<Client>>();

export function sseConnect(userId: string, res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client: Client = { userId, res, connectedAt: Date.now() };
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(client);
  log.info("SSE connected", { userId, total: clients.get(userId)!.size });

  // Heartbeat every 25 s to prevent proxy timeouts
  const hb = setInterval(() => res.write(": ping\n\n"), 25_000);

  function cleanup() {
    clearInterval(hb);
    clients.get(userId)?.delete(client);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
    log.info("SSE disconnected", { userId });
  }

  res.on("close", cleanup);
  return cleanup;
}

export function sseEmit(userId: string, event: string, data: unknown): void {
  const bucket = clients.get(userId);
  if (!bucket) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of bucket) {
    try {
      client.res.write(payload);
    } catch {
      bucket.delete(client);
    }
  }
}

export function sseBroadcast(event: string, data: unknown): void {
  for (const userId of clients.keys()) sseEmit(userId, event, data);
}

export function sseConnectionCount(): number {
  let n = 0;
  for (const s of clients.values()) n += s.size;
  return n;
}
