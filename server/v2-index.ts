/**
 * CreatorOS v2 — clean feature-module architecture
 *
 * Boot sequence:
 * 1. DB pool
 * 2. pg-boss job queue
 * 3. Express middleware stack
 * 4. Auth (session + passport)
 * 5. Feature routes
 * 6. SSE endpoint
 * 7. Register job workers
 * 8. Static / SPA serving
 * 9. Global error handler
 * 10. Listen
 */
import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { rootLogger as log } from "./core/logger.js";
import { pool } from "./core/db.js";
import { startJobQueue, stopJobQueue } from "./core/job-queue.js";
import { sseConnect } from "./core/sse.js";
import { toHttpError, errorResponse } from "./core/errors.js";

import { configureAuth } from "./features/auth/passport.js";
import { authRouter } from "./features/auth/routes.js";
import { channelsRouter } from "./features/channels/routes.js";
import { contentRouter } from "./features/content/routes.js";
import { videoRouter } from "./features/video/routes.js";
import { autopilotRouter } from "./features/autopilot/routes.js";
import { moneyRouter } from "./features/money/routes.js";
import { growthRouter } from "./features/growth/routes.js";
import { notificationsRouter } from "./features/notifications/routes.js";
import { streamRouter } from "./features/stream/routes.js";

import { registerContentWorkers } from "./features/content/worker.js";
import { registerVideoWorkers } from "./features/video/worker.js";
import { registerAutopilotWorkers } from "./features/autopilot/worker.js";
import { registerGrowthWorkers } from "./features/growth/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 5000);

async function main() {
  // 2. Start job queue
  await startJobQueue();

  // 3. Express app
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false, // configured per-route for SSE compatibility
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // 4. Auth middleware
  configureAuth(app);

  // 5. Feature routes
  app.use("/api/auth", authRouter);
  app.use("/api/channels", channelsRouter);
  app.use("/api/content", contentRouter);
  app.use("/api/video", videoRouter);
  app.use("/api/autopilot", autopilotRouter);
  app.use("/api/money", moneyRouter);
  app.use("/api/growth", growthRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/stream", streamRouter);

  // 6. SSE endpoint
  app.get("/api/events", (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).end();
    sseConnect(userId, res);
  });

  // Health check
  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // 7. Register job workers
  registerContentWorkers();
  registerVideoWorkers();
  registerAutopilotWorkers();
  registerGrowthWorkers();

  // 8. Static serving
  if (isProd) {
    const distPath = path.join(__dirname, "..", "dist", "public");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      configFile: path.join(__dirname, "..", "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // 9. Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const appErr = toHttpError(err);
    if (appErr.statusCode >= 500) log.error("Unhandled error", appErr);
    res.status(appErr.statusCode).json(errorResponse(appErr, isProd));
  });

  // 10. Listen
  const server = app.listen(PORT, () => {
    log.info(`CreatorOS v2 listening on port ${PORT} [${isProd ? "production" : "development"}]`);
  });

  // Graceful shutdown
  async function shutdown(signal: string) {
    log.info(`Shutting down (${signal})`);
    server.close();
    await stopJobQueue();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
