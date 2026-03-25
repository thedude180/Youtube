import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => {
  const rows: any[] = [];
  let nextId = 1;
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          returning: () => {
            const id = nextId++;
            const row = { ...v, id, createdAt: new Date() };
            rows.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => rows.slice(-5),
            orderBy: () => ({
              limit: (n: number) => rows.slice(-n),
            }),
          }),
          orderBy: () => ({
            limit: (n: number) => rows.slice(-n),
          }),
        }),
      }),
      update: () => ({
        set: (vals: any) => ({
          where: () => ({
            returning: () => [{ ...vals, id: 1, attempts: 2 }],
          }),
        }),
      }),
    },
  };
});

import { detectGame, getGameContext } from "../game-detection";
import { getWarRoomState } from "../war-room";
import { registerLiveTrigger, evaluateTriggers, seedDefaultLiveTriggers, getLiveTriggerLog } from "../event-triggers";
import { checkLiveTrustBudget, deductLiveTrust, getLiveTrustStatus } from "../live-trust";
import { generateLiveTitle, validateLiveTitle } from "../live-title";
import { processLiveChatEvent, getLiveChatPolicy } from "../live-chat-workflow";
import { scoreMoment } from "../moment-capture";
import { initiateHandoff, getHandoffStatus, getHandoffChecklist, updateHandoff } from "../post-stream-handoff";
import { getOptimalMonetizationWindow, scoreMonetizationTiming } from "../monetization-timing";
import { getCommerceOpportunities } from "../live-commerce";
import { checkLiveAccessibility } from "../live-accessibility";
import { classifyCoCreationSignal } from "../co-creation";
import { checkLiveAuthenticity, amplifyAuthenticitySignal } from "../live-authenticity";
import { activateCommunity, getCommunityPulse } from "../community-activation";
import { getLiveDegradationPlaybook, getAllLivePlaybooks } from "../live-degradation";
import { getLiveOverridePatterns, recordLiveOverride } from "../live-override-learning";

describe("Game Detection", () => {
  it("detects exact game match from title", () => {
    const result = detectGame("Elden Ring — Boss Rush No Commentary PS5");
    expect(result.gameTitle).toBe("Elden Ring");
    expect(result.confidence).toBe(0.95);
    expect(result.method).toBe("exact_match");
  });

  it("returns null for unknown game", () => {
    const result = detectGame("Random Title With No Game Name");
    expect(result.gameTitle).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns game context for souls-like", () => {
    const context = getGameContext("Elden Ring");
    expect(context.genre).toBe("souls-like");
    expect(context.seoKeywords).toContain("no commentary");
    expect(context.clipPotential).toContain("boss fights");
  });

  it("returns game context for horror", () => {
    const context = getGameContext("Resident Evil 4");
    expect(context.genre).toBe("horror");
    expect(context.seoKeywords).toContain("horror");
  });
});

describe("War Room", () => {
  it("returns idle state by default", () => {
    const state = getWarRoomState("user-test");
    expect(state.status).toBe("idle");
    expect(state.currentStreamId).toBeNull();
    expect(state.threatLevel).toBe("green");
  });
});

describe("Event Triggers", () => {
  it("registers and evaluates triggers", () => {
    registerLiveTrigger({
      id: "test-trigger",
      eventType: "test.event",
      condition: (p) => p.value > 10,
      action: "test_action",
      cooldownMs: 0,
      requiresJustification: false,
    });

    const actions = evaluateTriggers("test.event", { value: 15 });
    expect(actions).toContain("test_action");
  });

  it("respects cooldown", () => {
    registerLiveTrigger({
      id: "cooldown-trigger",
      eventType: "cool.event",
      condition: () => true,
      action: "cool_action",
      cooldownMs: 999999,
      requiresJustification: false,
    });

    evaluateTriggers("cool.event", {});
    const second = evaluateTriggers("cool.event", {});
    expect(second).not.toContain("cool_action");
  });

  it("seeds default triggers", () => {
    seedDefaultLiveTriggers();
    const actions = evaluateTriggers("viewer.count.updated", { count: 55, previousCount: 45 });
    expect(actions).toContain("celebrate_milestone_50");
  });
});

