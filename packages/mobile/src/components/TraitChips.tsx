import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Worker, workerTraits } from '@copack/engine';
import { colors, radius } from '../theme';

const TONE: Record<'good' | 'bad' | 'mixed', { bg: string; fg: string }> = {
  good: { bg: 'rgba(114,239,143,0.16)', fg: colors.green },
  bad: { bg: 'rgba(255,70,102,0.16)', fg: colors.pinkSoft },
  mixed: { bg: 'rgba(255,230,108,0.16)', fg: colors.gold },
};

// Tone-colored chips for a worker's traits — where the soul shows.
export function TraitChips({ worker, style }: { worker: Worker; style?: StyleProp<ViewStyle> }) {
  const traits = workerTraits(worker);
  if (traits.length === 0) return null;
  return (
    <View style={[styles.row, style]}>
      {traits.map((t) => {
        const tone = TONE[t.tone as 'good' | 'bad' | 'mixed'] ?? TONE.mixed;
        return (
          <View key={t.id} style={[styles.chip, { backgroundColor: tone.bg }]}>
            <Text style={[styles.label, { color: tone.fg }]}>{t.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
