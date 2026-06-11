import { GameState, GameEvent } from '../types';
import { totalPayroll } from './payroll';

// --- Solvency: the stakes ---
// Cash used to be able to fall forever with no consequence. Now there's a floor.
// A short overdraft is survivable (a line of credit), but stay underwater past the
// bankruptcy floor and the plant shuts down — the run is over. A one-time warning
// fires as you cross into the red so the player feels the pressure before the wall.

export const BANKRUPTCY_FLOOR = -10000;

// We're "in the red" once cash can't cover the next payroll run.
export function cashIsTight(state: GameState): boolean {
  return state.cash < totalPayroll(state);
}

export function bankruptcyRunway(state: GameState): number {
  return state.cash - BANKRUPTCY_FLOOR;
}

/**
 * Checked every tick. Emits a single CASH_WARNING when the player first slips into
 * the red, and trips GAME_OVER if cash sinks below the bankruptcy floor. The flag
 * re-arms once they climb back out, so the warning is meaningful, not spammy.
 */
export function checkSolvency(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.gameOver) return { state, events: [] };

  if (state.cash < BANKRUPTCY_FLOOR) {
    return {
      state: { ...state, gameOver: true },
      events: [{
        type: 'GAME_OVER', tick: state.tick,
        payload: { reason: 'bankruptcy', cash: state.cash, day: state.day },
      }],
    };
  }

  // Crossing into the red (first time on this slide): warn once.
  if (state.cash < 0 && !state.cashWarned) {
    return {
      state: { ...state, cashWarned: true },
      events: [{
        type: 'CASH_WARNING', tick: state.tick,
        payload: { cash: state.cash, floor: BANKRUPTCY_FLOOR },
      }],
    };
  }

  // Climbed back into the black: re-arm the warning for next time.
  if (state.cash >= 0 && state.cashWarned) {
    return { state: { ...state, cashWarned: false }, events: [] };
  }

  return { state, events: [] };
}
