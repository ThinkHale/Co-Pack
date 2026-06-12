import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StatusBar, AppState, StyleSheet, Image, Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameEvent, fillRate, FILL_RATE_TARGET } from '@copack/engine';
import { colors } from './src/theme';
import { useGameStore } from './src/store/useGameStore';
import { playSound, unlockAudio } from './src/lib/sound';
import { toastForEvent } from './src/events';
import { Hud } from './src/components/Hud';
import { TabBar } from './src/components/TabBar';
import { Toasts, ToastItem } from './src/components/Toasts';
import { SplashScreen, OfflineModal, GameOverOverlay, PlacingBar, AdModal, AD_INTERVAL_DAYS, WelcomeModal } from './src/components/Overlays';
import { ConfettiBurst } from './src/components/Confetti';
import { CrewDock } from './src/components/CrewDock';
import { FloorScreen } from './src/screens/FloorScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { StaffingScreen } from './src/screens/StaffingScreen';
import { OfficeScreen } from './src/screens/OfficeScreen';

const LOGO = require('./assets/brand-logo.png');

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Boot />
    </SafeAreaProvider>
  );
}

// Hydrate the save (async on native), then gate the splash exactly like the web:
// returning players skip straight in; first-run sees the splash + Start button.
function Boot() {
  const hydrate = useGameStore((s) => s.hydrate);
  const hydrated = useGameStore((s) => s.hydrated);
  const bootedFromSave = useGameStore((s) => s.bootedFromSave);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { if (hydrated && bootedFromSave) setSplashDone(true); }, [hydrated, bootedFromSave]);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <Image source={LOGO} style={{ width: 120, height: 120 }} resizeMode="contain" />
        <Text style={styles.loadingText}>Loading the floor…</Text>
      </View>
    );
  }
  if (!splashDone) {
    return <SplashScreen onStart={() => { unlockAudio(); setSplashDone(true); }} />;
  }
  return <Game />;
}

