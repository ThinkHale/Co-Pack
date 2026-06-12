import * as E from '../src';

// --- Economy guardrails ---
// These lock in the tuned shape of the economy so future balance changes
// can't silently break it. Each assertion encodes a design requirement:
//   1. Labor dominates the early P&L (the workforce is the critical element).
//   2. The early game is tense, not comfortable.
//   3. Underpaying (the sweatshop) must LOSE to market pay over time.
//   4. The night shift is a loss for a small shop, a win for a built one.
//   5. Coasting stagnates but survives; growth progresses; idle earns.

function playerStaff(s: E.GameState): E.GameState {
  return E.startShift(E.autoAssignCrew(s)).state;
}
function humanChallengeChoice(s: E.GameState): string {
  const c = s.shiftChallenge!;
  if (c.type === 'belt_jam') return s.cash > 6000 ? 'clear' : 'force';
  if (c.type === 'quality_check') return s.cash > 6000 ? 'inspect' : 'skip';
  return 'let_go';
}
function runDays(s: E.GameState, days: number, perTick?: (s: E.GameState) => E.GameState): E.GameState {
  for (let i = 0; i < days * E.TICKS_PER_DAY && !s.gameOver; i++) {
    if (s.awaitingStaffing) s = playerStaff(s);
    if (s.shiftChallenge) s = E.resolveShiftChallenge(s, humanChallengeChoice(s)).state;
    if (perTick) s = perTick(s);
    s = E.tick(s).state;
  }
  return s;
}

function shiftPnL(s: E.GameState, revPerUnit: number, rep: number) {
  const revenue = E.totalThroughput(s) * E.TICKS_PER_SHIFT * revPerUnit * E.reputationPayMultiplier(rep);
  const payroll = E.totalPayroll(s);
  const overhead = E.facilityOverhead(s);
  return { revenue, payroll, overhead, net: revenue - payroll - overhead };
}

describe('economy guardrails', () => {
  it('labor dominates the early P&L and margins are tight', () => {
    const early = E.autoAssignCrew(E.createInitialState());
    const t1 = E.clientTier('c1')!;
    const p = shiftPnL(early, t1.revenueBase + t1.revenueSpread / 2, 0.8);
    const laborShare = p.payroll / p.revenue;
    const margin = p.net / p.revenue;
    // Workforce is the critical element: payroll is ~half of starter revenue.
    expect(laborShare).toBeGreaterThan(0.38);
    expect(laborShare).toBeLessThan(0.55);
    // Tense, not comfortable — and not a death march.
    expect(margin).toBeGreaterThan(0.2);
    expect(margin).toBeLessThan(0.45);
  });

  it('automation pays upkeep every shift (machines are not free output)', () => {
    const base = { ...E.createInitialState(), cash: 999999 };
    const l2 = E.upgradeAutomation(E.upgradeAutomation(base, 'line1').state, 'line1').state;
    expect(E.facilityOverhead(l2)).toBe(E.facilityOverhead(base) + 2 * E.AUTOMATION_UPKEEP_PER_LEVEL);
  });

  it('the sweatshop loses: min pay < market pay < generous pay over 25 days', () => {
    const results: Record<string, number> = {};
    for (const rate of [0.9, 1.0, 1.2]) {
      let s = E.setGlobalPayRate(E.createInitialState(), rate);
      // Staff to demand: heavier SKUs need bigger crews, so a competent
      // operator hires toward tomorrow's positions, not a fixed headcount.
      s = runDays(s, 25, st =>
        Object.keys(st.workers).length < E.tomorrowPositions(st) + 1 && st.cash > E.HIRE_COST + 1500
          ? E.hireWorker(st).state : st);
      results[String(rate)] = s.cash;
    }
    expect(results['0.9']).toBeLessThan(results['1']);
    expect(results['1']).toBeLessThan(results['1.2']);
  });

  it('night shift is a loss for a small shop and a win for a built one', () => {
    const t1 = E.clientTier('c1')!;
    const t4 = E.clientTier('c4')!;
    let small = E.hireSupervisor({ ...E.autoAssignCrew(E.createInitialState()), cash: 99999 }).state;
    small = E.purchaseUnlock(small, 'night_shift').state;
    const smallDay = shiftPnL(small, t1.revenueBase + t1.revenueSpread / 2, 0.8).net;
    const smallNight = shiftPnL(E.toggleNightShift(small).state, t1.revenueBase + t1.revenueSpread / 2, 0.8).net;
    expect(smallNight).toBeLessThan(smallDay);

    let big = { ...small, cash: 999999 };
    for (let i = 0; i < 5; i++) big = E.upgradeAutomation(big, 'line1').state;
    big = E.promoteLead(big, 'w2', 'line1').state;
    const bigDay = shiftPnL(big, t4.revenueBase + t4.revenueSpread / 2, 0.85).net;
    const bigNight = shiftPnL(E.toggleNightShift(big).state, t4.revenueBase + t4.revenueSpread / 2, 0.85).net;
    expect(bigNight).toBeGreaterThan(bigDay + 3000);
  });

  it('coasting stagnates but survives 20 days; idle supervision earns 10 days', () => {
    let coast = E.createInitialState();
    for (let i = 0; i < 20 * E.TICKS_PER_DAY && !coast.gameOver; i++) {
      if (coast.awaitingStaffing) coast = playerStaff(coast);
      if (coast.shiftChallenge) coast = E.resolveShiftChallenge(coast, E.supervisorChallengeChoice(coast.shiftChallenge)).state;
      coast = E.tick(coast).state;
    }
    expect(coast.gameOver).toBe(false);
    expect(coast.cash).toBeLessThan(12000); // no empire from standing still

    let idle = E.hireSupervisor({ ...E.createInitialState(), cash: 26000 }).state;
    const idleStart = idle.cash;
    for (let i = 0; i < 10 * E.TICKS_PER_DAY && !idle.gameOver && !idle.awaitingStaffing; i++) {
      idle = E.tick(idle, { unattended: true }).state;
    }
    expect(idle.gameOver).toBe(false);
    expect(idle.cash).toBeGreaterThan(idleStart); // unattended time still earns
  });

  it('a disciplined growth run lands the second client and second line inside two weeks', () => {
    let g = E.createInitialState();
    for (let i = 0; i < 14 * E.TICKS_PER_DAY && !g.gameOver; i++) {
      if (g.awaitingStaffing) g = playerStaff(g);
      if (g.shiftChallenge) g = E.resolveShiftChallenge(g, humanChallengeChoice(g)).state;
      const crew = Object.keys(g.workers).length;
      if (g.cash > E.nextLineCost(g) + 4000 && g.lineCount < 3 && crew >= E.tomorrowPositions(g) + 2) g = E.purchaseLine(g).state;
      if (crew < E.tomorrowPositions(g) + (g.cash > E.nextLineCost(g) ? 2 : 1) && g.cash > 4000) g = E.hireWorker(g).state;
      g = E.tick(g).state;
    }
    expect(g.gameOver).toBe(false);
    expect(g.lineCount).toBeGreaterThanOrEqual(2);
    expect(g.clients.c2).toBeDefined();
  });
});
