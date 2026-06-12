import { GameEvent, GameState, Line, ShiftChallenge, Worker } from '../types';
import { shiftElapsedTicks, shiftRemainingTicks } from '../time';
import { seededRandom, hashString } from '../utils/random';
import { assignedWorkerIdsForLine } from '../lines/assignments';

const CHALLENGE_CHANCE_PER_TICK = 0.006;
const CHALLENGE_COOLDOWN_TICKS = 90;
const MIN_SHIFT_AGE_TICKS = 45;
const MIN_SHIFT_LEFT_TICKS = 45;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const firstName = (name: string) => name.split(' ')[0];

function presentAssignedWorkers(state: GameState, line: Line): Worker[] {
  return assignedWorkerIdsForLine(line)
    .map(workerId => state.workers[workerId])
    .filter((w): w is Worker => !!w && w.presentThisShift);
}

function staffedLines(state: GameState): Line[] {
  return Object.values(state.lines).filter(line => line.active && presentAssignedWorkers(state, line).length > 0);
}

function challengeEvent(challenge: ShiftChallenge, state: GameState): GameEvent {
  const line = challenge.lineId ? state.lines[challenge.lineId] : undefined;
  const worker = challenge.workerId ? state.workers[challenge.workerId] : undefined;
  return {
    type: 'SHIFT_CHALLENGE',
    tick: state.tick,
    payload: {
      challengeId: challenge.id,
      challengeType: challenge.type,
      title: challenge.title,
      note: challenge.note,
      lineId: challenge.lineId,
      lineName: line?.name,
      workerId: challenge.workerId,
      workerName: worker?.name,
    },
  };
}

export function rollShiftChallenge(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.gameOver || state.awaitingStaffing || state.shiftChallenge) return { state, events: [] };
  if (state.tick < state.challengeCooldownUntil) return { state, events: [] };
  if (shiftElapsedTicks(state.tick) < MIN_SHIFT_AGE_TICKS) return { state, events: [] };
  if (shiftRemainingTicks(state.tick) < MIN_SHIFT_LEFT_TICKS) return { state, events: [] };

  const lines = staffedLines(state);
  if (lines.length === 0) return { state, events: [] };

  const roll = seededRandom(state.tick * 1019 + state.completedOrders * 37 + state.lineCount * 13);
  if (roll > CHALLENGE_CHANCE_PER_TICK) return { state, events: [] };

  const targetLine = lines[Math.floor(seededRandom(state.tick * 3023 + 19) * lines.length)];
  const crew = presentAssignedWorkers(state, targetLine);
  const targetWorker = crew[Math.floor(seededRandom(state.tick * 4051 + 23) * crew.length)];
  const typeRoll = seededRandom(state.tick * 7919 + hashString(targetLine.id));
  const type = typeRoll < 0.34 ? 'belt_jam' : typeRoll < 0.68 ? 'quality_check' : 'early_leave';

  const challenge = makeChallenge(state, targetLine, targetWorker, type);
  return {
    state: { ...state, shiftChallenge: challenge, challengeCooldownUntil: state.tick + CHALLENGE_COOLDOWN_TICKS },
    events: [challengeEvent(challenge, state)],
  };
}

function makeChallenge(
  state: GameState,
  line: Line,
  worker: Worker,
  type: ShiftChallenge['type'],
): ShiftChallenge {
  const id = `ch-${state.tick}-${type}`;
  if (type === 'belt_jam') {
    return {
      id,
      type,
      lineId: line.id,
      createdTick: state.tick,
      outputMultiplier: 0.55,
      title: `Carton jam on ${line.name}`,
      note: 'The belt is crawling until someone clears the jam.',
      choices: [
        { id: 'clear', label: 'Stop and clear', note: '-$900 maintenance call-out, output restored' },
        { id: 'force', label: 'Push through', note: 'No cash cost, line morale -4%' },
      ],
    };
  }

  if (type === 'quality_check') {
    return {
      id,
      type,
      lineId: line.id,
      createdTick: state.tick,
      outputMultiplier: 0.75,
      title: 'Client spot-check request',
      note: `${line.name} slows while the front office waits on your call.`,
      choices: [
        { id: 'inspect', label: 'Run the check', note: '-$750 in samples & line time, reputation +2%' },
        { id: 'skip', label: 'Skip it', note: 'Output restored, reputation -4%' },
      ],
    };
  }

  return {
    id,
    type,
    lineId: line.id,
    workerId: worker.id,
    createdTick: state.tick,
    title: `${firstName(worker.name)} asks to leave early`,
    note: 'Cover the gap from the bench, or ask them to stay and take the morale hit.',
    choices: [
      { id: 'let_go', label: 'Let them go', note: 'Their station opens, morale +4%' },
      { id: 'stay', label: 'Ask them to stay', note: 'Keep coverage, morale -6%' },
    ],
  };
}