describe("Live Trust Budget", () => {
  it("allows actions within budget", () => {
    const check = checkLiveTrustBudget("trust-test", "title_change");
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(4);
  });

  it("deducts trust and tracks usage", () => {
    const userId = "trust-deduct-test";
    expect(deductLiveTrust(userId, "title_change")).toBe(true);
    const status = getLiveTrustStatus(userId);
    expect(status.titleChanges.used).toBe(1);
    expect(status.titleChanges.remaining).toBe(3);
  });

  it("blocks when budget exhausted", () => {
    const userId = "trust-exhaust-test";
    for (let i = 0; i < 4; i++) deductLiveTrust(userId, "title_change");
    const check = checkLiveTrustBudget(userId, "title_change");
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
  });
});

describe("Live Title", () => {
  it("generates live title with game name", () => {
    const title = generateLiveTitle("Elden Ring", { viewerCount: 150 });
    expect(title).toContain("🔴 LIVE:");
    expect(title).toContain("Elden Ring");
    expect(title).toContain("No Commentary");
    expect(title).toContain("PS5 4K");
  });

  it("validates title", () => {
    const result = validateLiveTitle("title-test", "🔴 LIVE: Elden Ring | No Commentary | PS5 4K");
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags clickbait titles", () => {
    const result = validateLiveTitle("title-test2", "INSANE CRAZY OMG gameplay");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.includes("clickbait"))).toBe(true);
  });
});

describe("Live Chat Workflow", () => {
  it("returns default policy", () => {
    const policy = getLiveChatPolicy("chat-test");
    expect(policy.autoRespond).toBe(true);
    expect(policy.moderationLevel).toBe("standard");
  });

  it("acknowledges super chats", () => {
    const result = processLiveChatEvent("chat-test", {
      messageId: "1",
      authorId: "a1",
      authorName: "viewer",
      content: "Great stream!",
      type: "superchat",
      amount: 10,
      currency: "USD",
    });
    expect(result.action).toBe("acknowledge_superchat");
    expect(result.trustAllowed).toBe(true);
  });

  it("welcomes new members", () => {
    const result = processLiveChatEvent("chat-test2", {
      messageId: "2",
      authorId: "a2",
      authorName: "new member",
      content: "",
      type: "membership",
    });
    expect(result.action).toBe("welcome_member");
  });
});

describe("Moment Capture", () => {
  it("scores boss fight moments high", () => {
    const score = scoreMoment("boss_fight", { viewerCount: 150 });
    expect(score.intensity).toBeGreaterThan(0.8);
    expect(score.clipPotential).toBeGreaterThan(0.9);
    expect(score.priority).toBe("critical");
  });

  it("scores ambient moments low", () => {
    const score = scoreMoment("ambient");
    expect(score.intensity).toBeLessThan(0.2);
    expect(score.priority).toBe("normal");
  });
});

describe("Post-Stream Handoff", () => {
  it("initiates handoff checklist", () => {
    const checklist = initiateHandoff("handoff-test", "stream-1");
    expect(checklist.vodProcessed).toBe(false);
    expect(checklist.seoOptimized).toBe(false);
  });

  it("tracks handoff progress", () => {
    initiateHandoff("handoff-test2", "stream-2");
    updateHandoff("handoff-test2", "stream-2", { vodProcessed: true, thumbnailGenerated: true });
    const status = getHandoffStatus("handoff-test2", "stream-2");
    expect(status).not.toBeNull();
    expect(status!.progress).toBeGreaterThan(0);
    expect(status!.checklist.vodProcessed).toBe(true);
  });

  it("returns checklist items", () => {
    const items = getHandoffChecklist();
    expect(items.length).toBe(7);
    expect(items[0]).toContain("VOD");
  });
});

