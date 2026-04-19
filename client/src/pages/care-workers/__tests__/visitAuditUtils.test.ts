import { describe, expect, it } from "vitest";

import {
  findVisitColumnIndex,
  normalizeVisitHeaderKey,
  sanitizeVisitCellValue,
  toVisitInitialLast,
  toVisitInitials,
} from "../visitAuditUtils";

describe("visitAuditUtils", () => {
  it("normalizes visit header labels for workbook matching", () => {
    expect(normalizeVisitHeaderKey("  Planned_Start--Time  ")).toBe("planned start time");
  });

  it("finds the first matching visit column by keyword", () => {
    const headers = ["service user name", "actual employee name", "notes"];
    expect(findVisitColumnIndex(headers, ["actual employee", "actual worker"])) .toBe(1);
  });

  it("sanitizes dates, booleans, and times for compact visit rows", () => {
    expect(sanitizeVisitCellValue(new Date(2026, 0, 2, 8, 5))).toBe("02/01@08:05");
    expect(sanitizeVisitCellValue("Yes")).toBe("Y");
    expect(sanitizeVisitCellValue("1/2/2026 08:30")).toBe("01/02@08:30");
  });

  it("derives service-user initials from last-name-first values", () => {
    expect(toVisitInitials("Smith, Jane")).toBe("J.S.");
  });

  it("derives care-worker initial plus surname labels", () => {
    expect(toVisitInitialLast("Jane Smith")).toBe("J.Smith");
  });
});