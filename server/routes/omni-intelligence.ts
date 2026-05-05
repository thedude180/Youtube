import type { Express, Request, Response } from "express";
import { getIntelligenceFeed, runIntelligenceCycle } from "../services/omni-intelligence-harvester";
import { intelligenceSignals, predictiveTrends } from "@shared/schema";
import { db } from "../db";
import { eq, desc, gte, and, count } from "drizzle-orm";

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req as any).session?.userId ?? (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

export function registerOmniIntelligenceRoutes(app: Express): void {

  app.get("/api/intelligence/feed", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    try {
      const feed = await getIntelligenceFeed(userId);
      res.json(feed);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load intelligence feed" });
    }
  });

  app.post("/api/intelligence/run", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    res.json({ ok: true, message: "Intelligence harvest triggered — results will appear in the feed within 2 minutes." });
    runIntelligenceCycle().catch(() => {});
  });

  app.get("/api/intelligence/signals", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    try {
      const since = new Date(Date.now() - 72 * 3_600_000);
      const source = req.query.source as string | undefined;
      const where = source
        ? and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since), eq(intelligenceSignals.source, source))
        : and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since));
      const signals = await db.select().from(intelligenceSignals)
        .where(where)
        .orderBy(desc(intelligenceSignals.score))
        .limit(100);
      res.json({ signals });
    } catch {
      res.status(500).json({ error: "Failed to load signals" });
    }
  });

  app.get("/api/intelligence/stats", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    try {
      const since = new Date(Date.now() - 48 * 3_600_000);
      const [total, trends] = await Promise.all([
        db.select({ count: count() }).from(intelligenceSignals)
          .where(and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since))),
        db.select({ count: count() }).from(predictiveTrends)
          .where(and(eq(predictiveTrends.userId, userId), gte(predictiveTrends.createdAt, since))),
      ]);
      res.json({
        signalsLast48h: total[0]?.count ?? 0,
        trendsIdentified: trends[0]?.count ?? 0,
        sources: ["youtube_trending", "reddit", "rss", "web_search"],
      });
    } catch {
      res.status(500).json({ error: "Failed to load stats" });
    }
  });
}
