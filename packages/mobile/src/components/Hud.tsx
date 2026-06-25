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
  const dayCount = state.staffingHistory.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.brandBlock}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.shiftLabel}>{shiftLabel(state.tick)}</Text>
            <View style={styles.phaseLine}>
              <View style={[styles.phaseDot, { backgroundColor: phaseColor }]} />
              <Text style={styles.clock}>{phase} · {shiftClock(state.tick)} left</Text>
            </View>
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
              { backgroundColor: paused ? colors.amber : colors.surface },
              pressed && { opacity: 0.82 },
            ]}
          >
            <Text style={[styles.runButtonText, { color: colors.ink }]}>
              {paused ? 'Resume' : 'Pause'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.commandRow}>
        <CommandStat label="Cash" value={formatCurrency(state.cash)} color={colors.green} />
        <CommandStat label="Output" value={`${throughput.toFixed(1)}/m`} color={conditionColor || colors.blue} />
        <CommandStat label="Floor" value={condition.label} color={conditionColor || colors.blue} grow />
      </View>

      <View style={styles.progressBlock}>
        <Bar value={progress} color={colors.teal} height={5} track="rgba(34,84,99,0.16)" />
        <View style={styles.metricRow}>
          <Text style={styles.metric}>Morale {pct(averageMorale(workers))}</Text>
          <Text style={styles.metric}>Day {dayCount} · Burn {formatCurrency(payroll + overhead)}</Text>
        </View>
      </View>
    </View>
  );
}

function CommandStat({ label, value, color, grow }: { label: string; value: string; color: string; grow?: boolean }) {
  return (
    <View style={[styles.commandStat, grow && { flex: 1 }]}>
      <Text style={styles.commandLabel}>{label}</Text>
      <Text style={[styles.commandValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderTopWidth: 4,
    borderColor: 'rgba(22,139,234,0.26)',
    borderTopColor: colors.gold,
    padding: 10,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  logo: { width: 28, height: 28 },
  shiftLabel: { color: colors.text, fontSize: 13, fontWeight: '900' },
  phaseLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  phaseDot: { width: 6, height: 6, borderRadius: 3 },
  clock: { color: colors.blueDeep, fontSize: 11, fontWeight: '900', marginTop: 0 },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  runButton: {
    minWidth: 58,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(7,24,39,0.13)',
  },
  runButtonText: { fontSize: 12, fontWeight: '900' },
  commandRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7, marginTop: 9 },
  commandStat: {
    minWidth: 74,
    borderWidth: 1.5,
    borderColor: 'rgba(22,139,234,0.18)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.panelAlt,
  },
  commandLabel: { color: colors.textMute, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  commandValue: { fontSize: 14, fontWeight: '900', marginTop: 1 },
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
