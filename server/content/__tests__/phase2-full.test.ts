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
          onConflictDoNothing: () => ({ returning: () => [] }),
        }),
      }),
      select: (cols?: any) => ({
        from: (table: any) => ({
          where: (...args: any[]) => ({
            limit: (n: number) => [],
            orderBy: (...o: any[]) => ({
              limit: (n: number) => rows.slice(-n),
            }),
          }),
          orderBy: (...o: any[]) => ({
            limit: (n: number) => rows.slice(-n),
          }),
        }),
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (...args: any[]) => ({
            returning: () => [{ ...vals, id: 1 }],
          }),
        }),
      }),
      execute: () => Promise.resolve([]),
    },
  };
});

vi.mock("../../kernel/index", () => ({
  emitDomainEvent: vi.fn().mockResolvedValue(undefined),
}));

import { analyzeSEO, scoreSEOHealth } from "../seo-lab";
import { generateThumbnailVariants, scoreThumbnail, selectBestThumbnail } from "../thumbnail-lab";
import { checkBrandAlignment, getBrandProfile } from "../brand-system";
import { checkVoiceConsistency, getVoiceProfile } from "../voice-guardian";
import { checkAuthenticity } from "../authenticity-gate";
import { scoreBrandSafety } from "../brand-safety";
import { checkAccessibility, generateAltText } from "../accessibility";
import { generateDisclosure, checkDisclosureCompliance } from "../ai-disclosure";
import { detectLanguage } from "../multilingual";
import { predictPerformance, getOracleRecommendation } from "../pre-creation-oracle";
import { optimizePlaylistOrder } from "../playlist-foundation";
import { getMomentTaxonomy } from "../moment-genome";
import { optimizeSubtitles, formatSRT } from "../subtitle-intelligence";
import { validateExplanationContract } from "../../kernel/confidence-router";
import { getImmuneStatus, detectThreat } from "../../kernel/channel-immune";
import { getSkillRegistry, seedDefaultSkills } from "../../kernel/skill-compiler";
import { getSafetyThreshold } from "../safe-to-automate";

describe("SEO Lab", () => {
  it("analyzes SEO with good content", () => {
    const result = analyzeSEO(
      "Elden Ring — No Hit Run | Full Boss Guide",
      "Complete no-hit walkthrough of every boss in Elden Ring on PS5. Timestamps, strategies, and cinematic gameplay at 4K 60fps.",
      ["elden ring", "no hit run", "ps5", "boss guide", "gameplay", "walkthrough", "4k", "soulsborne", "fromsoftware", "dark souls"],
      "Elden Ring",
    );
    expect(result.overallScore).toBeGreaterThan(0.5);
    expect(result.titleScore).toBeGreaterThan(0.6);
    expect(result.tagScore).toBeGreaterThan(0.6);
  });

  it("flags short titles", () => {
    const result = analyzeSEO("Short", "desc", [], undefined);
    expect(result.suggestions.some(s => s.field === "title")).toBe(true);
  });

  it("computes SEO health across multiple analyses", () => {
    const analyses = [
      analyzeSEO("Good Title — Game | PS5", "Long description here for testing purposes with enough content", ["tag1", "tag2", "tag3", "tag4", "tag5"]),
      analyzeSEO("X", "", []),
    ];
    const health = scoreSEOHealth("user1", analyses);
    expect(health.avgScore).toBeGreaterThan(0);
    expect(["improving", "stable", "declining"]).toContain(health.trend);
  });
});

describe("Thumbnail Lab", () => {
  it("generates thumbnail variants", async () => {
    const variants = await generateThumbnailVariants("user1", "Elden Ring Highlights", "Elden Ring", { count: 3 });
    expect(variants).toHaveLength(3);
    expect(variants[0].style).toBeTruthy();
    expect(variants[0].score).toBeGreaterThan(0);
  });

  it("scores and selects best thumbnail", async () => {
    const variants = await generateThumbnailVariants("user1", "Test", "Test");
    const best = selectBestThumbnail(variants);
    expect(best).toBeTruthy();
    expect(best!.score).toBeGreaterThan(0);
  });
});

