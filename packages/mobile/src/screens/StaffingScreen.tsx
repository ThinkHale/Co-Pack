import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import RawSlider from '@react-native-community/slider';

// React 19's stricter JSX types reject the slider's class typing; it works fine
// at runtime, so re-type it as a function component for the props we use.
const Slider = RawSlider as unknown as React.ComponentType<any>;
import {
  GameState,
  requiredPositions, coveredPositions, staffingFill, rollingStaffingFill, STAFFING_TARGET,
  effectiveWage, SHIFT_HOURS,
  PAY_RATE_MIN, PAY_RATE_MAX, PAY_RATE_STEP, PAY_RATE_DEFAULT,
  ATTENDANCE_PROGRAM_PER_HEAD, REFERRAL_PROGRAM_PER_HEAD, programsPerShiftCost,
  hasUnlock,
} from '@copack/engine';
import { colors, radius, shared, STATION_NAMES } from '../theme';
import { formatCurrency, pct } from '../format';
import { useGameStore } from '../store/useGameStore';
import { Panel, Eyebrow, Pill, Bar, StatCell } from '../components/common';

export function StaffingScreen({ state }: { state: GameState }) {
  const { setPayRate, toggleSkill, toggleProgram } = useGameStore();
  return (
    <View style={{ gap: 14 }}>
      <StaffingBoard state={state} />
      <PayPanel state={state} onSetPayRate={setPayRate} />
      <SkillPanel state={state} onToggleSkill={toggleSkill} />
      <ProgramsPanel state={state} onToggleProgram={toggleProgram} />
    </View>
  );
}

