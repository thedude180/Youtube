import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  workloadLogs, burnoutAlerts, teamTasks, legalDocuments, creatorCrm,
  wellnessChecks, contentDnaProfiles, videos, channels,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function logWorkload(
  userId: string,
  data: { hoursWorked: number; category?: string; energyLevel?: number; notes?: string }
) {
  try {
    const [record] = await db.insert(workloadLogs).values({
      userId,
      date: new Date(),
      hoursWorked: data.hoursWorked,
      category: data.category || "general",
      energyLevel: data.energyLevel || 5,
      notes: data.notes || "",
    }).returning();
    return record;
  } catch (error) {
    console.error("Failed to log workload:", error);
    throw new Error("Could not log workload");
  }
}

export async function getWorkloadSummary(userId: string, days: number = 30) {
  try {
    const logs = await db.select().from(workloadLogs)
      .where(and(
        eq(workloadLogs.userId, userId),
        gte(workloadLogs.date, daysAgo(days))
      ))
      .orderBy(desc(workloadLogs.date));

    const totalHours = logs.reduce((s, l) => s + (l.hoursWorked || 0), 0);
    const avgEnergy = logs.length > 0
      ? logs.reduce((s, l) => s + (l.energyLevel || 5), 0) / logs.length
      : 5;

    const byCategory: Record<string, number> = {};
    for (const log of logs) {
      const cat = log.category || "general";
      byCategory[cat] = (byCategory[cat] || 0) + (log.hoursWorked || 0);
    }

    return {
      logs,
      totalHours,
      avgHoursPerDay: logs.length > 0 ? totalHours / Math.min(days, logs.length) : 0,
      avgEnergy: Math.round(avgEnergy * 10) / 10,
      byCategory,
      daysTracked: logs.length,
    };
  } catch (error) {
    console.error("Failed to get workload summary:", error);
    return { logs: [], totalHours: 0, avgHoursPerDay: 0, avgEnergy: 5, byCategory: {}, daysTracked: 0 };
  }
}

