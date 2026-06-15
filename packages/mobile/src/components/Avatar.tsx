import React, { useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { Worker } from '@copack/engine';
import { profileForWorker } from '../format';
import { colors } from '../theme';

const SIZES = { xs: 26, sm: 38, md: 54, lg: 74 } as const;
type Presentation = Worker['appearance']['presentation'];

// Curated portrait bank. Names, traits, skills, and appearance tokens can vary
// procedurally; the portrait itself is selected from the matching presentation pool.
const PORTRAITS: { source: ImageSourcePropType; presentation: Presentation }[] = [
  { source: require('../../assets/workers/worker-portrait-01.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-02.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-03.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-04.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-05.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-06.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-07.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-08.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-09.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-10.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-11.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-12.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-13.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-14.png'), presentation: 'feminine' },
  { source: require('../../assets/workers/worker-portrait-15.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-16.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-17.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-18.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-19.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-20.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-21.png'), presentation: 'masculine' },
  { source: require('../../assets/workers/worker-portrait-22.png'), presentation: 'masculine' },
];
const PORTRAIT_POOLS: Record<Presentation, number[]> = {
  feminine: PORTRAITS.flatMap((portrait, index) => portrait.presentation === 'feminine' ? [index] : []),
  masculine: PORTRAITS.flatMap((portrait, index) => portrait.presentation === 'masculine' ? [index] : []),
  neutral: PORTRAITS.map((_, index) => index),
};
const FEMININE_FIRST_NAMES = new Set([
  'Diana', 'Maria', 'Keisha', 'Tamika', 'Priya', 'Sandra', 'Tasha', 'Yolanda',
  'Renee', 'Nina', 'Dawn', 'Bianca', 'Lakeisha', 'Mei', 'Fatima', 'Rosa', 'Ingrid',
]);
const STARTER_PORTRAITS: Record<string, number> = {
  w1: 4, // Marcus
  w2: 1, // Diana
  w3: 5, // Jerome
};

// The engine owns appearance tokens. Mobile maps those stable tokens to a small
// generated portrait pack, then uses the worker's uniform accent as the frame.
export function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: keyof typeof SIZES }) {
  const p = profileForWorker(worker);
  const d = SIZES[size];
  const portrait = PORTRAITS[portraitIndex(worker)].source;
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
  const starterPortrait = STARTER_PORTRAITS[worker.id];
  if (starterPortrait != null) return starterPortrait;

  const presentation = worker.appearance.presentation ?? inferPresentation(worker);
  const key = `${worker.id}|${worker.name}|${presentation}`;

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return pickFromPool(PORTRAIT_POOLS[presentation], hash);
}

function pickFromPool(pool: number[], hash: number): number {
  return pool[hash % pool.length] ?? 0;
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
