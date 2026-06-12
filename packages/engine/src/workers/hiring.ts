import { GameState, GameEvent, Worker } from '../types';
import { generateWorker } from './generator';

export const HIRE_COST = 1250;
// Reserve tonight, staffed tomorrow: advance orders are cheaper than the
// same-day walk-in rate, and the agency GUARANTEES day-one attendance.
// This is the planning payoff — read tomorrow's SKU lineup and weather,
// then order the bodies before you're short.
export const ADVANCE_HIRE_COST = 950;

// Request a worker from the agency. The agency honors your skill-mix request and,
// if the referral program is running, sends people in through someone they know
// (referred hires start a touch happier/steadier and are stickier).
// Reserve `count` workers for tomorrow's standup at the advance rate.
export function requestWorkers(state: GameState, count = 1): { state: GameState; events: GameEvent[] } {
  const cost = ADVANCE_HIRE_COST * count;
  if (count < 1 || state.cash < cost) return { state, events: [] };
  const pendingHires = state.pendingHires + count;
  const events: GameEvent[] = [{
    type: 'WORKERS_REQUESTED', tick: state.tick,
    payload: { count, pending: pendingHires, cost },
  }];
  return { state: { ...state, cash: state.cash - cost, pendingHires }, events };
}

// Morning arrivals: every advance-ordered worker walks in present and ready.
export function processArrivals(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.pendingHires <= 0) return { state, events: [] };
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < state.pendingHires; i++) {
    const newId = `w${s.nextWorkerId}`;
    const seed = s.tick * 9999 + s.nextWorkerId * 1337;
    const worker: Worker = { ...generateWorker(newId, seed, s.skillRequest), presentThisShift: true };
    events.push({
      type: 'WORKER_HIRED', tick: s.tick,
      payload: { workerId: newId, workerName: worker.name, referred: false, cost: 0, preordered: true },
    });
    s = { ...s, nextWorkerId: s.nextWorkerId + 1, workers: { ...s.workers, [newId]: worker } };
  }
  return { state: { ...s, pendingHires: 0 }, events };
}

export function hireWorker(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.cash < HIRE_COST) return { state, events: [] };

  // Monotonic id so a hire never collides with a living worker after a quit
  // (the old `w{count+1}` could clobber an existing worker once someone left).
  const newId = `w${state.nextWorkerId}`;
  const seed = state.tick * 9999 + state.nextWorkerId * 1337;

  let worker: Worker = generateWorker(newId, seed, state.skillRequest);

  if (state.programs.referral) {
    // A referral: name a current worker as the referrer and start them warmer.
    const existing = Object.keys(state.workers);
    const referrer = existing.length ? existing[seed % existing.length] : undefined;
    worker = {
      ...worker,
      referredBy: referrer,
      morale: Math.min(1, worker.morale + 0.08),
      reliability: Math.min(0.98, worker.reliability + 0.05),
    };
  }

  const events: GameEvent[] = [{
    type: 'WORKER_HIRED', tick: state.tick,
    payload: { workerId: newId, workerName: worker.name, referred: !!worker.referredBy, cost: HIRE_COST },
  }];

  return {
    state: {
      ...state,
      cash: state.cash - HIRE_COST,
      nextWorkerId: state.nextWorkerId + 1,
      workers: { ...state.workers, [newId]: worker },
    },
    events,
  };
}
