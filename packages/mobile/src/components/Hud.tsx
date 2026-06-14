import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import {
  GameState, totalThroughput, totalPayroll, facilityOverhead,
  nightShiftActive, dayCondition,
} from '@copack/engine';
import { colors, radius } from '../theme';
import { formatCurrency, pct, shiftLabel, shiftClock, shiftProgress, averageMorale } from '../format';
import { useGameStore, SpeedSetting } from '../store/useGameStore';
import { Bar } from './common';

const LOGO = require('../../assets/brand-logo.png');

export function Hud({ state }: { state: GameState }) {
  const {
    paused, speed,
    setSpeed, togglePause,
  } = useGameStore();
  const awaitingStaffing = state.awaitingStaffing;
  const workers = Object.values(state.workers);
  const throughput = totalThroughput(state);
  const payroll = totalPayroll(state);
  const overhead = facilityOverhead(state);
  const condition = dayCondition(state.day);
  const conditionColor = condition.tone === 'bad' ? colors.red : condition.tone === 'good' ? colors.green : colors.cyan;

  const progress = shiftProgress(state.tick);
  const phase = awaitingStaffing
    ? 'Pre-Shift'
    : progress >= 0.995 || state.gameOver
      ? 'Shift Complete'
      : nightShiftActive(state) ? '2nd Shift' : '1st Shift';
  const phaseColor = awaitingStaffing ? colors.gold : state.gameOver ? colors.textMute : colors.green;
  const statusLabel = `${phase} · ${condition.label} · ${state.staffingHistory.length}d`;

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
        <View style={styles.timeControls}>
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
      </View>

      <View style={styles.statusRow}>
        <StatusChip label={statusLabel} color={phaseColor} strong grow />
        <StatusChip label={`Cash ${formatCurrency(state.cash)}`} color={colors.green} />
        <StatusChip label={`${throughput.toFixed(1)}/m`} color={conditionColor || colors.cyan} />
      </View>

      <View style={styles.progressBlock}>
        <Bar value={progress} color={colors.teal} height={5} track="rgba(34,84,99,0.16)" />
        <View style={styles.metricRow}>
          <Text style={styles.metric}>Morale {pct(averageMorale(workers))}</Text>
          <Text style={styles.metric}>Payroll {formatCurrency(payroll)} + overhead {formatCurrency(overhead)}</Text>
        </View>
      </View>
    </View>
  );
}

function StatusChip({ label, color, strong, grow }: { label: string; color: string; strong?: boolean; grow?: boolean }) {
  return (
    <View style={[styles.statusChip, grow && { flex: 1 }, strong && { backgroundColor: color, borderColor: color }]}>
      <Text style={[styles.statusChipText, { color: strong ? colors.bgDeep : color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 9,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  logo: { width: 28, height: 28 },
  shiftLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  clock: { color: colors.gold, fontSize: 11, fontWeight: '900', marginTop: 0 },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  runButton: {
    minWidth: 58,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
  },
  runButtonText: { fontSize: 12, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: colors.panelSoft,
  },
  statusChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.2 },
  progressBlock: { marginTop: 8, gap: 6 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metric: { color: colors.textMute, fontSize: 10, fontWeight: '800' },
  speedToggle: {
    flexDirection: 'row',
    backgroundColor: colors.panelHi,
    borderRadius: radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedBtn: { paddingHorizontal: 6, paddingVertical: 5, borderRadius: 5 },
  speedBtnActive: { backgroundColor: colors.gold },
  speedText: { color: colors.textDim, fontSize: 10, fontWeight: '900' },
});
