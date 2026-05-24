import { GameState, Worker, Line, Client, Order } from './types';

export function createInitialState(): GameState {
  const worker1: Worker = {
    id: 'w1', name: 'Marcus T.', tenureDays: 0,
    reliability: 0.85, morale: 0.7,
    skills: [{ stationId: 's1', proficiency: 0.6 }],
    presentThisShift: true,
  };
  const worker2: Worker = {
    id: 'w2', name: 'Diana R.', tenureDays: 45,
    reliability: 0.92, morale: 0.8,
    skills: [{ stationId: 's2', proficiency: 0.8 }],
    presentThisShift: true,
  };
  const worker3: Worker = {
    id: 'w3', name: 'Jerome K.', tenureDays: 12,
    reliability: 0.75, morale: 0.6,
    skills: [{ stationId: 's1', proficiency: 0.5 }],
    presentThisShift: true,
  };

  const line1: Line = {
    id: 'line1', name: 'Line A', active: true,
    stations: [
      { id: 's1', name: 'Induct',  assignedWorkerId: 'w1', throughputMultiplier: 1 },
      { id: 's2', name: 'Pack',    assignedWorkerId: 'w2', throughputMultiplier: 1 },
      { id: 's3', name: 'Label',   assignedWorkerId: 'w3', throughputMultiplier: 1 },
      { id: 's4', name: 'Seal',    throughputMultiplier: 1 },
      { id: 's5', name: 'Audit',   throughputMultiplier: 1 },
      { id: 's6', name: 'Stage',   throughputMultiplier: 1 },
    ],
  };

  const order1: Order = {
    id: 'ord1', clientId: 'c1', sku: 'SKU-001',
    units: 500, unitsCompleted: 0,
    deadline: 2880, revenuePerUnit: 0.85, qualityThreshold: 0.9,
  };

  const client1: Client = {
    id: 'c1', name: 'Cresco Distribution',
    reputation: 0.8, orders: [order1],
  };

  return {
    tick: 0, day: 0, cash: 5000, orderCount: 1,
    workers: { w1: worker1, w2: worker2, w3: worker3 },
    lines: { line1 },
    clients: { c1: client1 },
    activeOrders: [order1],
    eventLog: [],
  };
}
