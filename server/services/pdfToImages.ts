import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

interface PdfToImagesResult {
  images: string[];
  pageCount: number;
  tempDir?: string;
  error?: string;
}

export async function convertPdfToImages(pdfBuffer: Buffer): Promise<PdfToImagesResult> {
  // pdf-poppler is not supported on this Linux environment
  // Return empty result to trigger text-based fallback
  console.log('PDF-to-image conversion: Using text-based fallback (pdf-poppler not available)');
  
  return {
    images: [],
    pageCount: 0,
    error: 'PDF image conversion not available - using text extraction'
  };
}

function cleanup(tempDir: string): void {
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  } catch (e) {
    console.error('Failed to cleanup temp directory:', e);
  }
}
