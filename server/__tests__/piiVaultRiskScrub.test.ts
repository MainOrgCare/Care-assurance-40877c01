import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PIIVault } from "../utils/piiVault";

describe("PIIVault risk assessment scrubbing", () => {
  it("scrubs direct identifiers in prose", () => {
    const vault = new PIIVault();
    const input = [
      "Case ID: CASE-2-4150",
      "Service user initials: M.S.",
      "Date of Birth: 19/Jul/46",
      "Address fragment: 5 michaelgate, byker",
      "Signed by: Lewis.Barron",
    ].join("\n");

    const scrubbed = vault.scrubString(input);

    assert(!scrubbed.includes("CASE-2-4150"));
    assert(!scrubbed.includes("M.S."));
    assert(!scrubbed.includes("19/Jul/46"));
    assert(!scrubbed.toLowerCase().includes("michaelgate"));
    assert(!scrubbed.includes("Lewis.Barron"));
    assert(/\{\{PII_.*_(FIELD|DATE|DOB|ADDRESS|STAFF|NAME)_\d+\}\}/.test(scrubbed));
  });

  it("catches narrative name leaks in free text", () => {
    const vault = new PIIVault();
    const input = "I met kenny yesterday and my granddaughter kaylee called later.";
    const scrubbed = vault.scrubString(input);

    assert(!scrubbed.toLowerCase().includes("kenny"));
    assert(!scrubbed.toLowerCase().includes("kaylee"));
    assert(/\{\{PII_.*_NAME_\d+\}\}/.test(scrubbed));
  });

  it("catches identifying biography combinations", () => {
    const vault = new PIIVault();
    const input = "My family history: married twice, had 6 children, one died at age 27, and was well known in the area.";
    const scrubbed = vault.scrubString(input);

    assert(!scrubbed.toLowerCase().includes("married twice"));
    assert(!scrubbed.toLowerCase().includes("had 6 children"));
    assert(!scrubbed.toLowerCase().includes("well known in the area"));
    assert(/\{\{PII_.*_BIOGRAPHICAL_\d+\}\}/.test(scrubbed));
  });

  it("catches person-linked health data while keeping generic language", () => {
    const vault = new PIIVault();
    const input = [
      "Generic guidance: monitor blood pressure and review medication administration.",
      "I have dementia, reduced capacity and require continence pads with insulin support.",
    ].join("\n");
    const scrubbed = vault.scrubString(input);

    assert(scrubbed.toLowerCase().includes("monitor blood pressure"));
    assert(!scrubbed.toLowerCase().includes("i have dementia"));
    assert(!scrubbed.toLowerCase().includes("reduced capacity"));
    assert(!scrubbed.toLowerCase().includes("continence pads"));
    assert(/\{\{PII_.*_HEALTH_\d+\}\}/.test(scrubbed));
  });

  it("does not redact generic health standards prose", () => {
    const vault = new PIIVault();
    const input = "Policy guidance: monitor continence, review falls risk, and follow medication administration standards.";
    const scrubbed = vault.scrubString(input);

    assert(scrubbed.toLowerCase().includes("monitor continence"));
    assert(scrubbed.toLowerCase().includes("review falls risk"));
    assert(!/\{\{PII_.*_HEALTH_\d+\}\}/.test(scrubbed));
  });

  it("redacts person-linked location references but keeps generic place words", () => {
    const vault = new PIIVault();
    const input = [
      "General text: the local area has good transport.",
      "Service user grew up in walker and is well known in the area.",
    ].join("\n");
    const scrubbed = vault.scrubString(input);

    assert(scrubbed.toLowerCase().includes("the local area has good transport"));
    assert(!scrubbed.toLowerCase().includes("grew up in walker"));
    assert(/\{\{PII_.*_LOCATION_\d+\}\}/.test(scrubbed));
  });

  it("redacts contact-role identifying combinations", () => {
    const vault = new PIIVault();
    const input = "My daughter is the next of kin and works as a GP in our area.";
    const scrubbed = vault.scrubString(input);

    assert(!scrubbed.toLowerCase().includes("daughter is the next of kin"));
    assert(!scrubbed.toLowerCase().includes("works as a gp"));
    assert(/\{\{PII_.*_BIOGRAPHICAL_\d+\}\}/.test(scrubbed));
  });

  it("keeps medication names in mixed content while redacting linked identifiers", () => {
    const vault = new PIIVault();
    const input = "Medication list: metformin and insulin. My daughter Sarah manages collection from walker.";
    const scrubbed = vault.scrubString(input);

    assert(scrubbed.toLowerCase().includes("metformin"));
    assert(scrubbed.toLowerCase().includes("insulin"));
    assert(!scrubbed.includes("Sarah"));
    assert(!scrubbed.toLowerCase().includes("walker"));
    assert(/\{\{PII_.*_(NAME|LOCATION)_\d+\}\}/.test(scrubbed));
  });

  it("keeps repeated entity token mapping consistent", () => {
    const vault = new PIIVault();
    const input = "My daughter Sarah visited. Later Sarah called the GP.";
    const scrubbed = vault.scrubString(input);
    const tokens = scrubbed.match(/\{\{PII_[^}]+\}\}/g) || [];

    assert(tokens.length >= 2);
    const nameTokens = tokens.filter((token) => token.includes("_NAME_"));
    assert(nameTokens.length >= 2);
    assert.equal(nameTokens[0], nameTokens[1]);
  });

  it("converts new tokenized categories to placeholders", () => {
    const vault = new PIIVault();
    const scrubbed = vault.scrubString("My family history states married twice and I live in walker.");
    const placeholders = vault.toPlaceholdersString(scrubbed);

    assert(placeholders.includes("[Biographical Detail]"));
    assert(placeholders.includes("[Location]"));
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

    const stats = vault.getStats();
    assert(stats.byCategory.HEALTH >= 1);
    assert(stats.byCategory.BIOGRAPHICAL >= 1);
  });

  it("scrubs nested structured values without collapsing to object strings", () => {
    const vault = new PIIVault();
    const input = {
      biography: {
        summary: "Married twice and had 6 children",
        notes: ["Known in walker", "Bereavement after daughter died"],
      },
      medicalConditions: ["Dementia", "Insulin dependent diabetes"],
    };

    const scrubbed = vault.scrub(input) as Record<string, unknown>;
    const asText = JSON.stringify(scrubbed).toLowerCase();

    assert(!asText.includes("[object object]"));
    assert(!asText.includes("married twice"));
    assert(!asText.includes("dementia"));
  });

  it("supports conservative profile to reduce aggressive narrative auto-redaction", () => {
    const vault = new PIIVault({ profile: "conservative" });
    const input = "I was born in a nearby town, married, had children and moved often.";
    const scrubbed = vault.scrubString(input);

    // Quasi-identifier combinations at 0.66 should remain in conservative mode.
    assert(scrubbed.toLowerCase().includes("born in a nearby town"));
    assert(scrubbed.toLowerCase().includes("had children"));

    assert(typeof scrubbed === "string");
  });
});
