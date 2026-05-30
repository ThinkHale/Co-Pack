import { GameState, Worker, Line, Client, Order } from './types';

export function createInitialState(): GameState {
  // Workers start on the bench — the player's first job is to assign them
  const worker1: Worker = {
    id: 'w1', name: 'Marcus T.', tenureDays: 0,
    reliability: 0.85, morale: 0.7, wage: 90,
    skills: [{ stationId: 's1', proficiency: 0.70 }], // trained: Induct
    presentThisShift: true,
  };
  const worker2: Worker = {
    id: 'w2', name: 'Diana R.', tenureDays: 45,
    reliability: 0.92, morale: 0.8, wage: 110,
    skills: [{ stationId: 's2', proficiency: 0.85 }], // trained: Pack
    presentThisShift: true,
  };
  const worker3: Worker = {
    id: 'w3', name: 'Jerome K.', tenureDays: 12,
    reliability: 0.75, morale: 0.6, wage: 85,
    skills: [{ stationId: 's3', proficiency: 0.65 }], // trained: Stage
    presentThisShift: true,
  };

  // 3-station line: all three stages must be staffed to produce finished units
  const line1: Line = {
    id: 'line1', name: 'Line A', active: true,
    stations: [
      { id: 's1', name: 'Induct',  throughputMultiplier: 1 },
      { id: 's2', name: 'Pack',    throughputMultiplier: 1 },
      { id: 's3', name: 'Stage',   throughputMultiplier: 1 },
    ],
  };

  const order1: Order = {
    id: 'ord1', clientId: 'c1', sku: 'SKU-001',
    units: 300, unitsCompleted: 0,
    deadline: 1440,
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
    workers: { w1: worker1, w2: worker2, w3: worker3 },
    lines: { line1 },
    clients: { c1: client1 },
    activeOrders: [order1],
    eventLog: [],
  };
}
