import type { Express } from "express";
import { requireAuth, getUserId } from "./helpers";
import { getVaultDocuments, generateVaultDocument, generateAllVaultDocuments, DOC_META } from "../services/vault-docs-generator";
import { db } from "../db";
import { vaultDocuments, VAULT_DOC_TYPES, type VaultDocType } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export function registerVaultDocsRoutes(app: Express) {
  // GET /api/vault-docs — list all documents for the user
  app.get("/api/vault-docs", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const docs = await getVaultDocuments(userId);

      // Merge with metadata so every docType always appears in the response
      const byType = new Map(docs.map(d => [d.docType, d]));
      const result = VAULT_DOC_TYPES.map(docType => {
        const existing = byType.get(docType);
        const meta = DOC_META[docType as VaultDocType];
        if (existing) return existing;
        return {
          id: null,
          userId,
          docType,
          title: meta.title,
          content: "",
          status: "pending",
          wordCount: 0,
          errorMessage: null,
          generatedAt: null,
          metadata: { emoji: meta.emoji, description: meta.description },
          createdAt: null,
          updatedAt: null,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch vault documents" });
    }
  });

  // GET /api/vault-docs/:docType — get a single document
  app.get("/api/vault-docs/:docType", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { docType } = req.params;

      if (!VAULT_DOC_TYPES.includes(docType as VaultDocType)) {
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
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // POST /api/vault-docs/generate/all — generate all 6 documents
  app.post("/api/vault-docs/generate/all", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);

      // Start generation async, respond immediately
      res.json({ status: "started", message: "Generating all 6 documents — this takes a few minutes. Refresh to see progress." });

      generateAllVaultDocuments(userId).catch((err) => {
        console.error("[VaultDocs] Background generation error:", err?.message);
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // POST /api/vault-docs/generate/:docType — generate a single document
  app.post("/api/vault-docs/generate/:docType", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { docType } = req.params;

      if (!VAULT_DOC_TYPES.includes(docType as VaultDocType)) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      // Start async, respond immediately
      res.json({ status: "started", message: `Generating ${docType} — refresh in ~30 seconds.` });

      generateVaultDocument(userId, docType as VaultDocType).catch((err) => {
        console.error(`[VaultDocs] Background generation error for ${docType}:`, err?.message);
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // GET /api/vault-docs/:docType/export — download as .md file
  app.get("/api/vault-docs/:docType/export", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { docType } = req.params;

      if (!VAULT_DOC_TYPES.includes(docType as VaultDocType)) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const docs = await db.select().from(vaultDocuments)
        .where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.docType, docType)))
        .limit(1);

      if (!docs.length || !docs[0].content) {
        return res.status(404).json({ error: "Document not yet generated" });
      }

      const doc = docs[0];
      const filename = `${docType.replace(/_/g, "-")}-creatorOS.md`;

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(doc.content);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to export document" });
    }
  });
}
