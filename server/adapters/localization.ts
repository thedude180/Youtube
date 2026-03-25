export interface LocaleConfig {
  locale: string;
  language: string;
  region: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  direction: "ltr" | "rtl";
}

const LOCALE_MAP: Record<string, LocaleConfig> = {
  "en-US": { locale: "en-US", language: "en", region: "US", dateFormat: "MM/DD/YYYY", timeFormat: "12h", numberFormat: "1,234.56", direction: "ltr" },
  "en-GB": { locale: "en-GB", language: "en", region: "GB", dateFormat: "DD/MM/YYYY", timeFormat: "24h", numberFormat: "1,234.56", direction: "ltr" },
  "es-ES": { locale: "es-ES", language: "es", region: "ES", dateFormat: "DD/MM/YYYY", timeFormat: "24h", numberFormat: "1.234,56", direction: "ltr" },
  "pt-BR": { locale: "pt-BR", language: "pt", region: "BR", dateFormat: "DD/MM/YYYY", timeFormat: "24h", numberFormat: "1.234,56", direction: "ltr" },
  "de-DE": { locale: "de-DE", language: "de", region: "DE", dateFormat: "DD.MM.YYYY", timeFormat: "24h", numberFormat: "1.234,56", direction: "ltr" },
  "fr-FR": { locale: "fr-FR", language: "fr", region: "FR", dateFormat: "DD/MM/YYYY", timeFormat: "24h", numberFormat: "1 234,56", direction: "ltr" },
  "ja-JP": { locale: "ja-JP", language: "ja", region: "JP", dateFormat: "YYYY/MM/DD", timeFormat: "24h", numberFormat: "1,234.56", direction: "ltr" },
  "ko-KR": { locale: "ko-KR", language: "ko", region: "KR", dateFormat: "YYYY.MM.DD", timeFormat: "24h", numberFormat: "1,234.56", direction: "ltr" },
  "ar-SA": { locale: "ar-SA", language: "ar", region: "SA", dateFormat: "DD/MM/YYYY", timeFormat: "12h", numberFormat: "1,234.56", direction: "rtl" },
  "hi-IN": { locale: "hi-IN", language: "hi", region: "IN", dateFormat: "DD/MM/YYYY", timeFormat: "12h", numberFormat: "1,23,456.78", direction: "ltr" },
  "zh-CN": { locale: "zh-CN", language: "zh", region: "CN", dateFormat: "YYYY-MM-DD", timeFormat: "24h", numberFormat: "1,234.56", direction: "ltr" },
};

const DEFAULT_LOCALE: LocaleConfig = {
  locale: "en-US",
  language: "en",
  region: "US",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "12h",
  numberFormat: "1,234.56",
  direction: "ltr",
};

export function detectLocale(
  acceptLanguage?: string | null,
  countryCode?: string | null
): LocaleConfig {
  if (countryCode) {
    const match = Object.values(LOCALE_MAP).find(
      (l) => l.region === countryCode.toUpperCase()
    );
    if (match) return match;
  }

  if (acceptLanguage) {
    const primary = acceptLanguage.split(",")[0]?.trim().split(";")[0]?.trim();
    if (primary && LOCALE_MAP[primary]) return LOCALE_MAP[primary];
    const langOnly = primary?.split("-")[0];
    if (langOnly) {
      const match = Object.values(LOCALE_MAP).find(
        (l) => l.language === langOnly
      );
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}

export function formatDate(date: Date, locale: LocaleConfig): string {
  try {
    return new Intl.DateTimeFormat(locale.locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().split("T")[0];
  }
}

export function formatNumber(value: number, locale: LocaleConfig): string {
  try {
    return new Intl.NumberFormat(locale.locale).format(value);
  } catch {
    return String(value);
  }
}

export function formatRelativeTime(date: Date, locale: LocaleConfig): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale.locale, { numeric: "auto" });
    if (diffMins < 1) return rtf.format(0, "minute");
    if (diffMins < 60) return rtf.format(-diffMins, "minute");
    if (diffHours < 24) return rtf.format(-diffHours, "hour");
    return rtf.format(-diffDays, "day");
  } catch {
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
}

export function getSupportedLocales(): string[] {
  return Object.keys(LOCALE_MAP);
}

export function isRTL(locale: LocaleConfig): boolean {
  return locale.direction === "rtl";
}
