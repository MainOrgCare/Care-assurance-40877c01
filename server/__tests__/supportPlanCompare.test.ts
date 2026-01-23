import test from "node:test";
import assert from "node:assert/strict";
import { extractSupportPlanDataFromText, compareSupportPlanToServiceOrders } from "../services/supportPlanCompare.ts";

test("extractSupportPlanDataFromText parses the relevant provider section (dates + number of hours)", () => {
  const text = `
Provider: Lawson House Extra Care (dale Care)
Address: Lawson House Lawson Gardens, Newcastle Upon Tyne, NE6 2UY, United Kingdom
Service status: One-off / fixed term service
Start date: 21-Oct-2024
End date: 09-Dec-2024
Hourly cost of support: £19.5
Number of hours: 42
Support to be provided:
(Every Day) Overnight pop in - 15 minutes x2 carers.
`;

  const plan = extractSupportPlanDataFromText(text);
  assert.equal(plan.provider, "Lawson House Extra Care (dale Care)");
  assert.equal(plan.providerValid, true);
  assert.equal(plan.startDate, "21/10/2024");
  assert.equal(plan.endDate, "09/12/2024");
  assert.equal(plan.weeklyHours, 42);
});

test("compareSupportPlanToServiceOrders flags an in-period weekly-hours increase with the change date", () => {
  const planText = `
Provider: Lawson House Extra Care (dale Care)
Start date: 05/02/2025
End date: 20/02/2025
Number of hours: 21
`;
  const plan = extractSupportPlanDataFromText(planText);

  const comparison = compareSupportPlanToServiceOrders(plan, {
    summary: {
      earliestStart: "05/02/2025",
      latestEnd: "20/02/2025",
    },
    segments: [
      {
        startDate: "05/02/2025",
        endDate: "06/02/2025",
        weeklyHoursTotal: 21,
        rows: [{ startTime: "08:00", endTime: "09:00" }],
      },
      {
        startDate: "07/02/2025",
        endDate: "20/02/2025",
        weeklyHoursTotal: 28,
        rows: [{ startTime: "08:00", endTime: "09:00" }],
      },
    ],
  });

  assert.ok(
    comparison.discrepancies.some((d) => d.includes("weekly hours change on 07/02/2025")),
    "flags the hours change date"
  );
  assert.ok(
    comparison.discrepancies.some((d) => d.includes("21h") && d.includes("28h")),
    "includes from/to hours"
  );
  assert.equal(comparison.weeklyHourChanges.length, 1);
  assert.deepEqual(comparison.weeklyHourChanges[0], { date: "07/02/2025", from: 21, to: 28 });
});

