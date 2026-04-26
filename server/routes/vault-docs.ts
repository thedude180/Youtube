import type { Express } from "express";
import { requireAuth, getUserId } from "./helpers";
import { getVaultDocuments, generateVaultDocument, generateAllVaultDocuments, DOC_META } from "../services/vault-docs-generator";
import { db } from "../db";
import { vaultDocuments, VAULT_DOC_TYPES, type VaultDocType } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { addSseClient } from "../lib/vault-docs-sse";
import { createLogger } from "../lib/logger";

const logger = createLogger("vault-docs");

function parseDocType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!(VAULT_DOC_TYPES as readonly string[]).includes(raw)) return null;
  return raw;
}

export function registerVaultDocsRoutes(app: Express) {
  // GET /api/vault-docs — list all documents (metadata only, no full content)
  app.get("/api/vault-docs", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docs = await db
        .select({
          id: vaultDocuments.id,
          userId: vaultDocuments.userId,
          docType: vaultDocuments.docType,
          title: vaultDocuments.title,
          status: vaultDocuments.status,
          wordCount: vaultDocuments.wordCount,
          errorMessage: vaultDocuments.errorMessage,
          generatedAt: vaultDocuments.generatedAt,
          metadata: vaultDocuments.metadata,
          createdAt: vaultDocuments.createdAt,
          updatedAt: vaultDocuments.updatedAt,
        })
        .from(vaultDocuments)
        .where(eq(vaultDocuments.userId, userId));

      const byType = new Map(docs.map(d => [d.docType, d]));
      const result = VAULT_DOC_TYPES.map(docType => {
        const existing = byType.get(docType);
        const meta = DOC_META[docType as VaultDocType];
        if (existing) return existing;
        return {
          id: null as number | null,
          userId,
          docType,
          title: meta.title,
          status: "pending",
          wordCount: 0,
          errorMessage: null as string | null,
          generatedAt: null as Date | null,
          metadata: { emoji: meta.emoji, description: meta.description } as Record<string, unknown>,
          createdAt: null as Date | null,
          updatedAt: null as Date | null,
        };
      });

      // Auto-trigger generation if no docs exist yet for this user
      if (docs.length === 0) {
        generateAllVaultDocuments(userId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("Auto-seed generation failed", { error: msg });
        });
      }

      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch vault documents" });
    }
  });

  // GET /api/vault-docs/stream — SSE endpoint for real-time document status updates
  app.get("/api/vault-docs/stream", requireAuth, (req, res) => {
    const userId = getUserId(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(": connected\n\n");

    const cleanup = addSseClient(userId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      cleanup();
    });
  });

  // GET /api/vault-docs/:docType — get a single document with full content
  app.get("/api/vault-docs/:docType", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docType = parseDocType(req.params["docType"]);

      if (!docType) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const docs = await db.select().from(vaultDocuments)
        .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
        .limit(1);

      if (!docs.length) {
        const meta = DOC_META[docType as VaultDocType];
        return res.json({
          id: null,
          docType,
          title: meta.title,
          content: "",
          status: "pending",
          wordCount: 0,
          metadata: { emoji: meta.emoji, description: meta.description },
        });
      }

      res.json(docs[0]);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // POST /api/vault-docs/generate/all — generate all 6 documents (async)
  app.post("/api/vault-docs/generate/all", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      res.json({ queued: true, message: "Generating all 6 documents — this takes a few minutes. Refresh to see progress." });

      generateAllVaultDocuments(userId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Background generation failed", { error: msg });
      });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // POST /api/vault-docs/generate/:docType — generate a single document (async)
  app.post("/api/vault-docs/generate/:docType", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docType = parseDocType(req.params["docType"]);

      if (!docType) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      res.json({ queued: true, message: `Generating ${docType} — refresh in ~30 seconds.` });

      generateVaultDocument(userId, docType as VaultDocType).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Background generation failed", { docType, error: msg });
      });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // GET /api/vault-docs/:docType/export — download as .md file
  app.get("/api/vault-docs/:docType/export", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docType = parseDocType(req.params["docType"]);

      if (!docType) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const docs = await db.select().from(vaultDocuments)
        .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
        .limit(1);

      if (!docs.length || !docs[0].content) {
        return res.status(404).json({ error: "Document not yet generated" });
      }

      const doc = docs[0];
      const filename = `${docType.split("_").join("-")}-creatorOS.md`;

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(doc.content);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to export document" });
    }
  });

  // ── Backward-compatible aliases at /api/vault/documents ──────────────────

  // GET /api/vault/documents — alias of /api/vault-docs
  app.get("/api/vault/documents", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docs = await db
        .select({
          id: vaultDocuments.id,
          userId: vaultDocuments.userId,
          docType: vaultDocuments.docType,
          title: vaultDocuments.title,
          status: vaultDocuments.status,
          wordCount: vaultDocuments.wordCount,
          errorMessage: vaultDocuments.errorMessage,
          generatedAt: vaultDocuments.generatedAt,
          metadata: vaultDocuments.metadata,
          createdAt: vaultDocuments.createdAt,
          updatedAt: vaultDocuments.updatedAt,
        })
        .from(vaultDocuments)
        .where(eq(vaultDocuments.userId, userId));

      const mapped = VAULT_DOC_TYPES.map((dt) => {
        const existing = docs.find((d) => d.docType === dt);
        if (existing) return existing;
        const meta = DOC_META[dt as VaultDocType];
        return {
          id: null, userId, docType: dt, title: meta.title,
          status: "pending", wordCount: 0, errorMessage: null,
          generatedAt: null, metadata: { emoji: meta.emoji, description: meta.description },
          createdAt: null, updatedAt: null,
        };
      });
      res.json(mapped);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // POST /api/vault/documents/generate — optional { docType } in body
  app.post("/api/vault/documents/generate", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body as { docType?: string };
      const docType = body.docType ? parseDocType(body.docType) : null;

      if (docType) {
        res.json({ queued: true, message: `Generating ${docType} — refresh in ~30 seconds.` });
        generateVaultDocument(userId, docType as VaultDocType).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("Background generation failed", { docType, error: msg });
        });
      } else {
        res.json({ queued: true, message: "Generating all 6 documents — this takes a few minutes. Refresh to see progress." });
        generateAllVaultDocuments(userId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("Background generation failed", { error: msg });
        });
      }
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // GET /api/vault/documents/:idOrDocType — supports both numeric ID and docType string
  app.get("/api/vault/documents/:idOrDocType", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const param = String(req.params["idOrDocType"] ?? "");
      const numericId = /^\d+$/.test(param) ? parseInt(param, 10) : null;

      const docs = numericId !== null
        ? await db.select().from(vaultDocuments)
            .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.id, numericId)))
            .limit(1)
        : (() => {
            const docType = parseDocType(param);
            if (!docType) return Promise.resolve([]);
            return db.select().from(vaultDocuments)
              .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
              .limit(1);
          })();

      const rows = await docs;
      if (!rows.length) return res.status(404).json({ error: "Document not found" });
      res.json(rows[0]);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // GET /api/vault/documents/:idOrDocType/export — supports both numeric ID and docType string
  app.get("/api/vault/documents/:idOrDocType/export", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const param = String(req.params["idOrDocType"] ?? "");
      const numericId = /^\d+$/.test(param) ? parseInt(param, 10) : null;

      const docs = numericId !== null
        ? await db.select().from(vaultDocuments)
            .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.id, numericId)))
            .limit(1)
        : await (async () => {
            const docType = parseDocType(param);
            if (!docType) return [];
            return db.select().from(vaultDocuments)
              .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
              .limit(1);
          })();

      if (!docs.length || !docs[0].content) return res.status(404).json({ error: "Document not yet generated" });
      const doc = docs[0];
      const filename = `${doc.docType.split("_").join("-")}-creatorOS.md`;
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(doc.content);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to export document" });
    }
  });
}
