import { db } from "../db";
import { agentInteropMessages } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function sendAgentMessage(
  fromAgent: string,
  toAgent: string,
  userId: string,
  messageType: string,
  payload: Record<string, any> = {}
): Promise<number> {
  const [msg] = await db
    .insert(agentInteropMessages)
    .values({
      fromAgent,
      toAgent,
      userId,
      messageType,
      payload,
      status: "pending",
    })
    .returning({ id: agentInteropMessages.id });

  await emitDomainEvent(userId, "agent.message.sent", {
    messageId: msg.id,
    fromAgent,
    toAgent,
    messageType,
  }, "agent-interop", String(msg.id));

  return msg.id;
}

export async function getAgentMessages(
  agentName: string,
  userId: string,
  options: { status?: string; limit?: number } = {}
): Promise<Array<typeof agentInteropMessages.$inferSelect>> {
  const conditions = [
    eq(agentInteropMessages.toAgent, agentName),
    eq(agentInteropMessages.userId, userId),
  ];

  if (options.status) {
    conditions.push(eq(agentInteropMessages.status, options.status));
  }

  return db
    .select()
    .from(agentInteropMessages)
    .where(and(...conditions))
    .orderBy(desc(agentInteropMessages.createdAt))
    .limit(options.limit ?? 50);
}

export async function markMessageDelivered(messageId: number): Promise<void> {
  await db
    .update(agentInteropMessages)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(agentInteropMessages.id, messageId));
}
