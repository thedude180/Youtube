import { emitDomainEvent } from "../kernel/index";

export type InboxSignalPriority = "critical" | "high" | "medium" | "low" | "info";
export type InboxSignalCategory = "live" | "content" | "revenue" | "compliance" | "growth" | "system";

export interface InboxSignal {
  id: string;
  category: InboxSignalCategory;
  priority: InboxSignalPriority;
  title: string;
  summary: string;
  source: string;
  actionRequired: boolean;
  suggestedAction?: string;
  expiresAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  readAt?: Date;
  actedAt?: Date;
}

const inboxStore = new Map<string, InboxSignal[]>();

function getUserInbox(userId: string): InboxSignal[] {
  if (!inboxStore.has(userId)) inboxStore.set(userId, []);
  return inboxStore.get(userId)!;
}

export function pushSignal(userId: string, signal: Omit<InboxSignal, "id" | "createdAt">): InboxSignal {
  const inbox = getUserInbox(userId);
  const entry: InboxSignal = {
    ...signal,
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date(),
  };

  inbox.unshift(entry);

  if (inbox.length > 200) inbox.length = 200;

  return entry;
}

export function getInbox(
  userId: string,
  filters?: { category?: InboxSignalCategory; priority?: InboxSignalPriority; unreadOnly?: boolean; limit?: number }
): InboxSignal[] {
  let signals = getUserInbox(userId);

  if (filters?.category) signals = signals.filter((s) => s.category === filters.category);
  if (filters?.priority) signals = signals.filter((s) => s.priority === filters.priority);
  if (filters?.unreadOnly) signals = signals.filter((s) => !s.readAt);

  return signals.slice(0, filters?.limit || 50);
}

export function markRead(userId: string, signalId: string): boolean {
  const inbox = getUserInbox(userId);
  const signal = inbox.find((s) => s.id === signalId);
  if (signal) { signal.readAt = new Date(); return true; }
  return false;
}

export function markActed(userId: string, signalId: string): boolean {
  const inbox = getUserInbox(userId);
  const signal = inbox.find((s) => s.id === signalId);
  if (signal) { signal.actedAt = new Date(); return true; }
  return false;
}

export function getInboxSummary(userId: string): {
  total: number;
  unread: number;
  actionRequired: number;
  byPriority: Record<InboxSignalPriority, number>;
  byCategory: Record<InboxSignalCategory, number>;
} {
  const inbox = getUserInbox(userId);
  const summary = {
    total: inbox.length,
    unread: inbox.filter((s) => !s.readAt).length,
    actionRequired: inbox.filter((s) => s.actionRequired && !s.actedAt).length,
    byPriority: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<InboxSignalPriority, number>,
    byCategory: { live: 0, content: 0, revenue: 0, compliance: 0, growth: 0, system: 0 } as Record<InboxSignalCategory, number>,
  };

  for (const s of inbox) {
    summary.byPriority[s.priority]++;
    summary.byCategory[s.category]++;
  }

  return summary;
}

export async function pushLiveSignal(
  userId: string,
  title: string,
  summary: string,
  priority: InboxSignalPriority,
  metadata: Record<string, any> = {}
): Promise<InboxSignal> {
  const signal = pushSignal(userId, {
    category: "live",
    priority,
    title,
    summary,
    source: "live-ops",
    actionRequired: priority === "critical" || priority === "high",
    suggestedAction: priority === "critical" ? "Review immediately in Live War Room" : undefined,
    metadata,
  });

  if (priority === "critical" || priority === "high") {
    try {
      await emitDomainEvent(userId, "smart_inbox.live_signal", {
        signalId: signal.id,
        title,
        priority,
      }, "smart-inbox", signal.id);
    } catch (_) {}
  }

  return signal;
}
