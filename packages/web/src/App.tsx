import React, { useEffect, useMemo, useRef } from 'react';
import {
  GameState, GameEvent, Line, Order, Worker,
  nextLineCost, canBuyLine, shoutoutReady, totalPayroll,
  reputationPayMultiplier, OVERTIME_MULTIPLIER,
  fillRate, FILL_RATE_TARGET, flightRisk, trainingCost, canTrain,
} from '@copack/engine';
import { useGameStore, SpeedSetting, HIRE_COST } from './hooks/useGameStore';

type CharacterProfile = {
  alias: string;
  role: string;
  trait: string;
  palette: string;
  skin: string;
  hair: string;
  uniform: string;
  shape: 'round' | 'square' | 'diamond' | 'wide';
};

const BASE_UNITS_PER_TICK = 0.6;
const UNTRAINED_PROFICIENCY = 0.40;

const STATION_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };
const STATION_THEMES: Record<string, { icon: string; color: string; note: string }> = {
  s1: { icon: 'IN', color: '#35d0ba', note: 'Feed' },
  s2: { icon: 'PK', color: '#ffb02e', note: 'Build' },
  s3: { icon: 'ST', color: '#ff5f7e', note: 'Ship' },
};

const PROFILE_BANK: CharacterProfile[] = [
  {
    alias: 'Switch',
    role: 'Induct specialist',
    trait: 'Fast starts',
    palette: '#35d0ba',
    skin: '#c8895f',
    hair: '#182033',
    uniform: '#2fb8a8',
    shape: 'round',
  },
  {
    alias: 'Ribbon',
    role: 'Pack captain',
    trait: 'Clean hands',
    palette: '#ffb02e',
    skin: '#8f5f45',
    hair: '#351f24',
    uniform: '#ef8f2f',
    shape: 'square',
  },
  {
    alias: 'Docklight',
    role: 'Stage runner',
    trait: 'Cool under rush',
    palette: '#ff5f7e',
    skin: '#b56f53',
    hair: '#522f8f',
    uniform: '#d9557b',
    shape: 'diamond',
  },
  {
    alias: 'Torque',
    role: 'Line flex',
    trait: 'Steady tempo',
    palette: '#7c6cff',
    skin: '#d6a16f',
    hair: '#24335f',
    uniform: '#6b62e8',
    shape: 'wide',
  },
  {
    alias: 'Cricket',
    role: 'Quality scout',
    trait: 'Sharp eyes',
    palette: '#6ee56e',
    skin: '#a96f4f',
    hair: '#1d2b1f',
    uniform: '#34b96f',
    shape: 'round',
  },
  {
    alias: 'Nova',
    role: 'Rush finisher',
    trait: 'Late save',
    palette: '#ff7a45',
    skin: '#734a3b',
    hair: '#111827',
    uniform: '#e86b4f',
    shape: 'square',
  },
];

