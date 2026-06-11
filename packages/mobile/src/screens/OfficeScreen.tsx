import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import {
  GameState, Worker,
  nextLineCost, canBuyLine,
  automationCost, canAutomate, automationMultiplier, AUTOMATION_MAX_LEVEL,
  LEAD_COST, conversionCost,
  canHireSupervisor, SUPERVISOR_COST, SUPERVISOR_SALARY_PER_SHIFT,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button, StatCell } from '../components/common';

export function OfficeScreen({ state }: { state: GameState }) {
  const { buyLine, upgradeAutomation, promoteLead, convertWorker, terminateWorker, hireSupervisor, toggleAutoShift, reset } = useGameStore();
  const lines = Object.entries(state.lines);
  const temps = Object.values(state.workers).filter((w) => !w.permanent);
  const lineCost = nextLineCost(state);
  const canAfford = canBuyLine(state);

  const confirmTerminate = useCallback((worker: Worker) => {
    Alert.alert(`Terminate ${worker.name}?`, `Missed ${worker.missedShifts ?? 0} · sent home ${worker.sentHomeShifts ?? 0}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Terminate', style: 'destructive', onPress: () => terminateWorker(worker.id) },
    ]);
  }, [terminateWorker]);

  return (
    <View style={{ gap: 14 }}>
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
          </>
        )}
      </Panel>

      <Panel>
        <Eyebrow>Capacity</Eyebrow>
        <Text style={shared.h2}>Production Lines</Text>
        <Button
          label={`Open Line ${String.fromCharCode(64 + state.lineCount + 1)} · ${formatCurrency(lineCost)}`}
          tone="primary"
          disabled={!canAfford}
          onPress={buyLine}
          style={{ marginTop: 10 }}
        />
        <View style={{ gap: 10, marginTop: 12 }}>
          {lines.map(([lineId, line]) => {
            const cost = automationCost(line);
            const upgradable = canAutomate(line) && state.cash >= cost;
            return (
              <View key={lineId} style={styles.officeLine}>
                <View style={styles.rowBetween}>
                  <Text style={styles.lineName}>{line.name}</Text>
                  <Pill color={colors.cyan}>+{Math.round((automationMultiplier(line) - 1) * 100)}% output</Pill>
                </View>
                <Text style={[shared.bodyMute, { marginTop: 3 }]}>
                  Automation L{line.automation}/{AUTOMATION_MAX_LEVEL}
                  {line.leadId && state.workers[line.leadId] ? ` · Lead: ${state.workers[line.leadId].name}` : ' · No lead'}
                </Text>
                <Button
                  label={canAutomate(line) ? `Upgrade automation · ${formatCurrency(cost)}` : 'Fully automated'}
                  tone="muted"
                  disabled={!upgradable}
                  onPress={() => upgradeAutomation(lineId)}
                  style={{ marginTop: 8 }}
                />
              </View>
            );
          })}
        </View>
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

      <Panel>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Eyebrow color={colors.red}>Danger zone</Eyebrow>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>Wipe the save and start a fresh plant.</Text>
          </View>
          <Button
            label="Reset run"
            tone="danger"
            onPress={() =>
              Alert.alert('Reset the run?', 'This wipes your save and starts a fresh shift.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: reset },
              ])
            }
          />
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  officeLine: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  lineName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  officeWorker: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  workerName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  empty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  note: { color: colors.textMute, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
});