export async function checkBurnoutRisk(userId: string) {
  try {
    const [recentLogs, recentWellness] = await Promise.all([
      db.select().from(workloadLogs)
        .where(and(eq(workloadLogs.userId, userId), gte(workloadLogs.date, daysAgo(14))))
        .orderBy(desc(workloadLogs.date)),
      db.select().from(wellnessChecks)
        .where(and(eq(wellnessChecks.userId, userId), gte(wellnessChecks.createdAt, daysAgo(14))))
        .orderBy(desc(wellnessChecks.createdAt)),
    ]);

    const totalHours = recentLogs.reduce((s, l) => s + (l.hoursWorked || 0), 0);
    const avgEnergy = recentLogs.length > 0
      ? recentLogs.reduce((s, l) => s + (l.energyLevel || 5), 0) / recentLogs.length
      : 5;
    const avgMood = recentWellness.length > 0
      ? recentWellness.reduce((s, w) => s + w.mood, 0) / recentWellness.length
      : 3;
    const avgStress = recentWellness.length > 0
      ? recentWellness.reduce((s, w) => s + w.stress, 0) / recentWellness.length
      : 3;

    const prompt = `You are a wellness advisor for content creators. Analyze this creator's burnout risk.

LAST 14 DAYS:
- Total hours worked: ${totalHours}
- Average daily hours: ${(totalHours / 14).toFixed(1)}
- Average energy level: ${avgEnergy.toFixed(1)} / 10
- Average mood: ${avgMood.toFixed(1)} / 5
- Average stress: ${avgStress.toFixed(1)} / 5
- Days with data: ${recentLogs.length} workload logs, ${recentWellness.length} wellness checks
- Energy trend: ${recentLogs.length >= 3 ? (recentLogs[0]?.energyLevel || 5) > (recentLogs[recentLogs.length - 1]?.energyLevel || 5) ? "improving" : "declining" : "insufficient data"}

Analyze burnout risk as JSON:
{
  "riskLevel": "low | moderate | high | critical",
  "riskScore": 0-100,
  "factors": ["List of contributing factors"],
  "recommendation": "Primary recommendation for the creator",
  "immediateActions": ["1-3 actions to take right now"],
  "weeklyPlan": "Suggested weekly structure to prevent burnout",
  "autoThrottle": false (set true only if critical)
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const analysis = JSON.parse(content);

    if (analysis.riskLevel === "high" || analysis.riskLevel === "critical") {
      await db.insert(burnoutAlerts).values({
        userId,
        riskLevel: analysis.riskLevel,
        factors: analysis.factors || [],
        recommendation: analysis.recommendation || "",
        autoThrottleApplied: analysis.autoThrottle || false,
      });
    }

    return analysis;
  } catch (error) {
    console.error("Failed to check burnout risk:", error);
    return {
      riskLevel: "unknown",
      riskScore: 0,
      factors: ["Unable to analyze burnout risk"],
      recommendation: "Check back later when more data is available",
      immediateActions: [],
      weeklyPlan: "",
      autoThrottle: false,
    };
  }
}

export async function getBurnoutAlerts(userId: string) {
  try {
    return await db.select().from(burnoutAlerts)
      .where(and(
        eq(burnoutAlerts.userId, userId),
        sql`${burnoutAlerts.acknowledgedAt} IS NULL`
      ))
      .orderBy(desc(burnoutAlerts.createdAt));
  } catch (error) {
    console.error("Failed to get burnout alerts:", error);
    return [];
  }
}

export async function acknowledgeBurnoutAlert(userId: string, alertId: number) {
  try {
    const [updated] = await db.update(burnoutAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(and(
        eq(burnoutAlerts.id, alertId),
        eq(burnoutAlerts.userId, userId)
      ))
      .returning();
    return updated;
  } catch (error) {
    console.error("Failed to acknowledge burnout alert:", error);
    throw new Error("Could not acknowledge alert");
  }
}

export async function suggestDelegation(userId: string) {
  try {
    const workloadSummary = await getWorkloadSummary(userId, 30);
    const existingTasks = await db.select().from(teamTasks)
      .where(eq(teamTasks.userId, userId))
      .orderBy(desc(teamTasks.createdAt))
      .limit(20);

    const prompt = `You are a creator operations advisor. Suggest tasks this creator should delegate based on their workload.

WORKLOAD (last 30 days):
- Total hours: ${workloadSummary.totalHours}
- Hours by category: ${JSON.stringify(workloadSummary.byCategory)}
- Average energy: ${workloadSummary.avgEnergy}/10
- Days tracked: ${workloadSummary.daysTracked}

CURRENT TEAM TASKS:
${existingTasks.map(t => `- "${t.title}" assigned to: ${t.assignedTo || "unassigned"} (${t.status})`).join("\n") || "No team tasks"}

Suggest delegation as JSON:
{
  "suggestions": [
    {
      "task": "Task to delegate",
      "category": "editing | social-media | admin | design | community | research",
      "currentTimeSpent": "Estimated hours/week",
      "priority": "high | medium | low",
      "roleNeeded": "The type of person/VA to hire",
      "estimatedCost": "Estimated monthly cost",
      "impact": "Impact on creator's productivity"
    }
  ],
  "totalTimeSavings": "Estimated weekly hours saved",
  "priorityHire": "The first hire the creator should make",
  "budgetEstimate": "Monthly budget needed for delegation"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to suggest delegation:", error);
    return { suggestions: [], totalTimeSavings: "0", priorityHire: "", budgetEstimate: "" };
  }
}

export async function createTeamTask(
  userId: string,
  data: { title: string; assignedTo?: string; category?: string; priority?: string; description?: string; dueDate?: Date }
) {
  try {
    const [task] = await db.insert(teamTasks).values({
      userId,
      title: data.title,
      assignedTo: data.assignedTo || null,
      category: data.category || "general",
      priority: data.priority || "medium",
      status: "todo",
      description: data.description || "",
      dueDate: data.dueDate || null,
    }).returning();
    return task;
  } catch (error) {
    console.error("Failed to create team task:", error);
    throw new Error("Could not create team task");
  }
}

export async function getTeamTasks(userId: string) {
  try {
    return await db.select().from(teamTasks)
      .where(eq(teamTasks.userId, userId))
      .orderBy(desc(teamTasks.createdAt));
  } catch (error) {
    console.error("Failed to get team tasks:", error);
    return [];
  }
}

export async function updateTeamTask(id: number, updates: {
  title?: string;
  assignedTo?: string;
  category?: string;
  priority?: string;
  status?: string;
  description?: string;
  dueDate?: Date;
}) {
  try {
    const setValues: Record<string, any> = {};
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.assignedTo !== undefined) setValues.assignedTo = updates.assignedTo;
    if (updates.category !== undefined) setValues.category = updates.category;
    if (updates.priority !== undefined) setValues.priority = updates.priority;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.description !== undefined) setValues.description = updates.description;
    if (updates.dueDate !== undefined) setValues.dueDate = updates.dueDate;
    if (updates.status === "done") setValues.completedAt = new Date();

    const [updated] = await db.update(teamTasks)
      .set(setValues)
      .where(eq(teamTasks.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Failed to update team task:", error);
    throw new Error("Could not update team task");
  }
}

export async function getCreativeBlockSuggestions(userId: string) {
  try {
    const [dnaProfile, recentVideos] = await Promise.all([
      db.select().from(contentDnaProfiles)
        .where(eq(contentDnaProfiles.userId, userId))
        .orderBy(desc(contentDnaProfiles.lastUpdatedAt))
        .limit(1),
      storage.getVideosByUser(userId),
    ]);

    const profile = dnaProfile[0]?.profileData;
    const videoTitles = recentVideos.slice(0, 15).map(v => v.title).join(", ");

    const prompt = `You are a creative coach for content creators. This creator is experiencing creative block. Generate fresh ideas to help them get unstuck.

CREATOR DNA:
- Top formats: ${profile?.topFormats?.join(", ") || "unknown"}
- Tonal pattern: ${profile?.tonalPattern || "unknown"}
- Unique strengths: ${profile?.uniqueStrengths?.join(", ") || "unknown"}
- Best hooks: ${profile?.bestHooks?.join(", ") || "unknown"}

Recent content: ${videoTitles || "No recent videos"}

Generate unblock suggestions as JSON:
{
  "suggestions": [
    {
      "type": "content-idea | format-experiment | collaboration | challenge | personal-project | trend-remix",
      "title": "Suggestion title",
      "description": "Detailed description of how to execute this",
      "effort": "low | medium | high",
      "expectedOutcome": "What this will achieve",
      "inspiration": "Where this idea comes from"
    }
  ],
  "mindsetTips": ["3 tips for overcoming creative block"],
  "exercisePrompt": "A quick creative exercise to do right now (5 minutes)"
}

Provide 7-10 diverse suggestions ranging from quick wins to bigger projects. Make them specific to this creator's style.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to get creative block suggestions:", error);
    return { suggestions: [], mindsetTips: [], exercisePrompt: "" };
  }
}

export async function scanCompliance(userId: string, videoId: number) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { issues: [], error: "Video not found" };

    const prompt = `You are a content compliance expert specializing in FTC, COPPA, and platform rules. Scan this video for potential violations.

Video Title: "${video.title}"
Video Description: "${video.description || "None"}"
Video Type: ${video.type}
Platform: ${video.platform || "youtube"}
Tags: ${video.metadata?.tags?.join(", ") || "None"}

Scan for compliance issues as JSON:
{
  "overallRisk": "low | medium | high",
  "issues": [
    {
      "rule": "FTC | COPPA | Platform ToS | Copyright | Accessibility",
      "severity": "info | warning | violation",
      "description": "What the potential issue is",
      "recommendation": "How to fix or mitigate",
      "deadline": "If time-sensitive, when to address"
    }
  ],
  "disclosureNeeded": false,
  "disclosureText": "If disclosure is needed, suggested text",
  "ageRestrictionRecommended": false,
  "tips": ["2-3 proactive compliance tips"]
}

Check for:
- Sponsored content without proper disclosure (#ad, paid partnership)
- COPPA violations (content aimed at children with tracking)
- Copyright risks in title/description
- FTC endorsement guidelines
- Platform-specific monetization rules
- Accessibility requirements`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to scan compliance:", error);
    return { overallRisk: "unknown", issues: [], tips: [] };
  }
}

export async function storeLegalDocument(
  userId: string,
  data: {
    docType: string;
    title: string;
    brandName?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    value?: number;
    notes?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    const [doc] = await db.insert(legalDocuments).values({
      userId,
      docType: data.docType,
      title: data.title,
      brandName: data.brandName || null,
      status: data.status || "draft",
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      value: data.value || null,
      notes: data.notes || null,
      metadata: data.metadata || {},
    }).returning();
    return doc;
  } catch (error) {
    console.error("Failed to store legal document:", error);
    throw new Error("Could not store legal document");
  }
}

export async function getLegalDocuments(userId: string) {
  try {
    return await db.select().from(legalDocuments)
      .where(eq(legalDocuments.userId, userId))
      .orderBy(desc(legalDocuments.createdAt));
  } catch (error) {
    console.error("Failed to get legal documents:", error);
    return [];
  }
}

export async function manageCrm(
  userId: string,
  action: "create" | "get" | "update",
  data?: any
) {
  try {
    switch (action) {
      case "create": {
        const [contact] = await db.insert(creatorCrm).values({
          userId,
          contactName: data.contactName,
          company: data.company || null,
          role: data.role || null,
          email: data.email || null,
          platform: data.platform || null,
          relationshipType: data.relationshipType || "lead",
          status: data.status || "lead",
          notes: data.notes || null,
          dealValue: data.dealValue || null,
          lastContactedAt: data.lastContactedAt || null,
        }).returning();
        return contact;
      }

      case "get": {
        const contacts = await db.select().from(creatorCrm)
          .where(eq(creatorCrm.userId, userId))
          .orderBy(desc(creatorCrm.createdAt));
        return contacts;
      }

      case "update": {
        if (!data?.id) throw new Error("Contact ID required for update");
        const setValues: Record<string, any> = {};
        if (data.contactName !== undefined) setValues.contactName = data.contactName;
        if (data.company !== undefined) setValues.company = data.company;
        if (data.role !== undefined) setValues.role = data.role;
        if (data.email !== undefined) setValues.email = data.email;
        if (data.platform !== undefined) setValues.platform = data.platform;
        if (data.relationshipType !== undefined) setValues.relationshipType = data.relationshipType;
        if (data.status !== undefined) setValues.status = data.status;
        if (data.notes !== undefined) setValues.notes = data.notes;
        if (data.dealValue !== undefined) setValues.dealValue = data.dealValue;
        if (data.lastContactedAt !== undefined) setValues.lastContactedAt = data.lastContactedAt;

        const [updated] = await db.update(creatorCrm)
          .set(setValues)
          .where(and(eq(creatorCrm.id, data.id), eq(creatorCrm.userId, userId)))
          .returning();
        return updated;
      }

      default:
        throw new Error(`Unknown CRM action: ${action}`);
    }
  } catch (error) {
    console.error(`Failed to manage CRM (${action}):`, error);
    if (action === "get") return [];
    throw new Error(`Could not ${action} CRM contact`);
  }
}
