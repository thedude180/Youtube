import { checkLiveTrustBudget, deductLiveTrust } from "./live-trust";

const titleHistory = new Map<string, { title: string; changedAt: Date; reason: string }[]>();

export function generateLiveTitle(
  gameTitle: string,
  options: {
    viewerCount?: number;
    streamDurationMinutes?: number;
    milestone?: string;
    isFirstStream?: boolean;
  } = {},
): string {
  const parts: string[] = [];

  parts.push("🔴 LIVE:");
  parts.push(gameTitle);

  if (options.milestone) {
    parts.push(`| ${options.milestone}`);
  } else if (options.viewerCount && options.viewerCount >= 100) {
    parts.push(`| ${options.viewerCount}+ watching`);
  }

  parts.push("| No Commentary");
  parts.push("| PS5 4K");

  if (options.isFirstStream) {
    parts.push("| First Playthrough");
  }

  return parts.join(" ");
}

export function validateLiveTitle(
  userId: string,
  title: string,
): { valid: boolean; issues: string[]; trustCheck: ReturnType<typeof checkLiveTrustBudget> } {
  const issues: string[] = [];

  if (title.length > 100) issues.push("Title exceeds 100 characters");
  if (title.length < 10) issues.push("Title is too short");

  const clickbait = /\b(INSANE|CRAZY|OMG|UNBELIEVABLE|YOU WON'T BELIEVE)\b/i;
  if (clickbait.test(title)) issues.push("Title contains clickbait language");

  const tooManyEmoji = (title.match(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (tooManyEmoji > 3) issues.push("Too many emojis in title");

  if (!/no\s*comment/i.test(title) && !/gameplay/i.test(title) && !/walkthrough/i.test(title)) {
    issues.push("Title should mention 'no commentary', 'gameplay', or 'walkthrough'");
  }

  const trustCheck = checkLiveTrustBudget(userId, "title_change");

  return {
    valid: issues.length === 0 && trustCheck.allowed,
    issues,
    trustCheck,
  };
}

export function applyLiveTitle(userId: string, title: string, reason: string): boolean {
  const deducted = deductLiveTrust(userId, "title_change");
  if (!deducted) return false;

  if (!titleHistory.has(userId)) titleHistory.set(userId, []);
  titleHistory.get(userId)!.push({ title, changedAt: new Date(), reason });
  return true;
}

export function getLiveTitleHistory(userId: string) {
  return titleHistory.get(userId) || [];
}
