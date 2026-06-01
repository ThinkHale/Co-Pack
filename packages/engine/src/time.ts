// --- Time model (single source of truth) ---
// 1 tick = 1 game-minute. The operating unit is a single 10-hour shift, and one
// shift IS one operating day — so "Day 5" means your 5th shift on the floor. This
// keeps the clock the player reads (a 10h shift counting down) and the day counter
// in lockstep, instead of the old 8h-shift / 24h-day split that read as disconnected.

export const TICK_MINUTES = 1;
export const SHIFT_HOURS = 10;
export const TICKS_PER_SHIFT = SHIFT_HOURS * 60; // 600 ticks = one 10h shift
export const TICKS_PER_DAY = TICKS_PER_SHIFT;     // one operating shift per day

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayOfTick(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

// True at the first tick of a shift (when attendance/payroll/morale recompute).
export function isShiftStart(tick: number): boolean {
  return tick % TICKS_PER_SHIFT === 0;
}

export function shiftElapsedTicks(tick: number): number {
  return tick % TICKS_PER_SHIFT;
}

export function shiftRemainingTicks(tick: number): number {
  return TICKS_PER_SHIFT - shiftElapsedTicks(tick);
}

export function weekday(day: number): string {
  return WEEKDAYS[((day % WEEKDAYS.length) + WEEKDAYS.length) % WEEKDAYS.length];
}
