// Co-Pack mobile design tokens — ported from the web build's index.css palette so
// the two clients feel like one game. Dark "control room" look with neon accents.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#121827',
  bgDeep: '#0d1424',
  panel: '#172034',
  panelAlt: '#1b2740',
  panelHi: '#22304d',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  text: '#ffffff',
  textDim: '#cbd5e1',
  textMute: '#94a3b8',
  textFaint: '#64748b',

  green: '#72ef8f',
  cyan: '#68d8ff',
  teal: '#35d0ba',
  sky: '#7dd3fc',
  gold: '#ffe66c',
  amber: '#ffb02e',
  pink: '#ff5f7e',
  pinkSoft: '#ff7a9a',
  red: '#ff4666',
  purple: '#7c6cff',
} as const;

// Station identity — matches STATION_THEMES in the web App.
export const STATION_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };
export const STATION_THEMES: Record<string, { icon: string; color: string; note: string }> = {
  s1: { icon: 'IN', color: colors.teal, note: 'Feed' },
  s2: { icon: 'PK', color: colors.amber, note: 'Build' },
  s3: { icon: 'ST', color: colors.pink, note: 'Ship' },
};

// HUD stat tone → color, mirroring hud-stat-{tone}.
export const hudTone: Record<'green' | 'cyan' | 'pink' | 'gold' | 'red', string> = {
  green: colors.green,
  cyan: colors.cyan,
  pink: colors.pink,
  gold: colors.gold,
  red: colors.red,
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

// Shared building blocks reused across screens.
export const shared = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  eyebrow: {
    color: colors.textMute,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  h2: { color: colors.text, fontSize: 22, fontWeight: '900' },
  body: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  bodyMute: { color: colors.textMute, fontSize: 12, fontWeight: '700' },
  pillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
});
