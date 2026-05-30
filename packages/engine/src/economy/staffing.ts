import { GameState, Worker, PayPolicy } from '../types';

// --- Pay policy: the single most consequential dial in the game ---
// Pay above market and the agency sends better, stickier people who show up more;
// pay below and you save on payroll but bleed attendance and retention.

export const PAY_RATE_MIN = 0.8;
export const PAY_RATE_MAX = 1.5;
export const PAY_RATE_DEFAULT = 1.0;
export const PAY_RATE_STEP = 0.05;

// Standing program costs (charged every shift, per head) and their effects.
export const ATTENDANCE_PROGRAM_PER_HEAD = 8;
export const ATTENDANCE_PROGRAM_BONUS = 0.05; // crew-wide attendance lift
export const REFERRAL_PROGRAM_PER_HEAD = 5;

const clampRate = (r: number) => Math.max(PAY_RATE_MIN, Math.min(PAY_RATE_MAX, r));

// The pay multiplier actually applied to a given worker.
export function workerPayRate(worker: Worker, policy: PayPolicy): number {
  if (!policy.perSkill) return clampRate(policy.globalRate);
  // Use the worker's strongest skill's station rate (you pay for the role they fill).
  const primary = [...worker.skills].sort((a, b) => b.proficiency - a.proficiency)[0];
  const rate = primary ? policy.skillRates[primary.stationId] : policy.globalRate;
  return clampRate(rate ?? policy.globalRate);
}

// What this worker actually costs per shift under the current policy.
export function effectiveWage(worker: Worker, policy: PayPolicy): number {
  return Math.round(worker.wage * workerPayRate(worker, policy));
}

// Pay above market makes people more likely to show; below, less. The curve is
// asymmetric — underpaying bites attendance harder than overpaying helps, so
// shaving wages is a real gamble, not free money.
export function payAttendanceBonus(worker: Worker, policy: PayPolicy): number {
  const rate = workerPayRate(worker, policy);
  if (rate >= 1) return Math.min(0.07, (rate - 1) * 0.18);
  return Math.max(-0.18, (rate - 1) * 0.55); // steep penalty below market
}

// Pay above market reduces flight risk; below market raises it (asymmetric).
export function payRetentionFactor(worker: Worker, policy: PayPolicy): number {
  const rate = workerPayRate(worker, policy);
  const factor = rate >= 1
    ? 1 - (rate - 1) * 0.6
    : 1 + (1 - rate) * 1.6; // underpaying drives churn up faster
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
  return { ...state, programs: { ...state.programs, [program]: !state.programs[program] } };
}
