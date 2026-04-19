import { describe, expect, it } from "vitest";

import {
  assessPlanEnhancerPayloadSize,
  buildPlanEnhancerTokenLimitError,
  collectPlanEnhancerParseErrors,
  hasPlanEnhancerData,
  summarizePlanEnhancerSources,
} from "../planEnhancerUtils";

describe("planEnhancerUtils", () => {
  const sourceDocuments = [
    { label: "Social Work", name: "social.pdf", contentLength: 1200, isParsing: false },
    { label: "Assessment", name: "assessment.pdf", contentLength: 0, isParsing: true },
    { label: "Additional", name: "extra.pdf", contentLength: 400, isParsing: false, parseError: "OCR failed" },
  ];

  it("summarizes plan-enhancer source readiness and parse failures", () => {
    expect(summarizePlanEnhancerSources(sourceDocuments)).toEqual({
      total: 3,
      ready: 1,
      parsing: 1,
      failed: 1,
    });
    expect(collectPlanEnhancerParseErrors(sourceDocuments)).toEqual([
      { label: "Additional", name: "extra.pdf", message: "OCR failed" },
    ]);
  });

  it("detects whether plan enhancer has any usable input state", () => {
    expect(hasPlanEnhancerData([], false, false)).toBe(false);
    expect(hasPlanEnhancerData(sourceDocuments, false, false)).toBe(true);
    expect(hasPlanEnhancerData([], true, false)).toBe(true);
  });

  it("assesses token usage for provider-specific limits", () => {
    const overLimit = assessPlanEnhancerPayloadSize({
      supportingContent: "a".repeat(40050),
      carePlanContent: "b".repeat(10),
      activeProvider: "github",
    });
    const warningOnly = assessPlanEnhancerPayloadSize({
      supportingContent: "a".repeat(33000),
      carePlanContent: "",
      activeProvider: "github",
    });

    expect(overLimit.isOverLimit).toBe(true);
    expect(overLimit.maxTokens).toBe(10000);
    expect(buildPlanEnhancerTokenLimitError(overLimit)).toContain("10K tokens");
    expect(warningOnly.exceedsWarningThreshold).toBe(true);
    expect(warningOnly.isOverLimit).toBe(false);
  });
});