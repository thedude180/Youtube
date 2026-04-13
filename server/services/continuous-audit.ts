import { db } from "../db";
import { users, channels, videos, jobs, intelligentJobs, healthAuditReports, securityEvents } from "@shared/schema";
import { routeNotification } from "./notification-system";
import { createLogger } from "../lib/logger";
import { sql, lt, count, and, eq, ne, notInArray, desc } from "drizzle-orm";

const logger = createLogger("continuous-audit");

class ContinuousAudit {
  async run(): Promise<void> {
    logger.info("Starting continuous audit run");
    try {
      // 1. Collect stats in parallel
      const [
        orphanedJobs,
        staleChannelTokens,
        failedIntelligentJobsCount,
        stuckInProgressJobs,
      ] = await Promise.all([
        db.select({ value: count() }).from(jobs).where(
          and(
            eq(jobs.status, "in_progress"),
            lt(jobs.startedAt, sql`NOW() - INTERVAL '1 hour'`)
          )
        ).then(r => Number(r[0].value)),
        db.select({ value: count() }).from(channels).where(
          lt(channels.tokenExpiresAt, sql`NOW()`)
        ).then(r => Number(r[0].value)),
        db.select({ value: count() }).from(intelligentJobs).where(
          and(
            eq(intelligentJobs.status, "failed"),
            lt(intelligentJobs.createdAt, sql`NOW() - INTERVAL '7 days'`)
          )
        ).then(r => Number(r[0].value)),
        db.select({ value: count() }).from(jobs).where(
          and(
            eq(jobs.status, "in_progress"),
            lt(jobs.startedAt, sql`NOW() - INTERVAL '2 hours'`)
          )
        ).then(r => Number(r[0].value)),
      ]);

      // 2. Auto-fix: stuck jobs
      let fixedIssues = 0;
      if (stuckInProgressJobs > 0) {
        const result = await db.update(jobs)
          .set({ 
            status: "failed", 
            errorMessage: "stuck job cleared by audit",
            completedAt: new Date()
          })
          .where(
            and(
              eq(jobs.status, "in_progress"),
              lt(jobs.startedAt, sql`NOW() - INTERVAL '2 hours'`)
            )
          );
        fixedIssues += (result as any).rowCount || 0;
      }

      // 3. Auto-fix: delete old failed intelligent jobs
      if (failedIntelligentJobsCount > 0) {
        const result = await db.delete(intelligentJobs)
          .where(
            and(
              eq(intelligentJobs.status, "failed"),
              lt(intelligentJobs.createdAt, sql`NOW() - INTERVAL '7 days'`)
            )
          );
        fixedIssues += (result as any).rowCount || 0;
      }

      // 4. Build report object
      const reportData = {
        orphanedRecords: orphanedJobs,
        staleTokens: staleChannelTokens,
        failedIntelligentJobs: failedIntelligentJobsCount,
        stuckInProgressJobs,
        timestamp: new Date().toISOString(),
      };

      // 5. Call AI for analysis
      let aiSummary = "AI analysis skipped or failed.";
      try {
        const response = await fetch(`${process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.AI_INTEGRATIONS_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini", // Falling back to gpt-4o-mini as gpt-4o-mini doesn't exist yet
            messages: [
              {
                role: "system",
                content: "You are a system health auditor. Analyze the provided system stats and provide a concise summary of the system health and any urgent actions needed. Return a JSON object with a 'summary' field."
              },
              {
                role: "user",
                content: JSON.stringify(reportData)
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (response.ok) {
          const data = await response.json();
          aiSummary = data.choices[0]?.message?.content ? JSON.parse(data.choices[0].message.content).summary : aiSummary;
        }
      } catch (aiErr: any) {
        logger.error("AI Audit analysis failed", { error: aiErr.message });
      }

      // 6. Persistence
      const [report] = await db.insert(healthAuditReports).values({
        orphanedRecords: orphanedJobs,
        staleTokens: staleChannelTokens,
        fixedIssues,
        p1Issues: staleChannelTokens > 5 ? { urgent: "High number of stale tokens" } : null,
        fullReport: reportData,
        aiSummary,
      }).returning();

      logger.info("Audit report generated", { reportId: report.id });

      // 7. Notification if critical
      if (staleChannelTokens > 50 || stuckInProgressJobs > 20) {
        const adminUser = await db.query.users.findFirst({
          where: eq(users.role, "admin")
        });
        
        if (adminUser) {
          await routeNotification(adminUser.id, {
            title: "Critical System Audit Alert",
            message: `Audit found ${staleChannelTokens} stale tokens and ${stuckInProgressJobs} stuck jobs. Summary: ${aiSummary}`,
            severity: "critical",
            category: "system"
          });
        }
      }

    } catch (err: any) {
      logger.error("Continuous audit run failed", { error: err.message });
    }
  }
}

export const continuousAudit = new ContinuousAudit();

export const continuousAuditInterval = setInterval(() => {
  continuousAudit.run().catch(err => logger.error("Scheduled audit failed", { error: err.message }));
}, 24 * 60 * 60 * 1000);
