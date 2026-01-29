export interface TimelineEntry {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  serviceUserName?: string | null;
  callTypeLabel?: string | null;
  isTimeCritical?: boolean;
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
  serviceUserAddress?: string | null;
  callTypeLabel: string;
  requirementStartMinutes: number | null;
  durationMinutes: number | null;
  totalCalls: number;
  isTimeCritical: boolean;
}

interface CareWorkerRosterShape {
  key: string;
  workerName: string;
  uniqueServiceUsers: number;
  callGroups: WorkerCallGroupShape[];
  shiftBarsCount: number;
}

const fallbackDurationMinutes = 30;

export const buildWorkerTimelineEntries = (roster: CareWorkerRosterShape | null): TimelineEntry[] => {
  if (!roster) return [];
  return roster.callGroups
    .filter((group) => group.requirementStartMinutes !== null)
    .map((group) => ({
      id: group.key,
      title: group.serviceUserName || group.callTypeLabel,
      startMinutes: group.requirementStartMinutes as number,
      durationMinutes: group.durationMinutes ?? fallbackDurationMinutes,
      serviceUserName: group.serviceUserName,
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

export const buildWorkerLane = (roster: CareWorkerRosterShape | null): GanttLane | null => {
  if (!roster) return null;
  return {
    id: roster.key,
    label: roster.workerName,
    entries: buildWorkerTimelineEntries(roster),
  };
};

export const buildAllWorkerLanes = (rosters: CareWorkerRosterShape[]): GanttLane[] => {
  return rosters.map((roster) => ({
    id: roster.key,
    label: roster.workerName,
    entries: buildWorkerTimelineEntries(roster),
  }));
};
