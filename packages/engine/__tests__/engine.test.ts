import {
  createInitialState,
  tick,
  processAttendance,
  processThroughput,
  processOrders,
  processPayroll,
  totalPayroll,
  applyShoutout,
  processMorale,
  processRetention,
  quitProbability,
  trainWorker,
  trainingCost,
  purchaseLine,
  nextLineCost,
  reputationPayMultiplier,
  fillRate,
  generateWorker,
  GameState,
  Worker,
} from '../src';

// Assign the three starting workers to the three stations so the line runs.
function staffLineA(state: GameState): GameState {
  const stations = state.lines.line1.stations.map((s, i) => ({
    ...s,
    assignedWorkerId: `w${i + 1}`,
  }));
  return {
    ...state,
    lines: { ...state.lines, line1: { ...state.lines.line1, stations } },
  };
}

function run(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = tick(s).state;
  return s;
}

describe('determinism', () => {
  it('produces identical state from the same starting point', () => {
    const a = run(staffLineA(createInitialState()), 2000);
    const b = run(staffLineA(createInitialState()), 2000);
    expect(a.cash).toBeCloseTo(b.cash, 6);
    expect(a.orderCount).toBe(b.orderCount);
    expect(JSON.stringify(a.workers)).toBe(JSON.stringify(b.workers));
  });
});

describe('attendance independence (regression: shared-RNG bug)', () => {
  it('does not force every worker to share one coin flip', () => {
    // Build many workers with the same reliability/morale but distinct ids.
    // With the old `charCodeAt(0)` seed they would all roll identically and
    // attendance would be all-present or all-absent. Independent rolls give a mix.
    let state = createInitialState();
    const workers: GameState['workers'] = {};
    for (let i = 1; i <= 40; i++) {
      const id = `w${i}`;
      workers[id] = {
        id, name: `Worker ${i}`, tenureDays: 0,
        reliability: 0.6, morale: 0.5, wage: 100,
        skills: [{ stationId: 's1', proficiency: 0.5 }],
        presentThisShift: true,
      };
    }
    state = { ...state, workers };
    const { state: after } = processAttendance(state);
    const present = Object.values(after.workers).filter(w => w.presentThisShift).length;
    // Some show, some don't — not 0 and not all 40.
    expect(present).toBeGreaterThan(0);
    expect(present).toBeLessThan(40);
  });
});

describe('reputation & missed orders', () => {
  it('drops client reputation when an order is missed', () => {
    let state = createInitialState();
    // Force the only order past its deadline with no progress.
    state = {
      ...state,
      tick: 2000,
      activeOrders: [{ ...state.activeOrders[0], deadline: 1440, unitsCompleted: 0 }],
    };
    const before = state.clients.c1.reputation;
    const { state: after, events } = processOrders(state);
    expect(after.clients.c1.reputation).toBeLessThan(before);
    expect(events.some(e => e.type === 'ORDER_MISSED')).toBe(true);
    expect(events.some(e => e.type === 'REPUTATION_SHIFT')).toBe(true);
  });

  it('pays more at high reputation than at low', () => {
    expect(reputationPayMultiplier(1)).toBeGreaterThan(reputationPayMultiplier(0.2));
  });
});

describe('payroll', () => {
  it('deducts the full roster wage every shift', () => {
    const state = createInitialState();
    const expected = totalPayroll(state);
    const { state: after, events } = processPayroll(state);
    expect(after.cash).toBe(state.cash - expected);
    expect(events[0].type).toBe('PAYROLL');
  });
});

describe('recognition (shout-out)', () => {
  it('boosts present crew morale and then goes on cooldown', () => {
    const state = createInitialState();
    const { state: after, events } = applyShoutout(state);
    expect(after.workers.w1.morale).toBeGreaterThan(state.workers.w1.morale);
    expect(events.length).toBe(1);
    // Immediately trying again does nothing (still cooling down).
    const { events: again } = applyShoutout(after);
    expect(again.length).toBe(0);
  });
});

describe('overtime fatigue', () => {
  it('burns morale at the shift boundary when overtime is on', () => {
    const state = { ...createInitialState(), overtime: true };
    const { state: after } = processMorale(state);
    expect(after.workers.w2.morale).toBeLessThan(state.workers.w2.morale);
  });
});

describe('buying lines', () => {
  it('charges scaling cost and adds a working line', () => {
    const state = { ...createInitialState(), cash: 10000 };
    const cost = nextLineCost(state);
    const { state: after, events } = purchaseLine(state);
    expect(after.cash).toBe(10000 - cost);
    expect(after.lineCount).toBe(2);
    expect(Object.keys(after.lines).length).toBe(2);
    expect(events[0].type).toBe('LINE_PURCHASED');
    // Next line costs more than this one.
    expect(nextLineCost(after)).toBeGreaterThan(cost);
  });

  it('refuses when the player cannot afford it', () => {
    const state = { ...createInitialState(), cash: 0 };
    const { state: after } = purchaseLine(state);
    expect(after.lineCount).toBe(1);
  });
});

describe('generated workers', () => {
  it('always carry a wage', () => {
    const w = generateWorker('w99', 12345);
    expect(w.wage).toBeGreaterThan(0);
  });
});

