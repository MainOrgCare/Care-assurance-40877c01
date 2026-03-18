import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PIIVault } from "../utils/piiVault";

describe("PIIVault risk assessment scrubbing", () => {
  it("scrubs common leaked identifiers and narrative fields", () => {
    const vault = new PIIVault();
    const input = [
      "Service user initials: M.S.",
      "Case ID: CASE-2-4150",
      "Date of Birth: 19/Jul/46",
      "Date of initial assessment: 20/Dec/2022",
      "Date of service commencement: 17/Oct/2022",
      "She met kenny and mentioned kaylee and natalie.",
      "Address fragment: 5 michaelgate, byker",
      "She grew up in walker.",
      "Signed by: Lewis.Barron",
      "Medical details: Dementia, Type 1 diabetes, asthma, arthritis, vertigo, depression and incontinence.",
      "Sexual orientation: Heterosexual/straight.",
      "Biographical details: Married twice, first marriage at age 17, had 6 children, one of whom died at age 27, divorce referenced, former occupation nurse.",
    ].join("\n");

    const scrubbed = vault.scrubString(input);

    assert(!scrubbed.includes("M.S."));
    assert(!scrubbed.includes("CASE-2-4150"));
    assert(!scrubbed.includes("19/Jul/46"));
    assert(!scrubbed.includes("20/Dec/2022"));
    assert(!scrubbed.includes("17/Oct/2022"));
    assert(!scrubbed.toLowerCase().includes("kenny"));
    assert(!scrubbed.toLowerCase().includes("kaylee"));
    assert(!scrubbed.toLowerCase().includes("natalie"));
    assert(!scrubbed.toLowerCase().includes("michaelgate"));
    assert(!scrubbed.toLowerCase().includes("walker"));
    assert(!scrubbed.includes("Lewis.Barron"));
    assert(!scrubbed.toLowerCase().includes("dementia"));
    assert(!scrubbed.toLowerCase().includes("type 1 diabetes"));
    assert(!scrubbed.toLowerCase().includes("asthma"));
    assert(!scrubbed.toLowerCase().includes("arthritis"));
    assert(!scrubbed.toLowerCase().includes("vertigo"));
    assert(!scrubbed.toLowerCase().includes("depression"));
    assert(!scrubbed.toLowerCase().includes("incontinence"));
    assert(!scrubbed.toLowerCase().includes("heterosexual"));
    assert(!scrubbed.toLowerCase().includes("straight"));
    assert(!scrubbed.toLowerCase().includes("married twice"));
    assert(!scrubbed.toLowerCase().includes("former occupation"));

    const stats = vault.getStats();
    assert(stats.total > 0);
  });

  it("converts new tokenized categories to placeholders", () => {
    const vault = new PIIVault();
    const scrubbed = vault.scrubString("Signed by: Lewis.Barron; Case ID: CASE-2-4150; Sexual orientation: straight");
    const placeholders = vault.toPlaceholdersString(scrubbed);

    assert(placeholders.includes("[Staff Member]"));
    assert(placeholders.includes("[Personal Field]"));
  });

  it("scrubs sensitive structured fields by key name", () => {
    const vault = new PIIVault();
    const input = {
      signedBy: "Lewis.Barron",
      caseId: "CASE-2-4150",
      sexualOrientation: "Heterosexual/straight",
      medicalConditions: ["Dementia", "Type 1 diabetes"],
      biography: "Married twice and divorce referenced",
    };

    const scrubbed = vault.scrub(input) as Record<string, unknown>;
    const asText = JSON.stringify(scrubbed).toLowerCase();
    assert(!asText.includes("lewis.barron"));
    assert(!asText.includes("case-2-4150"));
    assert(!asText.includes("heterosexual"));
    assert(!asText.includes("dementia"));
    assert(!asText.includes("married twice"));
  });
});
