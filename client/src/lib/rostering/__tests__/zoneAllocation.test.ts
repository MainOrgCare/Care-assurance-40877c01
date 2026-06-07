import { describe, it, expect } from "vitest";
import {
  extractPostcodeOutward,
  allocate,
  allocateRecords,
  dedupeServiceUsers,
  parseEcmText,
  mapEcmColumns,
  filterByRegion,
  type EcmRecord,
} from "../zoneAllocation";
import { DURHAM_REGION } from "../zoneSeed";

describe("extractPostcodeOutward", () => {
  it("extracts the outward code from a full postcode", () => {
    expect(extractPostcodeOutward("Some St, DL5 6AB")).toBe("DL5");
    expect(extractPostcodeOutward("dh9 8xy")).toBe("DH9");
    expect(extractPostcodeOutward("SW1A 1AA")).toBe("SW1A");
  });
  it("falls back to a standalone outward token", () => {
    expect(extractPostcodeOutward("Area: DL14")).toBe("DL14");
  });
  it("returns null when no postcode is present", () => {
    expect(extractPostcodeOutward("no postcode here")).toBeNull();
    expect(extractPostcodeOutward("")).toBeNull();
    expect(extractPostcodeOutward(null)).toBeNull();
  });
});

describe("allocate (Durham)", () => {
  it("allocates by postcode outward code", () => {
    const r = allocate({ postcode: "DL5 6JQ" }, DURHAM_REGION);
    expect(r.sectionId).toBe("durham-z3-aycliffe");
    expect(r.matchedBy).toBe("postcode");
    expect(r.ambiguous).toBe(false);
  });

  it("allocates Bishop Auckland and Barnard Castle distinctly", () => {
    expect(allocate({ postcode: "DL14 7AA" }, DURHAM_REGION).sectionId).toBe(
      "durham-z4-bishop-auckland",
    );
    expect(allocate({ postcode: "DL12 8AA" }, DURHAM_REGION).sectionId).toBe(
      "durham-z5-barnard-castle",
    );
  });

  it("maps all three Durham city districts to the Durham section", () => {
    for (const pc of ["DH1 1AA", "DH6 5AA", "DH7 7AA"]) {
      expect(allocate({ postcode: pc }, DURHAM_REGION).sectionId).toBe("durham-z6-durham");
    }
  });

  it("flags DL15 as ambiguous between Crook and Willington when only a postcode is given", () => {
    const r = allocate({ postcode: "DL15 9AA" }, DURHAM_REGION);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toContain("durham-z6-crook");
    expect(r.candidates).toContain("durham-z6-willington");
    // Best guess is the first section in definition order.
    expect(r.sectionId).toBe("durham-z6-crook");
  });

  it("disambiguates a shared DL15 district using the Customer Area name", () => {
    const crook = allocate({ postcode: "DL15 9AA", area: "Crook" }, DURHAM_REGION);
    expect(crook.sectionId).toBe("durham-z6-crook");
    expect(crook.ambiguous).toBe(false);
    expect(crook.matchedBy).toBe("postcode+area");

    const willington = allocate({ postcode: "DL15 0AA", area: "Willington" }, DURHAM_REGION);
    expect(willington.sectionId).toBe("durham-z6-willington");
    expect(willington.ambiguous).toBe(false);
  });

  it("allocates by locality keyword when no postcode is present", () => {
    const r = allocate({ area: "Stanhope, Weardale" }, DURHAM_REGION);
    expect(r.sectionId).toBe("durham-z6-the-dales");
    expect(r.matchedBy).toBe("area");
  });

  it("does not match a keyword as a substring of another word", () => {
    // "crook" must not match inside "brook"
    const r = allocate({ area: "Babbling Brook Lane" }, DURHAM_REGION);
    expect(r.sectionId).toBeNull();
  });

  it("returns unallocated for an out-of-region postcode", () => {
    const r = allocate({ postcode: "M14 5AA" }, DURHAM_REGION);
    expect(r.sectionId).toBeNull();
    expect(r.matchedBy).toBe("none");
    expect(r.outwardCode).toBe("M14");
  });
});

