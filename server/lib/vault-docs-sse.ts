import type { Response } from "express";

type SseClient = {
  userId: string;
  res: Response;
};

const clients: Set<SseClient> = new Set();

export function addSseClient(userId: string, res: Response): () => void {
  const client: SseClient = { userId, res };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function emitVaultDocEvent(userId: string, payload: { docType: string; status: string; step?: string }) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.userId !== userId) continue;
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}
