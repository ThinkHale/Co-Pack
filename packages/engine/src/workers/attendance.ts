import { GameState, GameEvent, Worker } from '../types';
import { seededRandom } from '../utils/random';

export function processAttendance(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedWorkers = { ...state.workers };

  for (const worker of Object.values(state.workers)) {
    const rng = seededRandom(state.tick + worker.id.charCodeAt(0));
    const present = rng <= attendanceProbability(worker);
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

function attendanceProbability(worker: Worker): number {
  const tenureBonus = Math.min(worker.tenureDays / 90, 1) * 0.1;
  return Math.min(worker.reliability + tenureBonus + (worker.morale - 0.5) * 0.1, 0.99);
}
