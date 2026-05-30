import { GameState, GameEvent, Worker } from '../types';
import { generateWorker } from './generator';

export const HIRE_COST = 500;

// Request a worker from the agency. The agency honors your skill-mix request and,
// if the referral program is running, sends people in through someone they know
// (referred hires start a touch happier/steadier and are stickier).
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
