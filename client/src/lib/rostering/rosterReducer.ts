import type { TimelineEntry, GanttLane } from "./rosterModel";

// ============================================================================
// State Types
// ============================================================================

export interface RosterState {
  /** Time overrides: entryId → new startMinutes */
  timeOverrides: Record<string, number>;
  /** Lane reassignments: entryId → new laneId */
  laneOverrides: Record<string, string>;
  /** Selected entry IDs (for bulk operations) */
  selectedEntryIds: Set<string>;
  /** Currently focused entry (single selection) */
  focusedEntryId: string | null;
}

export interface RosterHistoryState {
  past: RosterState[];
  present: RosterState;
  future: RosterState[];
}

// ============================================================================
// Actions
// ============================================================================

export type RosterAction =
  | { type: "MOVE_ENTRY"; entryId: string; startMinutes: number }
  | { type: "REASSIGN_ENTRY"; entryId: string; targetLaneId: string }
  | { type: "MOVE_AND_REASSIGN_ENTRY"; entryId: string; startMinutes: number; targetLaneId: string }
  | { type: "BULK_MOVE_ENTRIES"; moves: Array<{ entryId: string; startMinutes: number }> }
  | { type: "BULK_REASSIGN_ENTRIES"; reassignments: Array<{ entryId: string; targetLaneId: string }> }
  | { type: "BULK_DELETE_ENTRIES"; entryIds: string[] }
  | { type: "SELECT_ENTRY"; entryId: string; addToSelection?: boolean }
  | { type: "TOGGLE_ENTRY_SELECTION"; entryId: string }
  | { type: "SELECT_RANGE"; fromEntryId: string; toEntryId: string; orderedEntryIds: string[] }
  | { type: "DESELECT_ENTRY"; entryId: string }
  | { type: "SELECT_ALL_IN_LANE"; laneId: string; entries: TimelineEntry[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "APPLY_OPTIMIZATION"; timeOverrides: Record<string, number>; laneOverrides?: Record<string, string> }
  | { type: "RESET" }
  | { type: "UNDO" }
  | { type: "REDO" };

// ============================================================================
// Initial State
// ============================================================================

export const createInitialRosterState = (): RosterState => ({
  timeOverrides: {},
  laneOverrides: {},
  selectedEntryIds: new Set(),
  focusedEntryId: null,
});

export const createInitialHistoryState = (): RosterHistoryState => ({
  past: [],
  present: createInitialRosterState(),
  future: [],
});

// ============================================================================
// History Limits
// ============================================================================

const MAX_HISTORY_LENGTH = 50;

// ============================================================================
// Core Reducer (without history)
// ============================================================================

const rosterCoreReducer = (state: RosterState, action: RosterAction): RosterState => {
  switch (action.type) {
    case "MOVE_ENTRY":
      return {
        ...state,
        timeOverrides: {
          ...state.timeOverrides,
          [action.entryId]: action.startMinutes,
        },
      };

    case "REASSIGN_ENTRY":
      return {
        ...state,
        laneOverrides: {
          ...state.laneOverrides,
          [action.entryId]: action.targetLaneId,
        },
      };

    case "MOVE_AND_REASSIGN_ENTRY":
      return {
        ...state,
        timeOverrides: {
          ...state.timeOverrides,
          [action.entryId]: action.startMinutes,
        },
        laneOverrides: {
          ...state.laneOverrides,
          [action.entryId]: action.targetLaneId,
        },
      };

    case "BULK_MOVE_ENTRIES": {
      const newTimeOverrides = { ...state.timeOverrides };
      action.moves.forEach(({ entryId, startMinutes }) => {
        newTimeOverrides[entryId] = startMinutes;
      });
      return { ...state, timeOverrides: newTimeOverrides };
    }

    case "BULK_REASSIGN_ENTRIES": {
      const newLaneOverrides = { ...state.laneOverrides };
      action.reassignments.forEach(({ entryId, targetLaneId }) => {
        newLaneOverrides[entryId] = targetLaneId;
      });
      return { ...state, laneOverrides: newLaneOverrides };
    }

    case "BULK_DELETE_ENTRIES": {
      // "Delete" by moving entries off-screen (we don't actually remove data)
      // This sets a special marker that can be filtered in UI
      const newTimeOverrides = { ...state.timeOverrides };
      action.entryIds.forEach((entryId) => {
        // Mark as "deleted" by setting to -1 (filtered out in display)
        newTimeOverrides[entryId] = -9999;
      });
      // Clear selection of deleted entries
      const newSelected = new Set(state.selectedEntryIds);
      action.entryIds.forEach((id) => newSelected.delete(id));
      return {
        ...state,
        timeOverrides: newTimeOverrides,
        selectedEntryIds: newSelected,
        focusedEntryId: action.entryIds.includes(state.focusedEntryId ?? "") ? null : state.focusedEntryId,
      };
    }

    case "SELECT_ENTRY": {
      const newSelected = action.addToSelection
        ? new Set(state.selectedEntryIds)
        : new Set<string>();
      newSelected.add(action.entryId);
      return {
        ...state,
        selectedEntryIds: newSelected,
        focusedEntryId: action.entryId,
      };
    }

    case "TOGGLE_ENTRY_SELECTION": {
      const newSelected = new Set(state.selectedEntryIds);
      if (newSelected.has(action.entryId)) {
        newSelected.delete(action.entryId);
      } else {
        newSelected.add(action.entryId);
      }
      return {
        ...state,
        selectedEntryIds: newSelected,
        focusedEntryId: action.entryId,
      };
    }

    case "SELECT_RANGE": {
      // Select all entries between fromEntryId and toEntryId (inclusive)
      const { fromEntryId, toEntryId, orderedEntryIds } = action;
      const fromIdx = orderedEntryIds.indexOf(fromEntryId);
      const toIdx = orderedEntryIds.indexOf(toEntryId);
      
      if (fromIdx === -1 || toIdx === -1) {
        // If either entry not found, just select the target
        const newSelected = new Set(state.selectedEntryIds);
        newSelected.add(toEntryId);
        return { ...state, selectedEntryIds: newSelected, focusedEntryId: toEntryId };
      }

      const startIdx = Math.min(fromIdx, toIdx);
      const endIdx = Math.max(fromIdx, toIdx);
      const rangeIds = orderedEntryIds.slice(startIdx, endIdx + 1);
      
      const newSelected = new Set(state.selectedEntryIds);
      rangeIds.forEach((id) => newSelected.add(id));
      
      return {
        ...state,
        selectedEntryIds: newSelected,
        focusedEntryId: toEntryId,
      };
    }

    case "DESELECT_ENTRY": {
      const newSelected = new Set(state.selectedEntryIds);
      newSelected.delete(action.entryId);
      return {
        ...state,
        selectedEntryIds: newSelected,
        focusedEntryId: state.focusedEntryId === action.entryId ? null : state.focusedEntryId,
      };
    }

    case "SELECT_ALL_IN_LANE": {
      const newSelected = new Set(state.selectedEntryIds);
      action.entries.forEach((entry) => newSelected.add(entry.id));
      return {
        ...state,
        selectedEntryIds: newSelected,
      };
    }

    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedEntryIds: new Set(),
        focusedEntryId: null,
      };

    case "APPLY_OPTIMIZATION":
      return {
        ...state,
        timeOverrides: { ...state.timeOverrides, ...action.timeOverrides },
        laneOverrides: action.laneOverrides
          ? { ...state.laneOverrides, ...action.laneOverrides }
          : state.laneOverrides,
      };

    case "RESET":
      return createInitialRosterState();

    // UNDO/REDO are handled by the history reducer wrapper
    case "UNDO":
    case "REDO":
      return state;

    default:
      return state;
  }
};

