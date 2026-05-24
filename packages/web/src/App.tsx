import React, { useEffect, useRef } from 'react';
import { GameState, GameEvent, Line, Order, Worker } from '@copack/engine';
import { useGameStore, SpeedSetting, HIRE_COST } from './hooks/useGameStore';

// ─── helpers ────────────────────────────────────────────────────────────────

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
  return `Day ${day}  ·  Shift ${shift}`;
}

const BASE_UNITS_PER_TICK = 0.6;
const UNTRAINED_PROFICIENCY = 0.30;

// Approximate throughput for display — mirrors engine logic, display-only
function computeThroughput(state: GameState): number {
  let total = 0;
  for (const line of Object.values(state.lines)) {
    if (!line.active) continue;
    const staffed = line.stations.filter(
      s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
    );
    if (staffed.length < line.stations.length) continue; // pipeline blocked
    const workers = staffed.map(s => state.workers[s.assignedWorkerId!]);
    const avgMorale = workers.reduce((sum, w) => sum + w.morale, 0) / workers.length;
    const avgSkill = staffed.reduce((sum, s) => {
      const worker = state.workers[s.assignedWorkerId!];
      const skill = worker.skills.find(sk => sk.stationId === s.id);
      return sum + (skill?.proficiency ?? UNTRAINED_PROFICIENCY);
    }, 0) / staffed.length;
    const skillMultiplier = 0.5 + avgSkill * 0.8;
    total += BASE_UNITS_PER_TICK * (0.75 + avgMorale * 0.5) * skillMultiplier;
  }
  return total;
}

function formatEvent(e: GameEvent): { text: string; color: string } {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'WORKER_ARRIVED':
      return { text: `${p.workerName} clocked in.`, color: 'text-slate-400' };
    case 'WORKER_NO_SHOW':
      return { text: `${p.workerName} is a no-show.`, color: 'text-red-400' };
    case 'ORDER_COMPLETED':
      return { text: `Order ${p.sku} complete! +$${(p.revenue as number).toFixed(2)}`, color: 'text-green-400' };
    case 'ORDER_MISSED':
      return { text: `Order ${p.sku} MISSED.`, color: 'text-red-500' };
    case 'MORALE_SHIFT': {
      const delta = p.delta as number;
      const sign = delta > 0 ? '+' : '';
      return {
        text: `${p.workerName}: morale ${sign}${(delta * 100).toFixed(0)}% (${p.cause})`,
        color: delta > 0 ? 'text-yellow-400' : 'text-orange-400',
      };
    }
    case 'SHIFT_START': {
      const day = Math.floor(e.tick / 1440) + 1;
      const shift = Math.floor((e.tick % 1440) / 480) + 1;
      return { text: `Day ${day}, Shift ${shift} starting`, color: 'text-slate-600' };
    }
    default:
      return { text: e.type, color: 'text-slate-600' };
  }
}

