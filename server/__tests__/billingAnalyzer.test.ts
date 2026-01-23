import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBillingRows, type BillingRowInput } from "../services/billingAnalyzer.ts";

const analysisEndDate = new Date("2025-01-22T00:00:00Z");

const kv1Rows: BillingRowInput[] = [
  {
    startDate: "20/01/2025",
    endDate: null,
    startTime: "05:15",
    endTime: "05:45",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 1,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "20/01/2025",
    endDate: null,
    startTime: "09:15",
    endTime: "10:00",
    duration: "00:45m",
    mon: 3,
    tue: 3,
    wed: 3,
    thu: 3,
    fri: 3,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "20/01/2025",
    endDate: null,
    startTime: "13:30",
    endTime: "14:00",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Lunch",
  },
  {
    startDate: "22/10/2024",
    endDate: null,
    startTime: "10:30",
    endTime: "11:30",
    duration: "01:00h",
    mon: 1,
    tue: 1,
    wed: 1,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Lunch",
  },
  {
    startDate: "22/10/2024",
    endDate: null,
    startTime: "10:30",
    endTime: "12:00",
    duration: "01:30h",
    mon: 2,
    tue: 2,
    wed: 1,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Lunch",
  },
  {
    startDate: "22/10/2024",
    endDate: "19/01/2025",
    startTime: "13:00",
    endTime: "13:30",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Lunch",
  },
  {
    startDate: "21/10/2024",
    endDate: "19/01/2025",
    startTime: "09:00",
    endTime: "09:30",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 1,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "21/10/2024",
    endDate: "19/01/2025",
    startTime: "09:00",
    endTime: "09:45",
    duration: "00:45m",
    mon: 3,
    tue: 3,
    wed: 3,
    thu: 3,
    fri: 3,
    sat: 0,
    sun: 0,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "27/08/2024",
    endDate: "10/09/2024",
    startTime: "11:30",
    endTime: "11:45",
    duration: "00:15m",
    mon: 3,
    tue: 3,
    wed: 3,
    thu: 3,
    fri: 3,
    sat: 3,
    sun: 3,
    occursEveryWeeks: 1,
    serviceType: "Personal Care - Extra Time",
  },
];

const kv2Rows: BillingRowInput[] = [
  {
    startDate: "27/08/2024",
    endDate: "10/09/2024",
    startTime: "16:00",
    endTime: "16:15",
    duration: "00:15m",
    mon: 3,
    tue: 3,
    wed: 3,
    thu: 3,
    fri: 3,
    sat: 3,
    sun: 3,
    occursEveryWeeks: 1,
    serviceType: "Personal Care - Extra Time",
  },
  {
    startDate: "06/08/2024",
    endDate: null,
    startTime: "01:00",
    endTime: "01:15",
    duration: "00:15m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Toilet Visit",
  },
  {
    startDate: "05/08/2024",
    endDate: "21/10/2024",
    startTime: "09:00",
    endTime: "09:45",
    duration: "00:45m",
    mon: 3,
    tue: 3,
    wed: 3,
    thu: 3,
    fri: 3,
    sat: 3,
    sun: 3,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "05/08/2024",
    endDate: null,
    startTime: "21:45",
    endTime: "22:00",
    duration: "00:15m",
    mon: 1,
    tue: 1,
    wed: 1,
    thu: 1,
    fri: 1,
    sat: 1,
    sun: 1,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Toilet Visit",
  },
  {
    startDate: "24/06/2024",
    endDate: "05/08/2024",
    startTime: "09:00",
    endTime: "09:45",
    duration: "00:45m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "28/05/2024",
    endDate: "23/06/2024",
    startTime: "09:30",
    endTime: "10:15",
    duration: "00:45m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - AM",
  },
  {
    startDate: "28/05/2024",
    endDate: "21/10/2024",
    startTime: "13:30",
    endTime: "14:00",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Lunch",
  },
  {
    startDate: "28/05/2024",
    endDate: null,
    startTime: "15:30",
    endTime: "16:00",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - Tea",
  },
  {
    startDate: "28/05/2024",
    endDate: null,
    startTime: "21:30",
    endTime: "22:00",
    duration: "00:30m",
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 2,
    sun: 2,
    occursEveryWeeks: 1,
    serviceType: "Extra Care - PM",
  },
];

const allRows = [...kv1Rows, ...kv2Rows];

const runAnalysis = () =>
  analyzeBillingRows(allRows, {
    analysisEndDate,
    imageCount: 2,
    extractionWarnings: [],
  });

test("billing analyzer summarizes KV1 + KV2 fixtures", () => {
  const analysis = runAnalysis();

  assert.equal(analysis.summary.rowCount, allRows.length);
  assert.equal(analysis.summary.analysisEndDate, "22/01/2025");
  assert.ok(
    analysis.summary.warnings?.some((w) => w.includes("Open-ended rows")),
    "open-ended warning present"
  );
  assert.ok(analysis.segments.length > 0, "segments produced");
});

test("rows without end dates are capped to analysis date", () => {
  const analysis = runAnalysis();
  const openEndedRows = analysis.segments.flatMap((segment) =>
    segment.rows.filter((row) => row.warnings?.some((w) => w.includes("End date set")))
  );
  assert.ok(openEndedRows.length > 0, "open-ended rows were capped and flagged");
  openEndedRows.forEach((row) => {
    assert.equal(row.endDate, "22/01/2025");
  });
});

test("weekly totals add up for the first segment", () => {
  const analysis = runAnalysis();
  const firstSegment = analysis.segments[0];
  assert.ok(firstSegment, "first segment present");
  const sumOfRows = firstSegment.rows.reduce((sum, row) => sum + (row.weeklyHours || 0), 0);
  assert.equal(Number(firstSegment.weeklyHoursTotal.toFixed(2)), Number(sumOfRows.toFixed(2)));
});

