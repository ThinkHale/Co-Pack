import { GameState, GameEvent } from './types';
import { processAttendance } from './workers/attendance';
import { processMorale } from './workers/morale';
import { processRetention } from './workers/retention';
import { processThroughput } from './lines/throughput';
import { processOrders } from './clients/orders';
import { processPayroll } from './economy/payroll';
import { processIncidents } from './events/incidents';
import { rollEvents } from './events/random';
import { dayCondition } from './events/conditions';
import { recordStaffingDay } from './economy/staffing-board';

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

    // Incidents are evaluated against the crew that just clocked in for the shift.
    const ri = processIncidents(s);
    s = ri.state;
    events.push(...ri.events);
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
  const dayRolled = newDay > s.day;

  // At the day boundary: tenure ticks up, today's boosters reset, and the new
  // day's condition (weather/holiday) is announced so the player can react.
  const workers = dayRolled
    ? Object.fromEntries(Object.entries(s.workers).map(([id, w]) => [id, { ...w, tenureDays: w.tenureDays + 1 }]))
    : s.workers;

  let mealToday = s.mealToday;
  let incentiveToday = s.incentiveToday;
  if (dayRolled) {
    // Score the day that just finished on the staffing board (labor coverage).
    const rb = recordStaffingDay(s);
    s = rb.state;
    events.push(...rb.events);

    mealToday = false;
    incentiveToday = false;
    const condition = dayCondition(newDay);
    events.push({
      type: 'DAY_CONDITION', tick: newTick,
      payload: { day: newDay, key: condition.key, label: condition.label, note: condition.note, modifier: condition.modifier, tone: condition.tone },
    });
  }

  return { state: { ...s, tick: newTick, day: newDay, workers, mealToday, incentiveToday }, events };
}
