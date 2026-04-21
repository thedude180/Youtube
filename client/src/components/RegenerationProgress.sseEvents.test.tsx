// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { RegenerationProgress } from "./RegenerationProgress";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function getProgressPctFromBar(docType: string): number {
  const barContainer = screen.getByTestId(`regen-progress-bar-${docType}`);
  const indicator = barContainer.querySelector("div") as HTMLElement;
  const transform = indicator.style.transform;
  const match = transform.match(/translateX\(-([\d.]+)%\)/);
  return match ? 100 - parseFloat(match[1]) : 0;
}

function getProgressBarClasses(docType: string): string {
  const barContainer = screen.getByTestId(`regen-progress-bar-${docType}`);
  return barContainer.className;
}

describe("SSE 'ready' event — progress bar reaches 100%", () => {
  it("reaches 100% when isGenerating transitions false at step 0", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={0} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("reaches 100% when isGenerating transitions false at step 1", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={1} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("reaches 100% when isGenerating transitions false at step 2 (Finalising)", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("bar is still visible immediately after the ready event fires", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("bar disappears ~600ms after the ready event fires", async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(container.firstChild).toBeNull();
  });

  it("bar stays at 100% for the entire 600ms completion flash", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });
});

describe("SSE 'ready' event — full step lifecycle (step 0 → 1 → 2 → ready)", () => {
  it("step 0 → step 1 → step 2: progress advances at each step boundary", () => {
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    const pct0 = getProgressPctFromBar("test-doc");

    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    });
    const pct1 = getProgressPctFromBar("test-doc");

    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    });
    const pct2 = getProgressPctFromBar("test-doc");

    expect(pct1).toBeGreaterThan(pct0);
    expect(pct2).toBeGreaterThan(pct1);
  });

  it("full lifecycle: step 0 → step 2 → ready lands at 100%", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    });
    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    });
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("progress never exceeds 95% while still generating through all three steps", () => {
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    expect(getProgressPctFromBar("test-doc")).toBeLessThanOrEqual(95);
    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBeLessThanOrEqual(95);
    act(() => {
      rerender(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBeLessThanOrEqual(95);
  });
});

describe("SSE 'failed' event — progress bar shows error state", () => {
  it("bar uses red styling when isFailed is true", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={1} isFailed={true} />
      );
    });
    const cls = getProgressBarClasses("test-doc");
    expect(cls).toContain("bg-red-500");
  });

  it("bar does NOT use blue styling when isFailed is true", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={1} isFailed={true} />
      );
    });
    const cls = getProgressBarClasses("test-doc");
    expect(cls).not.toContain("bg-blue-500");
  });

  it("bar uses blue styling when isFailed is false (normal ready)", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} isFailed={false} />
      );
    });
    const cls = getProgressBarClasses("test-doc");
    expect(cls).toContain("bg-blue-500");
  });

  it("failed bar still reaches 100% during the completion flash", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={0} isFailed={true} />
      );
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("failed bar disappears ~600ms after the failed event", async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={0} isFailed={true} />
      );
    });
    expect(container.firstChild).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(container.firstChild).toBeNull();
  });

  it("failed bar is still visible immediately after the failed event", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} isFailed={true} />
      );
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("failed mid-way (step 0): red bar reaches 100% even from step 0", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />
    );
    const pctBefore = getProgressPctFromBar("test-doc");
    expect(pctBefore).toBeLessThan(34);
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={0} isFailed={true} />
      );
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("failed bar progress stays at 100% and does not advance further after the event", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />
    );
    act(() => {
      rerender(
        <RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={1} isFailed={true} />
      );
    });
    const pctAtStop = getProgressPctFromBar("test-doc");
    expect(pctAtStop).toBe(100);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });
});
