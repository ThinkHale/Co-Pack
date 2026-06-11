import { GameState, GameEvent, Line } from '../types';

const LINE_BASE_COST = 7500; // 2nd line $7.5k, 3rd $15k, 4th $22.5k ...

// Every line runs the same three roles, so role-trained workers fit any line.
function makeLine(index: number): Line {
  return {
    id: `line${index}`,
    name: `Line ${String.fromCharCode(64 + index)}`, // Line A, B, C ...
    active: true,
    automation: 0,
    supportWorkerIds: [],
    stations: [
      { id: 's1', name: 'Induct', throughputMultiplier: 1 },
      { id: 's2', name: 'Pack', throughputMultiplier: 1 },
      { id: 's3', name: 'Stage', throughputMultiplier: 1 },
    ],
  };
}

export function nextLineCost(state: GameState): number {
  return LINE_BASE_COST * state.lineCount;
}

export function canBuyLine(state: GameState): boolean {
  return state.cash >= nextLineCost(state);
}

/**
 * Buy another production line. This is the player's "next move" — bench workers
 * finally have somewhere to go, and total throughput scales to meet growing orders.
 */
export function purchaseLine(state: GameState): { state: GameState; events: GameEvent[] } {
  const cost = nextLineCost(state);
  if (state.cash < cost) {
    return { state, events: [] };
  }

  const index = state.lineCount + 1;
  const line = makeLine(index);

  const events: GameEvent[] = [{
    type: 'LINE_PURCHASED', tick: state.tick,
    payload: { lineId: line.id, lineName: line.name, cost },
  }];

  return {
    state: {
      ...state,
      cash: state.cash - cost,
      lineCount: index,
      lines: { ...state.lines, [line.id]: line },
    },
    events,
  };
}
