import { describe, it, expect } from "vitest";
import {
  OUTWARD_CENTROIDS,
  sectionCentroid,
  jitter,
  buildSectionColors,
  buildMarkers,
  uniqueAddresses,
  uniquePostcodes,
  placeServiceUser,
  convexHull,
  buildSectionHulls,
} from "../zoneMapData";
import { allocateRecords, type EcmRecord } from "../zoneAllocation";
import { DURHAM_REGION, NEWCASTLE_REGION } from "../zoneSeed";

const rec = (
  serviceUser: string,
  postcode: string | null,
  area: string | null = null,
): EcmRecord => ({ serviceUser, region: null, area, postcode, address: null, rowIndex: 0 });

describe("sectionCentroid", () => {
  it("averages the centroids of a section's known outward codes", () => {
    const durham = DURHAM_REGION.sections.find((s) => s.id === "durham-z6-durham")!;
    const c = sectionCentroid(durham); // DH1, DH6, DH7
    const expectedLat = (OUTWARD_CENTROIDS.DH1.lat + OUTWARD_CENTROIDS.DH6.lat + OUTWARD_CENTROIDS.DH7.lat) / 3;
    expect(c.lat).toBeCloseTo(expectedLat, 5);
  });
  it("falls back to a UK anchor when no outward code is known", () => {
    const c = sectionCentroid({ id: "x", name: "X", outwardCodes: ["ZZ9"], keywords: [] });
    expect(c.lat).toBeGreaterThan(49);
    expect(c.lat).toBeLessThan(61);
  });
});

describe("jitter", () => {
  it("is deterministic for the same seed", () => {
    expect(jitter("Smith|DL5 6AB")).toEqual(jitter("Smith|DL5 6AB"));
  });
  it("differs for different seeds", () => {
    expect(jitter("a")).not.toEqual(jitter("b"));
  });
  it("stays within a small radius", () => {
    const j = jitter("anything");
    expect(Math.abs(j.lat)).toBeLessThan(0.01);
    expect(Math.abs(j.lon)).toBeLessThan(0.02);
  });
});

describe("buildSectionColors", () => {
  it("assigns a stable color per section in order", () => {
    const colors = buildSectionColors([{ sectionId: "a" }, { sectionId: "b" }, { sectionId: "a" }]);
    expect(colors.a).toBeDefined();
    expect(colors.b).toBeDefined();
    expect(colors.a).not.toEqual(colors.b);
  });
});

describe("placeServiceUser", () => {
  it("prefers precise geocoded coordinates keyed by normalized postcode", () => {
    const result = allocateRecords([rec("Jane", "DL5 6AB")], DURHAM_REGION);
    const user = result.sections.find((s) => s.sectionId === "durham-z3-aycliffe")!.serviceUsers[0];
    const section = DURHAM_REGION.sections.find((s) => s.id === "durham-z3-aycliffe")!;
    const marker = placeServiceUser(
      user,
      section,
      { DL56AB: { lat: 54.1, lon: -1.1 } },
      {},
      "#000",
    );
    expect(marker.precise).toBe(true);
    expect(marker.lat).toBe(54.1);
    expect(marker.lon).toBe(-1.1);
  });
  it("anchors to the section centroid (with jitter) when no precise point exists", () => {
    const result = allocateRecords([rec("Jane", "DL5 6AB")], DURHAM_REGION);
    const user = result.sections.find((s) => s.sectionId === "durham-z3-aycliffe")!.serviceUsers[0];
    const section = DURHAM_REGION.sections.find((s) => s.id === "durham-z3-aycliffe")!;
    const marker = placeServiceUser(user, section, {}, {}, "#000");
    expect(marker.precise).toBe(true);
    expect(marker.lat).toBeCloseTo(OUTWARD_CENTROIDS.DL5.lat, 1);
    expect(marker.lon).toBeCloseTo(OUTWARD_CENTROIDS.DL5.lon, 1);
  });
});

