import { GameState, GameEvent } from '../types';
import { SUPERVISOR_SALARY_PER_SHIFT } from './supervisor';
import { nightShiftActive, NIGHT_OVERHEAD } from './nightshift';

// --- Facility overhead: the anti-coasting pressure ---
// Rent (plus the supervisor's salary, once hired) is charged every shift no
// matter who worked. Before this, a three-person single-line shop printed money
// forever and there was no reason to grow; now standing still has a carrying
// cost, and the way to outrun it is scale — more lines, better-paying clients.
// Rent grows gently with footprint so it pressures stagnation, not expansion.

export const FACILITY_RENT_BASE = 375;
export const FACILITY_RENT_PER_EXTRA_LINE = 190;

export function facilityRent(state: GameState): number {
  return FACILITY_RENT_BASE + FACILITY_RENT_PER_EXTRA_LINE * Math.max(0, state.lineCount - 1);
}

export function supervisorSalary(state: GameState): number {
  return state.hasSupervisor ? SUPERVISOR_SALARY_PER_SHIFT : 0;
}

// Total fixed cost charged at each shift settle, alongside payroll. Running
// nights keeps the lights, dock, and security on around the clock.
export function facilityOverhead(state: GameState): number {
  return facilityRent(state) + supervisorSalary(state)
    + (nightShiftActive(state) ? NIGHT_OVERHEAD : 0);
}

export function processOverhead(state: GameState): { state: GameState; events: GameEvent[] } {
  const rent = facilityRent(state);
  const salary = supervisorSalary(state);
  const total = facilityOverhead(state);
  if (total <= 0) return { state, events: [] };

  const events: GameEvent[] = [{
    type: 'OVERHEAD', tick: state.tick,
    payload: { rent, supervisorSalary: salary, night: nightShiftActive(state) ? NIGHT_OVERHEAD : 0, total },
  }];
  return { state: { ...state, cash: state.cash - total }, events };
}
