export function checkLiveAccessibility(streamConfig: {
  hasCaptions?: boolean;
  hasAudioDescription?: boolean;
  chatModeration?: boolean;
  colorBlindFriendly?: boolean;
  thumbnailAltText?: boolean;
}): { score: number; level: string; issues: string[]; suggestions: string[] } {
  let score = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (streamConfig.hasCaptions) {
    score += 0.3;
  } else {
    issues.push("No live captions enabled");
    suggestions.push("Enable YouTube auto-captions for live stream accessibility");
  }

  if (streamConfig.chatModeration) {
    score += 0.2;
  } else {
    issues.push("Chat moderation not configured");
    suggestions.push("Enable chat moderation to ensure inclusive environment");
  }

  if (streamConfig.thumbnailAltText) {
    score += 0.2;
  } else {
    suggestions.push("Add alt text to stream thumbnail for screen readers");
  }

  if (streamConfig.hasAudioDescription) {
    score += 0.15;
  } else {
    suggestions.push("For no-commentary gameplay, on-screen text overlays help hearing-impaired viewers");
  }

  if (streamConfig.colorBlindFriendly) {
    score += 0.15;
  }

  score = Math.min(1, score);
  const level = score >= 0.8 ? "AAA" : score >= 0.5 ? "AA" : score >= 0.3 ? "A" : "needs improvement";

  return { score, level, issues, suggestions };
}

export function getLiveAccessibilityScore(
  hasCaptions: boolean,
  chatModeration: boolean,
): number {
  let score = 0.3;
  if (hasCaptions) score += 0.4;
  if (chatModeration) score += 0.3;
  return score;
}

export interface AccessibilityComplianceReport {
  streamId: string;
  overallScore: number;
  complianceLevel: string;
  wcagChecks: { criterion: string; passed: boolean; severity: "critical" | "major" | "minor"; detail: string }[];
  gamingSpecificChecks: { check: string; passed: boolean; recommendation: string }[];
  autoFixable: string[];
  requiresManualFix: string[];
  reportedAt: Date;
}

export function runFullAccessibilityAudit(
  streamId: string,
  config: {
    hasCaptions?: boolean;
    hasAudioDescription?: boolean;
    chatModeration?: boolean;
    colorBlindFriendly?: boolean;
    thumbnailAltText?: boolean;
    fontSizeScalable?: boolean;
    keyboardNavigable?: boolean;
    highContrastMode?: boolean;
    seizureSafeContent?: boolean;
    subtitleLanguages?: number;
    chatSlowMode?: boolean;
    textToSpeechChat?: boolean;
  }
): AccessibilityComplianceReport {
  const wcagChecks: AccessibilityComplianceReport["wcagChecks"] = [
    { criterion: "1.2.1 Captions (Prerecorded)", passed: !!config.hasCaptions, severity: "critical", detail: config.hasCaptions ? "Live captions enabled" : "No live captions — critical for deaf/hard-of-hearing viewers" },
    { criterion: "1.2.3 Audio Description", passed: !!config.hasAudioDescription, severity: "major", detail: config.hasAudioDescription ? "Audio descriptions available" : "No audio descriptions — important for visually impaired viewers" },
    { criterion: "1.4.3 Contrast", passed: !!config.highContrastMode, severity: "major", detail: config.highContrastMode ? "High contrast mode available" : "No high contrast option for overlays" },
    { criterion: "1.4.8 Visual Presentation", passed: !!config.fontSizeScalable, severity: "minor", detail: config.fontSizeScalable ? "Font size scalable" : "Fixed font sizes in overlays" },
    { criterion: "2.1.1 Keyboard", passed: !!config.keyboardNavigable, severity: "critical", detail: config.keyboardNavigable ? "Keyboard navigation supported" : "Stream controls not keyboard navigable" },
    { criterion: "2.3.1 Seizure Safety", passed: config.seizureSafeContent !== false, severity: "critical", detail: config.seizureSafeContent !== false ? "No seizure-triggering content detected" : "Potential seizure-triggering content — add warning" },
    { criterion: "3.1.2 Language", passed: (config.subtitleLanguages || 0) > 0, severity: "minor", detail: (config.subtitleLanguages || 0) > 0 ? `${config.subtitleLanguages} subtitle languages available` : "No multi-language subtitles" },
  ];

  const gamingSpecificChecks: AccessibilityComplianceReport["gamingSpecificChecks"] = [
    { check: "Color blind friendly overlays", passed: !!config.colorBlindFriendly, recommendation: config.colorBlindFriendly ? "Good — overlays are color-blind safe" : "Use shapes/icons in addition to color for UI elements" },
    { check: "Chat moderation active", passed: !!config.chatModeration, recommendation: config.chatModeration ? "Chat moderation active" : "Enable chat moderation for inclusive environment" },
    { check: "Chat slow mode", passed: !!config.chatSlowMode, recommendation: config.chatSlowMode ? "Slow mode helps readability" : "Consider slow mode for accessibility" },
    { check: "Text-to-speech for chat", passed: !!config.textToSpeechChat, recommendation: config.textToSpeechChat ? "TTS enabled for chat accessibility" : "Consider TTS integration for visually impaired chat readers" },
    { check: "Thumbnail has alt text", passed: !!config.thumbnailAltText, recommendation: config.thumbnailAltText ? "Alt text present" : "Add descriptive alt text for screen readers" },
    { check: "No-commentary gaming context", passed: true, recommendation: "For no-commentary gameplay, on-screen text overlays and captions are essential for accessibility" },
  ];

  const passedWcag = wcagChecks.filter(c => c.passed).length;
  const passedGaming = gamingSpecificChecks.filter(c => c.passed).length;
  const totalChecks = wcagChecks.length + gamingSpecificChecks.length;
  const overallScore = (passedWcag + passedGaming) / totalChecks;

  const complianceLevel = overallScore >= 0.9 ? "AAA"
    : overallScore >= 0.7 ? "AA"
    : overallScore >= 0.5 ? "A"
    : "Below A — needs improvement";

  const autoFixable = [
    ...(!config.chatSlowMode ? ["Enable chat slow mode"] : []),
    ...(!config.thumbnailAltText ? ["Generate alt text for thumbnail"] : []),
    ...(!config.chatModeration ? ["Enable auto-moderation"] : []),
  ];

  const requiresManualFix = [
    ...(!config.hasCaptions ? ["Enable live captioning service"] : []),
    ...(!config.colorBlindFriendly ? ["Redesign overlays for color-blind accessibility"] : []),
    ...(!config.hasAudioDescription ? ["Add audio description track or text overlays"] : []),
  ];

  return {
    streamId, overallScore, complianceLevel,
    wcagChecks, gamingSpecificChecks,
    autoFixable, requiresManualFix,
    reportedAt: new Date(),
  };
}
