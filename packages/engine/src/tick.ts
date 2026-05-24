import { GameState, GameEvent } from './types';
import { processAttendance } from './workers/attendance';
import { processThroughput } from './lines/throughput';
import { processOrders } from './clients/orders';
import { rollEvents } from './events/random';

export function tick(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // Attendance check at shift start (every 480 ticks = 8-hour shift)
  if (state.tick % 480 === 0) {
    const { state: s1, events: e1 } = processAttendance(state);
    Object.assign(state, s1);
    events.push(...e1);
  }

  const { state: s2, events: e2 } = processThroughput(state);
  Object.assign(state, s2);
  events.push(...e2);

  const { state: s3, events: e3 } = processOrders(state);
  Object.assign(state, s3);
  events.push(...e3);

  const { state: s4, events: e4 } = rollEvents(state);
  Object.assign(state, s4);
  events.push(...e4);

  const newTick = state.tick + 1;
  const newDay = Math.floor(newTick / 1440); // 1440 ticks = 1 game day

  return { state: { ...state, tick: newTick, day: newDay }, events };
}
