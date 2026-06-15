import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GameState, GameEvent, Line, Order, Worker, Station,
  nextLineCost, canBuyLine, shoutoutReady, totalPayroll,
  reputationPayMultiplier,
  fillRate, FILL_RATE_TARGET, flightRisk, trainingCost, canTrain,
  dayCondition, dayAttendanceModifier, mealCost, incentiveCost,
  mealReady, incentiveReady, mealCooldownRemaining, incentiveCooldownRemaining,
  moraleBreakdown, effectiveWage, effectiveHourly, SHIFT_HOURS,
  PAY_RATE_MIN, PAY_RATE_MAX, PAY_RATE_STEP, PAY_RATE_DEFAULT,
  ATTENDANCE_PROGRAM_PER_HEAD, REFERRAL_PROGRAM_PER_HEAD, programsPerShiftCost,
  automationCost, canAutomate, automationMultiplier, AUTOMATION_MAX_LEVEL,
  LEAD_COST, conversionCost,
  workerTraits, WorkerAppearance,
  STAFFING_TARGET, requiredPositions, coveredPositions, staffingFill, rollingStaffingFill,
  totalThroughput, lineThroughput,
  openObjectives, OBJECTIVES, Objective,
  TICKS_PER_DAY, TICKS_PER_SHIFT, shiftRemainingTicks, shiftElapsedTicks, dayOfTick, weekday,
  canRepeatStaffing, SUPPORT_STATION_ID, SUPPORT_OUTPUT_BONUS, UNTRAINED_PROFICIENCY,
  stationRole, orderProfile, skuProfile, tomorrowPositions, expectedAttendance, ADVANCE_HIRE_COST,
  facilityOverhead, SUPERVISOR_COST, SUPERVISOR_SALARY_PER_SHIFT, canHireSupervisor, AUTOMATION_UPKEEP_PER_LEVEL,
  CLIENT_TIERS, FEATURE_UNLOCKS, hasUnlock, canBuyUnlock, FeatureUnlockId,
  nightShiftActive, NIGHT_OUTPUT_BONUS, NIGHT_LABOR_RATE, NIGHT_OVERHEAD,
} from '@copack/engine';
import { useGameStore, SpeedSetting, TabKey, HIRE_COST } from './hooks/useGameStore';
import { playSound, unlockAudio, SoundKind } from './lib/sound';
import type { OfflineSummary } from './lib/persistence';

type CharacterProfile = {
  alias: string;      // the worker's first name — they're real people now
  firstName: string;  // alias of alias, used by the station/bench cards
  role: string;       // derived from their strongest station
  palette: string;
  skin: string;
  hair: string;
  uniform: string;
  shape: 'round' | 'square' | 'diamond' | 'wide';
};

const STATION_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };
const STATION_THEMES: Record<string, { icon: string; color: string; note: string }> = {
  s1: { icon: 'IN', color: '#35d0ba', note: 'Feed' },
  s2: { icon: 'PK', color: '#ffb02e', note: 'Build' },
  s3: { icon: 'ST', color: '#ff5f7e', note: 'Ship' },
};

// Map the engine's structured build to an avatar silhouette.
const BUILD_SHAPE: Record<WorkerAppearance['build'], CharacterProfile['shape']> = {
  slim: 'diamond', average: 'round', broad: 'square',
};

function ticksToTimeRemaining(ticks: number): string {
  if (ticks <= 0) return 'OVERDUE';
  const days = Math.floor(ticks / TICKS_PER_DAY);
  const hours = Math.floor((ticks % TICKS_PER_DAY) / 60);
  const mins = ticks % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

// "Day 3 · Wed" — one operating shift per day, so day and shift are the same unit.
function shiftLabel(tick: number): string {
  const day = dayOfTick(tick);
  return `Day ${day + 1} · ${weekday(day)}`;
}

// Time left in the current 10-hour shift, as H:MM counting down.
function shiftClock(tick: number): string {
  const rem = shiftRemainingTicks(tick);
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function profileForWorker(worker: Worker): CharacterProfile {
  const a = worker.appearance;
  const strongestSkill = [...worker.skills].sort((a, b) => b.proficiency - a.proficiency)[0];
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

function averageMorale(workers: Worker[]): number {
  if (workers.length === 0) return 0;
  return workers.reduce((sum, worker) => sum + worker.morale, 0) / workers.length;
}

function formatAwayTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatEvent(e: GameEvent): { text: string; tone: string; tag: string } {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'WORKER_ARRIVED':
      return { text: `${p.workerName} clocked in.`, tone: 'event-good', tag: 'CREW' };
    case 'WORKER_NO_SHOW':
      return { text: `${p.workerName} is a no-show${p.missedShifts ? ` (${p.missedShifts} missed)` : ''}.`, tone: 'event-bad', tag: 'MISS' };
    case 'WORKER_SENT_HOME': {
      const delta = Math.round((p.moraleDelta as number) * 100);
      return { text: `${p.workerName} was sent home unpaid. Morale ${delta}%.`, tone: 'event-alert', tag: 'HOME' };
    }
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} complete. +$${(p.revenue as number).toFixed(2)}`, tone: 'event-good', tag: 'WIN' };
    case 'ORDER_MISSED': {
      const salvage = (p.salvage as number) ?? 0;
      return {
        text: `Order ${p.sku} missed.${salvage > 0 ? ` Late shipment salvaged +$${Math.round(salvage)}.` : ''}`,
        tone: 'event-bad', tag: 'LATE',
      };
    }
    case 'MORALE_SHIFT': {
      const delta = p.delta as number;
      const sign = delta > 0 ? '+' : '';
      return {
        text: `${p.workerName}: morale ${sign}${(delta * 100).toFixed(0)}% (${p.cause})`,
        tone: delta > 0 ? 'event-warm' : 'event-alert',
        tag: 'MOOD',
      };
    }
    case 'REPUTATION_SHIFT': {
      const delta = p.delta as number;
      const sign = delta > 0 ? '+' : '';
      return {
        text: `${p.clientName}: reputation ${sign}${(delta * 100).toFixed(0)}% (now ${Math.round((p.reputation as number) * 100)}%)`,
        tone: delta > 0 ? 'event-good' : 'event-bad',
        tag: 'REP',
      };
    }
    case 'WORKER_QUIT': {
      const tenure = p.tenureDays as number;
      const tenureNote = tenure >= 1 ? ` after ${tenure} day${tenure === 1 ? '' : 's'}` : '';
      return { text: `${p.workerName} quit${tenureNote}.`, tone: 'event-bad', tag: 'QUIT' };
    }
    case 'WORKER_TRAINED':
      return {
        text: `${p.workerName} trained on ${STATION_NAMES[p.stationId as string] ?? p.stationId} → ${pct(p.proficiency as number)}`,
        tone: 'event-good', tag: 'TRAIN',
      };
    case 'WORKER_HIRED':
      return p.preordered
        ? { text: `${p.workerName} arrived from the agency (advance order).`, tone: 'event-good', tag: 'HIRE' }
        : { text: `${p.workerName} hired${p.referred ? ' (referral)' : ''}. -$${(p.cost as number).toFixed(0)}`, tone: 'event-good', tag: 'HIRE' };
    case 'WORKER_CONVERTED':
      return { text: `${p.workerName} converted to company employee.`, tone: 'event-good', tag: 'PERM' };
    case 'WORKER_TERMINATED':
      return { text: `${p.workerName} terminated. Missed ${p.missedShifts} · sent home ${p.sentHomeShifts}.`, tone: 'event-bad', tag: 'TERM' };
    case 'LEAD_PROMOTED':
      return { text: `${p.workerName} promoted to lead on ${p.lineName}.`, tone: 'event-good', tag: 'LEAD' };
    case 'AUTOMATION_UPGRADED':
      return { text: `${p.lineName} automation → L${p.level}. -$${(p.cost as number).toFixed(0)}`, tone: 'event-good', tag: 'AUTO' };
    case 'INCIDENT':
      return {
        text: `Incident involving ${p.workerName}${p.overtime ? ' (overtime)' : ''}. -$${(p.cost as number).toFixed(0)}`,
        tone: 'event-bad', tag: 'SAFETY',
      };
    case 'PAYROLL':
      return { text: `Payroll run: -$${(p.amount as number).toFixed(0)} for ${p.headcount} crew`, tone: 'event-alert', tag: 'PAY' };
    case 'LINE_PURCHASED':
      return { text: `${p.lineName} opened. -$${(p.cost as number).toFixed(0)}`, tone: 'event-good', tag: 'BUILD' };
    case 'OVERTIME_TOGGLED':
      return { text: `Overtime ${p.overtime ? 'ON — pushing output' : 'off'}.`, tone: p.overtime ? 'event-warm' : 'event-neutral', tag: 'OT' };
    case 'DAY_CONDITION': {
      const mod = p.modifier as number;
      const modNote = mod !== 0 ? ` (attendance ${mod > 0 ? '+' : ''}${Math.round(mod * 100)}%)` : '';
      return {
        text: `${p.label}: ${p.note}${modNote}`,
        tone: p.tone === 'bad' ? 'event-alert' : p.tone === 'good' ? 'event-good' : 'event-neutral',
        tag: 'DAY',
      };
    }
    case 'ATTENDANCE_BOOST':
      return {
        text: `${p.kind === 'meal' ? 'Employee meal' : 'Attendance incentive'} on — more crew show. -$${(p.cost as number).toFixed(0)}`,
        tone: 'event-warm', tag: 'PULL',
      };
    case 'STAFFING_REPORT': {
      const f = p.fill as number;
      const met = p.met as boolean;
      return {
        text: `Day ${(p.day as number) + 1} staffing ${Math.round(f * 100)}% (${p.covered}/${p.required})${met ? '' : ' — below target'}`,
        tone: met ? 'event-good' : 'event-alert', tag: 'BOARD',
      };
    }
    case 'SHIFT_CHALLENGE':
      return {
        text: `${p.title}${p.lineName ? ` (${p.lineName})` : ''}`,
        tone: 'event-alert', tag: 'CALL',
      };
    case 'SHIFT_IMPACT_REPORT':
      return {
        text: `Shift closed: ${p.workedCount} worked, ${p.sentHomeCount} sent home, ${p.noShowCount} no-show. ${Math.round(p.totalUnits as number)} units.`,
        tone: (p.sentHomeCount as number) || (p.noShowCount as number) ? 'event-alert' : 'event-good',
        tag: 'SHIFT',
      };
    case 'CHALLENGE_RESOLVED':
      return {
        text: `${p.result ?? p.title}`,
        tone: (p.reputationDelta as number | undefined) && (p.reputationDelta as number) < 0 ? 'event-alert' : 'event-good',
        tag: 'DONE',
      };
    case 'SHIFT_START': {
      const day = Math.floor(e.tick / TICKS_PER_DAY) + 1;
      return {
        text: `Day ${day} starting${p.auto ? ' — supervisor ran the standup' : ''}.`,
        tone: 'event-neutral', tag: 'TIME',
      };
    }
    case 'CLIENT_UNLOCKED':
      return {
        text: `New client signed: ${p.clientName} — pays up to $${(p.revenueTop as number).toFixed(2)}/unit.`,
        tone: 'event-good', tag: 'CLIENT',
      };
    case 'SUPERVISOR_HIRED':
      return {
        text: `Floor supervisor hired — the plant now runs while you're away. -$${(p.cost as number).toFixed(0)}`,
        tone: 'event-good', tag: 'OPS',
      };
    case 'AUTO_SHIFT_TOGGLED':
      return {
        text: `Auto-shift ${p.autoShift ? 'ON — the supervisor runs the mornings' : 'off — back to manual standups'}.`,
        tone: 'event-neutral', tag: 'OPS',
      };
    case 'FEATURE_UNLOCKED':
      return {
        text: `Upgrade purchased: ${p.name}. -$${(p.cost as number).toFixed(0)}`,
        tone: 'event-good', tag: 'SHOP',
      };
    case 'WORKERS_REQUESTED':
      return {
        text: `Reserved ${p.count} worker${(p.count as number) > 1 ? 's' : ''} for tomorrow's standup. -$${(p.cost as number).toFixed(0)}`,
        tone: 'event-good', tag: 'PLAN',
      };
    case 'NIGHT_SHIFT_TOGGLED':
      return {
        text: `Night shift ${p.nightShift ? 'ON — the plant runs around the clock' : 'off — back to days only'}.`,
        tone: p.nightShift ? 'event-warm' : 'event-neutral', tag: 'NIGHT',
      };
    case 'OVERHEAD': {
      const parts = ['rent'];
      if ((p.automation as number) > 0) parts.push('automation');
      if ((p.supervisorSalary as number) > 0) parts.push('supervisor');
      if ((p.night as number) > 0) parts.push('nights');
      return {
        text: `Overhead -$${(p.total as number).toFixed(0)} (${parts.join(' + ')}).`,
        tone: 'event-alert', tag: 'RENT',
      };
    }
    case 'OBJECTIVE_COMPLETED':
      return { text: `Goal cleared: ${p.label} +$${(p.reward as number).toFixed(0)}`, tone: 'event-good', tag: 'GOAL' };
    case 'CASH_WARNING':
      return { text: `Cash in the red ($${Math.round(p.cash as number).toLocaleString()}). Deliver orders or cut costs.`, tone: 'event-alert', tag: 'CASH' };
    case 'GAME_OVER':
      return { text: `The plant shut down — out of cash.`, tone: 'event-bad', tag: 'OVER' };
    default:
      return { text: e.type, tone: 'event-neutral', tag: 'LOG' };
  }
}

