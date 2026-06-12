import { GameState, GameEvent, Client } from '../types';

// --- The client ladder: why growing the site matters ---
// Bigger clients unlock as you build a track record AND the capacity to serve
// them, and each tier pays meaningfully more per unit — but ships bigger
// orders, so you can't land them with a one-line shop. Rates are tuned so
// LABOR is the dominant early cost (~45% of starter-tier revenue): the
// workforce is the game's critical element, and the P&L has to say so. The
// ladder improves margins as you climb, but never back to free money —
// automation upkeep and the night premium keep costs scaling too.

export interface ClientTier {
  id: string;
  name: string;
  blurb: string;
  unlockAtCompleted: number;   // lifetime completed orders required
  minLines: number;            // active production lines required
  startingReputation: number;
  revenueBase: number;         // $/unit floor for this client's orders
  revenueSpread: number;       // random spread above the floor
  unitsBase: number;           // order size floor
  unitsPerLevel: number;       // growth per lifetime completed order
  unitsSpread: number;         // random spread on order size
  deadlineShifts: number;      // shifts from issue to deadline
}

// Per-level growth is deliberately gentle (it compounds for the whole run) and
// the big tiers get a third shift of runway: their orders are marathons that a
// built-up shop can pace, not sprints that bankrupt a growing one. An earlier
// tuning (+45..90 units per completion on a 2-shift clock) death-spiraled even
// a well-played site by day ~25 in simulation.
export const CLIENT_TIERS: ClientTier[] = [
  {
    id: 'c1', name: 'Cresco Distribution',
    blurb: 'The local distributor who gave you your first shot.',
    unlockAtCompleted: 0, minLines: 1, startingReputation: 0.8,
    revenueBase: 3.60, revenueSpread: 1.00,
    unitsBase: 260, unitsPerLevel: 18, unitsSpread: 50,
    deadlineShifts: 2,
  },
  {
    id: 'c2', name: 'Atlas Beverage Co.',
    blurb: 'Regional drinks brand. Bigger runs, better rates.',
    unlockAtCompleted: 6, minLines: 1, startingReputation: 0.75,
    revenueBase: 5.80, revenueSpread: 1.60,
    unitsBase: 420, unitsPerLevel: 22, unitsSpread: 80,
    deadlineShifts: 2,
  },
  {
    id: 'c3', name: 'Halcyon Home Goods',
    blurb: 'National retail kitting. Expects a multi-line shop.',
    unlockAtCompleted: 14, minLines: 2, startingReputation: 0.75,
    revenueBase: 8.80, revenueSpread: 1.60,
    unitsBase: 700, unitsPerLevel: 26, unitsSpread: 120,
    deadlineShifts: 3,
  },
  {
    id: 'c4', name: 'Northwind Pharma',
    blurb: 'The contract everyone wants. Premium pay, zero slack.',
    unlockAtCompleted: 30, minLines: 3, startingReputation: 0.7,
    revenueBase: 12.00, revenueSpread: 2.00,
    unitsBase: 1050, unitsPerLevel: 30, unitsSpread: 160,
    deadlineShifts: 3,
  },
];

const TIER_BY_ID: Record<string, ClientTier> = Object.fromEntries(
  CLIENT_TIERS.map(t => [t.id, t])
);

export function clientTier(clientId: string): ClientTier | undefined {
  return TIER_BY_ID[clientId];
}

export function activeLineCount(state: GameState): number {
  return Object.values(state.lines).filter(l => l.active).length;
}

export function tierUnlocked(state: GameState, tier: ClientTier): boolean {
  return state.completedOrders >= tier.unlockAtCompleted
    && activeLineCount(state) >= tier.minLines;
}

// All tiers the site currently qualifies for, in ladder order.
export function unlockedTiers(state: GameState): ClientTier[] {
  return CLIENT_TIERS.filter(t => tierUnlocked(state, t));
}

// The next rung the player hasn't reached — what the UI dangles as the carrot.
export function nextLockedTier(state: GameState): ClientTier | undefined {
  return CLIENT_TIERS.find(t => !state.clients[t.id]);
}

/**
 * Sign any newly-qualified client: add them to the book and announce it. Run
 * every order pass so a tier earned mid-shift lands while it still feels earned.
 */
export function processClientUnlocks(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let clients = state.clients;

  for (const tier of CLIENT_TIERS) {
    if (clients[tier.id] || !tierUnlocked(state, tier)) continue;
    const client: Client = {
      id: tier.id, name: tier.name,
      reputation: tier.startingReputation, orders: [],
    };
    clients = { ...clients, [tier.id]: client };
    events.push({
      type: 'CLIENT_UNLOCKED', tick: state.tick,
      payload: {
        clientId: tier.id, clientName: tier.name,
        revenueBase: tier.revenueBase, revenueTop: tier.revenueBase + tier.revenueSpread,
        blurb: tier.blurb,
      },
    });
  }

  if (events.length === 0) return { state, events };
  return { state: { ...state, clients }, events };
}
