// --- Worker appearance ---
// A structured, engine-owned description of how a worker looks. The engine owns
// it (not the UI) so the SAME person renders identically on web today and React
// Native later — and so it can be persisted in a save. The UI maps these tokens
// to whatever art it draws.

import { seededRandom } from '../utils/random';

export interface Appearance {
  skinTone: string;     // palette token, see SKIN_TONES
  hairColor: string;
  hairStyle: 'short' | 'buzz' | 'curly' | 'long' | 'bun' | 'bald' | 'cap';
  facialHair: 'none' | 'stubble' | 'mustache' | 'beard';
  build: 'slim' | 'average' | 'broad';
  accent: string;       // uniform accent color
  ageBracket: 'young' | 'adult' | 'senior';
}

const SKIN_TONES = ['#f3c9a0', '#e0a878', '#c8895f', '#a96f4f', '#8f5f45', '#6f4733', '#5a3826'];
const HAIR_COLORS = ['#1b1b1f', '#2c2118', '#3f2a1a', '#5a3a22', '#8a6a3a', '#b8b0a4', '#d8d4cc'];
const ACCENTS = ['#35d0ba', '#ffb02e', '#ff5f7e', '#7c6cff', '#6ee56e', '#ff7a45', '#68d8ff'];
const HAIR_STYLES: Appearance['hairStyle'][] = ['short', 'buzz', 'curly', 'long', 'bun', 'bald', 'cap'];
const BUILDS: Appearance['build'][] = ['slim', 'average', 'average', 'broad'];

// `seniorHint` biases toward grey hair and a senior age bracket (e.g. for the
// Seasoned Veteran trait), so a worker's look matches who they are.
export function generateAppearance(seed: number, seniorHint = false): Appearance {
  const r = (o: number) => seededRandom(seed * 7331 + o * 104729 + 13);

  const ageRoll = r(7);
  const ageBracket: Appearance['ageBracket'] = seniorHint
    ? 'senior'
    : ageRoll < 0.18 ? 'young' : ageRoll > 0.86 ? 'senior' : 'adult';

  const senior = ageBracket === 'senior';
  const hairColor = senior && r(8) < 0.7
    ? HAIR_COLORS[5 + Math.floor(r(9) * 2)]            // greys for seniors
    : HAIR_COLORS[Math.floor(r(1) * (HAIR_COLORS.length - 2))];

  return {
    skinTone: SKIN_TONES[Math.floor(r(0) * SKIN_TONES.length)],
    hairColor,
    hairStyle: HAIR_STYLES[Math.floor(r(2) * HAIR_STYLES.length)],
    facialHair: pickFacialHair(r(3)),
    build: BUILDS[Math.floor(r(4) * BUILDS.length)],
    accent: ACCENTS[Math.floor(r(5) * ACCENTS.length)],
    ageBracket,
  };
}

function pickFacialHair(roll: number): Appearance['facialHair'] {
  if (roll < 0.55) return 'none';
  if (roll < 0.72) return 'stubble';
  if (roll < 0.86) return 'mustache';
  return 'beard';
}
