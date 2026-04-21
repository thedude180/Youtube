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

describe("RegenerationProgress — visibility", () => {
  it("renders nothing after the completion flash expires", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <RegenerationProgress isGenerating={false} docType="test-doc" />
    );
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(container.firstChild).toBeNull();
  });

  it("renders the indicator when isGenerating is true", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    expect(screen.getByTestId("regen-progress-indicator-test-doc")).toBeInTheDocument();
  });

  it("renders the progress bar when isGenerating is true", () => {
    render(<RegenerationProgress isGenerating={true} docType="my-doc" sseStepIndex={0} />);
    expect(screen.getByTestId("regen-progress-bar-my-doc")).toBeInTheDocument();
  });

  it("scopes data-testid to docType", () => {
    const { unmount } = render(
      <RegenerationProgress isGenerating={true} docType="gtm-strategy" sseStepIndex={0} />
    );
    expect(screen.getByTestId("regen-progress-indicator-gtm-strategy")).toBeInTheDocument();
    expect(screen.getByTestId("regen-progress-bar-gtm-strategy")).toBeInTheDocument();
    unmount();
  });
});

describe("RegenerationProgress — step labels at step 0 (Drafting)", () => {
  it("shows all three step labels", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    expect(screen.getByText("Drafting…")).toBeInTheDocument();
    expect(screen.getByText("Reviewing…")).toBeInTheDocument();
    expect(screen.getByText("Finalising…")).toBeInTheDocument();
  });

  it("Drafting… is fully opaque (active) at step 0", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    expect(screen.getByText("Drafting…").className).toContain("opacity-100");
    expect(screen.getByText("Drafting…").className).toContain("font-medium");
  });

  it("Reviewing… is dimmed (future) at step 0", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    expect(screen.getByText("Reviewing…").className).toContain("opacity-30");
  });

  it("Finalising… is dimmed (future) at step 0", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    expect(screen.getByText("Finalising…").className).toContain("opacity-30");
  });
});

describe("RegenerationProgress — step labels at step 1 (Reviewing)", () => {
  it("Drafting… is past-dimmed (opacity-50) at step 1", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    expect(screen.getByText("Drafting…").className).toContain("opacity-50");
  });

  it("Reviewing… is fully opaque (active) at step 1", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    expect(screen.getByText("Reviewing…").className).toContain("opacity-100");
    expect(screen.getByText("Reviewing…").className).toContain("font-medium");
  });

  it("Finalising… is dimmed (future) at step 1", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    expect(screen.getByText("Finalising…").className).toContain("opacity-30");
  });
});

describe("RegenerationProgress — step labels at step 2 (Finalising)", () => {
  it("Drafting… is past-dimmed at step 2", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    expect(screen.getByText("Drafting…").className).toContain("opacity-50");
  });

  it("Reviewing… is past-dimmed at step 2", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    expect(screen.getByText("Reviewing…").className).toContain("opacity-50");
  });

  it("Finalising… is fully opaque (active) at step 2", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    expect(screen.getByText("Finalising…").className).toContain("opacity-100");
    expect(screen.getByText("Finalising…").className).toContain("font-medium");
  });
});

describe("RegenerationProgress — progress bar value ranges (via indicator transform)", () => {
  it("step 0 progress is in the 0–33% range", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={0} />);
    const pct = getProgressPctFromBar("test-doc");
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThan(34);
  });

  it("step 1 progress is in the 33–67% range", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={1} />);
    const pct = getProgressPctFromBar("test-doc");
    expect(pct).toBeGreaterThanOrEqual(33);
    expect(pct).toBeLessThan(67);
  });

  it("step 2 progress is in the 66–95% range", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    const pct = getProgressPctFromBar("test-doc");
    expect(pct).toBeGreaterThanOrEqual(66);
    expect(pct).toBeLessThanOrEqual(95);
  });

  it("progress never exceeds 95% while generating", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />);
    expect(getProgressPctFromBar("test-doc")).toBeLessThanOrEqual(95);
  });

  it("progress reaches 100% on the completion flash", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    expect(getProgressPctFromBar("test-doc")).toBe(100);
  });

  it("component disappears 600ms after generation completes", async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <RegenerationProgress isGenerating={true} docType="test-doc" sseStepIndex={2} />
    );
    act(() => {
      rerender(<RegenerationProgress isGenerating={false} docType="test-doc" sseStepIndex={2} />);
    });
    expect(container.firstChild).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(container.firstChild).toBeNull();
  });
});

describe("RegenerationProgress — undefined sseStepIndex defaults to step 0", () => {
  it("defaults to Drafting… active when sseStepIndex is not provided", () => {
    render(<RegenerationProgress isGenerating={true} docType="test-doc" />);
    expect(screen.getByText("Drafting…").className).toContain("opacity-100");
    expect(screen.getByText("Reviewing…").className).toContain("opacity-30");
  });
});
