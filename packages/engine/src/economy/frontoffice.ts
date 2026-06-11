import { GameState, GameEvent, Line, Worker } from '../types';
import { hasUnlock } from '../progression/unlocks';

// --- Overtime (engine-owned; requires the 'overtime' feature unlock) ---
// More output now, morale cost at shift end. Gated behind a one-time purchase
// so the early game has to earn its crunch lever.
export function toggleOvertime(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!hasUnlock(state, 'overtime')) return { state, events: [] };
  const overtime = !state.overtime;
  return {
    state: { ...state, overtime },
    events: [{ type: 'OVERTIME_TOGGLED', tick: state.tick, payload: { overtime } }],
  };
}

// --- Automation: spend to make a line lean less on labor ---
// Each level adds a flat output multiplier to the line, so the same crew (or a
// short-staffed one) pushes more. Cost climbs with the level.

export const AUTOMATION_BONUS_PER_LEVEL = 0.18; // +18% line output per level
export const AUTOMATION_MAX_LEVEL = 5;
const AUTOMATION_BASE_COST = 5500;

export function automationCost(line: Line): number {
  return Math.round(AUTOMATION_BASE_COST * (line.automation + 1) * 1.4);
}

export function canAutomate(line: Line): boolean {
  return line.automation < AUTOMATION_MAX_LEVEL;
}

// The output multiplier a line gets from its automation level.
export function automationMultiplier(line: Line): number {
  return 1 + line.automation * AUTOMATION_BONUS_PER_LEVEL;
}

export function upgradeAutomation(state: GameState, lineId: string): { state: GameState; events: GameEvent[] } {
  const line = state.lines[lineId];
  if (!line || !canAutomate(line)) return { state, events: [] };
  const cost = automationCost(line);
  if (state.cash < cost) return { state, events: [] };

  const upgraded: Line = { ...line, automation: line.automation + 1 };
  const events: GameEvent[] = [{
    type: 'AUTOMATION_UPGRADED', tick: state.tick,
    payload: { lineId, lineName: line.name, level: upgraded.automation, cost },
  }];
  return {
    state: { ...state, cash: state.cash - cost, lines: { ...state.lines, [lineId]: upgraded } },
    events,
  };
}

// --- Leads: a strong worker promoted to lift their whole line ---
// A line with a lead gets a morale-and-output bump. Bad-manager risk lives in the
// fact that a lead pulled from a station leaves a hole; promote the right person.

export const LEAD_COST = 3000;
export const LEAD_OUTPUT_BONUS = 0.12; // +12% line output when a lead is on it
export const LEAD_MORALE_BONUS = 0.06; // lead lifts crew morale each shift

export function promoteLead(state: GameState, workerId: string, lineId: string): { state: GameState; events: GameEvent[] } {
  const worker = state.workers[workerId];
  const line = state.lines[lineId];
  if (!worker || !line || worker.isLead) return { state, events: [] };
  if (state.cash < LEAD_COST) return { state, events: [] };

  const workers: Record<string, Worker> = {
    ...state.workers,
    [workerId]: { ...worker, isLead: true },
  };
  // Demote any prior lead on this line back to the floor.
  const priorLeadId = line.leadId;
  if (priorLeadId && workers[priorLeadId]) {
    workers[priorLeadId] = { ...workers[priorLeadId], isLead: false };
  }
  const lines = { ...state.lines, [lineId]: { ...line, leadId: workerId } };

  const events: GameEvent[] = [{
    type: 'LEAD_PROMOTED', tick: state.tick,
    payload: { workerId, workerName: worker.name, lineId, lineName: line.name, cost: LEAD_COST },
  }];
  return { state: { ...state, cash: state.cash - LEAD_COST, workers, lines }, events };
}

// --- Temp → company conversion ---
// Converting a temp to a company employee is a big up-front cost and a permanent
// wage bump, but they become markedly steadier: higher reliability, a higher
// morale set-point, and a morale bump from the vote of confidence.

export const CONVERT_COST = 4500;
const CONVERT_WAGE_MULTIPLIER = 1.35;

export function conversionCost(_worker: Worker): number {
  return CONVERT_COST;
}

export function convertToPermanent(state: GameState, workerId: string): { state: GameState; events: GameEvent[] } {
  const worker = state.workers[workerId];
  if (!worker || worker.permanent) return { state, events: [] };
  if (state.cash < CONVERT_COST) return { state, events: [] };

  const upgraded: Worker = {
    ...worker,
    permanent: true,
    wage: Math.round(worker.wage * CONVERT_WAGE_MULTIPLIER),
    reliability: Math.min(0.98, worker.reliability + 0.12),
    disposition: Math.min(1, worker.disposition + 0.1),
    morale: Math.min(1, worker.morale + 0.08),
  };
  const events: GameEvent[] = [{
    type: 'WORKER_CONVERTED', tick: state.tick,
    payload: { workerId, workerName: worker.name, cost: CONVERT_COST, wage: upgraded.wage },
  }];
  return {
    state: { ...state, cash: state.cash - CONVERT_COST, workers: { ...state.workers, [workerId]: upgraded } },
    events,
  };
}
