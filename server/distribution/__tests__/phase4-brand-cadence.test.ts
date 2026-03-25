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
          catch: () => Promise.resolve(),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [],
            orderBy: () => ({
              limit: () => [],
            }),
          }),
          orderBy: () => ({
            limit: () => [],
          }),
        }),
      }),
    },
  };
});

vi.mock("../../kernel/index", () => ({
  emitDomainEvent: async () => {},
}));

vi.mock("../../content/brand-system", () => ({
  getBrandProfile: () => ({
    voiceTone: "cinematic-immersive",
    colorPalette: ["#1a1a2e", "#16213e", "#0f3460", "#e94560"],
    contentPillars: ["no-commentary gameplay", "highlight reels", "full playthroughs"],
    audiencePersona: "gaming enthusiasts who prefer pure gameplay",
    brandValues: ["authenticity", "quality", "immersion", "consistency"],
    channelIdentity: "PS5 no-commentary gaming channel",
  }),
  checkBrandAlignment: (_content: any, _profile: any) => ({
    aligned: true,
    score: 0.8,
    issues: [],
  }),
}));

import {
  scoreBrandConsistency,
  getBrandElements,
} from "../brand-recognition";

import {
  adaptBrandForPlatform,
  getPlatformBrandSpec,
  adaptForAllPlatforms,
} from "../adaptive-brand";

import {
  packageForPlatform,
  getPackagingSpec,
  packageForAllPlatforms,
} from "../cross-platform-packaging";

describe("Brand Recognition", () => {
  it("scores brand consistency", async () => {
    const result = await scoreBrandConsistency("brand-user");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
    expect(result.platformScores).toBeDefined();
    expect(typeof result.driftDetected).toBe("boolean");
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("returns brand elements", async () => {
    const elements = await getBrandElements("brand-user");
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);
    expect(elements[0]).toHaveProperty("element");
    expect(elements[0]).toHaveProperty("score");
    expect(elements[0]).toHaveProperty("platforms");
  });
});

describe("Adaptive Brand", () => {
  it("adapts brand for YouTube", async () => {
    const result = await adaptBrandForPlatform("user1", "youtube", {
      title: "Elden Ring Boss Fight — No Commentary PS5 4K",
      description: "Full gameplay walkthrough",
      tags: ["elden ring", "ps5", "gameplay"],
    });
    expect(result.platform).toBe("youtube");
    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.thumbnailSpec.width).toBe(1280);
    expect(result.thumbnailSpec.height).toBe(720);
  });

  it("adapts brand for TikTok with hashtags", async () => {
    const result = await adaptBrandForPlatform("user1", "tiktok", {
      title: "Epic Boss Fight",
      description: "Quick clip",
      tags: ["eldenring", "ps5", "gaming"],
    });
    expect(result.platform).toBe("tiktok");
    expect(result.title).toContain("#");
    expect(result.thumbnailSpec.width).toBe(1080);
    expect(result.thumbnailSpec.height).toBe(1920);
  });

  it("truncates long titles", async () => {
    const result = await adaptBrandForPlatform("user1", "youtube", {
      title: "A".repeat(120),
      description: "test",
      tags: [],
    });
    expect(result.title.length).toBeLessThanOrEqual(100);
    expect(result.contentNotes.some(n => n.includes("truncated"))).toBe(true);
  });

  it("shortens punchy titles for TikTok", async () => {
    const result = await adaptBrandForPlatform("user1", "tiktok", {
      title: "Elden Ring Shadow of the Erdtree — No Commentary Full Walkthrough PS5 4K HDR",
      description: "test",
      tags: ["gaming"],
    });
    expect(result.platform).toBe("tiktok");
    expect(result.title.length).toBeLessThanOrEqual(150);
  });

  it("returns platform spec", () => {
    const spec = getPlatformBrandSpec("youtube");
    expect(spec.maxTitleLength).toBe(100);
    expect(spec.thumbnailWidth).toBe(1280);
  });

  it("adapts for all platforms", async () => {
    const results = await adaptForAllPlatforms("user1", {
      title: "Test Video",
      description: "desc",
      tags: ["tag1"],
    }, ["youtube", "tiktok", "x"]);
    expect(results).toHaveLength(3);
    expect(results[0].platform).toBe("youtube");
    expect(results[1].platform).toBe("tiktok");
    expect(results[2].platform).toBe("x");
  });
});

