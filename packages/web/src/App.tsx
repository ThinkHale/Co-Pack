import React, { useEffect, useRef } from 'react';
import { GameEvent, Line } from '@copack/engine';
import { useGameStore, SpeedSetting } from './hooks/useGameStore';

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
  return `Day ${day} · Shift ${shift}`;
}

function getWorkerStation(workerId: string, lines: Record<string, Line>): string | null {
  for (const line of Object.values(lines)) {
    for (const s of line.stations) {
      if (s.assignedWorkerId === workerId) return s.name;
    }
  }
  return null;
}

interface EventEntry {
  text: string;
  color: string;
  bgFlash?: boolean;
}

function formatEvent(e: GameEvent): EventEntry {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'WORKER_ARRIVED':
      return { text: `${p.workerName} clocked in.`, color: 'text-blue-400' };
    case 'WORKER_NO_SHOW':
      return { text: `${p.workerName} is a no-show.`, color: 'text-red-400', bgFlash: true };
    case 'ORDER_COMPLETED':
      return {
        text: `Order ${p.sku} complete! +$${(p.revenue as number).toFixed(2)}`,
        color: 'text-green-400',
        bgFlash: true,
      };
    case 'ORDER_MISSED':
      return { text: `Order ${p.sku} MISSED. Reputation hit.`, color: 'text-red-500', bgFlash: true };
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
      return { text: `── Day ${day}, Shift ${shift} starting ──`, color: 'text-gray-500' };
    }
    case 'WORKER_QUIT':
      return { text: `${p.workerName} has quit.`, color: 'text-red-500', bgFlash: true };
    default:
      return { text: e.type, color: 'text-gray-600' };
  }
}

// ─── component ──────────────────────────────────────────────────────────────

