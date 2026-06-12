import { GameState, GameEvent, Worker } from '../types';
import { seededRandom, hashString } from '../utils/random';
import { dayAttendanceModifier, dayCondition } from '../events/conditions';
import { payAttendanceBonus, attendanceProgramBonus } from '../economy/staffing';
import { workerAttendanceMod } from './traits';

/**
 * Expected turnout for a future day (default: tomorrow) — the sum of each
 * roster worker's show-up probability under that day's forecast condition,
 * the current pay policy, and any standing programs. Powers the planning
 * panel's "you'll probably be short" warning. Advance-ordered arrivals are
 * guaranteed, so add state.pendingHires on top of this.
 */
export function expectedAttendance(state: GameState, dayOffset = 1): number {
  const condition = dayCondition(state.day + dayOffset);
  const base = condition.modifier + attendanceProgramBonus(state);
  return Object.values(state.workers).reduce((sum, worker) => {
    const mod = base + payAttendanceBonus(worker, state.payPolicy) + workerAttendanceMod(worker);
    return sum + attendanceProbability(worker, mod);
  }, 0);
}

export function processAttendance(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedWorkers = { ...state.workers };

  // The very first shift, the hand-cast starting crew always shows — a no-show
  // before the player has done anything is a terrible first impression, not a
  // meaningful gameplay beat. The attendance lottery starts on shift two.
  const firstShift = state.tick === 0;

  // Weather/holiday conditions, meals/incentives, and the standing attendance
  // program all shift the whole crew's odds of showing up today.
  const dayModifier = dayAttendanceModifier(state) + attendanceProgramBonus(state);

  for (const worker of Object.values(state.workers)) {
    // Seed off a hash of the FULL worker id so every worker rolls independently.
    // (The old `id.charCodeAt(0)` was identical for w1/w2/w3 — all 'w' — so the
    //  whole crew shared one coin flip and attendance was perfectly correlated.)
    const rng = seededRandom(state.tick * 131 + hashString(worker.id));
    // Paying above market lifts each worker's own odds; traits (perfect attendance,
    // sickness prone, ...) push it further per person.
    const workerModifier = dayModifier + payAttendanceBonus(worker, state.payPolicy)
      + workerAttendanceMod(worker);
    const present = firstShift || rng <= attendanceProbability(worker, workerModifier);
    const missedShifts = present ? worker.missedShifts ?? 0 : (worker.missedShifts ?? 0) + 1;
    updatedWorkers[worker.id] = { ...worker, presentThisShift: present, missedShifts };

    if (!present) {
      events.push({
        type: 'WORKER_NO_SHOW',
        tick: state.tick,
        payload: { workerId: worker.id, workerName: worker.name, missedShifts },
      });
    } else {
      events.push({
        type: 'WORKER_ARRIVED',
        tick: state.tick,
        payload: { workerId: worker.id, workerName: worker.name },
      });
    }
  }

  return { state: { ...state, workers: updatedWorkers }, events };
}

function attendanceProbability(worker: Worker, dayModifier = 0): number {
  const tenureBonus = Math.min(worker.tenureDays / 90, 1) * 0.1;
  const base = worker.reliability + tenureBonus + (worker.morale - 0.5) * 0.1 + dayModifier;
  return Math.max(0.02, Math.min(base, 0.99));
}
