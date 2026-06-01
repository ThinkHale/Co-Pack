import { GameState, GameEvent, tick } from '@copack/engine';
import type { SpeedSetting, TabKey } from '../hooks/useGameStore';

// --- Save / load + offline progression ---
// An idle game with no save isn't idle. We persist the whole game state to
// localStorage and, when the player returns, fast-forward the simulation through
// the time they were away (at a reduced rate, capped) and hand back a summary the
// UI can celebrate. The engine stays the source of truth — we just run its tick().

// v2: the 10h-shift time model changed what tick/day mean, so v1 saves (built on
// the old 8h-shift / 24h-day split) are intentionally not migrated — a clean start
// on the fixed build beats a confusing mixed-model state.
const SAVE_KEY = 'copack.save.v2';
const SAVE_VERSION = 2;

// Offline accrues 1 game-tick per real second (≈ the 1× live rate), capped so a
// long absence is a warm welcome-back, not a game-breaking windfall.
const OFFLINE_TICKS_PER_SEC = 1;
const OFFLINE_CAP_TICKS = 2880;   // 6 shifts / 2 game-days of credited catch-up
const MIN_OFFLINE_MS = 60_000;    // under a minute away → just resume, no fanfare

export interface UiPrefs {
  speed: SpeedSetting;
  paused: boolean;
  tab: TabKey;
  soundOn: boolean;
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

export function saveGame(state: GameState, prefs: UiPrefs): void {
  try {
    const blob: SaveBlob = { version: SAVE_VERSION, savedAt: Date.now(), state, prefs };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    // Private mode / quota / disabled storage — fail silently, the game still runs.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export interface LoadedSave {
  state: GameState;
  prefs: UiPrefs;
  savedAt: number;
}

// Read and shape-check the save. Anything malformed or from an old version is
// discarded (returns null) so a bad blob can never wedge the game on boot.
export function loadGame(): LoadedSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (!blob || blob.version !== SAVE_VERSION) return null;
    const s = blob.state;
    if (!s || typeof s.tick !== 'number' || typeof s.workers !== 'object' || !Array.isArray(s.activeOrders)) {
      return null;
    }
    // Defensive backfill for fields that may be absent in an early save.
    const state: GameState = {
      ...s,
      completedObjectives: s.completedObjectives ?? [],
      cashWarned: s.cashWarned ?? false,
      gameOver: s.gameOver ?? false,
      awaitingStaffing: s.awaitingStaffing ?? false,
      previousAssignments: s.previousAssignments ?? {},
      eventLog: s.eventLog ?? [],
    };
    const prefs: UiPrefs = {
      speed: blob.prefs?.speed ?? 4,
      paused: blob.prefs?.paused ?? false,
      tab: blob.prefs?.tab ?? 'floor',
      soundOn: blob.prefs?.soundOn ?? true,
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

/**
 * Fast-forward the sim through the player's absence. Returns the advanced state
 * and a summary, or a null summary when there's nothing worth announcing (paused
 * on exit, away < a minute, or the run was already over).
 */
export function runOfflineCatchUp(
  state: GameState,
  savedAt: number,
  wasPaused: boolean,
): { state: GameState; summary: OfflineSummary | null } {
  // No catch-up if the run is over, the player left it paused, or they're already
  // parked at a morning standup (the board is empty — nothing would run).
  if (state.gameOver || wasPaused || state.awaitingStaffing) return { state, summary: null };

  const awayMs = Math.max(0, Date.now() - savedAt);
  let ticks = Math.floor((awayMs / 1000) * OFFLINE_TICKS_PER_SEC);
  const capped = ticks > OFFLINE_CAP_TICKS;
  ticks = Math.min(ticks, OFFLINE_CAP_TICKS);
  if (ticks <= 0 || awayMs < MIN_OFFLINE_MS) return { state, summary: null };

  const startCash = state.cash;
  let s = state;
  let ran = 0;
  const counts: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) {
    const r = tick(s);
    s = r.state;
    ran++;
    for (const e of r.events as GameEvent[]) {
      if (TRACKED[e.type]) counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    // Stop at the next morning — beyond the shift boundary the board is wiped and
    // the line would just sit idle. The player comes back to a fresh standup.
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
