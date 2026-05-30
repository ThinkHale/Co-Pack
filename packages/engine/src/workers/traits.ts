// --- Character traits ---
// Traits are what give a worker soul. Each one is declarative data: a tone, a
// rarity weight, conflict rules, a one-time nudge to base stats at generation,
// and a set of runtime effects the simulation reads through the aggregation
// helpers at the bottom of this file. Add a trait here and it Just Works — the
// generator picks it up by weight and the systems read its effects.

import { Worker } from '../types';

export type TraitTone = 'good' | 'bad' | 'mixed';

export interface Trait {
  id: string;
  label: string;
  blurb: string;
  tone: TraitTone;
  weight: number;           // relative likelihood of being rolled
  conflicts?: string[];     // trait ids that can't co-exist with this one

  // One-time nudges applied to base stats when the worker is generated:
  dispositionDelta?: number;
  reliabilityDelta?: number;
  proficiencyDelta?: number;
  wageMult?: number;

  // Runtime effects, read by the simulation each tick/shift:
  productivityMult?: number;     // this worker's own output multiplier
  attendanceMod?: number;        // added to this worker's attendance probability
  retentionMult?: number;        // multiplies this worker's quit probability (<1 = stickier)
  lineProductivityMult?: number; // applied to the whole line when present & assigned
  lineMoraleDelta?: number;      // per-shift morale delta to everyone on their line
  incidentRisk?: number;         // per-shift chance this worker triggers an incident
  incidentResist?: number;       // reduces the incident risk of their whole line
}

