import { GameState, GameEvent, Order, Client } from '../types';
import { seededRandom } from '../utils/random';
import { TICKS_PER_DAY } from '../time';
import { ClientTier, CLIENT_TIERS, unlockedTiers } from './roster';
import { pickSkuProfile } from '../lines/skus';

// Reputation pays. A trusted shop earns full price; a struggling one gets squeezed.
const REP_ON_COMPLETE = 0.03; // recover trust by delivering
const REP_ON_MISS = 0.09;     // lose trust by missing a deadline
const REP_FLOOR = 0.05;       // never quite zero — there's always a road back

// Revenue multiplier from a client's reputation (0.70x at rock bottom → 1.0x at full trust).
export function reputationPayMultiplier(reputation: number): number {
  return 0.7 + reputation * 0.3;
}

// A blown deadline still ships what was packed — at half rate. Misses sting
// (lost margin + the reputation hit) without vaporizing a shift's work, which
// is what used to death-spiral a struggling site into bankruptcy.
export const LATE_SALVAGE_RATE = 0.5;

export function processOrders(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  const completedIds: string[] = [];
  const missedIds: string[] = [];
  let cash = state.cash;
  let orderCount = state.orderCount;
  let completedOrders = state.completedOrders;
  let missedOrders = state.missedOrders;
  const clients: Record<string, Client> = { ...state.clients };

  const adjustReputation = (clientId: string, delta: number) => {
    const client = clients[clientId];
    if (!client) return;
    const reputation = Math.max(REP_FLOOR, Math.min(1, client.reputation + delta));
    clients[clientId] = { ...client, reputation };
    events.push({
      type: 'REPUTATION_SHIFT', tick: state.tick,
      payload: { clientId, clientName: client.name, delta, reputation },
    });
  };

  for (const order of state.activeOrders) {
    if (order.unitsCompleted >= order.units) {
      const client = clients[order.clientId];
      const payMultiplier = reputationPayMultiplier(client?.reputation ?? 1);
      const revenue = order.unitsCompleted * order.revenuePerUnit * payMultiplier;
      cash += revenue;
      completedIds.push(order.id);
      completedOrders++;
      events.push({
        type: 'ORDER_COMPLETED', tick: state.tick,
        payload: { orderId: order.id, sku: order.sku, revenue, clientId: order.clientId },
      });
      adjustReputation(order.clientId, REP_ON_COMPLETE);
    } else if (state.tick > order.deadline) {
      const client = clients[order.clientId];
      const payMultiplier = reputationPayMultiplier(client?.reputation ?? 1);
      const salvage = order.unitsCompleted * order.revenuePerUnit * payMultiplier * LATE_SALVAGE_RATE;
      cash += salvage;
      missedIds.push(order.id);
      missedOrders++;
      events.push({
        type: 'ORDER_MISSED', tick: state.tick,
        payload: { orderId: order.id, sku: order.sku, clientId: order.clientId, salvage },
      });
      adjustReputation(order.clientId, -REP_ON_MISS);
    }
  }

  let activeOrders = state.activeOrders.filter(
    o => !completedIds.includes(o.id) && !missedIds.includes(o.id)
  );

  // Keep the contract board topped up: one open order per active line, so every
  // line you buy has its own work and bench capacity actually pays off. Difficulty
  // scales with orders *fulfilled*, not raw time — a player who falls behind isn't
  // buried under ever-bigger orders they can never catch.
  const target = targetOrderCount(state);
  while (activeOrders.length < target) {
    orderCount++;
    const tier = pickOrderTier(state, activeOrders);
    activeOrders = [...activeOrders, generateNextOrder(state, orderCount, completedOrders, tier)];
  }

  return { state: { ...state, activeOrders, cash, orderCount, completedOrders, missedOrders, clients }, events };
}

// The contract board holds one open order per active line (always at least one),
// so capacity you buy translates into work you can actually run in parallel.
export function targetOrderCount(state: GameState): number {
  return Math.max(1, Object.values(state.lines).filter(l => l.active).length);
}

// Lifetime order fill rate (0..1). The headline scoreboard — target is 0.95.
export function fillRate(state: GameState): number {
  const total = state.completedOrders + state.missedOrders;
  if (total === 0) return 1;
  return state.completedOrders / total;
}

export const FILL_RATE_TARGET = 0.95;

// Which client the next contract comes from. The board prefers the best-paying
// unlocked client that doesn't already have an open order — so landing a new
// tier immediately changes what's on the board — and falls back to the starter
// tier as safe filler once every signed client has work queued.
function pickOrderTier(state: GameState, activeOrders: Order[]): ClientTier {
  const signed = unlockedTiers(state).filter(t => state.clients[t.id]);
  const candidates = signed.length > 0 ? signed : [CLIENT_TIERS[0]];
  const open = new Set(activeOrders.map(o => o.clientId));
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!open.has(candidates[i].id)) return candidates[i];
  }
  return candidates[0];
}

function generateNextOrder(state: GameState, count: number, level: number, tier: ClientTier): Order {
  const rng = seededRandom(count * 31337 + state.tick);
  // Volume grows with the tier and the player's track record; the deadline
  // clock is the same for everyone — bigger contracts demand a bigger site.
  const units = Math.round(tier.unitsBase + level * tier.unitsPerLevel + rng * tier.unitsSpread);
  return {
    id: `ord${count}`,
    clientId: tier.id,
    sku: `SKU-${String(count).padStart(3, '0')}`,
    units,
    unitsCompleted: 0,
    deadline: state.tick + TICKS_PER_DAY * tier.deadlineShifts,
    revenuePerUnit: +(tier.revenueBase + seededRandom(count * 12345) * tier.revenueSpread).toFixed(2),
    qualityThreshold: 0.9,
    skuProfileId: pickSkuProfile(tier.id, count).id,
  };
}
