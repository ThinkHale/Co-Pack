import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import {
  GameState, Worker,
  LEAD_COST, conversionCost, CONVERSION_MIN_SHIFTS_WORKED,
  dayCondition, tomorrowPositions, expectedAttendance, orderProfile,
  ADVANCE_HIRE_COST, HIRE_COST,
} from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Button, StatCell } from '../components/common';
import { CharacterAvatar } from '../components/Avatar';

// OFFICE — day-to-day operations & planning: tomorrow's forecast and the
// agency advance order, the supervisor, and people moves. Capital purchases
// (upgrades, lines, automation) live on Corporate.
export function OfficeScreen({ state }: { state: GameState }) {
  const {
    promoteLead, convertWorker, terminateWorker, requestWorkers,
    soundOn, toggleSound, reset,
  } = useGameStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const expectedLow = Math.max(0, Math.floor(expected - 1));
  const expectedHigh = Math.min(roster + arriving, Math.ceil(expected + 1));
  const short = Math.ceil(positions - (expected + arriving));
  const lineCount = Object.values(state.lines).filter((l) => l.active).length;
  const lineup = [...state.activeOrders]
    .filter((o) => o.unitsCompleted < o.units)
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, lineCount);
  const toneColor = tomorrow.tone === 'bad' ? colors.red : tomorrow.tone === 'good' ? colors.green : colors.cyan;
  const riskLabel = short > 1 ? 'High risk' : short === 1 ? 'Watch' : 'Covered';
  const riskColor = short > 1 ? colors.red : short === 1 ? colors.amber : colors.green;

  if (settingsOpen) {
    return (
      <SettingsPanel
        soundOn={soundOn}
        onBack={() => setSettingsOpen(false)}
        onToggleSound={toggleSound}
        onReset={reset}
      />
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Panel style={styles.officeHeader}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Office</Eyebrow>
          <Text style={shared.h2}>Tomorrow & People</Text>
          <Text style={[shared.bodyMute, { marginTop: 3 }]}>Planning, reservations, leads, and conversions.</Text>
        </View>
      </Panel>

      <Pressable
        onPress={() => setSettingsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        style={({ pressed }) => [styles.settingsEntry, pressed && { opacity: 0.82 }]}
      >
        <View>
          <Eyebrow>Settings</Eyebrow>
          <Text style={styles.settingsEntryTitle}>Sound and save controls</Text>
        </View>
        <Text style={styles.settingsEntryAction}>Open</Text>
      </Pressable>

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
          <StatCell label="Crew range" value={`${expectedLow}-${expectedHigh}`} />
          <StatCell label="Reserved" value={`${arriving}`} />
        </View>
        <View style={[styles.riskBand, { borderColor: riskColor }]}>
          <Text style={[styles.riskLabel, { color: riskColor }]}>{riskLabel}</Text>
          <Text style={styles.riskCopy}>
            Soft forecast from reliability, pay, programs, and tomorrow's condition. Reserve workers when the range is tight.
          </Text>
        </View>
        {short > 0 ? (
          <Text style={styles.shortWarn}>Likely short {short} - reserve tonight or scramble tomorrow.</Text>
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
                  <View style={styles.workerIdentity}>
                    <CharacterAvatar worker={worker} size="sm" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.workerName} numberOfLines={1}>{worker.name}</Text>
                        {worker.isLead && <Pill color={colors.gold}>LEAD</Pill>}
                        {worker.permanent && <Pill color={colors.purple}>CO</Pill>}
                      </View>
                      <Text style={shared.bodyMute} numberOfLines={1}>{worker.presentThisShift ? 'Available today' : 'Out today'}</Text>
                    </View>
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
                    label={worker.permanent
                      ? 'Company'
                      : (worker.shiftsWorked ?? 0) < CONVERSION_MIN_SHIFTS_WORKED
                        ? `${CONVERSION_MIN_SHIFTS_WORKED - (worker.shiftsWorked ?? 0)} shifts to convert`
                        : `Convert · ${formatCurrency(convertCost)}`}
                    tone="muted" small
                    disabled={worker.permanent || (worker.shiftsWorked ?? 0) < CONVERSION_MIN_SHIFTS_WORKED || state.cash < convertCost}
                    onPress={() => convertWorker(worker.id)}
                  />
                  <Button label="Term" tone="danger" small onPress={() => confirmTerminate(worker)} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[styles.note, { marginTop: 10 }]}>
          {temps.filter((w) => (w.shiftsWorked ?? 0) >= CONVERSION_MIN_SHIFTS_WORKED).length} temp{temps.length === 1 ? '' : 's'} eligible to convert
        </Text>
      </Panel>
    </View>
  );
}

function SettingsPanel({
  soundOn, onBack, onToggleSound, onReset,
}: {
  soundOn: boolean;
  onBack: () => void;
  onToggleSound: () => void;
  onReset: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <Panel style={styles.officeHeader}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Settings</Eyebrow>
          <Text style={shared.h2}>App Controls</Text>
          <Text style={[shared.bodyMute, { marginTop: 3 }]}>Sound and save controls.</Text>
        </View>
        <Button label="Back" tone="ghost" small onPress={onBack} />
      </Panel>

      <Panel>
        <View style={styles.settingsRowClean}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Sound</Eyebrow>
            <Text style={styles.settingTitle}>Shift audio</Text>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>Event sounds and feedback cues.</Text>
          </View>
          <Button
            label={soundOn ? 'On' : 'Muted'}
            tone={soundOn ? 'primary' : 'muted'}
            small
            onPress={onToggleSound}
          />
        </View>
      </Panel>

      <Panel style={{ borderColor: colors.red }}>
        <View style={styles.settingsRowClean}>
          <View style={{ flex: 1 }}>
            <Eyebrow color={colors.red}>Danger zone</Eyebrow>
            <Text style={styles.settingTitle}>Reset run</Text>
            <Text style={[shared.bodyMute, { marginTop: 3 }]}>Wipe the save and start a fresh plant.</Text>
          </View>
          <Button
            label="Reset"
            tone="danger"
            small
            onPress={() =>
              Alert.alert('Reset the run?', 'This wipes your save and starts a fresh shift.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: onReset },
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
  officeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingsEntry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 10 },
  settingsEntryTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  settingsEntryAction: { color: colors.teal, fontSize: 13, fontWeight: '900' },
  settingsRowClean: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  settingsDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  settingTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 2 },
  officeWorker: { backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: 12 },
  workerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  workerName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  empty: { color: colors.textMute, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  note: { color: colors.textMute, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  forecast: { maxWidth: 170, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.panelSoft },
  forecastLabel: { fontSize: 14, fontWeight: '900' },
  forecastNote: { color: colors.textMute, fontSize: 10, fontWeight: '700', marginTop: 1 },
  sectionLabel: { color: colors.textMute, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: 'rgba(34,84,99,0.07)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, paddingVertical: 7 },
  planSku: { color: colors.text, fontSize: 12, fontWeight: '900' },
  planCrew: { color: colors.cyan, fontSize: 12, fontWeight: '900' },
  riskBand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, borderWidth: 1, borderRadius: radius.sm, backgroundColor: colors.panelSoft, paddingHorizontal: 10, paddingVertical: 8 },
  riskLabel: { minWidth: 62, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  riskCopy: { flex: 1, color: colors.textMute, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  shortWarn: { color: colors.amber, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  coverageOk: { color: colors.green, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  advanceNote: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 6 },
});
