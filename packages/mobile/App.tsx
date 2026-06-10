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
import { SplashScreen, OfflineModal, GameOverOverlay, PlacingBar } from './src/components/Overlays';
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
  const { runTick, save, setTab, dismissOffline, selectWorker, reset } = useGameStore();

  const insets = useSafeAreaInsets();
  const gameOver = state.gameOver;
  const awaitingStaffing = state.awaitingStaffing;
  const selectedWorker = selectedWorkerId ? state.workers[selectedWorkerId] : null;

  // Sim clock — holds when paused, during the morning standup, or after shutdown.
  useEffect(() => {
    if (paused || gameOver || awaitingStaffing) return;
    const id = setInterval(runTick, 1000 / speed);
    return () => clearInterval(id);
  }, [runTick, paused, speed, gameOver, awaitingStaffing]);

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

  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const fillLow = fillRate(state) < FILL_RATE_TARGET;
  const showPlacing = !!selectedWorker && tab === 'floor';

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Hud state={state} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: showPlacing ? 150 : 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'floor' && <FloorScreen state={state} />}
        {tab === 'orders' && <OrdersScreen state={state} paused={paused || awaitingStaffing || gameOver} />}
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

      <Toasts toasts={toasts} onDone={removeToast} topInset={insets.top} />
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
