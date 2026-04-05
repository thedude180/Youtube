export interface BeatMapSegment {
  startTime: number;
  endTime: number;
  segmentType: "hook" | "buildup" | "peak" | "valley" | "transition" | "outro";
  predictedRetention: number;
  label: string;
}

export interface DeadZone {
  startTime: number;
  endTime: number;
  durationSeconds: number;
  reason: string;
  severity: "low" | "medium" | "high";
  suggestedFix: string;
}

export interface PacingRecommendation {
  type: "insert-hook" | "cut-segment" | "add-transition" | "shorten" | "reorder";
  atTime: number;
  reason: string;
  impact: "low" | "medium" | "high";
  benchmarkReference?: string;
}

export interface BeatMapAnalysis {
  segments: BeatMapSegment[];
  deadZones: DeadZone[];
  pacingRecommendations: PacingRecommendation[];
  overallPacingScore: number;
  averageRetention: number;
  benchmarkFamily: string;
  videoType: string;
}

const NICHE_PACING_BENCHMARKS: Record<string, { idealHookWindow: number; maxValleyDuration: number; peakFrequency: number; targetRetention: number }> = {
  "walkthrough": { idealHookWindow: 15, maxValleyDuration: 45, peakFrequency: 120, targetRetention: 0.52 },
  "review": { idealHookWindow: 10, maxValleyDuration: 30, peakFrequency: 90, targetRetention: 0.55 },
  "montage": { idealHookWindow: 5, maxValleyDuration: 20, peakFrequency: 60, targetRetention: 0.60 },
  "tutorial": { idealHookWindow: 12, maxValleyDuration: 40, peakFrequency: 100, targetRetention: 0.50 },
  "lets-play": { idealHookWindow: 20, maxValleyDuration: 60, peakFrequency: 150, targetRetention: 0.45 },
  "speedrun": { idealHookWindow: 8, maxValleyDuration: 25, peakFrequency: 75, targetRetention: 0.58 },
  "lore": { idealHookWindow: 15, maxValleyDuration: 50, peakFrequency: 120, targetRetention: 0.48 },
  "default": { idealHookWindow: 15, maxValleyDuration: 40, peakFrequency: 120, targetRetention: 0.50 },
};

function classifySegment(
  index: number,
  totalSegments: number,
  retentionValue: number,
  avgRetention: number,
): BeatMapSegment["segmentType"] {
  if (index === 0) return "hook";
  if (index === totalSegments - 1) return "outro";
  if (retentionValue >= avgRetention * 1.2) return "peak";
  if (retentionValue < avgRetention * 0.7) return "valley";
  if (Math.abs(retentionValue - avgRetention) < avgRetention * 0.1) return "transition";
  return "buildup";
}

