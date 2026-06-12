import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Modal, Pressable } from 'react-native';
import { GameState, OBJECTIVES, Worker, TICKS_PER_SHIFT } from '@copack/engine';
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
      <Text style={styles.splashTag}>Idle contract packaging simulation</Text>
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
            <SummaryStat label="Shifts run" value={(summary.ticks / TICKS_PER_SHIFT).toFixed(1)} good />
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

export const AD_INTERVAL_DAYS = 5;

// Interstitial placeholder: same shape a real ad SDK fills later (showAd →
// network ad → dismiss callback). Countdown + remove-ads flow match the
// production UX so the cadence can be playtested before AdMob/StoreKit land.
export function AdModal({ adFree, onDismiss, onRemoveAds }: { adFree: boolean; onDismiss: () => void; onRemoveAds: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(5);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Ad break</Eyebrow>
            <Text style={styles.adCounter}>{secondsLeft > 0 ? `${secondsLeft}s` : '✓'}</Text>
          </View>
          <View style={styles.adHouse}>
            <View style={styles.adBadge}><Text style={styles.adBadgeText}>AD</Text></View>
            <Text style={[shared.h2, { textAlign: 'center' }]}>Co-Pack runs on ads</Text>
            <Text style={[shared.bodyMute, { marginTop: 6, textAlign: 'center' }]}>
              A short break every {AD_INTERVAL_DAYS} shifts keeps the game free. (Placeholder — a
              network ad renders here in production builds.)
            </Text>
          </View>
          <Button
            label={secondsLeft > 0 ? `Continue in ${secondsLeft}…` : 'Continue ▸'}
            tone="primary"
            disabled={secondsLeft > 0}
            onPress={onDismiss}
            style={{ marginTop: 14 }}
          />
          {!adFree && (
            <Button
              label="Remove ads · $2.99 (simulated in test builds)"
              tone="muted"
              onPress={onRemoveAds}
              style={{ marginTop: 8 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// The first thing a new boss sees: the pitch, and the fork — dive in, or be
// walked through it. Frames the game's core tension up front.
export function WelcomeModal({ onStart, onTutorial }: { onStart: () => void; onTutorial: () => void }) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Eyebrow>Welcome to</Eyebrow>
          <Text style={styles.welcomeTitle}>Co-Pack</Text>
          <Text style={[shared.body, { marginTop: 8, lineHeight: 19 }]}>
            You run a contract packaging plant. Lines, automation, and capital are yours to
            command — but the input that decides whether you ship or sink is the one you
            control <Text style={{ color: colors.text, fontWeight: '900' }}>least</Text>: your workforce.
          </Text>
          <Text style={[shared.bodyMute, { marginTop: 8, lineHeight: 18 }]}>
            People no-show, burn out, quit, or shine. You can't make them clock in — only read
            them, pay them right, and keep a bench deep enough to absorb the morning you're three
            bodies short. Master the crew and the cartons take care of themselves.
          </Text>
          <Button label="Take the tutorial" tone="primary" onPress={onTutorial} style={{ marginTop: 18 }} />
          <Button label="Start now" tone="muted" onPress={onStart} style={{ marginTop: 8 }} />
          <Text style={styles.welcomeFoot}>The tutorial highlights each step — about a minute.</Text>
        </View>
      </View>
    </Modal>
  );
}

// Guided walkthrough card. `auto` steps advance when the player does the thing;
// the rest wait for "Got it". `target` lights up the next button to press.
export interface TutorialStep {
  title: string;
  text: string;
  target?: 'stations' | 'start' | 'goal';
  auto?: (ctx: { selected: string | null; staffed: number; shiftRunning: boolean }) => boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Staff your first station',
    text: 'Tap a glowing station. Your crew is on the bench — pick whoever fits best (the list sorts by skill for you).',
    target: 'stations',
    auto: (ctx) => ctx.staffed >= 1,
  },
  {
    title: 'Cover all three stations',
    text: 'A line only produces when Induct, Pack, AND Stage are all staffed. Fill the other two glowing slots.',
    target: 'stations',
    auto: (ctx) => ctx.staffed >= 3,
  },
  {
    title: 'Start the shift',
    text: 'Hit the glowing Start button. One shift = one 10-hour day — payroll and rent settle at the end of it.',
    target: 'start',
    auto: (ctx) => ctx.shiftRunning,
  },
  {
    title: 'Cartons are rolling',
    text: 'The belt under the stations shows your live rate. Your contract on the Orders tab pays per unit on delivery — beat the deadline or take a reputation hit.',
  },
  {
    title: 'Your people decide everything',
    text: 'Tomorrow some of this crew won’t show. You can’t force attendance — but you can pay well, lift morale, and build a deep bench. The glowing Next Goal always points at your best next move. Good luck, boss.',
    target: 'goal',
  },
];

export function TutorialCard({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const s = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)];
  return (
    <View style={styles.tutorial}>
      <Eyebrow color={colors.cyan}>Tutorial · {Math.min(step + 1, TUTORIAL_STEPS.length)}/{TUTORIAL_STEPS.length}</Eyebrow>
      <Text style={[shared.h2, { fontSize: 17, marginTop: 2 }]}>{s.title}</Text>
      <Text style={[shared.body, { marginTop: 4 }]}>{s.text}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <Pressable onPress={onSkip}><Text style={styles.tutorialSkip}>Skip tutorial</Text></Pressable>
        {!s.auto && (
          <Button label={step >= TUTORIAL_STEPS.length - 1 ? 'Let\u2019s go!' : 'Got it'} tone="primary" small onPress={onNext} />
        )}
      </View>
    </View>
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
  adCounter: { minWidth: 36, textAlign: 'center', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.1)', color: colors.textDim, fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  adHouse: { marginTop: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)', borderRadius: radius.md, padding: 18, backgroundColor: 'rgba(8,13,24,0.6)' },
  adBadge: { position: 'absolute', top: 6, left: 6, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: colors.gold },
  adBadgeText: { color: '#1b1405', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  tutorial: { borderWidth: 2, borderColor: 'rgba(104,216,255,0.55)', borderRadius: radius.lg, padding: 13, backgroundColor: colors.panel },
  tutorialSkip: { color: colors.sky, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  welcomeTitle: { color: colors.cyan, fontSize: 40, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  welcomeFoot: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});
