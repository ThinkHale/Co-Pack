import { create } from 'zustand';
import { GameState, GameEvent, tick, createInitialState } from '@copack/engine';

export type SpeedSetting = 1 | 4 | 16;

interface GameStore {
  state: GameState;
  events: GameEvent[];
  selectedWorkerId: string | null;
  paused: boolean;
  speed: SpeedSetting;
  runTick: () => void;
  reset: () => void;
  selectWorker: (id: string | null) => void;
  assignWorker: (workerId: string, lineId: string, stationId: string) => void;
  unassignStation: (lineId: string, stationId: string) => void;
  togglePause: () => void;
  setSpeed: (s: SpeedSetting) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: createInitialState(),
  events: [],
  selectedWorkerId: null,
  paused: false,
  speed: 4,

  runTick: () =>
    set((store) => {
      const { state: newState, events: newEvents } = tick(store.state);
      const eventLog = [...store.state.eventLog, ...newEvents].slice(-100);
      return { state: { ...newState, eventLog }, events: newEvents };
    }),

  reset: () => set({ state: createInitialState(), events: [], selectedWorkerId: null, paused: false }),

  selectWorker: (id) =>
    set((store) => ({ selectedWorkerId: store.selectedWorkerId === id ? null : id })),

  assignWorker: (workerId, lineId, stationId) =>
    set((store) => {
      const lines = { ...store.state.lines };
      const line = lines[lineId];

      // Remove worker from any station they're currently on (across all lines)
      const cleanedLines = Object.fromEntries(
        Object.entries(lines).map(([lid, l]) => [
          lid,
          {
            ...l,
            stations: l.stations.map(s =>
              s.assignedWorkerId === workerId ? { ...s, assignedWorkerId: undefined } : s
            ),
          },
        ])
      );

      // Assign to new station
      cleanedLines[lineId] = {
        ...cleanedLines[lineId],
        stations: cleanedLines[lineId].stations.map(s =>
          s.id === stationId ? { ...s, assignedWorkerId: workerId } : s
        ),
      };

      return { state: { ...store.state, lines: cleanedLines }, selectedWorkerId: null };
    }),

  unassignStation: (lineId, stationId) =>
    set((store) => {
      const lines = {
        ...store.state.lines,
        [lineId]: {
          ...store.state.lines[lineId],
          stations: store.state.lines[lineId].stations.map(s =>
            s.id === stationId ? { ...s, assignedWorkerId: undefined } : s
          ),
        },
      };
      return { state: { ...store.state, lines } };
    }),

  togglePause: () => set((store) => ({ paused: !store.paused })),
  setSpeed: (speed) => set({ speed }),
}));
