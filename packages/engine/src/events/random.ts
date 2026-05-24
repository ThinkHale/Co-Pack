import { GameState, GameEvent } from '../types';
import { seededRandom } from '../utils/random';

const RECOGNITION_CHANCE = 0.002;
const EQUIPMENT_ISSUE_CHANCE = 0.002;

export function rollEvents(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let workers = state.workers;
  const workerIds = Object.keys(workers);

  if (workerIds.length === 0) return { state, events };

  // Positive: recognition boost
  const rng1 = seededRandom(state.tick * 9301 + 49297);
  if (rng1 < RECOGNITION_CHANCE) {
    const idx = Math.floor(seededRandom(state.tick * 1234 + 1) * workerIds.length);
    const targetId = workerIds[idx];
    const worker = workers[targetId];
    const delta = 0.05;
    workers = { ...workers, [targetId]: { ...worker, morale: Math.min(1, worker.morale + delta) } };
    events.push({
      type: 'MORALE_SHIFT', tick: state.tick,
      payload: { workerId: targetId, workerName: worker.name, delta, cause: 'recognition' },
    });
  }

  // Negative: equipment issue
  const rng2 = seededRandom(state.tick * 7919 + 31337);
  if (rng2 < EQUIPMENT_ISSUE_CHANCE) {
    const idx = Math.floor(seededRandom(state.tick * 5678 + 2) * workerIds.length);
    const targetId = workerIds[idx];
    const worker = workers[targetId];
    const delta = -0.05;
    workers = { ...workers, [targetId]: { ...worker, morale: Math.max(0.1, worker.morale + delta) } };
    events.push({
      type: 'MORALE_SHIFT', tick: state.tick,
      payload: { workerId: targetId, workerName: worker.name, delta, cause: 'equipment issue' },
    });
  }

  return { state: { ...state, workers }, events };
}
