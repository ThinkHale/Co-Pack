// --- Sound effects (synthesized, no asset files) ---
// Tiny WebAudio blips so wins, hires, quits, and incidents land with a little
// feedback. Everything is short and quiet by design — juice, not a jingle. The
// AudioContext is created lazily and resumed on the first user gesture (the
// "Start Shift" button), which is what mobile browsers require.

export type SoundKind = 'cash' | 'win' | 'hire' | 'bad' | 'alert' | 'over' | 'click';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

// Call from a user gesture so audio is allowed to play afterward.
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(
  c: AudioContext, freq: number, start: number, dur: number,
  type: OscillatorType = 'sine', vol = 0.07,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const RECIPES: Record<SoundKind, (c: AudioContext, t: number) => void> = {
  cash: (c, t) => { tone(c, 660, t, 0.12, 'triangle'); tone(c, 988, t + 0.07, 0.16, 'triangle'); },
  win: (c, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.07, 0.18, 'triangle', 0.06)); },
  hire: (c, t) => { tone(c, 587, t, 0.1, 'triangle'); tone(c, 880, t + 0.06, 0.12, 'triangle'); },
  bad: (c, t) => { tone(c, 196, t, 0.28, 'sawtooth', 0.05); tone(c, 130, t + 0.05, 0.3, 'sawtooth', 0.045); },
  alert: (c, t) => { tone(c, 440, t, 0.1, 'square', 0.045); tone(c, 440, t + 0.15, 0.1, 'square', 0.045); },
  over: (c, t) => { [440, 349, 262].forEach((f, i) => tone(c, f, t + i * 0.16, 0.32, 'sine', 0.07)); },
  click: (c, t) => { tone(c, 300, t, 0.05, 'square', 0.035); },
};

export function playSound(kind: SoundKind): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  RECIPES[kind](c, c.currentTime + 0.001);
}
