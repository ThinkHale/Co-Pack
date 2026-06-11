import { GameState, GameEvent, Line } from '../types';
import { hasUnlock } from '../progression/unlocks';

// --- Staffing the lines (engine-owned, source of truth) ---
// Co-Pack is a daily-staffing sim: each morning the board is wiped and you assign
// whoever showed up. These helpers own all assignment mutations so the UI never
// hand-rolls line state, and so the shift boundary and "Repeat yesterday" share
// exactly one implementation.

export const SUPPORT_STATION_ID = 'support';
export const MAX_SUPPORT_WORKERS_PER_LINE = 1;

const stationKey = (lineId: string, stationId: string) => `${lineId}::${stationId}`;

function removeWorkerFromLine(line: Line, workerId: string): Line {
  return {
    ...line,
    supportWorkerIds: (line.supportWorkerIds ?? []).filter(id => id !== workerId),
    stations: line.stations.map(s =>
      s.assignedWorkerId === workerId ? { ...s, assignedWorkerId: undefined } : s
    ),
  };
}

export function assignedWorkerIdsForLine(line: Line): string[] {
  const ids = line.stations
    .map(station => station.assignedWorkerId)
    .filter((id): id is string => !!id);
  return [...ids, ...(line.supportWorkerIds ?? [])];
}

export function assignedWorkerIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const line of Object.values(state.lines)) {
    for (const workerId of assignedWorkerIdsForLine(line)) ids.add(workerId);
  }
  return ids;
}

// Pull a worker off any slot they hold, then seat them at the target station/helper slot.
export function assignWorker(state: GameState, workerId: string, lineId: string, stationId: string): GameState {
  // Helper slots are a purchased capability (the Floater program).
  if (stationId === SUPPORT_STATION_ID && !hasUnlock(state, 'support')) return state;
  const lines: Record<string, Line> = Object.fromEntries(
    Object.entries(state.lines).map(([lid, l]) => [
      lid,
      removeWorkerFromLine(l, workerId),
    ])
  );

  const line = lines[lineId];
  if (!line) return { ...state, lines };

  if (stationId === SUPPORT_STATION_ID) {
    const supportWorkerIds = [workerId, ...(line.supportWorkerIds ?? [])]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, MAX_SUPPORT_WORKERS_PER_LINE);
    lines[lineId] = { ...line, supportWorkerIds };
    return { ...state, lines };
  }

  lines[lineId] = {
    ...line,
    stations: line.stations.map(s => (s.id === stationId ? { ...s, assignedWorkerId: workerId } : s)),
  };
  return { ...state, lines };
}

export function unassignStation(state: GameState, lineId: string, stationId: string): GameState {
  const line = state.lines[lineId];
  if (!line) return state;
  if (stationId === SUPPORT_STATION_ID) {
    return {
      ...state,
      lines: {
        ...state.lines,
        [lineId]: { ...line, supportWorkerIds: [] },
      },
    };
  }

  return {
    ...state,
    lines: {
      ...state.lines,
      [lineId]: {
        ...line,
        stations: line.stations.map(s => (s.id === stationId ? { ...s, assignedWorkerId: undefined } : s)),
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
    for (const workerId of line.supportWorkerIds ?? []) {
      map[stationKey(lineId, SUPPORT_STATION_ID)] = workerId;
    }
  }
  return map;
}

// Empty every station/helper slot — the morning reset.
export function clearAssignments(state: GameState): GameState {
  return {
    ...state,
    lines: Object.fromEntries(
      Object.entries(state.lines).map(([lid, l]) => [
        lid,
        { ...l, supportWorkerIds: [], stations: l.stations.map(s => ({ ...s, assignedWorkerId: undefined })) },
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

// Supervisor auto-staffing: seat yesterday's lineup first (familiar stations),
// then fill any still-open station from the present bench, best station
// proficiency first. Deliberately decent-not-optimal — it never hires, trains,
// or uses support slots, so a hands-on morning still beats the supervisor.
export function autoAssignCrew(state: GameState): GameState {
  let s = repeatStaffing(state).state;
  const seated = assignedWorkerIds(s);
  const bench = Object.values(s.workers)
    .filter(w => w.presentThisShift && !seated.has(w.id))
    // Stable order so auto-staffing stays deterministic regardless of object key order.
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const lineId of Object.keys(s.lines)) {
    if (!s.lines[lineId].active) continue;
    for (const stationId of s.lines[lineId].stations.map(st => st.id)) {
      if (s.lines[lineId].stations.find(st => st.id === stationId)?.assignedWorkerId) continue;
      if (bench.length === 0) return s;
      let bestIdx = 0;
      let bestScore = -1;
      bench.forEach((w, i) => {
        const prof = w.skills.find(sk => sk.stationId === stationId)?.proficiency ?? 0;
        if (prof > bestScore) { bestScore = prof; bestIdx = i; }
      });
      const [worker] = bench.splice(bestIdx, 1);
      s = assignWorker(s, worker.id, lineId, stationId);
    }
  }
  return s;
}

// Begin the shift: release the morning hold so the clock runs again.
export function startShift(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!state.awaitingStaffing) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'SHIFT_START', tick: state.tick, payload: { day: state.day },
  }];
  return { state: { ...state, awaitingStaffing: false }, events };
}