// ─── root ────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    state, paused, speed,
    runTick, reset, togglePause, setSpeed,
    selectedWorkerId, selectWorker, assignWorker, unassignStation, hireWorker,
  } = useGameStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    const ms = 1000 / speed;
    intervalRef.current = setInterval(runTick, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runTick, paused, speed]);

  const throughput = computeThroughput(state);
  const firstOrder = state.activeOrders[0];
  const recentEvents = [...state.eventLog].reverse().slice(0, 5);

  // Workers not assigned to any station
  const assignedIds = new Set(
    Object.values(state.lines).flatMap(l =>
      l.stations.map(s => s.assignedWorkerId).filter(Boolean) as string[]
    )
  );
  const benchWorkers = Object.values(state.workers).filter(w => !assignedIds.has(w.id));

  return (
    <div className="min-h-screen bg-slate-950 text-white max-w-4xl mx-auto px-4 py-5 space-y-5">

      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-yellow-400 tracking-tight leading-none">Co-Pack Floor</h1>
          <p className="text-slate-500 text-sm mt-1">{shiftLabel(state.tick)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-slate-700 text-xs">
            {([1, 4, 16] as SpeedSetting[]).map(s => (
              <button
                type="button" key={s} onClick={() => setSpeed(s)}
                className={`px-2.5 py-1.5 transition ${speed === s && !paused ? 'bg-yellow-500 text-black font-bold' : 'text-slate-400 hover:text-white'}`}
              >{s}×</button>
            ))}
          </div>
          <button type="button" onClick={togglePause}
            className={`text-xs px-3 py-1.5 rounded-md border transition font-medium ${paused ? 'border-yellow-500 text-yellow-400 bg-yellow-950' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
          >{paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button type="button" onClick={reset}
            className="text-xs text-slate-600 border border-slate-800 rounded-md px-2.5 py-1.5 hover:border-slate-600 transition"
          >Reset</button>
        </div>
      </header>

      {/* ── Order Hero ── */}
      {firstOrder ? (
        <OrderHero order={firstOrder} tick={state.tick} throughput={throughput} />
      ) : (
        <div className="h-32 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center text-slate-600 text-sm">
          No active orders
        </div>
      )}

      {/* ── Assignment hint ── */}
      {selectedWorkerId && (
        <div className="px-4 py-2.5 bg-yellow-950 border border-yellow-700/60 rounded-lg text-yellow-300 text-sm flex items-center justify-between">
          <span><strong>{state.workers[selectedWorkerId]?.name}</strong> — click a station to assign</span>
          <button type="button" onClick={() => selectWorker(null)} className="text-yellow-600 hover:text-yellow-400 text-xs">cancel</button>
        </div>
      )}

      {/* ── Cash ── */}
      <div className="text-2xl font-mono font-bold text-green-400 tabular-nums">
        ${state.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {/* ── Floor ── */}
      {Object.entries(state.lines).map(([lineId, line]) => (
        <FloorLine
          key={lineId} lineId={lineId} line={line}
          workers={state.workers} throughput={throughput}
          selectedWorkerId={selectedWorkerId}
          onSelectWorker={selectWorker}
          onAssign={assignWorker}
          onUnassign={unassignStation}
        />
      ))}

      {/* ── Bench (unassigned workers + hire button) ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-600 uppercase tracking-widest">
            {benchWorkers.length > 0 ? 'Bench' : 'Floor Roster'}
          </div>
          <button
            type="button"
            onClick={hireWorker}
            disabled={state.cash < HIRE_COST}
            className={`text-xs px-3 py-1 rounded border transition font-medium ${
              state.cash >= HIRE_COST
                ? 'border-green-700 text-green-400 hover:bg-green-950'
                : 'border-slate-800 text-slate-700 cursor-not-allowed'
            }`}
          >
            + Hire  ${HIRE_COST}
          </button>
        </div>
        {benchWorkers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {benchWorkers.map(w => (
              <BenchWorker
                key={w.id} worker={w}
                selectedWorkerId={selectedWorkerId}
                onSelect={() => selectWorker(w.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-slate-700 text-sm">All workers are on the floor.</p>
        )}
      </div>

      {/* ── Floor Log ── */}
      {recentEvents.length > 0 && (
        <div className="space-y-px">
          {recentEvents.map((e, i) => {
            const { text, color } = formatEvent(e);
            return (
              <div key={i} className="flex gap-3 items-baseline py-1">
                <span className="text-slate-700 font-mono text-xs shrink-0 tabular-nums">t{e.tick}</span>
                <span className={`text-sm ${color}`}>{text}</span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Order Hero ──────────────────────────────────────────────────────────────

function OrderHero({ order, tick, throughput }: { order: Order; tick: number; throughput: number }) {
  const progress = order.unitsCompleted / order.units;
  const remaining = order.deadline - tick;
  const isUrgent = remaining < 480;
  const isOverdue = remaining <= 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xl font-bold text-white">{order.sku}</div>
          <div className="text-slate-500 text-sm">{order.clientId} · ${order.revenuePerUnit}/unit</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tabular-nums">
            <span className="text-white">{Math.round(order.unitsCompleted)}</span>
            <span className="text-slate-600 text-xl"> / {order.units}</span>
          </div>
          <div className={`text-sm mt-0.5 ${isOverdue ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-slate-500'}`}>
            {ticksToTimeRemaining(remaining)} left
          </div>
        </div>
      </div>

      {/* Big progress bar */}
      <div className="h-10 bg-slate-800 rounded-lg overflow-hidden relative">
        <div
          className={`h-10 rounded-lg transition-all duration-300 ${isOverdue ? 'bg-red-600' : 'bg-green-600'}`}
          style={{ width: `${Math.max(progress * 100, 0.3)}%` }}
        />
        <div className="absolute inset-0 flex items-center px-3 justify-between pointer-events-none">
          <span className="text-sm font-bold text-white/80">{(progress * 100).toFixed(1)}%</span>
          {throughput > 0 && (
            <span className="text-xs text-white/50">▶ {throughput.toFixed(2)} u/min</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Floor Line ──────────────────────────────────────────────────────────────

function FloorLine({
  lineId, line, workers, throughput, selectedWorkerId,
  onSelectWorker, onAssign, onUnassign,
}: {
  lineId: string; line: Line; workers: Record<string, Worker>;
  throughput: number; selectedWorkerId: string | null;
  onSelectWorker: (id: string | null) => void;
  onAssign: (workerId: string, lineId: string, stationId: string) => void;
  onUnassign: (lineId: string, stationId: string) => void;
}) {
  const presentCount = line.stations.filter(
    s => s.assignedWorkerId && workers[s.assignedWorkerId]?.presentThisShift
  ).length;
  const isBlocked = presentCount < line.stations.length;

  const selectedWorker = selectedWorkerId ? workers[selectedWorkerId] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-white text-sm">{line.name}</span>
          {isBlocked ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-400">
              BLOCKED — {presentCount}/{line.stations.length} staffed
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-950 text-green-400">
              RUNNING ▶ {throughput.toFixed(2)} u/min
            </span>
          )}
        </div>
      </div>

      {/* Conveyor */}
      <div className="flex items-stretch gap-0">
        {line.stations.map((station, i) => {
          const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
          const present = worker?.presentThisShift ?? false;
          const hasTarget = selectedWorkerId !== null;

          // Does the selected worker have a skill for THIS station?
          const isSkillMatch = selectedWorker?.skills.some(sk => sk.stationId === station.id) ?? false;

          let bg = 'bg-slate-900 border-slate-800';
          let cursor = '';
          let assignLabel = '—';

          if (hasTarget) {
            cursor = 'cursor-pointer';
            if (isSkillMatch) {
              bg = 'bg-yellow-950/60 border-yellow-500';
              assignLabel = '★ match';
            } else {
              bg = 'bg-slate-800 border-yellow-700/50';
              assignLabel = '+ assign';
            }
          } else if (worker && present) {
            bg = 'bg-amber-950/50 border-amber-800/60';
            cursor = 'cursor-pointer';
          } else if (worker && !present) {
            bg = 'bg-red-950/60 border-red-900/50';
          }

          return (
            <React.Fragment key={station.id}>
              {i > 0 && (
                <div className="flex items-center shrink-0 px-1.5 text-slate-700 text-sm">›</div>
              )}
              <div
                className={`flex-1 min-w-0 border rounded-lg transition-all select-none p-3 ${bg} ${cursor}`}
                onClick={() => {
                  if (hasTarget) {
                    onAssign(selectedWorkerId!, lineId, station.id);
                  } else if (worker) {
                    onSelectWorker(worker.id);
                  }
                }}
              >
                <div className="text-xs text-slate-500 mb-2">{station.name}</div>
                {worker ? (
                  <>
                    <div className={`text-sm font-semibold leading-none mb-2 ${present ? 'text-white' : 'text-red-400'}`}>
                      {worker.name.split(' ')[0]}
                      {!present && <span className="text-red-600 text-xs ml-1">no-show</span>}
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full">
                      <div
                        className={`h-1 rounded-full ${present ? 'bg-yellow-400' : 'bg-red-800'}`}
                        style={{ width: `${worker.morale * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className={`text-xs font-medium ${
                    isSkillMatch ? 'text-yellow-400' : hasTarget ? 'text-yellow-700' : 'text-slate-700'
                  }`}>
                    {assignLabel}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bench Worker ────────────────────────────────────────────────────────────

const STATION_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };

function BenchWorker({
  worker, selectedWorkerId, onSelect,
}: { worker: Worker; selectedWorkerId: string | null; onSelect: () => void }) {
  const isSelected = selectedWorkerId === worker.id;

  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none ${
        isSelected
          ? 'bg-yellow-950 border-yellow-500'
          : 'bg-slate-900 border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0 mt-0.5">
        {worker.name[0]}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white leading-none">{worker.name}</div>
        <div className="text-xs text-slate-600 mt-0.5 mb-1.5">Day {worker.tenureDays} · {Math.round(worker.morale * 100)}% morale</div>
        {/* Skill badges */}
        <div className="flex flex-wrap gap-1">
          {worker.skills.map(sk => (
            <span
              key={sk.stationId}
              className="text-xs bg-slate-800 text-yellow-500 px-1.5 py-0.5 rounded font-medium"
            >
              ★ {STATION_NAMES[sk.stationId] ?? sk.stationId}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
