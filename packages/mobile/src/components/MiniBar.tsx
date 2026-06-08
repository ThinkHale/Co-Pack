import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { pct } from '../format';
import { Bar } from './common';

// Labelled value bar (Mood / Trust), mirroring the web MiniBar.
export function MiniBar({ label, value, color = colors.teal }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{pct(value)}</Text>
      </View>
      <Bar value={value} color={color} height={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  label: { color: colors.textMute, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { color: colors.textDim, fontSize: 11, fontWeight: '900' },
});
