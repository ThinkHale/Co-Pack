import { GameState, GameEvent } from '../types';
import { automationMultiplier, LEAD_OUTPUT_BONUS } from '../economy/frontoffice';
import { workerProductivityMult, lineProductivityMult } from '../workers/traits';

const BASE_UNITS_PER_TICK = 0.6;
const UNTRAINED_PROFICIENCY = 0.40;     // a generalist on the wrong station still works, just slower
export const OVERTIME_MULTIPLIER = 1.4; // push output now, pay for it in morale at shift end

export function processThroughput(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedOrders = [...state.activeOrders];

  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;

    const staffedStations = line.stations.filter(
      s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
    );

    // A line with nobody on it produces nothing.
    if (staffedStations.length === 0) continue;

    // Pipeline rule (softened): an unstaffed stage is a bottleneck, not a full stop.
    // A short-staffed line runs at a reduced rate proportional to coverage, so a
    // single no-show costs you a slice of that line — not the whole shift.
    const staffingRatio = staffedStations.length / line.stations.length;

    const workers = staffedStations.map(s => state.workers[s.assignedWorkerId!]);

    const avgMorale = workers.reduce((sum, w) => sum + w.morale, 0) / workers.length;

    // Skill match: workers trained for their specific station produce more
    const avgSkill = staffedStations.reduce((sum, s) => {
      const worker = state.workers[s.assignedWorkerId!];
      const skill = worker.skills.find(sk => sk.stationId === s.id);
      return sum + (skill?.proficiency ?? UNTRAINED_PROFICIENCY);
    }, 0) / staffedStations.length;

    const skillMultiplier = 0.5 + avgSkill * 0.8;
    const overtimeMultiplier = state.overtime ? OVERTIME_MULTIPLIER : 1;
    // A present lead on this line lifts its output; automation lifts it regardless of crew.
    const leadPresent = line.leadId
      && line.stations.some(s => s.assignedWorkerId === line.leadId)
      && state.workers[line.leadId]?.presentThisShift;
    const leadMultiplier = leadPresent ? 1 + LEAD_OUTPUT_BONUS : 1;

    // Trait effects: each present worker's own productivity (hard worker, slacker,
    // senior, ...) averaged across the crew, plus line-wide traits (joker, mentor).
    const avgTraitMult = workers.reduce((m, w) => m + workerProductivityMult(w), 0) / workers.length;
    const traitLineMult = lineProductivityMult(workers);

    const throughput =
      BASE_UNITS_PER_TICK * (0.75 + avgMorale * 0.5) * skillMultiplier
      * overtimeMultiplier * staffingRatio * leadMultiplier * automationMultiplier(line)
      * avgTraitMult * traitLineMult;

    const orderIndex = updatedOrders.findIndex(o => o.unitsCompleted < o.units);
    if (orderIndex >= 0) {
      updatedOrders[orderIndex] = {
        ...updatedOrders[orderIndex],
        unitsCompleted: Math.min(
          updatedOrders[orderIndex].unitsCompleted + throughput,
          updatedOrders[orderIndex].units,
        ),
      };
    }
  }

  return { state: { ...state, activeOrders: updatedOrders }, events };
}
