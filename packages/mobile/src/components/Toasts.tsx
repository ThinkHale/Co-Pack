import React, { useEffect, useRef } from 'react';
import { Animated, Text, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';
import { toastToneColor, ToastSpec } from '../events';

export interface ToastItem extends ToastSpec { id: string }

export function Toasts({ toasts, onDone, topInset }: { toasts: ToastItem[]; onDone: (id: string) => void; topInset: number }) {
  return (
    <View pointerEvents="box-none" style={[styles.stack, { top: topInset + 6 }]}>
      {toasts.map((t) => <Toast key={t.id} toast={t} onDone={onDone} />)}
    </View>
  );
}

function Toast({ toast, onDone }: { toast: ToastItem; onDone: (id: string) => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    const id = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone(toast.id));
    }, 3400);
    return () => clearTimeout(id);
  }, [toast.id, onDone, opacity, translateY]);

  const color = toastToneColor[toast.tone];
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable onPress={() => onDone(toast.id)} style={[styles.toast, { borderLeftColor: color }]}>
        <View style={[styles.tag, { backgroundColor: color }]}><Text style={styles.tagText}>{toast.tag}</Text></View>
        <Text style={styles.text} numberOfLines={2}>{toast.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 50 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(13,20,36,0.97)',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 4, paddingVertical: 10, paddingHorizontal: 12,
  },
  tag: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, minWidth: 44, alignItems: 'center' },
  tagText: { color: colors.bgDeep, fontSize: 10, fontWeight: '900' },
  text: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
});
