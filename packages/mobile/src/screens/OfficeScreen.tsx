import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import {
  GameState, Worker,
  LEAD_COST, conversionCost,
  canHireSupervisor, SUPERVISOR_COST, SUPERVISOR_SALARY_PER_SHIFT,
  hasUnlock,
  NIGHT_OUTPUT_BONUS, NIGHT_LABOR_RATE, NIGHT_OVERHEAD,
  dayCondition, tomorrowPositions, expectedAttendance, orderProfile,
  ADVANCE_HIRE_COST, HIRE_COST,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button, StatCell } from '../components/common';

// OFFICE — day-to-day operations & planning: tomorrow's forecast and the
// agency advance order, the supervisor, and people moves. Capital purchases
// (upgrades, lines, automation) live on Corporate.
export function OfficeScreen({ state }: { state: GameState }) {
  const { promoteLead, convertWorker, terminateWorker, hireSupervisor, toggleAutoShift, toggleNightShift, requestWorkers } = useGameStore();
  const lines = Object.entries(state.lines);
  const temps = Object.values(state.workers).filter((w) => !w.permanent);

  const confirmTerminate = useCallback((worker: Worker) => {
    Alert.alert(`Terminate ${worker.name}?`, `Missed ${worker.missedShifts ?? 0} · sent home ${worker.sentHomeShifts ?? 0}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Terminate', style: 'destructive', onPress: () => terminateWorker(worker.id) },
    ]);
  }, [terminateWorker]);

  // --- Tomorrow, today: weather + SKU lineup + coverage + advance order ---
  const tomorrow = dayCondition(state.day + 1);
  const positions = tomorrowPositions(state);
  const roster = Object.keys(state.workers).length;
  const expected = expectedAttendance(state, 1);
  const arriving = state.pendingHires;
  const short = Math.ceil(positions - (expected + arriving));
  const lineCount = Object.values(state.lines).filter((l) => l.active).length;
  const lineup = [...state.activeOrders]
    .filter((o) => o.unitsCompleted < o.units)
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, lineCount);
  const toneColor = tomorrow.tone === 'bad' ? colors.red : tomorrow.tone === 'good' ? colors.green : colors.cyan;

  return (
    <View style={{ gap: 14 }}>
      <Panel>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Planning · tomorrow</Eyebrow>
            <Text style={shared.h2}>Day {state.day + 2} Forecast</Text>
          </View>
          <View style={[styles.forecast, { borderColor: toneColor }]}>
            <Text style={[styles.forecastLabel, { color: toneColor }]}>{tomorrow.label}</Text>
            <Text style={styles.forecastNote} numberOfLines={2}>
              {tomorrow.note}{tomorrow.modifier !== 0 ? ` · att ${tomorrow.modifier > 0 ? '+' : ''}${Math.round(tomorrow.modifier * 100)}%` : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Tomorrow's SKU lineup</Text>
        <View style={{ gap: 6, marginTop: 6 }}>
          {lineup.map((o) => (
            <View key={o.id} style={styles.planRow}>
              <Text style={styles.planSku}>{o.sku}</Text>
              <Text style={shared.bodyMute}>{orderProfile(o).name}</Text>
              <Text style={styles.planCrew}>{orderProfile(o).roles.length} crew</Text>
            </View>
          ))}
          {lineup.length < lineCount && (
            <View style={[styles.planRow, { opacity: 0.7 }]}>
              <Text style={styles.planSku}>New contract</Text>
              <Text style={shared.bodyMute}>dealt in the morning</Text>
              <Text style={styles.planCrew}>~3 crew</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <StatCell label="Positions" value={`${positions}`} />
          <StatCell label="Expected in" value={`~${expected.toFixed(1)}`} />
          <StatCell label="Reserved" value={`${arriving}`} />
        </View>
        {short > 0 ? (
          <Text style={styles.shortWarn}>⚠ Likely short {short} — reserve tonight or scramble tomorrow.</Text>
        ) : (
          <Text style={styles.coverageOk}>Coverage looks good ({roster} on roster).</Text>
        )}
        <Button
          label={`Reserve a worker for tomorrow · ${formatCurrency(ADVANCE_HIRE_COST)}`}
          tone="primary"
          disabled={state.cash < ADVANCE_HIRE_COST}
          onPress={() => requestWorkers(1)}
          style={{ marginTop: 10 }}
        />
        <Text style={styles.advanceNote}>
          Advance rate beats the {formatCurrency(HIRE_COST)} same-day walk-in — and arrivals never no-show day one.
        </Text>
      </Panel>

      <Panel>
        <Eyebrow>Operations</Eyebrow>
        <Text style={shared.h2}>Floor Supervisor</Text>
        {!state.hasSupervisor ? (
          <>
            <Text style={[shared.bodyMute, { marginTop: 4 }]}>
              Hire a supervisor and the plant keeps earning while you're away — they run every
              standup you miss. While you're playing, the floor stays yours unless you flip
              Auto-shift on. Salary {formatCurrency(SUPERVISOR_SALARY_PER_SHIFT)}/shift.
            </Text>
            <Button
              label={`Hire supervisor · ${formatCurrency(SUPERVISOR_COST)}`}
              tone="primary"
              disabled={!canHireSupervisor(state)}
              onPress={hireSupervisor}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <>
            <Text style={[shared.bodyMute, { marginTop: 4 }]}>
              Away time is always covered. Auto-shift is for watching hands-free — and a
              hands-on morning still squeezes out more: the supervisor never hires, trains, or
              staffs support slots. {formatCurrency(SUPERVISOR_SALARY_PER_SHIFT)}/shift either way.
            </Text>
            <Button
              label={state.autoShift ? 'Auto-shift ON — supervisor runs the floor' : 'Auto-shift off — you run the mornings'}
              tone={state.autoShift ? 'primary' : 'muted'}
              onPress={toggleAutoShift}
              style={{ marginTop: 10 }}
            />
            {hasUnlock(state, 'night_shift') && (
              <Button
                label={state.nightShift
                  ? `🌙 Night shift ON · +${Math.round(NIGHT_OUTPUT_BONUS * 100)}% output, +${Math.round(NIGHT_LABOR_RATE * 100)}% payroll`
                  : `Night shift off · +${Math.round(NIGHT_OUTPUT_BONUS * 100)}% output for +${Math.round(NIGHT_LABOR_RATE * 100)}% payroll + ${formatCurrency(NIGHT_OVERHEAD)}/shift`}
                tone={state.nightShift ? 'accent' : 'muted'}
                onPress={toggleNightShift}
                style={{ marginTop: 8 }}
              />
            )}
          </>
        )}
      </Panel>

      <Panel>
        <Eyebrow>People moves</Eyebrow>
        <Text style={shared.h2}>Leads & Conversions</Text>
        <Text style={[shared.bodyMute, { marginTop: 4 }]}>
          Promote a lead to lift a line's morale and output. Convert a temp to a company employee for a steadier, stickier worker — at a wage bump.
        </Text>
        <View style={{ gap: 10, marginTop: 12 }}>
          {Object.values(state.workers).length === 0 && <Text style={styles.empty}>No crew yet. Hire on the Floor first.</Text>}
          {Object.values(state.workers).map((worker) => {
            const assignedLine = lines.find(([, l]) =>
              l.stations.some((s) => s.assignedWorkerId === worker.id) || (l.supportWorkerIds ?? []).includes(worker.id)
            );
            const convertCost = conversionCost(worker);
            return (
              <View key={worker.id} style={styles.officeWorker}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={styles.workerName} numberOfLines={1}>{worker.name}</Text>
                    {worker.isLead && <Pill color={colors.gold}>LEAD</Pill>}
                    {worker.permanent && <Pill color={colors.purple}>CO</Pill>}
                  </View>
                  <Text style={shared.bodyMute}>D{worker.tenureDays}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <StatCell label="Missed" value={`${worker.missedShifts ?? 0}`} />
                  <StatCell label="Sent home" value={`${worker.sentHomeShifts ?? 0}`} />
                  <StatCell label="Units" value={`${Math.round(worker.totalUnits ?? 0)}`} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <Button
                    label={worker.isLead ? 'Lead' : `Make lead · ${formatCurrency(LEAD_COST)}`}
                    tone="muted" small
                    disabled={!assignedLine || worker.isLead || state.cash < LEAD_COST}
                    onPress={() => assignedLine && promoteLead(worker.id, assignedLine[0])}
                  />
                  <Button
                    label={worker.permanent ? 'Company' : `Convert · ${formatCurrency(convertCost)}`}
                    tone="muted" small
                    disabled={worker.permanent || state.cash < convertCost}
                    onPress={() => convertWorker(worker.id)}
                  />
                  <Button label="Term" tone="danger" small onPress={() => confirmTerminate(worker)} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[styles.note, { marginTop: 10 }]}>{temps.length} temp{temps.length === 1 ? '' : 's'} eligible to convert</Text>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  officeWorker: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  workerName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  empty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  note: { color: colors.textMute, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  forecast: { maxWidth: 170, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(8,13,24,0.5)' },
  forecastLabel: { fontSize: 14, fontWeight: '900' },
  forecastNote: { color: colors.textMute, fontSize: 10, fontWeight: '700', marginTop: 1 },
  sectionLabel: { color: colors.textMute, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7 },
  planSku: { color: colors.text, fontSize: 12, fontWeight: '900' },
  planCrew: { color: colors.cyan, fontSize: 12, fontWeight: '900' },
  shortWarn: { color: colors.amber, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  coverageOk: { color: colors.green, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  advanceNote: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 6 },
});
