import type { ZoneRegionDef } from "./zoneAllocation";

/**
 * Seed zone definitions. Sections are matched primarily by postcode outward code, with locality
 * keywords used to disambiguate shared districts (notably DL15, shared by Crook and Willington).
 *
 * These are starting defaults — operators can edit sections, outward codes, and keywords in the
 * Zone Allocator UI, and the edited set is persisted locally.
 */
export const DURHAM_REGION: ZoneRegionDef = {
  region: "Durham",
  sections: [
    {
      id: "durham-z3-aycliffe",
      name: "Durham Zone 3 - Aycliffe",
      outwardCodes: ["DL5"],
      keywords: ["aycliffe", "newton aycliffe", "school aycliffe"],
    },
    {
      id: "durham-z3-spennymoor",
      name: "Durham Zone 3 - Spennymoor",
      outwardCodes: ["DL16"],
      keywords: ["spennymoor", "tudhoe", "kirk merrington", "middlestone moor", "byers green"],
    },
    {
      id: "durham-z4-bishop-auckland",
      name: "Durham Zone 4 - Bishop Auckland",
      outwardCodes: ["DL14"],
      keywords: [
        "bishop auckland",
        "west auckland",
        "st helen auckland",
        "coundon",
        "escomb",
        "tindale",
        "shildon",
      ],
    },
    {
      id: "durham-z5-barnard-castle",
      name: "Durham Zone 5 - Barnard Castle",
      outwardCodes: ["DL12"],
      keywords: [
        "barnard castle",
        "startforth",
        "cotherstone",
        "gainford",
        "middleton-in-teesdale",
        "teesdale",
      ],
    },
    {
      id: "durham-z6-crook",
      name: "Durham Zone 6 - Crook",
      outwardCodes: ["DL15"],
      keywords: ["crook", "howden-le-wear", "roddymoor", "billy row", "stanley crook"],
    },
    {
      id: "durham-z6-durham",
      name: "Durham Zone 6 - Durham",
      outwardCodes: ["DH1", "DH6", "DH7"],
      keywords: [
        "durham city",
        "framwellgate",
        "gilesgate",
        "belmont",
        "sherburn",
        "coxhoe",
        "bowburn",
        "ushaw moor",
        "brandon",
        "langley moor",
        "meadowfield",
      ],
    },
    {
      id: "durham-z6-the-dales",
      name: "Durham Zone 6 - The Dales",
      outwardCodes: ["DL13"],
      keywords: [
        "weardale",
        "stanhope",
        "wolsingham",
        "tow law",
        "frosterley",
        "st johns chapel",
        "wearhead",
        "the dales",
        "dales",
      ],
    },
    {
      id: "durham-z6-willington",
      name: "Durham Zone 6 - Willington",
      outwardCodes: ["DL15"],
      keywords: ["willington", "sunnybrow", "oakenshaw", "hunwick"],
    },
    {
      id: "durham-z8-stanley",
      name: "Durham Zone 8 - Stanley",
      outwardCodes: ["DH9"],
      keywords: [
        "stanley",
        "annfield plain",
        "south moor",
        "tanfield",
        "craghead",
        "dipton",
        "catchgate",
        "quaking houses",
      ],
    },
  ],
};

export const SEED_REGIONS: ZoneRegionDef[] = [DURHAM_REGION];
