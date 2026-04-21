/**
 * Server-side tests for vault-docs-generator.ts
 *
 * Verifies that generateVaultDocument emits the correct SSE progress events
 * at the right points in the generation pipeline:
 *   1. "drafting"   — before gatherSystemData()
 *   2. "reviewing"  — after gatherSystemData(), before the AI call
 *   3. "finalising" — after the AI call, before saving to the DB
 *   4. "ready"      — on successful completion
 *   5. "failed"     — when any step throws
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state (must be declared before any vi.mock calls) ──────────
const { mockEmit, mockAICall, mockDb } = vi.hoisted(() => {
  const mockEmit = vi.fn();
  const mockAICall = vi.fn();

  const makeSelectChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    return chain;
  };

  const mockDb = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };

  return { mockEmit, mockAICall, mockDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("../lib/vault-docs-sse", () => ({
  emitVaultDocEvent: mockEmit,
}));

vi.mock("./ai-model-router", () => ({
  executeRoutedAICall: mockAICall,
}));

vi.mock("../db", () => ({
  db: mockDb,
}));

vi.mock("../lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { generateVaultDocument } from "./vault-docs-generator";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TEST_USER = "user-test-abc123";
const DOC_TYPE = "system_architecture" as const;

function emittedSteps(): string[] {
  return mockEmit.mock.calls.map((c) => {
    const payload = c[1] as { step?: string; status: string };
    return payload.step ?? payload.status;
  });
}

// ─── Success path ─────────────────────────────────────────────────────────────
describe("generateVaultDocument — success path SSE events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      return chain;
    });
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    mockAICall.mockResolvedValue({ content: "Generated document content here." });
  });

  it("emits { status: 'generating', step: 'drafting' } before data gathering", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(mockEmit).toHaveBeenCalledWith(TEST_USER, {
      docType: DOC_TYPE,
      status: "generating",
      step: "drafting",
    });
    expect(emittedSteps()[0]).toBe("drafting");
  });

  it("emits { status: 'generating', step: 'reviewing' } after data gathering", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(mockEmit).toHaveBeenCalledWith(TEST_USER, {
      docType: DOC_TYPE,
      status: "generating",
      step: "reviewing",
    });
  });

  it("emits 'reviewing' strictly after 'drafting'", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    const steps = emittedSteps();
    const draftingIdx = steps.indexOf("drafting");
    const reviewingIdx = steps.indexOf("reviewing");
    expect(draftingIdx).toBeGreaterThanOrEqual(0);
    expect(reviewingIdx).toBeGreaterThan(draftingIdx);
  });

  it("emits { status: 'generating', step: 'finalising' } after the AI call", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(mockEmit).toHaveBeenCalledWith(TEST_USER, {
      docType: DOC_TYPE,
      status: "generating",
      step: "finalising",
    });
  });

  it("emits 'finalising' strictly after 'reviewing'", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    const steps = emittedSteps();
    const reviewingIdx = steps.indexOf("reviewing");
    const finalisingIdx = steps.indexOf("finalising");
    expect(reviewingIdx).toBeGreaterThanOrEqual(0);
    expect(finalisingIdx).toBeGreaterThan(reviewingIdx);
  });

  it("emits { status: 'ready' } as the last event on success", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(mockEmit).toHaveBeenCalledWith(TEST_USER, {
      docType: DOC_TYPE,
      status: "ready",
    });
    const steps = emittedSteps();
    expect(steps[steps.length - 1]).toBe("ready");
  });

  it("emits all four events in the correct order: drafting → reviewing → finalising → ready", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(emittedSteps()).toEqual(["drafting", "reviewing", "finalising", "ready"]);
  });

  it("emits exactly four events in total on the success path", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(mockEmit).toHaveBeenCalledTimes(4);
  });

  it("always passes the docType in every emitted event", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    for (const call of mockEmit.mock.calls) {
      const payload = call[1] as { docType: string };
      expect(payload.docType).toBe(DOC_TYPE);
    }
  });

  it("always passes the correct userId as the first argument to emitVaultDocEvent", async () => {
    await generateVaultDocument(TEST_USER, DOC_TYPE);

    for (const call of mockEmit.mock.calls) {
      expect(call[0]).toBe(TEST_USER);
    }
  });

  it("emits 'finalising' only after executeRoutedAICall has been invoked", async () => {
    let aiCallCount = 0;
    let aiCallsMadeWhenFinalisingFired = -1;

    mockAICall.mockImplementation(async () => {
      aiCallCount++;
      return { content: "Generated document content here." };
    });

    mockEmit.mockImplementation((_userId: string, payload: { step?: string; status: string }) => {
      if (payload.step === "finalising") {
        aiCallsMadeWhenFinalisingFired = aiCallCount;
      }
    });

    await generateVaultDocument(TEST_USER, DOC_TYPE);

    expect(aiCallsMadeWhenFinalisingFired).toBe(1);
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────
describe("generateVaultDocument — error path SSE events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      return chain;
    });
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    mockAICall.mockRejectedValue(new Error("AI service unavailable"));
  });

  it("emits { status: 'failed' } when the AI call throws", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow(
      "AI service unavailable",
    );

    expect(mockEmit).toHaveBeenCalledWith(TEST_USER, {
      docType: DOC_TYPE,
      status: "failed",
    });
  });

  it("'failed' is the last event emitted on the error path", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    const steps = emittedSteps();
    expect(steps[steps.length - 1]).toBe("failed");
  });

  it("still emits 'drafting' before 'failed'", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    const steps = emittedSteps();
    expect(steps).toContain("drafting");
    expect(steps.indexOf("drafting")).toBeLessThan(steps.indexOf("failed"));
  });

  it("still emits 'reviewing' before 'failed'", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    const steps = emittedSteps();
    expect(steps).toContain("reviewing");
    expect(steps.indexOf("reviewing")).toBeLessThan(steps.indexOf("failed"));
  });

  it("does not emit 'finalising' when the AI call fails", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    expect(emittedSteps()).not.toContain("finalising");
  });

  it("does not emit 'ready' when the AI call fails", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    expect(emittedSteps()).not.toContain("ready");
  });

  it("emits exactly three events on the error path: drafting → reviewing → failed", async () => {
    await expect(generateVaultDocument(TEST_USER, DOC_TYPE)).rejects.toThrow();

    expect(emittedSteps()).toEqual(["drafting", "reviewing", "failed"]);
  });
});
