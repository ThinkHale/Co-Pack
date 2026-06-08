// Formatting + worker-profile helpers ported verbatim (logic-wise) from the web App.
import {
  Worker, WorkerAppearance,
  TICKS_PER_DAY, shiftRemainingTicks, shiftElapsedTicks, dayOfTick, weekday,
  TICKS_PER_SHIFT,
} from '@copack/engine';
import { STATION_NAMES } from './theme';

export type AvatarShape = 'round' | 'square' | 'diamond' | 'wide';

export interface CharacterProfile {
  alias: string;
  firstName: string;
  role: string;
  palette: string;
  skin: string;
  hair: string;
  uniform: string;
  shape: AvatarShape;
}

const BUILD_SHAPE: Record<WorkerAppearance['build'], AvatarShape> = {
  slim: 'diamond', average: 'round', broad: 'square',
};

export function profileForWorker(worker: Worker): CharacterProfile {
  const a = worker.appearance;
  const strongestSkill = [...worker.skills].sort((x, y) => y.proficiency - x.proficiency)[0];
  const stationName = strongestSkill ? STATION_NAMES[strongestSkill.stationId] : 'Flex';
  const firstName = worker.name.split(' ')[0];
  return {
    alias: firstName,
    firstName,
    role: `${stationName} crew`,
    palette: a.accent,
    skin: a.skinTone,
    hair: a.hairColor,
    uniform: a.accent,
    shape: BUILD_SHAPE[a.build],
  };
}

export function ticksToTimeRemaining(ticks: number): string {
  if (ticks <= 0) return 'OVERDUE';
  const days = Math.floor(ticks / TICKS_PER_DAY);
  const hours = Math.floor((ticks % TICKS_PER_DAY) / 60);
  const mins = ticks % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

export function shiftLabel(tick: number): string {
  const day = dayOfTick(tick);
  return `Day ${day + 1} · ${weekday(day)}`;
}

export function shiftClock(tick: number): string {
  const rem = shiftRemainingTicks(tick);
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function shiftProgress(tick: number): number {
  return Math.min(1, Math.max(0, shiftElapsedTicks(tick) / TICKS_PER_SHIFT));
}

export function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function averageMorale(workers: Worker[]): number {
  if (workers.length === 0) return 0;
  return workers.reduce((sum, w) => sum + w.morale, 0) / workers.length;
}

export function formatAwayTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
