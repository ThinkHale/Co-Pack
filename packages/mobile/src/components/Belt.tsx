import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, Easing } from 'react-native';
import { colors } from '../theme';

// The takeaway belt under a line's stations — ported from the web rebuild.
// Each carton visibly progresses through the line's three stages as it travels:
// raw kraft carton under Induct, packed amber under Pack, sealed with teal tape
// under Stage. Speed and carton density track the line's actual units/min, and
// the outlet chip reads out what the lane ships. (The previous belt translated
// parcels by `100/parcels` POINTS — not track width — so they barely moved.)
export function ConveyorBelt({
  running, rate, height = 34, outlet, zones = 3,
}: { running: boolean; rate: number; height?: number; outlet?: string; zones?: number }) {
  const [width, setWidth] = useState(0);
  const boxCount = Math.max(3, Math.min(8, Math.round(2 + rate * 4)));
  const durationMs = Math.max(1600, 5200 - rate * 2600);

  return (
    <View
      style={[styles.track, { height }, !running && styles.trackStopped]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Stage-zone separators aligned with the stations above. */}
      <View style={styles.zones} pointerEvents="none">
        {Array.from({ length: zones }).map((_, i) => (
          <View key={i} style={[styles.zone, i === zones - 1 && { borderRightWidth: 0 }]} />
        ))}
      </View>

      {width > 0 && running && Array.from({ length: boxCount }).map((_, i) => (
        <Carton
          key={`${boxCount}-${durationMs}-${i}`}
          trackWidth={width}
          durationMs={durationMs}
          offsetMs={(durationMs / boxCount) * i}
        />
      ))}

      <View style={[styles.outlet, running && styles.outletOn]}>
        <Text style={[styles.outletText, running && { color: colors.teal }]} numberOfLines={1}>
          {outlet ?? (running ? `${rate.toFixed(1)}/min ▸` : '—')}
        </Text>
      </View>
    </View>
  );
}

// One carton on its journey. The look advances with the zones it passes:
// the amber "packed" face fades in over the Pack third, the teal tape over the
// Stage third. Opacity + transform only, so everything runs on the UI thread.
function Carton({ trackWidth, durationMs, offsetMs }: { trackWidth: number; durationMs: number; offsetMs: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    // RN has no negative animation delay, so stagger by starting the first
    // cycle mid-journey, then settle into a clean full loop.
    const frac = (offsetMs % durationMs) / durationMs;
    progress.setValue(frac);
    const first = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs * (1 - frac),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    first.start(({ finished }) => {
      if (!finished) return;
      progress.setValue(0);
      loop = Animated.loop(
        Animated.timing(progress, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true })
      );
      loop.start();
    });
    return () => {
      first.stop();
      loop?.stop();
    };
  }, [progress, durationMs, offsetMs, trackWidth]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-22, trackWidth + 6] });
  const opacity = progress.interpolate({ inputRange: [0, 0.05, 0.94, 1], outputRange: [0, 1, 1, 0] });
  const packedOpacity = progress.interpolate({ inputRange: [0, 0.32, 0.42, 1], outputRange: [0, 0, 1, 1] });
  const tapeOpacity = progress.interpolate({ inputRange: [0, 0.62, 0.72, 1], outputRange: [0, 0, 1, 1] });

  return (
    <Animated.View style={[styles.carton, { opacity, transform: [{ translateX }] }]} pointerEvents="none">
      <Animated.View style={[styles.cartonFace, { backgroundColor: '#ffb02e', opacity: packedOpacity }]} />
      <Animated.View style={[styles.tape, { opacity: tapeOpacity }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: '#18223a',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackStopped: { opacity: 0.6 },
  zones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  zone: { flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.07)', borderStyle: 'dashed' },
  carton: {
    position: 'absolute',
    top: '50%',
    left: 0,
    marginTop: -8,
    width: 19,
    height: 15,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(10,14,24,0.55)',
    backgroundColor: '#9a6a35', // raw kraft carton off the Induct feed
    overflow: 'hidden',
  },
  cartonFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tape: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 5,
    marginLeft: -2.5,
    backgroundColor: '#2fd5be',
  },
  outlet: {
    position: 'absolute',
    right: 5,
    alignSelf: 'center',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(8,13,24,0.85)',
  },
  outletOn: {
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.3)',
  },
  outletText: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
});