describe("dedupeServiceUsers", () => {
  it("merges rows for the same service user, preferring first non-empty fields", () => {
    const records: EcmRecord[] = [
      { serviceUser: "J.Smith", region: "Durham", area: null, postcode: null, address: null, rowIndex: 1 },
      { serviceUser: "j.smith", region: null, area: "Crook", postcode: "DL15 9AA", address: null, rowIndex: 2 },
    ];
    const merged = dedupeServiceUsers(records);
    expect(merged).toHaveLength(1);
    expect(merged[0].area).toBe("Crook");
    expect(merged[0].postcode).toBe("DL15 9AA");
    expect(merged[0].region).toBe("Durham");
  });
});

describe("allocateRecords", () => {
  it("buckets service users into sections and keeps a person together", () => {
    const records: EcmRecord[] = [
      { serviceUser: "A.One", region: "Durham", area: "Aycliffe", postcode: "DL5 6AA", address: null, rowIndex: 1 },
      { serviceUser: "A.One", region: "Durham", area: null, postcode: null, address: null, rowIndex: 2 },
      { serviceUser: "B.Two", region: "Durham", area: "Willington", postcode: "DL15 0AA", address: null, rowIndex: 3 },
      { serviceUser: "C.Three", region: "Durham", area: null, postcode: "ZZ99 9ZZ", address: null, rowIndex: 4 },
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    expect(result.totalServiceUsers).toBe(3);

    const aycliffe = result.sections.find((s) => s.sectionId === "durham-z3-aycliffe")!;
    expect(aycliffe.serviceUsers.map((u) => u.serviceUser)).toEqual(["A.One"]);

    const willington = result.sections.find((s) => s.sectionId === "durham-z6-willington")!;
    expect(willington.serviceUsers.map((u) => u.serviceUser)).toEqual(["B.Two"]);

    expect(result.unallocated.map((u) => u.serviceUser)).toEqual(["C.Three"]);
  });

  it("collects ambiguous allocations", () => {
    const records: EcmRecord[] = [
      { serviceUser: "D.Four", region: "Durham", area: null, postcode: "DL15 9AA", address: null, rowIndex: 1 },
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    expect(result.ambiguous.map((u) => u.serviceUser)).toEqual(["D.Four"]);
  });
});

describe("parseEcmText", () => {
  it("auto-detects Customer Branch / Customer Area / Postcode / Service User columns from CSV", () => {
    const csv = [
      "Service User,Customer Branch,Customer Area,Post Code",
      "A.One,Durham,Aycliffe,DL5 6AA",
      "B.Two,Durham,Willington,DL15 0AA",
    ].join("\n");
    const parsed = parseEcmText(csv);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].serviceUser).toBe("A.One");
    expect(parsed.records[0].region).toBe("Durham");
    expect(parsed.records[0].postcode).toBe("DL5 6AA");
    expect(parsed.regions).toEqual(["Durham"]);
  });

  it("parses tab-separated pasted data and quoted fields", () => {
    const tsv = [
      "Name\tBranch\tArea\tPostcode",
      '"Smith, John"\tDurham\tStanley\tDH9 8AA',
    ].join("\n");
    const parsed = parseEcmText(tsv);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].serviceUser).toBe("Smith, John");
    expect(parsed.records[0].postcode).toBe("DH9 8AA");
  });

  it("skips rows with no service user", () => {
    const csv = ["Service User,Postcode", ",DL5 6AA", "A.One,DL5 6AA"].join("\n");
    const parsed = parseEcmText(csv);
    expect(parsed.records).toHaveLength(1);
  });

  it("returns -1 for columns it cannot find", () => {
    const map = mapEcmColumns(["foo", "bar"]);
    expect(map.serviceUser).toBe(-1);
    expect(map.postcode).toBe(-1);
  });
});

describe("filterByRegion", () => {
  it("keeps only rows matching the region (and region-less rows)", () => {
    const records: EcmRecord[] = [
      { serviceUser: "A", region: "Durham", area: null, postcode: null, address: null, rowIndex: 1 },
      { serviceUser: "B", region: "Sunderland", area: null, postcode: null, address: null, rowIndex: 2 },
      { serviceUser: "C", region: null, area: null, postcode: null, address: null, rowIndex: 3 },
    ];
    const filtered = filterByRegion(records, "durham");
    expect(filtered.map((r) => r.serviceUser)).toEqual(["A", "C"]);
  });
});
