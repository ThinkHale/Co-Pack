import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Worker } from '@copack/engine';
import { colors, radius } from '../theme';
import { formatCurrency, profileForWorker } from '../format';
import { CharacterAvatar } from './Avatar';
import { HIRE_COST } from '../store/useGameStore';

export function CrewDock({
  workers, benchWorkers, selectedWorkerId, cash, onHire, onSelectWorker, bottomInset,
}: {
  workers: Worker[];
  benchWorkers: Worker[];
  selectedWorkerId: string | null;
  cash: number;
  onHire: () => void;
  onSelectWorker: (id: string) => void;
  bottomInset: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const benchIds = new Set(benchWorkers.map((w) => w.id));
  const presentBench = benchWorkers.filter((w) => w.presentThisShift);
  const roster = expanded ? workers : presentBench;
  const idleCount = presentBench.length;

  return (
    <View style={[styles.dock, expanded && styles.dockExpanded, { bottom: bottomInset + 70 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.dockHead}>
          <Text style={styles.dockLabel}>{expanded ? 'Full crew' : 'Bench'}</Text>
          <Text style={styles.dockCount}>{expanded ? workers.length : idleCount}</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.stripFrame}
          contentContainerStyle={styles.strip}
        >
          {roster.length === 0 ? (
            <Text style={styles.empty}>{expanded ? 'No crew yet' : 'No idle crew'}</Text>
          ) : roster.map((worker) => {
            const profile = profileForWorker(worker);
            const selected = selectedWorkerId === worker.id;
            const onBench = benchIds.has(worker.id);
            return (
              <Pressable
                key={worker.id}
                onPress={() => onSelectWorker(worker.id)}
                style={({ pressed }) => [
                  styles.chip,
                  expanded && styles.chipExpanded,
                  selected && { borderColor: profile.palette, backgroundColor: colors.surfaceAlt },
                  !worker.presentThisShift && { opacity: 0.45 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <CharacterAvatar worker={worker} size="sm" />
                <View style={styles.chipCopy}>
                  <Text style={styles.chipName} numberOfLines={1}>{profile.firstName}</Text>
                  <Text style={[styles.chipMeta, { color: onBench ? colors.amber : colors.green }]} numberOfLines={1}>
                    {!worker.presentThisShift ? 'out' : onBench ? 'idle' : 'placed'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={onHire}
          disabled={cash < HIRE_COST}
          style={({ pressed }) => [styles.hireButton, cash < HIRE_COST && { opacity: 0.4 }, pressed && cash >= HIRE_COST && { opacity: 0.82 }]}
        >
          <Text style={styles.hireText}>Hire {formatCurrency(HIRE_COST)}</Text>
        </Pressable>
      </View>
      {expanded && (
        <Text style={styles.expandedNote} numberOfLines={1}>
          Idle present crew are dismissed unpaid when the shift starts.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
    gap: 7,
    backgroundColor: 'rgba(32,57,64,0.97)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 7,
    zIndex: 30,
  },
  dockExpanded: { paddingBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dockHead: { alignItems: 'center', justifyContent: 'center', width: 50, minHeight: 42 },
  dockLabel: { color: colors.textMute, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  dockCount: { color: colors.text, fontSize: 15, fontWeight: '900' },
  hireButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.teal,
    paddingHorizontal: 9,
  },
  hireText: { color: colors.bgDeep, fontSize: 11, fontWeight: '900' },
  stripFrame: { flex: 1 },
  strip: { flexDirection: 'row', gap: 6, paddingRight: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 86,
    backgroundColor: 'rgba(248,245,223,0.07)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  chipExpanded: { minWidth: 108 },
  chipCopy: { flex: 1, minWidth: 0 },
  chipName: { color: colors.text, fontSize: 11, fontWeight: '900', maxWidth: 58 },
  chipMeta: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  empty: { color: colors.textMute, fontSize: 12, fontWeight: '800', paddingVertical: 13 },
  expandedNote: { color: colors.gold, fontSize: 10, fontWeight: '900', paddingHorizontal: 52 },
});
