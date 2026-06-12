import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme';

// Tutorial highlight: wraps a target and pulses a cyan ring around it so the
// next button to press is unmistakable. Opacity-only animation (UI thread).
export function Spotlight({
  active, radius = 14, style, children,
}: {
  active: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const o = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.3, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, o]);

  return (
    <Animated.View style={[{ position: 'relative' }, style]}>
      {children}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: radius + 3,
            borderWidth: 3,
            borderColor: colors.cyan,
            opacity: o,
          }}
        />
      )}
    </Animated.View>
  );
}
