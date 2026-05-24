import { GameState, GameEvent } from '../types';

export function processOrders(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const completedIds: string[] = [];
  const missedIds: string[] = [];
  let cash = state.cash;

  for (const order of state.activeOrders) {
    if (order.unitsCompleted >= order.units) {
      const revenue = order.unitsCompleted * order.revenuePerUnit;
      cash += revenue;
      completedIds.push(order.id);
      events.push({ type: 'ORDER_COMPLETED', tick: state.tick, payload: { orderId: order.id, revenue, clientId: order.clientId } });
    } else if (state.tick > order.deadline) {
      missedIds.push(order.id);
      events.push({ type: 'ORDER_MISSED', tick: state.tick, payload: { orderId: order.id, clientId: order.clientId } });
    }
  }

  const activeOrders = state.activeOrders.filter(o => !completedIds.includes(o.id) && !missedIds.includes(o.id));
  return { state: { ...state, activeOrders, cash }, events };
}
