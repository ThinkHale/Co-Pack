import React from 'react';
import { View, Text, Image, StyleSheet, Modal } from 'react-native';
import { GameState, OBJECTIVES, Worker } from '@copack/engine';
import { colors, radius, shared } from '../theme';
import { formatCurrency, formatAwayTime, profileForWorker } from '../format';
import { Button, Eyebrow } from './common';
import { CharacterAvatar } from './Avatar';
import type { OfflineSummary } from '../lib/persistence';

const SPLASH = require('../../assets/brand-splash.png');

export function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.splash}>
      <Image source={SPLASH} style={styles.splashImg} resizeMode="contain" />
      <Text style={styles.splashTag}>Contract packaging simulation</Text>
      <Button label="Start Shift" tone="primary" onPress={onStart} style={{ paddingHorizontal: 44, paddingVertical: 14, marginTop: 24 }} />
    </View>
  );
}

function SummaryStat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={[styles.sumStat, { borderColor: good ? colors.green : colors.red }]}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, { color: good ? colors.green : colors.red }]}>{value}</Text>
    </View>
  );
}

export function OfflineModal({ summary, onClose }: { summary: OfflineSummary; onClose: () => void }) {
  const gain = summary.cashDelta;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Eyebrow>While you were away</Eyebrow>
          <Text style={[shared.h2, { fontSize: 26, marginTop: 4 }]}>{formatAwayTime(summary.awayMs)} off the clock</Text>
          <Text style={[shared.bodyMute, { marginTop: 4 }]}>
            The crew kept the belt moving{summary.capped ? ' — credited up to the offline cap' : ''}.
          </Text>
          <View style={styles.sumGrid}>
            <SummaryStat label="Net cash" value={`${gain >= 0 ? '+' : '-'}${formatCurrency(Math.abs(gain))}`} good={gain >= 0} />
            <SummaryStat label="Orders shipped" value={`${summary.ordersCompleted}`} good />
            {summary.ordersMissed > 0 && <SummaryStat label="Orders missed" value={`${summary.ordersMissed}`} good={false} />}
            {summary.quits > 0 && <SummaryStat label="Walked off" value={`${summary.quits}`} good={false} />}
            {summary.incidents > 0 && <SummaryStat label="Incidents" value={`${summary.incidents}`} good={false} />}
            {summary.objectives > 0 && <SummaryStat label="Goals cleared" value={`${summary.objectives}`} good />}
          </View>
          {summary.gameOver && <Text style={styles.gameOverNote}>The plant went under while you were gone.</Text>}
          <Button label="Back to the floor" tone="primary" onPress={onClose} style={{ marginTop: 18 }} />
        </View>
      </View>
    </Modal>
  );
}

export function GameOverOverlay({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Eyebrow color={colors.red}>Run over</Eyebrow>
          <Text style={[shared.h2, { fontSize: 30, marginTop: 4 }]}>Plant Shut Down</Text>
          <Text style={[shared.bodyMute, { marginTop: 6 }]}>
            You ran out of cash on Day {state.day + 1}. Payroll waits for no one — keep a cushion next run.
          </Text>
          <View style={styles.sumGrid}>
            <SummaryStat label="Orders shipped" value={`${state.completedOrders}`} good />
            <SummaryStat label="Orders missed" value={`${state.missedOrders}`} good={false} />
            <SummaryStat label="Goals cleared" value={`${state.completedObjectives.length}/${OBJECTIVES.length}`} good />
            <SummaryStat label="Days run" value={`${state.day + 1}`} good />
          </View>
          <Button label="Start a new plant" tone="primary" onPress={onRestart} style={{ marginTop: 18 }} />
        </View>
      </View>
    </Modal>
  );
}

// Sticky cue when a worker is picked — "tap a station to place".
export function PlacingBar({ worker, onCancel, bottomInset }: { worker: Worker; onCancel: () => void; bottomInset: number }) {
  const profile = profileForWorker(worker);
  return (
    <View style={[styles.placing, { bottom: bottomInset + 70 }]}>
      <CharacterAvatar worker={worker} size="sm" />
      <View style={{ flex: 1 }}>
        <Text style={styles.placingTitle}>Placing {profile.firstName}</Text>
        <Text style={styles.placingSub}>Tap a station or support slot to assign</Text>
      </View>
      <Button label="Cancel" tone="ghost" small onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  splashImg: { width: '88%', height: 320 },
  splashTag: { color: colors.textMute, fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginTop: 16, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(7,19,27,0.82)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, padding: 22 },
  sumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  sumStat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  sumLabel: { color: colors.textMute, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  sumValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  gameOverNote: { color: colors.pinkSoft, fontSize: 13, fontWeight: '900', marginTop: 12 },
  placing: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(13,20,36,0.98)', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cyan, padding: 12, zIndex: 40 },
  placingTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  placingSub: { color: colors.textMute, fontSize: 11, fontWeight: '700' },
});
