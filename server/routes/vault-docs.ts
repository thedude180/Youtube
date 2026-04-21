import type { Express } from "express";
import { requireAuth, getUserId } from "./helpers";
import { getVaultDocuments, generateVaultDocument, generateAllVaultDocuments, DOC_META } from "../services/vault-docs-generator";
import { db } from "../db";
import { vaultDocuments, VAULT_DOC_TYPES, type VaultDocType } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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

      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch vault documents" });
    }
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
      res.json({ status: "started", message: "Generating all 6 documents — this takes a few minutes. Refresh to see progress." });

      generateAllVaultDocuments(userId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[VaultDocs] Background generation error:", msg);
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

      res.json({ status: "started", message: `Generating ${docType} — refresh in ~30 seconds.` });

      generateVaultDocument(userId, docType as VaultDocType).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[VaultDocs] Background generation error for ${docType}:`, msg);
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
}
