import { GameState, GameEvent, Worker, StationSkill } from '../types';

const TRAIN_BASE_COST = 350;       // cost to cross-train a brand-new skill
const UPSKILL_STEP = 0.15;         // proficiency gained per training session
const PROFICIENCY_CAP = 0.95;      // you can always get a little better, never perfect
const NEW_SKILL_PROFICIENCY = 0.55;// a freshly cross-trained worker starts competent
const TRAIN_MORALE_BONUS = 0.04;   // investing in people lifts them

// Training a skill you already have costs more as you push toward mastery.
export function trainingCost(worker: Worker, stationId: string): number {
  const existing = worker.skills.find(s => s.stationId === stationId);
  if (!existing) return TRAIN_BASE_COST;
  return Math.round(TRAIN_BASE_COST + existing.proficiency * 600);
}

export function canTrain(worker: Worker, stationId: string): boolean {
  const existing = worker.skills.find(s => s.stationId === stationId);
  return !existing || existing.proficiency < PROFICIENCY_CAP;
}

/**
 * Spend money to teach a worker a station. Cross-trains a new role or upskills
 * an existing one, and nudges morale — growth is its own retention tool. This is
 * the answer to "my random hires don't fit my new line": build the crew you need.
 */
export function trainWorker(
  state: GameState,
  workerId: string,
  stationId: string,
): { state: GameState; events: GameEvent[] } {
  const worker = state.workers[workerId];
  if (!worker || !canTrain(worker, stationId)) return { state, events: [] };

  const cost = trainingCost(worker, stationId);
  if (state.cash < cost) return { state, events: [] };

  const existing = worker.skills.find(s => s.stationId === stationId);
  let skills: StationSkill[];
  let resultProficiency: number;
  if (existing) {
    resultProficiency = Math.min(existing.proficiency + UPSKILL_STEP, PROFICIENCY_CAP);
    skills = worker.skills.map(s =>
      s.stationId === stationId ? { ...s, proficiency: resultProficiency } : s
    );
  } else {
    resultProficiency = NEW_SKILL_PROFICIENCY;
    skills = [...worker.skills, { stationId, proficiency: NEW_SKILL_PROFICIENCY }];
  }

  const updated: Worker = {
    ...worker,
    skills,
    morale: Math.min(1, worker.morale + TRAIN_MORALE_BONUS),
  };

  const events: GameEvent[] = [{
    type: 'WORKER_TRAINED', tick: state.tick,
    payload: { workerId, workerName: worker.name, stationId, proficiency: resultProficiency, cost },
  }];

  return {
    state: {
      ...state,
      cash: state.cash - cost,
      workers: { ...state.workers, [workerId]: updated },
    },
    events,
  };
}
