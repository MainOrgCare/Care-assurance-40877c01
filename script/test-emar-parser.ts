/**
 * EMAR Parser Test Script
 * Tests the grid parser against real EMAR PDFs and reports accuracy metrics
 */

import fs from "node:fs";
import path from "node:path";
import { parseEMARGrid, extractCodesFromCell, type ParsedEMAR, type GridCell } from "../server/emarGridParser";

interface TestResult {
  file: string;
  success: boolean;
  pageCount: number;
  datesFound: number;
  timeSlotsFound: number;
  medicationsFound: number;
  cellsGenerated: number;
  nonEmptyCells: number;
  confidenceScore: number;
  warnings: string[];
  sampleCells: GridCell[];
  medications: Array<{ name: string; instructions: string; timeSlots: string[] }>;
  dates: string[];
  timeSlots: string[];
  issues: string[];
  codeDistribution: Record<string, number>;
  keyMismatches: number;
}

const CODE_PRIORITY: Record<string, number> = {
  "PRN-R": 100,
  "R": 100,
  "MISSED": 95,
  "MU": 90,
  "NH": 90,
  "SA": 88,
  "FA": 88,
  "PRN-AD": 82,
  "PRN-AS": 82,
  "PRN": 80,
  "AD": 65,
  "AS": 65,
  "P": 60,
  "N/A": 10,
  "BLANK": 0,
};

async function runTest(pdfPath: string): Promise<TestResult> {
  const absolutePath = path.resolve(process.cwd(), pdfPath);
  const buffer = fs.readFileSync(absolutePath);
  
  const startTime = Date.now();
  let result: ParsedEMAR;
  
  try {
    result = await parseEMARGrid(buffer);
  } catch (error) {
    return {
      file: pdfPath,
      success: false,
      pageCount: 0,
      datesFound: 0,
      timeSlotsFound: 0,
      medicationsFound: 0,
      cellsGenerated: 0,
      nonEmptyCells: 0,
      confidenceScore: 0,
      warnings: [(error as Error).message],
      sampleCells: [],
      medications: [],
      dates: [],
      timeSlots: [],
      issues: [`Parse error: ${(error as Error).message}`],
      codeDistribution: {},
      keyMismatches: 0,
    };
  }
  
  const elapsed = Date.now() - startTime;
  
  const nonEmptyCells = result.cells.filter((cell) => {
    const content = String(cell.content || "").trim();
    return content.length > 0 || (cell.code && cell.code !== "BLANK");
  });
  
  // Analyze code distribution
  const codeDistribution: Record<string, number> = {};
  let keyMismatches = 0;
  for (const cell of result.cells) {
    const code = cell.code || "BLANK";
    codeDistribution[code] = (codeDistribution[code] || 0) + 1;
    if (cell.keyMismatch) keyMismatches++;
  }
  
  // Identify potential issues
  const issues: string[] = [];
  
  if (result.dates.length === 0) {
    issues.push("No dates detected");
  }
  if (result.timeSlots.length === 0) {
    issues.push("No time slots detected");
  }
  if (result.medications.length === 0) {
    issues.push("No medications detected");
  }
  if (result.cells.length === 0) {
    issues.push("No cells generated");
  }
  
  // Check for duplicated dates
  const dateSet = new Set<string>();
  const duplicatedDates: string[] = [];
  for (const d of result.dates) {
    if (dateSet.has(d)) duplicatedDates.push(d);
    dateSet.add(d);
  }
  if (duplicatedDates.length > 0) {
    issues.push(`Duplicated dates: ${duplicatedDates.join(", ")}`);
  }
  
  // Check for expected date count vs actual
  const expectedDays = 7; // Most EMAR charts are 7 days
  if (result.dates.length > 0 && result.dates.length !== expectedDays) {
    issues.push(`Expected ~${expectedDays} days, found ${result.dates.length}`);
  }
  
  // Check code extraction quality
  const blankRatio = (codeDistribution["BLANK"] || 0) / (result.cells.length || 1);
  if (blankRatio > 0.9 && result.cells.length > 10) {
    issues.push(`Very high BLANK ratio (${(blankRatio * 100).toFixed(1)}%) - possible code extraction issue`);
  }
  
  if (keyMismatches > 0) {
    issues.push(`${keyMismatches} cells with key mismatches (code not in KEY legend)`);
  }
  
  // Check medication quality
  for (const med of result.medications) {
    if (!med.name || med.name.length < 3) {
      issues.push(`Low-quality medication name: "${med.name}"`);
    }
    if (med.timeSlots.length === 0) {
      issues.push(`Medication "${med.name}" has no time slots`);
    }
  }
  
  // Sample cells with codes for inspection
  const sampleCells = result.cells
    .filter((cell) => cell.code && cell.code !== "BLANK")
    .slice(0, 20);
  
  return {
    file: pdfPath,
    success: true,
    pageCount: result.pageCount,
    datesFound: result.dates.length,
    timeSlotsFound: result.timeSlots.length,
    medicationsFound: result.medications.length,
    cellsGenerated: result.cells.length,
    nonEmptyCells: nonEmptyCells.length,
    confidenceScore: result.debugInfo.confidenceScore || 0,
    warnings: result.debugInfo.validationWarnings || [],
    sampleCells,
    medications: result.medications,
    dates: result.dates,
    timeSlots: result.timeSlots,
    issues,
    codeDistribution,
    keyMismatches,
  };
}

