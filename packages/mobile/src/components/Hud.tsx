import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import {
  GameState,
  totalThroughput, fillRate, FILL_RATE_TARGET, totalPayroll, facilityOverhead,
  shoutoutReady, moraleBreakdown, hasUnlock,
} from '@copack/engine';
import { colors, radius, hudTone } from '../theme';
import { formatCurrency, pct, shiftLabel, shiftClock, shiftProgress, averageMorale } from '../format';
import { useGameStore, SpeedSetting } from '../store/useGameStore';
import { Bar } from './common';

const LOGO = require('../../assets/brand-logo.png');

export function Hud({ state }: { state: GameState }) {
  const { paused, speed, soundOn, setSpeed, togglePause, toggleSound, shoutout, toggleOvertime, toggleAutoShift } = useGameStore();
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

  const status = awaitingStaffing ? 'Morning standup' : paused ? 'Paused' : 'Live run';
  const statusColor = awaitingStaffing ? colors.gold : paused ? colors.textMute : colors.green;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <View style={styles.statusPills}>
          <StatusPill text={shiftLabel(state.tick)} color={colors.cyan} />
          <StatusPill text={`⏱ ${shiftClock(state.tick)}`} color={colors.sky} />
          <StatusPill text={status} color={statusColor} />
        </View>
      </View>

      <View style={{ marginTop: 8 }}>
        <Bar value={shiftProgress(state.tick)} color={colors.teal} height={5} />
      </View>

      <View style={styles.statsGrid}>
        <HudStat label="Cash" value={formatCurrency(state.cash)} tone="green" />
        <HudStat label={`Fill · ${pct(FILL_RATE_TARGET)}`} value={pct(fill)} tone={fillLow ? 'red' : 'green'} />
        <HudStat label="Output" value={`${throughput.toFixed(2)}/m`} tone="cyan" />
        <HudStat label="Crew" value={`${staffed}/${total}`} tone="pink" />
        <HudStat label={`Morale ${breakdown.thriving}↑${breakdown.struggling}↓`} value={pct(averageMorale(workers))} tone="gold" />
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
        <CtrlBtn label={paused ? 'Resume' : 'Pause'} onPress={togglePause} primary />
        <CtrlBtn label={canShout ? 'Shout-out' : 'Cooling'} onPress={shoutout} disabled={!canShout} />
        <CtrlBtn
          label={state.overtime ? 'OT ON' : hasUnlock(state, 'overtime') ? 'Overtime' : 'OT 🔒'}
          onPress={toggleOvertime}
          active={state.overtime}
          disabled={!hasUnlock(state, 'overtime')}
        />
        {state.hasSupervisor && (
          <CtrlBtn label={state.autoShift ? 'Auto ON' : 'Auto'} onPress={toggleAutoShift} active={state.autoShift} />
        )}
        <CtrlBtn label={soundOn ? '♪' : '✕'} onPress={toggleSound} />
      </ScrollView>

      <Text style={styles.payroll}>Payroll {formatCurrency(payroll)} + overhead {formatCurrency(overhead)} /shift</Text>
    </View>
  );
}

function StatusPill({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusPillText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// Dark glass tile with a per-stat accent — the number carries the color, the
// chrome stays quiet. Ported from the web HUD restyle.
function HudStat({ label, value, tone }: { label: string; value: string; tone: keyof typeof hudTone }) {
  const color = hudTone[tone];
  return (
    <View style={[styles.hudStat, { borderColor: `${color}4D` }]}>
      <Text style={styles.hudStatLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.hudStatValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={[styles.hudStatAccent, { backgroundColor: color }]} />
    </View>
  );
}

function CtrlBtn({ label, onPress, primary, active, disabled }: { label: string; onPress: () => void; primary?: boolean; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ctrl,
        primary && { backgroundColor: colors.teal, borderColor: colors.teal },
        active && { backgroundColor: colors.amber, borderColor: colors.amber },
        disabled && { opacity: 0.4 },
        pressed && !disabled && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.ctrlText, (primary || active) && { color: colors.bgDeep }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  logo: { width: 44, height: 44 },
  statusPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, justifyContent: 'flex-end' },
  statusPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.04)' },
  statusPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  statsGrid: { flexDirection: 'row', gap: 6, marginTop: 10 },
  hudStat: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 7,
    paddingBottom: 9,
    backgroundColor: 'rgba(10,15,27,0.72)',
    overflow: 'hidden',
  },
  hudStatLabel: { color: '#8fa3bd', fontSize: 8, fontWeight: '900', letterSpacing: 0.3, textTransform: 'uppercase' },
  hudStatValue: { fontSize: 15, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] },
  hudStatAccent: { position: 'absolute', left: 0, right: '14%', bottom: 0, height: 2.5, opacity: 0.85 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingRight: 4 },
  speedToggle: { flexDirection: 'row', backgroundColor: colors.bgDeep, borderRadius: radius.sm, padding: 2, borderWidth: 1, borderColor: colors.border },
  speedBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  speedBtnActive: { backgroundColor: colors.cyan },
  speedText: { color: colors.textDim, fontSize: 12, fontWeight: '900' },
  ctrl: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelHi },
  ctrlText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  payroll: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, textAlign: 'right' },
});
