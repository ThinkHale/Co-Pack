import { GameState, GameEvent, Worker } from '../types';
import { effectiveWage, programsPerShiftCost } from './staffing';
import { assignedWorkerIds } from '../lines/assignments';

// The set of workers actually on the clock: present AND seated at a station. A
// no-show isn't paid, and neither is someone left on the bench — you pay for
// hours worked on the floor, the way temp labor actually bills.
export function workingWorkers(state: GameState): Worker[] {
  const assigned = assignedWorkerIds(state);
  return Object.values(state.workers).filter(w => w.presentThisShift && assigned.has(w.id));
}

// Payroll = wages for the crew that actually worked + any standing program costs.
// This is the spend pressure that makes "who do I deploy today?" a real call.
export function totalPayroll(state: GameState): number {
  const wages = workingWorkers(state).reduce((sum, w) => sum + effectiveWage(w, state.payPolicy), 0);
  return wages + programsPerShiftCost(state);
}

export function processPayroll(state: GameState): { state: GameState; events: GameEvent[] } {
  const amount = totalPayroll(state);
  if (amount <= 0) return { state, events: [] };
  const headcount = workingWorkers(state).length;

  const events: GameEvent[] = [{
    type: 'PAYROLL', tick: state.tick,
    payload: { amount, headcount },
  }];

  return { state: { ...state, cash: state.cash - amount }, events };
}
