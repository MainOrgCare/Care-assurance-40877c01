/**
 * Deep debug script to analyze EMAR parsing in detail
 * Shows cell-by-cell content to identify extraction issues
 */

import fs from "node:fs";
import path from "node:path";
import { parseEMARGrid, type ParsedEMAR, type GridCell } from "../server/emarGridParser";

async function debugParse(pdfPath: string): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), pdfPath);
  const buffer = fs.readFileSync(absolutePath);
  
  console.log("=".repeat(80));
  console.log(`DEEP DEBUG: ${pdfPath}`);
  console.log("=".repeat(80));
  
  const result = await parseEMARGrid(buffer);
  
  // Show raw dates and time slots
  console.log("\n--- DATES ---");
  console.log(result.dates);
  
  console.log("\n--- TIME SLOTS ---");
  console.log(result.timeSlots);
  
  // Show medications in detail
  console.log("\n--- MEDICATIONS ---");
  for (let i = 0; i < result.medications.length; i++) {
    const med = result.medications[i];
    console.log(`\n[${i}] ${med.name}`);
    console.log(`    Row: ${med.row}`);
    console.log(`    Instructions: ${med.instructions}`);
    console.log(`    Time Slots: ${med.timeSlots.join(", ")}`);
  }
  
  // Analyze time slot issues
  console.log("\n--- TIME SLOT ANALYSIS ---");
  const timeRangePattern = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;
  const problematicSlots = result.timeSlots.filter(slot => !timeRangePattern.test(slot));
  if (problematicSlots.length > 0) {
    console.log("⚠ Problematic time slots (not HH:MM-HH:MM format):");
    problematicSlots.forEach(slot => console.log(`  - "${slot}"`));
  } else {
    console.log("✓ All time slots are in proper format");
  }
  
  // Show cells grouped by medication and date
  console.log("\n--- CELL MATRIX ---");
  
  // Build a matrix for easier visualization
  const cellsByMedAndDate = new Map<string, Map<string, GridCell[]>>();
  for (const cell of result.cells) {
    const medKey = cell.medication;
    if (!cellsByMedAndDate.has(medKey)) {
      cellsByMedAndDate.set(medKey, new Map());
    }
    const dateMap = cellsByMedAndDate.get(medKey)!;
    if (!dateMap.has(cell.date)) {
      dateMap.set(cell.date, []);
    }
    dateMap.get(cell.date)!.push(cell);
  }
  
  for (const [medName, dateMap] of cellsByMedAndDate.entries()) {
    console.log(`\n[${medName}]`);
    for (const date of result.dates) {
      const cells = dateMap.get(date) || [];
      if (cells.length === 0) {
        console.log(`  ${date}: (no cells)`);
      } else {
        for (const cell of cells) {
          const status = cell.code === "BLANK" ? "□" : cell.code;
          const extra = [
            cell.careWorker ? `cw=${cell.careWorker}` : "",
            cell.time ? `@${cell.time}` : "",
          ].filter(Boolean).join(" ");
          console.log(`  ${date} ${cell.timeSlot}: ${status} ${extra} | "${cell.content}"`);
        }
      }
    }
  }
  
  // Count statistics
  console.log("\n--- STATISTICS ---");
  
  const codeStats: Record<string, number> = {};
  let missingContent = 0;
  let withContent = 0;
  let withCareWorker = 0;
  let withTime = 0;
  
  for (const cell of result.cells) {
    const code = cell.code || "BLANK";
    codeStats[code] = (codeStats[code] || 0) + 1;
    
    if (!cell.content || cell.content.trim() === "") {
      missingContent++;
    } else {
      withContent++;
    }
    
    if (cell.careWorker) withCareWorker++;
    if (cell.time) withTime++;
  }
  
  console.log(`Total cells: ${result.cells.length}`);
  console.log(`With content: ${withContent} (${((withContent / result.cells.length) * 100).toFixed(1)}%)`);
  console.log(`Empty content: ${missingContent} (${((missingContent / result.cells.length) * 100).toFixed(1)}%)`);
  console.log(`With care worker: ${withCareWorker}`);
  console.log(`With time: ${withTime}`);
  console.log("\nCode distribution:");
  Object.entries(codeStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => {
      console.log(`  ${code}: ${count} (${((count / result.cells.length) * 100).toFixed(1)}%)`);
    });
  
  // Show cells with key mismatches
  const keyMismatches = result.cells.filter(c => c.keyMismatch);
  if (keyMismatches.length > 0) {
    console.log(`\n--- KEY MISMATCHES (${keyMismatches.length}) ---`);
    for (const cell of keyMismatches.slice(0, 20)) {
      console.log(`  [${cell.medication}] ${cell.date} ${cell.timeSlot}`);
      console.log(`    Content: "${cell.content}"`);
      console.log(`    Detected: ${cell.detectedCode} (not in KEY)`);
    }
  }
  
  // Highlight potential issues
  console.log("\n--- POTENTIAL ISSUES ---");
  
  // Check for cells where content exists but code is BLANK
  const contentButBlank = result.cells.filter(c => 
    c.content && c.content.trim().length > 0 && c.code === "BLANK"
  );
  if (contentButBlank.length > 0) {
    console.log(`\n⚠ Cells with content but BLANK code (${contentButBlank.length}):`);
    for (const cell of contentButBlank.slice(0, 15)) {
      console.log(`  [${cell.medication}] ${cell.date} ${cell.timeSlot}`);
      console.log(`    Content: "${cell.content}"`);
    }
  }
  
  // Check for duplicate medication names
  const medNames = result.medications.map(m => m.name.toLowerCase().trim());
  const seenNames = new Set<string>();
  const duplicates: string[] = [];
  for (const name of medNames) {
    if (seenNames.has(name)) {
      duplicates.push(name);
    }
    seenNames.add(name);
  }
  if (duplicates.length > 0) {
    console.log(`\n⚠ Duplicate medication names: ${duplicates.join(", ")}`);
  }
  
  // Show raw text sample
  console.log("\n--- RAW TEXT SAMPLE (first 2000 chars) ---");
  console.log(result.rawText.substring(0, 2000));
}

async function main() {
  const pdfFiles = [
    "attached_assets/EMAR-1-3689_1765344478636.pdf",
    "attached_assets/EMAR-2-4150.pdf",
  ];
  
  const targetFile = process.argv[2] || pdfFiles[0];
  
  if (!fs.existsSync(targetFile)) {
    console.error(`File not found: ${targetFile}`);
    process.exit(1);
  }
  
  await debugParse(targetFile);
}

main().catch(console.error);