export function analyzeBeatMap(
  videoType: string,
  durationSeconds: number,
  retentionCurve: number[],
): BeatMapAnalysis {
  const benchmarkKey = NICHE_PACING_BENCHMARKS[videoType] ? videoType : "default";
  const benchmark = NICHE_PACING_BENCHMARKS[benchmarkKey];

  const segmentCount = retentionCurve.length;
  const segmentDuration = durationSeconds / segmentCount;
  const avgRetention = retentionCurve.reduce((a, b) => a + b, 0) / segmentCount;

  const segments: BeatMapSegment[] = retentionCurve.map((retention, i) => ({
    startTime: Math.round(i * segmentDuration),
    endTime: Math.round((i + 1) * segmentDuration),
    segmentType: classifySegment(i, segmentCount, retention, avgRetention),
    predictedRetention: retention,
    label: `Segment ${i + 1}`,
  }));

  const deadZones: DeadZone[] = [];
  let valleyStart: number | null = null;
  let valleyStartTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.segmentType === "valley") {
      if (valleyStart === null) {
        valleyStart = i;
        valleyStartTime = seg.startTime;
      }
    } else {
      if (valleyStart !== null) {
        const valleyEndTime = segments[i - 1].endTime;
        const valleyDuration = valleyEndTime - valleyStartTime;
        if (valleyDuration > benchmark.maxValleyDuration * 0.5) {
          const severity = valleyDuration > benchmark.maxValleyDuration ? "high" :
            valleyDuration > benchmark.maxValleyDuration * 0.75 ? "medium" : "low";
          deadZones.push({
            startTime: valleyStartTime,
            endTime: valleyEndTime,
            durationSeconds: valleyDuration,
            reason: `Low retention zone (${Math.round(valleyDuration)}s) exceeds ${severity === "low" ? "50%" : severity === "medium" ? "75%" : "100%"} of max valley threshold for ${videoType}`,
            severity,
            suggestedFix: severity === "high"
              ? "Cut or replace this segment with a highlight or transition"
              : "Add a visual hook or gameplay moment to re-engage viewers",
          });
        }
        valleyStart = null;
      }
    }
  }

  if (valleyStart !== null) {
    const lastSeg = segments[segments.length - 1];
    const valleyDuration = lastSeg.endTime - valleyStartTime;
    if (valleyDuration > benchmark.maxValleyDuration * 0.5) {
      deadZones.push({
        startTime: valleyStartTime,
        endTime: lastSeg.endTime,
        durationSeconds: valleyDuration,
        reason: `Trailing low retention zone before outro (${Math.round(valleyDuration)}s)`,
        severity: "medium",
        suggestedFix: "Consider ending the video earlier or adding a strong call-to-action",
      });
    }
  }

  const pacingRecommendations: PacingRecommendation[] = [];

  if (segments.length > 0 && segments[0].predictedRetention < 0.6) {
    pacingRecommendations.push({
      type: "insert-hook",
      atTime: 0,
      reason: `Hook retention (${Math.round(segments[0].predictedRetention * 100)}%) is below 60% — ${videoType} videos need a stronger opening within ${benchmark.idealHookWindow}s`,
      impact: "high",
      benchmarkReference: `${videoType} ideal hook window: ${benchmark.idealHookWindow}s`,
    });
  }

  for (const dz of deadZones) {
    if (dz.severity === "high") {
      pacingRecommendations.push({
        type: "cut-segment",
        atTime: dz.startTime,
        reason: `Dead zone at ${dz.startTime}s-${dz.endTime}s — ${dz.reason}`,
        impact: "high",
      });
    } else {
      pacingRecommendations.push({
        type: "add-transition",
        atTime: dz.startTime,
        reason: `Engagement dip at ${dz.startTime}s — add visual variety or gameplay highlight`,
        impact: "medium",
      });
    }
  }

  const peaks = segments.filter(s => s.segmentType === "peak");
  if (peaks.length > 0) {
    const avgGap = durationSeconds / (peaks.length + 1);
    if (avgGap > benchmark.peakFrequency * 1.5) {
      pacingRecommendations.push({
        type: "insert-hook",
        atTime: Math.round(durationSeconds * 0.5),
        reason: `Peak moments are too sparse (avg ${Math.round(avgGap)}s apart) — ${videoType} benchmarks suggest every ${benchmark.peakFrequency}s`,
        impact: "medium",
        benchmarkReference: `${videoType} peak frequency: ${benchmark.peakFrequency}s`,
      });
    }
  }

  if (durationSeconds > 600 && avgRetention < benchmark.targetRetention * 0.8) {
    pacingRecommendations.push({
      type: "shorten",
      atTime: Math.round(durationSeconds * 0.7),
      reason: `Video is ${Math.round(durationSeconds / 60)}min with ${Math.round(avgRetention * 100)}% avg retention — consider a shorter cut (benchmark: ${Math.round(benchmark.targetRetention * 100)}%)`,
      impact: "high",
      benchmarkReference: `${videoType} target retention: ${Math.round(benchmark.targetRetention * 100)}%`,
    });
  }

  const peakCount = peaks.length;
  const valleyCount = segments.filter(s => s.segmentType === "valley").length;
  const pacingVariety = segmentCount > 0 ? 1 - (valleyCount / segmentCount) : 0.5;
  const retentionVsBenchmark = avgRetention / benchmark.targetRetention;
  const overallPacingScore = Math.max(0, Math.min(1,
    pacingVariety * 0.3 +
    Math.min(1, retentionVsBenchmark) * 0.4 +
    (deadZones.length === 0 ? 0.3 : Math.max(0, 0.3 - deadZones.length * 0.1))
  ));

  return {
    segments,
    deadZones,
    pacingRecommendations,
    overallPacingScore,
    averageRetention: avgRetention,
    benchmarkFamily: benchmarkKey,
    videoType,
  };
}

export function getRetentionBeatsPromptContext(): string {
  return "Retention beats engine analyzes video pacing, detects dead zones, and recommends edits based on niche-specific benchmarks.";
}

export function startRetentionBeatsEngine(): void {}
