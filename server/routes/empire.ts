import type { Express, Request, Response } from "express";
import { createBusinessProfile, getEmpireOverview, getIndustryRegistry, adaptBusinessToIndustry, runEmpireCycle } from "../services/empire-brain";
import { db } from "../db";
import { businessProfiles, businessOperations, crossBusinessInsights, industryPlaybooks, empireMetrics } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export function registerEmpireRoutes(app: Express): void {
  app.get("/api/empire/overview", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const overview = await getEmpireOverview(userId);
      res.json(overview);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/empire/industries", async (_req: Request, res: Response) => {
    try {
      const industries = getIndustryRegistry();
      res.json(industries);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/empire/businesses", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { name, industry, businessType, description } = req.body;
      if (!name || !industry || !businessType) {
        return res.status(400).json({ error: "name, industry, and businessType are required" });
      }

      const profile = await createBusinessProfile(userId, { name, industry, businessType, description });
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/empire/businesses/:id", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const businessId = parseInt(req.params.id);
      const [business] = await db.select().from(businessProfiles)
        .where(and(eq(businessProfiles.id, businessId), eq(businessProfiles.userId, userId)))
        .limit(1);

      if (!business) return res.status(404).json({ error: "Business not found" });

      const operations = await db.select().from(businessOperations)
        .where(eq(businessOperations.businessId, businessId))
        .orderBy(desc(businessOperations.createdAt))
        .limit(50);

      const playbooks = await db.select().from(industryPlaybooks)
        .where(and(
          eq(industryPlaybooks.industry, business.industry),
          eq(industryPlaybooks.businessType, business.businessType),
          eq(industryPlaybooks.isActive, true),
        ));

      const insights = await db.select().from(crossBusinessInsights)
        .where(eq(crossBusinessInsights.sourceBusinessId, businessId))
        .orderBy(desc(crossBusinessInsights.createdAt))
        .limit(20);

      res.json({ business, operations, playbooks, insights });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/empire/businesses/:id/adapt", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const businessId = parseInt(req.params.id);
      await adaptBusinessToIndustry(businessId, userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/empire/cycle", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await runEmpireCycle();
      res.json({ success: true, message: "Empire cycle completed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/empire/insights", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const insights = await db.select().from(crossBusinessInsights)
        .where(eq(crossBusinessInsights.userId, userId))
        .orderBy(desc(crossBusinessInsights.createdAt))
        .limit(50);

      res.json(insights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/empire/metrics", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const metrics = await db.select().from(empireMetrics)
        .where(eq(empireMetrics.userId, userId))
        .orderBy(desc(empireMetrics.createdAt))
        .limit(30);

      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