export const TRAITS: Record<string, Trait> = {
  hard_worker: {
    id: 'hard_worker', label: 'Hard Worker', tone: 'good', weight: 10,
    blurb: 'Naturally more productive — puts their head down and moves.',
    conflicts: ['senior_citizen', 'slacker'],
    productivityMult: 1.18,
  },
  slacker: {
    id: 'slacker', label: 'Coasts', tone: 'bad', weight: 7,
    blurb: 'Does the minimum. Output runs below the crew.',
    conflicts: ['hard_worker', 'go_getter'],
    productivityMult: 0.85,
  },
  go_getter: {
    id: 'go_getter', label: 'Go-Getter', tone: 'good', weight: 6,
    blurb: 'Hungry to prove themselves. Fast and eager.',
    conflicts: ['slacker', 'senior_citizen'],
    productivityMult: 1.12, dispositionDelta: 0.05,
  },
  bossy: {
    id: 'bossy', label: 'Bossy', tone: 'mixed', weight: 7,
    blurb: 'Drives the pace up but grates on the people around them.',
    conflicts: ['easygoing'],
    productivityMult: 1.12, lineMoraleDelta: -0.02,
  },
  joker: {
    id: 'joker', label: 'Joker', tone: 'mixed', weight: 8,
    blurb: 'Keeps the line laughing — morale up, focus down.',
    conflicts: ['serious'],
    lineMoraleDelta: 0.03, lineProductivityMult: 0.95,
  },
  serious: {
    id: 'serious', label: 'All Business', tone: 'good', weight: 5,
    blurb: 'Heads-down focus that keeps the line on task.',
    conflicts: ['joker'],
    lineProductivityMult: 1.04,
  },
  mentor: {
    id: 'mentor', label: 'Mentor', tone: 'good', weight: 4,
    blurb: 'Lifts everyone around them — steadies the whole line.',
    lineMoraleDelta: 0.025, lineProductivityMult: 1.03,
  },
  perfect_attendance: {
    id: 'perfect_attendance', label: 'Perfect Attendance', tone: 'good', weight: 6,
    blurb: 'Always shows. You can build a schedule around them.',
    conflicts: ['bad_attendance', 'sickness_prone', 'flaky'],
    attendanceMod: 0.14, reliabilityDelta: 0.1,
  },
  bad_attendance: {
    id: 'bad_attendance', label: 'Spotty Attendance', tone: 'bad', weight: 8,
    blurb: 'Hard to count on — call-outs come without warning.',
    conflicts: ['perfect_attendance', 'early_bird'],
    attendanceMod: -0.14, reliabilityDelta: -0.08,
  },
  sickness_prone: {
    id: 'sickness_prone', label: 'Sickness Prone', tone: 'bad', weight: 6,
    blurb: 'Catches everything going around. Misses days in clusters.',
    conflicts: ['perfect_attendance'],
    attendanceMod: -0.10,
  },
  early_bird: {
    id: 'early_bird', label: 'Early Bird', tone: 'good', weight: 6,
    blurb: 'First one in the door. Reliable starts.',
    conflicts: ['bad_attendance'],
    attendanceMod: 0.06,
  },
  flaky: {
    id: 'flaky', label: 'Flaky', tone: 'bad', weight: 6,
    blurb: 'Here today, gone tomorrow — and quick to walk.',
    conflicts: ['perfect_attendance', 'loyal'],
    attendanceMod: -0.06, retentionMult: 1.5,
  },
  loyal: {
    id: 'loyal', label: 'Loyal', tone: 'good', weight: 7,
    blurb: 'Sticks around through the rough weeks.',
    conflicts: ['job_hopper', 'flaky'],
    retentionMult: 0.45,
  },
  job_hopper: {
    id: 'job_hopper', label: 'Job Hopper', tone: 'bad', weight: 6,
    blurb: 'Always has one foot out the door for the next thing.',
    conflicts: ['loyal'],
    retentionMult: 1.8,
  },
  optimist: {
    id: 'optimist', label: 'Optimist', tone: 'good', weight: 7,
    blurb: 'Bounces back fast. Hard to keep down.',
    conflicts: ['pessimist'],
    dispositionDelta: 0.14,
  },
  pessimist: {
    id: 'pessimist', label: 'Pessimist', tone: 'bad', weight: 6,
    blurb: 'Glass half empty — and it spreads a little.',
    conflicts: ['optimist'],
    dispositionDelta: -0.12, lineMoraleDelta: -0.015,
  },
  easygoing: {
    id: 'easygoing', label: 'Easygoing', tone: 'good', weight: 6,
    blurb: 'Rolls with the chaos. A calming presence.',
    conflicts: ['bossy'],
    dispositionDelta: 0.06, lineMoraleDelta: 0.015,
  },
  senior_citizen: {
    id: 'senior_citizen', label: 'Seasoned Veteran', tone: 'mixed', weight: 5,
    blurb: 'Slower hands, but steady, happy, and rarely walks.',
    conflicts: ['hard_worker', 'go_getter'],
    productivityMult: 0.85, dispositionDelta: 0.12, reliabilityDelta: 0.06,
    retentionMult: 0.7,
  },
  background_check: {
    id: 'background_check', label: 'Checkered Past', tone: 'mixed', weight: 5,
    blurb: 'Strong worker with a record — carries some risk on the floor.',
    productivityMult: 1.1, incidentRisk: 0.05,
  },
  clumsy: {
    id: 'clumsy', label: 'Clumsy', tone: 'bad', weight: 5,
    blurb: 'Good heart, two left feet. Things happen around them.',
    incidentRisk: 0.035,
  },
  safety_first: {
    id: 'safety_first', label: 'Safety First', tone: 'good', weight: 5,
    blurb: 'Watches the whole line. Incidents drop when they are on.',
    incidentResist: 0.06,
  },
  quick_hands: {
    id: 'quick_hands', label: 'Quick Hands', tone: 'good', weight: 6,
    blurb: 'Trained up fast — starts sharper at the station.',
    proficiencyDelta: 0.12,
  },
  green: {
    id: 'green', label: 'Green', tone: 'bad', weight: 6,
    blurb: 'New to the work. Slow to start, but room to grow.',
    proficiencyDelta: -0.12, productivityMult: 0.95,
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);

export function getTrait(id: string): Trait | undefined {
  return TRAITS[id];
}

export function workerTraits(worker: Worker): Trait[] {
  return worker.traits.map(getTrait).filter((t): t is Trait => !!t);
}

// --- Aggregation helpers the simulation reads ---

export function workerProductivityMult(worker: Worker): number {
  return workerTraits(worker).reduce((m, t) => m * (t.productivityMult ?? 1), 1);
}

export function workerAttendanceMod(worker: Worker): number {
  return workerTraits(worker).reduce((s, t) => s + (t.attendanceMod ?? 0), 0);
}

export function workerRetentionMult(worker: Worker): number {
  return workerTraits(worker).reduce((m, t) => m * (t.retentionMult ?? 1), 1);
}

export function workerIncidentRisk(worker: Worker): number {
  return workerTraits(worker).reduce((s, t) => s + (t.incidentRisk ?? 0), 0);
}

// Line-wide effects come from a set of present, assigned workers.
export function lineProductivityMult(workers: Worker[]): number {
  return workers.reduce((m, w) => {
    const t = workerTraits(w).reduce((mm, tr) => mm * (tr.lineProductivityMult ?? 1), 1);
    return m * t;
  }, 1);
}

export function lineMoraleDelta(workers: Worker[]): number {
  return workers.reduce((s, w) =>
    s + workerTraits(w).reduce((ss, t) => ss + (t.lineMoraleDelta ?? 0), 0), 0);
}

export function lineIncidentResist(workers: Worker[]): number {
  return workers.reduce((s, w) =>
    s + workerTraits(w).reduce((ss, t) => ss + (t.incidentResist ?? 0), 0), 0);
}
