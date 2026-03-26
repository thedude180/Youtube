import { db } from "../db";
import { metricRollups } from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("metric-rollups");

export async function rollupMetrics(): Promise<{
  rolledUp: number;
  metricsProcessed: number;
  periodStart: string;
  periodEnd: string;
}> {
  const { getMetrics } = await import("./resilience-observability");

  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const periodStart = new Date(periodEnd.getTime() - 3_600_000);

  const metrics = getMetrics(undefined, periodStart.getTime());
  const inPeriod = metrics.filter(m => m.timestamp >= periodStart.getTime() && m.timestamp < periodEnd.getTime());

  if (inPeriod.length === 0) {
    return { rolledUp: 0, metricsProcessed: 0, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
  }

  const grouped = new Map<string, typeof inPeriod>();
  for (const m of inPeriod) {
    const key = `${m.name}|${m.unit}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  let rolledUp = 0;
  for (const [key, entries] of grouped) {
    const [metricName, unit] = key.split("|");
    const values = entries.map(e => e.value);
    const sum = values.reduce((a, b) => a + b, 0);

    const tagSample: Record<string, string> = {};
    for (const e of entries) {
      for (const [k, v] of Object.entries(e.tags)) {
        if (!tagSample[k]) tagSample[k] = v;
      }
    }

    try {
      await db.insert(metricRollups).values({
        metricName,
        periodStart,
        periodEnd,
        count: entries.length,
        sum,
        avg: sum / entries.length,
        min: Math.min(...values),
        max: Math.max(...values),
        unit,
        tags: tagSample,
      }).onConflictDoUpdate({
        target: [metricRollups.metricName, metricRollups.periodStart, metricRollups.periodEnd],
        set: {
          count: sql`${metricRollups.count} + excluded.count`,
          sum: sql`${metricRollups.sum} + excluded.sum`,
          avg: sql`(${metricRollups.sum} + excluded.sum) / (${metricRollups.count} + excluded.count)`,
          min: sql`LEAST(${metricRollups.min}, excluded.min)`,
          max: sql`GREATEST(${metricRollups.max}, excluded.max)`,
        },
      });
      rolledUp++;
    } catch (err: unknown) {
      logger.error(`Failed to persist rollup for ${metricName}: ${(err as Error)?.message}`);
    }
  }

  logger.info(`Rolled up ${rolledUp} metrics from ${inPeriod.length} data points for period ${periodStart.toISOString()}`);
  return { rolledUp, metricsProcessed: inPeriod.length, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
}

export async function getMetricTrends(
  metricName: string,
  hours: number = 24,
): Promise<Array<{
  periodStart: string;
  periodEnd: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  sum: number;
  unit: string;
}>> {
  const since = new Date(Date.now() - hours * 3_600_000);

  const rows = await db.select().from(metricRollups)
    .where(and(
      eq(metricRollups.metricName, metricName),
      gte(metricRollups.periodStart, since),
    ))
    .orderBy(desc(metricRollups.periodStart))
    .limit(hours);

  return rows.map(r => ({
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    count: r.count,
    avg: r.avg,
    min: r.min,
    max: r.max,
    sum: r.sum,
    unit: r.unit,
  }));
}

export async function getAvailableMetrics(): Promise<Array<{ metricName: string; latestPeriod: string; totalRollups: number }>> {
  const rows = await db.execute(sql`
    SELECT metric_name, MAX(period_start) as latest_period, COUNT(*)::int as total_rollups
    FROM metric_rollups
    GROUP BY metric_name
    ORDER BY metric_name
  `);

  return (rows.rows as any[]).map(r => ({
    metricName: r.metric_name,
    latestPeriod: r.latest_period ? new Date(r.latest_period).toISOString() : "",
    totalRollups: parseInt(r.total_rollups, 10),
  }));
}

export async function cleanupOldRollups(retentionDays: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await db.delete(metricRollups)
    .where(lte(metricRollups.periodEnd, cutoff))
    .returning({ id: metricRollups.id });
  return result.length;
}
