// Worker
export interface Worker {
  id: string;
  name: string;
  appearance: WorkerAppearance;  // structured, engine-owned look (portable to RN)
  traits: string[];              // trait ids — what gives this worker soul
  tenureDays: number;
  reliability: number;   // 0-1, affects attendance probability
  morale: number;        // 0-1, affects speed and retention
  disposition: number;   // 0-1, the personal morale set-point morale drifts toward
  skills: StationSkill[];
  wage: number;          // base dollars per shift (scaled by the pay policy)
  permanent: boolean;    // converted temp→company: steadier, but costs more
  isLead: boolean;       // a line lead — lifts the morale/output of their line
  referredBy?: string;
  presentThisShift: boolean;
}

export interface WorkerAppearance {
  skinTone: string;
  hairColor: string;
  hairStyle: 'short' | 'buzz' | 'curly' | 'long' | 'bun' | 'bald' | 'cap';
  facialHair: 'none' | 'stubble' | 'mustache' | 'beard';
  build: 'slim' | 'average' | 'broad';
  accent: string;
  ageBracket: 'young' | 'adult' | 'senior';
}

export type StationSkill = {
  stationId: string;
  proficiency: number;   // 0-1
};

// Station and Line
export interface Station {
  id: string;
  name: string;
  assignedWorkerId?: string;
  throughputMultiplier: number;
}

export interface Line {
  id: string;
  name: string;
  stations: Station[];
  active: boolean;
  automation: number;    // 0+ automation level; each level lifts the line's output
  leadId?: string;       // worker assigned as this line's lead
}

// Order
export interface Order {
  id: string;
  clientId: string;
  sku: string;
  units: number;
  unitsCompleted: number;
  deadline: number;      // game tick
  revenuePerUnit: number;
  qualityThreshold: number;
}

// Client
export interface Client {
  id: string;
  name: string;
  reputation: number;    // 0-1
  orders: Order[];
}

// Events
export type GameEventType =
  | 'WORKER_ARRIVED'
  | 'WORKER_NO_SHOW'
  | 'ORDER_COMPLETED'
  | 'ORDER_MISSED'
  | 'MORALE_SHIFT'
  | 'REPUTATION_SHIFT'
  | 'PAYROLL'
  | 'LINE_PURCHASED'
  | 'OVERTIME_TOGGLED'
  | 'WORKER_TRAINED'
  | 'WORKER_HIRED'
  | 'WORKER_CONVERTED'
  | 'LEAD_PROMOTED'
  | 'AUTOMATION_UPGRADED'
  | 'DAY_CONDITION'
  | 'ATTENDANCE_BOOST'
  | 'STAFFING_REPORT'
  | 'INCIDENT'
  | 'WORKER_QUIT'
  | 'SHIFT_START'
  | 'SHIFT_END';

export interface GameEvent {
  type: GameEventType;
  tick: number;
  payload: Record<string, unknown>;
}

// Staffing-agency policy the player sets in the Staffing tab.
export interface PayPolicy {
  perSkill: boolean;                      // false = one global rate (Standard view)
  globalRate: number;                     // pay multiplier, 1.0 = market rate
  skillRates: Record<string, number>;     // per-station multipliers (Advanced view)
}

export interface StaffingPrograms {
  attendance: boolean;  // standing attendance bonus program (ongoing cost, better turnout)
  referral: boolean;    // referral program (ongoing cost, new hires arrive referred)
}

// Game State
export interface GameState {
  tick: number;      // 1 tick = 1 game-minute
  day: number;
  cash: number;
  orderCount: number;       // total orders generated (used for unique ids)
  completedOrders: number;  // orders actually fulfilled — drives difficulty scaling
  missedOrders: number;     // orders blown past deadline — for the fill-rate scoreboard
  lineCount: number;        // how many lines have been purchased (for cost scaling)
  overtime: boolean;        // global overtime: faster now, morale cost at shift end
  shoutoutReadyTick: number;// tick at which the recognition action is available again
  mealToday: boolean;       // emergency meal pulled today — lifts attendance + morale
  incentiveToday: boolean;  // emergency incentive pulled today — bigger lift
  mealCooldownUntil: number;     // day the meal lever can be pulled again
  incentiveCooldownUntil: number;// day the incentive lever can be pulled again
  payPolicy: PayPolicy;     // how generously the agency is paid (Staffing tab)
  skillRequest: string[];   // station ids the agency prioritizes when sending new hires
  programs: StaffingPrograms;
  nextWorkerId: number;     // monotonic id counter so hires never collide after a quit
  staffingHistory: StaffingDay[]; // per-day labor coverage vs the schedule (the board)
  workers: Record<string, Worker>;
  lines: Record<string, Line>;
  clients: Record<string, Client>;
  activeOrders: Order[];
  eventLog: GameEvent[];
}

// One day's labor scorecard: did you field enough bodies to cover the schedule?
export interface StaffingDay {
  day: number;
  required: number;   // positions the schedule called for
  covered: number;    // positions actually staffed by a present worker
  fill: number;       // covered / required (0..1)
}
