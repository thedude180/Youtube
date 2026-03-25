export function detectLanguage(text: string): { language: string; confidence: number } {
  const patterns: [RegExp, string][] = [
    [/[\u3040-\u309f\u30a0-\u30ff]/g, "ja"],
    [/[\u4e00-\u9fff]/g, "zh"],
    [/[\uac00-\ud7af]/g, "ko"],
    [/[\u0600-\u06ff]/g, "ar"],
    [/[\u0400-\u04ff]/g, "ru"],
    [/[àâçéèêëïîôùûüÿœæ]/gi, "fr"],
    [/[äöüß]/gi, "de"],
    [/[áéíóúñ¿¡]/gi, "es"],
    [/[ãõçâêô]/gi, "pt"],
  ];

  for (const [pattern, lang] of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 2) {
      return { language: lang, confidence: 0.8 };
    }
  }

  return { language: "en", confidence: 0.9 };
}

export function translateContent(
  text: string,
  targetLanguage: string,
): { translated: string; targetLanguage: string; method: string } {
  return {
    translated: text,
    targetLanguage,
    method: "passthrough",
  };
}

export function getSupportedLanguages(): string[] {
  return ["en", "ja", "zh", "ko", "es", "pt", "fr", "de", "ar", "ru"];
}
