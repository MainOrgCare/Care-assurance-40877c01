export interface TimelineEntry {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  serviceUserName?: string | null;
  serviceUserKey?: string | null;
  callTypeLabel?: string | null;
  isTimeCritical?: boolean;
  isDoubleUp?: boolean;
  address?: string | null;
}

export interface GanttLane {
  id: string;
  label: string;
  entries: TimelineEntry[];
}

export interface WorkerSummary {
  key: string;
  workerName: string;
  totalCalls: number;
  uniqueServiceUsers: number;
  totalDurationMinutes: number;
  timeCriticalCalls: number;
  shiftBarsCount: number;
}

interface WorkerCallGroupShape {
  key: string;
  serviceUserName: string | null;
  serviceUserKey?: string | null;
  serviceUserAddress?: string | null;
  callTypeLabel: string;
  requirementStartMinutes: number | null;
  durationMinutes: number | null;
  totalCalls: number;
  isTimeCritical: boolean;
  templatedWeekdayKeys?: Set<string>;
}

interface CareWorkerRosterShape {
  key: string;
  workerName: string;
  uniqueServiceUsers: number;
  callGroups: WorkerCallGroupShape[];
  shiftBarsCount: number;
}

const fallbackDurationMinutes = 30;

export const buildWorkerTimelineEntries = (
  roster: CareWorkerRosterShape | null,
  templateSelectionKey?: string
): TimelineEntry[] => {
  if (!roster) return [];
  return roster.callGroups
    .filter((group) => {
      // Must have a requirement start time
      if (group.requirementStartMinutes === null) return false;
      // Filter by template week/day if key provided
      if (templateSelectionKey && group.templatedWeekdayKeys) {
        return group.templatedWeekdayKeys.has(templateSelectionKey);
      }
      return true;
    })
    .map((group) => ({
      id: group.key,
      title: group.serviceUserName || group.callTypeLabel,
      startMinutes: group.requirementStartMinutes as number,
      durationMinutes: group.durationMinutes ?? fallbackDurationMinutes,
      serviceUserName: group.serviceUserName,
      serviceUserKey: group.serviceUserKey,
      callTypeLabel: group.callTypeLabel,
      isTimeCritical: group.isTimeCritical,
      address: group.serviceUserAddress ?? null,
    }));
};

export const buildWorkerSummaries = (rosters: CareWorkerRosterShape[]): WorkerSummary[] => {
  return rosters.map((roster) => {
    const totalCalls = roster.callGroups.reduce((acc, group) => acc + group.totalCalls, 0);
    const totalDurationMinutes = roster.callGroups.reduce(
      (acc, group) => acc + (group.durationMinutes ?? fallbackDurationMinutes),
      0
    );
    const timeCriticalCalls = roster.callGroups.reduce(
      (acc, group) => acc + (group.isTimeCritical ? group.totalCalls : 0),
      0
    );
    return {
      key: roster.key,
      workerName: roster.workerName,
      totalCalls,
      uniqueServiceUsers: roster.uniqueServiceUsers,
      totalDurationMinutes,
      timeCriticalCalls,
      shiftBarsCount: roster.shiftBarsCount,
    };
  });
};

export const buildWorkerLane = (
  roster: CareWorkerRosterShape | null,
  templateSelectionKey?: string
): GanttLane | null => {
  if (!roster) return null;
  return {
    id: roster.key,
    label: roster.workerName,
    entries: buildWorkerTimelineEntries(roster, templateSelectionKey),
  };
};

export const buildAllWorkerLanes = (
  rosters: CareWorkerRosterShape[],
  templateSelectionKey?: string
): GanttLane[] => {
  return rosters.map((roster) => ({
    id: roster.key,
    label: roster.workerName,
    entries: buildWorkerTimelineEntries(roster, templateSelectionKey),
  }));
};
