import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Worker } from '@copack/engine';
import { profileForWorker } from '../format';
import { colors } from '../theme';

const SIZES = { xs: 26, sm: 38, md: 54, lg: 74 } as const;

const PORTRAITS: ImageSourcePropType[] = [
  require('../../assets/workers/worker-portrait-01.png'),
  require('../../assets/workers/worker-portrait-02.png'),
  require('../../assets/workers/worker-portrait-03.png'),
  require('../../assets/workers/worker-portrait-04.png'),
  require('../../assets/workers/worker-portrait-05.png'),
  require('../../assets/workers/worker-portrait-06.png'),
];

// The engine owns appearance tokens. Mobile maps those stable tokens to a small
// generated portrait pack, then uses the worker's uniform accent as the frame.
export function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: keyof typeof SIZES }) {
  const p = profileForWorker(worker);
  const d = SIZES[size];
  const portrait = PORTRAITS[portraitIndex(worker)];

  return (
    <View
      style={[
        styles.frame,
        {
          width: d,
          height: d,
          borderRadius: d * 0.28,
          borderColor: p.palette,
          backgroundColor: p.palette,
        },
      ]}
    >
      <Image source={portrait} style={[styles.image, { borderRadius: d * 0.22 }]} resizeMode="cover" />
    </View>
  );
}

function portraitIndex(worker: Worker): number {
  const appearance = worker.appearance;
  const key = [
    worker.id,
    worker.name,
    appearance.skinTone,
    appearance.hairColor,
    appearance.hairStyle,
    appearance.facialHair,
    appearance.build,
    appearance.ageBracket,
  ].join('|');

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  if (appearance.ageBracket === 'senior') {
    return 2;
  }
  if (appearance.hairStyle === 'cap') {
    return 5;
  }
  if (appearance.facialHair === 'beard' || appearance.facialHair === 'mustache') {
    return 4;
  }
  if (appearance.hairStyle === 'bun' || appearance.hairStyle === 'long') {
    return 3;
  }
  return hash % PORTRAITS.length;
}

export function WorkerPortraitStrip({ worker }: { worker: Worker }) {
  const a = worker.appearance;
  return (
    <View style={styles.strip}>
      <View style={[styles.swatch, { backgroundColor: a.skinTone }]} />
      <View style={[styles.swatch, { backgroundColor: a.hairColor }]} />
      <View style={[styles.swatch, { backgroundColor: a.accent }]} />
    </View>
  );
}

export function appearanceSummary(worker: Worker): string {
  const a = worker.appearance;
  const age = a.ageBracket === 'senior' ? 'seasoned' : a.ageBracket;
  const hair = a.hairStyle === 'cap' ? 'cap' : `${a.hairStyle} hair`;
  const face = a.facialHair === 'none' ? '' : `, ${a.facialHair}`;
  return `${age} · ${hair}${face}`;
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 2,
    padding: 2,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  image: { width: '100%', height: '100%' },
  strip: { flexDirection: 'row', gap: 4 },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.inkBorder,
  },
});
