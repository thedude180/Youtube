export interface LiveTrigger {
  id: string;
  eventType: string;
  condition: (payload: any) => boolean;
  action: string;
  cooldownMs: number;
  requiresJustification: boolean;
}

const triggerRegistry: LiveTrigger[] = [];
const triggerLog: { triggerId: string; firedAt: Date; eventType: string; action: string }[] = [];
const lastFired = new Map<string, number>();

export function registerLiveTrigger(trigger: LiveTrigger): void {
  const existing = triggerRegistry.findIndex(t => t.id === trigger.id);
  if (existing >= 0) {
    triggerRegistry[existing] = trigger;
  } else {
    triggerRegistry.push(trigger);
  }
}

export function evaluateTriggers(eventType: string, payload: any): string[] {
  const now = Date.now();
  const firedActions: string[] = [];

  for (const trigger of triggerRegistry) {
    if (trigger.eventType !== eventType) continue;

    const lastTime = lastFired.get(trigger.id) || 0;
    if (now - lastTime < trigger.cooldownMs) continue;

    try {
      if (trigger.condition(payload)) {
        firedActions.push(trigger.action);
        lastFired.set(trigger.id, now);
        triggerLog.push({
          triggerId: trigger.id,
          firedAt: new Date(),
          eventType,
          action: trigger.action,
        });
      }
    } catch {
    }
  }

  return firedActions;
}

export function getLiveTriggerLog(limit = 50) {
  return triggerLog.slice(-limit);
}

export function seedDefaultLiveTriggers(): void {
  registerLiveTrigger({
    id: "viewer-milestone-50",
    eventType: "viewer.count.updated",
    condition: (p) => p.count >= 50 && p.previousCount < 50,
    action: "celebrate_milestone_50",
    cooldownMs: 300000,
    requiresJustification: false,
  });

  registerLiveTrigger({
    id: "viewer-milestone-100",
    eventType: "viewer.count.updated",
    condition: (p) => p.count >= 100 && p.previousCount < 100,
    action: "celebrate_milestone_100",
    cooldownMs: 300000,
    requiresJustification: false,
  });

  registerLiveTrigger({
    id: "chat-spam-detection",
    eventType: "chat.message.batch",
    condition: (p) => {
      const msgs = p.messages || [];
      if (msgs.length < 10) return false;
      const uniqueAuthors = new Set(msgs.map((m: any) => m.authorId)).size;
      return uniqueAuthors / msgs.length < 0.3;
    },
    action: "moderate_chat_spam",
    cooldownMs: 60000,
    requiresJustification: true,
  });

  registerLiveTrigger({
    id: "viewer-drop-alert",
    eventType: "viewer.count.updated",
    condition: (p) => p.previousCount > 0 && p.count / p.previousCount < 0.5,
    action: "alert_viewer_drop",
    cooldownMs: 600000,
    requiresJustification: false,
  });
}
