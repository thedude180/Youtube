import type { Express, Request, Response } from "express";
import { getOpenAIClient } from "../lib/openai";
import { getUserId } from "./helpers";
import { storage } from "../storage";
import {
  ALL_BUSINESS_AGENTS,
  runBusinessAgentCycle,
  runSingleBusinessAgent,
} from "../business-agent-engine";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const BUSINESS_ADVISOR_CHAT_PROMPTS: Record<string, string> = {
  "biz-cfo": ALL_BUSINESS_AGENTS["biz-cfo"].advisorSystemPrompt,
  "biz-cmo": ALL_BUSINESS_AGENTS["biz-cmo"].advisorSystemPrompt,
  "biz-strategy": ALL_BUSINESS_AGENTS["biz-strategy"].advisorSystemPrompt,
  "biz-revenue": ALL_BUSINESS_AGENTS["biz-revenue"].advisorSystemPrompt,
  "biz-partnerships": ALL_BUSINESS_AGENTS["biz-partnerships"].advisorSystemPrompt,
  "biz-growth": ALL_BUSINESS_AGENTS["biz-growth"].advisorSystemPrompt,
  "biz-ops": ALL_BUSINESS_AGENTS["biz-ops"].advisorSystemPrompt,
  "biz-brand": ALL_BUSINESS_AGENTS["biz-brand"].advisorSystemPrompt,
  "biz-investor": ALL_BUSINESS_AGENTS["biz-investor"].advisorSystemPrompt,
};

export function registerBusinessAgentRoutes(app: Express) {
  app.get("/api/business-agents/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const agentIds = Object.keys(ALL_BUSINESS_AGENTS);
    const allActivities = await storage.getAgentActivities(userId, undefined, 500);
    const relevant = allActivities.filter(a => agentIds.includes(a.agentId));

    const statusMap = agentIds.map(agentId => {
      const agentActs = relevant.filter(a => a.agentId === agentId);
      const running = agentActs.find(a => a.status === "running");
      const completed = agentActs.filter(a => a.status === "completed");
      const last = completed[0];

      return {
        agentId,
        status: running ? "running" : completed.length > 0 ? "idle" : "standby",
        lastRun: last?.createdAt ?? null,
        lastFinding: last ? (last.details as any)?.description ?? null : null,
        activityCount: completed.length,
      };
    });

    res.json(statusMap);
  });

  app.get("/api/business-agents/activities", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const agentIds = Object.keys(ALL_BUSINESS_AGENTS);
    const allActivities = await storage.getAgentActivities(userId, undefined, 300);
    const bizActivities = allActivities
      .filter(a => agentIds.includes(a.agentId) && a.status === "completed")
      .slice(0, 50);

    res.json(bizActivities);
  });

  app.post("/api/business-agents/run-all", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    res.json({ message: "Business agent cycle started" });
    runBusinessAgentCycle(userId).catch(() => {});
  });

  app.post("/api/business-agents/:agentId/run", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { agentId } = req.params;
    const found = await runSingleBusinessAgent(userId, agentId);
    if (!found) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ message: "Business agent task queued", agentId });
  });

  app.post("/api/business-agents/chat", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { advisorId, message } = req.body;
    if (!advisorId || !message) {
      res.status(400).json({ error: "advisorId and message required" });
      return;
    }

    const systemPrompt = BUSINESS_ADVISOR_CHAT_PROMPTS[advisorId];
    if (!systemPrompt) {
      res.status(404).json({ error: "Advisor not found" });
      return;
    }

    try {
      const openai = getOpenAIClient();
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 600,
        temperature: 0.7,
      });
      res.json({ reply: response.choices[0]?.message?.content ?? "I'm analyzing your question..." });
    } catch {
      res.status(500).json({ error: "AI service unavailable" });
    }
  });
}
