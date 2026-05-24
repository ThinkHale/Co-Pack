// Worker
export interface Worker {
  id: string;
  name: string;
  tenureDays: number;
  reliability: number;   // 0-1, affects attendance probability
  morale: number;        // 0-1, affects speed and retention
  skills: StationSkill[];
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
  orderCount: number;
  workers: Record<string, Worker>;
  lines: Record<string, Line>;
  clients: Record<string, Client>;
  activeOrders: Order[];
  eventLog: GameEvent[];
}
