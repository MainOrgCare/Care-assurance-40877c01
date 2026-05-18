/**
 * Policy Document Routes
 *
 * CRUD endpoints for organisational policy documents.  Supports direct
 * creation, PDF/DOC/DOCX file upload with automatic text extraction, and
 * category-based filtering.
 *
 * @module server/routes/policyDocuments
 */
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import mammoth from "mammoth";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import { tryConvertOfficeToPdf } from "../utils/officeToPdf";
import { insertPolicyDocumentSchema } from "@shared/schema";

const getRouteParamValue = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? (param[0] ?? "") : (param ?? "");

export interface PolicyDocumentRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  upload: { single(fieldName: string): RequestHandler };
  scanAndLogFile: (
    file: Express.Multer.File,
    uploadType: string,
    scannedBy?: string,
  ) => Promise<{ allowed: boolean; error?: string }>;
  extractPdfTextWithPdfjs: (
    buffer: Buffer,
  ) => Promise<{ text: string; pageCount: number; pageCharCounts: number[]; pageTexts: string[] }>;
}

export function registerPolicyDocumentRoutes(
  app: Express,
  { requireAuth, requireAdmin, upload, scanAndLogFile, extractPdfTextWithPdfjs }: PolicyDocumentRouteDeps,
): void {
  app.get("/api/policy-documents", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getAllPolicyDocuments();
      return res.json(docs);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load policy documents") });
    }
  });

  app.get("/api/policy-documents/category/:category", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getPolicyDocumentsByCategory(getRouteParamValue(req.params.category));
      return res.json(docs);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load policy documents") });
    }
  });

  app.post("/api/policy-documents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPolicyDocumentSchema.parse(req.body);
      const doc = await storage.createPolicyDocument(validatedData);
      return res.status(201).json(doc);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to create policy document") });
    }
  });

  app.put("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const doc = await storage.updatePolicyDocument(getRouteParamValue(req.params.id), req.body);
      if (!doc) {
        return res.status(404).json({ message: "Policy document not found" });
      }
      return res.json(doc);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update policy document") });
    }
  });

  app.delete("/api/policy-documents/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deletePolicyDocument(getRouteParamValue(req.params.id));
      return res.json({ success: true });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to delete policy document") });
    }
  });

  // Upload policy document from PDF/Word file
  app.post("/api/policy-documents/upload", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Virus scan the uploaded file
      const user = await storage.getUser(req.session.userId!);
      const scanCheck = await scanAndLogFile(req.file, "policy-document", user?.username);
      if (!scanCheck.allowed) {
        return res.status(400).json({ message: scanCheck.error });
      }

      const { name, category, version } = req.body;
      if (!name || !category) {
        return res.status(400).json({ message: "Name and category are required" });
      }

      const lowerName = req.file.originalname.toLowerCase();
      const mime = (req.file.mimetype || "").toLowerCase();
      const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");
      const isDocx =
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lowerName.endsWith(".docx");
      const isDoc = (mime === "application/msword" || lowerName.endsWith(".doc")) && !isDocx;
      let content = "";

      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        content = result.value;
        if (!content.trim()) {
          const pdfBuffer = await tryConvertOfficeToPdf(req.file.buffer, req.file.originalname);
          if (pdfBuffer) {
            const extracted = await extractPdfTextWithPdfjs(pdfBuffer);
            content = extracted.text;
          }
        }
      } else if (isDoc) {
        const pdfBuffer = await tryConvertOfficeToPdf(req.file.buffer, req.file.originalname);
        if (!pdfBuffer) {
          return res.status(422).json({
            message: "Could not convert .doc file for text extraction. Please save/export the document as PDF or DOCX and try again.",
          });
        }
        const extracted = await extractPdfTextWithPdfjs(pdfBuffer);
        content = extracted.text;
      } else if (isPdf) {
        const extracted = await extractPdfTextWithPdfjs(req.file.buffer);
        content = extracted.text;
      } else {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Could not extract text from document" });
      }

      const doc = await storage.createPolicyDocument({
        name,
        category,
        content,
        version: version || "1.0",
        lastUpdated: new Date(),
      });

      return res.status(201).json(doc);
    } catch (error: unknown) {
      console.error("Policy document upload error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to upload policy document") });
    }
  });
}
