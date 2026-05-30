import { create } from 'zustand';
import {
  GameState, GameEvent, tick, createInitialState,
  purchaseLine, applyShoutout, trainWorker, provideMeal, runIncentive,
  hireWorker as engineHire, HIRE_COST,
  setGlobalPayRate, toggleSkillRequest, toggleProgram,
  upgradeAutomation, promoteLead, convertToPermanent,
} from '@copack/engine';

export type SpeedSetting = 1 | 4 | 16;
export type TabKey = 'floor' | 'staffing' | 'office';

const DEFAULT_SPEED: SpeedSetting = 4;

interface GameStore {
  state: GameState;
  events: GameEvent[];
  selectedWorkerId: string | null;
  paused: boolean;
  speed: SpeedSetting;
  tab: TabKey;
  runTick: () => void;
  reset: () => void;
  setTab: (tab: TabKey) => void;
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
  buyMeal: () => void;
  runIncentive: () => void;
  // Staffing tab
  setPayRate: (rate: number) => void;
  toggleSkill: (stationId: string) => void;
  toggleProgram: (program: 'attendance' | 'referral') => void;
  // Front Office tab
  upgradeAutomation: (lineId: string) => void;
  promoteLead: (workerId: string, lineId: string) => void;
  convertWorker: (workerId: string) => void;
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
  tab: 'floor',

  runTick: () =>
    set((store) => {
      const { state: newState, events: newEvents } = tick(store.state);
      const eventLog = [...store.state.eventLog, ...newEvents].slice(-100);
      return { state: { ...newState, eventLog }, events: newEvents };
    }),

  reset: () => set({
    state: createInitialState(), events: [],
    selectedWorkerId: null, paused: false, speed: DEFAULT_SPEED, tab: 'floor',
  }),

  setTab: (tab) => set({ tab }),

  selectWorker: (id) =>
    set((store) => ({ selectedWorkerId: store.selectedWorkerId === id ? null : id })),

  assignWorker: (workerId, lineId, stationId) =>
    set((store) => {
      const lines = { ...store.state.lines };

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

  hireWorker: () => set((store) => applyEngineResult(store, engineHire(store.state))),

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

  buyMeal: () => set((store) => applyEngineResult(store, provideMeal(store.state))),

  runIncentive: () => set((store) => applyEngineResult(store, runIncentive(store.state))),

  setPayRate: (rate) => set((store) => ({ state: setGlobalPayRate(store.state, rate) })),

  toggleSkill: (stationId) => set((store) => ({ state: toggleSkillRequest(store.state, stationId) })),

  toggleProgram: (program) => set((store) => ({ state: toggleProgram(store.state, program) })),

  upgradeAutomation: (lineId) =>
    set((store) => applyEngineResult(store, upgradeAutomation(store.state, lineId))),

  promoteLead: (workerId, lineId) =>
    set((store) => applyEngineResult(store, promoteLead(store.state, workerId, lineId))),

  convertWorker: (workerId) =>
    set((store) => applyEngineResult(store, convertToPermanent(store.state, workerId))),
}));
