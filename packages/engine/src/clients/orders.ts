import { GameState, GameEvent, Order } from '../types';
import { seededRandom } from '../utils/random';

export function processOrders(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const completedIds: string[] = [];
  const missedIds: string[] = [];
  let cash = state.cash;
  let orderCount = state.orderCount;

  for (const order of state.activeOrders) {
    if (order.unitsCompleted >= order.units) {
      const revenue = order.unitsCompleted * order.revenuePerUnit;
      cash += revenue;
      completedIds.push(order.id);
      events.push({
        type: 'ORDER_COMPLETED', tick: state.tick,
        payload: { orderId: order.id, sku: order.sku, revenue, clientId: order.clientId },
      });
    } else if (state.tick > order.deadline) {
      missedIds.push(order.id);
      events.push({
        type: 'ORDER_MISSED', tick: state.tick,
        payload: { orderId: order.id, sku: order.sku, clientId: order.clientId },
      });
    }
  }

  let activeOrders = state.activeOrders.filter(
    o => !completedIds.includes(o.id) && !missedIds.includes(o.id)
  );

  // Replace each completed or missed order with a new one
  const replacements = completedIds.length + missedIds.length;
  for (let i = 0; i < replacements; i++) {
    orderCount++;
    activeOrders = [...activeOrders, generateNextOrder(state, orderCount)];
  }

  return { state: { ...state, activeOrders, cash, orderCount }, events };
}

function generateNextOrder(state: GameState, count: number): Order {
  const rng = seededRandom(count * 31337 + state.tick);
  // Volume grows with each order; deadline stays tight at 960 ticks (2 shifts)
  const units = Math.round(280 + count * 40 + rng * 60);
  return {
    id: `ord${count}`,
    clientId: 'c1',
    sku: `SKU-${String(count).padStart(3, '0')}`,
    units,
    unitsCompleted: 0,
    deadline: state.tick + 960,
    revenuePerUnit: +(2.20 + seededRandom(count * 12345) * 0.60).toFixed(2),
    qualityThreshold: 0.9,
  };
}
