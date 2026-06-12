import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Worker } from '@copack/engine';
import { colors, radius } from '../theme';
import { profileForWorker } from '../format';
import { CharacterAvatar } from './Avatar';

// The staffing fix for big rosters: a crew strip docked above the tab bar, so
// the bench is always at your thumb while you scroll the lines. Tap a chip,
// then tap a station — no more bottom-to-top round trips per worker.
export function CrewDock({
  benchWorkers, onSelectWorker, bottomInset,
}: {
  benchWorkers: Worker[];
  onSelectWorker: (id: string) => void;
  bottomInset: number;
}) {
  const present = benchWorkers.filter((w) => w.presentThisShift);
  if (present.length === 0) return null;
  return (
    <View style={[styles.dock, { bottom: bottomInset + 70 }]}>
      <View style={styles.dockHead}>
        <Text style={styles.dockLabel}>Bench</Text>
        <Text style={styles.dockCount}>{present.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {present.map((worker) => {
          const profile = profileForWorker(worker);
          return (
            <Pressable
              key={worker.id}
              onPress={() => onSelectWorker(worker.id)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}
            >
              <CharacterAvatar worker={worker} size="xs" />
              <Text style={styles.chipName} numberOfLines={1}>{profile.firstName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(13,20,36,0.97)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    zIndex: 30,
  },
  dockHead: { alignItems: 'center', width: 40 },
  dockLabel: { color: colors.textMute, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  dockCount: { color: colors.text, fontSize: 14, fontWeight: '900' },
  strip: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    alignItems: 'center',
    gap: 2,
    minWidth: 56,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  chipName: { color: colors.text, fontSize: 10, fontWeight: '900', maxWidth: 64 },
});
