// Worker
export interface Worker {
  id: string;
  name: string;
  tenureDays: number;
  reliability: number;   // 0-1, affects attendance probability
  morale: number;        // 0-1, affects speed and retention
  skills: StationSkill[];
  wage: number;          // dollars paid per shift (deducted every 480 ticks)
  referredBy?: string;
  presentThisShift: boolean;
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
  | 'INCIDENT'
  | 'WORKER_QUIT'
  | 'SHIFT_START'
  | 'SHIFT_END';

export interface GameEvent {
  type: GameEventType;
  tick: number;
  payload: Record<string, unknown>;
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
  workers: Record<string, Worker>;
  lines: Record<string, Line>;
  clients: Record<string, Client>;
  activeOrders: Order[];
  eventLog: GameEvent[];
}
