import { GameState, GameEvent, Worker, Line, PayPolicy } from '../types';
import { seededRandom, hashString } from '../utils/random';
import { payRetentionFactor } from '../economy/staffing';
import { workerRetentionMult } from './traits';

/**
 * Per-shift chance a worker walks. The shape encodes real workforce truths:
 *  - Low morale is the dominant driver — unhappy people leave.
 *  - Tenure is loyalty: a 90-day associate almost never quits over a bad week,
 *    a day-one hire is volatile. (This is why losing tenure hurts.)
 *  - Low reliability correlates with flight risk — the flaky pool churns first,
 *    so a roster you keep happy self-selects toward a dependable core.
 *  - Referred workers are stickier — they came in through someone they trust.
 *  - Pay below market raises flight risk; pay above market lowers it.
 */
export function quitProbability(worker: Worker, policy?: PayPolicy): number {
  // Morale is the master lever — and it's the one the player controls (recognition,
  // not running overtime into the ground, training). A crew kept above ~0.7 morale
  // barely churns; let morale slide and people walk. Reliability is only a minor
  // nudge (the flaky pool drifts a bit more), and tenure is a strong loyalty shield.
  const moraleRisk = Math.max(0, 0.7 - worker.morale);             // 0 at 0.7+, up to 0.6
  const reliabilityNudge = Math.max(0, 0.7 - worker.reliability);  // small flaky-pool term
  const tenureGuard = Math.min(worker.tenureDays / 90, 1);         // 0..1 loyalty shield

  let risk = moraleRisk * 0.06 + reliabilityNudge * 0.01;
  risk *= 1 - tenureGuard * 0.8;
  if (worker.referredBy) risk *= 0.6;
  if (policy) risk *= payRetentionFactor(worker, policy);
  risk *= workerRetentionMult(worker); // loyal/flaky/job-hopper/senior traits

  return Math.max(0, Math.min(risk, 0.15));
}

// Returns a worker's quit risk as a coarse band, for telegraphing in the UI.
export function flightRisk(worker: Worker, policy?: PayPolicy): 'low' | 'watch' | 'high' {
  const p = quitProbability(worker, policy);
  if (p >= 0.03) return 'high';
  if (p >= 0.012) return 'watch';
  return 'low';
}

function clearFromLines(lines: Record<string, Line>, workerId: string): Record<string, Line> {
  return Object.fromEntries(
    Object.entries(lines).map(([id, line]) => [
      id,
      {
        ...line,
        leadId: line.leadId === workerId ? undefined : line.leadId,
        supportWorkerIds: (line.supportWorkerIds ?? []).filter(id => id !== workerId),
        stations: line.stations.map(s =>
          s.assignedWorkerId === workerId ? { ...s, assignedWorkerId: undefined } : s
        ),
      },
    ])
  );
}

function clearPreviousAssignments(previousAssignments: Record<string, string>, workerId: string): Record<string, string> {
  return Object.fromEntries(Object.entries(previousAssignments).filter(([, id]) => id !== workerId));
}

/**
 * Runs at the shift boundary. Anyone who quits is removed from the roster and
 * pulled off their station, so you feel the hole they leave the next shift.
 */
export function processRetention(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let workers = state.workers;
  let lines = state.lines;

  for (const worker of Object.values(state.workers)) {
    const rng = seededRandom(state.tick * 977 + hashString(worker.id) * 7 + 3);
    if (rng < quitProbability(worker, state.payPolicy)) {
      const { [worker.id]: _gone, ...rest } = workers;
      workers = rest;
      lines = clearFromLines(lines, worker.id);
      events.push({
        type: 'WORKER_QUIT', tick: state.tick,
        payload: {
          workerId: worker.id,
          workerName: worker.name,
          tenureDays: worker.tenureDays,
          morale: worker.morale,
        },
      });
    }
  }

  if (events.length === 0) return { state, events };
  const gone = new Set(events.map(e => (e.payload as { workerId?: string }).workerId).filter((id): id is string => !!id));
  let previousAssignments = state.previousAssignments;
  for (const workerId of gone) previousAssignments = clearPreviousAssignments(previousAssignments, workerId);
  return { state: { ...state, workers, lines, previousAssignments }, events };
}

export function terminateWorker(state: GameState, workerId: string): { state: GameState; events: GameEvent[] } {
  const worker = state.workers[workerId];
  if (!worker) return { state, events: [] };

  const { [workerId]: _gone, ...workers } = state.workers;
  const lines = clearFromLines(state.lines, workerId);
  const previousAssignments = clearPreviousAssignments(state.previousAssignments, workerId);
  const shiftChallenge = state.shiftChallenge?.workerId === workerId ? null : state.shiftChallenge;

  const events: GameEvent[] = [{
    type: 'WORKER_TERMINATED',
    tick: state.tick,
    payload: {
      workerId,
      workerName: worker.name,
      missedShifts: worker.missedShifts ?? 0,
      sentHomeShifts: worker.sentHomeShifts ?? 0,
      shiftsWorked: worker.shiftsWorked ?? 0,
      totalUnits: worker.totalUnits ?? 0,
      morale: worker.morale,
      reliability: worker.reliability,
    },
  }];

  return {
    state: { ...state, workers, lines, previousAssignments, shiftChallenge },
    events,
  };
}
