import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { colors, radius, shared } from '../theme';

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[shared.panel, style]}>{children}</View>;
}

export function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[shared.eyebrow, color ? { color } : null]}>{children}</Text>;
}

export function Pill({
  children, color = colors.textMute, filled, style,
}: { children: React.ReactNode; color?: string; filled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        styles.pill,
        filled
          ? { backgroundColor: color }
          : { backgroundColor: 'rgba(34,84,99,0.07)', borderColor: color, borderWidth: 1 },
        style,
      ]}
    >
      <Text style={[shared.pillText, { color: filled ? colors.bgDeep : color }]}>{children}</Text>
    </View>
  );
}

// A horizontal progress rail (mini stat / order / objective bars).
export function Bar({
  value, color = colors.teal, height = 8, track = 'rgba(34,84,99,0.10)',
}: { value: number; color?: string; height?: number; track?: string }) {
  const w = Math.max(2, Math.min(100, value * 100));
  return (
    <View style={[styles.barTrack, { height, borderRadius: height, backgroundColor: track }]}>
      <View style={{ width: `${w}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export type ButtonTone = 'primary' | 'muted' | 'accent' | 'danger' | 'ghost';

export function Button({
  label, onPress, tone = 'muted', disabled, small, style,
}: {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle = BTN_TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        toneStyle.container,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
        style,
      ]}
    >
      <Text style={[styles.btnLabel, small && styles.btnLabelSmall, { color: toneStyle.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const BTN_TONES: Record<ButtonTone, { container: ViewStyle; text: string }> = {
  primary: { container: { backgroundColor: colors.teal, borderColor: colors.teal }, text: colors.bgDeep },
  accent: { container: { backgroundColor: colors.gold, borderColor: colors.gold }, text: colors.bgDeep },
  danger: { container: { backgroundColor: 'rgba(212,84,79,0.12)', borderColor: colors.red }, text: colors.red },
  muted: { container: { backgroundColor: colors.panelSoft, borderColor: colors.borderStrong }, text: colors.text },
  ghost: { container: { backgroundColor: 'transparent', borderColor: colors.border }, text: colors.textDim },
};

// Small labelled stat cell used in summaries / boards.
export function StatCell({
  label, value, tone, labelStyle,
}: { label: string; value: string; tone?: string; labelStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, labelStyle]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  barTrack: { width: '100%', overflow: 'hidden' },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  btnLabel: { fontSize: 13, fontWeight: '900' },
  btnLabelSmall: { fontSize: 12 },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,250,240,0.72)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statLabel: { color: colors.textMute, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 2 },
});
