import { GameState, GameEvent } from '../types';
import { rollingStaffingFill, STAFFING_TARGET } from '../economy/staffing-board';
import { clientTier } from '../clients/roster';

// --- Objectives: the progression ladder ---
// A sandbox with no goals has no pull. Objectives give the player a next thing to
// chase and a hit of cash + acknowledgement when they hit it. They're declarative:
// a predicate over state plus an optional progress read for the UI meter. They pay
// out exactly once (tracked in state.completedObjectives) and are checked cheaply
// every tick. Order matters — the UI surfaces the first few still-open goals.

export interface Objective {
  id: string;
  label: string;
  hint: string;
  reward: number;                                   // cash granted on completion
  isComplete: (s: GameState) => boolean;
  progress?: (s: GameState) => { current: number; target: number };
}

const headcount = (s: GameState) => Object.keys(s.workers).length;
const maxAutomation = (s: GameState) =>
  Object.values(s.lines).reduce((m, l) => Math.max(m, l.automation), 0);

export const OBJECTIVES: Objective[] = [
  {
    id: 'first_order', label: 'Ship your first contract', reward: 1200,
    hint: 'Staff a full line and deliver the order on the board.',
    isComplete: s => s.completedOrders >= 1,
    progress: s => ({ current: Math.min(s.completedOrders, 1), target: 1 }),
  },
  {
    id: 'hire_one', label: 'Call the agency for a hire', reward: 1000,
    hint: 'Tap Hire on the Floor to bring in a fourth body.',
    isComplete: s => headcount(s) >= 4,
    progress: s => ({ current: Math.min(headcount(s), 4), target: 4 }),
  },
  {
    id: 'train_one', label: 'Cross-train an associate', reward: 1200,
    hint: 'Select a worker and train them on a second station.',
    isComplete: s => Object.values(s.workers).some(w => w.skills.length >= 2),
  },
  {
    id: 'five_orders', label: 'Ship 5 contracts', reward: 3000,
    hint: 'Keep the belt moving — quantity builds the bankroll.',
    isComplete: s => s.completedOrders >= 5,
    progress: s => ({ current: Math.min(s.completedOrders, 5), target: 5 }),
  },
  {
    id: 'land_atlas', label: 'Land Atlas Beverage Co.', reward: 2500,
    hint: 'Ship contracts to build a track record — bigger clients pay better per unit.',
    isComplete: s => !!s.clients.c2,
    progress: s => ({
      current: Math.min(s.completedOrders, clientTier('c2')?.unlockAtCompleted ?? 6),
      target: clientTier('c2')?.unlockAtCompleted ?? 6,
    }),
  },
  {
    id: 'second_line', label: 'Open a second line', reward: 4000,
    hint: 'Front Office → Production Lines. More lines, more parallel orders.',
    isComplete: s => s.lineCount >= 2,
  },
  {
    id: 'promote_lead', label: 'Promote a line lead', reward: 2000,
    hint: 'Front Office → People moves. A lead lifts their whole line.',
    isComplete: s => Object.values(s.workers).some(w => w.isLead),
  },
  {
    id: 'hire_supervisor', label: 'Hire a floor supervisor', reward: 4000,
    hint: 'Front Office → Operations. The plant keeps earning while you\'re away.',
    isComplete: s => s.hasSupervisor,
  },
  {
    id: 'convert_perm', label: 'Convert a temp to company', reward: 2500,
    hint: 'A permanent hire is steadier and far less likely to walk.',
    isComplete: s => Object.values(s.workers).some(w => w.permanent),
  },
  {
    id: 'automate_l2', label: 'Automate a line to L2', reward: 4000,
    hint: 'Automation lifts output even when the crew is thin.',
    isComplete: s => maxAutomation(s) >= 2,
    progress: s => ({ current: Math.min(maxAutomation(s), 2), target: 2 }),
  },
  {
    id: 'land_halcyon', label: 'Land Halcyon Home Goods', reward: 5000,
    hint: 'A national account: 14 contracts shipped and a two-line shop.',
    isComplete: s => !!s.clients.c3,
    progress: s => ({
      current: Math.min(s.completedOrders, clientTier('c3')?.unlockAtCompleted ?? 14),
      target: clientTier('c3')?.unlockAtCompleted ?? 14,
    }),
  },
  {
    id: 'bank_60k', label: 'Bank $60,000', reward: 5000,
    hint: 'Run lean shifts and deliver on time.',
    isComplete: s => s.cash >= 60000,
    progress: s => ({ current: Math.max(0, Math.round(s.cash)), target: 60000 }),
  },
  {
    id: 'staffing_streak', label: 'Hold 95% labor coverage', reward: 6000,
    hint: 'Keep the rolling staffing fill at target across a logged week.',
    isComplete: s => s.staffingHistory.length >= 5 && rollingStaffingFill(s) >= STAFFING_TARGET,
  },
  {
    id: 'crew_eight', label: 'Grow the crew to 8', reward: 4000,
    hint: 'A deeper bench absorbs no-shows without stalling a line.',
    isComplete: s => headcount(s) >= 8,
    progress: s => ({ current: Math.min(headcount(s), 8), target: 8 }),
  },
  {
    id: 'land_northwind', label: 'Land Northwind Pharma', reward: 10000,
    hint: 'The premium contract: 30 shipped and three lines running.',
    isComplete: s => !!s.clients.c4,
    progress: s => ({
      current: Math.min(s.completedOrders, clientTier('c4')?.unlockAtCompleted ?? 30),
      target: clientTier('c4')?.unlockAtCompleted ?? 30,
    }),
  },
  {
    id: 'bank_250k', label: 'Bank $250,000', reward: 25000,
    hint: 'The empire chapter. Automate, parallelize, keep morale high.',
    isComplete: s => s.cash >= 250000,
    progress: s => ({ current: Math.max(0, Math.round(s.cash)), target: 250000 }),
  },
];

const OBJECTIVE_BY_ID: Record<string, Objective> = Object.fromEntries(
  OBJECTIVES.map(o => [o.id, o])
);

export function getObjective(id: string): Objective | undefined {
  return OBJECTIVE_BY_ID[id];
}

// The next still-open goals, in ladder order, for the UI to surface.
export function openObjectives(state: GameState, limit = 3): Objective[] {
  return OBJECTIVES.filter(o => !state.completedObjectives.includes(o.id)).slice(0, limit);
}

export function objectivesCleared(state: GameState): number {
  return state.completedObjectives.length;
}

/**
 * Grant any newly-met objective: pay its reward once, record it, and emit an event
 * the UI can celebrate. Called each tick (the predicate sweep is trivial).
 */
export function evaluateObjectives(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.gameOver) return { state, events: [] };

  let cash = state.cash;
  const newlyCleared: string[] = [];
  const events: GameEvent[] = [];

  for (const obj of OBJECTIVES) {
    if (state.completedObjectives.includes(obj.id)) continue;
    if (!obj.isComplete(state)) continue;
    cash += obj.reward;
    newlyCleared.push(obj.id);
    events.push({
      type: 'OBJECTIVE_COMPLETED', tick: state.tick,
      payload: { id: obj.id, label: obj.label, reward: obj.reward },
    });
  }

  if (newlyCleared.length === 0) return { state, events };

  return {
    state: {
      ...state,
      cash,
      completedObjectives: [...state.completedObjectives, ...newlyCleared],
    },
    events,
  };
}