function StaffingBoard({ state }: { state: GameState }) {
  const required = requiredPositions(state);
  const covered = coveredPositions(state);
  const today = staffingFill(state);
  const rolling = rollingStaffingFill(state);
  const history = state.staffingHistory.slice(-14);
  const belowTarget = rolling < STAFFING_TARGET;

  return (
    <Panel>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Staffing board</Eyebrow>
          <Text style={shared.h2}>Labor Coverage</Text>
          <Text style={[shared.bodyMute, { marginTop: 4 }]}>
            Schedule calls for {required} position{required === 1 ? '' : 's'} today; covering {covered}. Keep rolling fill ≥ {pct(STAFFING_TARGET)}.
          </Text>
        </View>
        <View style={[styles.boardScore, { borderColor: belowTarget ? colors.red : colors.green }]}>
          <Text style={[styles.boardScoreVal, { color: belowTarget ? colors.red : colors.green }]}>{pct(rolling)}</Text>
          <Text style={styles.boardScoreLbl}>Rolling</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <StatCell label="Today" value={pct(today)} />
        <StatCell label="Covered" value={`${covered}/${required}`} />
        <StatCell label="Days logged" value={`${state.staffingHistory.length}`} />
      </View>
      {history.length > 0 && (
        <View style={styles.histRow}>
          {history.map((d) => (
            <View key={d.day} style={styles.histCol}>
              <View style={[styles.histBar, { height: `${Math.max(6, Math.round(d.fill * 100))}%`, backgroundColor: d.fill >= STAFFING_TARGET ? colors.green : colors.red }]} />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

function PayPanel({ state, onSetPayRate }: { state: GameState; onSetPayRate: (rate: number) => void }) {
  const rate = state.payPolicy.globalRate;
  const ratePct = Math.round(rate * 100);
  const rateLabel = rate > 1.02 ? 'Above market' : rate < 0.98 ? 'Below market' : 'At market';
  const rateColor = rate > 1.02 ? colors.green : rate < 0.98 ? colors.red : colors.textDim;
  const headcount = Object.keys(state.workers).length;
  const rosterPayroll = Object.values(state.workers).reduce((s, w) => s + effectiveWage(w, state.payPolicy), 0);

  return (
    <Panel>
      <Eyebrow>Pay rate</Eyebrow>
      <Text style={shared.h2}>Agency Pay</Text>
      <Text style={[shared.bodyMute, { marginTop: 4 }]}>
        The single biggest dial. Pay above market and the agency sends people who show up more and stick around — but payroll climbs.
      </Text>
      <View style={[styles.rowBetween, { marginTop: 12, alignItems: 'flex-end' }]}>
        <Text style={[styles.payReadout, { color: rateColor }]}>{ratePct}%</Text>
        <Text style={styles.rateLabel}>{rateLabel}</Text>
      </View>
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={PAY_RATE_MIN}
        maximumValue={PAY_RATE_MAX}
        step={PAY_RATE_STEP}
        value={rate}
        onValueChange={onSetPayRate}
        minimumTrackTintColor={colors.teal}
        maximumTrackTintColor={colors.panelHi}
        thumbTintColor={colors.cyan}
      />
      <View style={styles.rowBetween}>
        <Text style={styles.payEnd}>{Math.round(PAY_RATE_MIN * 100)}%</Text>
        <Pressable onPress={() => onSetPayRate(PAY_RATE_DEFAULT)}><Text style={styles.payReset}>Reset to market</Text></Pressable>
        <Text style={styles.payEnd}>{Math.round(PAY_RATE_MAX * 100)}%</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <StatCell label="Roster payroll" value={`${formatCurrency(rosterPayroll)}/sh`} />
        <StatCell label="Avg bill" value={`$${headcount > 0 ? (rosterPayroll / headcount / SHIFT_HOURS).toFixed(2) : '0.00'}/hr`} />
        <StatCell label="Headcount" value={`${headcount}`} />
      </View>
    </Panel>
  );
}

function SkillPanel({ state, onToggleSkill }: { state: GameState; onToggleSkill: (stationId: string) => void }) {
  return (
    <Panel>
      <Eyebrow>Skill request</Eyebrow>
      <Text style={shared.h2}>What to Send</Text>
      <Text style={[shared.bodyMute, { marginTop: 4 }]}>Flag the roles you're short on. New hires skew toward the skills you flag.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {['s1', 's2', 's3'].map((sid) => {
          const active = state.skillRequest.includes(sid);
          return (
            <Pressable
              key={sid}
              onPress={() => onToggleSkill(sid)}
              style={({ pressed }) => [styles.skill, active && { borderColor: colors.cyan, backgroundColor: 'rgba(104,216,255,0.12)' }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.skillName}>{STATION_NAMES[sid]}</Text>
              <Text style={{ color: active ? colors.cyan : colors.textMute, fontSize: 11, fontWeight: '800' }}>{active ? 'Prioritized' : 'Tap to flag'}</Text>
            </Pressable>
          );
        })}
      </View>
      {state.skillRequest.length === 0 && <Text style={[styles.note, { marginTop: 10 }]}>No request — agency sends a random mix.</Text>}
    </Panel>
  );
}

function ProgramsPanel({ state, onToggleProgram }: { state: GameState; onToggleProgram: (program: 'attendance' | 'referral') => void }) {
  const headcount = Object.keys(state.workers).length;
  const locked = !hasUnlock(state, 'programs');
  return (
    <Panel>
      <Eyebrow>Standing programs</Eyebrow>
      <Text style={shared.h2}>Ongoing Incentives</Text>
      <Text style={[shared.bodyMute, { marginTop: 4 }]}>Always-on programs billed per head every shift, running in the background.</Text>
      {locked && (
        <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          🔒 Requires the HR partner retainer — Office → Upgrades
        </Text>
      )}
      <View style={{ gap: 10, marginTop: 12, opacity: locked ? 0.5 : 1 }} pointerEvents={locked ? 'none' : 'auto'}>
        <ProgramToggle title="Attendance program" note={`Crew-wide turnout boost · ${formatCurrency(ATTENDANCE_PROGRAM_PER_HEAD)}/head/shift`} cost={ATTENDANCE_PROGRAM_PER_HEAD * headcount} active={state.programs.attendance} onToggle={() => onToggleProgram('attendance')} />
        <ProgramToggle title="Referral program" note={`New hires arrive referred · ${formatCurrency(REFERRAL_PROGRAM_PER_HEAD)}/head/shift`} cost={REFERRAL_PROGRAM_PER_HEAD * headcount} active={state.programs.referral} onToggle={() => onToggleProgram('referral')} />
      </View>
      <Text style={[styles.note, { marginTop: 10 }]}>Programs cost {formatCurrency(programsPerShiftCost(state))}/shift</Text>
    </Panel>
  );
}

function ProgramToggle({ title, note, cost, active, onToggle }: { title: string; note: string; cost: number; active: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.program, active && { borderColor: colors.green }, pressed && { opacity: 0.85 }]}>
      <View style={styles.rowBetween}>
        <Text style={styles.programTitle}>{title}</Text>
        <Pill color={active ? colors.green : colors.textMute} filled={active}>{active ? 'ON' : 'OFF'}</Pill>
      </View>
      <Text style={[shared.bodyMute, { marginTop: 3 }]}>{note}</Text>
      {active && <Text style={styles.programCost}>-{formatCurrency(cost)}/shift</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  boardScore: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  boardScoreVal: { fontSize: 22, fontWeight: '900' },
  boardScoreLbl: { color: colors.textMute, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  histRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 60, marginTop: 14 },
  histCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  histBar: { width: '100%', borderRadius: 3, minHeight: 4 },
  payReadout: { fontSize: 34, fontWeight: '900' },
  rateLabel: { color: colors.textDim, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  payEnd: { color: colors.textMute, fontSize: 11, fontWeight: '800' },
  payReset: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  skill: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  skillName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  note: { color: colors.textMute, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  program: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: 12 },
  programTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  programCost: { color: colors.gold, fontSize: 11, fontWeight: '900', marginTop: 4 },
});
