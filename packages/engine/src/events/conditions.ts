import { GameState, GameEvent, Worker } from '../types';
import { seededRandom } from '../utils/random';

// --- Daily conditions (out of the player's control, revealed each morning) ---
// These shift the WHOLE crew's odds of showing up, the way real life does:
// weather and holidays move attendance for everyone at once.

export type DayConditionKey =
  | 'normal' | 'clear' | 'storm' | 'cold_snap' | 'holiday_adjacent' | 'community';

export interface DayCondition {
  key: DayConditionKey;
  label: string;
  note: string;
  modifier: number;            // added to every worker's attendance probability
  tone: 'good' | 'bad' | 'neutral';
}

export function dayCondition(day: number): DayCondition {
  // Day one is always a clean opening — no storm should ever greet a brand-new
  // player before they've even staffed a line. The weather lottery starts day two.
  if (day <= 0) {
    return { key: 'clear', label: 'Opening day', note: 'Clear skies — full crew expected', modifier: 0.05, tone: 'good' };
  }
  const r = seededRandom(day * 7919 + 17);
  if (r < 0.13) return { key: 'storm', label: 'Storm', note: 'Bad weather — fewer make it in', modifier: -0.16, tone: 'bad' };
  if (r < 0.23) return { key: 'holiday_adjacent', label: 'Holiday window', note: 'Around a holiday — call-outs climb', modifier: -0.13, tone: 'bad' };
  if (r < 0.31) return { key: 'cold_snap', label: 'Cold snap', note: 'Rough commute this morning', modifier: -0.08, tone: 'bad' };
  if (r < 0.45) return { key: 'clear', label: 'Clear skies', note: 'Easy commute — good turnout', modifier: 0.05, tone: 'good' };
  return { key: 'normal', label: 'Normal day', note: 'Typical turnout', modifier: 0, tone: 'neutral' };
}

// --- Emergency levers (a meal or an incentive to rescue a bad day) ---
// These are NOT routine. They're what you pull when a storm lands on a big order:
// a real morale + attendance jolt, but expensive (a flat hit plus per-head) and on
// a cooldown so you can't lean on them every day. Frequent small morale nudges are
// the free Shout-out's job; this is the break-glass button.

const MEAL_FLAT = 600;
const MEAL_PER_HEAD = 35;
const MEAL_ATTENDANCE = 0.14;
const MEAL_MORALE = 0.06;
const MEAL_COOLDOWN_DAYS = 4;

const INCENTIVE_FLAT = 1200;
const INCENTIVE_PER_HEAD = 70;
const INCENTIVE_ATTENDANCE = 0.24;
const INCENTIVE_MORALE = 0.10;
const INCENTIVE_COOLDOWN_DAYS = 6;

export { MEAL_COOLDOWN_DAYS, INCENTIVE_COOLDOWN_DAYS };

export function mealCost(state: GameState): number {
  return MEAL_FLAT + Object.keys(state.workers).length * MEAL_PER_HEAD;
}

export function incentiveCost(state: GameState): number {
  return INCENTIVE_FLAT + Object.keys(state.workers).length * INCENTIVE_PER_HEAD;
}

// Is each lever available right now (off cooldown and not already pulled today)?
export function mealReady(state: GameState): boolean {
  return !state.mealToday && state.day >= state.mealCooldownUntil;
}

export function incentiveReady(state: GameState): boolean {
  return !state.incentiveToday && state.day >= state.incentiveCooldownUntil;
}

// Days until each lever recharges (0 = available now).
export function mealCooldownRemaining(state: GameState): number {
  return Math.max(0, state.mealCooldownUntil - state.day);
}

export function incentiveCooldownRemaining(state: GameState): number {
  return Math.max(0, state.incentiveCooldownUntil - state.day);
}

// Total bump to attendance probability for today, from condition + active levers.
export function dayAttendanceModifier(state: GameState): number {
  return dayCondition(state.day).modifier
    + (state.mealToday ? MEAL_ATTENDANCE : 0)
    + (state.incentiveToday ? INCENTIVE_ATTENDANCE : 0);
}

function bumpMorale(workers: Record<string, Worker>, delta: number): Record<string, Worker> {
  return Object.fromEntries(
    Object.entries(workers).map(([id, w]) => [id, { ...w, morale: Math.min(1, w.morale + delta) }])
  );
}

export function provideMeal(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!mealReady(state)) return { state, events: [] };
  const cost = mealCost(state);
  if (state.cash < cost) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'ATTENDANCE_BOOST', tick: state.tick,
    payload: { kind: 'meal', cost, attendance: MEAL_ATTENDANCE },
  }];
  return {
    state: {
      ...state,
      cash: state.cash - cost,
      mealToday: true,
      mealCooldownUntil: state.day + MEAL_COOLDOWN_DAYS,
      workers: bumpMorale(state.workers, MEAL_MORALE),
    },
    events,
  };
}

export function runIncentive(state: GameState): { state: GameState; events: GameEvent[] } {
  if (!incentiveReady(state)) return { state, events: [] };
  const cost = incentiveCost(state);
  if (state.cash < cost) return { state, events: [] };
  const events: GameEvent[] = [{
    type: 'ATTENDANCE_BOOST', tick: state.tick,
    payload: { kind: 'incentive', cost, attendance: INCENTIVE_ATTENDANCE },
  }];
  return {
    state: {
      ...state,
      cash: state.cash - cost,
      incentiveToday: true,
      incentiveCooldownUntil: state.day + INCENTIVE_COOLDOWN_DAYS,
      workers: bumpMorale(state.workers, INCENTIVE_MORALE),
    },
    events,
  };
}