describe("Monetization Timing", () => {
  it("recommends immediate action at peak", () => {
    const result = getOptimalMonetizationWindow(60, 100, 105);
    expect(result.window).toBe("now");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("suggests waiting early in stream", () => {
    const result = getOptimalMonetizationWindow(5, 20, 20);
    expect(result.window).toBe("wait");
  });

  it("scores monetization timing", () => {
    const result = scoreMonetizationTiming("membership_drive", 45, 150);
    expect(result.score).toBeGreaterThan(0.5);
    expect(["go", "wait", "skip"]).toContain(result.recommendation);
  });
});

describe("Commerce Opportunities", () => {
  it("suggests opportunities based on context", () => {
    const opps = getCommerceOpportunities(120, 45);
    expect(opps.length).toBeGreaterThan(0);
    expect(opps.some(o => o.includes("membership"))).toBe(true);
  });

  it("returns empty for low viewership", () => {
    const opps = getCommerceOpportunities(5, 10);
    expect(opps).toHaveLength(0);
  });
});

describe("Live Accessibility", () => {
  it("scores accessible stream config", () => {
    const result = checkLiveAccessibility({
      hasCaptions: true,
      chatModeration: true,
      thumbnailAltText: true,
    });
    expect(result.score).toBeGreaterThan(0.6);
    expect(["AAA", "AA"]).toContain(result.level);
    expect(result.issues).toHaveLength(0);
  });

  it("flags missing captions", () => {
    const result = checkLiveAccessibility({});
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe("Co-Creation Signals", () => {
  it("detects gameplay suggestion", () => {
    const result = classifyCoCreationSignal("Try going to the hidden area behind the waterfall");
    expect(result.isCoCreation).toBe(true);
    expect(result.signalType).toBe("gameplay_suggestion");
  });

  it("detects challenge", () => {
    const result = classifyCoCreationSignal("I challenge you to beat this level!");
    expect(result.isCoCreation).toBe(true);
    expect(result.signalType).toBe("challenge");
  });

  it("ignores normal chat", () => {
    const result = classifyCoCreationSignal("lol");
    expect(result.isCoCreation).toBe(false);
  });
});

describe("Live Authenticity", () => {
  it("passes authentic stream", () => {
    const result = checkLiveAuthenticity({
      title: "Elden Ring — No Commentary PS5",
      viewerCount: 50,
      chatActivityRate: 0.1,
      isPreRecordedContent: false,
    });
    expect(result.authentic).toBe(true);
    expect(result.score).toBe(1);
  });

  it("flags pre-recorded content", () => {
    const result = checkLiveAuthenticity({
      title: "Test",
      viewerCount: 100,
      chatActivityRate: 0.01,
      isPreRecordedContent: true,
    });
    expect(result.authentic).toBe(false);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it("amplifies authenticity signals", () => {
    const result = amplifyAuthenticitySignal({
      avgSessionDuration: 120,
      chatInteractionRate: 0.08,
      organicViewerGrowth: true,
      consistentSchedule: true,
    });
    expect(result.signal).toBeGreaterThan(0.8);
    expect(result.factors.length).toBeGreaterThan(0);
  });
});

describe("Community Activation", () => {
  it("suggests actions for engaged community", () => {
    const result = activateCommunity({
      viewerCount: 100,
      chatRate: 0.5,
      memberCount: 10,
      superChatCount: 2,
      streamDurationMinutes: 60,
    });
    expect(result.engagementScore).toBeGreaterThan(0.3);
    expect(["high", "medium", "low"]).toContain(result.priority);
  });

  it("measures community pulse", () => {
    const pulse = getCommunityPulse(50, 20, 100);
    expect(["vibrant", "active", "quiet", "dormant"]).toContain(pulse.pulse);
    expect(pulse.ratio).toBe(0.2);
  });
});

describe("Degradation Playbooks", () => {
  it("returns playbook for YouTube API quota", () => {
    const playbook = getLiveDegradationPlaybook("youtube", "api_quota_exceeded");
    expect(playbook).not.toBeNull();
    expect(playbook!.steps.length).toBeGreaterThan(0);
    expect(playbook!.autoExecute).toBe(true);
  });

  it("returns null for unknown failure", () => {
    const playbook = getLiveDegradationPlaybook("unknown", "unknown");
    expect(playbook).toBeNull();
  });

  it("lists all playbooks", () => {
    const all = getAllLivePlaybooks();
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Override Learning", () => {
  it("records and retrieves override patterns", () => {
    const userId = "override-test";
    recordLiveOverride(userId, "stream-1", "title_change", "old title", "new title", "not catchy enough");
    recordLiveOverride(userId, "stream-1", "title_change", "old2", "new2", "not catchy enough");
    recordLiveOverride(userId, "stream-1", "title_change", "old3", "new3", "not catchy enough");

    const patterns = getLiveOverridePatterns(userId);
    expect(patterns.totalOverrides).toBe(3);
    expect(patterns.patterns[0].actionType).toBe("title_change");
    expect(patterns.suggestions.length).toBeGreaterThan(0);
  });
});