function printResult(result: TestResult): void {
  console.log("\n" + "=".repeat(80));
  console.log(`FILE: ${result.file}`);
  console.log("=".repeat(80));
  
  if (!result.success) {
    console.log("❌ PARSE FAILED");
    console.log("Errors:", result.warnings.join(", "));
    return;
  }
  
  console.log(`✓ Parsed successfully`);
  console.log(`  Pages: ${result.pageCount}`);
  console.log(`  Confidence Score: ${(result.confidenceScore * 100).toFixed(1)}%`);
  console.log();
  
  console.log("STRUCTURE:");
  console.log(`  Dates: ${result.datesFound} -> ${result.dates.join(", ")}`);
  console.log(`  Time Slots: ${result.timeSlotsFound} -> ${result.timeSlots.join(", ")}`);
  console.log(`  Medications: ${result.medicationsFound}`);
  console.log(`  Cells: ${result.cellsGenerated} total, ${result.nonEmptyCells} non-empty`);
  console.log();
  
  console.log("MEDICATIONS:");
  for (const med of result.medications) {
    console.log(`  - ${med.name}`);
    console.log(`    Instructions: ${med.instructions.substring(0, 100)}${med.instructions.length > 100 ? "..." : ""}`);
    console.log(`    Time Slots: ${med.timeSlots.join(", ")}`);
  }
  console.log();
  
  console.log("CODE DISTRIBUTION:");
  const sortedCodes = Object.entries(result.codeDistribution)
    .sort((a, b) => b[1] - a[1]);
  for (const [code, count] of sortedCodes) {
    const pct = ((count / result.cellsGenerated) * 100).toFixed(1);
    console.log(`  ${code}: ${count} (${pct}%)`);
  }
  console.log();
  
  if (result.keyMismatches > 0) {
    console.log(`KEY MISMATCHES: ${result.keyMismatches}`);
  }
  
  if (result.sampleCells.length > 0) {
    console.log("SAMPLE CELLS (with codes):");
    for (const cell of result.sampleCells.slice(0, 10)) {
      console.log(`  [${cell.medication}] ${cell.date} ${cell.timeSlot} -> ${cell.code}${cell.careWorker ? ` (${cell.careWorker})` : ""}${cell.time ? ` @ ${cell.time}` : ""}`);
      if (cell.content) {
        console.log(`    Content: "${cell.content.substring(0, 60)}${cell.content.length > 60 ? "..." : ""}"`);
      }
    }
    console.log();
  }
  
  if (result.warnings.length > 0) {
    console.log("WARNINGS:");
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`);
    }
    console.log();
  }
  
  if (result.issues.length > 0) {
    console.log("ISSUES DETECTED:");
    for (const issue of result.issues) {
      console.log(`  ❗ ${issue}`);
    }
    console.log();
  }
}

function testCodeExtraction(): void {
  console.log("\n" + "=".repeat(80));
  console.log("CODE EXTRACTION UNIT TESTS");
  console.log("=".repeat(80));
  
  const testCases = [
    { input: "AD RK 08:30", expected: { code: "AD", careWorker: "RK", time: "08:30" } },
    { input: "AS", expected: { code: "AS", careWorker: "", time: "" } },
    { input: "PRN-R 10:00 JD", expected: { code: "PRN-R", careWorker: "JD", time: "10:00" } },
    { input: "R", expected: { code: "R", careWorker: "", time: "" } },
    { input: "NH 14:30", expected: { code: "NH", careWorker: "", time: "14:30" } },
    { input: "MU", expected: { code: "MU", careWorker: "", time: "" } },
    { input: "SA AB 09:15", expected: { code: "SA", careWorker: "AB", time: "09:15" } },
    { input: "FA", expected: { code: "FA", careWorker: "", time: "" } },
    { input: "PRN-AD CD 11:45", expected: { code: "PRN-AD", careWorker: "CD", time: "11:45" } },
    { input: "PRN-AS EF", expected: { code: "PRN-AS", careWorker: "EF", time: "" } },
    { input: "", expected: { code: "BLANK", careWorker: "", time: "" } },
    { input: "xxx", expected: { code: "BLANK", careWorker: "", time: "" } },
    { input: "X X X", expected: { code: "BLANK", careWorker: "", time: "" } },
    { input: "REFUSED", expected: { code: "R", careWorker: "", time: "" } },
    { input: "S/A", expected: { code: "SA", careWorker: "", time: "" } },
    { input: "F/A GH", expected: { code: "FA", careWorker: "GH", time: "" } },
    { input: "A/D 08:00 IJ", expected: { code: "AD", careWorker: "IJ", time: "08:00" } },
    { input: "N/A", expected: { code: "N/A", careWorker: "", time: "" } },
    { input: "63225 HB 09:27 AD", expected: { code: "AD", careWorker: "HB", time: "09:27" } },
    { input: "AD 8am", expected: { code: "AD", careWorker: "", time: "08:00" } },
    { input: "AD 0830", expected: { code: "AD", careWorker: "", time: "08:30" } },
    { input: "08:00-09:00 09:15 AD", expected: { code: "AD", careWorker: "", time: "09:15" } },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    const result = extractCodesFromCell(tc.input);
    const codeMatch = result.code === tc.expected.code;
    const cwMatch = result.careWorker === tc.expected.careWorker;
    const timeMatch = result.time === tc.expected.time;
    
    if (codeMatch && cwMatch && timeMatch) {
      passed++;
      console.log(`✓ "${tc.input}" -> code=${result.code}, cw=${result.careWorker}, time=${result.time}`);
    } else {
      failed++;
      console.log(`✗ "${tc.input}"`);
      console.log(`  Expected: code=${tc.expected.code}, cw=${tc.expected.careWorker}, time=${tc.expected.time}`);
      console.log(`  Got:      code=${result.code}, cw=${result.careWorker}, time=${result.time}`);
    }
  }
  
  console.log();
  console.log(`Code Extraction: ${passed}/${testCases.length} tests passed`);
}

async function main() {
  const pdfFiles = [
    "attached_assets/EMAR-1-3689_1765344478636.pdf",
    "attached_assets/EMAR-2-4150.pdf",
  ];
  
  console.log("EMAR PARSER ACCURACY TEST");
  console.log("Testing against", pdfFiles.length, "PDF files");
  
  // Run code extraction tests first
  testCodeExtraction();
  
  // Run parser tests
  const results: TestResult[] = [];
  for (const pdfFile of pdfFiles) {
    if (!fs.existsSync(pdfFile)) {
      console.log(`  ⚠ File not found: ${pdfFile}`);
      continue;
    }
    const result = await runTest(pdfFile);
    results.push(result);
    printResult(result);
  }
  
  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const avgConfidence = results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length;
  
  console.log(`Files tested: ${results.length}`);
  console.log(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`Total issues: ${totalIssues}`);
  
  if (totalIssues > 0) {
    console.log("\nAll issues:");
    for (const r of results) {
      if (r.issues.length > 0) {
        console.log(`  ${r.file}:`);
        for (const issue of r.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }
  }
}

main().catch(console.error);
