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
  return {
    id,
    name: WORKER_NAMES[nameIdx],
    tenureDays: 0,
    reliability: 0.60 + rng(1) * 0.25,  // 0.60 – 0.85
    morale: 0.50 + rng(2) * 0.35,        // 0.50 – 0.85
    skills: [{
      stationId: STATION_IDS[Math.floor(rng(3) * STATION_IDS.length)],
      proficiency: 0.45 + rng(4) * 0.30, // 0.45 – 0.75
    }],
    presentThisShift: true,
  };
}
