import { GameState, GameEvent } from './types';
import { processAttendance } from './workers/attendance';
import { processMorale } from './workers/morale';
import { processRetention } from './workers/retention';
import { processThroughput } from './lines/throughput';
import { processOrders } from './clients/orders';
import { processPayroll, totalPayroll } from './economy/payroll';
import { processOverhead } from './economy/overhead';
import { supervisorOnDuty, SUPERVISOR_CHALLENGE_GRACE_TICKS } from './economy/supervisor';
import { processIncidents } from './events/incidents';
import { rollEvents } from './events/random';
import { rollShiftChallenge, resolveShiftChallenge, supervisorChallengeChoice } from './events/challenges';
import { dayCondition } from './events/conditions';
import { recordStaffingDay } from './economy/staffing-board';
import { evaluateObjectives } from './progression/objectives';
import { checkSolvency } from './economy/solvency';
import { captureAssignments, clearAssignments, autoAssignCrew } from './lines/assignments';
import { finalizeShiftImpact } from './workers/impact';
import { TICKS_PER_SHIFT, TICKS_PER_DAY } from './time';

/**
 * Advance the sim one game-minute. `unattended` marks ticks run while the
 * player is away (offline catch-up): a hired supervisor always runs the floor
 * through those — but never wrestles a live player for the controls.
 */
export function tick(state: GameState, opts?: { unattended?: boolean }): { state: GameState; events: GameEvent[] } {
  const unattended = opts?.unattended ?? false;
  const events: GameEvent[] = [];
  // A shut-down plant doesn't tick — the run is over until the player resets.
  if (state.gameOver) return { state, events };
  // Morning hold: the board has been wiped and the clock waits while the player
  // re-staffs. Nothing advances until startShift() releases it.
  if (state.awaitingStaffing) return { state, events };
  let s = state;

  // Shift boundary — the daily-staffing ritual:
  //  1. Settle the shift that just worked: morale, payroll (present crew only),
  //     incidents, a people-impact report, and quits — all against who actually worked, while their
  //     assignments are still in place.
  //  2. Roll the new shift's attendance (who shows up today).
  //  3. Snapshot yesterday's lineup, wipe the board, and hold the clock so the
  //     player staffs from whoever turned up.
  if (s.tick % TICKS_PER_SHIFT === 0) {
    if (s.tick > 0) {
      const rm = processMorale(s);
      s = rm.state;
      events.push(...rm.events);

      const payrollAmount = totalPayroll(s);
      const rp = processPayroll(s);
      s = rp.state;
      events.push(...rp.events);

      // Fixed costs (rent + supervisor salary) land with payroll every shift.
      const rv = processOverhead(s);
      s = rv.state;
      events.push(...rv.events);

      // Incidents accrue over the shift that was worked, by the crew who worked it.
      const ri = processIncidents(s);
      s = ri.state;
      events.push(...ri.events);

      const rf = finalizeShiftImpact(s, payrollAmount);
      s = rf.state;
      events.push(...rf.events);

      // Quits land after the shift is paid and reported — overtime fatigue can be the last straw.
      const rr = processRetention(s);
      s = rr.state;
      events.push(...rr.events);
    }

    const r = processAttendance(s);
    s = r.state;
    events.push(...r.events);

    // Remember the lineup and empty the stations. The supervisor re-staffs and
    // rolls the shift only when they're on duty — always during unattended
    // (offline) time, but during live play only if the player opted into
    // Auto-shift. Otherwise, hold for the player's morning standup.
    const previousAssignments = captureAssignments(s);
    s = clearAssignments(s);
    s = { ...s, previousAssignments, shiftChallenge: null };
    if (supervisorOnDuty(s, unattended)) {
      s = autoAssignCrew(s);
      events.push({
        type: 'SHIFT_START', tick: s.tick,
        payload: { day: Math.floor(s.tick / TICKS_PER_DAY), auto: true },
      });
    } else {
      s = { ...s, awaitingStaffing: true };
    }
  }

  // An on-duty supervisor won't leave a floor decision hanging forever: after
  // a short grace window (the player's chance to weigh in, when present),
  // they make the safe call so an unattended run isn't quietly throttled.
  if (s.shiftChallenge && supervisorOnDuty(s, unattended)
    && s.tick - s.shiftChallenge.createdTick >= SUPERVISOR_CHALLENGE_GRACE_TICKS) {
    const ra = resolveShiftChallenge(s, supervisorChallengeChoice(s.shiftChallenge));
    s = ra.state;
    events.push(...ra.events);
  }

  const rc = rollShiftChallenge(s);
  s = rc.state;
  events.push(...rc.events);

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