function Game() {
  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const tab = useGameStore((s) => s.tab);
  const paused = useGameStore((s) => s.paused);
  const speed = useGameStore((s) => s.speed);
  const soundOn = useGameStore((s) => s.soundOn);
  const offlineSummary = useGameStore((s) => s.offlineSummary);
  const selectedWorkerId = useGameStore((s) => s.selectedWorkerId);
  const adsOn = useGameStore((s) => s.adsOn);
  const adFree = useGameStore((s) => s.adFree);
  const lastAdDay = useGameStore((s) => s.lastAdDay);
  const adVisible = useGameStore((s) => s.adVisible);
  const tutorialDone = useGameStore((s) => s.tutorialDone);
  const tutorialActive = useGameStore((s) => s.tutorialActive);
  const { runTick, save, setTab, dismissOffline, selectWorker, reset, showAd, dismissAd, removeAds, startTutorial, finishTutorial } = useGameStore();

  const insets = useSafeAreaInsets();
  const gameOver = state.gameOver;
  const awaitingStaffing = state.awaitingStaffing;
  const selectedWorker = selectedWorkerId ? state.workers[selectedWorkerId] : null;

  // Sim clock — holds when paused, during the morning standup, after shutdown,
  // or while an interstitial is on screen.
  useEffect(() => {
    if (paused || gameOver || awaitingStaffing || adVisible) return;
    const id = setInterval(runTick, 1000 / speed);
    return () => clearInterval(id);
  }, [runTick, paused, speed, gameOver, awaitingStaffing, adVisible]);

  // Interstitial cadence: one ad every AD_INTERVAL_DAYS shifts, never during
  // the tutorial. showAd/dismissAd is the seam a real ad SDK plugs into.
  useEffect(() => {
    if (adFree || !adsOn || adVisible || gameOver || !tutorialDone) return;
    if (state.day > 0 && state.day - lastAdDay >= AD_INTERVAL_DAYS) showAd();
  }, [state.day, adFree, adsOn, adVisible, gameOver, tutorialDone, lastAdDay, showAd]);

  // Autosave every few seconds + whenever the app is backgrounded.
  useEffect(() => {
    const id = setInterval(save, 3000);
    const sub = AppState.addEventListener('change', (next) => { if (next !== 'active') save(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [save]);

  // Toasts + haptics: react to the latest batch of engine events exactly once.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastEventsRef = useRef<GameEvent[] | null>(null);
  useEffect(() => {
    if (events === lastEventsRef.current || !events || events.length === 0) return;
    lastEventsRef.current = events;
    const fresh: ToastItem[] = [];
    for (const e of events) {
      const spec = toastForEvent(e);
      if (!spec) continue;
      if (soundOn && spec.sound) playSound(spec.sound);
      fresh.push({ id: `${e.tick}-${e.type}-${fresh.length}-${toasts.length}`, ...spec });
    }
    if (fresh.length) setToasts((prev) => [...prev, ...fresh].slice(-4));
  }, [events, soundOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confetti on the golden moments (goals, new clients, upgrades).
  const [confetti, setConfetti] = useState(0);
  useEffect(() => {
    if (!events || events.length === 0) return;
    if (events.some((e) => ['OBJECTIVE_COMPLETED', 'CLIENT_UNLOCKED', 'FEATURE_UNLOCKED', 'SUPERVISOR_HIRED'].includes(e.type))) {
      setConfetti((c) => c + 1);
    }
  }, [events]);

  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const fillLow = fillRate(state) < FILL_RATE_TARGET;
  const showPlacing = !!selectedWorker && tab === 'floor';

  // The crew dock keeps the bench at your thumb while you scroll the lines.
  // Hidden while a worker is picked up (the PlacingBar takes that slot).
  const assignedIds = new Set(
    Object.values(state.lines).flatMap((l) => [
      ...(l.stations.map((s) => s.assignedWorkerId).filter(Boolean) as string[]),
      ...(l.supportWorkerIds ?? []),
    ])
  );
  const benchWorkers = Object.values(state.workers).filter((w) => !assignedIds.has(w.id));
  const showDock = tab === 'floor' && !showPlacing && !gameOver
    && benchWorkers.some((w) => w.presentThisShift);

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Hud state={state} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: showPlacing || showDock ? 150 : 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'floor' && <FloorScreen state={state} />}
        {tab === 'orders' && <OrdersScreen state={state} />}
        {tab === 'staffing' && <StaffingScreen state={state} />}
        {tab === 'office' && <OfficeScreen state={state} />}
      </ScrollView>

      <TabBar
        tab={tab}
        onTab={setTab}
        fillBelowTarget={fillLow}
        challengeActive={!!state.shiftChallenge}
        bottomInset={insets.bottom}
      />

      {showPlacing && selectedWorker && (
        <PlacingBar worker={selectedWorker} onCancel={() => selectWorker(null)} bottomInset={insets.bottom} />
      )}
      {showDock && (
        <CrewDock benchWorkers={benchWorkers} onSelectWorker={selectWorker} bottomInset={insets.bottom} />
      )}

      <Toasts toasts={toasts} onDone={removeToast} topInset={insets.top} />
      {confetti > 0 && <ConfettiBurst burst={confetti} />}
      {!tutorialDone && !tutorialActive && (
        <WelcomeModal
          onStart={finishTutorial}
          onTutorial={() => { setTab('floor'); startTutorial(); }}
        />
      )}
      {adVisible && <AdModal adFree={adFree} onDismiss={dismissAd} onRemoveAds={removeAds} />}
      {offlineSummary && <OfflineModal summary={offlineSummary} onClose={dismissOffline} />}
      {gameOver && <GameOverOverlay state={state} onRestart={reset} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 12, paddingTop: 8 },
  scroll: { paddingHorizontal: 12, paddingTop: 12 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: colors.textMute, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
