import { Worker } from '../types';
import { seededRandom } from '../utils/random';
import { TRAITS, TRAIT_IDS, Trait } from './traits';
import { generateAppearance } from './appearance';

// A spread of first/last names so the agency sends recognizable, distinct people.
const FIRST_NAMES = [
  'Maria', 'David', 'Keisha', 'Carlos', 'Tamika', 'Roy', 'Priya', 'Luis',
  'Darnell', 'Sandra', 'Miguel', 'Tasha', 'Andre', 'Yolanda', 'Felix', 'Renee',
  'Jamal', 'Nina', 'Hector', 'Dawn', 'Omar', 'Bianca', 'Trevor', 'Lakeisha',
  'Sergei', 'Mei', 'Diego', 'Fatima', 'Wyatt', 'Rosa', 'Kwame', 'Ingrid',
];
const LAST_INITIALS = ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W'];

// Station IDs for the 3-station line
const STATION_IDS = ['s1', 's2', 's3'];

const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));

/**
 * The character generator. Produces a distinct person: a name, a structured
 * appearance, and 3–5 non-conflicting traits whose effects are folded into the
 * worker's base stats. This is where workers get their soul.
 *
 * `skillRequest` biases which station a new hire is trained on — when you tell
 * the agency you're short on Pack, more Pack-trained people come through.
 */
export function generateWorker(id: string, seed: number, skillRequest: string[] = []): Worker {
  const rng = (offset: number) => seededRandom(seed * 9301 + offset * 49297 + 1);

  const first = FIRST_NAMES[Math.floor(rng(0) * FIRST_NAMES.length)];
  const lastInit = LAST_INITIALS[Math.floor(rng(10) * LAST_INITIALS.length)];
  const name = `${first} ${lastInit}.`;

  const traits = pickTraits(seed, 3 + Math.floor(rng(11) * 3)); // 3–5 traits
  const hasSenior = traits.includes('senior_citizen');

  // Base rolls, then folded with trait deltas.
  let reliability = 0.55 + rng(1) * 0.28;     // 0.55 – 0.83
  let disposition = 0.45 + rng(6) * 0.40;     // 0.45 – 0.85
  let proficiency = 0.45 + rng(4) * 0.30;     // 0.45 – 0.75
  let wage = 70 + reliability * 50;

  for (const tid of traits) {
    const t: Trait = TRAITS[tid];
    if (t.reliabilityDelta) reliability += t.reliabilityDelta;
    if (t.dispositionDelta) disposition += t.dispositionDelta;
    if (t.proficiencyDelta) proficiency += t.proficiencyDelta;
    if (t.wageMult) wage *= t.wageMult;
  }

  reliability = clamp01(reliability);
  disposition = clamp01(disposition);
  proficiency = clamp01(proficiency);

  // 60% of the time, honor the requested skill mix if one is set.
  const pool = skillRequest.length > 0 && rng(5) < 0.6 ? skillRequest : STATION_IDS;
  const stationId = pool[Math.floor(rng(3) * pool.length)];

  return {
    id,
    name,
    appearance: generateAppearance(seed, hasSenior),
    traits,
    tenureDays: 0,
    reliability,
    morale: clamp01(disposition - 0.05 + rng(2) * 0.15), // starts near their set-point
    disposition,
    wage: Math.round(wage),
    permanent: false,
    isLead: false,
    skills: [{ stationId, proficiency }],
    presentThisShift: true,
  };
}

// Weighted, conflict-aware trait selection.
function pickTraits(seed: number, count: number): string[] {
  const chosen: string[] = [];
  const blocked = new Set<string>();
  let available = [...TRAIT_IDS];

  for (let i = 0; i < count && available.length > 0; i++) {
    const pool = available.filter(id => !blocked.has(id) && !chosen.includes(id));
    if (pool.length === 0) break;

    const totalWeight = pool.reduce((s, id) => s + TRAITS[id].weight, 0);
    let roll = seededRandom(seed * 131 + i * 7919 + 5) * totalWeight;
    let pick = pool[0];
    for (const id of pool) {
      roll -= TRAITS[id].weight;
      if (roll <= 0) { pick = id; break; }
    }

    chosen.push(pick);
    for (const c of TRAITS[pick].conflicts ?? []) blocked.add(c);
    available = available.filter(id => id !== pick);
  }

  return chosen;
}
