import { GameState, GameEvent } from '../types';

// --- Floor Supervisor: the idle unlock ---
// Until this hire, Co-Pack is a hands-on sim: the clock holds at every shift
// boundary while the player runs the morning standup. Hiring a supervisor is the
// moment it becomes a true idle game — they roll the standup automatically
// (seat yesterday's lineup, backfill open stations by best skill, make the safe
// call on floor decisions), so shifts keep turning unattended, including through
// offline catch-up. The salary is the standing price of that freedom, and a
// hands-on morning still out-manages the supervisor (no helpers, no hires).

export const SUPERVISOR_COST = 10000;
export const SUPERVISOR_SALARY_PER_SHIFT = 300;
// How long the supervisor leaves a floor decision on the player's desk before
// making the safe call themselves (auto-shift mode only).
export const SUPERVISOR_CHALLENGE_GRACE_TICKS = 30;

export function canHireSupervisor(state: GameState): boolean {
  return !state.hasSupervisor && state.cash >= SUPERVISOR_COST;
}

// True when the supervisor is running the floor: shift boundaries roll on
// their own instead of holding for the morning standup.
export function autoShiftActive(state: GameState): boolean {
  return state.hasSupervisor && state.autoShift;
}

export function hireSupervisor(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!canHireSupervisor(state)) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'SUPERVISOR_HIRED', tick: state.tick,
    payload: { cost: SUPERVISOR_COST, salary: SUPERVISOR_SALARY_PER_SHIFT },
  }];
  // Auto-shift turns on with the hire — that's what the player paid for.
  return {
    state: { ...state, cash: state.cash - SUPERVISOR_COST, hasSupervisor: true, autoShift: true },
    events,
  };
}

export function setAutoShift(state: GameState, on: boolean): { state: GameState; events: GameEvent[] } {
  if (!state.hasSupervisor || state.autoShift === on) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'AUTO_SHIFT_TOGGLED', tick: state.tick, payload: { autoShift: on },
  }];
  return { state: { ...state, autoShift: on }, events };
}
