import { GameState, GameEvent, Line } from '../types';

// --- Staffing the lines (engine-owned, source of truth) ---
// Co-Pack is a daily-staffing sim: each morning the board is wiped and you assign
// whoever showed up. These helpers own all assignment mutations so the UI never
// hand-rolls line state, and so the shift boundary and "Repeat yesterday" share
// exactly one implementation.

const stationKey = (lineId: string, stationId: string) => `${lineId}::${stationId}`;

// Pull a worker off any station they hold, then seat them at the target station.
export function assignWorker(state: GameState, workerId: string, lineId: string, stationId: string): GameState {
  const lines: Record<string, Line> = Object.fromEntries(
    Object.entries(state.lines).map(([lid, l]) => [
      lid,
      { ...l, stations: l.stations.map(s => (s.assignedWorkerId === workerId ? { ...s, assignedWorkerId: undefined } : s)) },
    ])
  );
  lines[lineId] = {
    ...lines[lineId],
    stations: lines[lineId].stations.map(s => (s.id === stationId ? { ...s, assignedWorkerId: workerId } : s)),
  };
  return { ...state, lines };
}

export function unassignStation(state: GameState, lineId: string, stationId: string): GameState {
  return {
    ...state,
    lines: {
      ...state.lines,
      [lineId]: {
        ...state.lines[lineId],
        stations: state.lines[lineId].stations.map(s => (s.id === stationId ? { ...s, assignedWorkerId: undefined } : s)),
      },
    },
  };
}

// Snapshot who is standing where — captured at the shift boundary before the board
// is wiped, so "Repeat yesterday" can re-seat the crew that showed back up.
export function captureAssignments(state: GameState): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [lineId, line] of Object.entries(state.lines)) {
    for (const st of line.stations) {
      if (st.assignedWorkerId) map[stationKey(lineId, st.id)] = st.assignedWorkerId;
    }
  }
  return map;
}

// Empty every station — the morning reset.
export function clearAssignments(state: GameState): GameState {
  return {
    ...state,
    lines: Object.fromEntries(
      Object.entries(state.lines).map(([lid, l]) => [
        lid,
        { ...l, stations: l.stations.map(s => ({ ...s, assignedWorkerId: undefined })) },
      ])
    ),
  };
}

// "Repeat yesterday": re-seat everyone who is present today onto the station they
// held last shift. No-shows (and anyone who quit) are skipped, leaving their slots
// open for the player to backfill from the bench.
export function repeatStaffing(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  let seated = 0;
  for (const [key, workerId] of Object.entries(state.previousAssignments)) {
    const [lineId, stationId] = key.split('::');
    const worker = state.workers[workerId];
    if (!worker || !worker.presentThisShift) continue;
    if (!s.lines[lineId]) continue;
    s = assignWorker(s, workerId, lineId, stationId);
    seated++;
  }
  if (seated === 0) return { state, events: [] };
  return { state: s, events: [] };
}

// Whether "Repeat yesterday" would actually seat anyone (for enabling the button).
export function canRepeatStaffing(state: GameState): boolean {
  return Object.entries(state.previousAssignments).some(([, workerId]) => {
    const w = state.workers[workerId];
    return !!w && w.presentThisShift;
  });
}

// Begin the shift: release the morning hold so the clock runs again.
export function startShift(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!state.awaitingStaffing) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'SHIFT_START', tick: state.tick, payload: { day: state.day },
  }];
  return { state: { ...state, awaitingStaffing: false }, events };
}
