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
  dayCondition,
  dayAttendanceModifier,
  provideMeal,
  runIncentive,
  mealCost,
  incentiveCost,
  mealReady,
  incentiveReady,
  mealCooldownRemaining,
  MEAL_COOLDOWN_DAYS,
  generateWorker,
  hireWorker,
  moraleBreakdown,
  effectiveWage,
  payAttendanceBonus,
  payRetentionFactor,
  setGlobalPayRate,
  toggleSkillRequest,
  toggleProgram,
  programsPerShiftCost,
  upgradeAutomation,
  automationMultiplier,
  automationCost,
  promoteLead,
  convertToPermanent,
  TRAITS,
  workerProductivityMult,
  workerAttendanceMod,
  workerRetentionMult,
  generateAppearance,
  processIncidents,
  requiredPositions,
  coveredPositions,
  staffingFill,
  recordStaffingDay,
  STAFFING_TARGET,
  lineThroughput,
  totalThroughput,
  targetOrderCount,
  OBJECTIVES,
  evaluateObjectives,
  openObjectives,
  checkSolvency,
  BANKRUPTCY_FLOOR,
  TICKS_PER_DAY,
  TICKS_PER_SHIFT,
  shiftRemainingTicks,
  startShift,
  repeatStaffing,
  canRepeatStaffing,
  assignWorker,
  workingWorkers,
  GameState,
  Worker,
  Order,
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

// Drive the daily-staffing loop: each morning (awaitingStaffing) re-seat the
// crew on Line A and start the shift, then tick. Mirrors how the player plays.
function run(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) {
    if (s.awaitingStaffing) s = startShift(staffLineA(s)).state;
    s = tick(s).state;
  }
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
        appearance: generateAppearance(i), traits: [],
        reliability: 0.6, morale: 0.5, disposition: 0.6, wage: 100,
        permanent: false, isLead: false,
        skills: [{ stationId: 's1', proficiency: 0.5 }],
        presentThisShift: true,
      };
    }
    // A later shift (tick > 0) so the first-shift "everyone shows" guarantee
    // doesn't mask the independent-roll behavior we're checking here.
    state = { ...state, tick: 600, workers };
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

