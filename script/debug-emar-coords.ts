/**
 * Debug script to show coordinate details across PDF pages
 */

import fs from "node:fs";
import path from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { pathToFileURL } from "node:url";

const getStandardFontDataUrl = () => {
  const fontsPath = path.resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  return pathToFileURL(fontsPath + path.sep).toString();
};

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

async function debugCoordinates(pdfPath: string): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), pdfPath);
  const buffer = fs.readFileSync(absolutePath);
  const uint8Array = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    disableWorker: true,
    standardFontDataUrl: getStandardFontDataUrl(),
    useSystemFonts: true,
  } as any);
  const pdf = await loadingTask.promise;
  
  const pdfjsUtil = (pdfjsLib as any).Util;
  
  console.log("=".repeat(80));
  console.log(`COORDINATE DEBUG: ${pdfPath}`);
  console.log("=".repeat(80));
  
  // Target patterns to find
  const codePattern = /\b(AD|AS|NH|SA|R|PRN)\b/i;
  const timePattern = /\d{1,2}:\d{2}/;
  const initialsPattern = /\b[A-Z]{2}\b/;
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    console.log(`\n--- PAGE ${pageNum} ---`);
    
    const items: TextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = pdfjsUtil.transform(viewport.transform, (item as any).transform);
        const x = tx[4];
        const y = tx[5];
        
        items.push({
          str: item.str.trim(),
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          width: Math.round(((item as any).width || 0) * 10) / 10,
          height: Math.round(((item as any).height || 0) * 10) / 10,
          page: pageNum,
        });
      }
    }
    
    // Find date header row
    const dateItems = items.filter(i => /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*\d{1,2}\s+Dec\b/i.test(i.str));
    if (dateItems.length > 0) {
      const dateY = dateItems[0].y;
      console.log(`Date header Y: ${dateY}`);
      console.log(`Date items: ${dateItems.map(d => `"${d.str}" @ x=${d.x}`).join(", ")}`);
    }
    
    // Find time slot labels
    const timeSlotItems = items.filter(i => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(i.str));
    console.log(`\nTime slot items:`);
    for (const ts of timeSlotItems) {
      console.log(`  "${ts.str}" @ x=${ts.x}, y=${ts.y}`);
    }
    
    // Find code entries (AD, SA, etc.) with their coordinates
    const codeItems = items.filter(i => codePattern.test(i.str));
    console.log(`\nCode items (first 30):`);
    
    // Group by Y to understand row structure
    const byY = new Map<number, TextItem[]>();
    for (const item of codeItems) {
      const roundedY = Math.round(item.y / 5) * 5; // Round to nearest 5
      if (!byY.has(roundedY)) byY.set(roundedY, []);
      byY.get(roundedY)!.push(item);
    }
    
    const sortedYs = Array.from(byY.keys()).sort((a, b) => b - a); // Descending Y (top of page first)
    for (const y of sortedYs.slice(0, 15)) {
      const rowItems = byY.get(y)!;
      const rowText = rowItems.map(i => `"${i.str}"@x${Math.round(i.x)}`).join(" | ");
      console.log(`  Y≈${y}: ${rowText}`);
    }
    
    // Find Seretide-related items
    const seretideItems = items.filter(i => /seretide/i.test(i.str));
    if (seretideItems.length > 0) {
      console.log(`\nSeretide items:`);
      for (const item of seretideItems) {
        console.log(`  "${item.str}" @ x=${item.x}, y=${item.y}`);
      }
    }
    
    // Show items between specific Y ranges (around time slots)
    const targetSlotY = timeSlotItems.length > 0 ? timeSlotItems[0].y : 0;
    if (targetSlotY > 0) {
      const nearbyItems = items.filter(i => Math.abs(i.y - targetSlotY) < 50);
      console.log(`\nItems near first time slot (Y≈${targetSlotY}, ±50):`);
      const sortedNearby = nearbyItems.sort((a, b) => a.y - b.y);
      for (const item of sortedNearby.slice(0, 30)) {
        console.log(`  "${item.str}" @ x=${item.x}, y=${item.y}`);
      }
    }
  }
}

async function main() {
  const pdfPath = process.argv[2] || "attached_assets/EMAR-2-4150.pdf";
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(1);
  }
  
  await debugCoordinates(pdfPath);
}

main().catch(console.error);
