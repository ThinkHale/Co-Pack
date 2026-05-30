import { create } from 'zustand';
import {
  GameState, GameEvent, tick, createInitialState, generateWorker,
  purchaseLine, applyShoutout, trainWorker,
} from '@copack/engine';

export type SpeedSetting = 1 | 4 | 16;

const HIRE_COST = 500;
const DEFAULT_SPEED: SpeedSetting = 4;

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
  hireWorker: () => void;
  buyLine: () => void;
  toggleOvertime: () => void;
  shoutout: () => void;
  train: (workerId: string, stationId: string) => void;
}

export { HIRE_COST };

// Fold engine output (new state + events) back into the store, capping the log.
function applyEngineResult(store: GameStore, result: { state: GameState; events: GameEvent[] }) {
  const eventLog = [...store.state.eventLog, ...result.events].slice(-100);
  return { state: { ...result.state, eventLog }, events: result.events };
}

export const useGameStore = create<GameStore>((set) => ({
  state: createInitialState(),
  events: [],
  selectedWorkerId: null,
  paused: false,
  speed: DEFAULT_SPEED,

  runTick: () =>
    set((store) => {
      const { state: newState, events: newEvents } = tick(store.state);
      const eventLog = [...store.state.eventLog, ...newEvents].slice(-100);
      return { state: { ...newState, eventLog }, events: newEvents };
    }),

  reset: () => set({
    state: createInitialState(), events: [],
    selectedWorkerId: null, paused: false, speed: DEFAULT_SPEED,
  }),

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

  hireWorker: () =>
    set((store) => {
      if (store.state.cash < HIRE_COST) return {};
      const workerCount = Object.keys(store.state.workers).length;
      const newId = `w${workerCount + 1}`;
      const seed = store.state.tick * 9999 + workerCount * 1337;
      const worker = generateWorker(newId, seed);
      return {
        state: {
          ...store.state,
          cash: store.state.cash - HIRE_COST,
          workers: { ...store.state.workers, [newId]: worker },
        },
      };
    }),

  buyLine: () => set((store) => applyEngineResult(store, purchaseLine(store.state))),

  toggleOvertime: () =>
    set((store) => {
      const overtime = !store.state.overtime;
      const event: GameEvent = {
        type: 'OVERTIME_TOGGLED', tick: store.state.tick, payload: { overtime },
      };
      return {
        state: {
          ...store.state,
          overtime,
          eventLog: [...store.state.eventLog, event].slice(-100),
        },
      };
    }),

  shoutout: () => set((store) => applyEngineResult(store, applyShoutout(store.state))),

  train: (workerId, stationId) =>
    set((store) => applyEngineResult(store, trainWorker(store.state, workerId, stationId))),
}));
