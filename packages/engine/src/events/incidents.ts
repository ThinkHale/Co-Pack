import { GameState, GameEvent, Worker } from '../types';
import { seededRandom, hashString } from '../utils/random';
import { workerIncidentRisk, lineIncidentResist } from '../workers/traits';

// --- Incidents ---
// The safety mechanic the vision asks for. Some workers carry risk (a checkered
// past, clumsiness); a Safety First worker on the same line lowers it. Overtime
// — pushing tired people harder — raises it. When an incident fires it costs
// cash, dents the involved worker's morale, and is logged so the player feels it.
// This is what makes "corner-cutting for speed" a real gamble.

const OVERTIME_RISK_MULT = 1.6;     // tired crews have more incidents
const INCIDENT_MORALE_HIT = 0.08;
const INCIDENT_COST_MIN = 250;
const INCIDENT_COST_MAX = 900;

// Map each assigned worker to the safety resistance present on their line.
function lineResistByWorker(state: GameState): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of Object.values(state.lines)) {
    const crew = line.stations
      .map(s => s.assignedWorkerId && state.workers[s.assignedWorkerId])
      .filter((w): w is Worker => !!w && w.presentThisShift);
    const resist = lineIncidentResist(crew);
    for (const station of line.stations) {
      if (station.assignedWorkerId) map[station.assignedWorkerId] = resist;
    }
  }
  return map;
}

/**
 * Runs at the shift boundary. Each present worker rolls against their trait
 * incident risk (reduced by line safety, raised by overtime). At most one incident
 * per shift so it lands as a memorable beat, not a flood.
 */
export function processIncidents(state: GameState): { state: GameState; events: GameEvent[] } {
  const resistByWorker = lineResistByWorker(state);
  const otMult = state.overtime ? OVERTIME_RISK_MULT : 1;

  for (const worker of Object.values(state.workers)) {
    if (!worker.presentThisShift) continue;
    const baseRisk = workerIncidentRisk(worker);
    if (baseRisk <= 0) continue;

    const resist = resistByWorker[worker.id] ?? 0;
    const risk = Math.max(0, baseRisk * otMult - resist);
    if (risk <= 0) continue;

    const rng = seededRandom(state.tick * 613 + hashString(worker.id) * 11 + 7);
    if (rng < risk) {
      const cost = Math.round(INCIDENT_COST_MIN + seededRandom(state.tick + 99) * (INCIDENT_COST_MAX - INCIDENT_COST_MIN));
      const workers = {
        ...state.workers,
        [worker.id]: { ...worker, morale: Math.max(0.1, worker.morale - INCIDENT_MORALE_HIT) },
      };
      const events: GameEvent[] = [{
        type: 'INCIDENT', tick: state.tick,
        payload: { workerId: worker.id, workerName: worker.name, cost, overtime: state.overtime },
      }];
      return { state: { ...state, cash: state.cash - cost, workers }, events };
    }
  }

  return { state, events: [] };
}
