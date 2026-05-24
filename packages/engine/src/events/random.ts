import { GameState, GameEvent } from '../types';
import { seededRandom } from '../utils/random';

const EVENT_CHANCE_PER_TICK = 0.002;

export function rollEvents(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const rng = seededRandom(state.tick * 9301 + 49297);
  if (rng < EVENT_CHANCE_PER_TICK) {
    const workerIds = Object.keys(state.workers);
    if (workerIds.length > 0) {
      const targetId = workerIds[Math.floor(rng * workerIds.length)];
      events.push({ type: 'MORALE_SHIFT', tick: state.tick, payload: { workerId: targetId, delta: 0.05, cause: 'recognition' } });
    }
  }
  return { state, events };
}
