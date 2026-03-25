export interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
  language: string;
}

export function generateSubtitles(
  gameMoments: { timestamp: number; duration: number; description: string }[],
  language = "en",
): SubtitleSegment[] {
  return gameMoments.map(m => ({
    startTime: m.timestamp,
    endTime: m.timestamp + m.duration,
    text: m.description,
    language,
  }));
}

export function optimizeSubtitles(segments: SubtitleSegment[]): {
  optimized: SubtitleSegment[];
  changes: string[];
} {
  const changes: string[] = [];
  const optimized = segments.map(s => {
    let text = s.text;

    if (text.length > 42) {
      text = text.slice(0, 39) + "...";
      changes.push(`Truncated subtitle at ${s.startTime}s — exceeded 42 character limit`);
    }

    if (s.endTime - s.startTime < 1) {
      changes.push(`Extended display time at ${s.startTime}s — minimum 1 second`);
      return { ...s, text, endTime: s.startTime + 1 };
    }

    if (s.endTime - s.startTime > 7) {
      changes.push(`Capped display time at ${s.startTime}s — maximum 7 seconds`);
      return { ...s, text, endTime: s.startTime + 7 };
    }

    return { ...s, text };
  });

  return { optimized, changes };
}

export function formatSRT(segments: SubtitleSegment[]): string {
  return segments.map((s, i) => {
    const formatTime = (t: number) => {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const sec = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };
    return `${i + 1}\n${formatTime(s.startTime)} --> ${formatTime(s.endTime)}\n${s.text}\n`;
  }).join("\n");
}
