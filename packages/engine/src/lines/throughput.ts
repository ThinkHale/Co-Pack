import { GameState, GameEvent } from '../types';

const BASE_UNITS_PER_TICK = 0.6;
const UNTRAINED_PROFICIENCY = 0.30;

export function processThroughput(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedOrders = [...state.activeOrders];

  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;

    const staffedStations = line.stations.filter(
      s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
    );

    // Pipeline rule: every stage must be covered — an empty station blocks the line
    if (staffedStations.length < line.stations.length) continue;

    const workers = staffedStations.map(s => state.workers[s.assignedWorkerId!]);

    const avgMorale = workers.reduce((sum, w) => sum + w.morale, 0) / workers.length;

    // Skill match: workers trained for their specific station produce more
    const avgSkill = staffedStations.reduce((sum, s) => {
      const worker = state.workers[s.assignedWorkerId!];
      const skill = worker.skills.find(sk => sk.stationId === s.id);
      return sum + (skill?.proficiency ?? UNTRAINED_PROFICIENCY);
    }, 0) / staffedStations.length;

    const skillMultiplier = 0.5 + avgSkill * 0.8;
    const throughput = BASE_UNITS_PER_TICK * (0.75 + avgMorale * 0.5) * skillMultiplier;

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