// The supervisor's default when a floor decision goes unanswered in auto-shift
// mode: the safe, slightly costly call every time — pay for the fix, run the
// check, let the worker go. Hands-on players can make sharper trade-offs.
export function supervisorChallengeChoice(challenge: ShiftChallenge): string {
  if (challenge.type === 'belt_jam') return 'clear';
  if (challenge.type === 'quality_check') return 'inspect';
  return 'let_go';
}

export function resolveShiftChallenge(
  state: GameState,
  choiceId: string,
): { state: GameState; events: GameEvent[] } {
  const challenge = state.shiftChallenge;
  if (!challenge) return { state, events: [] };

  let s: GameState = { ...state, shiftChallenge: null, challengeCooldownUntil: state.tick + CHALLENGE_COOLDOWN_TICKS };
  const payload: Record<string, unknown> = {
    challengeId: challenge.id,
    challengeType: challenge.type,
    choiceId,
    title: challenge.title,
  };

  if (challenge.type === 'belt_jam') {
    if (choiceId === 'clear') {
      s = { ...s, cash: s.cash - 900 };
      payload.cashDelta = -900;
      payload.result = 'Maintenance cleared the jam.';
    } else if (choiceId === 'force') {
      s = adjustLineMorale(s, challenge.lineId!, -0.04);
      payload.moraleDelta = -0.04;
      payload.result = 'The line forced product through the jam.';
    }
  } else if (challenge.type === 'quality_check') {
    if (choiceId === 'inspect') {
      s = adjustPrimaryClientReputation({ ...s, cash: s.cash - 750 }, 0.02);
      payload.cashDelta = -750;
      payload.reputationDelta = 0.02;
      payload.result = 'The spot check reassured the client.';
    } else if (choiceId === 'skip') {
      s = adjustPrimaryClientReputation(s, -0.04);
      payload.reputationDelta = -0.04;
      payload.result = 'The check was skipped to keep output moving.';
    }
  } else if (challenge.type === 'early_leave') {
    const worker = challenge.workerId ? s.workers[challenge.workerId] : undefined;
    if (worker && choiceId === 'let_go') {
      s = clearWorkerFromLine({
        ...s,
        workers: {
          ...s.workers,
          [worker.id]: { ...worker, presentThisShift: false, morale: clamp01(worker.morale + 0.04) },
        },
      }, worker.id);
      payload.workerName = worker.name;
      payload.moraleDelta = 0.04;
      payload.result = `${firstName(worker.name)} left early.`;
    } else if (worker && choiceId === 'stay') {
      s = {
        ...s,
        workers: {
          ...s.workers,
          [worker.id]: { ...worker, morale: clamp01(worker.morale - 0.06) },
        },
      };
      payload.workerName = worker.name;
      payload.moraleDelta = -0.06;
      payload.result = `${firstName(worker.name)} stayed on the line.`;
    }
  }

  return {
    state: s,
    events: [{ type: 'CHALLENGE_RESOLVED', tick: state.tick, payload }],
  };
}

function adjustLineMorale(state: GameState, lineId: string, delta: number): GameState {
  const line = state.lines[lineId];
  if (!line) return state;
  const workers = { ...state.workers };
  for (const workerId of assignedWorkerIdsForLine(line)) {
    const worker = workers[workerId];
    if (!worker || !worker.presentThisShift) continue;
    workers[worker.id] = { ...worker, morale: clamp01(worker.morale + delta) };
  }
  return { ...state, workers };
}

function adjustPrimaryClientReputation(state: GameState, delta: number): GameState {
  const order = state.activeOrders[0];
  if (!order) return state;
  const client = state.clients[order.clientId];
  if (!client) return state;
  return {
    ...state,
    clients: {
      ...state.clients,
      [client.id]: { ...client, reputation: clamp01(client.reputation + delta) },
    },
  };
}

function clearWorkerFromLine(state: GameState, workerId: string): GameState {
  return {
    ...state,
    lines: Object.fromEntries(Object.entries(state.lines).map(([lineId, line]) => [
      lineId,
      {
        ...line,
        supportWorkerIds: (line.supportWorkerIds ?? []).filter(id => id !== workerId),
        stations: line.stations.map(station => (
          station.assignedWorkerId === workerId ? { ...station, assignedWorkerId: undefined } : station
        )),
      },
    ])),
  };
}
