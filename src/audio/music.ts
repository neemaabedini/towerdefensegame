/**
 * Synthesized music patterns (CD-33) — zero audio assets, same philosophy
 * as sfx.ts. Patterns are step-sequenced 16ths over a short loop; AudioBus
 * owns the scheduler and routes through a dedicated music gain.
 *
 * Themes:
 *   title  — soft ambient bed for menu screens
 *   day    — calm planning pad + sparse arpeggio
 *   night  — darker drone + pulse (the "night drop")
 *   finale — night density cranked for last-wave climax
 */

export type MusicTheme = "none" | "title" | "day" | "night" | "finale";

export interface MusicPattern {
  /** Beats per minute for 16th-note step timing. */
  bpm: number;
  /** Steps in one loop (usually 16 = one bar of 16ths, or 32 for two). */
  steps: number;
  /** Bass pitch per step (Hz); 0 = rest. */
  bass: number[];
  /** Optional sustained pad root (Hz). */
  pad?: number;
  /** Soft mid arpeggio hits (Hz); 0 = rest. */
  arp?: number[];
  /** Kick/pulse accents on these step indices (for night drive). */
  pulseSteps?: number[];
  /** Relative intensity 0–1 (scales gains). */
  intensity: number;
}

function n(freq: number): number {
  return freq;
}

/** C-minor-ish palette for combat, C-major-ish for day/title. */
const C2 = 65.41;
const Eb2 = 77.78;
const F2 = 87.31;
const G2 = 98.0;
const Ab2 = 103.83;
const Bb2 = 116.54;
const C3 = 130.81;
const Eb3 = 155.56;
const G3 = 196.0;
const Bb3 = 233.08;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392.0;
const Bb4 = 466.16;

function fill(steps: number, hits: Array<[number, number]>): number[] {
  const out = new Array<number>(steps).fill(0);
  for (const [i, f] of hits) {
    if (i >= 0 && i < steps) out[i] = f;
  }
  return out;
}

export const MUSIC: Record<Exclude<MusicTheme, "none">, MusicPattern> = {
  title: {
    bpm: 72,
    steps: 16,
    intensity: 0.45,
    pad: C3,
    bass: fill(16, [
      [0, C2],
      [8, G2],
    ]),
    arp: fill(16, [
      [4, E4],
      [6, G4],
      [12, D4],
      [14, E4],
    ]),
  },
  day: {
    bpm: 88,
    steps: 16,
    intensity: 0.55,
    pad: C3,
    bass: fill(16, [
      [0, C2],
      [4, G2],
      [8, F2],
      [12, G2],
    ]),
    arp: fill(16, [
      [2, E4],
      [3, G4],
      [6, C4],
      [10, D4],
      [11, E4],
      [14, G4],
    ]),
  },
  night: {
    bpm: 104,
    steps: 16,
    intensity: 0.75,
    pad: Eb2,
    bass: fill(16, [
      [0, C2],
      [3, C2],
      [4, Eb2],
      [8, Ab2],
      [11, Ab2],
      [12, G2],
      [14, Bb2],
    ]),
    arp: fill(16, [
      [1, Bb3],
      [5, Eb3],
      [7, G3],
      [9, Bb3],
      [13, Eb3],
    ]),
    pulseSteps: [0, 4, 8, 12],
  },
  finale: {
    bpm: 118,
    steps: 16,
    intensity: 1,
    pad: C2,
    bass: fill(16, [
      [0, C2],
      [2, C2],
      [4, Eb2],
      [6, Eb2],
      [8, F2],
      [10, G2],
      [12, Ab2],
      [14, Bb2],
    ]),
    arp: fill(16, [
      [1, Bb4],
      [3, G4],
      [5, Bb4],
      [7, Eb3],
      [9, C4],
      [11, Bb4],
      [13, G4],
      [15, Bb4],
    ]),
    pulseSteps: [0, 2, 4, 6, 8, 10, 12, 14],
  },
};

/** Lookahead window for the Web Audio scheduler (seconds). */
export const MUSIC_SCHEDULE_AHEAD = 0.12;
export const MUSIC_SCHEDULE_TICK_MS = 25;

/** Music bus level relative to master (SFX sits at 1.0 on its own bus). */
export const MUSIC_BUS_LEVEL = 0.26;
export const SFX_BUS_LEVEL = 1;

/**
 * Schedule one sequencer step of a pattern onto `dest` at audio time `when`.
 * Pure scheduling — no state. Nodes self-stop.
 */
export function scheduleMusicStep(
  ctx: AudioContext,
  dest: AudioNode,
  pattern: MusicPattern,
  step: number,
  when: number,
): void {
  const i = ((step % pattern.steps) + pattern.steps) % pattern.steps;
  const intensity = pattern.intensity;
  const stepDur = 60 / pattern.bpm / 4; // 16th note

  // Soft pad (retriggered lightly so theme swaps aren't silent holes)
  if (pattern.pad && i % 8 === 0) {
    playMusicTone(ctx, dest, when, {
      type: "sine",
      freq: pattern.pad,
      duration: stepDur * 8.5,
      gain: 0.045 * intensity,
      attack: 0.08,
      filterFreq: 900,
    });
    // Quiet fifth above for body
    playMusicTone(ctx, dest, when, {
      type: "sine",
      freq: pattern.pad * 1.5,
      duration: stepDur * 8.5,
      gain: 0.02 * intensity,
      attack: 0.1,
      filterFreq: 1200,
    });
  }

  const bass = pattern.bass[i] ?? 0;
  if (bass > 0) {
    playMusicTone(ctx, dest, when, {
      type: "triangle",
      freq: bass,
      freqEnd: bass * 0.92,
      duration: stepDur * 1.6,
      gain: 0.11 * intensity,
      attack: 0.01,
      filterFreq: 420,
    });
  }

  const arp = pattern.arp?.[i] ?? 0;
  if (arp > 0) {
    playMusicTone(ctx, dest, when, {
      type: "sine",
      freq: arp,
      duration: stepDur * 1.1,
      gain: 0.055 * intensity,
      attack: 0.005,
      filterFreq: 2800,
    });
  }

  if (pattern.pulseSteps?.includes(i)) {
    // Soft low "thump" — night drive, not a drum kit.
    playMusicTone(ctx, dest, when, {
      type: "sine",
      freq: n(55),
      freqEnd: 35,
      duration: stepDur * 0.9,
      gain: 0.09 * intensity,
      attack: 0.002,
    });
  }
}

interface MusicToneOpts {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  duration: number;
  gain: number;
  attack: number;
  filterFreq?: number;
}

function playMusicTone(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  opts: MusicToneOpts,
): void {
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(Math.max(1, opts.freq), when);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, opts.freqEnd),
      when + opts.duration,
    );
  }

  let node: AudioNode = osc;
  if (opts.filterFreq !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.filterFreq, when);
    osc.connect(filter);
    node = filter;
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(opts.gain, when + opts.attack);
  gain.gain.exponentialRampToValueAtTime(0.001, when + opts.duration);

  node.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + opts.duration + 0.03);
}
