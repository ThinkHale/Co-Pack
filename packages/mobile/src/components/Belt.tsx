import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { colors } from '../theme';

// A conveyor that visibly moves when the line is running. Faster lines → faster
// belt, matching the web build's belt-speed-scales-with-output juice. When stopped
// the parcels freeze.
export function ConveyorBelt({
  running, rate, height = 26, parcels = 7,
}: { running: boolean; rate: number; parcels?: number; height?: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.stopAnimation();
    if (!running) return;
    // beltDuration: 1.1s (fast) .. 3.4s (slow), shorter when output is higher.
    const durationMs = Math.max(1100, 3400 - rate * 900);
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [running, rate, anim]);

  return (
    <View style={[styles.track, { height }]}>
      <View style={styles.belt} />
      {Array.from({ length: parcels }).map((_, i) => {
        const base = (i / parcels) * 100;
        const translateX = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 100 / parcels],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.parcel,
              { left: `${base}%`, opacity: running ? 1 : 0.35, transform: [{ translateX: running ? translateX : 0 }] },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: 'rgba(8,13,24,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  belt: {
    position: 'absolute',
    left: 0, right: 0,
    height: 4,
    top: '50%',
    marginTop: -2,
    backgroundColor: 'rgba(125,211,252,0.18)',
  },
  parcel: {
    position: 'absolute',
    top: '50%',
    marginTop: -5,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.sky,
  },
});