describe("Cross-Platform Packaging", () => {
  it("packages for YouTube landscape format", async () => {
    const result = await packageForPlatform("user1", "youtube", {
      title: "Boss Fight Gameplay",
      description: "Full walkthrough",
      tags: ["gaming"],
      durationSeconds: 3600,
    });
    expect(result.format).toBe("landscape");
    expect(result.aspectRatio).toBe("16:9");
    expect(result.maxDurationSeconds).toBeNull();
    expect(result.thumbnailRequired).toBe(true);
  });

  it("packages for TikTok portrait format", async () => {
    const result = await packageForPlatform("user1", "tiktok", {
      title: "Quick Clip",
      description: "Short clip",
      tags: ["gaming"],
      durationSeconds: 120,
    });
    expect(result.format).toBe("portrait");
    expect(result.aspectRatio).toBe("9:16");
    expect(result.maxDurationSeconds).toBe(600);
  });

  it("flags content exceeding platform duration", async () => {
    const result = await packageForPlatform("user1", "tiktok", {
      title: "Long Video",
      description: "desc",
      tags: [],
      durationSeconds: 700,
    });
    expect(result.platformNotes.some(n => n.includes("max duration") || n.includes("trimming"))).toBe(true);
  });

  it("packages for X as text-only", async () => {
    const result = await packageForPlatform("user1", "x", {
      title: "New gameplay clip",
      description: "Check it out",
      tags: ["ps5"],
      durationSeconds: 30,
    });
    expect(result.format).toBe("text_only");
    expect(result.platformNotes.some(n => n.includes("text"))).toBe(true);
  });

  it("returns packaging spec", () => {
    const spec = getPackagingSpec("tiktok");
    expect(spec.format).toBe("portrait");
    expect(spec.aspectRatio).toBe("9:16");
  });

  it("packages for all platforms", async () => {
    const results = await packageForAllPlatforms("user1", {
      title: "Test Video",
      description: "desc",
      tags: ["tag1"],
    }, ["youtube", "tiktok"]);
    expect(results).toHaveLength(2);
    expect(results[0].format).toBe("landscape");
    expect(results[1].format).toBe("portrait");
  });
});

describe("Cadence Intelligence", () => {
  it("imports and exports correctly", async () => {
    const mod = await import("../cadence-intelligence");
    expect(typeof mod.analyzeCadence).toBe("function");
    expect(typeof mod.getCadenceHistory).toBe("function");
  });

  it("analyzes cadence for a user", async () => {
    const { analyzeCadence } = await import("../cadence-intelligence");
    const result = await analyzeCadence("cadence-user", ["youtube"]);
    expect(result.userId).toBe("cadence-user");
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.overallHealth).toBeGreaterThanOrEqual(0);
    expect(result.overallHealth).toBeLessThanOrEqual(1);
    expect(result.burnoutRisk).toBeGreaterThanOrEqual(0);
  });
});

describe("Cadence Resilience", () => {
  it("assesses buffer health", async () => {
    const { assessBufferHealth } = await import("../cadence-resilience");
    const result = await assessBufferHealth("resilience-user");
    expect(result.userId).toBe("resilience-user");
    expect(Array.isArray(result.buffers)).toBe(true);
    expect(result.overallResilience).toBeGreaterThanOrEqual(0);
    expect(result.overallResilience).toBeLessThanOrEqual(1);
    expect(typeof result.breakSafetyDays).toBe("number");
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("evaluates break readiness", async () => {
    const { getBreakReadiness } = await import("../cadence-resilience");
    const result = await getBreakReadiness("resilience-user", 7);
    expect(typeof result.feasible).toBe("boolean");
    expect(Array.isArray(result.platformsAtRisk)).toBe(true);
    expect(Array.isArray(result.prepActions)).toBe(true);
  });
});

describe("Content Timing", () => {
  it("analyzes content timing", async () => {
    const { analyzeContentTiming } = await import("../content-timing");
    const result = await analyzeContentTiming("timing-user", "youtube");
    expect(result.userId).toBe("timing-user");
    expect(result.platform).toBe("youtube");
    expect(Array.isArray(result.bestWindows)).toBe(true);
    expect(result.bestWindows.length).toBeGreaterThan(0);
    expect(result.bestWindows[0]).toHaveProperty("dayOfWeek");
    expect(result.bestWindows[0]).toHaveProperty("hourOfDay");
    expect(result.bestWindows[0]).toHaveProperty("score");
  });

  it("returns best publish time", async () => {
    const { getBestPublishTime } = await import("../content-timing");
    const result = await getBestPublishTime("timing-user", "youtube");
    expect(result.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(result.dayOfWeek).toBeLessThanOrEqual(6);
    expect(result.hourOfDay).toBeGreaterThanOrEqual(0);
    expect(result.hourOfDay).toBeLessThanOrEqual(23);
    expect(result.dayName).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns default timing for TikTok", async () => {
    const { analyzeContentTiming } = await import("../content-timing");
    const result = await analyzeContentTiming("timing-user", "tiktok");
    expect(result.platform).toBe("tiktok");
    expect(result.bestWindows.length).toBeGreaterThan(0);
  });
});
