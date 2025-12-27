import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PdfToImagesResult {
  images: string[]; // Base64 encoded PNG images
  pageCount: number;
  tempDir?: string;
  error?: string;
}

export async function convertPdfToImages(pdfBuffer: Buffer): Promise<PdfToImagesResult> {
  const tempDir = path.join(os.tmpdir(), `pdf-${crypto.randomBytes(8).toString('hex')}`);
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    
    const pdfPath = path.join(tempDir, 'input.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    
    const outputPrefix = path.join(tempDir, 'page');
    
    // Use pdftoppm from poppler to convert PDF to PNG images
    // -png = output PNG format
    // -r 150 = 150 DPI resolution (good balance of quality and size)
    await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`);
    
    // Find all generated images
    const files = fs.readdirSync(tempDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/page-(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/page-(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    const images: string[] = [];
    
    for (const file of files) {
      const imagePath = path.join(tempDir, file);
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString('base64');
      images.push(base64);
    }
    
    console.log(`PDF-to-image conversion: Successfully converted ${images.length} pages`);
    
    // Cleanup temp files
    cleanup(tempDir);
    
    return {
      images,
      pageCount: images.length,
    };
    
  } catch (e: any) {
    console.error('PDF-to-image conversion failed:', e);
    cleanup(tempDir);
    
    return {
      images: [],
      pageCount: 0,
      error: `PDF conversion error: ${e.message}`
    };
  }
}

// Convert PDF buffer to base64 for direct Vision API usage
export function pdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64');
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
