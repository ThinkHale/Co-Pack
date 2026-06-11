import { GameState, GameEvent } from '../types';
import { SUPERVISOR_SALARY_PER_SHIFT } from './supervisor';

// --- Facility overhead: the anti-coasting pressure ---
// Rent (plus the supervisor's salary, once hired) is charged every shift no
// matter who worked. Before this, a three-person single-line shop printed money
// forever and there was no reason to grow; now standing still has a carrying
// cost, and the way to outrun it is scale — more lines, better-paying clients.
// Rent grows gently with footprint so it pressures stagnation, not expansion.

export const FACILITY_RENT_BASE = 150;
export const FACILITY_RENT_PER_EXTRA_LINE = 75;

export function facilityRent(state: GameState): number {
  return FACILITY_RENT_BASE + FACILITY_RENT_PER_EXTRA_LINE * Math.max(0, state.lineCount - 1);
}

export function supervisorSalary(state: GameState): number {
  return state.hasSupervisor ? SUPERVISOR_SALARY_PER_SHIFT : 0;
}

// Total fixed cost charged at each shift settle, alongside payroll.
export function facilityOverhead(state: GameState): number {
  return facilityRent(state) + supervisorSalary(state);
}

export function processOverhead(state: GameState): { state: GameState; events: GameEvent[] } {
  const rent = facilityRent(state);
  const salary = supervisorSalary(state);
  const total = rent + salary;
  if (total <= 0) return { state, events: [] };

  const events: GameEvent[] = [{
    type: 'OVERHEAD', tick: state.tick,
    payload: { rent, supervisorSalary: salary, total },
  }];
  return { state: { ...state, cash: state.cash - total }, events };
}