// ============================================================================
// History-Aware Reducer
// ============================================================================

/**
 * Actions that should NOT be recorded in history (selection changes, etc.)
 */
const NON_HISTORY_ACTIONS: RosterAction["type"][] = [
  "SELECT_ENTRY",
  "TOGGLE_ENTRY_SELECTION",
  "SELECT_RANGE",
  "DESELECT_ENTRY",
  "SELECT_ALL_IN_LANE",
  "CLEAR_SELECTION",
];

export const rosterHistoryReducer = (
  state: RosterHistoryState,
  action: RosterAction
): RosterHistoryState => {
  switch (action.type) {
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    case "RESET":
      return createInitialHistoryState();

    default: {
      const newPresent = rosterCoreReducer(state.present, action);

      // If state didn't change, return same object
      if (newPresent === state.present) return state;

      // Non-history actions don't create undo points
      if (NON_HISTORY_ACTIONS.includes(action.type)) {
        return { ...state, present: newPresent };
      }

      // Add to history, respecting max length
      const newPast = [...state.past, state.present].slice(-MAX_HISTORY_LENGTH);
      return {
        past: newPast,
        present: newPresent,
        future: [], // Clear redo stack on new action
      };
    }
  }
};

// ============================================================================
// Selectors
// ============================================================================

