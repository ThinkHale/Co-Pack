import { GameState, GameEvent, Worker } from '../types';
import { seededRandom, hashString } from '../utils/random';
import { dayAttendanceModifier } from '../events/conditions';
import { payAttendanceBonus, attendanceProgramBonus } from '../economy/staffing';

export function processAttendance(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedWorkers = { ...state.workers };

  // Weather/holiday conditions, meals/incentives, and the standing attendance
  // program all shift the whole crew's odds of showing up today.
  const dayModifier = dayAttendanceModifier(state) + attendanceProgramBonus(state);

  for (const worker of Object.values(state.workers)) {
    // Seed off a hash of the FULL worker id so every worker rolls independently.
    // (The old `id.charCodeAt(0)` was identical for w1/w2/w3 — all 'w' — so the
    //  whole crew shared one coin flip and attendance was perfectly correlated.)
    const rng = seededRandom(state.tick * 131 + hashString(worker.id));
    // Paying above market lifts each worker's own odds on top of the crew-wide swing.
    const workerModifier = dayModifier + payAttendanceBonus(worker, state.payPolicy);
    const present = rng <= attendanceProbability(worker, workerModifier);
    updatedWorkers[worker.id] = { ...worker, presentThisShift: present };

    if (!present) {
      events.push({
        type: 'WORKER_NO_SHOW',
        tick: state.tick,
        payload: { workerId: worker.id, workerName: worker.name },
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
