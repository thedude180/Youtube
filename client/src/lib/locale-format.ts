import i18n from "@/i18n";

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE",
  ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", ar: "ar-SA", hi: "hi-IN",
  ru: "ru-RU", it: "it-IT",
};

const CURRENCY_MAP: Record<string, string> = {
  en: "USD", es: "EUR", fr: "EUR", pt: "BRL", de: "EUR",
  ja: "JPY", ko: "KRW", zh: "CNY", ar: "SAR", hi: "INR",
  ru: "RUB", it: "EUR",
};

function getLocale(): string {
  return LOCALE_MAP[i18n.language] || "en-US";
}

function getCurrency(): string {
  return CURRENCY_MAP[i18n.language] || "USD";
}

export function formatCurrency(amount: number, currency?: string): string {
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: "currency",
      currency: currency || getCurrency(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(getLocale(), options).format(value);
  } catch {
    return value.toLocaleString();
  }
}

export function formatCompact(value: number): string {
  try {
    return new Intl.NumberFormat(getLocale(), { notation: "compact", compactDisplay: "short" }).format(value);
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toString();
  }
}

export function formatPercent(value: number, decimals = 1): string {
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(decimals)}%`;
  }
}

export function formatDate(date: Date | string | number, style: "short" | "medium" | "long" | "full" = "medium"): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    const options: Intl.DateTimeFormatOptions = style === "short"
      ? { month: "numeric", day: "numeric" }
      : style === "medium"
        ? { month: "short", day: "numeric", year: "numeric" }
        : style === "long"
          ? { month: "long", day: "numeric", year: "numeric" }
          : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
    return new Intl.DateTimeFormat(getLocale(), options).format(d);
  } catch {
    return new Date(date).toLocaleDateString();
  }
}

export function formatDateTime(date: Date | string | number): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(getLocale(), {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(d);
  } catch {
    return new Date(date).toLocaleString();
  }
}

export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
    if (diffSec < 60) return rtf.format(-diffSec, "second");
    if (diffMin < 60) return rtf.format(-diffMin, "minute");
    if (diffHr < 24) return rtf.format(-diffHr, "hour");
    if (diffDay < 30) return rtf.format(-diffDay, "day");
    if (diffDay < 365) return rtf.format(-Math.floor(diffDay / 30), "month");
    return rtf.format(-Math.floor(diffDay / 365), "year");
  } catch {
    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  }
}
