import { GameState, GameEvent, Worker } from '../types';

const MORALE_BASELINE = 0.65;   // where morale naturally settles over time
const MORALE_DRIFT = 0.02;      // per-shift pull toward baseline (recovery or cool-down)
const OVERTIME_FATIGUE = 0.05;  // morale lost per shift while overtime is on
const SHOUTOUT_BOOST = 0.08;    // morale gained by present crew from a recognition
const SHOUTOUT_COOLDOWN = 240;  // ticks (half a shift) before recognition recharges
const MORALE_MIN = 0.1;
const MORALE_MAX = 1;

const clamp = (v: number) => Math.max(MORALE_MIN, Math.min(MORALE_MAX, v));

/**
 * Runs at each shift boundary. Morale drifts toward a baseline (so neglected
 * crews cool off and recovered ones settle), and overtime burns morale on top.
 * This is what gives overtime its "borrow speed now, pay later" character.
 */
export function processMorale(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const workers: Record<string, Worker> = {};

  for (const [id, worker] of Object.entries(state.workers)) {
    let morale = worker.morale;

    // Natural drift toward the baseline.
    if (morale > MORALE_BASELINE) morale -= MORALE_DRIFT;
    else if (morale < MORALE_BASELINE) morale += MORALE_DRIFT;

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
