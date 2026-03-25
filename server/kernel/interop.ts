import { db } from "../db";
import { agentInteropMessages } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function sendAgentMessage(
  from: string,
  to: string,
  userId: string,
  messageType: string,
  payload: Record<string, any> = {}
): Promise<number> {
  const [msg] = await db
    .insert(agentInteropMessages)
    .values({
      fromAgent: from,
      toAgent: to,
      userId,
      messageType,
      payload,
      status: "delivered",
      deliveredAt: new Date(),
    })
    .returning({ id: agentInteropMessages.id });

  await emitDomainEvent(userId, "agent.message.sent", {
    messageId: msg.id,
    fromAgent: from,
    toAgent: to,
    messageType,
  }, "agent-interop", String(msg.id));

  return msg.id;
}

export async function getAgentMessages(
  agentName: string,
  filters: { direction?: "from" | "to"; userId?: string; status?: string; limit?: number } = {}
): Promise<(typeof agentInteropMessages.$inferSelect)[]> {
  const conditions = [];

  if (filters.direction === "from") {
    conditions.push(eq(agentInteropMessages.fromAgent, agentName));
  } else {
    conditions.push(eq(agentInteropMessages.toAgent, agentName));
  }

  if (filters.userId) {
    conditions.push(eq(agentInteropMessages.userId, filters.userId));
  }

  if (filters.status) {
    conditions.push(eq(agentInteropMessages.status, filters.status));
  }

  const rows = await db
    .select()
    .from(agentInteropMessages)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(agentInteropMessages.createdAt))
    .limit(filters.limit ?? 50);

  return rows;
}

export async function markMessageDelivered(messageId: number): Promise<void> {
  await db
    .update(agentInteropMessages)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(agentInteropMessages.id, messageId));
}