export default function App() {
  const bootedFromSave = useGameStore(s => s.bootedFromSave);
  const [splashDone, setSplashDone] = useState(bootedFromSave);
  if (!splashDone) {
    return <SplashScreen onStart={() => { unlockAudio(); setSplashDone(true); }} />;
  }
  return <Game />;
}

function Game() {
  const {
    state, events, paused, speed, tab, soundOn, offlineSummary,
    runTick, reset, togglePause, setSpeed, setTab, toggleSound, dismissOffline, save,
    selectedWorkerId, selectWorker, assignWorker, unassignStation, hireWorker,
    buyLine, toggleOvertime, shoutout, train, buyMeal, runIncentive, repeatStaffing, startShift,
    resolveChallenge, setPayRate, toggleSkill, toggleProgram, upgradeAutomation, promoteLead, convertWorker, terminateWorker,
    hireSupervisor, toggleAutoShift, autoFillCrew, buyUnlock, toggleNightShift, requestWorkers,
    adsOn, adFree, lastAdDay, adVisible, showAd, dismissAd, removeAds, toggleAdsTesting,
    tutorialDone, tutorialActive, tutorialStep, startTutorial, advanceTutorial, finishTutorial,
  } = useGameStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameOver = state.gameOver;
  const awaitingStaffing = state.awaitingStaffing;

  // The sim clock. Stops when paused, during the morning standup, after a
  // shutdown, or while an interstitial is on screen.
  useEffect(() => {
    if (paused || gameOver || awaitingStaffing || adVisible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const ms = 1000 / speed;
    intervalRef.current = setInterval(runTick, ms);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runTick, paused, speed, gameOver, awaitingStaffing, adVisible]);

  // Autosave: every few seconds and whenever the tab is hidden or closed, so a
  // refresh or a backgrounded phone never loses the run.
  useEffect(() => {
    const id = setInterval(save, 3000);
    const onHide = () => save();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [save]);

  // Toasts + sound: react to the latest batch of engine events exactly once.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastEventsRef = useRef<GameEvent[] | null>(null);
  useEffect(() => {
    if (events === lastEventsRef.current || !events || events.length === 0) return;
    lastEventsRef.current = events;
    const fresh: ToastItem[] = [];
    for (const e of events) {
      const spec = toastForEvent(e);
      if (!spec) continue;
      if (soundOn && spec.sound) playSound(spec.sound);
      fresh.push({ id: `${e.tick}-${e.type}-${fresh.length}-${Date.now()}`, ...spec });
    }
    if (fresh.length) setToasts(prev => [...prev, ...fresh].slice(-4));
  }, [events, soundOn]);

  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Station-first staffing: click an empty station → best-fit picker appears
  // right there. Kills bench↔station round trips on multi-line floors.
  const [pickerTarget, setPickerTarget] = useState<{ lineId: string; stationId: string; stationName: string; role: string } | null>(null);

  // Confetti on the golden moments (goals, new clients, upgrades).
  const [confetti, setConfetti] = useState(0);
  useEffect(() => {
    if (!events || events.length === 0) return;
    if (events.some(e => ['OBJECTIVE_COMPLETED', 'CLIENT_UNLOCKED', 'FEATURE_UNLOCKED', 'SUPERVISOR_HIRED'].includes(e.type))) {
      setConfetti(c => c + 1);
    }
  }, [events]);

  // Interstitial cadence: one ad every AD_INTERVAL_DAYS shifts, never during
  // the tutorial and never twice for the same day. The seam where a real ad
  // SDK (AdMob et al.) plugs in later is showAd/dismissAd.
  useEffect(() => {
    if (adFree || !adsOn || adVisible || gameOver || !tutorialDone) return;
    if (state.day > 0 && state.day - lastAdDay >= AD_INTERVAL_DAYS) showAd();
  }, [state.day, adFree, adsOn, adVisible, gameOver, tutorialDone, lastAdDay, showAd]);

  const throughput = totalThroughput(state);
  const sortedOrders = useMemo(
    () => [...state.activeOrders].sort((a, b) => (a.deadline - state.tick) - (b.deadline - state.tick)),
    [state.activeOrders, state.tick]
  );
  const firstOrder = sortedOrders[0];
  const recentEvents = [...state.eventLog].reverse().slice(0, 7);
  const workers = Object.values(state.workers);
  const assignedIds = useMemo(
    () => new Set(
      Object.values(state.lines).flatMap(l =>
        [
          ...(l.stations.map(s => s.assignedWorkerId).filter(Boolean) as string[]),
          ...(l.supportWorkerIds ?? []),
        ]
      )
    ),
    [state.lines]
  );
  const benchWorkers = workers.filter(w => !assignedIds.has(w.id));
  const selectedWorker = selectedWorkerId ? state.workers[selectedWorkerId] : null;
  const staffedStations = Object.values(state.lines).reduce(
    (sum, line) => sum + line.stations.filter(s => s.assignedWorkerId).length,
    0
  );
  const totalStations = Object.values(state.lines).reduce((sum, line) => sum + line.stations.length, 0);
  const shiftActive = !awaitingStaffing && !gameOver;

  // First-play tutorial: do-it-to-advance. Steps watch the live state and move
  // on when the player actually performs the action.
  const tutorialAuto = tutorialActive && TUTORIAL_STEPS[tutorialStep]?.auto;
  useEffect(() => {
    if (!tutorialAuto) return;
    if (tutorialAuto({ selected: selectedWorkerId, staffed: staffedStations, shiftRunning: !awaitingStaffing && state.tick > 1 })) {
      advanceTutorial();
    }
  }, [tutorialAuto, selectedWorkerId, staffedStations, awaitingStaffing, state.tick, advanceTutorial]);

  // Spotlight: while the guided walkthrough runs, the current step's target gets
  // a pulsing ring (driven by a body class so deeply-nested targets light up
  // without threading refs through the whole tree).
  const tutorialTarget = tutorialActive ? TUTORIAL_STEPS[tutorialStep]?.target : undefined;
  useEffect(() => {
    const classes = ['tut-stations', 'tut-start', 'tut-goal'];
    document.body.classList.remove(...classes);
    if (tutorialTarget) document.body.classList.add(`tut-${tutorialTarget}`);
    return () => document.body.classList.remove(...classes);
  }, [tutorialTarget]);

  const lineCost = nextLineCost(state);
  const canAffordLine = canBuyLine(state);
  const canShoutout = shoutoutReady(state) && !paused;
  const payroll = totalPayroll(state);
  const overhead = facilityOverhead(state);
  const primaryClient = firstOrder ? state.clients[firstOrder.clientId] : Object.values(state.clients)[0];
  const reputation = primaryClient?.reputation ?? 1;
  const fill = fillRate(state);
  const fillBelowTarget = fill < FILL_RATE_TARGET;
  const condition = dayCondition(state.day);
  const attendanceSwing = dayAttendanceModifier(state);
  const breakdown = moraleBreakdown(state.workers);
  const cashBump = useBump(Math.round(state.cash));
  const onTerminateWorker = useCallback((worker: Worker) => {
    const missed = worker.missedShifts ?? 0;
    const sentHome = worker.sentHomeShifts ?? 0;
    const message = `Terminate ${worker.name}? They have missed ${missed} shift${missed === 1 ? '' : 's'} and been sent home ${sentHome} time${sentHome === 1 ? '' : 's'}.`;
    if (window.confirm(message)) terminateWorker(worker.id);
  }, [terminateWorker]);

  return (
    <div className="game-shell min-h-screen text-white">
      <div className="game-grid-bg" />
      <main className="relative mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <header className="hud-panel mb-4 p-3 sm:p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Co-Pack" className="mb-1 h-10 sm:h-14 object-contain object-left" />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                <span className="status-pill status-time">{shiftLabel(state.tick)}</span>
                <span className="status-pill status-clock" title="Time left in the current 10-hour shift">
                  ⏱ {shiftClock(state.tick)} left
                </span>
                <span className={`status-pill ${awaitingStaffing ? 'status-standup' : paused ? 'status-paused' : 'status-live'}`}>
                  {awaitingStaffing ? 'Morning standup' : paused ? 'Paused' : 'Live run'}
                </span>
                {nightShiftActive(state) && <span className="status-pill status-night">🌙 Nights</span>}
              </div>
              <div className="shift-progress mt-2" title="Shift progress">
                <div style={{ width: `${(shiftElapsedTicks(state.tick) / TICKS_PER_SHIFT) * 100}%` }} />
              </div>
            </div>

            <div className="hud-stats-grid grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:min-w-[700px]">
              <HudStat label="Cash" value={formatCurrency(state.cash)} tone="green" bump={cashBump} />
              <HudStat
                label={`Fill · goal ${pct(FILL_RATE_TARGET)}`}
                value={pct(fill)}
                tone={fillBelowTarget ? 'red' : 'green'}
              />
              <HudStat label="Output" value={`${throughput.toFixed(2)}/min`} tone="cyan" />
              <HudStat label="Crew" value={`${staffedStations}/${totalStations}`} tone="pink" />
              <HudStat
                label={`Morale · ${breakdown.thriving}↑ ${breakdown.struggling}↓`}
                value={pct(averageMorale(workers))}
                tone="gold"
              />
            </div>
          </div>

          <div className="hud-controls-row mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="speed-toggle" aria-label="Speed controls">
                {([1, 4, 16] as SpeedSetting[]).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={speed === s && !paused ? 'active' : ''}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <button type="button" onClick={togglePause} className="game-button game-button-primary">
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={shoutout}
                disabled={!canShoutout}
                title="Recognize the crew on the floor — a free morale boost on cooldown"
                className="game-button game-button-shout"
              >
                {canShoutout ? 'Shout-out' : 'Shout-out · cooling'}
              </button>
              <button
                type="button"
                onClick={toggleOvertime}
                disabled={!hasUnlock(state, 'overtime')}
                title={hasUnlock(state, 'overtime')
                  ? 'Overtime: more output now, morale cost at shift end'
                  : 'Locked — buy Overtime authorization in Front Office → Upgrades'}
                className={`game-button ${state.overtime ? 'game-button-ot-on' : 'game-button-muted'}`}
              >
                {state.overtime ? 'Overtime ON' : hasUnlock(state, 'overtime') ? 'Overtime' : 'Overtime 🔒'}
              </button>
              {state.hasSupervisor && (
                <button
                  type="button"
                  onClick={toggleAutoShift}
                  title="The supervisor runs the morning standup — shifts roll on their own, even while you're away"
                  className={`game-button ${state.autoShift ? 'game-button-ot-on' : 'game-button-muted'}`}
                >
                  {state.autoShift ? 'Auto-shift ON' : 'Auto-shift'}
                </button>
              )}
              <button
                type="button"
                onClick={toggleSound}
                title={soundOn ? 'Mute sound effects' : 'Unmute sound effects'}
                className="game-button game-button-muted"
              >
                {soundOn ? '♪' : '✕'}
              </button>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
              Payroll {formatCurrency(payroll)} + overhead {formatCurrency(overhead)} /shift
            </div>
          </div>
        </header>

        {/* Tutorial coaching + the morning standup controls are PINNED below the
            HUD: they stay on screen while the player scrolls down to staff the
            line, so the instruction and the highlighted button never vanish. */}
        {tab === 'floor' && (tutorialActive || awaitingStaffing) && (
          <div className="floor-pinned">
            {tutorialActive && (
              <TutorialCard
                step={tutorialStep}
                onNext={() => (tutorialStep >= TUTORIAL_STEPS.length - 1 ? finishTutorial() : advanceTutorial())}
                onSkip={finishTutorial}
              />
            )}
            {awaitingStaffing && (
              <StandupBar
                state={state}
                condition={condition}
                canRepeat={canRepeatStaffing(state)}
                hasSupervisor={state.hasSupervisor}
                onAutoFill={autoFillCrew}
                onRepeat={repeatStaffing}
                onStart={() => { if (soundOn) playSound('click'); startShift(); }}
              />
            )}
          </div>
        )}
        {tab === 'floor' && <NextGoalStrip state={state} onGoTo={() => setTab('orders')} />}

        {tab === 'floor' && (
          <div className="floor-grid grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <MobileCrewDock
                benchWorkers={benchWorkers}
                selectedWorkerId={selectedWorkerId}
                cash={state.cash}
                onHire={hireWorker}
                onSelectWorker={selectWorker}
                awaitingStaffing={awaitingStaffing}
                staffedStations={staffedStations}
                onStartShift={() => { if (soundOn) playSound('click'); startShift(); }}
              />

              {state.shiftChallenge && (
                <ShiftChallengeCard challenge={state.shiftChallenge} onResolve={resolveChallenge} />
              )}

              {selectedWorker && (
                <WorkerActionBar
                  worker={selectedWorker}
                  cash={state.cash}
                  payPolicy={state.payPolicy}
                  onTrain={train}
                  onTerminate={onTerminateWorker}
                  onCancel={() => selectWorker(null)}
                />
              )}

              {/* Lines first — staffing is the floor's job; ambient info reads below. */}
              {Object.entries(state.lines).map(([lineId, line]) => (
                <FloorLine
                  key={lineId}
                  lineId={lineId}
                  line={line}
                  workers={state.workers}
                  lineRate={lineThroughput(state, line)}
                  runningOrder={state.activeOrders.find(o => o.id === line.orderId)}
                  shiftActive={shiftActive}
                  paused={paused}
                  supportLocked={!hasUnlock(state, 'support')}
                  selectedWorkerId={selectedWorkerId}
                  onSelectWorker={selectWorker}
                  onAssign={assignWorker}
                  onUnassign={unassignStation}
                  onOpenPicker={(stationId, stationName, role) => setPickerTarget({ lineId, stationId, stationName, role })}
                />
              ))}

              <ConditionsBar
                condition={condition}
                swing={attendanceSwing}
                mealActive={state.mealToday}
                incentiveActive={state.incentiveToday}
                mealReady={mealReady(state)}
                incentiveReady={incentiveReady(state)}
                mealCooldown={mealCooldownRemaining(state)}
                incentiveCooldown={incentiveCooldownRemaining(state)}
                mealCost={mealCost(state)}
                incentiveCost={incentiveCost(state)}
                cash={state.cash}
                onMeal={buyMeal}
                onIncentive={runIncentive}
              />

              {state.lastShiftReport && <ShiftImpactPanel report={state.lastShiftReport} />}
            </section>

            <aside className="floor-sidebar space-y-4">
              <div className="desktop-crew-panel">
                <CrewPanel
                  benchWorkers={benchWorkers}
                  allAssigned={benchWorkers.length === 0}
                  selectedWorkerId={selectedWorkerId}
                  onHire={hireWorker}
                  cash={state.cash}
                  onSelectWorker={selectWorker}
                  onTerminate={onTerminateWorker}
                />
              </div>
            </aside>
          </div>
        )}

        {tab === 'orders' && (
          <OrdersTab
            state={state}
            sortedOrders={sortedOrders}
            firstOrder={firstOrder}
            throughput={throughput}
            reputation={reputation}
            clientName={primaryClient?.name ?? firstOrder?.clientId ?? 'Client'}
            recentEvents={recentEvents}
          />
        )}

        {tab === 'staffing' && (
          <StaffingTab
            state={state}
            onSetPayRate={setPayRate}
            onToggleSkill={toggleSkill}
            onToggleProgram={toggleProgram}
          />
        )}

        {tab === 'office' && (
          <OfficeTab
            state={state}
            onRequestWorkers={requestWorkers}
            onHireSupervisor={hireSupervisor}
            onToggleAutoShift={toggleAutoShift}
            onToggleNightShift={toggleNightShift}
            onPromoteLead={promoteLead}
            onConvert={convertWorker}
            onTerminate={onTerminateWorker}
          />
        )}

        {tab === 'corporate' && (
          <CorporateTab
            state={state}
            lineCost={lineCost}
            canAffordLine={canAffordLine}
            onBuyLine={buyLine}
            onUpgradeAutomation={upgradeAutomation}
            onBuyUnlock={buyUnlock}
            adsOn={adsOn}
            adFree={adFree}
            onToggleAdsTesting={toggleAdsTesting}
            onReset={() => { if (window.confirm('Reset the run? This wipes your save and starts a fresh shift.')) reset(); }}
          />
        )}
      </main>

      <TabBar tab={tab} onTab={setTab} fillBelowTarget={fillBelowTarget} challengeActive={!!state.shiftChallenge} />

      {selectedWorker && tab === 'floor' && (
        <PlacingBar worker={selectedWorker} onCancel={() => selectWorker(null)} />
      )}
      <Toasts toasts={toasts} onDone={removeToast} />
      {pickerTarget && (
        <StationPicker
          target={pickerTarget}
          benchWorkers={benchWorkers}
          onPick={(workerId) => {
            assignWorker(workerId, pickerTarget.lineId, pickerTarget.stationId);
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
      {confetti > 0 && <ConfettiBurst burst={confetti} />}
      {!tutorialDone && !tutorialActive && (
        <WelcomeModal
          onStart={() => { if (soundOn) playSound('click'); finishTutorial(); }}
          onTutorial={() => { if (soundOn) playSound('click'); setTab('floor'); startTutorial(); }}
        />
      )}
      {adVisible && <AdModal adFree={adFree} onDismiss={dismissAd} onRemoveAds={removeAds} />}
      {offlineSummary && <OfflineModal summary={offlineSummary} onClose={dismissOffline} />}
      {gameOver && (
        <GameOverOverlay
          state={state}
          onRestart={() => { if (soundOn) playSound('click'); reset(); }}
        />
      )}
    </div>
  );
}

function TabBar({
  tab, onTab, fillBelowTarget, challengeActive,
}: { tab: TabKey; onTab: (t: TabKey) => void; fillBelowTarget: boolean; challengeActive: boolean }) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'floor', label: 'Floor', icon: '▚' },
    { key: 'orders', label: 'Orders', icon: '◫' },
    { key: 'staffing', label: 'Staffing', icon: '☰' },
    { key: 'office', label: 'Office', icon: '▦' },
    { key: 'corporate', label: 'Corporate', icon: '★' },
  ];
  return (
    <nav className="tab-bar" aria-label="Main sections">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTab(t.key)}
          className={`tab-button ${tab === t.key ? 'active' : ''}`}
        >
          <span className="tab-icon" aria-hidden="true">{t.icon}</span>
          <span>{t.label}</span>
          {t.key === 'floor' && challengeActive && <span className="tab-dot" aria-label="challenge waiting" />}
          {t.key === 'staffing' && fillBelowTarget && <span className="tab-dot" aria-label="needs attention" />}
        </button>
      ))}
    </nav>
  );
}

