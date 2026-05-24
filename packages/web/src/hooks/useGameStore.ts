import { create } from 'zustand';
import { GameState, GameEvent, tick, createInitialState } from '@copack/engine';

interface GameStore {
  state: GameState;
  events: GameEvent[];
  runTick: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: createInitialState(),
  events: [],
  runTick: () =>
    set((store) => {
      const { state: newState, events: newEvents } = tick(store.state);
      const eventLog = [...store.state.eventLog, ...newEvents].slice(-100);
      return { state: { ...newState, eventLog }, events: newEvents };
    }),
  reset: () => set({ state: createInitialState(), events: [] }),
}));
