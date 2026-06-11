import { GameState, Worker, PayPolicy } from '../types';
import { SHIFT_HOURS } from '../time';
import { hasUnlock } from '../progression/unlocks';

// --- Pay policy: the single most consequential dial in the game ---
// Wages are real temp-labor BILL rates: the worker's hourly plus the agency's
// markup, charged per 10-hour shift. The floor is $16/hr minimum wage × ~1.38
// agency markup ≈ $22/hr billed; bringing in people with decent starting morale
// runs ~$17.50/hr+ wage, so the practical band the pay dial sweeps is
// ~$22–$30/hr billed. Pay above market and the agency sends better, stickier
// people who show up more; pay below and you bleed attendance and retention —
// and you can never bill under the legal floor anyway.

export const PAY_RATE_MIN = 0.9;
export const PAY_RATE_MAX = 1.2;
export const PAY_RATE_DEFAULT = 1.0;
export const PAY_RATE_STEP = 0.05;

// $16/hr minimum wage × agency markup ≈ $22/hr → per 10h shift. No worker can
// be billed below this no matter how far the pay dial is dropped.
export const MIN_BILL_PER_SHIFT = 22 * SHIFT_HOURS;

// Standing program costs (charged every shift, per head) and their effects.
export const ATTENDANCE_PROGRAM_PER_HEAD = 20;
export const ATTENDANCE_PROGRAM_BONUS = 0.05; // crew-wide attendance lift
export const REFERRAL_PROGRAM_PER_HEAD = 12;

const clampRate = (r: number) => Math.max(PAY_RATE_MIN, Math.min(PAY_RATE_MAX, r));

// The pay multiplier actually applied to a given worker.
export function workerPayRate(worker: Worker, policy: PayPolicy): number {
  if (!policy.perSkill) return clampRate(policy.globalRate);
  // Use the worker's strongest skill's station rate (you pay for the role they fill).
  const primary = [...worker.skills].sort((a, b) => b.proficiency - a.proficiency)[0];
  const rate = primary ? policy.skillRates[primary.stationId] : policy.globalRate;
  return clampRate(rate ?? policy.globalRate);
}

// What this worker actually costs per shift under the current policy, floored
// at the minimum legal bill rate.
export function effectiveWage(worker: Worker, policy: PayPolicy): number {
  return Math.max(MIN_BILL_PER_SHIFT, Math.round(worker.wage * workerPayRate(worker, policy)));
}

// The same cost the way a staffing manager actually thinks about it: per hour.
export function effectiveHourly(worker: Worker, policy: PayPolicy): number {
  return effectiveWage(worker, policy) / SHIFT_HOURS;
}

// Pay above market makes people more likely to show; below, less. The curve is
// asymmetric — underpaying bites attendance harder than overpaying helps, so
// shaving wages is a real gamble, not free money. (Coefficients are tuned to
// the 0.9–1.2 dial range so the endpoints carry the same weight they did when
// the dial ran 0.8–1.5.)
export function payAttendanceBonus(worker: Worker, policy: PayPolicy): number {
  const rate = workerPayRate(worker, policy);
  if (rate >= 1) return Math.min(0.07, (rate - 1) * 0.35);
  return Math.max(-0.18, (rate - 1) * 1.1); // steep penalty below market
}

// Pay above market reduces flight risk; below market raises it (asymmetric).
export function payRetentionFactor(worker: Worker, policy: PayPolicy): number {
  const rate = workerPayRate(worker, policy);
  const factor = rate >= 1
    ? 1 - (rate - 1) * 1.5
    : 1 + (1 - rate) * 3.2; // underpaying drives churn up faster
  return Math.max(0.7, Math.min(1.8, factor));
}

export function programsPerShiftCost(state: GameState): number {
  const heads = Object.keys(state.workers).length;
  return (state.programs.attendance ? heads * ATTENDANCE_PROGRAM_PER_HEAD : 0)
    + (state.programs.referral ? heads * REFERRAL_PROGRAM_PER_HEAD : 0);
}

export function attendanceProgramBonus(state: GameState): number {
  return state.programs.attendance ? ATTENDANCE_PROGRAM_BONUS : 0;
}

// --- Player actions (wired to the Staffing tab) ---

export function setGlobalPayRate(state: GameState, rate: number): GameState {
  return { ...state, payPolicy: { ...state.payPolicy, globalRate: clampRate(rate) } };
}

// Toggle a station in/out of the agency's priority skill mix for new hires.
export function toggleSkillRequest(state: GameState, stationId: string): GameState {
  const has = state.skillRequest.includes(stationId);
  const skillRequest = has
    ? state.skillRequest.filter(s => s !== stationId)
    : [...state.skillRequest, stationId];
  return { ...state, skillRequest };
}

export function toggleProgram(state: GameState, program: keyof GameState['programs']): GameState {
  // Standing programs require the HR partner retainer (purchased unlock).
  if (!hasUnlock(state, 'programs')) return state;
  return { ...state, programs: { ...state.programs, [program]: !state.programs[program] } };
}