describe('partial-line operation (regression: no-show no longer flat-stops a line)', () => {
  function unitsAfterOneTick(presentCount: number): number {
    let state = staffLineA(createInitialState());
    // Mark only the first `presentCount` of the three crew as present.
    const ids = ['w1', 'w2', 'w3'];
    const workers = { ...state.workers };
    ids.forEach((id, i) => { workers[id] = { ...workers[id], presentThisShift: i < presentCount }; });
    state = { ...state, workers };
    const { state: after } = processThroughput(state);
    return after.activeOrders[0].unitsCompleted;
  }

  it('produces something when short-staffed, but less than fully staffed', () => {
    const full = unitsAfterOneTick(3);
    const short = unitsAfterOneTick(2);
    const empty = unitsAfterOneTick(0);
    expect(empty).toBe(0);
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(full);
  });
});

describe('retention / quitting', () => {
  const base: Worker = {
    id: 'x', name: 'Test', tenureDays: 0, reliability: 0.6, morale: 0.5,
    wage: 100, skills: [{ stationId: 's1', proficiency: 0.5 }], presentThisShift: true,
  };

  it('makes unhappy new hires far more likely to quit than loyal veterans', () => {
    const unhappyRookie = quitProbability({ ...base, morale: 0.2, tenureDays: 0 });
    const happyVeteran = quitProbability({ ...base, morale: 0.8, tenureDays: 120 });
    expect(unhappyRookie).toBeGreaterThan(happyVeteran);
    expect(happyVeteran).toBeLessThan(0.01);
  });

  it('referrals reduce flight risk', () => {
    const cold = quitProbability({ ...base, morale: 0.25 });
    const referred = quitProbability({ ...base, morale: 0.25, referredBy: 'w2' });
    expect(referred).toBeLessThan(cold);
  });

  it('removes a quitter from the roster and frees their station', () => {
    // A miserable, untenured worker assigned to a station; force the shift tick.
    let state = staffLineA(createInitialState());
    state = {
      ...state,
      tick: 480,
      workers: {
        ...state.workers,
        w1: { ...state.workers.w1, morale: 0.1, tenureDays: 0, reliability: 0.6 },
      },
    };
    // Run retention repeatedly across shifts until the unhappy worker walks.
    let quit = false;
    for (let shift = 1; shift <= 60 && !quit; shift++) {
      const r = processRetention({ ...state, tick: 480 * shift });
      if (r.events.some(e => e.type === 'WORKER_QUIT' && (e.payload as any).workerId === 'w1')) {
        quit = true;
        expect(r.state.workers.w1).toBeUndefined();
        const stillAssigned = Object.values(r.state.lines)
          .some(l => l.stations.some(s => s.assignedWorkerId === 'w1'));
        expect(stillAssigned).toBe(false);
      }
    }
    expect(quit).toBe(true);
  });
});

describe('training', () => {
  it('cross-trains a new station skill and charges cash', () => {
    const state = createInitialState();
    const before = state.workers.w1; // trained only on s1
    expect(before.skills.find(s => s.stationId === 's2')).toBeUndefined();
    const { state: after, events } = trainWorker(state, 'w1', 's2');
    expect(after.workers.w1.skills.find(s => s.stationId === 's2')).toBeDefined();
    expect(after.cash).toBeLessThan(state.cash);
    expect(after.workers.w1.morale).toBeGreaterThanOrEqual(before.morale);
    expect(events[0].type).toBe('WORKER_TRAINED');
  });

  it('upskills an existing skill and costs more than a fresh cross-train', () => {
    const state = createInitialState();
    const { state: after } = trainWorker(state, 'w1', 's1'); // already has s1
    const sk = after.workers.w1.skills.find(s => s.stationId === 's1')!;
    expect(sk.proficiency).toBeGreaterThan(state.workers.w1.skills[0].proficiency);
    expect(trainingCost(state.workers.w1, 's1')).toBeGreaterThan(trainingCost(state.workers.w1, 's2'));
  });

  it('refuses when the player is broke', () => {
    const state = { ...createInitialState(), cash: 0 };
    const { state: after } = trainWorker(state, 'w1', 's2');
    expect(after.workers.w1.skills.find(s => s.stationId === 's2')).toBeUndefined();
  });
});

describe('fill rate', () => {
  it('is the completed share of resolved orders', () => {
    const state = { ...createInitialState(), completedOrders: 19, missedOrders: 1 };
    expect(fillRate(state)).toBeCloseTo(0.95, 5);
  });

  it('is 100% before any orders resolve', () => {
    expect(fillRate(createInitialState())).toBe(1);
  });
});

describe('difficulty scales with success, not misses', () => {
  it('does not grow order size when an order is missed', () => {
    let state = createInitialState();
    const baseUnits = state.activeOrders[0].units;
    // Blow the deadline with zero progress, repeatedly — completedOrders stays 0.
    state = { ...state, tick: 5000, activeOrders: [{ ...state.activeOrders[0], deadline: 1440 }] };
    const { state: a } = processOrders(state);
    const { state: b } = processOrders({ ...a, tick: 6000, activeOrders: a.activeOrders.map(o => ({ ...o, deadline: 1440 })) });
    // Difficulty is driven by completedOrders (still 0), so replacements stay near the base size.
    expect(b.completedOrders).toBe(0);
    for (const o of b.activeOrders) {
      expect(o.units).toBeLessThan(baseUnits + 200);
    }
  });
});