describe('payroll (pay only present, working crew)', () => {
  it('deducts wages for the crew that actually worked', () => {
    const state = staffLineA(createInitialState()); // w1-3 assigned & present
    const expected = totalPayroll(state);
    expect(expected).toBeGreaterThan(0);
    const { state: after, events } = processPayroll(state);
    expect(after.cash).toBe(state.cash - expected);
    expect(events[0].type).toBe('PAYROLL');
  });

  it('does not pay a no-show', () => {
    const staffed = staffLineA(createInitialState());
    const full = totalPayroll(staffed);
    const absent = { ...staffed, workers: { ...staffed.workers, w1: { ...staffed.workers.w1, presentThisShift: false } } };
    expect(totalPayroll(absent)).toBeLessThan(full);
    expect(workingWorkers(absent).some(w => w.id === 'w1')).toBe(false);
  });

  it('does not pay a present worker left on the bench', () => {
    // Unstaffed start state: everyone present, nobody assigned → zero wages.
    expect(totalPayroll(createInitialState())).toBe(0);
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
    appearance: generateAppearance(1), traits: [],
    disposition: 0.6, wage: 100, permanent: false, isLead: false,
    skills: [{ stationId: 's1', proficiency: 0.5 }], presentThisShift: true,
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

describe('daily conditions & attendance boosters', () => {
  it('is deterministic per day', () => {
    expect(dayCondition(5).key).toBe(dayCondition(5).key);
    expect(dayCondition(5).modifier).toBe(dayCondition(5).modifier);
  });

  it('a meal lifts the attendance modifier and costs cash', () => {
    const state = { ...createInitialState(), day: 3 };
    const before = dayAttendanceModifier(state);
    const { state: after, events } = provideMeal(state);
    expect(after.mealToday).toBe(true);
    expect(after.cash).toBe(state.cash - mealCost(state));
    expect(dayAttendanceModifier(after)).toBeGreaterThan(before);
    expect(events[0].type).toBe('ATTENDANCE_BOOST');
  });

  it('does not double-charge for a meal already provided today', () => {
    const fed = provideMeal(createInitialState()).state;
    const { state: again, events } = provideMeal(fed);
    expect(again.cash).toBe(fed.cash);
    expect(events.length).toBe(0);
  });

  it('an incentive lifts attendance more than a meal', () => {
    const meal = provideMeal(createInitialState()).state;
    const incentive = runIncentive(createInitialState()).state;
    expect(dayAttendanceModifier(incentive)).toBeGreaterThan(dayAttendanceModifier(meal));
  });

  it('resets boosters and announces a condition when the day rolls over', () => {
    // One tick before a day boundary, with a meal active.
    let state: GameState = { ...createInitialState(), tick: TICKS_PER_DAY - 1, mealToday: true };
    const { state: after, events } = tick(state);
    expect(after.day).toBe(1);
    expect(after.mealToday).toBe(false);
    expect(events.some(e => e.type === 'DAY_CONDITION')).toBe(true);
  });
});

describe('emergency levers are not routine (cooldown + cost)', () => {
  it('a meal puts the lever on a multi-day cooldown', () => {
    const state = { ...createInitialState(), cash: 100000, day: 2 };
    expect(mealReady(state)).toBe(true);
    const { state: after } = provideMeal(state);
    expect(after.mealCooldownUntil).toBe(2 + MEAL_COOLDOWN_DAYS);
    // Even on a fresh day, it stays locked until the cooldown elapses.
    expect(mealReady({ ...after, day: 3, mealToday: false })).toBe(false);
    expect(mealReady({ ...after, day: 2 + MEAL_COOLDOWN_DAYS, mealToday: false })).toBe(true);
  });

  it('costs a flat hit plus per-head, scaling with roster size', () => {
    const small = { ...createInitialState(), cash: 100000 };
    const big = {
      ...small,
      workers: { ...small.workers, w4: { ...small.workers.w1, id: 'w4' }, w5: { ...small.workers.w1, id: 'w5' } },
    };
    expect(mealCost(big)).toBeGreaterThan(mealCost(small));
    // The incentive is the pricier, heavier lever.
    expect(incentiveCost(small)).toBeGreaterThan(mealCost(small));
  });

  it('will not fire while on cooldown', () => {
    const state = { ...createInitialState(), cash: 100000, mealCooldownUntil: 5, day: 2 };
    expect(mealReady(state)).toBe(false);
    const { state: after, events } = provideMeal(state);
    expect(events.length).toBe(0);
    expect(after.cash).toBe(state.cash);
  });

  it('cooldown counts down as days pass', () => {
    const state = { ...createInitialState(), mealCooldownUntil: 6, day: 2 };
    expect(mealCooldownRemaining(state)).toBe(4);
    expect(incentiveReady({ ...createInitialState(), day: 0 })).toBe(true);
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

describe('morale breakdown', () => {
  it('buckets workers into thriving / steady / struggling', () => {
    const state = createInitialState();
    const workers = {
      a: { ...state.workers.w1, id: 'a', morale: 0.9 },
      b: { ...state.workers.w1, id: 'b', morale: 0.55 },
      c: { ...state.workers.w1, id: 'c', morale: 0.2 },
    };
    const bd = moraleBreakdown(workers);
    expect(bd.thriving).toBe(1);
    expect(bd.steady).toBe(1);
    expect(bd.struggling).toBe(1);
  });
});

describe('disposition-driven morale drift', () => {
  it('pulls a worker toward their own set-point, not a shared baseline', () => {
    let state = createInitialState();
    // One worker above their set-point, one below.
    state = {
      ...state,
      workers: {
        hi: { ...state.workers.w1, id: 'hi', morale: 0.95, disposition: 0.5 },
        lo: { ...state.workers.w1, id: 'lo', morale: 0.30, disposition: 0.8 },
      },
    };
    const { state: after } = processMorale(state);
    expect(after.workers.hi.morale).toBeLessThan(0.95);  // drifts down toward 0.5
    expect(after.workers.lo.morale).toBeGreaterThan(0.30); // drifts up toward 0.8
  });
});

describe('pay policy', () => {
  it('raising pay increases wages, attendance odds, and retention', () => {
    const lo = setGlobalPayRate(createInitialState(), 0.9);
    const hi = setGlobalPayRate(createInitialState(), 1.4);
    const w = createInitialState().workers.w1;
    expect(effectiveWage(w, hi.payPolicy)).toBeGreaterThan(effectiveWage(w, lo.payPolicy));
    expect(payAttendanceBonus(w, hi.payPolicy)).toBeGreaterThan(payAttendanceBonus(w, lo.payPolicy));
    // Higher pay => lower retention factor (less flight risk).
    expect(payRetentionFactor(w, hi.payPolicy)).toBeLessThan(payRetentionFactor(w, lo.payPolicy));
  });

  it('clamps the rate within bounds', () => {
    const tooHigh = setGlobalPayRate(createInitialState(), 99);
    expect(tooHigh.payPolicy.globalRate).toBeLessThanOrEqual(1.5);
  });
});

describe('skill request & referral program', () => {
  it('toggles a station in and out of the request', () => {
    let s = createInitialState();
    s = toggleSkillRequest(s, 's2');
    expect(s.skillRequest).toContain('s2');
    s = toggleSkillRequest(s, 's2');
    expect(s.skillRequest).not.toContain('s2');
  });

  it('referral program makes new hires arrive referred', () => {
    let s = createInitialState();
    s = toggleProgram(s, 'referral');
    expect(programsPerShiftCost(s)).toBeGreaterThan(0);
    const { state: after } = hireWorker(s);
    const newest = Object.values(after.workers).find(w => !['w1', 'w2', 'w3'].includes(w.id))!;
    expect(newest.referredBy).toBeDefined();
  });
});

describe('automation', () => {
  it('raises a line output multiplier and charges a climbing cost', () => {
    const state = { ...createInitialState(), cash: 50000 };
    const before = automationMultiplier(state.lines.line1);
    const firstCost = automationCost(state.lines.line1);
    const { state: a, events } = upgradeAutomation(state, 'line1');
    expect(automationMultiplier(a.lines.line1)).toBeGreaterThan(before);
    expect(a.cash).toBe(state.cash - firstCost);
    expect(events[0].type).toBe('AUTOMATION_UPGRADED');
    // Next upgrade costs more.
    expect(automationCost(a.lines.line1)).toBeGreaterThan(firstCost);
  });
});

describe('leads & temp→company conversion', () => {
  it('promotes a lead and flags the line', () => {
    const state = { ...staffLineA(createInitialState()), cash: 5000 };
    const { state: after, events } = promoteLead(state, 'w1', 'line1');
    expect(after.workers.w1.isLead).toBe(true);
    expect(after.lines.line1.leadId).toBe('w1');
    expect(events[0].type).toBe('LEAD_PROMOTED');
  });

  it('converts a temp into a steadier, higher-paid company employee', () => {
    const state = { ...createInitialState(), cash: 5000 };
    const before = state.workers.w3;
    const { state: after, events } = convertToPermanent(state, 'w3');
    const w = after.workers.w3;
    expect(w.permanent).toBe(true);
    expect(w.wage).toBeGreaterThan(before.wage);
    expect(w.reliability).toBeGreaterThan(before.reliability);
    expect(after.cash).toBeLessThan(state.cash);
    expect(events[0].type).toBe('WORKER_CONVERTED');
  });

  it('a present lead lifts their line throughput', () => {
    const base = staffLineA(createInitialState());
    const { state: led } = promoteLead(base, 'w1', 'line1');
    const plain = processThroughput(base).state.activeOrders[0].unitsCompleted;
    const boosted = processThroughput(led).state.activeOrders[0].unitsCompleted;
    expect(boosted).toBeGreaterThan(plain);
  });
});

describe('character generator', () => {
  it('produces a name, appearance, and 3-5 non-conflicting traits', () => {
    for (let i = 0; i < 50; i++) {
      const w = generateWorker(`g${i}`, i * 1000 + 7);
      expect(w.name).toMatch(/\S+ \S\./);
      expect(w.appearance.skinTone).toMatch(/^#/);
      expect(w.traits.length).toBeGreaterThanOrEqual(3);
      expect(w.traits.length).toBeLessThanOrEqual(5);
      expect(new Set(w.traits).size).toBe(w.traits.length); // no dupes
      for (const t of w.traits) {
        for (const c of (TRAITS[t].conflicts ?? [])) expect(w.traits).not.toContain(c);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    expect(JSON.stringify(generateWorker('w', 4242))).toBe(JSON.stringify(generateWorker('w', 4242)));
  });
});

describe('trait effects feed the sim', () => {
  const base = generateWorker('t', 1);
  it('a hard worker out-produces a coaster', () => {
    expect(workerProductivityMult({ ...base, traits: ['hard_worker'] }))
      .toBeGreaterThan(workerProductivityMult({ ...base, traits: ['slacker'] }));
  });
  it('perfect attendance lifts the attendance mod; spotty lowers it', () => {
    expect(workerAttendanceMod({ ...base, traits: ['perfect_attendance'] })).toBeGreaterThan(0);
    expect(workerAttendanceMod({ ...base, traits: ['bad_attendance'] })).toBeLessThan(0);
  });
  it('loyal workers are stickier than job hoppers', () => {
    expect(workerRetentionMult({ ...base, traits: ['loyal'] })).toBeLessThan(1);
    expect(workerRetentionMult({ ...base, traits: ['job_hopper'] })).toBeGreaterThan(1);
  });
});

describe('incidents', () => {
  it('a checkered-past worker can trigger an incident over time', () => {
    let s = staffLineA(createInitialState());
    s = {
      ...s,
      activeOrders: [{ ...s.activeOrders[0], unitsCompleted: 100 }],
      workers: { ...s.workers, w1: { ...s.workers.w1, traits: ['background_check', 'clumsy'], presentThisShift: true } },
    };
    let fired = false;
    for (let t = 0; t < 4000 && !fired; t++) {
      if (processIncidents({ ...s, tick: t }).events.some(e => e.type === 'INCIDENT')) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('a clean crew never throws an incident', () => {
    let s = staffLineA(createInitialState());
    s = { ...s, workers: Object.fromEntries(Object.entries(s.workers).map(([id, w]) =>
      [id, { ...w, traits: ['hard_worker'], presentThisShift: true }])) };
    let any = false;
    for (let t = 0; t < 2000; t++) if (processIncidents({ ...s, tick: t }).events.length) any = true;
    expect(any).toBe(false);
  });
});

describe('appearance', () => {
  it('senior hint forces a senior age bracket', () => {
    expect(generateAppearance(7, true).ageBracket).toBe('senior');
  });
});

describe('staffing board (labor coverage)', () => {
  it('counts required positions as all station slots on active lines', () => {
    expect(requiredPositions(createInitialState())).toBe(3);
  });

  it('only counts a position covered when a present worker is assigned', () => {
    let s = staffLineA(createInitialState());
    expect(coveredPositions(s)).toBe(3);
    s = { ...s, workers: { ...s.workers, w1: { ...s.workers.w1, presentThisShift: false } } };
    expect(coveredPositions(s)).toBe(2);
    expect(staffingFill(s)).toBeCloseTo(2 / 3, 5);
  });

  it('records a day and dings reputation below target', () => {
    let s = staffLineA(createInitialState());
    s = { ...s, workers: Object.fromEntries(Object.entries(s.workers).map(([id, w], idx) =>
      [id, { ...w, presentThisShift: idx === 0 }])) };
    const repBefore = s.clients.c1.reputation;
    const { state: after, events } = recordStaffingDay(s);
    expect(after.staffingHistory.length).toBe(1);
    expect(after.staffingHistory[0].fill).toBeLessThan(STAFFING_TARGET);
    expect(after.clients.c1.reputation).toBeLessThan(repBefore);
    expect(events[0].type).toBe('STAFFING_REPORT');
  });

  it('does not ding reputation on a fully-staffed day', () => {
    const s = staffLineA(createInitialState());
    const repBefore = s.clients.c1.reputation;
    const { state: after } = recordStaffingDay(s);
    expect(after.staffingHistory[0].fill).toBe(1);
    expect(after.clients.c1.reputation).toBe(repBefore);
  });
});

describe('throughput is engine-sourced (regression: HUD dropped leads/automation)', () => {
  it('totalThroughput reflects a lead bonus the old UI formula ignored', () => {
    const base = staffLineA(createInitialState());
    const plain = totalThroughput(base);
    const { state: led } = promoteLead(base, 'w1', 'line1');
    expect(totalThroughput(led)).toBeGreaterThan(plain);
  });

  it('totalThroughput reflects automation the old UI formula ignored', () => {
    const base = { ...staffLineA(createInitialState()), cash: 50000 };
    const plain = totalThroughput(base);
    const { state: auto } = upgradeAutomation(base, 'line1');
    expect(totalThroughput(auto)).toBeGreaterThan(plain);
  });

  it('totalThroughput equals the units actually applied to the order in a tick', () => {
    const base = staffLineA(createInitialState());
    const tp = totalThroughput(base);
    const { state: after } = processThroughput(base);
    expect(after.activeOrders[0].unitsCompleted).toBeCloseTo(tp, 6);
  });
});

describe('parallel lines work distinct orders', () => {
  function twoStaffedLines(): GameState {
    let s = createInitialState();
    const mkWorker = (id: string): Worker => ({
      ...s.workers.w1, id, name: `Crew ${id}`, presentThisShift: true,
      skills: [{ stationId: 's1', proficiency: 0.7 }],
    });
    const workers: Record<string, Worker> = {};
    for (let i = 1; i <= 6; i++) workers[`w${i}`] = mkWorker(`w${i}`);
    const staff = (ids: string[]) => [
      { id: 's1', name: 'Induct', throughputMultiplier: 1, assignedWorkerId: ids[0] },
      { id: 's2', name: 'Pack', throughputMultiplier: 1, assignedWorkerId: ids[1] },
      { id: 's3', name: 'Stage', throughputMultiplier: 1, assignedWorkerId: ids[2] },
    ];
    const orders: Order[] = [
      { id: 'ordA', clientId: 'c1', sku: 'A', units: 5000, unitsCompleted: 0, deadline: 1000, revenuePerUnit: 2, qualityThreshold: 0.9 },
      { id: 'ordB', clientId: 'c1', sku: 'B', units: 5000, unitsCompleted: 0, deadline: 2000, revenuePerUnit: 2, qualityThreshold: 0.9 },
    ];
    return {
      ...s, lineCount: 2, workers, activeOrders: orders,
      lines: {
        line1: { id: 'line1', name: 'Line A', active: true, automation: 0, stations: staff(['w1', 'w2', 'w3']) },
        line2: { id: 'line2', name: 'Line B', active: true, automation: 0, stations: staff(['w4', 'w5', 'w6']) },
      },
    };
  }

  it('advances two orders in a single tick rather than piling onto one', () => {
    const { state: after } = processThroughput(twoStaffedLines());
    expect(after.activeOrders[0].unitsCompleted).toBeGreaterThan(0);
    expect(after.activeOrders[1].unitsCompleted).toBeGreaterThan(0);
  });

  it('keeps one open order per active line', () => {
    expect(targetOrderCount(createInitialState())).toBe(1);
    const bought = purchaseLine({ ...createInitialState(), cash: 10000 }).state;
    expect(targetOrderCount(bought)).toBe(2);
    // The board tops up to the new target on the next order pass.
    const { state: refilled } = processOrders(bought);
    expect(refilled.activeOrders.length).toBe(2);
  });
});

describe('objectives progression', () => {
  it('first contract pays out exactly once and emits an event', () => {
    const state = { ...createInitialState(), completedOrders: 1 };
    const { state: after, events } = evaluateObjectives(state);
    expect(after.completedObjectives).toContain('first_order');
    expect(after.cash).toBe(state.cash + OBJECTIVES.find(o => o.id === 'first_order')!.reward);
    expect(events.some(e => e.type === 'OBJECTIVE_COMPLETED')).toBe(true);
    // Re-evaluating grants nothing further.
    const { state: again, events: noMore } = evaluateObjectives(after);
    expect(again.cash).toBe(after.cash);
    expect(noMore.length).toBe(0);
  });

  it('surfaces the first open goal first', () => {
    expect(openObjectives(createInitialState(), 1)[0].id).toBe('first_order');
  });

  it('does not pay objectives after game over', () => {
    const state = { ...createInitialState(), completedOrders: 99, gameOver: true };
    const { state: after, events } = evaluateObjectives(state);
    expect(after.completedObjectives.length).toBe(0);
    expect(events.length).toBe(0);
  });
});

describe('solvency / bankruptcy stakes', () => {
  it('ends the run when cash sinks below the floor', () => {
    const state = { ...createInitialState(), cash: BANKRUPTCY_FLOOR - 1 };
    const { state: after, events } = checkSolvency(state);
    expect(after.gameOver).toBe(true);
    expect(events.some(e => e.type === 'GAME_OVER')).toBe(true);
  });

  it('warns once on the slide into the red, then re-arms in the black', () => {
    const red = { ...createInitialState(), cash: -100 };
    const { state: warned, events } = checkSolvency(red);
    expect(warned.cashWarned).toBe(true);
    expect(events.some(e => e.type === 'CASH_WARNING')).toBe(true);
    // Still red, already warned: silent.
    expect(checkSolvency(warned).events.length).toBe(0);
    // Back in the black: warning re-arms.
    expect(checkSolvency({ ...warned, cash: 50 }).state.cashWarned).toBe(false);
  });

  it('a tick on a game-over state is a no-op', () => {
    const dead = { ...staffLineA(createInitialState()), gameOver: true };
    const { state: after, events } = tick(dead);
    expect(after.tick).toBe(dead.tick);
    expect(events.length).toBe(0);
  });
});

describe('clean opening (regression: day-0 storm + first-shift no-shows)', () => {
  it('day 0 is always a good condition, never a storm', () => {
    expect(dayCondition(0).tone).toBe('good');
    expect(dayCondition(0).modifier).toBeGreaterThanOrEqual(0);
  });

  it('the whole starting crew shows up on the very first shift', () => {
    const { state: after } = processAttendance(createInitialState());
    const present = Object.values(after.workers).filter(w => w.presentThisShift).length;
    expect(present).toBe(Object.keys(after.workers).length);
  });

  it('attendance can still vary on later shifts', () => {
    let s = createInitialState();
    // 40 average workers on a later shift — some should miss.
    const workers: GameState['workers'] = {};
    for (let i = 1; i <= 40; i++) {
      workers[`w${i}`] = { ...s.workers.w1, id: `w${i}`, reliability: 0.6, morale: 0.5, traits: [] };
    }
    const { state: after } = processAttendance({ ...s, tick: TICKS_PER_SHIFT * 5, day: 5, workers });
    const present = Object.values(after.workers).filter(w => w.presentThisShift).length;
    expect(present).toBeGreaterThan(0);
    expect(present).toBeLessThan(40);
  });
});

describe('time model (10h shift = 1 day)', () => {
  it('a shift is 600 ticks and one shift is one day', () => {
    expect(TICKS_PER_SHIFT).toBe(600);
    expect(TICKS_PER_DAY).toBe(600);
  });

  it('counts down the remaining shift minutes', () => {
    expect(shiftRemainingTicks(0)).toBe(600);
    expect(shiftRemainingTicks(60)).toBe(540);
  });

  it('runs a clean first day end-to-end: standup, output, day rollover', () => {
    let s = createInitialState();
    // Tick 0 rolls attendance (all show on opening day) and opens the standup.
    s = tick(s).state;
    expect(s.awaitingStaffing).toBe(true);
    expect(Object.values(s.workers).every(w => w.presentThisShift)).toBe(true);
    // Player staffs the line and starts the shift.
    s = startShift(staffLineA(s)).state;
    expect(s.awaitingStaffing).toBe(false);
    // Run the shift out to the next morning.
    for (let i = 0; i <= TICKS_PER_DAY; i++) s = tick(s).state;
    expect(s.day).toBe(1);
    expect(s.activeOrders[0].unitsCompleted).toBeGreaterThan(0);
    expect(s.gameOver).toBe(false);
  });
});

describe('daily re-staffing (sim loop)', () => {
  it('clears the board and holds the clock at each shift boundary', () => {
    let s = createInitialState();
    s = tick(s).state;                 // tick 0 → standup
    s = startShift(staffLineA(s)).state;
    for (let i = 0; i < TICKS_PER_DAY; i++) s = tick(s).state; // reach next boundary
    expect(s.awaitingStaffing).toBe(true);
    const anyAssigned = Object.values(s.lines).some(l => l.stations.some(st => st.assignedWorkerId));
    expect(anyAssigned).toBe(false);                 // board wiped
    expect(Object.keys(s.previousAssignments).length).toBeGreaterThan(0); // yesterday remembered
  });

  it('"Repeat yesterday" re-seats present crew and skips no-shows', () => {
    let s = createInitialState();
    s = tick(s).state;                          // standup
    s = startShift(staffLineA(s)).state;        // staff + start day 1
    for (let i = 0; i < TICKS_PER_DAY; i++) s = tick(s).state; // to next morning
    // Force w2 to be a no-show this new morning.
    s = { ...s, workers: { ...s.workers, w2: { ...s.workers.w2, presentThisShift: false } } };
    expect(canRepeatStaffing(s)).toBe(true);
    const { state: repeated } = repeatStaffing(s);
    const assignedIds = Object.values(repeated.lines).flatMap(l => l.stations.map(st => st.assignedWorkerId).filter(Boolean));
    expect(assignedIds).toContain('w1');
    expect(assignedIds).not.toContain('w2'); // no-show is not re-seated
  });

  it('startShift releases the morning hold and lets the clock advance', () => {
    let s = createInitialState();
    s = tick(s).state;
    expect(tick(s).state.tick).toBe(s.tick); // frozen while awaiting staffing
    s = startShift(s).state;
    expect(tick(s).state.tick).toBe(s.tick + 1); // running again
  });
});

describe('hiring id safety (regression: no reuse after a quit)', () => {
  it('never reuses an id after a worker is removed', () => {
    let s = { ...createInitialState(), cash: 100000 };
    const { w2, ...rest } = s.workers;
    s = { ...s, workers: rest };
    const idsBefore = new Set(Object.keys(s.workers));
    const { state: after } = hireWorker(s);
    const newId = Object.keys(after.workers).find(id => !idsBefore.has(id))!;
    expect(idsBefore.has(newId)).toBe(false);
    expect(Object.keys(after.workers).length).toBe(3);
    expect(after.nextWorkerId).toBe(s.nextWorkerId + 1);
  });
});
