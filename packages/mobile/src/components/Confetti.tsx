import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

const PIECE_COLORS = [colors.green, colors.cyan, colors.gold, colors.pinkSoft, colors.purple, colors.teal];

// A burst of falling confetti for the golden moments (goals, clients,
// upgrades). Opacity + transform only — runs on the UI thread. Remounts on a
// new `burst` key to replay; parent unmounts it after the show.
export function ConfettiBurst({ burst }: { burst: number }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 22 }).map((_, i) => (
        <Piece
          key={`${burst}-${i}`}
          x={20 + ((i * 89) % 92) / 100 * (width - 40)}
          fall={height + 40}
          delayMs={(i % 7) * 70}
          durationMs={1200 + ((i * 37) % 10) * 80}
          drift={(((i * 53) % 11) - 5) * 14}
          color={PIECE_COLORS[i % PIECE_COLORS.length]}
        />
      ))}
    </View>
  );
}

function Piece({ x, fall, delayMs, durationMs, drift, color }: {
  x: number; fall: number; delayMs: number; durationMs: number; drift: number; color: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      delay: delayMs,
      easing: Easing.bezier(0.25, 0.4, 0.6, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, durationMs, delayMs]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-30, fall] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View
      style={[
        styles.piece,
        { left: x, backgroundColor: color, opacity, transform: [{ translateY }, { translateX }, { rotate }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, width: 8, height: 12, borderRadius: 2 },
});
