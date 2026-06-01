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
import { evaluateObjectives } from './progression/objectives';
import { checkSolvency } from './economy/solvency';
import { captureAssignments, clearAssignments } from './lines/assignments';
import { TICKS_PER_SHIFT, TICKS_PER_DAY } from './time';

export function tick(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  // A shut-down plant doesn't tick — the run is over until the player resets.
  if (state.gameOver) return { state, events };
  // Morning hold: the board has been wiped and the clock waits while the player
  // re-staffs. Nothing advances until startShift() releases it.
  if (state.awaitingStaffing) return { state, events };
  let s = state;

  // Shift boundary — the daily-staffing ritual:
  //  1. Settle the shift that just worked: morale, quits, payroll (present crew
  //     only), and incidents — all against who actually worked, while their
  //     assignments are still in place.
  //  2. Roll the new shift's attendance (who shows up today).
  //  3. Snapshot yesterday's lineup, wipe the board, and hold the clock so the
  //     player staffs from whoever turned up.
  if (s.tick % TICKS_PER_SHIFT === 0) {
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

      // Incidents accrue over the shift that was worked, by the crew who worked it.
      const ri = processIncidents(s);
      s = ri.state;
      events.push(...ri.events);
    }

    const r = processAttendance(s);
    s = r.state;
    events.push(...r.events);

    // Remember the lineup, empty the stations, and hold for the morning standup.
    const previousAssignments = captureAssignments(s);
    s = clearAssignments(s);
    s = { ...s, previousAssignments, awaitingStaffing: true };
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

  // Progression goals (cheap predicate sweep) — pay out and celebrate any cleared.
  const ro = evaluateObjectives(s);
  s = ro.state;
  events.push(...ro.events);

  // Stakes: warn on the slide into the red, end the run past the bankruptcy floor.
  const rs = checkSolvency(s);
  s = rs.state;
  events.push(...rs.events);

  const newTick = s.tick + 1;
  const newDay = Math.floor(newTick / TICKS_PER_DAY);
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