export default function App() {
  const {
    state, paused, speed,
    runTick, reset, togglePause, setSpeed,
    selectedWorkerId, selectWorker, assignWorker, unassignStation,
  } = useGameStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const ms = 1000 / speed;
    intervalRef.current = setInterval(runTick, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runTick, paused, speed]);

  const recentEvents = [...state.eventLog].reverse().slice(0, 20);
  const hasSelection = selectedWorkerId !== null;

  return (
    <div
      className="min-h-screen bg-gray-950 text-white p-4 max-w-4xl mx-auto"
    >

      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-yellow-400 tracking-tight">Co-Pack Floor</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {shiftLabel(state.tick)}
            <span className="mx-2 text-gray-700">|</span>
            <span className="text-green-400 font-medium">${state.cash.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Speed */}
          <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
            {([1, 4, 16] as SpeedSetting[]).map(s => (
              <button
                type="button"
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 transition ${speed === s && !paused ? 'bg-yellow-500 text-black font-bold' : 'text-gray-400 hover:text-white'}`}
              >
                {s}×
              </button>
            ))}
          </div>
          {/* Pause */}
          <button
            type="button"
            onClick={togglePause}
            className={`text-xs px-3 py-1.5 rounded border transition font-medium ${
              paused
                ? 'border-yellow-500 text-yellow-400 bg-yellow-950 hover:bg-yellow-900'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-600 border border-gray-800 rounded px-2.5 py-1.5 hover:border-gray-600 transition"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Assignment hint */}
      {hasSelection && (
        <div className="mb-4 px-3 py-2 bg-yellow-950 border border-yellow-700 rounded text-yellow-300 text-sm">
          <strong>{state.workers[selectedWorkerId!]?.name}</strong> selected — click a station to assign, or click elsewhere to cancel.
        </div>
      )}

      {/* Workers */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Associates</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.values(state.workers).map(w => {
            const station = getWorkerStation(w.id, state.lines);
            const isSelected = selectedWorkerId === w.id;
            const isAbsent = !w.presentThisShift;

            return (
              <div
                key={w.id}
                onClick={() => selectWorker(w.id)}
                className={`rounded-lg p-3 border cursor-pointer transition-all select-none ${
                  isSelected
                    ? 'bg-yellow-950 border-yellow-500 ring-1 ring-yellow-500'
                    : isAbsent
                    ? 'bg-gray-900 border-red-900 opacity-60'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm text-white">{w.name}</p>
                  {isAbsent ? (
                    <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">No-Show</span>
                  ) : station ? (
                    <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{station}</span>
                  ) : (
                    <span className="text-xs bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded">Unassigned</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mb-2">Day {w.tenureDays} tenure</p>
                <div className="space-y-1.5">
                  <StatBar label="Morale" value={w.morale} color="bg-yellow-400" />
                  <StatBar label="Reliability" value={w.reliability} color="bg-blue-400" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lines */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Lines</h2>
        {Object.entries(state.lines).map(([lineId, line]) => {
          const presentStaffed = line.stations.filter(
            s => s.assignedWorkerId && state.workers[s.assignedWorkerId]?.presentThisShift
          ).length;
          const assigned = line.stations.filter(s => s.assignedWorkerId).length;

          return (
            <div key={lineId} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-sm text-white">{line.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{presentStaffed}/{line.stations.length} active</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    line.active ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
                  }`}>
                    {line.active ? 'RUNNING' : 'IDLE'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {line.stations.map(s => {
                  const assignedWorker = s.assignedWorkerId ? state.workers[s.assignedWorkerId] : null;
                  const isPresent = assignedWorker?.presentThisShift ?? false;
                  const isNoShow = assignedWorker && !isPresent;

                  let bg = 'bg-gray-800 text-gray-500 hover:bg-gray-700';
                  if (isNoShow) bg = 'bg-red-950 text-red-400';
                  else if (assignedWorker) bg = 'bg-yellow-700 text-yellow-100';
                  if (hasSelection) bg += ' cursor-pointer ring-1 ring-yellow-600';

                  return (
                    <div
                      key={s.id}
                      title={assignedWorker ? `${s.name}: ${assignedWorker.name}${isNoShow ? ' (no-show)' : ''}` : s.name}
                      onClick={() => {
                        if (hasSelection) {
                          assignWorker(selectedWorkerId!, lineId, s.id);
                        } else if (assignedWorker) {
                          unassignStation(lineId, s.id);
                        }
                      }}
                      className={`h-10 rounded text-xs flex flex-col items-center justify-center font-mono transition select-none ${bg}`}
                    >
                      <span className="truncate px-1">{s.name.slice(0, 3)}</span>
                      {assignedWorker && (
                        <span className="text-[9px] opacity-70 truncate px-1">
                          {isNoShow ? '✗' : assignedWorker.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Active Orders */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Orders</h2>
        {state.activeOrders.length === 0 && (
          <p className="text-gray-700 text-sm">No active orders.</p>
        )}
        {state.activeOrders.map(order => {
          const progress = (order.unitsCompleted / order.units) * 100;
          const remaining = order.deadline - state.tick;
          const overdue = remaining <= 0;

          return (
            <div key={order.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800 mb-2">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-sm text-white">{order.sku}</p>
                  <p className="text-xs text-gray-500">{order.clientId} · ${order.revenuePerUnit}/unit</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-gray-300">
                    {Math.round(order.unitsCompleted)} / {order.units}
                  </p>
                  <p className={`text-xs ${overdue ? 'text-red-400' : remaining < 480 ? 'text-orange-400' : 'text-gray-500'}`}>
                    {ticksToTimeRemaining(remaining)} left
                  </p>
                </div>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${overdue ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Event Log */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Floor Log</h2>
        <div className="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800 font-mono text-xs max-h-64 overflow-y-auto">
          {recentEvents.length === 0 && (
            <p className="p-3 text-gray-700">Shift starting...</p>
          )}
          {recentEvents.map((e, i) => {
            const { text, color, bgFlash } = formatEvent(e);
            return (
              <div
                key={i}
                className={`p-2 flex gap-3 items-start ${bgFlash ? 'bg-gray-800' : ''}`}
              >
                <span className="text-gray-700 shrink-0 tabular-nums">t{e.tick}</span>
                <span className={`${color} leading-relaxed`}>{text}</span>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1 bg-gray-800 rounded">
        <div className={`h-1 ${color} rounded transition-all`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
