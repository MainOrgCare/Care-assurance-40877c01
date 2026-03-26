/**
 * Multer Upload Configurations
 *
 * Centralised file-upload middleware configs for PDF/Word, Excel/CSV, and
 * image uploads.  Each preset uses in-memory storage with size limits and
 * strict MIME-type / extension filtering.
 *
 * @module server/utils/uploadConfig
 */
import multer from "multer";

// ── PDF / Word uploads (care plans, assessments, EMAR sheets) ────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");
    const isDoc = mime === "application/msword" || name.endsWith(".doc");
    const isOctetWithKnownExt =
      mime === "application/octet-stream" &&
      (name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx"));
    if (isPdf || isDocx || isDoc || isOctetWithKnownExt) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and Word files are allowed"));
    }
  },
});

// ── Excel / CSV uploads (workbooks, billing exports) ─────────────────────
export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isExcel =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.originalname.toLowerCase().endsWith(".xls");
    const isCSV =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (isExcel || isCSV) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) or CSV files are allowed"));
    }
  },
});

// ── Image uploads (EMAR scans, PNG only) ─────────────────────────────────
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || "";
    const name = file.originalname.toLowerCase();
    const isPng = mime === "image/png" || name.endsWith(".png");
    if (isPng) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG images are allowed"));
    }
  },
});
