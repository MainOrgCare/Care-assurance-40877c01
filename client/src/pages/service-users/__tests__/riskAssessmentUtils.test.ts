import { describe, expect, it } from "vitest";

import {
  looksLikeServiceUserName,
  sanitizePerformerName,
  sanitizeRiskDisplayText,
  sanitizeServiceUserName,
  sanitizeStringList,
} from "../riskAssessmentUtils";

describe("riskAssessmentUtils", () => {
  it("removes template artifacts and questionnaire-style boilerplate from risk text", () => {
    expect(
      sanitizeRiskDisplayText(
        "Service user information. If there was a fire in the home, would I be able to evacuate the premises? John remains calm and cooperative.",
      ),
    ).toBe("John remains calm and cooperative.");
  });

  it("deduplicates sanitized string lists", () => {
    expect(sanitizeStringList([" Calm and cooperative ", "calm and cooperative", ""])).toEqual([
      "Calm and cooperative",
    ]);
  });

  it("accepts realistic service-user names and rejects placeholders", () => {
    expect(looksLikeServiceUserName("Mary van Buren")).toBe(true);
    expect(sanitizeServiceUserName("Service User Name")).toBe("");
    expect(sanitizeServiceUserName("information not found in documents")).toBe("");
    expect(sanitizeServiceUserName("Mary van Buren")).toBe("Mary van Buren");
  });

  it("rejects placeholder signer values and keeps valid performer names", () => {
    expect(sanitizePerformerName("USER")).toBe("");
    expect(sanitizePerformerName("{{PII_test_NAME_1}}")).toBe("");
    expect(sanitizePerformerName("J. Smith")).toBe("J Smith");
  });
});