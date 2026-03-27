export interface RegionalPolicyRule {
  region: string;
  category: string;
  rule: string;
  enforcement: "block" | "warn" | "audit";
  description: string;
}

export interface RegionalPolicyResult {
  region: string;
  applicableRules: RegionalPolicyRule[];
  blocked: RegionalPolicyRule[];
  warnings: RegionalPolicyRule[];
  allowed: boolean;
}

const REGIONAL_POLICIES: RegionalPolicyRule[] = [
  { region: "EU", category: "data_privacy", rule: "gdpr_consent_required", enforcement: "block", description: "GDPR consent required before collecting personal data" },
  { region: "EU", category: "ai_disclosure", rule: "eu_ai_act_disclosure", enforcement: "block", description: "AI-generated content must be disclosed per EU AI Act" },
  { region: "EU", category: "right_to_delete", rule: "gdpr_deletion_right", enforcement: "block", description: "Users can request deletion of personal data" },
  { region: "EU", category: "cookie_consent", rule: "cookie_banner_required", enforcement: "warn", description: "Cookie consent banner required for EU visitors" },

  { region: "US_CA", category: "data_privacy", rule: "ccpa_opt_out", enforcement: "block", description: "CCPA opt-out rights for California residents" },
  { region: "US_CA", category: "data_sale", rule: "ccpa_do_not_sell", enforcement: "block", description: "Do Not Sell My Personal Information link required" },

  { region: "UK", category: "data_privacy", rule: "uk_gdpr_compliance", enforcement: "block", description: "UK GDPR compliance required post-Brexit" },
  { region: "UK", category: "age_verification", rule: "age_appropriate_design", enforcement: "warn", description: "Age Appropriate Design Code for under-18 content" },

  { region: "APAC_KR", category: "gaming", rule: "kr_game_rating", enforcement: "block", description: "Korean Game Rating Board compliance for gaming content" },
  { region: "APAC_KR", category: "loot_box", rule: "kr_loot_box_disclosure", enforcement: "block", description: "Loot box probability disclosure required in Korea" },

  { region: "APAC_JP", category: "gaming", rule: "jp_cero_compliance", enforcement: "warn", description: "CERO rating awareness for Japanese gaming content" },
  { region: "APAC_CN", category: "content", rule: "cn_content_restrictions", enforcement: "block", description: "Chinese content restrictions apply — political/religious content blocked" },

  { region: "LATAM_BR", category: "data_privacy", rule: "lgpd_compliance", enforcement: "block", description: "Brazilian LGPD data protection compliance required" },

  { region: "GLOBAL", category: "coppa", rule: "coppa_under_13", enforcement: "block", description: "COPPA compliance for content directed at children under 13" },
  { region: "GLOBAL", category: "ai_transparency", rule: "ai_content_labeling", enforcement: "warn", description: "AI-generated content should be labeled transparently" },
  { region: "GLOBAL", category: "accessibility", rule: "wcag_minimum", enforcement: "audit", description: "WCAG 2.1 AA minimum accessibility standards recommended" },
];

export function evaluateRegionalPolicy(
  region: string,
  categories?: string[]
): RegionalPolicyResult {
  const applicableRules = REGIONAL_POLICIES.filter((r) => {
    const regionMatch = r.region === region || r.region === "GLOBAL";
    const categoryMatch = !categories || categories.length === 0 || categories.includes(r.category);
    return regionMatch && categoryMatch;
  });

  const blocked = applicableRules.filter((r) => r.enforcement === "block");
  const warnings = applicableRules.filter((r) => r.enforcement === "warn");

  return {
    region,
    applicableRules,
    blocked,
    warnings,
    allowed: blocked.length === 0,
  };
}

export function getAllRegions(): string[] {
  return [...new Set(REGIONAL_POLICIES.map((r) => r.region))];
}

export function getPoliciesForRegion(region: string): RegionalPolicyRule[] {
  return REGIONAL_POLICIES.filter((r) => r.region === region || r.region === "GLOBAL");
}

export function detectRegionFromLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower.startsWith("de") || lower.startsWith("fr") || lower.startsWith("es") || lower.startsWith("it") || lower.startsWith("nl") || lower.startsWith("pt-pt")) return "EU";
  if (lower === "en-gb" || lower.startsWith("en-gb")) return "UK";
  if (lower === "en-us" || lower.startsWith("en-us")) return "US_CA";
  if (lower.startsWith("ko")) return "APAC_KR";
  if (lower.startsWith("ja")) return "APAC_JP";
  if (lower.startsWith("zh")) return "APAC_CN";
  if (lower.startsWith("pt-br") || lower.startsWith("pt_br")) return "LATAM_BR";
  return "GLOBAL";
}
