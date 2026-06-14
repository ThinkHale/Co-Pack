import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import {
  GameState,
  totalThroughput, fillRate, FILL_RATE_TARGET, totalPayroll, facilityOverhead,
  shoutoutReady, moraleBreakdown, hasUnlock, nightShiftActive,
} from '@copack/engine';
import { colors, radius } from '../theme';
import { formatCurrency, pct, shiftLabel, shiftClock, shiftProgress, averageMorale } from '../format';
import { useGameStore, SpeedSetting } from '../store/useGameStore';
import { Bar } from './common';

const LOGO = require('../../assets/brand-logo.png');

export function Hud({ state }: { state: GameState }) {
  const {
    paused, speed, soundOn,
    setSpeed, togglePause, toggleSound, shoutout, toggleOvertime, toggleAutoShift,
  } = useGameStore();
  const awaitingStaffing = state.awaitingStaffing;
  const workers = Object.values(state.workers);
  const throughput = totalThroughput(state);
  const fill = fillRate(state);
  const fillLow = fill < FILL_RATE_TARGET;
  const breakdown = moraleBreakdown(state.workers);
  const staffed = Object.values(state.lines).reduce((s, l) => s + l.stations.filter((st) => st.assignedWorkerId).length, 0);
  const total = Object.values(state.lines).reduce((s, l) => s + l.stations.length, 0);
  const canShout = shoutoutReady(state) && !paused;
  const payroll = totalPayroll(state);
  const overhead = facilityOverhead(state);

  const status = awaitingStaffing ? 'Standup' : paused ? 'Paused' : 'Live';
  const statusColor = awaitingStaffing ? colors.gold : paused ? colors.textMute : colors.green;
  const overtimeUnlocked = hasUnlock(state, 'overtime');

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.brandBlock}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.shiftLabel}>{shiftLabel(state.tick)}</Text>
            <Text style={styles.clock}>{shiftClock(state.tick)} left</Text>
          </View>
        </View>
        <Pressable
          onPress={togglePause}
          style={({ pressed }) => [
            styles.runButton,
            { backgroundColor: paused ? colors.teal : colors.surface },
            pressed && { opacity: 0.82 },
          ]}
        >
          <Text style={[styles.runButtonText, { color: paused ? colors.bgDeep : colors.ink }]}>
            {paused ? 'Resume' : 'Pause'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <StatusChip label={status} color={statusColor} strong />
        {nightShiftActive(state) && <StatusChip label="Nights" color={colors.purple} />}
        <StatusChip label={`Cash ${formatCurrency(state.cash)}`} color={colors.green} />
        <StatusChip label={`Fill ${pct(fill)}`} color={fillLow ? colors.red : colors.green} />
        <StatusChip label={`${throughput.toFixed(1)}/m`} color={colors.cyan} />
      </View>

      <View style={styles.progressBlock}>
        <Bar value={shiftProgress(state.tick)} color={colors.teal} height={5} track="rgba(244,241,234,0.12)" />
        <View style={styles.metricRow}>
          <Text style={styles.metric}>Crew {staffed}/{total}</Text>
          <Text style={styles.metric}>Morale {pct(averageMorale(workers))} · {breakdown.thriving} up / {breakdown.struggling} down</Text>
          <Text style={styles.metric}>Payroll {formatCurrency(payroll)} + overhead {formatCurrency(overhead)}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controls}>
        <View style={styles.speedToggle}>
          {([1, 4, 16] as SpeedSetting[]).map((s) => {
            const active = speed === s && !paused;
            return (
              <Pressable key={s} onPress={() => setSpeed(s)} style={[styles.speedBtn, active && styles.speedBtnActive]}>
                <Text style={[styles.speedText, active && { color: colors.bgDeep }]}>{s}x</Text>
              </Pressable>
            );
          })}
        </View>
        <CtrlBtn label={canShout ? 'Shout-out' : 'Cooling'} onPress={shoutout} disabled={!canShout} />
        <CtrlBtn
          label={state.overtime ? 'OT on' : overtimeUnlocked ? 'Overtime' : 'OT locked'}
          onPress={toggleOvertime}
          active={state.overtime}
          disabled={!overtimeUnlocked}
        />
        {state.hasSupervisor && (
          <CtrlBtn label={state.autoShift ? 'Auto on' : 'Auto'} onPress={toggleAutoShift} active={state.autoShift} />
        )}
        <CtrlBtn label={soundOn ? 'Sound' : 'Muted'} onPress={toggleSound} />
      </ScrollView>
    </View>
  );
}

function StatusChip({ label, color, strong }: { label: string; color: string; strong?: boolean }) {
  return (
    <View style={[styles.statusChip, strong && { backgroundColor: color, borderColor: color }]}>
      <Text style={[styles.statusChipText, { color: strong ? colors.bgDeep : color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CtrlBtn({
  label, onPress, active, disabled,
}: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ctrl,
        active && styles.ctrlActive,
        disabled && { opacity: 0.38 },
        pressed && !disabled && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.ctrlText, active && { color: colors.bgDeep }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 12,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 5,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  logo: { width: 34, height: 34 },
  shiftLabel: { color: colors.text, fontSize: 15, fontWeight: '900' },
  clock: { color: colors.gold, fontSize: 12, fontWeight: '900', marginTop: 1 },
  runButton: {
    minWidth: 88,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  runButtonText: { fontSize: 14, fontWeight: '900' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(244,241,234,0.05)',
  },
  statusChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.25 },
  progressBlock: { marginTop: 10, gap: 7 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { color: colors.textMute, fontSize: 10, fontWeight: '800' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingRight: 4 },
  speedToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgDeep,
    borderRadius: radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 5 },
  speedBtnActive: { backgroundColor: colors.gold },
  speedText: { color: colors.textDim, fontSize: 11, fontWeight: '900' },
  ctrl: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelHi,
    paddingHorizontal: 10,
  },
  ctrlActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  ctrlText: { color: colors.text, fontSize: 11, fontWeight: '900' },
});
