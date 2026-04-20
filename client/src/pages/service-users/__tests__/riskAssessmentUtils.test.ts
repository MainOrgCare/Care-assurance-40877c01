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

  it("strips rule-based lead-ins and assessment-form label noise from generated risk text", () => {
    expect(
      sanitizeRiskDisplayText(
        "I have a additional infection control and hygiene assessment risk identified in my records. My documents note: === === Care Assessment This Care Assessment is for:: Date of birth: Client ID: PER8566 Address:,,,, Phone: Assessment date:: is committed to protecting your privacy when you use our serv. I need a clear, detailed plan so this risk is managed safely and consistently in daily care.",
      ),
    ).toBe("I need a clear, detailed plan so this risk is managed safely and consistently in daily care.");
  });

  it("strips support-plan header noise from generated risk text", () => {
    expect(
      sanitizeRiskDisplayText(
        "I have a priority community access and social support assessment risk identified in my records. My documents note: === === Support Plan This Support Plan is for:: Date of birth: Client ID: PER9107 Address:,,,, Phone:: This plan is: a review and update support plan update support plan following a reass. I need a clear, detailed plan so this risk is managed safely and consistently in daily care.",
      ),
    ).toBe("I need a clear, detailed plan so this risk is managed safely and consistently in daily care.");
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