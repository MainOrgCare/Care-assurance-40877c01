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

test("extracts visits with carer count and duration from support text", () => {
  const text = `
Provider: Lawson House Extra Care (dale Care)

Address: Lawson House Lawson Gardens, Newcastle Upon Tyne, NE6 2UY, United Kingdom

Is this to be funded by ISF?: No

Type of placement: Extra Care overnight cost

Service status: One-off / fixed term service

Start date: 28-May-2024

End date: 09-Dec-2024

End Reason: Transfer to same type of provision

Overnight charge: £87.01

Support to be provided: 

Per day,

One overnight call x2 carers for 15 mins to change Kauko's pad to help support with his skin.

Appropriate provision basis for this service: Long Term Support

Extra care service category: Older people (65 and older)

Extra care service element: Band C+
`;

  const plan = extractSupportPlanDataFromText(text);
  
  assert.equal(plan.provider, "Lawson House Extra Care (dale Care)");
  assert.equal(plan.providerValid, true);
  assert.equal(plan.startDate, "28/05/2024");
  assert.equal(plan.endDate, "09/12/2024");
  
  // Check sections
  assert.ok(plan.sections.length >= 1, "should have at least one section");
  const section = plan.sections[0];
  assert.equal(section.startDate, "28/05/2024");
  assert.equal(section.endDate, "09/12/2024");
  
  // Check visits
  assert.ok(plan.visits.length >= 1, "should have at least one visit");
  const visit = plan.visits[0];
  assert.equal(visit.carerCount, 2, "should extract x2 carers");
  assert.equal(visit.duration, 15, "should extract 15 mins duration");
  assert.equal(visit.time, "overnight", "should identify as overnight");
  assert.ok(visit.frequency?.includes("per day") || visit.frequency?.includes("daily"), "should identify daily frequency");
  
  // Weekly hours should be calculated: 15 mins x 7 days = 105 mins = 1.75 hours
  assert.ok(plan.weeklyHours != null, "should calculate weekly hours");
  assert.ok(plan.weeklyHours! >= 1.5 && plan.weeklyHours! <= 2, `weekly hours should be around 1.75, got ${plan.weeklyHours}`);
});

test("extracts multiple sections from support plan", () => {
  const text = `
Provider: Lawson House Extra Care (dale Care)
Start date: 28-May-2024
End date: 23-Jun-2024
Support to be provided:
Morning call x2 carers for 45 mins

Provider: Lawson House Extra Care (dale Care)
Start date: 24-Jun-2024
End date: 05-Aug-2024
Support to be provided:
Morning call x3 carers for 45 mins

Provider: Lawson House Extra Care (dale Care)
Start date: 05-Aug-2024
End date: 21-Oct-2024
Support to be provided:
Morning call x3 carers for 45 mins
Lunch call x2 carers for 30 mins
`;

  const plan = extractSupportPlanDataFromText(text);
  
  // Should have extracted 3 sections
  assert.equal(plan.sections.length, 3, "should extract 3 sections");
  
  // First section
  assert.equal(plan.sections[0].startDate, "28/05/2024");
  assert.equal(plan.sections[0].endDate, "23/06/2024");
  
  // Second section
  assert.equal(plan.sections[1].startDate, "24/06/2024");
  assert.equal(plan.sections[1].endDate, "05/08/2024");
  
  // Third section
  assert.equal(plan.sections[2].startDate, "05/08/2024");
  assert.equal(plan.sections[2].endDate, "21/10/2024");
});

