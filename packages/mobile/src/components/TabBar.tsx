import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import type { TabKey } from '../store/useGameStore';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'floor', label: 'Floor', icon: '▚' },
  { key: 'orders', label: 'Orders', icon: '◫' },
  { key: 'staffing', label: 'Staffing', icon: '☰' },
  { key: 'office', label: 'Office', icon: '▦' },
  { key: 'corporate', label: 'Corp', icon: '★' },
];

export function TabBar({
  tab, onTab, fillBelowTarget, challengeActive, bottomInset,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  fillBelowTarget: boolean;
  challengeActive: boolean;
  bottomInset: number;
}) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {TABS.map((t) => {
        const active = tab === t.key;
        const dot = (t.key === 'floor' && challengeActive) || (t.key === 'staffing' && fillBelowTarget);
        return (
          <Pressable key={t.key} onPress={() => onTab(t.key)} style={styles.tab}>
            <Text style={[styles.icon, { color: active ? colors.cyan : colors.textMute }]}>{t.icon}</Text>
            <Text style={[styles.label, { color: active ? colors.text : colors.textMute }]}>{t.label}</Text>
            {dot && <View style={styles.dot} />}
            {active && <View style={styles.activeBar} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bgDeep,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  icon: { fontSize: 18, fontWeight: '900' },
  label: { fontSize: 11, fontWeight: '800' },
  dot: { position: 'absolute', top: 0, right: '28%', width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
  activeBar: { position: 'absolute', top: -8, height: 3, width: 28, borderRadius: 2, backgroundColor: colors.cyan },
});
