import type { Platform } from "@shared/schema";

type ContentCheck = {
  title?: string;
  description?: string;
  tags?: string[];
  hasDisclosure?: boolean;
  copyrightCleared?: boolean;
};

type GateResult = {
  passed: boolean;
  issues: string[];
  warnings: string[];
  gatesChecked: string[];
};

const CLICKBAIT_PATTERNS = [
  /\b(you won't believe|shocking|insane|crazy)\b/i,
  /!!{3,}/,
  /\b(FREE|GIVEAWAY)\b.*!/i,
];

const PROHIBITED_PATTERNS = [
  /\b(hack|cheat|exploit|glitch)\b.*\b(download|link|free)\b/i,
  /\b(sub4sub|follow4follow|like4like)\b/i,
];

const PLATFORM_TITLE_LIMITS: Record<string, number> = {
  youtube: 100,
  tiktok: 150,
  twitch: 140,
  kick: 140,
  discord: 256,
  rumble: 100,
};

const PLATFORM_REQUIRED_TAGS: Record<string, string[]> = {
  youtube: [],
  tiktok: [],
};

export async function checkPublishingGates(
  userId: string,
  platform: Platform | string,
  content: ContentCheck
): Promise<GateResult> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const gatesChecked: string[] = [];

  gatesChecked.push("title_length");
  if (content.title) {
    const maxLen = PLATFORM_TITLE_LIMITS[platform] || 100;
    if (content.title.length > maxLen) {
      issues.push(`Title exceeds ${platform} limit of ${maxLen} characters (${content.title.length})`);
    }
    if (content.title.length < 5) {
      issues.push("Title too short (minimum 5 characters)");
    }
  }

  gatesChecked.push("clickbait_check");
  if (content.title) {
    for (const pattern of CLICKBAIT_PATTERNS) {
      if (pattern.test(content.title)) {
        warnings.push("Title contains potential clickbait language");
        break;
      }
    }
  }

  gatesChecked.push("prohibited_content");
  const fullText = [content.title, content.description, ...(content.tags || [])].join(" ");
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(fullText)) {
      issues.push("Content contains prohibited terms (hack/cheat downloads, engagement farming)");
      break;
    }
  }

  gatesChecked.push("disclosure_check");
  if (content.hasDisclosure === false) {
    const sponsorTerms = /\b(sponsor|paid|partner|affiliate|ad)\b/i;
    if (sponsorTerms.test(fullText)) {
      issues.push("Content appears sponsored but lacks disclosure");
    }
  }

  gatesChecked.push("copyright_check");
  if (content.copyrightCleared === false) {
    issues.push("Content has unresolved copyright claims");
  }

  gatesChecked.push("description_check");
  if (content.description && content.description.length > 5000) {
    warnings.push("Description exceeds 5000 characters — may be truncated on some platforms");
  }

  gatesChecked.push("tag_check");
  if (content.tags) {
    if (content.tags.length > 50) {
      warnings.push("Too many tags — most platforms use only the first 30-50");
    }
    const dupTags = content.tags.filter((t, i) => content.tags!.indexOf(t) !== i);
    if (dupTags.length > 0) {
      warnings.push(`Duplicate tags found: ${dupTags.slice(0, 3).join(", ")}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    gatesChecked,
  };
}

export function getPlatformPublishingRules(platform: string): {
  maxTitleLength: number;
  requiredTags: string[];
  disclosureRequired: boolean;
  copyrightCheckRequired: boolean;
} {
  return {
    maxTitleLength: PLATFORM_TITLE_LIMITS[platform] || 100,
    requiredTags: PLATFORM_REQUIRED_TAGS[platform] || [],
    disclosureRequired: true,
    copyrightCheckRequired: true,
  };
}
