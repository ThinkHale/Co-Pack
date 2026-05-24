import React, { useEffect, useRef } from 'react';
import { useGameStore } from './hooks/useGameStore';

export default function App() {
  const { state, runTick, reset } = useGameStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => runTick(), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runTick]);

  const firstOrder = state.activeOrders[0];
  const recentEvents = [...state.eventLog].reverse().slice(0, 10);
  const progress = firstOrder ? (firstOrder.unitsCompleted / firstOrder.units) * 100 : 0;

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">

      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400 tracking-tight">Co-Pack Floor</h1>
          <p className="text-gray-400 text-sm mt-1">
            Day {state.day} &nbsp;|&nbsp; Tick {state.tick} &nbsp;|&nbsp;
            <span className="text-green-400 font-medium"> ${state.cash.toFixed(2)}</span>
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs text-gray-500 border border-gray-700 rounded px-3 py-1 hover:border-gray-500 transition"
        >
          Reset
        </button>
      </header>

      {/* Workers */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Associates on the Floor</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.values(state.workers).map(w => (
            <div key={w.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <p className="font-semibold text-white">{w.name}</p>
              <p className="text-xs text-gray-500 mb-2">Day {w.tenureDays} tenure</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Morale</span><span>{Math.round(w.morale * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded">
                  <div className="h-1.5 bg-yellow-400 rounded transition-all" style={{ width: `${w.morale * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Reliability</span><span>{Math.round(w.reliability * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded">
                  <div className="h-1.5 bg-blue-400 rounded" style={{ width: `${w.reliability * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Line Status */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Line Status</h2>
        {Object.values(state.lines).map(line => {
          const staffed = line.stations.filter(s => s.assignedWorkerId).length;
          return (
            <div key={line.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-white">{line.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${line.active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                  {line.active ? 'RUNNING' : 'IDLE'}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {line.stations.map(s => (
                  <div
                    key={s.id}
                    title={s.name}
                    className={`h-8 rounded text-xs flex items-center justify-center font-mono
                      ${s.assignedWorkerId ? 'bg-yellow-600 text-yellow-100' : 'bg-gray-700 text-gray-500'}`}
                  >
                    {s.name.slice(0, 3)}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">{staffed} of {line.stations.length} stations staffed</p>
            </div>
          );
        })}
      </section>

      {/* Active Order */}
      {firstOrder && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Active Order</h2>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-white">{firstOrder.sku}</p>
                <p className="text-xs text-gray-400">{firstOrder.clientId}</p>
              </div>
              <p className="text-sm text-gray-300 font-mono">
                {Math.round(firstOrder.unitsCompleted)} / {firstOrder.units} units
              </p>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-3 bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Deadline: tick {firstOrder.deadline}</p>
          </div>
        </section>
      )}

      {/* Event Log */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Floor Log</h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700 font-mono text-xs">
          {recentEvents.length === 0 && (
            <p className="p-3 text-gray-600">Shift starting...</p>
          )}
          {recentEvents.map((e, i) => (
            <div key={i} className="p-2.5 flex gap-3">
              <span className="text-gray-600 shrink-0">t{e.tick}</span>
              <span className={`shrink-0 font-semibold ${
                e.type === 'WORKER_NO_SHOW' ? 'text-red-400' :
                e.type === 'ORDER_COMPLETED' ? 'text-green-400' :
                e.type === 'MORALE_SHIFT' ? 'text-yellow-400' :
                'text-blue-400'
              }`}>{e.type}</span>
              <span className="text-gray-500 truncate">{JSON.stringify(e.payload)}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
