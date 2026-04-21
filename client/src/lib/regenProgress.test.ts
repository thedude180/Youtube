import { describe, it, expect } from "vitest";
import {
  REGEN_STEPS,
  STEP_DURATION_MS,
  TICK_MS,
  calcProgressPct,
  getStepOpacityClass,
} from "./regenProgress";

describe("REGEN_STEPS", () => {
  it("has exactly three steps", () => {
    expect(REGEN_STEPS).toHaveLength(3);
  });

  it("steps are Drafting, Reviewing, Finalising in order", () => {
    expect(REGEN_STEPS[0]).toMatch(/Drafting/);
    expect(REGEN_STEPS[1]).toMatch(/Reviewing/);
    expect(REGEN_STEPS[2]).toMatch(/Finalising/);
  });
});

describe("calcProgressPct", () => {
  it("returns 0 at step 0 with no intra-step progress", () => {
    expect(calcProgressPct(0, 0)).toBe(0);
  });

  it("defaults sseStepIndex to 0 when undefined", () => {
    expect(calcProgressPct(undefined, 0)).toBe(calcProgressPct(0, 0));
  });

  it("step 0 mid-way is in range 0–33%", () => {
    const pct = calcProgressPct(0, STEP_DURATION_MS * 0.5);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(33.34);
  });

  it("step 1 at start is ~33.3%", () => {
    expect(calcProgressPct(1, 0)).toBeCloseTo(33.33, 1);
  });

  it("step 1 mid-way is in range 33–66%", () => {
    const pct = calcProgressPct(1, STEP_DURATION_MS * 0.5);
    expect(pct).toBeGreaterThan(33.33);
    expect(pct).toBeLessThan(66.67);
  });

  it("step 2 at start is ~66.7%", () => {
    expect(calcProgressPct(2, 0)).toBeCloseTo(66.67, 1);
  });

  it("step 2 mid-way is in range 66–95%", () => {
    const pct = calcProgressPct(2, STEP_DURATION_MS * 0.5);
    expect(pct).toBeGreaterThan(66.67);
    expect(pct).toBeLessThanOrEqual(95);
  });

  it("caps at 95% so the bar never appears fully done during generation", () => {
    expect(calcProgressPct(2, STEP_DURATION_MS)).toBe(95);
    expect(calcProgressPct(2, STEP_DURATION_MS * 2)).toBe(95);
  });

  it("returns 100 when completing regardless of step index", () => {
    expect(calcProgressPct(0, 0, true)).toBe(100);
    expect(calcProgressPct(1, 0, true)).toBe(100);
    expect(calcProgressPct(2, STEP_DURATION_MS, true)).toBe(100);
  });

  it("completing overrides the 95% cap", () => {
    expect(calcProgressPct(2, STEP_DURATION_MS, true)).toBe(100);
  });

  it("intraStepMs is capped at 90% of STEP_DURATION_MS internally", () => {
    const atMax = calcProgressPct(0, STEP_DURATION_MS * 0.9);
    const overMax = calcProgressPct(0, STEP_DURATION_MS * 2);
    expect(atMax).toBe(overMax);
  });

  it("each step boundary is evenly spaced at 1/3 of total progress", () => {
    const step0 = calcProgressPct(0, 0);
    const step1 = calcProgressPct(1, 0);
    const step2 = calcProgressPct(2, 0);
    expect(step1 - step0).toBeCloseTo(33.33, 1);
    expect(step2 - step1).toBeCloseTo(33.33, 1);
  });
});

describe("getStepOpacityClass", () => {
  it("active step 0 (Drafting) is opacity-100", () => {
    const cls = getStepOpacityClass(0, 0);
    expect(cls).toContain("opacity-100");
    expect(cls).toContain("font-medium");
  });

  it("active step 1 (Reviewing) is opacity-100", () => {
    const cls = getStepOpacityClass(1, 1);
    expect(cls).toContain("opacity-100");
    expect(cls).toContain("font-medium");
  });

  it("active step 2 (Finalising) is opacity-100", () => {
    const cls = getStepOpacityClass(2, 2);
    expect(cls).toContain("opacity-100");
    expect(cls).toContain("font-medium");
  });

  it("past steps (before active) are opacity-50", () => {
    expect(getStepOpacityClass(0, 1)).toContain("opacity-50");
    expect(getStepOpacityClass(0, 2)).toContain("opacity-50");
    expect(getStepOpacityClass(1, 2)).toContain("opacity-50");
  });

  it("future steps (after active) are opacity-30", () => {
    expect(getStepOpacityClass(1, 0)).toContain("opacity-30");
    expect(getStepOpacityClass(2, 0)).toContain("opacity-30");
    expect(getStepOpacityClass(2, 1)).toContain("opacity-30");
  });

  it("at step 0: only Drafting is active; Reviewing and Finalising are dimmed", () => {
    expect(getStepOpacityClass(0, 0)).toContain("opacity-100");
    expect(getStepOpacityClass(1, 0)).toContain("opacity-30");
    expect(getStepOpacityClass(2, 0)).toContain("opacity-30");
  });

  it("at step 1: Drafting is past-dim, Reviewing is active, Finalising is future-dim", () => {
    expect(getStepOpacityClass(0, 1)).toContain("opacity-50");
    expect(getStepOpacityClass(1, 1)).toContain("opacity-100");
    expect(getStepOpacityClass(2, 1)).toContain("opacity-30");
  });

  it("at step 2: Drafting and Reviewing are past-dim, Finalising is active", () => {
    expect(getStepOpacityClass(0, 2)).toContain("opacity-50");
    expect(getStepOpacityClass(1, 2)).toContain("opacity-50");
    expect(getStepOpacityClass(2, 2)).toContain("opacity-100");
  });
});

describe("TICK_MS", () => {
  it("is a positive interval in milliseconds", () => {
    expect(TICK_MS).toBeGreaterThan(0);
    expect(TICK_MS).toBeLessThan(STEP_DURATION_MS);
  });
});
