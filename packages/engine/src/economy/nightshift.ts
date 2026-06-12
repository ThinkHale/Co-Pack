import { GameState, GameEvent } from '../types';
import { hasUnlock } from '../progression/unlocks';

// --- Second shift (nights): the late-game throughput lever ---
// Once licensed (a $20k unlock that requires a supervisor — someone has to run
// nights), the plant can run a night crew: every line keeps moving after hours
// for +55% output. The catch is the running cost: the night crew bills 80% of
// your day payroll on top of it, plus extra utilities/overhead every shift.
// That math is a LOSS for a small, low-margin shop and a money printer for an
// automated multi-line plant on premium clients — which is exactly what makes
// it a late-game decision instead of an always-on button.

export const NIGHT_OUTPUT_BONUS = 0.55;   // +55% line output while nights run
export const NIGHT_LABOR_RATE = 0.8;      // night crew bills 80% of day payroll
export const NIGHT_OVERHEAD = 500;        // utilities/security/maintenance per shift

export function nightShiftActive(state: GameState): boolean {
  return hasUnlock(state, 'night_shift') && state.nightShift;
}

export function toggleNightShift(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!hasUnlock(state, 'night_shift')) return { state, events: [] };
  const nightShift = !state.nightShift;
  return {
    state: { ...state, nightShift },
    events: [{ type: 'NIGHT_SHIFT_TOGGLED', tick: state.tick, payload: { nightShift } }],
  };
}
