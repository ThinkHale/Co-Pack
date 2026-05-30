import { GameState, GameEvent } from '../types';

// You pay everyone on the roster each shift, bench or not. This is the spend
// pressure that makes "should I hire another body?" an actual decision.
export function totalPayroll(state: GameState): number {
  return Object.values(state.workers).reduce((sum, w) => sum + w.wage, 0);
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
