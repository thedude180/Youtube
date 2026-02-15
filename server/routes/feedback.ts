import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { feedbackSubmissions } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { processFeedback, getFeedbackStats } from "../services/feedback-processor";
import { getUserId } from "./helpers";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

export function registerFeedbackRoutes(app: Express) {
  app.post("/api/feedback", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const schema = z.object({
        message: z.string().min(5).max(2000),
        type: z.enum(["improvement", "bug", "feature", "complaint"]).optional(),
      });
      const parsed = schema.parse(req.body);

      const [inserted] = await db.insert(feedbackSubmissions).values({
        userId,
        message: parsed.message,
        type: parsed.type || "improvement",
        status: "pending",
      }).returning();

      processFeedback(inserted.id, userId, parsed.message).catch(err => {
        console.error("[Feedback] Background processing failed:", err.message);
      });

      res.json({
        id: inserted.id,
        status: "received",
        message: "Your feedback has been received and is being analyzed by AI.",
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/feedback", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const submissions = await db.select()
        .from(feedbackSubmissions)
        .where(eq(feedbackSubmissions.userId, userId))
        .orderBy(desc(feedbackSubmissions.createdAt))
        .limit(50);

      res.json(submissions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/feedback/stats", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const stats = await getFeedbackStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
