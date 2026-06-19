// Save / load + offline progression for the mobile build. Same model as the web
// `persistence.ts`, but backed by AsyncStorage (async) instead of localStorage.
// The engine stays the source of truth — we just persist GameState and replay
// tick() to catch the player up on the time they were away.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState, GameEvent, tick, autoAssignCrew, startShift } from '@copack/engine';
import type { SpeedSetting, TabKey } from '../store/useGameStore';

// v3: the economy moved to real temp-labor bill rates ($22–30/hr); v2 saves
// are in the old currency scale and are intentionally not migrated.
const SAVE_KEY = 'copack.save.v3';
const SAVE_VERSION = 3;

const OFFLINE_TICKS_PER_SEC = 1;
// With a supervisor hired, shifts roll unattended and the full cap can pay out.
const OFFLINE_CAP_TICKS = 7200; // 12 shifts / game-days of credited catch-up
const MIN_OFFLINE_MS = 60_000;

export interface UiPrefs {
  speed: SpeedSetting;
  paused: boolean;
  tab: TabKey;
  soundOn: boolean;
  // Onboarding lives in prefs, NOT GameState — the sim stays pure.
  tutorialDone: boolean;
}

interface SaveBlob {
  version: number;
  savedAt: number;
  state: GameState;
  prefs: UiPrefs;
}

export interface OfflineSummary {
  ticks: number;
  awayMs: number;
  capped: boolean;
  cashDelta: number;
  ordersCompleted: number;
  ordersMissed: number;
  quits: number;
  incidents: number;
  objectives: number;
  gameOver: boolean;
}

export async function saveGame(state: GameState, prefs: UiPrefs): Promise<void> {
  try {
    const blob: SaveBlob = { version: SAVE_VERSION, savedAt: Date.now(), state, prefs };
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    // Storage full / disabled — fail silently, the game still runs.
  }
}

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export interface LoadedSave {
  state: GameState;
  prefs: UiPrefs;
  savedAt: number;
}

export async function loadGame(): Promise<LoadedSave | null> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (!blob || blob.version !== SAVE_VERSION) return null;
    const s = blob.state;
    if (!s || typeof s.tick !== 'number' || typeof s.workers !== 'object' || !Array.isArray(s.activeOrders)) {
      return null;
    }
    const workers: GameState['workers'] = Object.fromEntries(
      Object.entries(s.workers).map(([id, worker]) => [
        id,
        {
          ...worker,
          missedShifts: worker.missedShifts ?? 0,
          sentHomeShifts: worker.sentHomeShifts ?? 0,
          shiftsWorked: worker.shiftsWorked ?? 0,
          totalUnits: worker.totalUnits ?? 0,
          shiftUnits: worker.shiftUnits ?? 0,
        },
      ])
    );
    const lines: GameState['lines'] = Object.fromEntries(
      Object.entries(s.lines ?? {}).map(([id, line]) => [
        id,
        {
          ...line,
          supportWorkerIds: line.supportWorkerIds ?? [],
          stations: line.stations.map(st => ({ ...st, role: st.role ?? st.id })),
        },
      ])
    );
    const state: GameState = {
      ...s,
      workers,
      lines,
      completedObjectives: s.completedObjectives ?? [],
      cashWarned: s.cashWarned ?? false,
      gameOver: s.gameOver ?? false,
      awaitingStaffing: s.awaitingStaffing ?? false,
      hasSupervisor: s.hasSupervisor ?? false,
      autoShift: s.autoShift ?? false,
      unlocks: s.unlocks ?? [],
      nightShift: s.nightShift ?? false,
      pendingHires: s.pendingHires ?? 0,
      activeOrders: s.activeOrders.map(o => ({ ...o, skuProfileId: o.skuProfileId ?? 'standard' })),
      shiftChallenge: s.shiftChallenge ?? null,
      challengeCooldownUntil: s.challengeCooldownUntil ?? 0,
      lastShiftReport: s.lastShiftReport ?? null,
      previousAssignments: s.previousAssignments ?? {},
      eventLog: s.eventLog ?? [],
    };
    const prefs: UiPrefs = {
      speed: blob.prefs?.speed ?? 4,
      paused: blob.prefs?.paused ?? false,
      tab: blob.prefs?.tab ?? 'floor',
      soundOn: blob.prefs?.soundOn ?? true,
      tutorialDone: blob.prefs?.tutorialDone ?? false,
    };
    return { state, prefs, savedAt: blob.savedAt };
  } catch {
    return null;
  }
}

const TRACKED: Record<string, true> = {
  ORDER_COMPLETED: true, ORDER_MISSED: true, WORKER_QUIT: true,
  INCIDENT: true, OBJECTIVE_COMPLETED: true,
};

export function runOfflineCatchUp(
  state: GameState,
  savedAt: number,
  wasPaused: boolean,
): { state: GameState; summary: OfflineSummary | null } {
  // No catch-up if the run is over or left paused. A save parked at a morning
  // standup only runs if a supervisor is hired — they staff the board and
  // start the shift the moment you walk out the door.
  if (state.gameOver || wasPaused) return { state, summary: null };
  if (state.awaitingStaffing && !state.hasSupervisor) return { state, summary: null };

  const awayMs = Math.max(0, Date.now() - savedAt);
  let ticks = Math.floor((awayMs / 1000) * OFFLINE_TICKS_PER_SEC);
  const capped = ticks > OFFLINE_CAP_TICKS;
  ticks = Math.min(ticks, OFFLINE_CAP_TICKS);
  if (ticks <= 0 || awayMs < MIN_OFFLINE_MS) return { state, summary: null };

  const startCash = state.cash;
  let s = state;
  if (s.awaitingStaffing) s = startShift(autoAssignCrew(s)).state;
  let ran = 0;
  const counts: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) {
    // Unattended: a hired supervisor rolls every standup regardless of the
    // live Auto-shift toggle — covering your absence is their whole job.
    const r = tick(s, { unattended: true });
    s = r.state;
    ran++;
    for (const e of r.events as GameEvent[]) {
      if (TRACKED[e.type]) counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    if (s.gameOver || s.awaitingStaffing) break;
  }

  const summary: OfflineSummary = {
    ticks: ran,
    awayMs,
    capped,
    cashDelta: Math.round(s.cash - startCash),
    ordersCompleted: counts.ORDER_COMPLETED ?? 0,
    ordersMissed: counts.ORDER_MISSED ?? 0,
    quits: counts.WORKER_QUIT ?? 0,
    incidents: counts.INCIDENT ?? 0,
    objectives: counts.OBJECTIVE_COMPLETED ?? 0,
    gameOver: s.gameOver,
  };
  return { state: s, summary };
}

export { OFFLINE_CAP_TICKS };