describe("Brand System", () => {
  it("returns brand profile", () => {
    const profile = getBrandProfile("user1");
    expect(profile.voiceTone).toBe("cinematic-immersive");
    expect(profile.contentPillars).toContain("no-commentary gameplay");
  });

  it("checks brand alignment", () => {
    const profile = getBrandProfile("user1");
    const result = checkBrandAlignment({ title: "Elden Ring — Full Playthrough" }, profile);
    expect(result.aligned).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("detects clickbait misalignment", () => {
    const profile = getBrandProfile("user1");
    const result = checkBrandAlignment({ title: "CLICK NOW!!! SUBSCRIBE!!!" }, profile);
    expect(result.aligned).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("Voice Guardian", () => {
  it("approves cinematic voice", () => {
    const result = checkVoiceConsistency("user1", "Elden Ring — No Commentary Walkthrough", { isTitle: true });
    expect(result.consistent).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("flags YouTuber cliches", () => {
    const result = checkVoiceConsistency("user1", "Hey guys smash that like button", { isTitle: true });
    expect(result.consistent).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("returns voice profile", () => {
    const profile = getVoiceProfile("user1");
    expect(profile.tone).toBe("cinematic-immersive");
    expect(profile.forbidden.length).toBeGreaterThan(0);
  });
});

describe("Authenticity Gate", () => {
  it("passes authentic content", async () => {
    const result = await checkAuthenticity("user1", { title: "Dark Souls III — Full Playthrough" });
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("flags marketing pressure language", async () => {
    const result = await checkAuthenticity("user1", { title: "BUY NOW! Limited time offer act fast!" });
    expect(result.flags.length).toBeGreaterThan(0);
  });
});

describe("Brand Safety", () => {
  it("scores clean gaming content as safe", () => {
    const result = scoreBrandSafety({ title: "Elden Ring — Cinematic Walkthrough", tags: ["elden ring", "gameplay"] });
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.category).toBe("safe");
  });

  it("detects undisclosed sponsorship", () => {
    const result = scoreBrandSafety({ title: "Best Gaming Chair — paid promotion partner deal" });
    expect(result.flags.some(f => f.toLowerCase().includes("sponsor"))).toBe(true);
  });
});

describe("Accessibility", () => {
  it("checks content accessibility", () => {
    const result = checkAccessibility({ title: "Test", hasSubtitles: true, description: "A long enough description for accessibility purposes with good detail" });
    expect(result.score).toBeGreaterThan(0.5);
    expect(["AAA", "AA", "A"]).toContain(result.level);
  });

  it("generates alt text", () => {
    const alt = generateAltText({ title: "Boss Fight", gameTitle: "Elden Ring", momentType: "boss_fight" });
    expect(alt).toContain("Elden Ring");
    expect(alt).toContain("boss fight");
  });
});

describe("AI Disclosure", () => {
  it("generates disclosure for AI content", () => {
    const result = generateDisclosure({ isAiGenerated: true, aiComponents: ["thumbnail", "title"], platform: "youtube" });
    expect(result.required).toBe(true);
    expect(result.disclosureText).toContain("thumbnail");
  });

  it("checks disclosure compliance", () => {
    const result = checkDisclosureCompliance("This video uses AI-generated thumbnails", ["thumbnail"]);
    expect(result.compliant).toBe(true);
  });
});

describe("Language Detection", () => {
  it("detects English", () => {
    const result = detectLanguage("This is a gameplay walkthrough");
    expect(result.language).toBe("en");
  });

  it("detects Japanese", () => {
    const result = detectLanguage("これはゲームプレイのウォークスルーです。エルデンリングのボス戦をお楽しみください");
    expect(result.language).toBe("ja");
  });
});

describe("Pre-Creation Oracle", () => {
  it("predicts performance", () => {
    const prediction = predictPerformance("user1", {
      title: "Elden Ring — No Hit Boss Run",
      description: "Complete no-hit walkthrough of all bosses in Elden Ring on PS5 with cinematic gameplay at 4K resolution",
      tags: ["elden ring", "boss", "no hit", "ps5", "gameplay"],
      gameTitle: "Elden Ring",
    });
    expect(prediction.overallScore).toBeGreaterThan(0);
    expect(["go", "caution", "no-go"]).toContain(prediction.goNoGo);
  });

  it("generates recommendation text", () => {
    const prediction = predictPerformance("user1", {
      title: "Test", description: "Short", tags: [],
    });
    const rec = getOracleRecommendation(prediction);
    expect(rec.length).toBeGreaterThan(0);
  });
});

describe("Confidence Router", () => {
  it("validates explanation contract", () => {
    const valid = validateExplanationContract({
      agentName: "nia-okafor",
      actionType: "title_suggestion",
      payload: {},
      confidence: 0.85,
      evidence: [{ type: "seo_analysis", score: 0.9 }],
      risk: "low",
    });
    expect(valid.valid).toBe(true);
  });

  it("detects missing contract fields", () => {
    const invalid = validateExplanationContract({
      agentName: "test",
      actionType: "",
      payload: {},
      confidence: 0.5,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.missing).toContain("actionType");
  });
});

describe("Channel Immune System", () => {
  it("detects copyright threats", () => {
    const threats = detectThreat({ copyrightClaims: 2 });
    expect(threats.length).toBeGreaterThan(0);
    expect(threats[0].threatType).toBe("copyright_strike");
    expect(threats[0].severity).toBe("critical");
  });

  it("returns immune status", () => {
    const status = getImmuneStatus();
    expect(status.immunityScore).toBeDefined();
    expect(status.lastScan).toBeDefined();
  });
});

describe("Skill Compiler", () => {
  it("seeds default skills", () => {
    seedDefaultSkills();
    const skills = getSkillRegistry();
    expect(skills.length).toBeGreaterThanOrEqual(3);
    expect(skills.some(s => s.name === "highlight-reel-generator")).toBe(true);
  });
});

describe("Safe to Automate", () => {
  it("returns thresholds for action types", () => {
    expect(getSafetyThreshold("publish_video")).toBe(0.8);
    expect(getSafetyThreshold("update_tags")).toBe(0.5);
    expect(getSafetyThreshold("unknown_action")).toBe(0.7);
  });
});

describe("Moment Genome", () => {
  it("returns taxonomy", () => {
    const taxonomy = getMomentTaxonomy();
    expect(taxonomy.boss_fight).toBeTruthy();
    expect(taxonomy.boss_fight.clipPotential).toBeGreaterThan(0.8);
    expect(taxonomy.ambient.clipPotential).toBeLessThan(0.2);
  });
});

describe("Subtitle Intelligence", () => {
  it("optimizes subtitle timing", () => {
    const segments = [
      { startTime: 0, endTime: 0.5, text: "Short", language: "en" },
      { startTime: 5, endTime: 15, text: "A very long subtitle that exceeds the character limit for readability", language: "en" },
    ];
    const { optimized, changes } = optimizeSubtitles(segments);
    expect(changes.length).toBeGreaterThan(0);
    expect(optimized[0].endTime).toBe(1);
  });

  it("formats SRT", () => {
    const srt = formatSRT([{ startTime: 0, endTime: 2, text: "Hello", language: "en" }]);
    expect(srt).toContain("00:00:00,000");
    expect(srt).toContain("Hello");
  });
});

describe("Playlist Foundation", () => {
  it("optimizes playlist order by performance", () => {
    const entries = [
      { videoId: 1, position: 0, addedAt: new Date() },
      { videoId: 2, position: 1, addedAt: new Date() },
      { videoId: 3, position: 2, addedAt: new Date() },
    ];
    const perf = [
      { videoId: 1, views: 100, retention: 0.3 },
      { videoId: 2, views: 500, retention: 0.8 },
      { videoId: 3, views: 200, retention: 0.6 },
    ];
    const optimized = optimizePlaylistOrder(entries, perf);
    expect(optimized[0].videoId).toBe(2);
  });
});
