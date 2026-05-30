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

// `skillRequest` biases which station a new hire is trained on — when you tell the
// agency you're short on Pack, more Pack-trained people come through the door.
export function generateWorker(id: string, seed: number, skillRequest: string[] = []): Worker {
  const rng = (offset: number) => seededRandom(seed * 9301 + offset * 49297 + 1);
  const nameIdx = Math.floor(rng(0) * WORKER_NAMES.length);
  const reliability = 0.60 + rng(1) * 0.25;  // 0.60 – 0.85

  // 60% of the time, honor the requested skill mix if one is set.
  const pool = skillRequest.length > 0 && rng(5) < 0.6 ? skillRequest : STATION_IDS;
  const stationId = pool[Math.floor(rng(3) * pool.length)];

  return {
    id,
    name: WORKER_NAMES[nameIdx],
    tenureDays: 0,
    reliability,
    morale: 0.50 + rng(2) * 0.35,        // 0.50 – 0.85
    // Personal morale set-point: most people land mid, a few love it, a few never will.
    disposition: 0.45 + rng(6) * 0.40,   // 0.45 – 0.85
    // Wage scales with how dependable they are — better hires cost more to keep.
    wage: Math.round(70 + reliability * 50), // ~$100–$112/shift
    permanent: false, isLead: false,
    skills: [{
      stationId,
      proficiency: 0.45 + rng(4) * 0.30, // 0.45 – 0.75
    }],
    presentThisShift: true,
  };
}
