// Co-Pack mobile design tokens. The app now follows the logo/splash language:
// bright factory daylight, glossy blues, cardboard golds, safety orange, and
// navy outlines.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#eaf8ff',
  bgDeep: '#071827',
  surface: '#fff5d7',
  surfaceAlt: '#dff3ff',
  paper: '#fff9e8',
  panel: '#ffffff',
  panelAlt: '#f0f9ff',
  panelHi: '#bfe8ff',
  panelSoft: '#f7fcff',
  steel: '#55798d',
  rail: '#f2b232',
  border: 'rgba(7,24,39,0.13)',
  borderStrong: 'rgba(7,24,39,0.24)',
  inkBorder: 'rgba(7,24,39,0.18)',

  text: '#071827',
  textDim: '#284b5f',
  textMute: '#6d8592',
  textFaint: '#9db0b8',
  ink: '#071827',
  inkDim: '#284b5f',
  inkMute: '#6d8592',

  green: '#45b75a',
  cyan: '#20bdfa',
  blue: '#168bea',
  blueDeep: '#0b4e98',
  blueSoft: '#bfe8ff',
  teal: '#16b89b',
  sky: '#65cfff',
  gold: '#ffd200',
  amber: '#ff8a00',
  pink: '#ef5d78',
  pinkSoft: '#ff8fa2',
  red: '#e6463f',
  purple: '#8067d8',
} as const;

// Station identity — matches STATION_THEMES in the web App.
export const STATION_NAMES: Record<string, string> = { s1: 'Induct', s2: 'Pack', s3: 'Stage' };
export const STATION_THEMES: Record<string, { icon: string; color: string; note: string }> = {
  s1: { icon: 'IN', color: colors.sky, note: 'Feed' },
  s2: { icon: 'PK', color: colors.amber, note: 'Build' },
  s3: { icon: 'ST', color: colors.gold, note: 'Ship' },
};

// HUD stat tone → color, mirroring hud-stat-{tone}.
export const hudTone: Record<'green' | 'cyan' | 'pink' | 'gold' | 'red', string> = {
  green: colors.green,
  cyan: colors.cyan,
  pink: colors.pink,
  gold: colors.gold,
  red: colors.red,
};

export const radius = { sm: 6, md: 9, lg: 12, xl: 18, pill: 999 } as const;

// Shared building blocks reused across screens.
export const shared = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(22,139,234,0.24)',
    padding: 12,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  eyebrow: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  h2: { color: colors.text, fontSize: 20, fontWeight: '900' },
  body: { color: colors.textDim, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  bodyMute: { color: colors.textMute, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.35 },
});