function OrdersTab({
  state, sortedOrders, firstOrder, throughput, reputation, clientName, recentEvents,
}: {
  state: GameState;
  sortedOrders: Order[];
  firstOrder: Order | undefined;
  throughput: number;
  reputation: number;
  clientName: string;
  recentEvents: GameEvent[];
}) {
  return (
    <div className="orders-tab-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        {firstOrder ? (
          <>
            <OrderHero
              order={firstOrder}
              tick={state.tick}
              throughput={throughput}
              reputation={reputation}
              clientName={clientName}
            />
            {sortedOrders.length > 1 && (
              <OrdersStrip orders={sortedOrders.slice(1)} tick={state.tick} clients={state.clients} />
            )}
          </>
        ) : (
          <div className="game-panel flex min-h-[180px] items-center justify-center p-5 text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
            No active orders
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <ClientBook state={state} />
        <ObjectivesPanel state={state} />
        <EventLog events={recentEvents} />
      </aside>
    </div>
  );
}

// The growth ladder made visible: every client tier, what it pays, and exactly
// what it takes to land the next one. This is the answer to "why grow?".
function ClientBook({ state }: { state: GameState }) {
  return (
    <section className="game-panel accent-violet p-4">
      <div>
        <div className="eyebrow">Client book</div>
        <h2 className="text-2xl font-black text-white">Contract Ladder</h2>
      </div>
      <hr className="panel-divider" />
      <div className="space-y-2">
        {CLIENT_TIERS.map(tier => {
          const client = state.clients[tier.id];
          const signed = !!client;
          const needsShipped = Math.max(0, tier.unlockAtCompleted - state.completedOrders);
          const activeLines = Object.values(state.lines).filter(l => l.active).length;
          const needsLines = Math.max(0, tier.minLines - activeLines);
          return (
            <div key={tier.id} className={`objective-row ${signed ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="objective-label">{signed ? tier.name : `🔒 ${tier.name}`}</span>
                <span className="objective-reward">
                  ${tier.revenueBase.toFixed(2)}–{(tier.revenueBase + tier.revenueSpread).toFixed(2)}/unit
                </span>
              </div>
              <div className="objective-hint">
                {signed
                  ? `Rep ${pct(client.reputation)} — paying ${pct(reputationPayMultiplier(client.reputation))} of rate. ${tier.blurb}`
                  : [
                      needsShipped > 0 ? `ship ${needsShipped} more contract${needsShipped === 1 ? '' : 's'}` : null,
                      needsLines > 0 ? `open ${needsLines} more line${needsLines === 1 ? '' : 's'}` : null,
                    ].filter(Boolean).join(' · ') || 'Signing soon…'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShiftChallengeCard({
  challenge, onResolve,
}: {
  challenge: NonNullable<GameState['shiftChallenge']>;
  onResolve: (choiceId: string) => void;
}) {
  return (
    <section className={`challenge-card challenge-${challenge.type}`}>
      <div className="challenge-copy">
        <div className="eyebrow">Floor decision</div>
        <h2>{challenge.title}</h2>
        <p>{challenge.note}</p>
      </div>
      <div className="challenge-actions">
        {challenge.choices.map(choice => (
          <button key={choice.id} type="button" onClick={() => onResolve(choice.id)}>
            <strong>{choice.label}</strong>
            <span>{choice.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// Collapsed by default: the floor was drowning in always-open panels. The
// one-line summary keeps the signal; the per-person detail is one tap away.
function ShiftImpactPanel({ report }: { report: NonNullable<GameState['lastShiftReport']> }) {
  const [open, setOpen] = useState(false);
  const ordered = [...report.workerImpacts].sort((a, b) => {
    const rank = { sent_home: 0, no_show: 1, worked: 2 };
    return rank[a.status] - rank[b.status] || b.units - a.units;
  });

  const statusLabel = (status: typeof ordered[number]['status']) => {
    if (status === 'worked') return 'Worked';
    if (status === 'sent_home') return 'Sent home';
    return 'No-show';
  };

  return (
    <section className="shift-impact-panel">
      <button
        type="button"
        className="shift-impact-head w-full cursor-pointer text-left"
        onClick={() => setOpen(o => !o)}
        title={open ? 'Collapse the shift report' : 'Expand the per-person shift report'}
      >
        <div>
          <div className="eyebrow">Last shift {open ? '▾' : '▸'}</div>
          <h2>People Impact</h2>
        </div>
        <div className="shift-impact-score">
          <strong>{Math.round(report.totalUnits)}</strong>
          <span>units · {formatCurrency(report.payroll)}</span>
        </div>
      </button>
      <div className="shift-impact-summary">
        <span>{report.workedCount} worked</span>
        <span>{report.sentHomeCount} sent home unpaid</span>
        <span>{report.noShowCount} no-show</span>
      </div>
      {open && <div className="shift-impact-list">
        {ordered.map(worker => (
          <div key={worker.workerId} className={`shift-impact-row status-${worker.status}`}>
            <span className="shift-impact-status">{statusLabel(worker.status)}</span>
            <span className="shift-impact-name">{worker.workerName}</span>
            <span className="shift-impact-role">
              {worker.status === 'worked'
                ? `${worker.stationName ?? 'Floor'} · ${worker.units.toFixed(1)} units`
                : worker.status === 'sent_home'
                  ? 'No pay · morale hit'
                  : `${worker.missedShifts} missed`}
            </span>
            <span className="shift-impact-counts">M{worker.missedShifts} · H{worker.sentHomeShifts}</span>
          </div>
        ))}
      </div>}
    </section>
  );
}

// The single most important pull on the screen: what to chase next. One slim
// line — tapping it jumps to the full objectives list on the Orders tab.
function NextGoalStrip({ state, onGoTo }: { state: GameState; onGoTo: () => void }) {
  const next = openObjectives(state, 1)[0];
  if (!next) return null;
  const prog = next.progress?.(state);
  const ratio = prog ? Math.min(1, prog.current / prog.target) : null;
  return (
    <button
      type="button"
      data-tut="goal"
      onClick={onGoTo}
      title={next.hint}
      className="game-panel accent-amber goal-strip mb-4 flex w-full items-center gap-3 p-3 text-left"
    >
      <span className="eyebrow shrink-0">Next goal</span>
      <span className="min-w-0 flex-1 truncate text-sm font-black text-white">{next.label}</span>
      {ratio !== null && (
        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
          <span className="block h-full rounded-full bg-amber-300" style={{ width: `${Math.max(4, ratio * 100)}%` }} />
        </span>
      )}
      <span className="objective-reward shrink-0">+{formatCurrency(next.reward)}</span>
    </button>
  );
}

function HudStat({ label, value, tone, bump }: { label: string; value: string; tone: 'green' | 'cyan' | 'pink' | 'gold' | 'red'; bump?: boolean }) {
  return (
    <div className={`hud-stat hud-stat-${tone} ${bump ? 'hud-stat-bump' : ''}`}>
      <div className="hud-stat-label">{label}</div>
      <div className="hud-stat-value">{value}</div>
    </div>
  );
}

function OrderHero({
  order, tick, throughput, reputation, clientName,
}: { order: Order; tick: number; throughput: number; reputation: number; clientName: string }) {
  const progress = order.unitsCompleted / order.units;
  const remaining = order.deadline - tick;
  const isUrgent = remaining < TICKS_PER_SHIFT;
  const isOverdue = remaining <= 0;
  const unitsLeft = Math.max(order.units - order.unitsCompleted, 0);
  const payMultiplier = reputationPayMultiplier(reputation);
  const effectivePay = order.revenuePerUnit * payMultiplier;
  const repLow = reputation < 0.5;

  return (
    <section className="order-panel overflow-hidden">
      <div className="relative z-10 grid gap-5 p-4 sm:p-5 md:grid-cols-[1fr_220px]">
        <div>
          <div className="eyebrow text-slate-950/60">Active contract</div>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <h2 className="text-3xl font-black leading-none text-slate-950 sm:text-5xl">{order.sku}</h2>
            <span className={`deadline-chip ${isOverdue ? 'danger' : isUrgent ? 'warn' : ''}`}>
              {ticksToTimeRemaining(remaining)}
            </span>
            <span className={`rep-chip ${repLow ? 'low' : ''}`}>
              {clientName} · Rep {pct(reputation)}
            </span>
            <span className="rep-chip" title={orderProfile(order).blurb}>
              {orderProfile(order).name} · {orderProfile(order).roles.length} crew
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-slate-900/70">
            Pays <strong>${effectivePay.toFixed(2)}</strong>/unit at current reputation
            {' '}(base ${order.revenuePerUnit.toFixed(2)} × {Math.round(payMultiplier * 100)}%).
            Miss the deadline and reputation — and your pay rate — drop.
          </p>
        </div>

        <div className="score-box">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-950/50">Units left</div>
          <div className="mt-1 font-mono text-4xl font-black leading-none text-slate-950 tabular-nums">
            {Math.ceil(unitsLeft)}
          </div>
          <div className="mt-2 text-xs font-bold text-slate-950/60">{throughput.toFixed(2)} units/min</div>
        </div>
      </div>

      <div className="relative z-10 px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="progress-rail">
          <div
            className={`progress-fill ${isOverdue ? 'danger' : ''}`}
            style={{ width: `${Math.min(Math.max(progress * 100, 1), 100)}%` }}
          />
          <div className="progress-label">
            <span>{(progress * 100).toFixed(1)}%</span>
            <span>{Math.round(order.unitsCompleted)} / {order.units}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const WORKER_DND_MIME = 'application/x-copack-worker';

function FloorLine({
  lineId, line, workers, lineRate, runningOrder, shiftActive, paused, supportLocked, selectedWorkerId,
  onSelectWorker, onAssign, onUnassign, onOpenPicker,
}: {
  lineId: string;
  line: Line;
  workers: Record<string, Worker>;
  lineRate: number;
  runningOrder?: Order;
  shiftActive: boolean;
  paused: boolean;
  supportLocked: boolean;
  selectedWorkerId: string | null;
  onSelectWorker: (id: string | null) => void;
  onAssign: (workerId: string, lineId: string, stationId: string) => void;
  onUnassign: (lineId: string, stationId: string) => void;
  onOpenPicker: (stationId: string, stationName: string, role: string) => void;
}) {
  const presentCount = line.stations.filter(
    s => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift
  ).length;
  const isStopped = presentCount === 0;
  const isShort = presentCount > 0 && presentCount < line.stations.length;
  // Paused freezes the belt (the sim clock is stopped — boxes rolling would
  // be a lie) without flipping the status chips into their "Ready" morning state.
  const running = shiftActive && !isStopped && !paused;
  const selectedWorker = selectedWorkerId ? workers[selectedWorkerId] : null;
  const supportWorkerId = line.supportWorkerIds?.[0];
  const supportWorker = supportWorkerId ? workers[supportWorkerId] : null;
  const supportPresent = supportWorker?.presentThisShift ?? false;

  // Belt speed and carton density both scale with output, so the difference
  // between a limping line and a humming one is readable at a glance.
  const beltDuration = Math.max(1.6, 5.2 - lineRate * 2.6);
  const boxCount = Math.max(3, Math.min(9, Math.round(2 + lineRate * 4)));

  return (
    <section className="game-panel p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="line-tag" style={{ '--station-color': '#7dd3fc' } as React.CSSProperties}>{line.name}</span>
          {runningOrder && (
            <span
              className="sku-chip"
              title={`${orderProfile(runningOrder).name} — ${orderProfile(runningOrder).blurb} Needs ${line.stations.length} crew.`}
            >
              {runningOrder.sku} · {orderProfile(runningOrder).short}
            </span>
          )}
          {line.automation > 0 && <span className="auto-chip">⚙ L{line.automation}</span>}
          {line.leadId && workers[line.leadId] && <span className="tag-lead">LEAD</span>}
        </div>
        <div className={`line-status ${!shiftActive && presentCount > 0 ? 'ready' : isStopped ? 'blocked' : isShort ? 'short' : 'running'}`}>
          {!shiftActive && presentCount > 0
            ? `Ready ${presentCount}/${line.stations.length}`
            : !shiftActive
              ? `Staff ${presentCount}/${line.stations.length}`
              : isStopped
            ? `Idle · 0/${line.stations.length}`
          : isShort
              ? `Short ${presentCount}/${line.stations.length} · ${lineRate.toFixed(1)}/min`
              : `Running · ${lineRate.toFixed(1)}/min`}
        </div>
      </div>

      <div className={`line-flow ${running ? 'running' : 'stopped'}`}>
        <div className="station-grid">
          {line.stations.map((station, index) => {
            const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
            const present = worker?.presentThisShift ?? false;
            const hasTarget = selectedWorkerId !== null;
            const role = stationRole(station);
            const isSkillMatch = selectedWorker?.skills.some(sk => sk.stationId === role) ?? false;
            const theme = STATION_THEMES[role] ?? STATION_THEMES.s1;

            return (
              <StationTile
                key={station.id}
                index={index}
                stationName={station.name}
                theme={theme}
                worker={worker}
                present={present}
                working={present && running}
                hasTarget={hasTarget}
                isSkillMatch={isSkillMatch}
                selectedWorker={selectedWorker}
                onPlace={(wid) => onAssign(wid, lineId, station.id)}
                onSelect={() => (worker ? onSelectWorker(worker.id) : onOpenPicker(station.id, station.name, role))}
                onUnassign={(event) => {
                  event.stopPropagation();
                  onUnassign(lineId, station.id);
                }}
              />
            );
          })}
        </div>

        {/* The takeaway belt: cartons start raw under Induct, get packed under
            Pack, and roll out taped under Stage — the line's work, visible. */}
        <div className="belt-lane" aria-hidden="true">
          <div className="belt-tread" />
          <div className="belt-stage-marks">
            {line.stations.map(st => <span key={st.id} />)}
          </div>
          {running && Array.from({ length: boxCount }).map((_, i) => (
            <span
              key={`${boxCount}-${i}`}
              className="belt-box"
              style={{ animationDuration: `${beltDuration}s`, animationDelay: `${(-beltDuration / boxCount) * i}s` }}
            />
          ))}
          <div className={`belt-outlet ${running ? 'running' : ''}`}>
            {running ? `${lineRate.toFixed(1)}/min ▸` : isStopped && shiftActive ? 'STALLED' : '—'}
          </div>
        </div>
      </div>

      <SupportSlot
        locked={supportLocked}
        worker={supportWorker}
        present={supportPresent}
        working={supportPresent && running}
        selectedWorker={selectedWorker}
        onPlace={(workerId) => onAssign(workerId, lineId, SUPPORT_STATION_ID)}
        onSelect={() => supportWorker && onSelectWorker(supportWorker.id)}
        onUnassign={(event) => {
          event.stopPropagation();
          onUnassign(lineId, SUPPORT_STATION_ID);
        }}
      />
    </section>
  );
}

function StationTile({
  index, stationName, theme, worker, present, working, hasTarget, isSkillMatch, selectedWorker,
  onPlace, onSelect, onUnassign,
}: {
  index: number;
  stationName: string;
  theme: { icon: string; color: string; note: string };
  worker: Worker | null;
  present: boolean;
  working: boolean;
  hasTarget: boolean;
  isSkillMatch: boolean;
  selectedWorker: Worker | null;
  onPlace: (workerId: string) => void;
  onSelect: () => void;
  onUnassign: (event: React.SyntheticEvent) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const profile = worker ? profileForWorker(worker) : null;
  const selectedProfile = selectedWorker ? profileForWorker(selectedWorker) : null;
  const stationClass = [
    'station-card',
    worker ? 'occupied' : 'empty',
    present ? 'present' : '',
    working ? 'working' : '',
    hasTarget ? 'targeting' : '',
    isSkillMatch ? 'match' : '',
    dragOver ? 'drag-over' : '',
    worker && !present ? 'absent' : '',
  ].filter(Boolean).join(' ');

  const handleClick = () => {
    if (hasTarget && selectedWorker) onPlace(selectedWorker.id);
    else onSelect();
  };

  return (
    <button
      type="button"
      className={stationClass}
      style={{ '--station-color': theme.color } as React.CSSProperties}
      onClick={handleClick}
      onDragOver={e => { if (e.dataTransfer.types.includes(WORKER_DND_MIME)) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const wid = e.dataTransfer.getData(WORKER_DND_MIME);
        if (wid) onPlace(wid);
      }}
    >
      <div className="station-topline">
        <span className="station-code" style={{ background: theme.color }}>{theme.icon}</span>
        <span className="station-name-tag">{stationName}</span>
        {worker && (
          // span, not button: this card is already a <button>, and nesting
          // buttons is invalid DOM (React warns, browsers mis-handle clicks).
          <span
            role="button"
            tabIndex={0}
            className="station-clear"
            title="Unassign worker"
            onClick={onUnassign}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onUnassign(e);
              }
            }}
          >✕</span>
        )}
      </div>

      <div className="station-body">
        {worker && profile ? (
          <>
            <CharacterAvatar worker={worker} />
            <div className="station-name truncate">{profile.firstName}</div>
            <div className={`station-status ${present ? 'on' : 'off'}`}>
              {present ? (working ? 'Working' : 'On deck') : 'No-show'}
            </div>
          </>
        ) : (
          <div className="empty-station">
            <div className="empty-icon">{theme.note}</div>
            <div className={`empty-prompt ${isSkillMatch ? 'match' : hasTarget ? 'ready' : ''}`}>
              {hasTarget
                ? isSkillMatch
                  ? `${selectedProfile?.firstName ?? 'Crew'} fits`
                  : `Place ${selectedProfile?.firstName ?? 'crew'}`
                : 'Tap to staff'}
            </div>
          </div>
        )}
      </div>

      {worker ? (
        <div className="station-bars">
          <MiniBar label="Mood" value={worker.morale} />
        </div>
      ) : (
        <div className="station-hint">{hasTarget ? 'Tap / drop here' : 'Tap to staff'}</div>
      )}
    </button>
  );
}

function SupportSlot({
  locked, worker, present, working, selectedWorker, onPlace, onSelect, onUnassign,
}: {
  locked: boolean;
  worker: Worker | null;
  present: boolean;
  working: boolean;
  selectedWorker: Worker | null;
  onPlace: (workerId: string) => void;
  onSelect: () => void;
  onUnassign: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  // The Floater program is a purchased unlock — show the slot, sell the dream.
  if (locked) {
    return (
      <div className="support-slot empty opacity-60" title="Unlock the Floater program in Front Office → Upgrades">
        <div className="support-copy">
          <span className="support-label">Support 🔒</span>
          <strong>Floater program locked</strong>
          <small>Unlock in Front Office → Upgrades · +{Math.round(SUPPORT_OUTPUT_BONUS * 100)}% line lift</small>
        </div>
      </div>
    );
  }
  const hasTarget = selectedWorker !== null;
  const profile = worker ? profileForWorker(worker) : null;
  const selectedProfile = selectedWorker ? profileForWorker(selectedWorker) : null;

  const handleClick = () => {
    if (hasTarget && selectedWorker) onPlace(selectedWorker.id);
    else if (worker) onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`support-slot ${worker ? 'occupied' : 'empty'} ${working ? 'working' : ''} ${hasTarget ? 'targeting' : ''}`}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onDragOver={e => { if (e.dataTransfer.types.includes(WORKER_DND_MIME)) e.preventDefault(); }}
      onDrop={e => {
        e.preventDefault();
        const wid = e.dataTransfer.getData(WORKER_DND_MIME);
        if (wid) onPlace(wid);
      }}
    >
      <div className="support-copy">
        <span className="support-label">Support</span>
        <strong>
          {worker && profile
            ? `${profile.firstName} helping`
            : hasTarget
              ? `Add ${selectedProfile?.firstName ?? 'helper'}`
              : 'Overstaff line'}
        </strong>
        <small>
          {worker
            ? `${present ? 'Paid helper' : 'No-show'} · +${Math.round(SUPPORT_OUTPUT_BONUS * 100)}% line lift`
            : 'Paid helper slot · smaller output lift'}
        </small>
      </div>
      {worker && (
        <>
          <CharacterAvatar worker={worker} size="sm" />
          <button type="button" className="support-clear" title="Remove helper" onClick={onUnassign}>✕</button>
        </>
      )}
    </div>
  );
}

type DayConditionInfo = ReturnType<typeof dayCondition>;

function ConditionsBar({
  condition, swing, mealActive, incentiveActive, mealReady, incentiveReady,
  mealCooldown, incentiveCooldown, mealCost, incentiveCost, cash, onMeal, onIncentive,
}: {
  condition: DayConditionInfo;
  swing: number;
  mealActive: boolean;
  incentiveActive: boolean;
  mealReady: boolean;
  incentiveReady: boolean;
  mealCooldown: number;
  incentiveCooldown: number;
  mealCost: number;
  incentiveCost: number;
  cash: number;
  onMeal: () => void;
  onIncentive: () => void;
}) {
  const swingPct = Math.round(swing * 100);

  const leverLabel = (active: boolean, ready: boolean, cooldown: number, name: string, cost: number) => {
    if (active) return `${name} on today`;
    if (cooldown > 0) return `${name} · ${cooldown}d`;
    return `${name} ${formatCurrency(cost)}`;
  };

  return (
    <section className={`conditions-bar tone-${condition.tone}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={`condition-orb tone-${condition.tone}`} aria-hidden="true" />
        <div className="min-w-0">
          <div className="eyebrow">Today on the floor</div>
          <div className="truncate text-lg font-black text-white">{condition.label}</div>
          <div className="truncate text-xs font-semibold text-slate-200">{condition.note}</div>
        </div>
        <div className={`attendance-swing ${swing < 0 ? 'down' : swing > 0 ? 'up' : ''}`}>
          Attendance {swingPct > 0 ? '+' : ''}{swingPct}%
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="lever-label">Break-glass · big cost, then cools down</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMeal}
            disabled={!mealReady || cash < mealCost}
            title="Emergency meal — a real morale + attendance jolt for one day. Expensive, then on cooldown."
            className={`game-button ${mealActive ? 'game-button-pull-on' : 'game-button-pull'}`}
          >
            {leverLabel(mealActive, mealReady, mealCooldown, 'Meal', mealCost)}
          </button>
          <button
            type="button"
            onClick={onIncentive}
            disabled={!incentiveReady || cash < incentiveCost}
            title="Emergency incentive — the biggest one-day turnout boost. Pricey, longer cooldown."
            className={`game-button ${incentiveActive ? 'game-button-pull-on' : 'game-button-pull'}`}
          >
            {leverLabel(incentiveActive, incentiveReady, incentiveCooldown, 'Incentive', incentiveCost)}
          </button>
        </div>
      </div>
    </section>
  );
}

const TRAINABLE_STATIONS = ['s1', 's2', 's3'];

function WorkerActionBar({
  worker, cash, payPolicy, onTrain, onTerminate, onCancel,
}: {
  worker: Worker;
  cash: number;
  payPolicy: GameState['payPolicy'];
  onTrain: (workerId: string, stationId: string) => void;
  onTerminate: (worker: Worker) => void;
  onCancel: () => void;
}) {
  const profile = profileForWorker(worker);
  const risk = flightRisk(worker, payPolicy);
  const riskCopy = risk === 'high'
    ? 'Flight risk — morale is low'
    : risk === 'watch'
      ? 'Keep an eye on morale'
      : 'Settled in';

  return (
    <div className="worker-action">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CharacterAvatar worker={worker} size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">{profile.firstName} · {worker.name}</span>
              {worker.isLead && <span className="tag-lead">LEAD</span>}
              {worker.permanent && <span className="tag-perm">COMPANY</span>}
            </div>
            <div className="text-xs text-amber-100/80">
              Click a station to assign · <span className={`risk-${risk}`}>{riskCopy}</span>
              {' '}· ${effectiveHourly(worker, payPolicy).toFixed(2)}/hr ({formatCurrency(effectiveWage(worker, payPolicy))}/shift)
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="history-pill">Missed {worker.missedShifts ?? 0}</span>
              <span className="history-pill">Sent home {worker.sentHomeShifts ?? 0}</span>
              <span className="history-pill">{Math.round(worker.totalUnits ?? 0)} units</span>
            </div>
          </div>
        </div>
        <div className="worker-action-buttons">
          <button type="button" className="worker-action-term" onClick={() => onTerminate(worker)}>
            Term
          </button>
          <button type="button" className="worker-action-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <TraitChips worker={worker} className="mt-3" />

      <div className="mt-3 grid grid-cols-3 gap-2">
        {TRAINABLE_STATIONS.map(stationId => {
          const skill = worker.skills.find(s => s.stationId === stationId);
          const cost = trainingCost(worker, stationId);
          const trainable = canTrain(worker, stationId) && cash >= cost;
          return (
            <button
              key={stationId}
              type="button"
              disabled={!trainable}
              onClick={() => onTrain(worker.id, stationId)}
              className="train-button"
              title={skill ? `Upskill ${STATION_NAMES[stationId]}` : `Cross-train ${STATION_NAMES[stationId]}`}
            >
              <span className="train-station">{STATION_NAMES[stationId]}</span>
              <span className="train-prof">{skill ? pct(skill.proficiency) : 'new'}</span>
              <span className="train-cost">{formatCurrency(cost)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CrewPanel({
  benchWorkers, allAssigned, selectedWorkerId, cash, onHire, onSelectWorker, onTerminate,
}: {
  benchWorkers: Worker[];
  allAssigned: boolean;
  selectedWorkerId: string | null;
  cash: number;
  onHire: () => void;
  onSelectWorker: (id: string | null) => void;
  onTerminate: (worker: Worker) => void;
}) {
  return (
    <section className="game-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Crew bench</div>
          <h2 className="text-2xl font-black text-white">{allAssigned ? 'All Deployed' : 'Ready Crew'}</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">
            Present workers left here are sent home unpaid and lose morale.
          </p>
        </div>
        <button
          type="button"
          onClick={onHire}
          disabled={cash < HIRE_COST}
          className="game-button game-button-hire"
        >
          Hire {formatCurrency(HIRE_COST)}
        </button>
      </div>

      {benchWorkers.length > 0 ? (
        <div className="grid gap-3">
          {benchWorkers.map(worker => (
            <BenchWorker
              key={worker.id}
              worker={worker}
              selectedWorkerId={selectedWorkerId}
              onSelect={() => onSelectWorker(worker.id)}
              onTerminate={() => onTerminate(worker)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-bench">
          Every available worker is already on the floor.
        </div>
      )}
    </section>
  );
}

function MobileCrewDock({
  benchWorkers, selectedWorkerId, cash, onHire, onSelectWorker,
  awaitingStaffing, staffedStations, onStartShift,
}: {
  benchWorkers: Worker[];
  selectedWorkerId: string | null;
  cash: number;
  onHire: () => void;
  onSelectWorker: (id: string | null) => void;
  awaitingStaffing: boolean;
  staffedStations: number;
  onStartShift: () => void;
}) {
  const hasSelection = selectedWorkerId !== null;
  const canStart = awaitingStaffing && staffedStations > 0;
  const presentBench = benchWorkers.filter(worker => worker.presentThisShift).length;

  return (
    <div className={`mobile-crew-dock ${hasSelection ? 'has-selection' : ''}`}>
      <div className="mobile-crew-dock-head">
        <div>
          <div className="eyebrow">Bench</div>
          <strong>{canStart ? `${staffedStations} staffed` : benchWorkers.length > 0 ? 'Tap crew, then station' : 'All deployed'}</strong>
          {canStart && presentBench > 0 && <small>{presentBench} home risk</small>}
        </div>
        {canStart ? (
          <button type="button" data-tut="start" onClick={onStartShift} className="mobile-start-button">
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={onHire}
            disabled={cash < HIRE_COST}
            className="mobile-hire-button"
          >
            Hire {formatCurrency(HIRE_COST)}
          </button>
        )}
      </div>
      {benchWorkers.length > 0 ? (
        <div className="mobile-crew-strip">
          {benchWorkers.map(worker => {
            const profile = profileForWorker(worker);
            const absent = !worker.presentThisShift;
            const selected = selectedWorkerId === worker.id;
            return (
              <button
                key={worker.id}
                type="button"
                onClick={absent ? undefined : () => onSelectWorker(worker.id)}
                disabled={absent}
                className={`mobile-worker-chip ${selected ? 'selected' : ''} ${absent ? 'absent' : ''}`}
                style={{ '--crew-color': profile.palette } as React.CSSProperties}
              >
                <CharacterAvatar worker={worker} size="xs" />
                <span>{profile.firstName}</span>
                <small>{profile.role.replace(' crew', '')}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mobile-empty-dock">Every available worker is already on a line.</div>
      )}
    </div>
  );
}

function BenchWorker({
  worker, selectedWorkerId, onSelect, onTerminate,
}: { worker: Worker; selectedWorkerId: string | null; onSelect: () => void; onTerminate: () => void }) {
  const isSelected = selectedWorkerId === worker.id;
  const profile = profileForWorker(worker);
  const absent = !worker.presentThisShift;
  const handleSelect = () => {
    if (!absent) onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={absent ? -1 : 0}
      onClick={handleSelect}
      onKeyDown={e => {
        if (absent) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      draggable={!absent}
      onDragStart={absent ? undefined : (e => {
        e.dataTransfer.setData(WORKER_DND_MIME, worker.id);
        e.dataTransfer.effectAllowed = 'move';
      })}
      className={`crew-card ${isSelected ? 'selected' : ''} ${absent ? 'absent' : ''}`}
      style={{ '--crew-color': profile.palette } as React.CSSProperties}
    >
      <CharacterAvatar worker={worker} />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-lg font-black text-white">{profile.firstName}</div>
            {absent ? (
              <span className="risk-badge risk-badge-absent">No-show</span>
            ) : flightRisk(worker) !== 'low' && (
              <span className={`risk-badge risk-badge-${flightRisk(worker)}`}>
                {flightRisk(worker) === 'high' ? 'Flight risk' : 'Watch'}
              </span>
            )}
          </div>
          <div className="crew-level">D{worker.tenureDays}</div>
        </div>
        <div className="truncate text-sm font-bold text-slate-300">{worker.name} / {profile.role}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MiniBar label="Mood" value={worker.morale} />
          <MiniBar label="Trust" value={worker.reliability} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="history-pill">Missed {worker.missedShifts ?? 0}</span>
          <span className="history-pill">Home {worker.sentHomeShifts ?? 0}</span>
          <span className="history-pill">{Math.round(worker.totalUnits ?? 0)} units</span>
          {worker.skills.map(sk => (
            <span key={sk.stationId} className="skill-chip">
              {STATION_NAMES[sk.stationId] ?? sk.stationId} {pct(sk.proficiency)}
            </span>
          ))}
        </div>
        <TraitChips worker={worker} className="mt-2" />
        <button
          type="button"
          className="term-button mt-3"
          onClick={event => {
            event.stopPropagation();
            onTerminate();
          }}
        >
          Terminate
        </button>
      </div>
    </div>
  );
}

// Renders a worker's traits as tone-colored chips. This is where the soul shows.
function TraitChips({ worker, className = '' }: { worker: Worker; className?: string }) {
  const traits = workerTraits(worker);
  if (traits.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {traits.map(t => (
        <span key={t.id} className={`trait-pill trait-${t.tone}`} title={t.blurb}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: 'xs' | 'sm' | 'md' }) {
  const profile = profileForWorker(worker);
  return (
    <div
      className={`character-avatar avatar-${size} avatar-${profile.shape}`}
      style={{
        '--avatar-color': profile.palette,
        '--avatar-skin': profile.skin,
        '--avatar-hair': profile.hair,
        '--avatar-uniform': profile.uniform,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="avatar-head">
        <span className="avatar-hair" />
        <span className="avatar-eye left" />
        <span className="avatar-eye right" />
        <span className="avatar-smile" />
      </div>
      <div className="avatar-body">
        <span />
      </div>
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-stat">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <strong>{pct(value)}</strong>
      </div>
      <div className="mini-rail">
        <div style={{ width: `${Math.max(Math.min(value * 100, 100), 4)}%` }} />
      </div>
    </div>
  );
}

function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <section className="game-panel accent-cyan p-4">
      <div>
        <div className="eyebrow">Floor radio</div>
        <h2 className="text-2xl font-black text-white">Shift Feed</h2>
      </div>
      <hr className="panel-divider" />
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event, index) => {
            const { text, tone, tag } = formatEvent(event);
            return (
              <div key={`${event.tick}-${index}`} className={`event-row ${tone}`}>
                <span className="event-tag">{tag}</span>
                <span className="event-time">t{event.tick}</span>
                <span className="min-w-0 flex-1">{text}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-bench">No radio chatter yet. Start the belt.</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// STAFFING TAB — the dials you set with the staffing agency
// ---------------------------------------------------------------------------

function StaffingBoard({ state }: { state: GameState }) {
  const required = requiredPositions(state);
  const covered = coveredPositions(state);
  const today = staffingFill(state);
  const rolling = rollingStaffingFill(state);
  const history = state.staffingHistory.slice(-14);
  const belowTarget = rolling < STAFFING_TARGET;

  return (
    <section className="game-panel accent-cyan p-4 sm:p-5 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Staffing board</div>
          <h2 className="text-2xl font-black text-white">Labor Coverage</h2>
          <p className="mt-1 text-sm font-semibold text-slate-300">
            The schedule calls for {required} position{required === 1 ? '' : 's'} today.
            You're covering {covered}. Keep the rolling fill at or above {pct(STAFFING_TARGET)}.
          </p>
        </div>
        <div className={`board-score ${belowTarget ? 'low' : 'ok'}`}>
          <div className="board-score-value">{pct(rolling)}</div>
          <div className="board-score-label">Rolling · goal {pct(STAFFING_TARGET)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="staffing-stat"><span>Today</span><strong>{pct(today)}</strong></div>
        <div className="staffing-stat"><span>Covered</span><strong>{covered}/{required}</strong></div>
        <div className="staffing-stat"><span>Days logged</span><strong>{state.staffingHistory.length}</strong></div>
      </div>

      {history.length > 0 && (
        <div className="board-history mt-4">
          {history.map(d => (
            <div key={d.day} className="board-bar-wrap" title={`Day ${d.day + 1}: ${pct(d.fill)} (${d.covered}/${d.required})`}>
              <div
                className={`board-bar ${d.fill >= STAFFING_TARGET ? 'ok' : 'low'}`}
                style={{ height: `${Math.max(6, Math.round(d.fill * 100))}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StaffingTab({
  state, onSetPayRate, onToggleSkill, onToggleProgram,
}: {
  state: GameState;
  onSetPayRate: (rate: number) => void;
  onToggleSkill: (stationId: string) => void;
  onToggleProgram: (program: 'attendance' | 'referral') => void;
}) {
  const rate = state.payPolicy.globalRate;
  const headcount = Object.keys(state.workers).length;
  const ratePct = Math.round(rate * 100);
  const rateLabel = rate > 1.02 ? 'Above market' : rate < 0.98 ? 'Below market' : 'At market';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StaffingBoard state={state} />
      <section className="game-panel accent-green p-4 sm:p-5">
        <div className="eyebrow">Pay rate</div>
        <h2 className="text-2xl font-black text-white">Agency Pay</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          The single biggest dial. Pay above market and the agency sends people who show up more
          and stick around — but your payroll climbs.
        </p>
        <hr className="panel-divider" />

        <div className="mt-4 flex items-end justify-between">
          <div className={`pay-readout ${rate > 1.02 ? 'up' : rate < 0.98 ? 'down' : ''}`}>{ratePct}%</div>
          <div className="text-sm font-black uppercase tracking-[0.12em] text-slate-300">{rateLabel}</div>
        </div>
        <input
          type="range"
          className="pay-slider mt-3 w-full"
          min={PAY_RATE_MIN}
          max={PAY_RATE_MAX}
          step={PAY_RATE_STEP}
          value={rate}
          onChange={e => onSetPayRate(Number(e.target.value))}
        />
        <div className="mt-1 flex justify-between text-xs font-bold text-slate-400">
          <span>{Math.round(PAY_RATE_MIN * 100)}%</span>
          <button type="button" className="pay-reset" onClick={() => onSetPayRate(PAY_RATE_DEFAULT)}>Reset to market</button>
          <span>{Math.round(PAY_RATE_MAX * 100)}%</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="staffing-stat">
            <span>Roster payroll</span>
            <strong>{formatCurrency(Object.values(state.workers).reduce((s, w) => s + effectiveWage(w, state.payPolicy), 0))}/shift</strong>
          </div>
          <div className="staffing-stat">
            <span>Avg bill rate</span>
            <strong>
              ${headcount > 0
                ? (Object.values(state.workers).reduce((s, w) => s + effectiveWage(w, state.payPolicy), 0) / headcount / SHIFT_HOURS).toFixed(2)
                : '0.00'}/hr
            </strong>
          </div>
          <div className="staffing-stat">
            <span>Headcount</span>
            <strong>{headcount}</strong>
          </div>
        </div>
      </section>

      <section className="game-panel accent-amber p-4 sm:p-5">
        <div className="eyebrow">Skill request</div>
        <h2 className="text-2xl font-black text-white">What to Send</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          Tell the agency which roles you're short on. New hires skew toward the skills you flag.
        </p>
        <hr className="panel-divider" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {['s1', 's2', 's3'].map(sid => {
            const active = state.skillRequest.includes(sid);
            return (
              <button
                key={sid}
                type="button"
                onClick={() => onToggleSkill(sid)}
                className={`skill-request ${active ? 'active' : ''}`}
              >
                <span className="text-base font-black">{STATION_NAMES[sid]}</span>
                <span className="text-xs font-bold">{active ? 'Prioritized' : 'Tap to flag'}</span>
              </button>
            );
          })}
        </div>
        {state.skillRequest.length === 0 && (
          <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            No request — agency sends a random mix.
          </div>
        )}
      </section>

      <section className="game-panel accent-violet p-4 sm:p-5 lg:col-span-2">
        <div className="eyebrow">Standing programs</div>
        <h2 className="text-2xl font-black text-white">Ongoing Incentives</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          Always-on programs billed per head every shift. They run in the background, unlike the
          one-day meal or incentive on the Floor.
        </p>
        {!hasUnlock(state, 'programs') && (
          <div className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-amber-200">
            🔒 Requires the HR partner retainer — Front Office → Upgrades
          </div>
        )}
        <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${hasUnlock(state, 'programs') ? '' : 'pointer-events-none opacity-50'}`}>
          <ProgramToggle
            title="Attendance program"
            note={`Crew-wide turnout boost. ${formatCurrency(ATTENDANCE_PROGRAM_PER_HEAD)}/head/shift`}
            cost={ATTENDANCE_PROGRAM_PER_HEAD * headcount}
            active={state.programs.attendance}
            onToggle={() => onToggleProgram('attendance')}
          />
          <ProgramToggle
            title="Referral program"
            note={`New hires arrive referred — happier & stickier. ${formatCurrency(REFERRAL_PROGRAM_PER_HEAD)}/head/shift`}
            cost={REFERRAL_PROGRAM_PER_HEAD * headcount}
            active={state.programs.referral}
            onToggle={() => onToggleProgram('referral')}
          />
        </div>
        <div className="mt-3 text-sm font-black uppercase tracking-[0.12em] text-slate-300">
          Programs cost {formatCurrency(programsPerShiftCost(state))}/shift
        </div>
      </section>
    </div>
  );
}

function ProgramToggle({
  title, note, cost, active, onToggle,
}: { title: string; note: string; cost: number; active: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`program-toggle ${active ? 'active' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-black text-white">{title}</span>
        <span className={`program-pill ${active ? 'on' : ''}`}>{active ? 'ON' : 'OFF'}</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-slate-300">{note}</div>
      {active && <div className="mt-1 text-xs font-black text-amber-200">-{formatCurrency(cost)}/shift</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FRONT OFFICE TAB — capital decisions: lines, automation, leads, conversions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OFFICE TAB — day-to-day operations & planning
// ---------------------------------------------------------------------------

// Tomorrow, today: the weather forecast, the SKU lineup the board will deal,
// and whether your roster covers it — with the agency advance-order as the
// payoff for reading it. This is where "the workforce is the critical
// element" becomes a planning game instead of a morning surprise.
function PlanningPanel({ state, onRequestWorkers }: { state: GameState; onRequestWorkers: (count?: number) => void }) {
  const tomorrow = dayCondition(state.day + 1);
  const positions = tomorrowPositions(state);
  const roster = Object.keys(state.workers).length;
  const expected = expectedAttendance(state, 1);
  const arriving = state.pendingHires;
  const projected = expected + arriving;
  const short = Math.ceil(positions - projected);
  const lineCount = Object.values(state.lines).filter(l => l.active).length;
  const lineup = [...state.activeOrders]
    .filter(o => o.unitsCompleted < o.units)
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, lineCount);

  return (
    <section className="game-panel accent-cyan p-4 sm:p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Planning · tomorrow</div>
          <h2 className="text-2xl font-black text-white">Day {state.day + 2} Forecast</h2>
        </div>
        <div className={`forecast-chip tone-${tomorrow.tone}`}>
          {tomorrow.label}
          <small>{tomorrow.note}{tomorrow.modifier !== 0 ? ` · attendance ${tomorrow.modifier > 0 ? '+' : ''}${Math.round(tomorrow.modifier * 100)}%` : ''}</small>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="panel-section">
          <span className="panel-section-label">Tomorrow's SKU lineup</span>
          <div className="space-y-1.5">
            {lineup.map(o => (
              <div key={o.id} className="planning-row">
                <span className="font-black text-white">{o.sku}</span>
                <span className="text-slate-300">{orderProfile(o).name}</span>
                <span className="text-cyan-200">{orderProfile(o).roles.length} crew</span>
              </div>
            ))}
            {lineup.length < lineCount && (
              <div className="planning-row opacity-70">
                <span className="font-black text-white">New contract</span>
                <span className="text-slate-300">dealt in the morning</span>
                <span className="text-cyan-200">~3 crew</span>
              </div>
            )}
          </div>
        </div>
        <div className="panel-section">
          <span className="panel-section-label">Labor coverage</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="staffing-stat"><span>Positions</span><strong>{positions}</strong></div>
            <div className="staffing-stat"><span>Expected in</span><strong>~{expected.toFixed(1)}</strong></div>
            <div className="staffing-stat"><span>Reserved</span><strong>{arriving}</strong></div>
          </div>
          {short > 0 ? (
            <div className="mt-2 text-xs font-black uppercase tracking-[0.1em] text-amber-200">
              ⚠ Likely short {short} — reserve tonight or scramble tomorrow.
            </div>
          ) : (
            <div className="mt-2 text-xs font-black uppercase tracking-[0.1em] text-emerald-200">
              Coverage looks good ({roster} on roster).
            </div>
          )}
          <button
            type="button"
            onClick={() => onRequestWorkers(1)}
            disabled={state.cash < ADVANCE_HIRE_COST}
            className="game-button game-button-hire mt-3 w-full"
            title="Reserved tonight at the advance rate — guaranteed on the floor at tomorrow's standup"
          >
            Reserve a worker for tomorrow · {formatCurrency(ADVANCE_HIRE_COST)}
          </button>
          <div className="mt-1 text-center text-[0.66rem] font-bold text-slate-500">
            Advance rate beats the {formatCurrency(HIRE_COST)} same-day walk-in — and arrivals never no-show day one.
          </div>
        </div>
      </div>
    </section>
  );
}

function OfficeTab({
  state, onRequestWorkers, onHireSupervisor, onToggleAutoShift, onToggleNightShift,
  onPromoteLead, onConvert, onTerminate,
}: {
  state: GameState;
  onRequestWorkers: (count?: number) => void;
  onHireSupervisor: () => void;
  onToggleAutoShift: () => void;
  onToggleNightShift: () => void;
  onPromoteLead: (workerId: string, lineId: string) => void;
  onConvert: (workerId: string) => void;
  onTerminate: (worker: Worker) => void;
}) {
  const lines = Object.entries(state.lines);
  const temps = Object.values(state.workers).filter(w => !w.permanent);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PlanningPanel state={state} onRequestWorkers={onRequestWorkers} />

      <section className="game-panel accent-violet p-4 sm:p-5 lg:col-span-2">
        <div className="eyebrow">Operations</div>
        <h2 className="text-2xl font-black text-white">Floor Supervisor</h2>
        {!state.hasSupervisor ? (
          <>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              Hire a supervisor and the plant keeps earning <strong>while you're away</strong>:
              they run every morning standup, seat the crew, and make the safe call on floor
              decisions until you're back. While you're playing, the floor stays yours —
              they only step in if you flip Auto-shift on.
              Salary {formatCurrency(SUPERVISOR_SALARY_PER_SHIFT)}/shift.
            </p>
            <button
              type="button"
              onClick={onHireSupervisor}
              disabled={!canHireSupervisor(state)}
              className="game-button game-button-hire mt-3"
            >
              Hire supervisor · {formatCurrency(SUPERVISOR_COST)}
            </button>
          </>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ProgramToggle
              title="Auto-shift (hands-free while you watch)"
              note={`Off: you run the mornings; the supervisor covers you only while you're away. On: they roll shifts even while you watch. ${formatCurrency(SUPERVISOR_SALARY_PER_SHIFT)}/shift salary either way.`}
              cost={SUPERVISOR_SALARY_PER_SHIFT}
              active={state.autoShift}
              onToggle={onToggleAutoShift}
            />
            {hasUnlock(state, 'night_shift') ? (
              <ProgramToggle
                title="Night shift"
                note={`+${Math.round(NIGHT_OUTPUT_BONUS * 100)}% output · costs +${Math.round(NIGHT_LABOR_RATE * 100)}% payroll and ${formatCurrency(NIGHT_OVERHEAD)} overhead every shift.`}
                cost={NIGHT_OVERHEAD}
                active={state.nightShift}
                onToggle={onToggleNightShift}
              />
            ) : (
              <p className="self-center text-sm font-semibold text-slate-300">
                Away time is always covered — the supervisor staffs and runs every shift you miss.
                Hands-on mornings still squeeze out more: they never hire, train, or staff the
                support slots.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="game-panel accent-amber p-4 sm:p-5 lg:col-span-2">
        <div className="eyebrow">People moves</div>
        <h2 className="text-2xl font-black text-white">Leads & Conversions</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          Promote a lead to lift a line's morale and output. Convert a temp to a company employee for a
          steadier, stickier worker — at a permanent wage bump.
        </p>
        <hr className="panel-divider" />

        <div className="mt-4 space-y-3">
          {Object.values(state.workers).length === 0 && (
            <div className="empty-bench">No crew yet. Hire on the Floor first.</div>
          )}
          {Object.values(state.workers).map(worker => {
            // Which line is this worker assigned to (for lead promotion)?
            const assignedLine = lines.find(([, l]) =>
              l.stations.some(s => s.assignedWorkerId === worker.id) || (l.supportWorkerIds ?? []).includes(worker.id)
            );
            const convertCost = conversionCost(worker);
            return (
              <div key={worker.id} className="office-worker">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-white">
                    {worker.name}
                    {worker.isLead && <span className="tag-lead ml-2">LEAD</span>}
                    {worker.permanent && <span className="tag-perm ml-2">COMPANY</span>}
                  </span>
                  <span className="text-xs font-bold text-slate-300">D{worker.tenureDays}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="office-person-stat"><span>Missed</span><strong>{worker.missedShifts ?? 0}</strong></div>
                  <div className="office-person-stat"><span>Sent home</span><strong>{worker.sentHomeShifts ?? 0}</strong></div>
                  <div className="office-person-stat"><span>Units</span><strong>{Math.round(worker.totalUnits ?? 0)}</strong></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!assignedLine || worker.isLead || state.cash < LEAD_COST}
                    onClick={() => assignedLine && onPromoteLead(worker.id, assignedLine[0])}
                    className="game-button game-button-small"
                    title={assignedLine ? 'Promote to lead on their line' : 'Assign to a line first'}
                  >
                    {worker.isLead ? 'Lead' : `Make lead · ${formatCurrency(LEAD_COST)}`}
                  </button>
                  <button
                    type="button"
                    disabled={worker.permanent || state.cash < convertCost}
                    onClick={() => onConvert(worker.id)}
                    className="game-button game-button-small"
                    title="Convert temp to company employee"
                  >
                    {worker.permanent ? 'Company' : `Convert · ${formatCurrency(convertCost)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTerminate(worker)}
                    className="game-button game-button-small game-button-danger"
                    title="Terminate this worker and remove them from the roster"
                  >
                    Term
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          {temps.length} temp{temps.length === 1 ? '' : 's'} eligible to convert
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CORPORATE TAB — capital: upgrades, capacity, settings
// ---------------------------------------------------------------------------

function CorporateTab({
  state, lineCost, canAffordLine, onBuyLine, onUpgradeAutomation, onBuyUnlock,
  adsOn, adFree, onToggleAdsTesting, onReset,
}: {
  state: GameState;
  lineCost: number;
  canAffordLine: boolean;
  onBuyLine: () => void;
  onUpgradeAutomation: (lineId: string) => void;
  onBuyUnlock: (id: FeatureUnlockId) => void;
  adsOn: boolean;
  adFree: boolean;
  onToggleAdsTesting: () => void;
  onReset: () => void;
}) {
  const lines = Object.entries(state.lines);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="game-panel accent-violet p-4 sm:p-5 lg:col-span-2">
        <div className="eyebrow">Upgrades</div>
        <h2 className="text-2xl font-black text-white">Capabilities</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          One-time purchases that open up new levers. Earned, not given.
        </p>
        <hr className="panel-divider" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {FEATURE_UNLOCKS.map(u => {
            const owned = state.unlocks.includes(u.id);
            return (
              <div key={u.id} className={`office-line ${owned ? '' : 'opacity-90'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-white">{owned ? u.name : `🔒 ${u.name}`}</span>
                  {owned && <span className="program-pill on">OWNED</span>}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-300">{u.blurb}</div>
                {!owned && (
                  <>
                    {u.requiresSupervisor && !state.hasSupervisor && (
                      <div className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-amber-200">
                        Requires a floor supervisor
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onBuyUnlock(u.id)}
                      disabled={!canBuyUnlock(state, u.id)}
                      className="game-button game-button-auto mt-2 w-full"
                    >
                      Unlock · {formatCurrency(u.cost)}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="game-panel accent-cyan p-4 sm:p-5 lg:col-span-2">
        <div className="eyebrow">Capacity</div>
        <h2 className="text-2xl font-black text-white">Production Lines</h2>
        <button
          type="button"
          onClick={onBuyLine}
          disabled={!canAffordLine}
          className="game-button game-button-line mt-3 w-full"
        >
          Open Line {String.fromCharCode(64 + state.lineCount + 1)} · {formatCurrency(lineCost)}
        </button>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {lines.map(([lineId, line]) => {
            const cost = automationCost(line);
            const upgradable = canAutomate(line) && state.cash >= cost;
            return (
              <div key={lineId} className="office-line">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-black text-white">{line.name}</span>
                  <span className="auto-chip">+{Math.round((automationMultiplier(line) - 1) * 100)}% output</span>
                </div>
                <div className="mt-1 text-xs font-bold text-slate-300">
                  Automation L{line.automation}/{AUTOMATION_MAX_LEVEL}
                  {line.automation > 0 && ` · upkeep ${formatCurrency(line.automation * AUTOMATION_UPKEEP_PER_LEVEL)}/shift`}
                  {line.leadId && state.workers[line.leadId] ? ` · Lead: ${state.workers[line.leadId].name}` : ' · No lead'}
                </div>
                <button
                  type="button"
                  onClick={() => onUpgradeAutomation(lineId)}
                  disabled={!upgradable}
                  className="game-button game-button-auto mt-2 w-full"
                >
                  {canAutomate(line) ? `Upgrade automation · ${formatCurrency(cost)}` : 'Fully automated'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="game-panel accent-rose p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Settings · testing</div>
            <p className="text-sm font-semibold text-slate-300">
              Interstitial ads run every {AD_INTERVAL_DAYS} shifts{adFree ? ' — removed (purchase simulated) ✓' : ''}.
            </p>
          </div>
          <button type="button" onClick={onToggleAdsTesting} className="game-button game-button-muted">
            Ads: {adsOn ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div>
            <div className="eyebrow">Danger zone</div>
            <p className="text-sm font-semibold text-slate-300">Wipe the save and start a fresh plant.</p>
          </div>
          <button type="button" onClick={onReset} className="game-button game-button-danger">
            Reset run
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OBJECTIVES — the progression ladder, surfaced on the Floor
// ---------------------------------------------------------------------------

function ObjectivesPanel({ state }: { state: GameState }) {
  const open = openObjectives(state, 3);
  const cleared = state.completedObjectives.length;
  return (
    <section className="game-panel accent-green p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Career goals</div>
          <h2 className="text-2xl font-black text-white">Objectives</h2>
        </div>
        <div className="objective-count">{cleared}/{OBJECTIVES.length}</div>
      </div>
      <hr className="panel-divider" />
      {open.length > 0 ? (
        <div className="space-y-2">
          {open.map(o => <ObjectiveRow key={o.id} obj={o} state={state} />)}
        </div>
      ) : (
        <div className="empty-bench">Every goal cleared. You run a hell of a floor.</div>
      )}
    </section>
  );
}

function ObjectiveRow({ obj, state }: { obj: Objective; state: GameState }) {
  const prog = obj.progress?.(state);
  const ratio = prog ? Math.min(1, prog.current / prog.target) : 0;
  const progText = prog
    ? prog.target >= 1000
      ? `${formatCurrency(prog.current)} / ${formatCurrency(prog.target)}`
      : `${prog.current}/${prog.target}`
    : '';
  return (
    <div className="objective-row">
      <div className="flex items-center justify-between gap-2">
        <span className="objective-label">{obj.label}</span>
        <span className="objective-reward">+{formatCurrency(obj.reward)}</span>
      </div>
      <div className="objective-hint">{obj.hint}</div>
      {prog && (
        <div className="objective-rail">
          <div style={{ width: `${Math.max(4, ratio * 100)}%` }} />
          <span className="objective-progress-text">{progText}</span>
        </div>
      )}
    </div>
  );
}

// Compact list of the orders behind the hero contract — the visible backlog.
function OrdersStrip({ orders, tick, clients }: { orders: Order[]; tick: number; clients: GameState['clients'] }) {
  return (
    <section className="game-panel accent-amber p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">Contract board</div>
        <span className="text-xs font-bold text-slate-400">{orders.length} more queued</span>
      </div>
      <hr className="panel-divider" />
      <div className="orders-strip">
        {orders.map(o => {
          const remaining = o.deadline - tick;
          const progress = o.unitsCompleted / o.units;
          const urgent = remaining < TICKS_PER_SHIFT;
          return (
            <div key={o.id} className="order-mini">
              <div className="flex items-center justify-between gap-2">
                <span className="order-mini-sku">{o.sku}</span>
                <span className={`order-mini-clock ${remaining <= 0 ? 'danger' : urgent ? 'warn' : ''}`}>
                  {ticksToTimeRemaining(remaining)}
                </span>
              </div>
              <div className="order-mini-rail">
                <div style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />
              </div>
              <div className="order-mini-meta">
                {clients[o.clientId]?.name ?? o.clientId} · {orderProfile(o).short} · {Math.round(o.unitsCompleted)} / {o.units} · ${o.revenuePerUnit.toFixed(2)}/u
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// JUICE — toasts, offline welcome-back, and the game-over wall
// ---------------------------------------------------------------------------

interface ToastSpec { text: string; tone: string; tag: string; sound?: SoundKind }
interface ToastItem extends ToastSpec { id: string }

// Which events earn a pop-up + sound. Deliberately a subset — payroll, morale
// drift, and per-worker attendance would be noise.
function toastForEvent(e: GameEvent): ToastSpec | null {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} shipped · +$${Math.round(p.revenue as number).toLocaleString()}`, tone: 'toast-good', tag: 'WIN', sound: 'cash' };
    case 'OBJECTIVE_COMPLETED':
      return { text: `Goal cleared: ${p.label} · +$${(p.reward as number).toLocaleString()}`, tone: 'toast-gold', tag: 'GOAL', sound: 'win' };
    case 'WORKER_HIRED':
      return { text: `${p.workerName} joined the crew`, tone: 'toast-good', tag: 'HIRE', sound: 'hire' };
    case 'WORKER_CONVERTED':
      return { text: `${p.workerName} is now a company employee`, tone: 'toast-good', tag: 'PERM', sound: 'hire' };
    case 'LEAD_PROMOTED':
      return { text: `${p.workerName} promoted to lead`, tone: 'toast-good', tag: 'LEAD', sound: 'click' };
    case 'LINE_PURCHASED':
      return { text: `${p.lineName} opened`, tone: 'toast-good', tag: 'BUILD', sound: 'win' };
    case 'WORKER_QUIT':
      return { text: `${p.workerName} quit`, tone: 'toast-bad', tag: 'QUIT', sound: 'bad' };
    case 'WORKER_TERMINATED':
      return { text: `${p.workerName} terminated`, tone: 'toast-bad', tag: 'TERM', sound: 'bad' };
    case 'INCIDENT':
      return { text: `Floor incident · -$${Math.round(p.cost as number).toLocaleString()}`, tone: 'toast-bad', tag: 'SAFETY', sound: 'bad' };
    case 'SHIFT_CHALLENGE':
      return { text: `${p.title}`, tone: 'toast-alert', tag: 'CALL', sound: 'alert' };
    case 'ORDER_MISSED':
      return { text: `Order ${p.sku} blew its deadline`, tone: 'toast-bad', tag: 'LATE', sound: 'alert' };
    case 'CASH_WARNING':
      return { text: `Cash in the red — deliver orders or cut costs`, tone: 'toast-alert', tag: 'CASH', sound: 'alert' };
    case 'CLIENT_UNLOCKED':
      return { text: `New client: ${p.clientName} — better rates unlocked`, tone: 'toast-gold', tag: 'CLIENT', sound: 'win' };
    case 'SUPERVISOR_HIRED':
      return { text: `Supervisor hired — the plant earns while you're away`, tone: 'toast-gold', tag: 'OPS', sound: 'win' };
    case 'FEATURE_UNLOCKED':
      return { text: `${p.name} unlocked`, tone: 'toast-gold', tag: 'SHOP', sound: 'win' };
    case 'GAME_OVER':
      return { text: `The plant shut down`, tone: 'toast-bad', tag: 'OVER', sound: 'over' };
    default:
      return null;
  }
}

function Toasts({ toasts, onDone }: { toasts: ToastItem[]; onDone: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => <Toast key={t.id} toast={t} onDone={onDone} />)}
    </div>
  );
}

function Toast({ toast, onDone }: { toast: ToastItem; onDone: (id: string) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onDone(toast.id), 3400);
    return () => clearTimeout(id);
  }, [toast.id, onDone]);
  return (
    <button type="button" className={`toast ${toast.tone}`} onClick={() => onDone(toast.id)}>
      <span className="toast-tag">{toast.tag}</span>
      <span className="min-w-0 flex-1 text-left">{toast.text}</span>
    </button>
  );
}

function SummaryStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`summary-stat ${good ? 'good' : 'bad'}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OfflineModal({ summary, onClose }: { summary: OfflineSummary; onClose: () => void }) {
  const gain = summary.cashDelta;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={e => e.stopPropagation()}>
        <div className="eyebrow">While you were away</div>
        <h2 className="mt-1 text-3xl font-black text-white">{formatAwayTime(summary.awayMs)} off the clock</h2>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          The crew kept the belt moving{summary.capped ? ' — credited up to the offline cap' : ''}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <SummaryStat label="Net cash" value={`${gain >= 0 ? '+' : '-'}${formatCurrency(Math.abs(gain))}`} good={gain >= 0} />
          <SummaryStat label="Shifts run" value={`${(summary.ticks / TICKS_PER_SHIFT).toFixed(1)}`} good />
          <SummaryStat label="Orders shipped" value={`${summary.ordersCompleted}`} good />
          {summary.ordersMissed > 0 && <SummaryStat label="Orders missed" value={`${summary.ordersMissed}`} good={false} />}
          {summary.quits > 0 && <SummaryStat label="Walked off" value={`${summary.quits}`} good={false} />}
          {summary.incidents > 0 && <SummaryStat label="Incidents" value={`${summary.incidents}`} good={false} />}
          {summary.objectives > 0 && <SummaryStat label="Goals cleared" value={`${summary.objectives}`} good />}
        </div>
        {summary.gameOver && <p className="mt-3 text-sm font-black text-rose-300">The plant went under while you were gone.</p>}
        <button type="button" onClick={onClose} className="game-button game-button-primary mt-5 w-full">
          Back to the floor
        </button>
      </div>
    </div>
  );
}

function GameOverOverlay({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  return (
    <div className="overlay">
      <div className="overlay-card text-center">
        <div className="eyebrow">Run over</div>
        <h2 className="mt-1 text-4xl font-black text-white">Plant Shut Down</h2>
        <p className="mt-2 text-sm font-semibold text-slate-300">
          You ran out of cash on Day {state.day + 1}. Payroll waits for no one — keep a cushion next run.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <SummaryStat label="Orders shipped" value={`${state.completedOrders}`} good />
          <SummaryStat label="Orders missed" value={`${state.missedOrders}`} good={false} />
          <SummaryStat label="Goals cleared" value={`${state.completedObjectives.length}/${OBJECTIVES.length}`} good />
          <SummaryStat label="Days run" value={`${state.day + 1}`} good />
        </div>
        <button type="button" onClick={onRestart} className="game-button game-button-primary mt-5 w-full">
          Start a new plant
        </button>
      </div>
    </div>
  );
}

// The morning standup: the clock is held while the player staffs from whoever
// showed up. This is the core sim beat — every day you re-staff the lines.
// Compact standup bar — replaces the old full-height MorningBanner. One slim
// row: the day, turnout, staffing progress, the day's condition, an at-a-glance
// warning if present crew are still benched (they go home unpaid + sour), and
// the Auto-fill / Repeat / Start controls. Pinned near the top so it never gets
// between the tutorial and the lines, and disappears the moment the shift runs.
function StandupBar({
  state, condition, canRepeat, hasSupervisor, onAutoFill, onRepeat, onStart,
}: {
  state: GameState;
  condition: DayConditionInfo;
  canRepeat: boolean;
  hasSupervisor: boolean;
  onAutoFill: () => void;
  onRepeat: () => void;
  onStart: () => void;
}) {
  const workers = Object.values(state.workers);
  const present = workers.filter(w => w.presentThisShift);
  const absent = workers.length - present.length;
  const totalStations = Object.values(state.lines).reduce((n, l) => n + l.stations.length, 0);
  const staffed = Object.values(state.lines).reduce(
    (n, l) => n + l.stations.filter(s => s.assignedWorkerId).length, 0
  );
  const assigned = new Set(Object.values(state.lines).flatMap(line => [
    ...(line.stations.map(station => station.assignedWorkerId).filter(Boolean) as string[]),
    ...(line.supportWorkerIds ?? []),
  ]));
  const unplacedPresent = present.filter(worker => !assigned.has(worker.id)).length;
  const day = dayOfTick(state.tick);
  const fullyStaffed = staffed >= totalStations;

  return (
    <section className={`standup-bar tone-${condition.tone}`}>
      <div className="standup-facts">
        <span className="standup-day">Day {day + 1} · {weekday(day)}</span>
        <span className="standup-stat" title="Crew who clocked in today">
          <strong className="text-emerald-300">{present.length}</strong>/{workers.length} in
          {absent > 0 && <span className="text-rose-300"> · {absent} out</span>}
        </span>
        <span className={`standup-stat ${fullyStaffed ? '' : 'short'}`} title="Stations covered">
          <strong>{staffed}/{totalStations}</strong> staffed
        </span>
        <span className={`standup-condition tone-${condition.tone}`} title={condition.note}>
          {condition.label}
        </span>
        {unplacedPresent > 0 && (
          <span className="standup-warn" title="Present crew left on the bench are sent home unpaid and lose morale">
            ⚠ {unplacedPresent} idle — they go home unpaid & sour
          </span>
        )}
      </div>
      <div className="standup-actions">
        {hasSupervisor && (
          <button
            type="button"
            onClick={onAutoFill}
            title="The supervisor seats yesterday's lineup, then fills gaps by best skill"
            className="game-button game-button-muted"
          >
            Auto-fill
          </button>
        )}
        <button
          type="button"
          onClick={onRepeat}
          disabled={!canRepeat}
          title={canRepeat ? "Re-seat everyone who's back to their old station" : 'No prior lineup to repeat yet'}
          className="game-button game-button-muted"
        >
          Repeat
        </button>
        <button type="button" data-tut="start" onClick={onStart} className="game-button game-button-primary">
          Start shift ▸
        </button>
      </div>
    </section>
  );
}

// Fixed bottom prompt (above the tab bar) once a worker is picked — the
// mobile-friendly half of "tap a worker, tap a station" so the cue never
// scrolls off-screen while the stations sit higher up the page.
function PlacingBar({ worker, onCancel }: { worker: Worker; onCancel: () => void }) {
  const profile = profileForWorker(worker);
  return (
    <div className="placing-bar">
      <CharacterAvatar worker={worker} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="placing-title">Placing {profile.firstName}</div>
        <div className="placing-sub">Tap a station — or drag the card onto a slot</div>
      </div>
      <button type="button" className="placing-cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}



// Best-fit picker for a tapped station: present, unassigned workers sorted by
// proficiency at exactly that station. Staffing happens where the need is —
// no scrolling back to the bench.
function StationPicker({
  target, benchWorkers, onPick, onClose,
}: {
  target: { lineId: string; stationId: string; stationName: string; role: string };
  benchWorkers: Worker[];
  onPick: (workerId: string) => void;
  onClose: () => void;
}) {
  const candidates = benchWorkers
    .filter(w => w.presentThisShift)
    .map(w => ({ worker: w, prof: w.skills.find(sk => sk.stationId === target.role)?.proficiency ?? null }))
    .sort((a, b) => (b.prof ?? UNTRAINED_PROFICIENCY) - (a.prof ?? UNTRAINED_PROFICIENCY));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={e => e.stopPropagation()}>
        <div className="eyebrow">Staff this station</div>
        <h2 className="mt-1 text-2xl font-black text-white">{target.stationName}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          Best fit first · untrained workers run at {Math.round(UNTRAINED_PROFICIENCY * 100)}%
        </p>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {candidates.length === 0 && (
            <div className="empty-bench">
              Nobody available — everyone present is already placed. Hire, or pull someone off another station.
            </div>
          )}
          {candidates.map(({ worker, prof }) => (
            <button
              key={worker.id}
              type="button"
              onClick={() => onPick(worker.id)}
              className="picker-row"
            >
              <CharacterAvatar worker={worker} size="sm" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-black text-white">{worker.name}</span>
                <span className="block truncate text-xs font-bold text-slate-400">
                  Mood {pct(worker.morale)} · Trust {pct(worker.reliability)}
                </span>
              </span>
              <span className={`text-sm font-black ${prof != null ? 'text-emerald-300' : 'text-slate-500'}`}>
                {prof != null ? pct(prof) : 'untrained'}
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="game-button game-button-muted mt-4 w-full">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MONETIZATION + ONBOARDING + JUICE
// ---------------------------------------------------------------------------

const AD_INTERVAL_DAYS = 5;

// Flash-on-change hook: true for a moment whenever the watched value moves.
function useBump(value: number): boolean {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    prev.current = value;
    setBump(true);
    const t = setTimeout(() => setBump(false), 650);
    return () => clearTimeout(t);
  }, [value]);
  return bump;
}

// Guided walkthrough (entered from the Welcome modal). `auto` steps advance
// when the player does the thing; the rest wait for "Got it". `target` lights
// up the button they need to press next. Skippable at any point.
const TUTORIAL_STEPS: {
  title: string;
  text: string;
  target?: 'stations' | 'start' | 'goal';
  auto?: (ctx: { selected: string | null; staffed: number; shiftRunning: boolean }) => boolean;
}[] = [
  {
    title: 'Staff your first station',
    text: 'Tap a glowing station. Your crew is on the bench — pick whoever fits best (the list sorts by skill for you).',
    target: 'stations',
    auto: ctx => ctx.staffed >= 1,
  },
  {
    title: 'Cover all three stations',
    text: 'A line only produces when Induct, Pack, AND Stage are all staffed. Fill the other two glowing slots.',
    target: 'stations',
    auto: ctx => ctx.staffed >= 3,
  },
  {
    title: 'Start the shift',
    text: 'Hit the glowing Start button. One shift = one 10-hour day — payroll and rent settle at the end of it.',
    target: 'start',
    auto: ctx => ctx.shiftRunning,
  },
  {
    title: 'Cartons are rolling',
    text: 'The belt under the stations shows your live rate. Your contract on the Orders tab pays per unit on delivery — beat the deadline or take a reputation hit.',
  },
  {
    title: 'The delicate cycle',
    text: 'Here’s the catch you’ll spend the game balancing: a deep bench covers no-shows, but anyone you DON’T place is sent home unpaid and sours. Pushing output (overtime) burns morale; buying morale back (meals, raises, perks) burns cash. Run too lean and one absence stalls a line; run too fat and you bleed money and goodwill. Find the edge.',
  },
  {
    title: 'Your people decide everything',
    text: 'You can’t force anyone to show up — only pay well, keep morale up, and staff to the day’s real demand. The glowing Next Goal always points at your best next move. Good luck, boss.',
    target: 'goal',
  },
];

// The first thing a new boss sees: the pitch, and the fork — dive in, or be
// walked through it. Frames the game's core tension up front.
function WelcomeModal({ onStart, onTutorial }: { onStart: () => void; onTutorial: () => void }) {
  return (
    <div className="overlay" style={{ zIndex: 85 }}>
      <div className="overlay-card welcome-card">
        <div className="eyebrow">Welcome to</div>
        <h2 className="welcome-title">Co-Pack</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-200">
          You run a contract packaging plant. Lines, automation, and capital are yours to
          command — but the input that decides whether you ship or sink is the one you
          control <strong className="text-white">least</strong>: your workforce.
        </p>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">
          People no-show, burn out, quit, or shine. A deep bench covers the bad mornings —
          but you can’t pay people to stand around, so anyone you don’t place goes home unpaid
          and sours. Push output and morale drops; buy morale back and cash drops. It’s a tight
          cycle you’ll learn to ride. Master the crew and the cartons take care of themselves.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onTutorial} className="game-button game-button-primary py-3">
            Take the tutorial
          </button>
          <button type="button" onClick={onStart} className="game-button game-button-muted py-3">
            Start now
          </button>
        </div>
        <p className="mt-3 text-center text-xs font-bold text-slate-500">
          The tutorial highlights each step — about a minute.
        </p>
      </div>
    </div>
  );
}

function TutorialCard({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const s = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)];
  return (
    <section className="tutorial-card">
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Tutorial · {Math.min(step + 1, TUTORIAL_STEPS.length)}/{TUTORIAL_STEPS.length}</div>
        <h2 className="text-lg font-black text-white">{s.title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-200">{s.text}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {!s.auto && (
          <button type="button" onClick={onNext} className="game-button game-button-primary">
            {step >= TUTORIAL_STEPS.length - 1 ? 'Let\u2019s go!' : 'Got it'}
          </button>
        )}
        <button type="button" onClick={onSkip} className="tutorial-skip">Skip tutorial</button>
      </div>
    </section>
  );
}

// Interstitial placeholder: same shape a real ad SDK fills later (showAd →
// network ad → dismiss callback). The countdown + remove-ads flow match the
// production UX so the cadence can be playtested before AdMob/StoreKit land.
function AdModal({ adFree, onDismiss, onRemoveAds }: { adFree: boolean; onDismiss: () => void; onRemoveAds: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(5);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  return (
    <div className="overlay" style={{ zIndex: 80 }}>
      <div className="overlay-card">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow">Ad break</div>
          <span className="ad-counter">{secondsLeft > 0 ? `${secondsLeft}s` : '✓'}</span>
        </div>
        <div className="ad-house mt-3">
          <div className="ad-house-badge">AD</div>
          <h2 className="text-2xl font-black text-white">Co-Pack runs on ads</h2>
          <p className="mt-1 text-sm font-semibold text-slate-300">
            A short break every {AD_INTERVAL_DAYS} shifts keeps the game free. (Placeholder — a
            network ad renders here in production builds.)
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={secondsLeft > 0}
          className="game-button game-button-primary mt-4 w-full"
        >
          {secondsLeft > 0 ? `Continue in ${secondsLeft}…` : 'Continue ▸'}
        </button>
        {!adFree && (
          <button type="button" onClick={onRemoveAds} className="game-button game-button-muted mt-2 w-full">
            Remove ads · $2.99 (simulated in test builds)
          </button>
        )}
      </div>
    </div>
  );
}

// A burst of falling confetti for the golden moments. Pure CSS animation;
// remounts (and so replays) on every new burst key, cleans itself up after.
function ConfettiBurst({ burst }: { burst: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, [burst]);
  if (!visible) return null;
  const colors = ['#72ef8f', '#68d8ff', '#ffe66c', '#ff7a9a', '#7c6cff', '#35d0ba'];
  return (
    <div className="confetti-stage" key={burst} aria-hidden="true">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${4 + (i * 89) % 92}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 0.07}s`,
            animationDuration: `${1.2 + ((i * 37) % 10) / 12}s`,
            '--confetti-drift': `${(((i * 53) % 11) - 5) * 14}px`,
            '--confetti-spin': `${360 + ((i * 71) % 360)}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="game-shell flex min-h-screen flex-col items-center justify-center px-6">
      <div className="game-grid-bg" />
      <div className="relative flex flex-col items-center gap-8 text-center">
        <img
          src={`${import.meta.env.BASE_URL}splash.png`}
          alt="Co-Pack"
          className="w-full max-w-sm object-contain drop-shadow-2xl sm:max-w-md"
        />
        <p className="max-w-xs text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
          Idle contract packaging simulation
        </p>
        <button
          type="button"
          onClick={onStart}
          className="game-button game-button-primary px-10 py-3 text-base"
        >
          Start Shift
        </button>
      </div>
    </div>
  );
}
