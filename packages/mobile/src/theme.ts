// Co-Pack mobile design tokens. The mobile app leads the visual system now:
// grounded shop-floor operations with just enough game energy to stay alive.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#182c32',
  bgDeep: '#0f1b20',
  surface: '#edf1d8',
  surfaceAlt: '#dbe8cf',
  paper: '#f8f5df',
  panel: '#203940',
  panelAlt: '#29484f',
  panelHi: '#365a61',
  panelSoft: '#eef3df',
  steel: '#55717a',
  rail: '#385b63',
  border: 'rgba(244,241,234,0.12)',
  borderStrong: 'rgba(244,241,234,0.22)',
  inkBorder: 'rgba(16,20,23,0.14)',

  text: '#fbf8e7',
  textDim: '#dce7d8',
  textMute: '#aebfb8',
  textFaint: '#78908b',
  ink: '#17252a',
  inkDim: '#40575d',
  inkMute: '#667a7d',

  green: '#73b76f',
  cyan: '#78b9c8',
  teal: '#33a48f',
  sky: '#89c0cc',
  gold: '#e0c863',
  amber: '#d99a36',
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
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 12,
    shadowColor: colors.bgDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 2,
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
