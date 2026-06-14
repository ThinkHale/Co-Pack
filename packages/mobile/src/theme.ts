// Co-Pack mobile design tokens. The mobile app leads the visual system now:
// grounded shop-floor operations with just enough game energy to stay alive.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#e8efe1',
  bgDeep: '#102b3a',
  surface: '#fff8d9',
  surfaceAlt: '#dceccf',
  paper: '#fbf6df',
  panel: '#fffaf0',
  panelAlt: '#edf5e8',
  panelHi: '#d7e8df',
  panelSoft: '#f6efd1',
  steel: '#66838b',
  rail: '#b8cbc5',
  border: 'rgba(31,66,76,0.14)',
  borderStrong: 'rgba(31,66,76,0.24)',
  inkBorder: 'rgba(16,43,58,0.16)',

  text: '#152d36',
  textDim: '#385863',
  textMute: '#61777d',
  textFaint: '#8fa2a1',
  ink: '#122631',
  inkDim: '#3b5963',
  inkMute: '#6a7e82',

  green: '#5fae68',
  cyan: '#4a9fba',
  teal: '#22a58f',
  sky: '#83bdd1',
  gold: '#e4c64b',
  amber: '#d9912e',
  pink: '#bf6378',
  pinkSoft: '#d9818e',
  red: '#d4544f',
  purple: '#8474b4',
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
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
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