test("overlapping time slots from older rows are superseded by newer rows", () => {
  // Scenario: Old row 24/06/2024 to 05/08/2024 with 09:00-09:45 (2 carers)
  // New row 05/08/2024 to 21/10/2024 with 09:00-09:45 (3 carers)
  // On the overlap day (05/08/2024), the NEW row should take precedence
  const overlapRows: BillingRowInput[] = [
    {
      startDate: "24/06/2024",
      endDate: "05/08/2024",
      startTime: "09:00",
      endTime: "09:45",
      duration: "00:45m",
      mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 2, sun: 2,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
    {
      startDate: "05/08/2024",
      endDate: "21/10/2024",
      startTime: "09:00",
      endTime: "09:45",
      duration: "00:45m",
      mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 3, sun: 3,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
  ];

  const analysis = analyzeBillingRows(overlapRows, {
    analysisEndDate: new Date("2024-10-21"),
    imageCount: 1,
  });

  // Find the segment that covers 05/08/2024 (the overlap day)
  const overlapSegment = analysis.segments.find(seg => seg.startDate === "05/08/2024");
  assert.ok(overlapSegment, "segment for overlap day should exist");
  
  // On the overlap day, only the NEW row (with 3 carers) should be active
  // The old row should be superseded
  assert.equal(overlapSegment.rows.length, 1, "only one row should be active on overlap day");
  assert.equal(overlapSegment.rows[0].dayCounts.mon, 3, "should use newer row's carer count");
});

test("different time slots are not superseded", () => {
  // Scenario: Two different time slots should both remain active
  const differentTimeRows: BillingRowInput[] = [
    {
      startDate: "01/08/2024",
      endDate: "31/08/2024",
      startTime: "09:00",
      endTime: "09:45",
      duration: "00:45m",
      mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 2, sun: 2,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
    {
      startDate: "01/08/2024",
      endDate: "31/08/2024",
      startTime: "13:00",
      endTime: "13:30",
      duration: "00:30m",
      mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 2, sun: 2,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - Lunch",
    },
  ];

  const analysis = analyzeBillingRows(differentTimeRows, {
    analysisEndDate: new Date("2024-08-31"),
    imageCount: 1,
  });

  // Both rows should be present since they have different time slots
  const segment = analysis.segments[0];
  assert.ok(segment, "segment should exist");
  assert.equal(segment.rows.length, 2, "both time slots should be active");
});

test("rows with partial day coverage are flagged with gap warnings", () => {
  // Row with coverage only on Tue and Thu (gaps on Mon, Wed, Fri, Sat, Sun)
  const partialCoverageRows: BillingRowInput[] = [
    {
      startDate: "20/01/2025",
      endDate: null,
      startTime: "05:15",
      endTime: "05:45",
      duration: "00:30m",
      mon: 0, // gap
      tue: 2,
      wed: 0, // gap
      thu: 2,
      fri: 0, // gap
      sat: 0, // gap
      sun: 0, // gap
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
    {
      startDate: "20/01/2025",
      endDate: null,
      startTime: "09:15",
      endTime: "10:00",
      duration: "00:45m",
      mon: 3,
      tue: 0, // gap
      wed: 3,
      thu: 0, // gap
      fri: 3,
      sat: 3,
      sun: 3,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
  ];

  const analysis = analyzeBillingRows(partialCoverageRows, {
    analysisEndDate: new Date("2025-01-22"),
    imageCount: 1,
  });

  // Summary should indicate partial coverage rows
  assert.ok(
    analysis.summary.warnings?.some((w) => w.includes("partial day coverage")),
    "should have partial coverage warning in summary"
  );
  
  // Each row should have gap warnings
  const allRows = analysis.segments.flatMap((seg) => seg.rows);
  
  const firstRow = allRows.find((r) => r.startTime === "05:15");
  assert.ok(firstRow, "first row should exist");
  assert.ok(
    firstRow.warnings?.some((w) => w.includes("No coverage")),
    "first row should have gap warning"
  );
  assert.ok(
    firstRow.warnings?.some((w) => w.includes("Monday")),
    "first row gap should mention Monday"
  );
  
  const secondRow = allRows.find((r) => r.startTime === "09:15");
  assert.ok(secondRow, "second row should exist");
  assert.ok(
    secondRow.warnings?.some((w) => w.includes("No coverage")),
    "second row should have gap warning"
  );
  assert.ok(
    secondRow.warnings?.some((w) => w.includes("Tuesday")),
    "second row gap should mention Tuesday"
  );
});

test("rows with full day coverage have no gap warnings", () => {
  const fullCoverageRows: BillingRowInput[] = [
    {
      startDate: "20/01/2025",
      endDate: "31/01/2025",
      startTime: "09:00",
      endTime: "09:45",
      duration: "00:45m",
      mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 2, sun: 2,
      occursEveryWeeks: 1,
      serviceType: "Extra Care - AM",
    },
  ];

  const analysis = analyzeBillingRows(fullCoverageRows, {
    analysisEndDate: new Date("2025-01-31"),
    imageCount: 1,
  });

  // Should not have partial coverage warning
  assert.ok(
    !analysis.summary.warnings?.some((w) => w.includes("partial day coverage")),
    "should NOT have partial coverage warning for full coverage"
  );
  
  const row = analysis.segments[0]?.rows[0];
  assert.ok(row, "row should exist");
  assert.ok(
    !row.warnings?.some((w) => w.includes("No coverage")),
    "row should NOT have gap warning for full coverage"
  );
});
