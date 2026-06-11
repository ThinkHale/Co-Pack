// Event → display mapping, ported from the web App's formatEvent/toastForEvent.
import { GameEvent, TICKS_PER_DAY } from '@copack/engine';
import { STATION_NAMES, colors } from './theme';
import { pct } from './format';
import type { SoundKind } from './lib/sound';

export interface EventLine { text: string; tone: string; tag: string }

export function formatEvent(e: GameEvent): EventLine {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'WORKER_ARRIVED':
      return { text: `${p.workerName} clocked in.`, tone: 'good', tag: 'CREW' };
    case 'WORKER_NO_SHOW':
      return { text: `${p.workerName} is a no-show${p.missedShifts ? ` (${p.missedShifts} missed)` : ''}.`, tone: 'bad', tag: 'MISS' };
    case 'WORKER_SENT_HOME': {
      const delta = Math.round((p.moraleDelta as number) * 100);
      return { text: `${p.workerName} was sent home unpaid. Morale ${delta}%.`, tone: 'alert', tag: 'HOME' };
    }
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} complete. +$${(p.revenue as number).toFixed(2)}`, tone: 'good', tag: 'WIN' };
    case 'ORDER_MISSED': {
      const salvage = (p.salvage as number) ?? 0;
      return { text: `Order ${p.sku} missed.${salvage > 0 ? ` Late shipment salvaged +$${Math.round(salvage)}.` : ''}`, tone: 'bad', tag: 'LATE' };
    }
    case 'MORALE_SHIFT': {
      const delta = p.delta as number;
      const sign = delta > 0 ? '+' : '';
      return { text: `${p.workerName}: morale ${sign}${(delta * 100).toFixed(0)}% (${p.cause})`, tone: delta > 0 ? 'warm' : 'alert', tag: 'MOOD' };
    }
    case 'REPUTATION_SHIFT': {
      const delta = p.delta as number;
      const sign = delta > 0 ? '+' : '';
      return { text: `${p.clientName}: reputation ${sign}${(delta * 100).toFixed(0)}% (now ${Math.round((p.reputation as number) * 100)}%)`, tone: delta > 0 ? 'good' : 'bad', tag: 'REP' };
    }
    case 'WORKER_QUIT': {
      const tenure = p.tenureDays as number;
      const tenureNote = tenure >= 1 ? ` after ${tenure} day${tenure === 1 ? '' : 's'}` : '';
      return { text: `${p.workerName} quit${tenureNote}.`, tone: 'bad', tag: 'QUIT' };
    }
    case 'WORKER_TRAINED':
      return { text: `${p.workerName} trained on ${STATION_NAMES[p.stationId as string] ?? p.stationId} → ${pct(p.proficiency as number)}`, tone: 'good', tag: 'TRAIN' };
    case 'WORKER_HIRED':
      return { text: `${p.workerName} hired${p.referred ? ' (referral)' : ''}. -$${(p.cost as number).toFixed(0)}`, tone: 'good', tag: 'HIRE' };
    case 'WORKER_CONVERTED':
      return { text: `${p.workerName} converted to company employee.`, tone: 'good', tag: 'PERM' };
    case 'WORKER_TERMINATED':
      return { text: `${p.workerName} terminated. Missed ${p.missedShifts} · sent home ${p.sentHomeShifts}.`, tone: 'bad', tag: 'TERM' };
    case 'LEAD_PROMOTED':
      return { text: `${p.workerName} promoted to lead on ${p.lineName}.`, tone: 'good', tag: 'LEAD' };
    case 'AUTOMATION_UPGRADED':
      return { text: `${p.lineName} automation → L${p.level}. -$${(p.cost as number).toFixed(0)}`, tone: 'good', tag: 'AUTO' };
    case 'INCIDENT':
      return { text: `Incident involving ${p.workerName}${p.overtime ? ' (overtime)' : ''}. -$${(p.cost as number).toFixed(0)}`, tone: 'bad', tag: 'SAFETY' };
    case 'PAYROLL':
      return { text: `Payroll run: -$${(p.amount as number).toFixed(0)} for ${p.headcount} crew`, tone: 'alert', tag: 'PAY' };
    case 'LINE_PURCHASED':
      return { text: `${p.lineName} opened. -$${(p.cost as number).toFixed(0)}`, tone: 'good', tag: 'BUILD' };
    case 'OVERTIME_TOGGLED':
      return { text: `Overtime ${p.overtime ? 'ON — pushing output' : 'off'}.`, tone: p.overtime ? 'warm' : 'neutral', tag: 'OT' };
    case 'DAY_CONDITION': {
      const mod = p.modifier as number;
      const modNote = mod !== 0 ? ` (attendance ${mod > 0 ? '+' : ''}${Math.round(mod * 100)}%)` : '';
      return { text: `${p.label}: ${p.note}${modNote}`, tone: p.tone === 'bad' ? 'alert' : p.tone === 'good' ? 'good' : 'neutral', tag: 'DAY' };
    }
    case 'ATTENDANCE_BOOST':
      return { text: `${p.kind === 'meal' ? 'Employee meal' : 'Attendance incentive'} on — more crew show. -$${(p.cost as number).toFixed(0)}`, tone: 'warm', tag: 'PULL' };
    case 'STAFFING_REPORT': {
      const f = p.fill as number;
      const met = p.met as boolean;
      return { text: `Day ${(p.day as number) + 1} staffing ${Math.round(f * 100)}% (${p.covered}/${p.required})${met ? '' : ' — below target'}`, tone: met ? 'good' : 'alert', tag: 'BOARD' };
    }
    case 'SHIFT_CHALLENGE':
      return { text: `${p.title}${p.lineName ? ` (${p.lineName})` : ''}`, tone: 'alert', tag: 'CALL' };
    case 'SHIFT_IMPACT_REPORT':
      return { text: `Shift closed: ${p.workedCount} worked, ${p.sentHomeCount} sent home, ${p.noShowCount} no-show. ${Math.round(p.totalUnits as number)} units.`, tone: (p.sentHomeCount as number) || (p.noShowCount as number) ? 'alert' : 'good', tag: 'SHIFT' };
    case 'CHALLENGE_RESOLVED':
      return { text: `${p.result ?? p.title}`, tone: (p.reputationDelta as number | undefined) && (p.reputationDelta as number) < 0 ? 'alert' : 'good', tag: 'DONE' };
    case 'SHIFT_START': {
      const day = Math.floor(e.tick / TICKS_PER_DAY) + 1;
      return { text: `Day ${day} starting${p.auto ? ' — supervisor ran the standup' : ''}.`, tone: 'neutral', tag: 'TIME' };
    }
    case 'CLIENT_UNLOCKED':
      return { text: `New client signed: ${p.clientName} — pays up to $${(p.revenueTop as number).toFixed(2)}/unit.`, tone: 'good', tag: 'CLIENT' };
    case 'SUPERVISOR_HIRED':
      return { text: `Floor supervisor hired — the plant now runs while you're away. -$${(p.cost as number).toFixed(0)}`, tone: 'good', tag: 'OPS' };
    case 'AUTO_SHIFT_TOGGLED':
      return { text: `Auto-shift ${p.autoShift ? 'ON — the supervisor runs the mornings' : 'off — back to manual standups'}.`, tone: 'neutral', tag: 'OPS' };
    case 'OVERHEAD':
      return { text: `Overhead -$${(p.total as number).toFixed(0)} (rent${(p.supervisorSalary as number) > 0 ? ' + supervisor' : ''}).`, tone: 'alert', tag: 'RENT' };
    case 'OBJECTIVE_COMPLETED':
      return { text: `Goal cleared: ${p.label} +$${(p.reward as number).toFixed(0)}`, tone: 'good', tag: 'GOAL' };
    case 'CASH_WARNING':
      return { text: `Cash in the red ($${Math.round(p.cash as number).toLocaleString()}). Deliver orders or cut costs.`, tone: 'alert', tag: 'CASH' };
    case 'GAME_OVER':
      return { text: `The plant shut down — out of cash.`, tone: 'bad', tag: 'OVER' };
    default:
      return { text: e.type, tone: 'neutral', tag: 'LOG' };
  }
}

