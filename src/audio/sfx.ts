/**
 * Synthesized SFX recipes (CD-3, see design-demo-milestone.md Problem 5) —
 * zero audio assets. Each recipe is a small pure function that schedules
 * oscillator/noise nodes onto `destination` starting at `when` (an
 * AudioContext timestamp) and cleans up after itself via `stop()`. Real
 * audio (CD-33) replaces these post-port; keep this shallow.
 */

export type SoundId =
  | "shot_gun"
  | "shot_bunker"
  | "shot_siege"
  | "shot_missile"
  | "enemy_die"
  | "building_down"
  | "wave_klaxon"
  | "dawn_chime"
  | "victory_sting"
  | "defeat_sting"
  | "ui_build"
  | "ui_upgrade"
  | "ui_sell";

/** `pitchMul` is the AudioBus's per-play +/-6% random pitch variation. */
export type SfxRecipe = (
  ctx: AudioContext,
  destination: AudioNode,
  when: number,
  pitchMul: number,
) => void;

interface ToneOpts {
  type: OscillatorType;
  freq: number;
  /** If set, frequency ramps exponentially from `freq` to this by `duration`. */
  freqEnd?: number;
  duration: number;
  gain?: number;
  attack?: number;
}

function playTone(ctx: AudioContext, dest: AudioNode, when: number, opts: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(Math.max(1, opts.freq), when);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), when + opts.duration);
  }

  const gain = ctx.createGain();
  const peak = opts.gain ?? 0.2;
  const attack = opts.attack ?? 0.005;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, when + opts.duration);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + opts.duration + 0.02);
}

interface NoiseOpts {
  duration: number;
  gain?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
}

function playNoise(ctx: AudioContext, dest: AudioNode, when: number, opts: NoiseOpts): void {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * opts.duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  let node: AudioNode = src;
  if (opts.filterFreq !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? "bandpass";
    filter.frequency.value = opts.filterFreq;
    src.connect(filter);
    node = filter;
  }

  const gain = ctx.createGain();
  const peak = opts.gain ?? 0.2;
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + opts.duration);

  node.connect(gain);
  gain.connect(dest);
  src.start(when);
  src.stop(when + opts.duration + 0.02);
}

export const SFX: Record<SoundId, SfxRecipe> = {
  // Short bright blip — snappy instant-hit tower.
  shot_gun: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "square",
      freq: 900 * p,
      freqEnd: 480 * p,
      duration: 0.06,
      gain: 0.16,
    });
  },

  // Lower thump — heavier instant-hit bunker.
  shot_bunker: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "sine",
      freq: 220 * p,
      freqEnd: 90 * p,
      duration: 0.1,
      gain: 0.26,
    });
    playNoise(ctx, dest, when, { duration: 0.05, gain: 0.07, filterFreq: 400 });
  },

  // Deep boom — siege tank splash shot.
  shot_siege: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "sine",
      freq: 110 * p,
      freqEnd: 38 * p,
      duration: 0.28,
      gain: 0.32,
    });
    playNoise(ctx, dest, when, {
      duration: 0.16,
      gain: 0.14,
      filterFreq: 160,
      filterType: "lowpass",
    });
  },

  // Whoosh-ish upward sweep — missile launch.
  shot_missile: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "sawtooth",
      freq: 260 * p,
      freqEnd: 900 * p,
      duration: 0.22,
      gain: 0.14,
    });
    playNoise(ctx, dest, when, {
      duration: 0.22,
      gain: 0.06,
      filterFreq: 1400,
      filterType: "highpass",
    });
  },

  // Quick downward chirp — enemy death.
  enemy_die: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "triangle",
      freq: 520 * p,
      freqEnd: 110 * p,
      duration: 0.13,
      gain: 0.18,
    });
  },

  // Crunchy noise burst — building destroyed.
  building_down: (ctx, dest, when, p) => {
    playNoise(ctx, dest, when, {
      duration: 0.35,
      gain: 0.28,
      filterFreq: 350,
      filterType: "bandpass",
    });
    playTone(ctx, dest, when, {
      type: "sine",
      freq: 80 * p,
      freqEnd: 40 * p,
      duration: 0.3,
      gain: 0.18,
    });
  },

  // Two-tone alarm — wave incoming.
  wave_klaxon: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, { type: "sawtooth", freq: 440 * p, duration: 0.18, gain: 0.2 });
    playTone(ctx, dest, when + 0.22, {
      type: "sawtooth",
      freq: 330 * p,
      duration: 0.18,
      gain: 0.2,
    });
  },

  // Soft major arpeggio — dawn / wave cleared.
  dawn_chime: (ctx, dest, when, p) => {
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      playTone(ctx, dest, when + i * 0.12, {
        type: "sine",
        freq: freq * p,
        duration: 0.35,
        gain: 0.13,
        attack: 0.02,
      });
    });
  },

  // Rising triad — level victory.
  victory_sting: (ctx, dest, when, p) => {
    const notes = [392, 523.25, 659.25]; // G4 C5 E5
    notes.forEach((freq, i) => {
      playTone(ctx, dest, when + i * 0.1, {
        type: "triangle",
        freq: freq * p,
        duration: 0.4,
        gain: 0.19,
      });
    });
  },

  // Falling minor-ish line — level defeat.
  defeat_sting: (ctx, dest, when, p) => {
    const notes = [392, 349.23, 293.66]; // G4 F4 D4
    notes.forEach((freq, i) => {
      playTone(ctx, dest, when + i * 0.14, {
        type: "sawtooth",
        freq: freq * p,
        freqEnd: freq * p * 0.85,
        duration: 0.45,
        gain: 0.17,
      });
    });
  },

  // Click-pop — building placed.
  ui_build: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "square",
      freq: 300 * p,
      freqEnd: 520 * p,
      duration: 0.05,
      gain: 0.14,
    });
  },

  // Upward blip — building upgraded.
  ui_upgrade: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, {
      type: "triangle",
      freq: 440 * p,
      freqEnd: 880 * p,
      duration: 0.09,
      gain: 0.15,
    });
  },

  // Coin-ish tick — sold or undone.
  ui_sell: (ctx, dest, when, p) => {
    playTone(ctx, dest, when, { type: "sine", freq: 1200 * p, duration: 0.05, gain: 0.13 });
    playTone(ctx, dest, when + 0.06, { type: "sine", freq: 1500 * p, duration: 0.06, gain: 0.11 });
  },
};
