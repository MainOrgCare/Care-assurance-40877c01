import { describe, it, expect } from "vitest";
import { buildRecordsFromRoster, regionsInRecords } from "../zoneRosterAdapter";

describe("buildRecordsFromRoster", () => {
  it("maps branch→region, area→area and extracts a full postcode from the address", () => {
    const records = buildRecordsFromRoster([
      {
        serviceUserName: "A.One",
        serviceUserArea: "Byker",
        serviceUserAddress: "12 Shields Rd, Byker, NE6 1AB",
        serviceLocationBranch: "Newcastle",
      },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      serviceUser: "A.One",
      region: "Newcastle",
      area: "Byker",
      postcode: "NE6 1AB",
    });
    expect(records[0].address).toContain("Shields Rd");
  });

  it("skips rows without a service-user name", () => {
    const records = buildRecordsFromRoster([
      { serviceUserName: "", serviceUserAddress: "DL5 6AB" },
      { serviceUserName: "   ", serviceUserAddress: "DL5 6AB" },
      { serviceUserName: "B.Two", serviceUserAddress: "DL5 6AB" },
    ]);
    expect(records.map((r) => r.serviceUser)).toEqual(["B.Two"]);
  });

  it("merges duplicate rows for the same service user (one section per person)", () => {
    const records = buildRecordsFromRoster([
      { serviceUserName: "C.Three", serviceUserArea: "Jesmond", serviceUserAddress: "" },
      { serviceUserName: "C.Three", serviceUserArea: "", serviceUserAddress: "1 High St, NE2 1AA" },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].area).toBe("Jesmond");
    expect(records[0].postcode).toBe("NE2 1AA");
  });

  it("nulls postcode when the address has none", () => {
    const records = buildRecordsFromRoster([
      { serviceUserName: "D.Four", serviceUserAddress: "Somewhere with no postcode" },
    ]);
    expect(records[0].postcode).toBeNull();
  });

  it("prefers serviceLocationArea over serviceUserArea for the locality keyword", () => {
    const records = buildRecordsFromRoster([
      {
        serviceUserName: "E.Five",
        serviceLocationArea: "Ferryhill",
        serviceUserArea: "Bishop Auckland",
        serviceUserAddress: "1 Market St, DL17 8AA",
      },
    ]);
    expect(records[0].area).toBe("Ferryhill");
  });

  it("falls back to serviceUserArea when serviceLocationArea is blank", () => {
    const records = buildRecordsFromRoster([
      {
        serviceUserName: "F.Six",
        serviceLocationArea: "   ",
        serviceUserArea: "Shildon",
        serviceUserAddress: "2 Church St, DL4 1AA",
      },
    ]);
    expect(records[0].area).toBe("Shildon");
  });
});

describe("regionsInRecords", () => {
  it("returns distinct, sorted, non-empty branch names", () => {
    const records = buildRecordsFromRoster([
      { serviceUserName: "A", serviceLocationBranch: "Newcastle" },
      { serviceUserName: "B", serviceLocationBranch: "Durham" },
      { serviceUserName: "C", serviceLocationBranch: "Durham" },
      { serviceUserName: "D", serviceLocationBranch: "" },
    ]);
    expect(regionsInRecords(records)).toEqual(["Durham", "Newcastle"]);
  });
});