export const canUndo = (state: RosterHistoryState): boolean => state.past.length > 0;
export const canRedo = (state: RosterHistoryState): boolean => state.future.length > 0;
export const getUndoCount = (state: RosterHistoryState): number => state.past.length;
export const getRedoCount = (state: RosterHistoryState): number => state.future.length;

/**
 * Apply all overrides to lanes, returning new lane array with entries moved
 */
export const applyOverridesToLanes = (
  baseLanes: GanttLane[],
  state: RosterState
): GanttLane[] => {
  const { timeOverrides, laneOverrides } = state;

  // If no overrides, return original
  if (Object.keys(timeOverrides).length === 0 && Object.keys(laneOverrides).length === 0) {
    return baseLanes;
  }

  // Build entry lookup
  const entryLookup = new Map<string, TimelineEntry>();
  baseLanes.forEach((lane) => {
    lane.entries.forEach((entry) => entryLookup.set(entry.id, entry));
  });

  // Apply time overrides
  const withTimeOverrides = baseLanes.map((lane) => ({
    ...lane,
    entries: lane.entries.map((entry) => {
      const override = timeOverrides[entry.id];
      return typeof override === "number" ? { ...entry, startMinutes: override } : entry;
    }),
  }));

  // If no lane overrides, return time-adjusted lanes
  if (Object.keys(laneOverrides).length === 0) {
    return withTimeOverrides;
  }

  // Apply lane overrides: remove from original, add to target
  const nextLanes = withTimeOverrides.map((lane) => ({
    ...lane,
    entries: lane.entries.filter((entry) => laneOverrides[entry.id] === undefined),
  }));

  Object.entries(laneOverrides).forEach(([entryId, targetLaneId]) => {
    const entry = entryLookup.get(entryId);
    if (!entry) return;

    // Apply time override if exists
    const timeOverride = timeOverrides[entryId];
    const adjustedEntry = typeof timeOverride === "number" ? { ...entry, startMinutes: timeOverride } : entry;

    const targetLane = nextLanes.find((lane) => lane.id === targetLaneId);
    if (targetLane) {
      targetLane.entries = [...targetLane.entries, adjustedEntry];
    }
  });

  return nextLanes;
};

/**
 * Check if an entry is selected
 */
export const isEntrySelected = (state: RosterState, entryId: string): boolean => {
  return state.selectedEntryIds.has(entryId);
};

/**
 * Get count of selected entries
 */
export const getSelectionCount = (state: RosterState): number => {
  return state.selectedEntryIds.size;
};
