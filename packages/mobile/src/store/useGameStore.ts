import { create } from 'zustand';
import {
  GameState, GameEvent, tick, createInitialState,
  purchaseLine, applyShoutout, trainWorker, provideMeal, runIncentive,
  hireWorker as engineHire, HIRE_COST,
  setGlobalPayRate, toggleSkillRequest, toggleProgram,
  upgradeAutomation, promoteLead, convertToPermanent,
  terminateWorker as engineTerminate,
  assignWorker as engineAssign, unassignStation as engineUnassign,
  repeatStaffing as engineRepeat, startShift as engineStartShift,
  resolveShiftChallenge as engineResolveChallenge,
  hireSupervisor as engineHireSupervisor, setAutoShift as engineSetAutoShift,
  autoAssignCrew,
  toggleOvertime as engineToggleOvertime,
  toggleNightShift as engineToggleNightShift,
  purchaseUnlock as enginePurchaseUnlock, FeatureUnlockId,
} from '@copack/engine';
import {
  loadGame, saveGame, clearSave, runOfflineCatchUp,
  type OfflineSummary, type UiPrefs,
} from '../lib/persistence';

export type SpeedSetting = 1 | 4 | 16;
export type TabKey = 'floor' | 'orders' | 'staffing' | 'office';

const DEFAULT_SPEED: SpeedSetting = 4;

interface GameStore {
  state: GameState;
  events: GameEvent[];
  selectedWorkerId: string | null;
  paused: boolean;
  speed: SpeedSetting;
  tab: TabKey;
  soundOn: boolean;
  offlineSummary: OfflineSummary | null;
  bootedFromSave: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  runTick: () => void;
  reset: () => void;
  setTab: (tab: TabKey) => void;
  selectWorker: (id: string | null) => void;
  assignWorker: (workerId: string, lineId: string, stationId: string) => void;
  unassignStation: (lineId: string, stationId: string) => void;
  togglePause: () => void;
  setSpeed: (s: SpeedSetting) => void;
  toggleSound: () => void;
  dismissOffline: () => void;
  save: () => void;
  repeatStaffing: () => void;
  startShift: () => void;
  hireWorker: () => void;
  buyLine: () => void;
  toggleOvertime: () => void;
  shoutout: () => void;
  train: (workerId: string, stationId: string) => void;
  buyMeal: () => void;
  runIncentive: () => void;
  resolveChallenge: (choiceId: string) => void;
  setPayRate: (rate: number) => void;
  toggleSkill: (stationId: string) => void;
  toggleProgram: (program: 'attendance' | 'referral') => void;
  upgradeAutomation: (lineId: string) => void;
  promoteLead: (workerId: string, lineId: string) => void;
  convertWorker: (workerId: string) => void;
  terminateWorker: (workerId: string) => void;
  hireSupervisor: () => void;
  toggleAutoShift: () => void;
  autoFillCrew: () => void;
  buyUnlock: (id: FeatureUnlockId) => void;
  toggleNightShift: () => void;
  // Ads (interstitial cadence; SDK-ready seam) + first-play tutorial
  adsOn: boolean;
  adFree: boolean;
  lastAdDay: number;
  adVisible: boolean;
  tutorialDone: boolean;
  tutorialStep: number;
  showAd: () => void;
  dismissAd: () => void;
  removeAds: () => void;
  toggleAdsTesting: () => void;
  advanceTutorial: () => void;
  finishTutorial: () => void;
}

export { HIRE_COST };

