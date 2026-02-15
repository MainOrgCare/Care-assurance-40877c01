import RosteringStudioUnified from "@/pages/RosteringStudioUnified";

type LegacyRosteringStudioProps = {
  embedded?: boolean;
  mode?: "studio" | "hub";
};

/**
 * Legacy compatibility wrapper.
 * All routes and entry points now use the unified studio implementation.
 */
export default function RosteringStudio({ embedded = false }: LegacyRosteringStudioProps) {
  return <RosteringStudioUnified embedded={embedded} />;
}
