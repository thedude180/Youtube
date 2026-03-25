export function activateCommunity(
  metrics: {
    viewerCount: number;
    chatRate: number;
    memberCount: number;
    superChatCount: number;
    streamDurationMinutes: number;
  },
): { actions: string[]; engagementScore: number; priority: string } {
  const actions: string[] = [];
  let engagementScore = 0;

  if (metrics.chatRate > 2) engagementScore += 0.2;
  if (metrics.superChatCount > 0) engagementScore += 0.15;
  if (metrics.viewerCount > 50) engagementScore += 0.2;
  if (metrics.memberCount > 5) engagementScore += 0.15;

  if (metrics.viewerCount >= 50 && metrics.chatRate < 1) {
    actions.push("Post engagement prompt — ask viewers about the game");
  }

  if (metrics.streamDurationMinutes >= 60 && metrics.superChatCount === 0) {
    actions.push("Thank viewers for watching — acknowledge long-time presence");
  }

  if (metrics.memberCount > 0 && metrics.streamDurationMinutes >= 30) {
    actions.push("Welcome members — highlight member benefits");
  }

  if (metrics.chatRate > 5) {
    actions.push("Pin a chat message — guide conversation during high activity");
    engagementScore += 0.1;
  }

  engagementScore = Math.min(1, engagementScore);
  const priority = engagementScore >= 0.6 ? "high" : engagementScore >= 0.3 ? "medium" : "low";

  return { actions, engagementScore, priority };
}

export function getCommunityPulse(
  recentChatMessages: number,
  uniqueChatters: number,
  viewerCount: number,
): { pulse: string; health: number; ratio: number } {
  if (viewerCount === 0) return { pulse: "inactive", health: 0, ratio: 0 };

  const ratio = uniqueChatters / viewerCount;
  const health = Math.min(1, (recentChatMessages / 100) * 0.5 + ratio * 0.5);

  const pulse = health >= 0.6 ? "vibrant" : health >= 0.3 ? "active" : health >= 0.1 ? "quiet" : "dormant";

  return { pulse, health, ratio };
}
