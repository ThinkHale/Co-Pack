import { GameState, GameEvent } from './types';
import { processAttendance } from './workers/attendance';
import { processMorale } from './workers/morale';
import { processRetention } from './workers/retention';
import { processThroughput } from './lines/throughput';
import { processOrders } from './clients/orders';
import { processPayroll } from './economy/payroll';
import { rollEvents } from './events/random';

export function tick(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;

  // Shift boundary: morale settles & overtime fatigue lands (on the shift just
  // worked), payroll is paid, then the new shift's attendance is rolled.
  if (s.tick % 480 === 0) {
    if (s.tick > 0) {
      const rm = processMorale(s);
      s = rm.state;
      events.push(...rm.events);

      // Quits land after morale settles — overtime fatigue can be the last straw.
      const rr = processRetention(s);
      s = rr.state;
      events.push(...rr.events);

      const rp = processPayroll(s);
      s = rp.state;
      events.push(...rp.events);
    }

    const r = processAttendance(s);
    s = r.state;
    events.push(...r.events);
  }

  const r2 = processThroughput(s);
  s = r2.state;
  events.push(...r2.events);

  const r3 = processOrders(s);
  s = r3.state;
  events.push(...r3.events);

  const r4 = rollEvents(s);
  s = r4.state;
  events.push(...r4.events);

  const newTick = s.tick + 1;
  const newDay = Math.floor(newTick / 1440);

  // Increment tenure for all workers at the day boundary
  const workers = newDay > s.day
    ? Object.fromEntries(Object.entries(s.workers).map(([id, w]) => [id, { ...w, tenureDays: w.tenureDays + 1 }]))
    : s.workers;

  return { state: { ...s, tick: newTick, day: newDay, workers }, events };
}
