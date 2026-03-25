const liveTrustBudgets = new Map<string, {
  titleChanges: number;
  chatActions: number;
  engagementActions: number;
  maxTitleChanges: number;
  maxChatActions: number;
  maxEngagementActions: number;
  resetAt: Date;
}>();

function getOrCreateBudget(userId: string) {
  if (!liveTrustBudgets.has(userId)) {
    liveTrustBudgets.set(userId, {
      titleChanges: 0,
      chatActions: 0,
      engagementActions: 0,
      maxTitleChanges: 4,
      maxChatActions: 50,
      maxEngagementActions: 20,
      resetAt: new Date(Date.now() + 3600000),
    });
  }
  const budget = liveTrustBudgets.get(userId)!;
  if (new Date() > budget.resetAt) {
    budget.titleChanges = 0;
    budget.chatActions = 0;
    budget.engagementActions = 0;
    budget.resetAt = new Date(Date.now() + 3600000);
  }
  return budget;
}

export function checkLiveTrustBudget(userId: string, actionType: string): {
  allowed: boolean;
  remaining: number;
  reason?: string;
} {
  const budget = getOrCreateBudget(userId);

  switch (actionType) {
    case "title_change":
      return {
        allowed: budget.titleChanges < budget.maxTitleChanges,
        remaining: budget.maxTitleChanges - budget.titleChanges,
        reason: budget.titleChanges >= budget.maxTitleChanges ? "Title change budget exhausted (max 4/hour)" : undefined,
      };
    case "chat_action":
      return {
        allowed: budget.chatActions < budget.maxChatActions,
        remaining: budget.maxChatActions - budget.chatActions,
        reason: budget.chatActions >= budget.maxChatActions ? "Chat action budget exhausted (max 50/hour)" : undefined,
      };
    case "engagement_action":
      return {
        allowed: budget.engagementActions < budget.maxEngagementActions,
        remaining: budget.maxEngagementActions - budget.engagementActions,
        reason: budget.engagementActions >= budget.maxEngagementActions ? "Engagement action budget exhausted (max 20/hour)" : undefined,
      };
    default:
      return { allowed: true, remaining: 100 };
  }
}

export function deductLiveTrust(userId: string, actionType: string): boolean {
  const check = checkLiveTrustBudget(userId, actionType);
  if (!check.allowed) return false;

  const budget = getOrCreateBudget(userId);
  switch (actionType) {
    case "title_change": budget.titleChanges++; break;
    case "chat_action": budget.chatActions++; break;
    case "engagement_action": budget.engagementActions++; break;
  }
  return true;
}

export function getLiveTrustStatus(userId: string) {
  const budget = getOrCreateBudget(userId);
  return {
    titleChanges: { used: budget.titleChanges, max: budget.maxTitleChanges, remaining: budget.maxTitleChanges - budget.titleChanges },
    chatActions: { used: budget.chatActions, max: budget.maxChatActions, remaining: budget.maxChatActions - budget.chatActions },
    engagementActions: { used: budget.engagementActions, max: budget.maxEngagementActions, remaining: budget.maxEngagementActions - budget.engagementActions },
    resetsAt: budget.resetAt,
  };
}
