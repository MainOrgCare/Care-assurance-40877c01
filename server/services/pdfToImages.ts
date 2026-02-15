interface PdfToImagesResult {
  images: string[];
  pageCount: number;
  tempDir?: string;
  error?: string;
}

/**
 * Stub for PDF-to-image conversion.
 * pdf-poppler is not available in this environment;
 * callers fall back to text-based extraction instead.
 */
export async function convertPdfToImages(pdfBuffer: Buffer): Promise<PdfToImagesResult> {
  console.log('[PDF] Image conversion unavailable — using text extraction fallback');
  
  return {
    images: [],
    pageCount: 0,
    error: 'PDF image conversion not available - using text extraction'
  };
}
