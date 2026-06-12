import { GameState, GameEvent } from '../types';

// --- Floor Supervisor: the idle unlock ---
// Until this hire, Co-Pack is a hands-on sim: the clock holds at every shift
// boundary while the player runs the morning standup. The supervisor's job is
// to keep the plant running WHEN THE PLAYER ISN'T THERE: during offline
// catch-up they roll every standup automatically (seat yesterday's lineup,
// backfill open stations by best skill, make the safe call on floor decisions).
// While the player is actively playing, hiring them changes nothing — the
// morning standup still holds for the player unless they explicitly flip
// Auto-shift on (for watching the plant run hands-free). Buying help must
// never take the controls away. The salary is the standing price of the
// coverage, and a hands-on morning still out-manages the supervisor (no
// helpers, no hires).

export const SUPERVISOR_COST = 10000;
export const SUPERVISOR_SALARY_PER_SHIFT = 300;
// How long the supervisor leaves a floor decision on the player's desk before
// making the safe call themselves (only while they're running the floor).
export const SUPERVISOR_CHALLENGE_GRACE_TICKS = 30;

export function canHireSupervisor(state: GameState): boolean {
  return !state.hasSupervisor && state.cash >= SUPERVISOR_COST;
}

// Whether the supervisor is running the floor for this tick. Unattended time
// (offline catch-up) is always theirs once hired; live play is theirs only if
// the player explicitly opted into Auto-shift.
export function supervisorOnDuty(state: GameState, unattended = false): boolean {
  return state.hasSupervisor && (unattended || state.autoShift);
}

export function hireSupervisor(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!canHireSupervisor(state)) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'SUPERVISOR_HIRED', tick: state.tick,
    payload: { cost: SUPERVISOR_COST, salary: SUPERVISOR_SALARY_PER_SHIFT },
  }];
  // Deliberately does NOT enable autoShift: the supervisor covers your absence
  // from day one, but never starts playing the game in front of you.
  return {
    state: { ...state, cash: state.cash - SUPERVISOR_COST, hasSupervisor: true },
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
