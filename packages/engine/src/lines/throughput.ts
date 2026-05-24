import { GameState, GameEvent } from '../types';

const BASE_UNITS_PER_TICK = 0.5;

export function processThroughput(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedOrders = [...state.activeOrders];

  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;
    const staffedStations = line.stations.filter(s => s.assignedWorkerId).length;
    const staffRatio = staffedStations / line.stations.length;
    const assignedWorkers = line.stations
      .filter(s => s.assignedWorkerId)
      .map(s => state.workers[s.assignedWorkerId!])
      .filter(Boolean);
    const avgMorale = assignedWorkers.length > 0
      ? assignedWorkers.reduce((sum, w) => sum + w.morale, 0) / assignedWorkers.length
      : 0;
    const throughput = BASE_UNITS_PER_TICK * staffRatio * (0.75 + avgMorale * 0.5);
    const orderIndex = updatedOrders.findIndex(o => o.unitsCompleted < o.units);
    if (orderIndex >= 0) {
      updatedOrders[orderIndex] = {
        ...updatedOrders[orderIndex],
        unitsCompleted: Math.min(updatedOrders[orderIndex].unitsCompleted + throughput, updatedOrders[orderIndex].units),
      };
    }
  }
  return { state: { ...state, activeOrders: updatedOrders }, events };
}
