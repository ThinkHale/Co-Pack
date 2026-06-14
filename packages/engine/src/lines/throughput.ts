import { GameState, GameEvent, Line, Order, Worker, stationRole } from '../types';
import { automationMultiplier, LEAD_OUTPUT_BONUS, PUSH_HARDER_OUTPUT_BONUS } from '../economy/frontoffice';
import { nightShiftActive, NIGHT_OUTPUT_BONUS } from '../economy/nightshift';
import { workerProductivityMult, lineProductivityMult } from '../workers/traits';
import { assignedWorkerIdsForLine, MAX_SUPPORT_WORKERS_PER_LINE } from './assignments';

const BASE_UNITS_PER_TICK = 0.6;
const UNTRAINED_PROFICIENCY = 0.40;     // a generalist on the wrong station still works, just slower
export const OVERTIME_MULTIPLIER = 1.4; // push output now, pay for it in morale at shift end
export const SUPPORT_OUTPUT_BONUS = 0.18; // paid helper: useful lift, but not a full station

export { BASE_UNITS_PER_TICK, UNTRAINED_PROFICIENCY };

/**
 * Units-per-tick a single line produces right now. This is the ONE source of
 * truth for output — the UI imports it instead of re-deriving the formula, so
 * the headline "units/min" can never drift from what the sim actually does
 * (leads, automation, and traits used to be silently dropped from the display).
 */
export function lineThroughput(state: GameState, line: Line): number {
  if (!line.active) return 0;

  const staffedStations = line.stations.filter(
    s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
  );
  // A line with nobody on it produces nothing.
  if (staffedStations.length === 0) return 0;
  const supportWorkers = (line.supportWorkerIds ?? [])
    .map(id => state.workers[id])
    .filter((w): w is Worker => !!w && w.presentThisShift);

  // Pipeline rule (softened): an unstaffed stage is a bottleneck, not a full stop.
  // A short-staffed line runs at a reduced rate proportional to coverage, so a
  // single no-show costs you a slice of that line — not the whole shift.
  const staffingRatio = staffedStations.length / line.stations.length;

  const workers = staffedStations.map(s => state.workers[s.assignedWorkerId!]);
  const crew = [...workers, ...supportWorkers];
  const avgMorale = crew.reduce((sum, w) => sum + w.morale, 0) / crew.length;

  // Skill match: workers trained for their station's ROLE produce more (a
  // twin-pack line's second Pack slot still wants a Pack-trained worker).
  const avgSkill = staffedStations.reduce((sum, s) => {
    const worker = state.workers[s.assignedWorkerId!];
    const skill = worker.skills.find(sk => sk.stationId === stationRole(s));
    return sum + (skill?.proficiency ?? UNTRAINED_PROFICIENCY);
  }, 0) / staffedStations.length;

  const skillMultiplier = 0.5 + avgSkill * 0.8;
  const overtimeMultiplier = state.overtime ? OVERTIME_MULTIPLIER : 1;
  // A present lead on this line lifts its output; automation lifts it regardless of crew.
  const leadPresent = !!line.leadId
    && assignedWorkerIdsForLine(line).includes(line.leadId)
    && state.workers[line.leadId!]?.presentThisShift;
  const leadMultiplier = leadPresent ? 1 + LEAD_OUTPUT_BONUS : 1;
  const pushHarderMultiplier = leadPresent && (line.pushHarderUntil ?? 0) > state.tick
    ? 1 + PUSH_HARDER_OUTPUT_BONUS
    : 1;
  const supportMultiplier = 1 + Math.min(supportWorkers.length, MAX_SUPPORT_WORKERS_PER_LINE) * SUPPORT_OUTPUT_BONUS;

  // Trait effects: each present worker's own productivity (hard worker, slacker,
  // senior, ...) averaged across the crew, plus line-wide traits (joker, mentor).
  const avgTraitMult = crew.reduce((m, w) => m + workerProductivityMult(w), 0) / crew.length;
  const traitLineMult = lineProductivityMult(crew);
  const challengeMult = state.shiftChallenge?.lineId === line.id
    ? state.shiftChallenge.outputMultiplier ?? 1
    : 1;

  const nightMultiplier = nightShiftActive(state) ? 1 + NIGHT_OUTPUT_BONUS : 1;

  return BASE_UNITS_PER_TICK * (0.75 + avgMorale * 0.5) * skillMultiplier
    * overtimeMultiplier * staffingRatio * leadMultiplier * automationMultiplier(line)
    * pushHarderMultiplier * supportMultiplier * avgTraitMult * traitLineMult * challengeMult * nightMultiplier;
}

// Total units/tick across every active line — the HUD's headline output number.
export function totalThroughput(state: GameState): number {
  return Object.values(state.lines).reduce((sum, line) => sum + lineThroughput(state, line), 0);
}

export function processThroughput(state: GameState): { state: GameState; events: GameEvent[] } {
  const updatedOrders = [...state.activeOrders];
  const updatedWorkers = { ...state.workers };

  // Incomplete orders, most urgent (earliest deadline) first. Each line works
  // the order it was dealt at the morning standup; a line whose order finished
  // (or was never dealt one) picks up the next unclaimed open order, so spare
  // capacity is never idle.
  const incompleteIdx = updatedOrders
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.unitsCompleted < o.units)
    .sort((a, b) => a.o.deadline - b.o.deadline)
    .map(({ i }) => i);

  if (incompleteIdx.length === 0) return { state, events: [] };

  const claimed = new Set<number>();
  const activeLines = Object.values(state.lines).filter(l => l.active);
  activeLines.forEach((line, li) => {
    const tp = lineThroughput(state, line);
    if (tp <= 0) return;
    const contributors = [
      ...line.stations
        .map(station => station.assignedWorkerId)
        .filter((id): id is string => !!id && !!state.workers[id]?.presentThisShift),
      ...(line.supportWorkerIds ?? []).filter(id => !!state.workers[id]?.presentThisShift),
    ].filter((id, index, arr) => arr.indexOf(id) === index);
    const credit = contributors.length > 0 ? tp / contributors.length : 0;
    for (const workerId of contributors) {
      const worker = updatedWorkers[workerId];
      if (!worker) continue;
      updatedWorkers[workerId] = {
        ...worker,
        shiftUnits: (worker.shiftUnits ?? 0) + credit,
        totalUnits: (worker.totalUnits ?? 0) + credit,
      };
    }

    // Prefer the dealt order; otherwise the most urgent unclaimed one; if
    // every open order is claimed, double up on the front of the queue.
    let target = -1;
    if (line.orderId) {
      const dealt = incompleteIdx.find(i => updatedOrders[i].id === line.orderId && !claimed.has(i));
      if (dealt !== undefined) target = dealt;
    }
    if (target < 0) target = incompleteIdx.find(i => !claimed.has(i)) ?? incompleteIdx[li % incompleteIdx.length];
    claimed.add(target);
    const order: Order = updatedOrders[target];
    updatedOrders[target] = {
      ...order,
      unitsCompleted: Math.min(order.unitsCompleted + tp, order.units),
    };
  });

  return { state: { ...state, activeOrders: updatedOrders, workers: updatedWorkers }, events: [] };
}
