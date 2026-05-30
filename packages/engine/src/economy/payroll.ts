import { GameState, GameEvent } from '../types';
import { effectiveWage, programsPerShiftCost } from './staffing';

// You pay everyone on the roster each shift, bench or not — scaled by your pay
// policy — plus the cost of any standing programs. This is the spend pressure
// that makes "should I hire another body / pay up / run a program?" a real call.
export function totalPayroll(state: GameState): number {
  const wages = Object.values(state.workers)
    .reduce((sum, w) => sum + effectiveWage(w, state.payPolicy), 0);
  return wages + programsPerShiftCost(state);
}

export function processPayroll(state: GameState): { state: GameState; events: GameEvent[] } {
  const amount = totalPayroll(state);
  if (amount <= 0) return { state, events: [] };

  const events: GameEvent[] = [{
    type: 'PAYROLL', tick: state.tick,
    payload: { amount, headcount: Object.keys(state.workers).length },
  }];

  return { state: { ...state, cash: state.cash - amount }, events };
}
