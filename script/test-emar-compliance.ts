import fs from 'fs';
import { runComplianceAgent } from '../server/services/emarComplianceAgent';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const numPages = pdf.numPages;
  let fullText = "";
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(" ") + "\n\n";
  }
  return fullText;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Please provide a valid EMAR PDF file path");
    console.error("Usage: npx tsx script/test-emar-compliance.ts path/to/document.pdf");
    process.exit(1);
  }

  console.log(`Loading EMAR PDF from: ${filePath}`);
  const pdfBuffer = fs.readFileSync(filePath);
  const rawText = await extractPdfText(pdfBuffer);
  
  console.log(`Document text extracted (${rawText.length} characters).`);
  console.log(`Proceeding to STRICT Compliance Check with OpenAI Structured Outputs...`);
  
  const result = await runComplianceAgent(rawText, { userId: 1, username: "admin" });

  console.log("\n\n=============== EMAR STRICT COMPLIANCE AUDIT ===============");
  console.log(JSON.stringify(result, null, 2));
  console.log("===============================================================");
}

main().catch(console.error);
