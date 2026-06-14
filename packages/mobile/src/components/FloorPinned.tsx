import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameState, dayCondition } from '@copack/engine';
import { colors, radius } from '../theme';
import { useGameStore } from '../store/useGameStore';
import { Button } from './common';
import { Spotlight } from './Spotlight';
import { TutorialCard, TUTORIAL_STEPS } from './Overlays';

// Pinned floor header: the tutorial coaching card and the compact standup bar
// live ABOVE the scroll view, so they never slide off screen while the player
// scrolls down to staff a line. Replaces the old full-height morning banner.
export function FloorPinned({ state }: { state: GameState }) {
  const tutorialActive = useGameStore((s) => s.tutorialActive);
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const { advanceTutorial, finishTutorial, autoFillCrew, repeatStaffing, startShift } = useGameStore();

  const tutTarget = tutorialActive ? TUTORIAL_STEPS[tutorialStep]?.target : undefined;
  const awaitingStaffing = state.awaitingStaffing && !state.gameOver;
  if (!tutorialActive && !awaitingStaffing) return null;

  return (
    <View style={styles.wrap}>
      {tutorialActive && (
        <TutorialCard
          step={tutorialStep}
          onNext={() => (tutorialStep >= TUTORIAL_STEPS.length - 1 ? finishTutorial() : advanceTutorial())}
          onSkip={finishTutorial}
        />
      )}
      {awaitingStaffing && (
        <StandupBar
          state={state}
          highlightStart={tutTarget === 'start'}
          onAutoFill={autoFillCrew}
          onRepeat={repeatStaffing}
          onStart={startShift}
        />
      )}
    </View>
  );
}

function StandupBar({
  state, highlightStart, onAutoFill, onRepeat, onStart,
}: {
  state: GameState;
  highlightStart: boolean;
  onAutoFill: () => void;
  onRepeat: () => void;
  onStart: () => void;
}) {
  const condition = dayCondition(state.day);
  const workers = Object.values(state.workers);
  const present = workers.filter((w) => w.presentThisShift);
  const absent = workers.length - present.length;
  const totalStations = Object.values(state.lines).reduce((n, l) => n + l.stations.length, 0);
  const staffed = Object.values(state.lines).reduce(
    (n, l) => n + l.stations.filter((s) => s.assignedWorkerId).length, 0);
  const assigned = new Set(Object.values(state.lines).flatMap((line) => [
    ...(line.stations.map((s) => s.assignedWorkerId).filter(Boolean) as string[]),
    ...(line.supportWorkerIds ?? []),
  ]));
  const unplaced = present.filter((w) => !assigned.has(w.id)).length;
  const accent = condition.tone === 'bad' ? colors.red : condition.tone === 'good' ? colors.green : colors.purple;
  const canRepeat = Object.entries(state.previousAssignments).some(([, id]) => state.workers[id]?.presentThisShift);

  return (
    <View style={[styles.bar, { borderColor: accent }]}>
      <View style={styles.facts}>
        <Text style={styles.day}>Standup</Text>
        <Text style={styles.stat}>
          <Text style={{ color: colors.green, fontWeight: '900' }}>{present.length}</Text>/{workers.length} in
          {absent > 0 ? <Text style={{ color: colors.pinkSoft }}> · {absent} out</Text> : null}
        </Text>
        <Text style={styles.stat}>
          <Text style={{ color: staffed >= totalStations ? colors.text : colors.amber, fontWeight: '900' }}>{staffed}/{totalStations}</Text> staffed
        </Text>
        <View style={[styles.condition, { borderColor: accent }]}>
          <Text style={[styles.conditionText, { color: accent }]} numberOfLines={1}>{condition.label}</Text>
        </View>
      </View>
      {unplaced > 0 && <Text style={styles.warn}>{unplaced} idle crew will be dismissed at start</Text>}
      <View style={styles.actions}>
        {state.hasSupervisor && <Button label="Auto-fill" tone="muted" small onPress={onAutoFill} style={{ flex: 1 }} />}
        <Button label="Repeat" tone="muted" small disabled={!canRepeat} onPress={onRepeat} style={{ flex: 1 }} />
        <Spotlight active={highlightStart} radius={radius.sm} style={{ flex: 1.3 }}>
          <Button label="Start shift ▸" tone="primary" small onPress={onStart} style={{ width: '100%' }} />
        </Spotlight>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, gap: 8, backgroundColor: colors.bg },
  bar: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.panel,
    gap: 7,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  day: { color: colors.text, fontSize: 13, fontWeight: '900' },
  stat: { color: colors.textDim, fontSize: 12, fontWeight: '800' },
  condition: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(8,13,24,0.45)' },
  conditionText: { fontSize: 10, fontWeight: '900', maxWidth: 120 },
  warn: { color: colors.amber, fontSize: 11, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 6 },
});
