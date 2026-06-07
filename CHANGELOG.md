# Changelog

All notable changes to this repository are documented in this file.

## Unreleased

### Added

- **Rostering Zone Allocator feature** with region/section definitions and allocation by postcode + locality (`/rostering/zones`).
- **Zone Map feature** (`/rostering/map`) to visualise service users geographically, search/focus users, and inspect section membership.
- **New seeded region support** for Newcastle/North Tyneside sectioning.
- **Durham section expansion** to include Ferryhill and Shildon as dedicated sections.

### Changed

- **Rostering Analyse integration**: zone records now flow directly from analysed rostering data instead of a separate import path.
- **Volatile zone state model**: zone mapping data now resets on page refresh (in-memory store).
- **Service Location Area priority**: allocation now prefers the `Service Location Area` field over fallback area fields.
- **Zone Map UX**:
  - section boundary polygons (convex hulls),
  - on-map legend with live counts and section selection,
  - light/dark/satellite basemap toggle.

### Fixed

- **Sidebar navigation** now shows the Rostering `Zones` and `Map` entries where operators actually navigate.
- **EMAR carer initials rendering**: fixed names showing as a `PIIM` token fragment.
- **Zone Map postcode precision**:
  - postcode-first geocoding via `postcodes.io`,
  - normalized geocode cache keys for postcode variants,
  - bounded concurrent client geocoding to resolve more precise points faster,
  - client geocode cache no longer pins transient null failures.

