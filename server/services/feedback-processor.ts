import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { feedbackSubmissions } from "@shared/schema";
import { SUBSCRIPTION_TIERS } from "@shared/models/auth";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { notifyAdmin } from "./notifications";

function getOpenAI() {
  return getOpenAIClient();
}

const ESCALATION_THRESHOLD = 3;
const LOOKBACK_DAYS = 30;

interface FeedbackAnalysis {
  actionable: boolean;
  category: string;
  priority: string;
  suggestedTier: string;
  implementationPlan: string;
  similarIssueCount: number;
  autoResolvable: boolean;
  resolution?: string;
}

export async function processFeedback(feedbackId: number, userId: string, message: string): Promise<FeedbackAnalysis> {
  const recentFeedback = await db.select()
    .from(feedbackSubmissions)
    .where(
      and(
        gte(feedbackSubmissions.createdAt, new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000))
      )
    )
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(50);

  const recentCategories = recentFeedback
    .filter(f => f.aiAnalysis)
    .map(f => ({
      category: (f.aiAnalysis as any)?.category || "unknown",
      message: f.message.substring(0, 100),
      status: f.status,
    }));

  let analysis: FeedbackAnalysis;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the AI brain of CreatorOS, a SaaS platform for content creators. You analyze user feedback and determine how to handle it.

The platform has 5 subscription tiers: ${SUBSCRIPTION_TIERS.join(", ")}.
- free: No platform connections, basic dashboard
- youtube ($9.99): 1 platform, basic automation
- starter ($29.99): 3 platforms, full automation
- pro ($79.99): 10 platforms, advanced AI features
- ultimate ($149.99): 25 platforms, all features unlocked

When a user submits feedback about an improvement:
1. Categorize it (ui, performance, feature, bug, content, automation, billing, security)
2. Determine which tier it belongs to (or "all" if applicable)
3. Assess if it's auto-resolvable (config change, setting adjustment, content update) vs needs code changes
4. Check if similar issues have been reported before

Recent feedback for context:
${JSON.stringify(recentCategories, null, 2)}

Respond in JSON format only.`,
        },
        {
          role: "user",
          content: `Analyze this user feedback and determine how to handle it:

"${message}"

Respond with this exact JSON structure:
{
  "actionable": true/false,
  "category": "ui|performance|feature|bug|content|automation|billing|security",
  "priority": "low|medium|high|critical",
  "suggestedTier": "free|youtube|starter|pro|ultimate|all",
  "implementationPlan": "Brief description of what would need to change",
  "autoResolvable": true/false,
  "resolution": "If auto-resolvable, describe what was done. Otherwise null."
}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);

    const similarCount = recentFeedback.filter(f => {
      const a = f.aiAnalysis as any;
      return a?.category === parsed.category && f.id !== feedbackId;
    }).length;

    analysis = {
      actionable: parsed.actionable ?? true,
      category: parsed.category || "feature",
      priority: parsed.priority || "medium",
      suggestedTier: parsed.suggestedTier || "all",
      implementationPlan: parsed.implementationPlan || "Needs review",
      similarIssueCount: similarCount,
      autoResolvable: parsed.autoResolvable ?? false,
      resolution: parsed.resolution || undefined,
    };
  } catch (err: any) {
    console.error("[FeedbackProcessor] AI analysis failed:", err.message);
    analysis = {
      actionable: true,
      category: "feature",
      priority: "medium",
      suggestedTier: "all",
      implementationPlan: "AI analysis unavailable — queued for manual review",
      similarIssueCount: 0,
      autoResolvable: false,
    };
  }

  const newStatus = analysis.autoResolvable ? "auto_resolved" : "ai_reviewed";

  await db.update(feedbackSubmissions)
    .set({
      aiAnalysis: analysis,
      status: newStatus,
      category: analysis.category,
      resolvedAt: analysis.autoResolvable ? new Date() : undefined,
      resolvedBy: analysis.autoResolvable ? "ai" : undefined,
    })
    .where(eq(feedbackSubmissions.id, feedbackId));

  const unresolvedSameCategory = await db.select({ count: sql<number>`count(*)` })
    .from(feedbackSubmissions)
    .where(
      and(
        eq(feedbackSubmissions.category, analysis.category),
        eq(feedbackSubmissions.adminNotified, false),
        sql`${feedbackSubmissions.status} != 'auto_resolved'`,
        gte(feedbackSubmissions.createdAt, new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000))
      )
    );

  const count = Number(unresolvedSameCategory[0]?.count || 0);

  if (count >= ESCALATION_THRESHOLD) {
    const sent = await notifyAdmin(
      `Recurring Issue: ${analysis.category}`,
      `The same type of issue ("${analysis.category}") has been reported ${count} times in the last ${LOOKBACK_DAYS} days and AI has not been able to fully resolve it.\n\nLatest submission:\n"${message}"\n\nAI Assessment: ${analysis.implementationPlan}\nPriority: ${analysis.priority}\nSuggested Tier: ${analysis.suggestedTier}`,
      count >= ESCALATION_THRESHOLD * 2 ? "critical" : "warning"
    );

    if (sent) {
      await db.update(feedbackSubmissions)
        .set({ adminNotified: true })
        .where(
          and(
            eq(feedbackSubmissions.category, analysis.category),
            eq(feedbackSubmissions.adminNotified, false)
          )
        );
    }
  }

  return analysis;
}

export async function getFeedbackStats(): Promise<{
  total: number;
  autoResolved: number;
  aiReviewed: number;
  pending: number;
  escalated: number;
  topCategories: { category: string; count: number }[];
}> {
  const all = await db.select().from(feedbackSubmissions)
    .where(gte(feedbackSubmissions.createdAt, new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)));

  const categoryMap = new Map<string, number>();
  let autoResolved = 0, aiReviewed = 0, pending = 0, escalated = 0;

  for (const f of all) {
    if (f.status === "auto_resolved") autoResolved++;
    else if (f.status === "ai_reviewed") aiReviewed++;
    else if (f.status === "pending") pending++;
    if (f.adminNotified) escalated++;

    const cat = f.category || "uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { total: all.length, autoResolved, aiReviewed, pending, escalated, topCategories };
}
