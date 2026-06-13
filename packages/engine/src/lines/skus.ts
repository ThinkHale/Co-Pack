import { GameState, Line, Order, Station } from '../types';
import { seededRandom } from '../utils/random';

// --- SKU profiles: the product decides the crew ---
// Every contract's SKU defines the line layout needed to run it. A standard
// carton is the classic 3-station line; a twin-pack needs two packers; a
// retail kit takes a five-body line. Heavier SKUs cluster at the bigger
// clients — which is WHY they pay more per unit. Each morning the board deals
// orders to lines and the lines physically reconfigure, so "how many people do
// I need tomorrow?" becomes a real planning question, not a constant.

export interface SkuProfile {
  id: string;
  name: string;
  short: string;          // compact tag for chips, e.g. "TWIN·4"
  roles: string[];        // ordered station roles (s1=Induct, s2=Pack, s3=Stage)
  blurb: string;
}

export const SKU_PROFILES: SkuProfile[] = [
  {
    id: 'standard', name: 'Standard carton', short: 'STD·3',
    roles: ['s1', 's2', 's3'],
    blurb: 'The bread-and-butter three-station run.',
  },
  // Starter-tier siblings: different products, same three-station line. The
  // board changes day to day so "just standard cartons every time" stops being
  // the experience, but the crew — and the early-game economics — stay a
  // learnable 3. Heavier 4-5 body layouts are still earned up the client ladder.
  {
    id: 'shrinkwrap', name: 'Shrink-wrap multipack', short: 'WRAP·3',
    roles: ['s1', 's2', 's3'],
    blurb: 'Banded multipacks — same three stations, a shrink tunnel on the end.',
  },
  {
    id: 'tray', name: 'Display tray', short: 'TRAY·3',
    roles: ['s1', 's2', 's3'],
    blurb: 'Shelf-ready trays — a tidy three-station run with a retail finish.',
  },
  {
    id: 'clamshell', name: 'Clamshell pack', short: 'SHELL·3',
    roles: ['s1', 's2', 's3'],
    blurb: 'Hinged blister packs — three stations, just a different seal.',
  },
  {
    id: 'twinpack', name: 'Twin-pack', short: 'TWIN·4',
    roles: ['s1', 's2', 's2', 's3'],
    blurb: 'Bulky double pack — takes two packers to keep pace.',
  },
  {
    id: 'bulk', name: 'Bulk intake', short: 'BULK·4',
    roles: ['s1', 's1', 's2', 's3'],
    blurb: 'Heavy inbound pallets — two on the feed.',
  },
  {
    id: 'kitting', name: 'Retail kit', short: 'KIT·5',
    roles: ['s1', 's2', 's2', 's2', 's3'],
    blurb: 'Multi-part display kits — a packing wall of three.',
  },
];

const PROFILE_BY_ID: Record<string, SkuProfile> = Object.fromEntries(
  SKU_PROFILES.map(p => [p.id, p])
);

export function skuProfile(id?: string): SkuProfile {
  return (id && PROFILE_BY_ID[id]) || PROFILE_BY_ID.standard;
}

export function orderProfile(order: Order): SkuProfile {
  return skuProfile(order.skuProfileId);
}

export function orderCrewSize(order: Order): number {
  return orderProfile(order).roles.length;
}

// Which profiles each client tier ships, with weights. The starter client
// rotates through its three-station product family (the early game stays
// learnable — always a 3-body line), while the ladder layers on heavier crews.
const TIER_SKU_MIX: Record<string, [string, number][]> = {
  c1: [['standard', 0.4], ['shrinkwrap', 0.25], ['tray', 0.2], ['clamshell', 0.15]],
  c2: [['standard', 0.5], ['twinpack', 0.5]],
  c3: [['twinpack', 0.4], ['kitting', 0.4], ['bulk', 0.2]],
  c4: [['kitting', 0.5], ['bulk', 0.25], ['twinpack', 0.25]],
};

export function pickSkuProfile(tierId: string, seed: number): SkuProfile {
  const mix = TIER_SKU_MIX[tierId] ?? TIER_SKU_MIX.c1;
  let roll = seededRandom(seed * 7177 + 13);
  for (const [id, weight] of mix) {
    roll -= weight;
    if (roll <= 0) return PROFILE_BY_ID[id];
  }
  return PROFILE_BY_ID[mix[mix.length - 1][0]];
}

// Build a line's station list for a profile. Ids stay stable for a given
// profile shape (first occurrence of a role keeps the bare role id) so
// previousAssignments / "Repeat yesterday" keep matching day over day, and
// even partially match when the profile changes (shared roles re-seat).
export function buildStationsFor(profile: SkuProfile): Station[] {
  const ROLE_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };
  const seen: Record<string, number> = {};
  return profile.roles.map(role => {
    seen[role] = (seen[role] ?? 0) + 1;
    return {
      id: seen[role] === 1 ? role : `${role}-${seen[role]}`,
      name: ROLE_NAMES[role] ?? role,
      role,
      throughputMultiplier: 1,
    };
  });
}

/**
 * The morning deal: hand each active line one open order (most urgent first)
 * and reconfigure its stations to that SKU's layout. Runs at the shift
 * boundary, right after the board is wiped — the player (or supervisor)
 * staffs the layout the day actually calls for.
 */
export function dealOrdersToLines(state: GameState): GameState {
  const incomplete = state.activeOrders
    .filter(o => o.unitsCompleted < o.units)
    .sort((a, b) => a.deadline - b.deadline);
  const lineIds = Object.keys(state.lines).filter(id => state.lines[id].active);

  const lines: Record<string, Line> = { ...state.lines };
  lineIds.forEach((lineId, i) => {
    const order = incomplete[i % Math.max(1, incomplete.length)] as Order | undefined;
    const profile = order ? orderProfile(order) : skuProfile('standard');
    lines[lineId] = {
      ...lines[lineId],
      orderId: order?.id,
      stations: buildStationsFor(profile),
    };
  });
  return { ...state, lines };
}

// Tomorrow's labor demand: the positions called for by orders that will still
// be on the board in the morning. The planning panel's headline number.
export function tomorrowPositions(state: GameState): number {
  const incomplete = state.activeOrders.filter(o => o.unitsCompleted < o.units);
  const lineCount = Object.values(state.lines).filter(l => l.active).length;
  return incomplete
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, lineCount)
    .reduce((sum, o) => sum + orderCrewSize(o), 0)
    // Lines beyond the open-order count still run standard layouts.
    + Math.max(0, lineCount - incomplete.length) * 3;
}
