import { GameState, GameEvent, StaffingDay } from '../types';

// --- The Staffing Board ---
// The plant manager's real scorecard: each day the schedule calls for a number of
// staffed positions (every station on every active line), and you're graded on how
// many you actually fielded with people who showed up. Distinct from the order
// fill-rate (output) — this is LABOR COVERAGE. Target is 95% (the real-world
// minimum). Consequences stay soft for now: tracked, with a gentle reputation ding.

export const STAFFING_TARGET = 0.95;
const HISTORY_CAP = 30;
const MISS_REP_PENALTY = 0.02; // gentle — "track now, bite later"

// Positions the schedule calls for today = every station on every active line.
export function requiredPositions(state: GameState): number {
  return Object.values(state.lines)
    .filter(l => l.active)
    .reduce((sum, l) => sum + l.stations.length, 0);
}

// Positions actually covered right now by an assigned worker who showed up.
export function coveredPositions(state: GameState): number {
  let covered = 0;
  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;
    for (const station of line.stations) {
      const w = station.assignedWorkerId ? state.workers[station.assignedWorkerId] : undefined;
      if (w && w.presentThisShift) covered++;
    }
  }
  return covered;
}

export function staffingFill(state: GameState): number {
  const required = requiredPositions(state);
  if (required === 0) return 1;
  return Math.min(1, coveredPositions(state) / required);
}

// Rolling average fill across the recorded history (the board's headline number).
export function rollingStaffingFill(state: GameState): number {
  if (state.staffingHistory.length === 0) return staffingFill(state);
  const sum = state.staffingHistory.reduce((s, d) => s + d.fill, 0);
  return sum / state.staffingHistory.length;
}

/**
 * Snapshot the day's labor coverage into history. Called at the day boundary,
 * after attendance is rolled, so it reflects who actually showed. Sustained misses
 * below the 95% target nudge client reputation down (gently, for now).
 */
export function recordStaffingDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const required = requiredPositions(state);
  const covered = coveredPositions(state);
  const fill = required === 0 ? 1 : Math.min(1, covered / required);

  const entry: StaffingDay = { day: state.day, required, covered, fill };
  const staffingHistory = [...state.staffingHistory, entry].slice(-HISTORY_CAP);

  const events: GameEvent[] = [{
    type: 'STAFFING_REPORT', tick: state.tick,
    payload: { day: state.day, required, covered, fill, target: STAFFING_TARGET, met: fill >= STAFFING_TARGET },
  }];

  let clients = state.clients;
  if (fill < STAFFING_TARGET && required > 0) {
    const firstId = Object.keys(clients)[0];
    if (firstId) {
      const c = clients[firstId];
      clients = { ...clients, [firstId]: { ...c, reputation: Math.max(0.05, c.reputation - MISS_REP_PENALTY) } };
    }
  }

  return { state: { ...state, staffingHistory, clients }, events };
}
