import { GameState, Worker, Line, Client, Order } from './types';
import { generateAppearance } from './workers/appearance';
import { TICKS_PER_DAY } from './time';

export function createInitialState(): GameState {
  // The starting three are hand-cast so the player meets distinct people on day one.
  const worker1: Worker = {
    id: 'w1', name: 'Marcus T.',
    appearance: generateAppearance(101), traits: ['hard_worker', 'early_bird', 'quick_hands'],
    tenureDays: 0,
    reliability: 0.85, morale: 0.7, disposition: 0.70, wage: 90,
    permanent: false, isLead: false,
    skills: [{ stationId: 's1', proficiency: 0.70 }], // trained: Induct
    presentThisShift: true,
    missedShifts: 0, sentHomeShifts: 0, shiftsWorked: 0, totalUnits: 0, shiftUnits: 0,
  };
  const worker2: Worker = {
    id: 'w2', name: 'Diana R.',
    appearance: generateAppearance(202), traits: ['mentor', 'loyal', 'perfect_attendance', 'optimist'],
    tenureDays: 45,
    reliability: 0.92, morale: 0.8, disposition: 0.82, wage: 110,
    permanent: false, isLead: false,
    skills: [{ stationId: 's2', proficiency: 0.85 }], // trained: Pack — loves the work
    presentThisShift: true,
    missedShifts: 0, sentHomeShifts: 0, shiftsWorked: 0, totalUnits: 0, shiftUnits: 0,
  };
  const worker3: Worker = {
    id: 'w3', name: 'Jerome K.',
    appearance: generateAppearance(303), traits: ['joker', 'sickness_prone', 'easygoing'],
    tenureDays: 12,
    reliability: 0.75, morale: 0.6, disposition: 0.55, wage: 85,
    permanent: false, isLead: false,
    skills: [{ stationId: 's3', proficiency: 0.65 }], // trained: Stage — harder to please
    presentThisShift: true,
    missedShifts: 0, sentHomeShifts: 0, shiftsWorked: 0, totalUnits: 0, shiftUnits: 0,
  };

  // 3-station line: all three stages must be staffed to produce finished units
  const line1: Line = {
    id: 'line1', name: 'Line A', active: true, automation: 0,
    supportWorkerIds: [],
    stations: [
      { id: 's1', name: 'Induct',  throughputMultiplier: 1 },
      { id: 's2', name: 'Pack',    throughputMultiplier: 1 },
      { id: 's3', name: 'Stage',   throughputMultiplier: 1 },
    ],
  };

  const order1: Order = {
    id: 'ord1', clientId: 'c1', sku: 'SKU-001',
    units: 300, unitsCompleted: 0,
    deadline: TICKS_PER_DAY * 2, // two shifts to land the first contract
    revenuePerUnit: 2.50,
    qualityThreshold: 0.9,
  };

  const client1: Client = {
    id: 'c1', name: 'Cresco Distribution',
    reputation: 0.8, orders: [order1],
  };

  return {
    tick: 0, day: 0, cash: 6500, orderCount: 1, completedOrders: 0, missedOrders: 0,
    lineCount: 1, overtime: false, shoutoutReadyTick: 0,
    mealToday: false, incentiveToday: false,
    mealCooldownUntil: 0, incentiveCooldownUntil: 0,
    payPolicy: { perSkill: false, globalRate: 1.0, skillRates: { s1: 1.0, s2: 1.0, s3: 1.0 } },
    skillRequest: [],
    programs: { attendance: false, referral: false },
    nextWorkerId: 4, // w1..w3 already taken
    staffingHistory: [],
    completedObjectives: [],
    cashWarned: false,
    gameOver: false,
    awaitingStaffing: false, // tick 0 rolls attendance, then opens the Day-1 staffing standup
    shiftChallenge: null,
    challengeCooldownUntil: 0,
    lastShiftReport: null,
    previousAssignments: {},
    workers: { w1: worker1, w2: worker2, w3: worker3 },
    lines: { line1 },
    clients: { c1: client1 },
    activeOrders: [order1],
    eventLog: [],
  };
}