function ticksToTimeRemaining(ticks: number): string {
  if (ticks <= 0) return 'OVERDUE';
  const days = Math.floor(ticks / 1440);
  const hours = Math.floor((ticks % 1440) / 60);
  const mins = ticks % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

function shiftLabel(tick: number): string {
  const day = Math.floor(tick / 1440) + 1;
  const shift = Math.floor((tick % 1440) / 480) + 1;
  return `Day ${day} / Shift ${shift}`;
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
  const idNumber = Number(worker.id.replace(/\D/g, ''));
  const index = Number.isFinite(idNumber) && idNumber > 0
    ? idNumber - 1
    : worker.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = PROFILE_BANK[index % PROFILE_BANK.length];
  const strongestSkill = [...worker.skills].sort((a, b) => b.proficiency - a.proficiency)[0];
  const stationName = strongestSkill ? STATION_NAMES[strongestSkill.stationId] : 'Flex';

  return {
    ...base,
    role: index >= PROFILE_BANK.length ? `${stationName} prospect` : base.role,
  };
}

function averageMorale(workers: Worker[]): number {
  if (workers.length === 0) return 0;
  return workers.reduce((sum, worker) => sum + worker.morale, 0) / workers.length;
}

function computeThroughput(state: GameState): number {
  let total = 0;
  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;
    const staffed = line.stations.filter(
      s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
    );
    if (staffed.length === 0) continue;
    const staffingRatio = staffed.length / line.stations.length;
    const workers = staffed.map(s => state.workers[s.assignedWorkerId!]);
    const avgMorale = workers.reduce((sum, w) => sum + w.morale, 0) / workers.length;
    const avgSkill = staffed.reduce((sum, s) => {
      const worker = state.workers[s.assignedWorkerId!];
      const skill = worker.skills.find(sk => sk.stationId === s.id);
      return sum + (skill?.proficiency ?? UNTRAINED_PROFICIENCY);
    }, 0) / staffed.length;
    const skillMultiplier = 0.5 + avgSkill * 0.8;
    const overtimeMultiplier = state.overtime ? OVERTIME_MULTIPLIER : 1;
    total += BASE_UNITS_PER_TICK * (0.75 + avgMorale * 0.5) * skillMultiplier * overtimeMultiplier * staffingRatio;
  }
  return total;
}

