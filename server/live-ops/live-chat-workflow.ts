import { checkLiveTrustBudget, deductLiveTrust } from "./live-trust";

export interface ChatEvent {
  messageId: string;
  authorId: string;
  authorName: string;
  content: string;
  type: "message" | "superchat" | "membership" | "system";
  amount?: number;
  currency?: string;
}

export interface ChatPolicy {
  autoRespond: boolean;
  moderationLevel: "relaxed" | "standard" | "strict";
  superChatThreshold: number;
  welcomeNewMembers: boolean;
  maxResponsesPerMinute: number;
}

const defaultPolicy: ChatPolicy = {
  autoRespond: true,
  moderationLevel: "standard",
  superChatThreshold: 5,
  welcomeNewMembers: true,
  maxResponsesPerMinute: 5,
};

const userPolicies = new Map<string, ChatPolicy>();

export function processLiveChatEvent(
  userId: string,
  event: ChatEvent,
): { action: string | null; trustAllowed: boolean; reason?: string } {
  const policy = userPolicies.get(userId) || defaultPolicy;

  if (event.type === "superchat" && event.amount && event.amount >= policy.superChatThreshold) {
    const trustCheck = checkLiveTrustBudget(userId, "chat_action");
    if (!trustCheck.allowed) {
      return { action: null, trustAllowed: false, reason: trustCheck.reason };
    }
    deductLiveTrust(userId, "chat_action");
    return { action: "acknowledge_superchat", trustAllowed: true };
  }

  if (event.type === "membership" && policy.welcomeNewMembers) {
    const trustCheck = checkLiveTrustBudget(userId, "chat_action");
    if (!trustCheck.allowed) {
      return { action: null, trustAllowed: false, reason: trustCheck.reason };
    }
    deductLiveTrust(userId, "chat_action");
    return { action: "welcome_member", trustAllowed: true };
  }

  if (event.type === "message" && policy.autoRespond) {
    const isQuestion = event.content.includes("?") ||
      /\b(how|what|when|where|why|can|will|does|is)\b/i.test(event.content);

    if (isQuestion) {
      const trustCheck = checkLiveTrustBudget(userId, "chat_action");
      if (!trustCheck.allowed) {
        return { action: null, trustAllowed: false, reason: trustCheck.reason };
      }
      deductLiveTrust(userId, "chat_action");
      return { action: "respond_to_question", trustAllowed: true };
    }
  }

  return { action: null, trustAllowed: true };
}

export function getLiveChatPolicy(userId: string): ChatPolicy {
  return userPolicies.get(userId) || defaultPolicy;
}

export function updateLiveChatPolicy(userId: string, updates: Partial<ChatPolicy>): ChatPolicy {
  const current = userPolicies.get(userId) || { ...defaultPolicy };
  const updated = { ...current, ...updates };
  userPolicies.set(userId, updated);
  return updated;
}
