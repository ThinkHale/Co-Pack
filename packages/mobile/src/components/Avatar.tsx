import React, { useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
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
const FEMININE_FIRST_NAMES = new Set([
  'Diana', 'Maria', 'Keisha', 'Tamika', 'Priya', 'Sandra', 'Tasha', 'Yolanda',
  'Renee', 'Nina', 'Dawn', 'Bianca', 'Lakeisha', 'Mei', 'Fatima', 'Rosa', 'Ingrid',
]);

// The engine owns appearance tokens. Mobile maps those stable tokens to a small
// generated portrait pack, then uses the worker's uniform accent as the frame.
export function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: keyof typeof SIZES }) {
  const p = profileForWorker(worker);
  const d = SIZES[size];
  const portrait = PORTRAITS[portraitIndex(worker)];
  const [imageFailed, setImageFailed] = useState(false);

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
      {imageFailed ? (
        <View style={[styles.fallback, { borderRadius: d * 0.22 }]}>
          <Text style={[styles.initials, { fontSize: Math.max(10, d * 0.34) }]}>{p.firstName.slice(0, 1)}</Text>
        </View>
      ) : (
        <Image
          source={portrait}
          style={[styles.image, { borderRadius: d * 0.22 }]}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      )}
    </View>
  );
}

function portraitIndex(worker: Worker): number {
  const appearance = worker.appearance;
  const presentation = appearance.presentation ?? inferPresentation(worker);
  const key = [
    worker.id,
    worker.name,
    presentation,
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

  const base = hash % PORTRAITS.length;
  if (presentation === 'feminine') return [1, 3][hash % 2];
  if (presentation === 'neutral') return [0, 1, 3, 5][hash % 4];
  if (appearance.ageBracket === 'senior') return [2, 5, 1][hash % 3];
  if (appearance.hairStyle === 'cap') return [5, 0, 2][hash % 3];
  if (appearance.hairStyle === 'bun' || appearance.hairStyle === 'long') return [3, 1, 5][hash % 3];
  if (appearance.facialHair !== 'none') return [4, base, 0, 2, 5][hash % 5];
  return base;
}

function inferPresentation(worker: Worker): Worker['appearance']['presentation'] {
  const first = worker.name.split(' ')[0];
  return FEMININE_FIRST_NAMES.has(first) ? 'feminine' : 'masculine';
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
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelSoft,
  },
  initials: { color: colors.ink, fontWeight: '900' },
  strip: { flexDirection: 'row', gap: 4 },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.inkBorder,
  },
});
