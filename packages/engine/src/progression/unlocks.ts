import { GameState, GameEvent } from '../types';

// --- Purchasable feature unlocks: the early upgrade cadence ---
// Capabilities that used to be free from minute one are now one-time Front
// Office purchases. With a lean starting bankroll, this gives the early game a
// steady rhythm of save-up → unlock → new lever, well before the big-ticket
// line/automation/supervisor tier — and makes every dollar a decision instead
// of a score.

export type FeatureUnlockId = 'overtime' | 'support' | 'programs';

export interface FeatureUnlock {
  id: FeatureUnlockId;
  name: string;
  cost: number;
  blurb: string;
}

export const FEATURE_UNLOCKS: FeatureUnlock[] = [
  {
    id: 'programs', name: 'HR partner retainer', cost: 2000,
    blurb: 'Unlocks the standing attendance & referral programs on the Staffing tab.',
  },
  {
    id: 'overtime', name: 'Overtime authorization', cost: 2500,
    blurb: 'Unlocks the Overtime toggle — push output past regular hours, at a morale cost.',
  },
  {
    id: 'support', name: 'Floater program', cost: 3500,
    blurb: 'Unlocks the support slot on every line — a paid helper for an output lift.',
  },
];

const UNLOCK_BY_ID: Record<string, FeatureUnlock> = Object.fromEntries(
  FEATURE_UNLOCKS.map(u => [u.id, u])
);

export function featureUnlock(id: string): FeatureUnlock | undefined {
  return UNLOCK_BY_ID[id];
}

export function hasUnlock(state: GameState, id: FeatureUnlockId): boolean {
  return state.unlocks.includes(id);
}

export function canBuyUnlock(state: GameState, id: FeatureUnlockId): boolean {
  const unlock = UNLOCK_BY_ID[id];
  return !!unlock && !hasUnlock(state, id) && state.cash >= unlock.cost;
}

export function purchaseUnlock(state: GameState, id: FeatureUnlockId): { state: GameState; events: GameEvent[] } {
  if (!canBuyUnlock(state, id)) return { state, events: [] };
  const unlock = UNLOCK_BY_ID[id];
  const events: GameEvent[] = [{
    type: 'FEATURE_UNLOCKED', tick: state.tick,
    payload: { id: unlock.id, name: unlock.name, cost: unlock.cost },
  }];
  return {
    state: { ...state, cash: state.cash - unlock.cost, unlocks: [...state.unlocks, id] },
    events,
  };
}