describe("buildMarkers", () => {
  it("produces one marker per service user, colored by section, with unallocated included", () => {
    const records = [
      rec("Jane", "DL5 6AB"), // Aycliffe
      rec("Bob", "DL14 7AA"), // Bishop Auckland
      rec("Zed", "ZZ1 1ZZ"), // no match -> unallocated
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    const markers = buildMarkers(result, DURHAM_REGION, {}, {});
    expect(markers).toHaveLength(3);
    const zed = markers.find((m) => m.serviceUser === "Zed")!;
    expect(zed.sectionId).toBeNull();
    expect(zed.sectionName).toBe("Unallocated");
    const jane = markers.find((m) => m.serviceUser === "Jane")!;
    const bob = markers.find((m) => m.serviceUser === "Bob")!;
    expect(jane.color).not.toEqual(bob.color);
  });

  it("works for the Newcastle region with keyword-disambiguated sections", () => {
    const records = [
      rec("A", "NE6 1AA", "Byker"),
      rec("B", "NE6 4AA", "Walker"),
      rec("C", "NE2 3AA", "Jesmond"),
    ];
    const result = allocateRecords(records, NEWCASTLE_REGION);
      const markers = buildMarkers(result, NEWCASTLE_REGION, {}, {});
    expect(markers).toHaveLength(3);
    expect(markers.every((m) => m.lat > 54 && m.lat < 56)).toBe(true);
  });

    it("uses precise address geocoding when postcode geocoding is unavailable", () => {
      const records: EcmRecord[] = [
        {
          serviceUser: "A.User",
          region: "Durham",
          area: "Aycliffe",
          postcode: "DL5 6AB",
          address: "1 Example St, Newton Aycliffe, DL5 6AB",
          rowIndex: 0,
        },
      ];
      const result = allocateRecords(records, DURHAM_REGION);
      const markers = buildMarkers(result, DURHAM_REGION, {}, {
        "1 example st, newton aycliffe, dl5 6ab": { lat: 54.61, lon: -1.56 },
      });
      expect(markers[0].precise).toBe(true);
      expect(markers[0].lat).toBe(54.61);
      expect(markers[0].lon).toBe(-1.56);
    });
});

describe("uniquePostcodes", () => {
  it("collects distinct non-empty postcodes across sections and unallocated", () => {
    const records = [
      rec("Jane", "DL5 6AB"),
      rec("Bob", "DL5 6AB"),
      rec("Zed", "ZZ1 1ZZ"),
      rec("Nul", null),
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    const pcs = uniquePostcodes(result).sort();
    expect(pcs).toEqual(["DL5 6AB", "ZZ1 1ZZ"]);
  });

  it("extracts a postcode from address text when postcode field is missing", () => {
    const records: EcmRecord[] = [
      {
        serviceUser: "Addr.One",
        region: "Durham",
        area: "Aycliffe",
        postcode: null,
        address: "1 Example Street, Newton Aycliffe, DL5 6AB",
        rowIndex: 1,
      },
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    expect(uniquePostcodes(result)).toEqual(["DL5 6AB"]);
  });

  describe("uniqueAddresses", () => {
    it("collects distinct non-empty addresses across sections and unallocated", () => {
      const records: EcmRecord[] = [
        { serviceUser: "Jane", region: null, area: null, postcode: "DL5 6AB", address: "1 A St", rowIndex: 1 },
        { serviceUser: "Bob", region: null, area: null, postcode: "DL14 7AA", address: "1 A St", rowIndex: 2 },
        { serviceUser: "Zed", region: null, area: null, postcode: "ZZ1 1ZZ", address: "2 B St", rowIndex: 3 },
        { serviceUser: "Nul", region: null, area: null, postcode: null, address: null, rowIndex: 4 },
      ];
      const result = allocateRecords(records, DURHAM_REGION);
      expect(uniqueAddresses(result).sort()).toEqual(["1 A St", "2 B St"]);
    });
  });
});

describe("convexHull", () => {
  it("returns the input (deduped) when given fewer than three distinct points", () => {
    expect(convexHull([])).toEqual([]);
    const one = [{ lat: 1, lon: 1 }];
    expect(convexHull(one)).toHaveLength(1);
    const dupes = [
      { lat: 1, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 1 },
    ];
    expect(convexHull(dupes)).toHaveLength(1);
  });

  it("wraps a point cloud, dropping interior points", () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 2 },
      { lat: 2, lon: 0 },
      { lat: 2, lon: 2 },
      { lat: 1, lon: 1 }, // interior — must be excluded
    ];
    const hull = convexHull(square);
    expect(hull).toHaveLength(4);
    expect(hull.some((p) => p.lat === 1 && p.lon === 1)).toBe(false);
  });
});

describe("buildSectionHulls", () => {
  it("builds one hull per allocated section, skipping unallocated markers", () => {
    const records = [
      rec("A", "DL5 6AA"),
      rec("B", "DL5 6AB"),
      rec("C", "DL5 6AC"),
      rec("D", "DL5 6AD"),
      rec("Zed", "ZZ1 1ZZ"), // unallocated
    ];
    const result = allocateRecords(records, DURHAM_REGION);
    const geocoded = {
      DL56AA: { lat: 54.6, lon: -1.6 },
      DL56AB: { lat: 54.6, lon: -1.5 },
      DL56AC: { lat: 54.7, lon: -1.6 },
      DL56AD: { lat: 54.7, lon: -1.5 },
    };
    const markers = buildMarkers(result, DURHAM_REGION, geocoded, {});
    const hulls = buildSectionHulls(markers);
    expect(hulls).toHaveLength(1);
    expect(hulls[0].sectionId).toBe("durham-z3-aycliffe");
    expect(hulls[0].count).toBe(4);
    expect(hulls[0].polygon.length).toBeGreaterThanOrEqual(3);
    expect(hulls[0].color).toBeDefined();
  });

  it("yields an empty polygon for a section with fewer than three distinct points", () => {
    const records = [rec("A", "DL14 7AA"), rec("B", "DL14 7AA")];
    const result = allocateRecords(records, DURHAM_REGION);
    const markers = buildMarkers(
      result,
      DURHAM_REGION,
      {
        DL147AA: { lat: 54.66, lon: -1.68 },
      },
      {},
    );
    const hulls = buildSectionHulls(markers);
    expect(hulls).toHaveLength(1);
    expect(hulls[0].polygon).toEqual([]);
  });
});
