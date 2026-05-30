import { Worker } from '../types';
import { seededRandom } from '../utils/random';

const WORKER_NAMES = [
  'Maria S.', 'David L.', 'Keisha M.', 'Carlos R.',
  'Tamika J.', 'Roy B.',   'Priya N.', 'Luis A.',
  'Darnell W.', 'Sandra C.', 'Miguel F.', 'Tasha B.',
  'Andre J.', 'Yolanda T.', 'Felix M.', 'Renee W.',
];

// Station IDs for the 3-station line
const STATION_IDS = ['s1', 's2', 's3'];

export function generateWorker(id: string, seed: number): Worker {
  const rng = (offset: number) => seededRandom(seed * 9301 + offset * 49297 + 1);
  const nameIdx = Math.floor(rng(0) * WORKER_NAMES.length);
  const reliability = 0.60 + rng(1) * 0.25;  // 0.60 – 0.85
  return {
    id,
    name: WORKER_NAMES[nameIdx],
    tenureDays: 0,
    reliability,
    morale: 0.50 + rng(2) * 0.35,        // 0.50 – 0.85
    // Wage scales with how dependable they are — better hires cost more to keep.
    wage: Math.round(70 + reliability * 50), // ~$100–$112/shift
    skills: [{
      stationId: STATION_IDS[Math.floor(rng(3) * STATION_IDS.length)],
      proficiency: 0.45 + rng(4) * 0.30, // 0.45 – 0.75
    }],
    presentThisShift: true,
  };
}
