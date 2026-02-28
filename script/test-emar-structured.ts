import fs from 'fs';
import path from 'path';
import { analyzeDocumentForEMAR } from '../server/services/documentIntelligence';
import { extractTextFromPdf } from '../server/utils/pdfProcessor';

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Please provide a valid EMAR PDF file path");
    process.exit(1);
  }

  console.log(`Extracting text from: ${filePath}`);
  const pdfBuffer = fs.readFileSync(filePath);
  const rawText = await extractTextFromPdf(pdfBuffer);
  
  console.log(`Document text extracted (${rawText.length} characters). Proceeding to EMAR processing...`);
  
  // Note: we're calling analyzeDocumentForEMAR to simulate the full API flow
  // since emarAgent.extract usually runs after documentIntelligence checks.
  const result = await analyzeDocumentForEMAR(
    pdfBuffer,
    "application/pdf",
    "John Doe", // Mock name
    { userId: 1, username: "admin" }, // Mock AI context
    { allowSensitiveView: true }
  );

  console.log("\n\n===== EMAR STRUCTURED EXTRACTION RESULT =====");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
