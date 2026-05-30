import { GameState, GameEvent, Worker } from '../types';
import { LEAD_MORALE_BONUS } from '../economy/frontoffice';
import { lineMoraleDelta } from './traits';

const MORALE_DRIFT = 0.02;      // per-shift pull toward the worker's personal set-point
const OVERTIME_FATIGUE = 0.05;  // morale lost per shift while overtime is on
const SHOUTOUT_BOOST = 0.08;    // morale gained by present crew from a recognition
const SHOUTOUT_COOLDOWN = 240;  // ticks (half a shift) before recognition recharges
const MORALE_MIN = 0.1;
const MORALE_MAX = 1;

const clamp = (v: number) => Math.max(MORALE_MIN, Math.min(MORALE_MAX, v));

// Morale's breakdown is more honest than its average: a crew of two who love the
// work and two you can't please reads as a bland mid-average otherwise.
export function moraleBreakdown(workers: Record<string, Worker>): {
  thriving: number; steady: number; struggling: number;
} {
  let thriving = 0, steady = 0, struggling = 0;
  for (const w of Object.values(workers)) {
    if (w.morale >= 0.7) thriving++;
    else if (w.morale < 0.45) struggling++;
    else steady++;
  }
  return { thriving, steady, struggling };
}

/**
 * Runs at each shift boundary. Morale drifts toward each worker's own disposition
 * (their personal set-point) — so the chronically hard-to-please slide back down
 * and the naturally upbeat recover on their own — and overtime burns morale on top.
 */
export function processMorale(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const workers: Record<string, Worker> = {};

  // Which workers are on a line that has a lead? A good lead lifts the room.
  const ledWorkerIds = new Set<string>();
  // And what's the trait morale swing on each line (joker lifts, pessimist drags)?
  const lineTraitMorale: Record<string, number> = {};
  for (const [lineId, line] of Object.entries(state.lines)) {
    if (line.leadId) {
      for (const station of line.stations) {
        if (station.assignedWorkerId) ledWorkerIds.add(station.assignedWorkerId);
      }
    }
    const crew = line.stations
      .map(s => s.assignedWorkerId && state.workers[s.assignedWorkerId])
      .filter((w): w is Worker => !!w && w.presentThisShift);
    lineTraitMorale[lineId] = lineMoraleDelta(crew);
  }
  // Map each assigned worker to their line's trait morale swing.
  const workerLineMorale: Record<string, number> = {};
  for (const [lineId, line] of Object.entries(state.lines)) {
    for (const station of line.stations) {
      if (station.assignedWorkerId) workerLineMorale[station.assignedWorkerId] = lineTraitMorale[lineId];
    }
  }

  for (const [id, worker] of Object.entries(state.workers)) {
    let morale = worker.morale;
    const target = worker.disposition;

    // Drift toward this worker's set-point (snap if within one step).
    if (Math.abs(morale - target) <= MORALE_DRIFT) morale = target;
    else morale += Math.sign(target - morale) * MORALE_DRIFT;

    // A lead on the line lifts the crew (the lead themselves doesn't self-boost).
    if (ledWorkerIds.has(id) && !worker.isLead && worker.presentThisShift) {
      morale += LEAD_MORALE_BONUS;
    }

    // Linemate traits (joker, mentor, bossy, pessimist) move morale for the crew.
    if (worker.presentThisShift && workerLineMorale[id]) {
      morale += workerLineMorale[id];
    }

    // Overtime fatigue stacks on anyone who actually worked the shift.
    if (state.overtime && worker.presentThisShift) {
      morale -= OVERTIME_FATIGUE;
    }

    workers[id] = { ...worker, morale: clamp(morale) };
  }

  if (state.overtime) {
    events.push({
      type: 'MORALE_SHIFT', tick: state.tick,
      payload: { workerName: 'Crew', delta: -OVERTIME_FATIGUE, cause: 'overtime fatigue' },
    });
  }

  return { state: { ...state, workers }, events };
}

/**
 * The recognition action. Free, on a cooldown, boosts the morale of everyone
 * currently on the floor. Recognition is cheap and it works — that's the point.
 */
export function applyShoutout(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.tick < state.shoutoutReadyTick) {
    return { state, events: [] };
  }

  const workers: Record<string, Worker> = {};
  let boosted = 0;
  for (const [id, worker] of Object.entries(state.workers)) {
    if (worker.presentThisShift) {
      workers[id] = { ...worker, morale: clamp(worker.morale + SHOUTOUT_BOOST) };
      boosted++;
    } else {
      workers[id] = worker;
    }
  }

  if (boosted === 0) {
    return { state, events: [] };
  }

  const events: GameEvent[] = [{
    type: 'MORALE_SHIFT', tick: state.tick,
    payload: { workerName: 'Crew', delta: SHOUTOUT_BOOST, cause: `recognition (${boosted})` },
  }];

  return {
    state: { ...state, workers, shoutoutReadyTick: state.tick + SHOUTOUT_COOLDOWN },
    events,
  };
}

export function shoutoutReady(state: GameState): boolean {
  return state.tick >= state.shoutoutReadyTick;
}

export { SHOUTOUT_COOLDOWN };
