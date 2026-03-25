export interface JurisdictionInfo {
  countryCode: string;
  currencyCode: string;
  taxRequired: boolean;
  paymentMethods: string[];
  monetizationAccess: "full" | "limited" | "restricted";
  notes: string;
}

const JURISDICTION_MAP: Record<string, JurisdictionInfo> = {
  US: { countryCode: "US", currencyCode: "USD", taxRequired: true, paymentMethods: ["stripe", "paypal", "adsense"], monetizationAccess: "full", notes: "Full YouTube monetization" },
  GB: { countryCode: "GB", currencyCode: "GBP", taxRequired: true, paymentMethods: ["stripe", "paypal", "adsense"], monetizationAccess: "full", notes: "Full YouTube monetization" },
  DE: { countryCode: "DE", currencyCode: "EUR", taxRequired: true, paymentMethods: ["stripe", "paypal", "adsense"], monetizationAccess: "full", notes: "EU VAT applies" },
  JP: { countryCode: "JP", currencyCode: "JPY", taxRequired: true, paymentMethods: ["stripe", "adsense"], monetizationAccess: "full", notes: "Consumption tax applies" },
  BR: { countryCode: "BR", currencyCode: "BRL", taxRequired: true, paymentMethods: ["stripe", "paypal"], monetizationAccess: "limited", notes: "Limited payment rail access; CPM variance" },
  IN: { countryCode: "IN", currencyCode: "INR", taxRequired: true, paymentMethods: ["stripe", "paypal", "upi"], monetizationAccess: "limited", notes: "Low CPM market; UPI preferred" },
  NG: { countryCode: "NG", currencyCode: "NGN", taxRequired: false, paymentMethods: ["paypal", "flutterwave"], monetizationAccess: "restricted", notes: "Limited Stripe support; emerging market" },
  PH: { countryCode: "PH", currencyCode: "PHP", taxRequired: true, paymentMethods: ["paypal", "gcash"], monetizationAccess: "limited", notes: "Low CPM; mobile payment preferred" },
  KE: { countryCode: "KE", currencyCode: "KES", taxRequired: false, paymentMethods: ["mpesa", "paypal"], monetizationAccess: "restricted", notes: "M-Pesa dominant; limited platform payouts" },
};

const DEFAULT_JURISDICTION: JurisdictionInfo = {
  countryCode: "UNKNOWN",
  currencyCode: "USD",
  taxRequired: false,
  paymentMethods: ["paypal"],
  monetizationAccess: "limited",
  notes: "Unknown jurisdiction — defaulting to conservative assumptions",
};

export function detectJurisdiction(countryCode?: string | null): JurisdictionInfo {
  if (!countryCode) return DEFAULT_JURISDICTION;
  return JURISDICTION_MAP[countryCode.toUpperCase()] || {
    ...DEFAULT_JURISDICTION,
    countryCode: countryCode.toUpperCase(),
  };
}

export function getPaymentMethods(jurisdiction: JurisdictionInfo): string[] {
  return jurisdiction.paymentMethods;
}

export function isMonetizationRestricted(jurisdiction: JurisdictionInfo): boolean {
  return jurisdiction.monetizationAccess === "restricted";
}

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function getSupportedJurisdictions(): string[] {
  return Object.keys(JURISDICTION_MAP);
}
