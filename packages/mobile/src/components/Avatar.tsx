import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Worker } from '@copack/engine';
import { profileForWorker, AvatarShape } from '../format';

const SIZES = { xs: 24, sm: 34, md: 48 } as const;

// A tiny stylized "person" — head (skin) + hair cap + eyes + smile + uniform body.
// The web build draws this in CSS; here it's plain Views colored from the engine's
// structured appearance so the two clients render the same crew.
export function CharacterAvatar({ worker, size = 'md' }: { worker: Worker; size?: keyof typeof SIZES }) {
  const p = profileForWorker(worker);
  const d = SIZES[size];
  const head = d * 0.62;
  const headRadius = shapeRadius(p.shape, head);

  return (
    <View style={[styles.wrap, { width: d, height: d }]}>
      {/* body / uniform */}
      <View style={[styles.body, { width: d, height: d * 0.5, backgroundColor: p.uniform, borderTopLeftRadius: d * 0.3, borderTopRightRadius: d * 0.3 }]} />
      {/* head */}
      <View style={[styles.head, { width: head, height: head, borderRadius: headRadius, backgroundColor: p.skin }]}>
        {/* hair cap */}
        <View style={[styles.hair, { width: head, height: head * 0.4, backgroundColor: p.hair, borderTopLeftRadius: headRadius, borderTopRightRadius: headRadius }]} />
        {size !== 'xs' && (
          <>
            <View style={[styles.eye, { left: head * 0.26, top: head * 0.5 }]} />
            <View style={[styles.eye, { right: head * 0.26, top: head * 0.5 }]} />
            <View style={[styles.smile, { width: head * 0.34, top: head * 0.68 }]} />
          </>
        )}
      </View>
    </View>
  );
}

function shapeRadius(shape: AvatarShape, head: number): number {
  switch (shape) {
    case 'square': return head * 0.22;
    case 'diamond': return head * 0.32;
    case 'wide': return head * 0.5;
    default: return head * 0.5; // round
  }
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
  body: { position: 'absolute', bottom: 0 },
  head: { alignItems: 'center', overflow: 'hidden', marginBottom: 2 },
  hair: { position: 'absolute', top: 0 },
  eye: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(7,19,27,0.85)' },
  smile: {
    position: 'absolute',
    height: 4,
    borderBottomWidth: 2,
    borderColor: 'rgba(7,19,27,0.7)',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
});
