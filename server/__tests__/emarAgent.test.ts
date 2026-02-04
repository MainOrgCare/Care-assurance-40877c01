import test from "node:test";
import assert from "node:assert/strict";
import { emarAgent } from "../services/emarAgent.ts";
import type { ParsedEMAR } from "../emarGridParser";

test("emarAgent.extract (gridBaseline) dedupes, infers PRN, normalizes PRN refusals, and skips BLANK/N/A", async () => {
  const gridBaseline: ParsedEMAR = {
    serviceUserName: "Test User",
    allergies: "None",
    auditPeriodStart: "",
    auditPeriodEnd: "",
    pageCount: 1,
    pageCharCounts: [0],
    pageTexts: [""],
    dates: ["Mon, 01 Dec", "Mon, 02 Dec"],
    timeSlots: ["08:00-09:00", "09:00-10:00"],
    medications: [
      {
        name: "Paracetamol 500mg",
        row: 0,
        instructions: "Take one tablet",
        timeSlots: ["08:00 - 09:00", "09:00-10:00"],
      },
      {
        name: "Morphine",
        row: 1,
        instructions: "",
        timeSlots: ["08:00-09:00", "09:00-10:00"],
      },
    ],
    cells: [
      // Duplicate entries for the same med/date/slot: should keep the better one (has time + initials)
      {
        medication: "Paracetamol 500mg",
        medicationRow: 0,
        date: "mon, 01 dec",
        timeSlot: "08:00 - 09:00",
        content: "",
        code: "AD",
        careWorker: "",
        time: "",
      },
      {
        medication: "Paracetamol 500mg",
        medicationRow: 0,
        date: "Mon, 01 Dec",
        timeSlot: "08:00-09:00",
        content: "08:15 AB",
        code: "AD",
        careWorker: "AB",
        time: "08:15",
      },

      // BLANK/N/A should be skipped (no time/initials evidence)
      {
        medication: "Paracetamol 500mg",
        medicationRow: 0,
        date: "Mon, 01 Dec",
        timeSlot: "09:00-10:00",
        content: "N/A",
        code: "N/A",
        careWorker: "",
        time: "",
      },
      {
        medication: "Paracetamol 500mg",
        medicationRow: 0,
        date: "Mon, 02 Dec",
        timeSlot: "09:00-10:00",
        content: "",
        code: "BLANK",
        careWorker: "",
        time: "",
      },

      // PRN evidence from grid: two PRN administrations + one refusal
      {
        medication: "Morphine",
        medicationRow: 1,
        date: "Mon, 01 Dec",
        timeSlot: "08:00-09:00",
        content: "PRN 08:45 CD",
        code: "PRN",
        careWorker: "CD",
        time: "08:45",
      },
      {
        medication: "Morphine",
        medicationRow: 1,
        date: "Mon, 02 Dec",
        timeSlot: "08:00-09:00",
        content: "PRN 08:40 EF",
        code: "PRN",
        careWorker: "EF",
        time: "08:40",
      },
      {
        medication: "Morphine",
        medicationRow: 1,
        date: "Mon, 02 Dec",
        timeSlot: "09:00-10:00",
        content: "R",
        code: "R",
        careWorker: "",
        time: "",
      },
    ],
    rawText: "",
    debugInfo: {
      totalTextItems: 0,
      dateColumnsFound: 0,
      medicationsFound: 2,
      timeSlotsFound: 2,
      cellsGenerated: 7,
    },
  };

  const result = await emarAgent.extract("", null, "", { userId: null, username: null }, { gridBaseline });

  // (a) deduplicates entries per med/date/timeSlot choosing the best one (has time/initials)
  const paracetamolEntries = result.entries.filter((e) => e.medicationId === 1);
  assert.equal(paracetamolEntries.length, 1);
  assert.equal(paracetamolEntries[0].date, "Mon, 01 Dec");
  assert.equal(paracetamolEntries[0].timeSlot, "08:00-09:00");
  assert.equal(paracetamolEntries[0].careWorkerInitials, "AB");
  assert.equal(paracetamolEntries[0].time, "08:15");
  assert.equal(paracetamolEntries[0].hasTime, true);

  // (b) PRN medication inferred from PRN codes in grid cells
  const morphineMeta = result.metadata.medications.find((m: any) => m.medicationId === 2);
  assert.ok(morphineMeta, "Morphine medication metadata present");
  assert.equal(Boolean(morphineMeta.isPRN), true);

  // (c) PRN refusal normalizes R -> PRN-R
  const prnRefusal = result.entries.find(
    (e) => e.medicationId === 2 && e.date === "Mon, 02 Dec" && e.timeSlot === "09:00-10:00"
  );
  assert.ok(prnRefusal, "PRN refusal entry present");
  assert.equal(prnRefusal.code, "PRN-R");

  // (d) BLANK/N/A cells are skipped
  const naOrBlankEntries = result.entries.filter(
    (e) => e.medicationId === 1 && e.timeSlot === "09:00-10:00" && (e.date === "Mon, 01 Dec" || e.date === "Mon, 02 Dec")
  );
  assert.equal(naOrBlankEntries.length, 0);
});