// Fold engine output (new state + events) back into the store, capping the log.
function applyEngineResult(store: GameStore, result: { state: GameState; events: GameEvent[] }) {
  const eventLog = [...store.state.eventLog, ...result.events].slice(-100);
  return { state: { ...result.state, eventLog }, events: result.events };
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Synchronous boot: a fresh sim. AsyncStorage load happens in hydrate() on
  // mount (it's async on native), which then swaps in any saved run.
  state: createInitialState(),
  events: [],
  selectedWorkerId: null,
  paused: false,
  speed: DEFAULT_SPEED,
  tab: 'floor',
  soundOn: true,
  offlineSummary: null,
  bootedFromSave: false,
  hydrated: false,
  adsOn: true,
  adFree: false,
  lastAdDay: 0,
  adVisible: false,
  tutorialDone: false,
  tutorialStep: 0,

  hydrate: async () => {
    if (get().hydrated) return;
    const loaded = await loadGame();
    if (loaded) {
      const { state, summary } = runOfflineCatchUp(loaded.state, loaded.savedAt, loaded.prefs.paused);
      set({
        state,
        offlineSummary: summary,
        bootedFromSave: true,
        paused: loaded.prefs.paused,
        speed: loaded.prefs.speed,
        tab: loaded.prefs.tab,
        soundOn: loaded.prefs.soundOn,
        adsOn: loaded.prefs.adsOn,
        adFree: loaded.prefs.adFree,
        lastAdDay: loaded.prefs.lastAdDay,
        tutorialDone: loaded.prefs.tutorialDone,
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },

  runTick: () =>
    set((store) => {
      if (store.state.gameOver || store.state.awaitingStaffing) return {};
      const { state: newState, events: newEvents } = tick(store.state);
      const eventLog = [...store.state.eventLog, ...newEvents].slice(-100);
      return { state: { ...newState, eventLog }, events: newEvents };
    }),

  reset: () => {
    void clearSave();
    set({
      state: createInitialState(), events: [],
      selectedWorkerId: null, paused: false, speed: DEFAULT_SPEED, tab: 'floor',
      offlineSummary: null, bootedFromSave: false,
    });
  },

  setTab: (tab) => set({ tab }),

  selectWorker: (id) =>
    set((store) => ({ selectedWorkerId: store.selectedWorkerId === id ? null : id })),

  assignWorker: (workerId, lineId, stationId) =>
    set((store) => ({
      state: engineAssign(store.state, workerId, lineId, stationId),
      selectedWorkerId: null,
    })),

  unassignStation: (lineId, stationId) =>
    set((store) => ({ state: engineUnassign(store.state, lineId, stationId) })),

  repeatStaffing: () => set((store) => applyEngineResult(store, engineRepeat(store.state))),

  startShift: () => set((store) => applyEngineResult(store, engineStartShift(store.state))),

  togglePause: () => set((store) => ({ paused: !store.paused })),
  setSpeed: (speed) => set({ speed }),
  toggleSound: () => set((store) => ({ soundOn: !store.soundOn })),
  dismissOffline: () => set({ offlineSummary: null }),

  save: () => {
    const s = get();
    void saveGame(s.state, {
      speed: s.speed, paused: s.paused, tab: s.tab, soundOn: s.soundOn,
      adsOn: s.adsOn, adFree: s.adFree, lastAdDay: s.lastAdDay, tutorialDone: s.tutorialDone,
    });
  },

  hireWorker: () => set((store) => applyEngineResult(store, engineHire(store.state))),

  buyLine: () => set((store) => applyEngineResult(store, purchaseLine(store.state))),

  // Engine-owned (and gated behind the 'overtime' feature unlock).
  toggleOvertime: () => set((store) => applyEngineResult(store, engineToggleOvertime(store.state))),

  shoutout: () => set((store) => applyEngineResult(store, applyShoutout(store.state))),

  train: (workerId, stationId) =>
    set((store) => applyEngineResult(store, trainWorker(store.state, workerId, stationId))),

  buyMeal: () => set((store) => applyEngineResult(store, provideMeal(store.state))),

  runIncentive: () => set((store) => applyEngineResult(store, runIncentive(store.state))),

  resolveChallenge: (choiceId) =>
    set((store) => applyEngineResult(store, engineResolveChallenge(store.state, choiceId))),

  setPayRate: (rate) => set((store) => ({ state: setGlobalPayRate(store.state, rate) })),

  toggleSkill: (stationId) => set((store) => ({ state: toggleSkillRequest(store.state, stationId) })),

  toggleProgram: (program) => set((store) => ({ state: toggleProgram(store.state, program) })),

  upgradeAutomation: (lineId) =>
    set((store) => applyEngineResult(store, upgradeAutomation(store.state, lineId))),

  promoteLead: (workerId, lineId) =>
    set((store) => applyEngineResult(store, promoteLead(store.state, workerId, lineId))),

  convertWorker: (workerId) =>
    set((store) => applyEngineResult(store, convertToPermanent(store.state, workerId))),

  terminateWorker: (workerId) =>
    set((store) => {
      const result = engineTerminate(store.state, workerId);
      return {
        ...applyEngineResult(store, result),
        selectedWorkerId: store.selectedWorkerId === workerId ? null : store.selectedWorkerId,
      };
    }),

  hireSupervisor: () => set((store) => applyEngineResult(store, engineHireSupervisor(store.state))),

  buyUnlock: (id) => set((store) => applyEngineResult(store, enginePurchaseUnlock(store.state, id))),

  toggleNightShift: () => set((store) => applyEngineResult(store, engineToggleNightShift(store.state))),

  // Marking lastAdDay at show-time keeps the trigger from re-firing while up.
  showAd: () => set((store) => ({ adVisible: true, lastAdDay: store.state.day })),
  dismissAd: () => set({ adVisible: false }),
  // The IAP seam: when StoreKit lands, the purchase callback calls this.
  removeAds: () => set({ adFree: true, adVisible: false }),
  toggleAdsTesting: () => set((store) => ({ adsOn: !store.adsOn })),
  advanceTutorial: () => set((store) => ({ tutorialStep: store.tutorialStep + 1 })),
  finishTutorial: () => set({ tutorialDone: true }),

  toggleAutoShift: () =>
    set((store) => applyEngineResult(store, engineSetAutoShift(store.state, !store.state.autoShift))),

  // One-tap morning fill during a manual standup (supervisor required).
  autoFillCrew: () =>
    set((store) => (store.state.hasSupervisor ? { state: autoAssignCrew(store.state) } : {})),
}));
