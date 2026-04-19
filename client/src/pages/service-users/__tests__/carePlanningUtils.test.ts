import { describe, expect, it } from "vitest";

import {
  countPlaceholders,
  extractServiceUserNameFromDocumentContent,
  filterVisibleCarePlanSections,
  hasActiveCarePlanFilters,
  summarizeCarePlanSections,
} from "../carePlanningUtils";

describe("carePlanningUtils", () => {
  const sections = [
    {
      index: 1,
      section: {
        title: "Medication Support",
        priority: "medium" as const,
        content: "Prompt medication and record administration.",
        steps: ["Prompt medication"],
        risks: ["Missed doses"],
        equipment: ["MAR chart"],
      },
    },
    {
      index: 0,
      section: {
        title: "Mobility",
        priority: "high" as const,
        content: "Use the stand aid for transfers.",
        steps: ["Apply belt", "Use stand aid"],
        risks: ["Falls"],
        equipment: ["Stand aid"],
      },
    },
  ];

  it("counts placeholders in template-style care plans", () => {
    expect(countPlaceholders("Support [Name] with [Medication].")).toBe(2);
  });

  it("summarizes care-plan sections for dashboard badges", () => {
    expect(summarizeCarePlanSections(sections)).toEqual({
      total: 2,
      high: 1,
      medium: 1,
      low: 0,
      steps: 3,
      risks: 2,
      equipment: 2,
    });
  });

  it("filters and sorts visible care-plan sections", () => {
    expect(filterVisibleCarePlanSections(sections, "all", "stand aid", "priority").map((item) => item.section.title)).toEqual([
      "Mobility",
    ]);
    expect(filterVisibleCarePlanSections(sections, "all", "", "priority").map((item) => item.section.title)).toEqual([
      "Mobility",
      "Medication Support",
    ]);
  });

  it("detects active care-plan filters and extracts service-user names from source text", () => {
    expect(hasActiveCarePlanFilters("prompt", "all", "default")).toBe(true);
    expect(hasActiveCarePlanFilters("", "all", "default")).toBe(false);
    expect(extractServiceUserNameFromDocumentContent("Full name: Jane Smith\nNeeds support with medication.")).toBe("Jane Smith");
  });

  it("extracts realistic hyphenated and particle-based service-user names", () => {
    expect(extractServiceUserNameFromDocumentContent("Known as: Mary-Jane O'Neill\nPrefers morning support.")).toBe("Mary-Jane O'Neill");
    expect(extractServiceUserNameFromDocumentContent("Name: Mary van Buren\nRequires mobility prompts.")).toBe("Mary van Buren");
  });
});