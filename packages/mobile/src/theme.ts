// Co-Pack mobile design tokens. The mobile app leads the visual system now:
// grounded shop-floor operations with just enough game energy to stay alive.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#101417',
  bgDeep: '#090c0e',
  surface: '#f4f1ea',
  surfaceAlt: '#e7e1d6',
  paper: '#fffaf0',
  panel: '#1c2328',
  panelAlt: '#252d33',
  panelHi: '#313b42',
  steel: '#43515a',
  rail: '#2a3339',
  border: 'rgba(244,241,234,0.12)',
  borderStrong: 'rgba(244,241,234,0.22)',
  inkBorder: 'rgba(16,20,23,0.14)',

  text: '#fffaf0',
  textDim: '#d8d2c7',
  textMute: '#a9a296',
  textFaint: '#756f66',
  ink: '#171b1e',
  inkDim: '#475159',
  inkMute: '#70777b',

  green: '#5abf72',
  cyan: '#76b7c7',
  teal: '#2f9e8f',
  sky: '#81aebd',
  gold: '#e1be62',
  amber: '#d8892c',
  pink: '#b35c70',
  pinkSoft: '#d17a88',
  red: '#d14b4b',
  purple: '#8c7bb8',
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

export const radius = { sm: 6, md: 9, lg: 12, xl: 18, pill: 999 } as const;

// Shared building blocks reused across screens.
export const shared = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  eyebrow: {
    color: colors.gold,
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