export const eventToneColor: Record<string, string> = {
  good: colors.green,
  bad: colors.red,
  alert: colors.amber,
  warm: colors.gold,
  neutral: colors.textMute,
};

export interface ToastSpec { text: string; tone: 'good' | 'gold' | 'bad' | 'alert'; tag: string; sound?: SoundKind }

// Which events earn a pop-up + feedback. Deliberately a subset.
export function toastForEvent(e: GameEvent): ToastSpec | null {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} shipped · +$${Math.round(p.revenue as number).toLocaleString()}`, tone: 'good', tag: 'WIN', sound: 'cash' };
    case 'OBJECTIVE_COMPLETED':
      return { text: `Goal cleared: ${p.label} · +$${(p.reward as number).toLocaleString()}`, tone: 'gold', tag: 'GOAL', sound: 'win' };
    case 'WORKER_HIRED':
      return { text: `${p.workerName} joined the crew`, tone: 'good', tag: 'HIRE', sound: 'hire' };
    case 'WORKER_CONVERTED':
      return { text: `${p.workerName} is now a company employee`, tone: 'good', tag: 'PERM', sound: 'hire' };
    case 'LEAD_PROMOTED':
      return { text: `${p.workerName} promoted to lead`, tone: 'good', tag: 'LEAD', sound: 'click' };
    case 'LINE_PURCHASED':
      return { text: `${p.lineName} opened`, tone: 'good', tag: 'BUILD', sound: 'win' };
    case 'WORKER_QUIT':
      return { text: `${p.workerName} quit`, tone: 'bad', tag: 'QUIT', sound: 'bad' };
    case 'WORKER_TERMINATED':
      return { text: `${p.workerName} terminated`, tone: 'bad', tag: 'TERM', sound: 'bad' };
    case 'INCIDENT':
      return { text: `Floor incident · -$${Math.round(p.cost as number).toLocaleString()}`, tone: 'bad', tag: 'SAFETY', sound: 'bad' };
    case 'SHIFT_CHALLENGE':
      return { text: `${p.title}`, tone: 'alert', tag: 'CALL', sound: 'alert' };
    case 'ORDER_MISSED':
      return { text: `Order ${p.sku} blew its deadline`, tone: 'bad', tag: 'LATE', sound: 'alert' };
    case 'CASH_WARNING':
      return { text: `Cash in the red — deliver orders or cut costs`, tone: 'alert', tag: 'CASH', sound: 'alert' };
    case 'CLIENT_UNLOCKED':
      return { text: `New client: ${p.clientName} — better rates unlocked`, tone: 'gold', tag: 'CLIENT', sound: 'win' };
    case 'SUPERVISOR_HIRED':
      return { text: `Supervisor hired — the plant earns while you're away`, tone: 'gold', tag: 'OPS', sound: 'win' };
    case 'GAME_OVER':
      return { text: `The plant shut down`, tone: 'bad', tag: 'OVER', sound: 'over' };
    default:
      return null;
  }
}

export const toastToneColor: Record<ToastSpec['tone'], string> = {
  good: colors.green,
  gold: colors.gold,
  bad: colors.red,
  alert: colors.amber,
};
