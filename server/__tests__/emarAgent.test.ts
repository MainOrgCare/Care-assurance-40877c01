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