test("emarAgent.extract (gridBaseline) filters out false positive medication names", async () => {
  const gridBaseline: ParsedEMAR = {
    serviceUserName: "Test User",
    allergies: "None",
    auditPeriodStart: "",
    auditPeriodEnd: "",
    pageCount: 1,
    pageCharCounts: [0],
    pageTexts: [""],
    dates: ["Mon, 01 Dec"],
    timeSlots: ["08:00-09:00"],
    medications: [
      // Valid medication - should be included
      {
        name: "Paracetamol 500mg",
        row: 0,
        instructions: "Take one tablet",
        timeSlots: ["08:00-09:00"],
      },
      // False positives - should be filtered out
      {
        name: "10mg -",
        row: 1,
        instructions: "Route Oral",
        timeSlots: ["08:00-09:00"],
      },
      {
        name: "500mcg /",
        row: 2,
        instructions: "",
        timeSlots: ["08:00-09:00"],
      },
      {
        name: "20mg-",
        row: 3,
        instructions: "Take daily",
        timeSlots: ["08:00-09:00"],
      },
      {
        name: "100ml/",
        row: 4,
        instructions: "",
        timeSlots: ["08:00-09:00"],
      },
      // Another valid medication
      {
        name: "Vitamin D3 800IU",
        row: 5,
        instructions: "Once daily",
        timeSlots: ["08:00-09:00"],
      },
    ],
    cells: [
      {
        medication: "Paracetamol 500mg",
        medicationRow: 0,
        date: "Mon, 01 Dec",
        timeSlot: "08:00-09:00",
        content: "08:15 AB",
        code: "AD",
        careWorker: "AB",
        time: "08:15",
      },
    ],
  };

  const result = await emarAgent.extract(
    "",
    {},
    "",
    { userId: "user-1", sessionId: "session-1", correlationId: "corr-1" },
    { gridBaseline }
  );

  // Debug: Check if result and medications exist
  assert.ok(result, "Result should be defined");
  assert.ok(result.metadata, "Result.metadata should be defined");
  assert.ok(result.metadata.medications, "Result.metadata.medications should be defined");
  
  // Should only have 2 valid medications (Paracetamol and Vitamin D3)
  assert.equal(result.metadata.medications.length, 2, `Should filter out false positive medications. Actual: ${JSON.stringify(result.metadata.medications?.map((m: any) => m.name))}`);
  
  // Verify the valid medications are present
  const medNames = result.metadata.medications.map((m: any) => m.name);
  assert.ok(medNames.includes("Paracetamol 500mg"), "Paracetamol should be included");
  assert.ok(medNames.includes("Vitamin D3 800IU"), "Vitamin D3 should be included");
  
  // Verify false positives are excluded
  assert.ok(!medNames.some((name: string) => /^\d+\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/]?$/i.test(name)), 
    "Should not include dose-only patterns like '10mg -'");
  assert.ok(!medNames.some((name: string) => /[-\/\\:;,]$/.test(name)), 
    "Should not include names ending with trailing punctuation");
});
