import { GameEvent, GameState, ShiftImpactReport, WorkerShiftImpact } from '../types';
import { assignedWorkerIds } from '../lines/assignments';

const roundedUnits = (value: number) => Math.round(value * 10) / 10;

function assignmentLookup(state: GameState): Record<string, { lineName: string; stationName: string }> {
  const lookup: Record<string, { lineName: string; stationName: string }> = {};
  for (const line of Object.values(state.lines)) {
    for (const station of line.stations) {
      if (!station.assignedWorkerId) continue;
      lookup[station.assignedWorkerId] = { lineName: line.name, stationName: station.name };
    }
    for (const workerId of line.supportWorkerIds ?? []) {
      lookup[workerId] = { lineName: line.name, stationName: 'Support' };
    }
  }
  return lookup;
}

export function finalizeShiftImpact(
  state: GameState,
  payroll: number,
): { state: GameState; events: GameEvent[] } {
  const assigned = assignedWorkerIds(state);
  const placed = assignmentLookup(state);
  const workerImpacts: WorkerShiftImpact[] = Object.values(state.workers).map(worker => {
    const units = roundedUnits(worker.shiftUnits ?? 0);
    const assignment = placed[worker.id];
    const worked = (assigned.has(worker.id) && worker.presentThisShift) || units > 0;
    const status = worked ? 'worked' : worker.presentThisShift ? 'sent_home' : 'no_show';
    return {
      workerId: worker.id,
      workerName: worker.name,
      status,
      lineName: assignment?.lineName,
      stationName: assignment?.stationName,
      units,
      morale: worker.morale,
      missedShifts: worker.missedShifts ?? 0,
      sentHomeShifts: worker.sentHomeShifts ?? 0,
      shiftsWorked: worker.shiftsWorked ?? 0,
    };
  });

  const report: ShiftImpactReport = {
    day: state.day,
    tick: state.tick,
    totalUnits: roundedUnits(workerImpacts.reduce((sum, worker) => sum + worker.units, 0)),
    payroll,
    workedCount: workerImpacts.filter(worker => worker.status === 'worked').length,
    sentHomeCount: workerImpacts.filter(worker => worker.status === 'sent_home').length,
    noShowCount: workerImpacts.filter(worker => worker.status === 'no_show').length,
    workerImpacts,
  };

  const workers: GameState['workers'] = Object.fromEntries(
    Object.entries(state.workers).map(([id, worker]) => [id, { ...worker, shiftUnits: 0 }])
  );

  const events: GameEvent[] = [{
    type: 'SHIFT_IMPACT_REPORT',
    tick: state.tick,
    payload: {
      day: report.day,
      totalUnits: report.totalUnits,
      payroll: report.payroll,
      workedCount: report.workedCount,
      sentHomeCount: report.sentHomeCount,
      noShowCount: report.noShowCount,
    },
  }];

  return { state: { ...state, workers, lastShiftReport: report }, events };
}