function formatEvent(e: GameEvent): { text: string; tone: string; tag: string } {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'WORKER_ARRIVED':
      return { text: `${p.workerName} clocked in.`, tone: 'event-good', tag: 'CREW' };
    case 'WORKER_NO_SHOW':
      return { text: `${p.workerName} is a no-show.`, tone: 'event-bad', tag: 'MISS' };
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} complete. +$${(p.revenue as number).toFixed(2)}`, tone: 'event-good', tag: 'WIN' };
    case 'ORDER_MISSED':
      return { text: `Order ${p.sku} missed.`, tone: 'event-bad', tag: 'LATE' };
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
    case 'PAYROLL':
      return { text: `Payroll run: -$${(p.amount as number).toFixed(0)} for ${p.headcount} crew`, tone: 'event-alert', tag: 'PAY' };
    case 'LINE_PURCHASED':
      return { text: `${p.lineName} opened. -$${(p.cost as number).toFixed(0)}`, tone: 'event-good', tag: 'BUILD' };
    case 'OVERTIME_TOGGLED':
      return { text: `Overtime ${p.overtime ? 'ON — pushing output' : 'off'}.`, tone: p.overtime ? 'event-warm' : 'event-neutral', tag: 'OT' };
    case 'SHIFT_START': {
      const day = Math.floor(e.tick / 1440) + 1;
      const shift = Math.floor((e.tick % 1440) / 480) + 1;
      return { text: `Day ${day}, Shift ${shift} starting.`, tone: 'event-neutral', tag: 'TIME' };
    }
    default:
      return { text: e.type, tone: 'event-neutral', tag: 'LOG' };
  }
}

export default function App() {
  const {
    state, paused, speed,
    runTick, reset, togglePause, setSpeed,
    selectedWorkerId, selectWorker, assignWorker, unassignStation, hireWorker,
    buyLine, toggleOvertime, shoutout, train,
  } = useGameStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const ms = 1000 / speed;
    intervalRef.current = setInterval(runTick, ms);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runTick, paused, speed]);

  const throughput = computeThroughput(state);
  const firstOrder = state.activeOrders[0];
  const recentEvents = [...state.eventLog].reverse().slice(0, 7);
  const workers = Object.values(state.workers);
  const assignedIds = useMemo(
    () => new Set(
      Object.values(state.lines).flatMap(l =>
        l.stations.map(s => s.assignedWorkerId).filter(Boolean) as string[]
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
  const lineCost = nextLineCost(state);
  const canAffordLine = canBuyLine(state);
  const canShoutout = shoutoutReady(state) && !paused;
  const payroll = totalPayroll(state);
  const primaryClient = firstOrder ? state.clients[firstOrder.clientId] : Object.values(state.clients)[0];
  const reputation = primaryClient?.reputation ?? 1;
  const fill = fillRate(state);
  const fillBelowTarget = fill < FILL_RATE_TARGET;

  return (
    <div className="game-shell min-h-screen text-white">
      <div className="game-grid-bg" />
      <main className="relative mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <header className="hud-panel mb-4 p-3 sm:p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="eyebrow">Co-Pack Tactics</div>
              <h1 className="text-3xl font-black tracking-normal text-white sm:text-5xl">
                Floor Rush
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                <span className="status-pill status-time">{shiftLabel(state.tick)}</span>
                <span className={`status-pill ${paused ? 'status-paused' : 'status-live'}`}>
                  {paused ? 'Paused' : 'Live run'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:min-w-[700px]">
              <HudStat label="Cash" value={formatCurrency(state.cash)} tone="green" />
              <HudStat
                label={`Fill · goal ${pct(FILL_RATE_TARGET)}`}
                value={pct(fill)}
                tone={fillBelowTarget ? 'red' : 'green'}
              />
              <HudStat label="Output" value={`${throughput.toFixed(2)}/min`} tone="cyan" />
              <HudStat label="Crew" value={`${staffedStations}/${totalStations}`} tone="pink" />
              <HudStat label="Morale" value={pct(averageMorale(workers))} tone="gold" />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
                title="Overtime: more output now, morale cost at shift end"
                className={`game-button ${state.overtime ? 'game-button-ot-on' : 'game-button-muted'}`}
              >
                {state.overtime ? 'Overtime ON' : 'Overtime'}
              </button>
              <button type="button" onClick={reset} className="game-button game-button-muted">
                Reset
              </button>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
              Payroll {formatCurrency(payroll)}/shift
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            {firstOrder ? (
              <OrderHero
                order={firstOrder}
                tick={state.tick}
                throughput={throughput}
                reputation={reputation}
                clientName={primaryClient?.name ?? firstOrder.clientId}
              />
            ) : (
              <div className="game-panel flex min-h-[180px] items-center justify-center p-5 text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
                No active orders
              </div>
            )}

            {selectedWorker && (
              <WorkerActionBar
                worker={selectedWorker}
                cash={state.cash}
                onTrain={train}
                onCancel={() => selectWorker(null)}
              />
            )}

            {Object.entries(state.lines).map(([lineId, line]) => (
              <FloorLine
                key={lineId}
                lineId={lineId}
                line={line}
                workers={state.workers}
                throughput={throughput}
                selectedWorkerId={selectedWorkerId}
                onSelectWorker={selectWorker}
                onAssign={assignWorker}
                onUnassign={unassignStation}
              />
            ))}
          </section>

          <aside className="space-y-4">
            <CrewPanel
              benchWorkers={benchWorkers}
              allAssigned={benchWorkers.length === 0}
              selectedWorkerId={selectedWorkerId}
              cash={state.cash}
              lineCost={lineCost}
              canAffordLine={canAffordLine}
              lineCount={state.lineCount}
              onHire={hireWorker}
              onBuyLine={buyLine}
              onSelectWorker={selectWorker}
            />
            <EventLog events={recentEvents} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function HudStat({ label, value, tone }: { label: string; value: string; tone: 'green' | 'cyan' | 'pink' | 'gold' | 'red' }) {
  return (
    <div className={`hud-stat hud-stat-${tone}`}>
      <div className="text-[0.64rem] font-black uppercase tracking-[0.18em] text-slate-950/60">{label}</div>
      <div className="mt-1 truncate text-xl font-black leading-none text-slate-950 sm:text-2xl">{value}</div>
    </div>
  );
}

function OrderHero({
  order, tick, throughput, reputation, clientName,
}: { order: Order; tick: number; throughput: number; reputation: number; clientName: string }) {
  const progress = order.unitsCompleted / order.units;
  const remaining = order.deadline - tick;
  const isUrgent = remaining < 480;
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

function FloorLine({
  lineId, line, workers, throughput, selectedWorkerId,
  onSelectWorker, onAssign, onUnassign,
}: {
  lineId: string;
  line: Line;
  workers: Record<string, Worker>;
  throughput: number;
  selectedWorkerId: string | null;
  onSelectWorker: (id: string | null) => void;
  onAssign: (workerId: string, lineId: string, stationId: string) => void;
  onUnassign: (lineId: string, stationId: string) => void;
}) {
  const presentCount = line.stations.filter(
    s => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift
  ).length;
  const isStopped = presentCount === 0;
  const isShort = presentCount > 0 && presentCount < line.stations.length;
  const selectedWorker = selectedWorkerId ? workers[selectedWorkerId] : null;

  return (
    <section className="game-panel p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Production board</div>
          <h2 className="text-2xl font-black text-white">{line.name}</h2>
        </div>
        <div className={`line-status ${isStopped ? 'blocked' : isShort ? 'short' : 'running'}`}>
          {isStopped
            ? 'Idle 0/' + line.stations.length
            : isShort
              ? `Short-staffed ${presentCount}/${line.stations.length}`
              : `Running ${throughput.toFixed(2)}/min`}
        </div>
      </div>

      <div className="conveyor-wrap">
        <div className="conveyor-belt" />
        <div className="station-grid">
          {line.stations.map((station, index) => {
            const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
            const present = worker?.presentThisShift ?? false;
            const hasTarget = selectedWorkerId !== null;
            const isSkillMatch = selectedWorker?.skills.some(sk => sk.stationId === station.id) ?? false;
            const theme = STATION_THEMES[station.id] ?? STATION_THEMES.s1;

            return (
              <StationTile
                key={station.id}
                index={index}
                stationName={station.name}
                theme={theme}
                worker={worker}
                present={present}
                hasTarget={hasTarget}
                isSkillMatch={isSkillMatch}
                selectedWorker={selectedWorker}
                onAssign={() => selectedWorkerId && onAssign(selectedWorkerId, lineId, station.id)}
                onSelect={() => worker && onSelectWorker(worker.id)}
                onUnassign={(event) => {
                  event.stopPropagation();
                  onUnassign(lineId, station.id);
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StationTile({
  index, stationName, theme, worker, present, hasTarget, isSkillMatch, selectedWorker,
  onAssign, onSelect, onUnassign,
}: {
  index: number;
  stationName: string;
  theme: { icon: string; color: string; note: string };
  worker: Worker | null;
  present: boolean;
  hasTarget: boolean;
  isSkillMatch: boolean;
  selectedWorker: Worker | null;
  onAssign: () => void;
  onSelect: () => void;
  onUnassign: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const profile = worker ? profileForWorker(worker) : null;
  const selectedProfile = selectedWorker ? profileForWorker(selectedWorker) : null;
  const stationClass = [
    'station-card',
    worker ? 'occupied' : 'empty',
    present ? 'present' : '',
    hasTarget ? 'targeting' : '',
    isSkillMatch ? 'match' : '',
    worker && !present ? 'absent' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={stationClass}
      style={{ '--station-color': theme.color } as React.CSSProperties}
      onClick={hasTarget ? onAssign : onSelect}
    >
      <div className="station-topline">
        <span className="station-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="station-code">{theme.icon}</span>
      </div>

      <div className="station-body">
        {worker && profile ? (
          <>
            <CharacterAvatar worker={worker} />
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-lg font-black text-white">{profile.alias}</div>
              <div className="truncate text-sm font-bold text-slate-300">{worker.name}</div>
              <div className={`mt-2 inline-flex rounded px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.14em] ${present ? 'bg-emerald-300 text-slate-950' : 'bg-rose-400 text-white'}`}>
                {present ? 'On deck' : 'No-show'}
              </div>
            </div>
            <button type="button" className="station-clear" title="Unassign worker" onClick={onUnassign}>
              X
            </button>
          </>
        ) : (
          <div className="empty-station">
            <div className="empty-icon">{theme.note}</div>
            <div className="text-lg font-black text-white">{stationName}</div>
            <div className={isSkillMatch ? 'text-amber-200' : hasTarget ? 'text-slate-200' : 'text-slate-500'}>
              {hasTarget
                ? isSkillMatch
                  ? `${selectedProfile?.alias ?? 'Crew'} match`
                  : `Assign ${selectedProfile?.alias ?? 'crew'}`
                : 'Open station'}
            </div>
          </div>
        )}
      </div>

      {worker ? (
        <div className="station-bars">
          <MiniBar label="Mood" value={worker.morale} />
          <MiniBar label="Trust" value={worker.reliability} />
        </div>
      ) : (
        <div className="station-hint">{hasTarget ? 'Click to place' : 'Select a crew card first'}</div>
      )}
    </button>
  );
}

const TRAINABLE_STATIONS = ['s1', 's2', 's3'];

function WorkerActionBar({
  worker, cash, onTrain, onCancel,
}: {
  worker: Worker;
  cash: number;
  onTrain: (workerId: string, stationId: string) => void;
  onCancel: () => void;
}) {
  const profile = profileForWorker(worker);
  const risk = flightRisk(worker);
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
            <div className="text-sm font-black text-white">{profile.alias} · {worker.name}</div>
            <div className="text-xs text-amber-100/80">
              Click a station to assign · <span className={`risk-${risk}`}>{riskCopy}</span>
            </div>
          </div>
        </div>
        <button type="button" className="worker-action-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>

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
  benchWorkers, allAssigned, selectedWorkerId, cash,
  lineCost, canAffordLine, lineCount, onHire, onBuyLine, onSelectWorker,
}: {
  benchWorkers: Worker[];
  allAssigned: boolean;
  selectedWorkerId: string | null;
  cash: number;
  lineCost: number;
  canAffordLine: boolean;
  lineCount: number;
  onHire: () => void;
  onBuyLine: () => void;
  onSelectWorker: (id: string | null) => void;
}) {
  return (
    <section className="game-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Crew bench</div>
          <h2 className="text-2xl font-black text-white">{allAssigned ? 'All Deployed' : 'Ready Crew'}</h2>
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

      <button
        type="button"
        onClick={onBuyLine}
        disabled={!canAffordLine}
        title="Open another production line so bench crew can run it"
        className="game-button game-button-line mb-4 w-full"
      >
        Open Line {String.fromCharCode(64 + lineCount + 1)} · {formatCurrency(lineCost)}
      </button>

      {benchWorkers.length > 0 ? (
        <div className="grid gap-3">
          {benchWorkers.map(worker => (
            <BenchWorker
              key={worker.id}
              worker={worker}
              selectedWorkerId={selectedWorkerId}
              onSelect={() => onSelectWorker(worker.id)}
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

function BenchWorker({
  worker, selectedWorkerId, onSelect,
}: { worker: Worker; selectedWorkerId: string | null; onSelect: () => void }) {
  const isSelected = selectedWorkerId === worker.id;
  const profile = profileForWorker(worker);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`crew-card ${isSelected ? 'selected' : ''}`}
      style={{ '--crew-color': profile.palette } as React.CSSProperties}
    >
      <CharacterAvatar worker={worker} />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-lg font-black text-white">{profile.alias}</div>
            {flightRisk(worker) !== 'low' && (
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
          {worker.skills.map(sk => (
            <span key={sk.stationId} className="skill-chip">
              {STATION_NAMES[sk.stationId] ?? sk.stationId} {pct(sk.proficiency)}
            </span>
          ))}
          <span className="trait-chip">{profile.trait}</span>
        </div>
      </div>
    </button>
  );
}

function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: 'sm' | 'md' }) {
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
    <section className="game-panel p-4">
      <div className="mb-3">
        <div className="eyebrow">Floor radio</div>
        <h2 className="text-2xl font-black text-white">Shift Feed</h2>
      </div>
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
