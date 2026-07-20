import {
  MUSIC,
  MUSIC_BUS_LEVEL,
  MUSIC_SCHEDULE_AHEAD,
  MUSIC_SCHEDULE_TICK_MS,
  SFX_BUS_LEVEL,
  scheduleMusicStep,
  type MusicTheme,
} from "./music";
import { SFX, type SoundId } from "./sfx";

/** Minimum ms between repeats of the same SoundId — a 20+ enemy wave firing
 *  the same weapon rapidly must not clip (see design-demo-milestone.md
 *  Problem 5, Batch 4 QA). */
const THROTTLE_MS = 40;

/** Random pitch variation applied per play, +/-6%. */
const PITCH_JITTER = 0.06;

/** Crossfade duration when switching music themes (seconds). */
const MUSIC_CROSSFADE = 0.45;

/**
 * WebAudio output (CD-3 SFX + CD-33 music). Lazy AudioContext, dual bus
 * (sfx + music under master), per-id SFX throttling, slight pitch
 * randomization, and resume-on-first-gesture so nothing plays (or warns)
 * before the user has interacted with the page.
 *
 * Music is theme-driven (`setMusicTheme`) — no Game imports; main/bindings
 * map phase → theme. Scheduler uses the AudioContext clock (not rAF) so
 * loops stay in time while paused UI freezes the sim.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private volume = 1;
  private muted = false;
  private lastPlayAt = new Map<SoundId, number>();

  private theme: MusicTheme = "none";
  private musicStep = 0;
  private nextStepTime = 0;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  /** Target music bus level after fades (0 while theme is none). */
  private musicTarget = 0;

  constructor() {
    const resume = () => {
      // First gesture: create context (if needed) and start any pending theme.
      const ctx = this.ensureContext();
      if (!ctx) return;
      const start = () => {
        if (this.theme !== "none") {
          this.armMusicTransport(ctx);
          this.ensureScheduler();
        }
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(start).catch(() => {
          // Best-effort — a rejected resume just means audio stays silent.
        });
      } else {
        start();
      }
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }

  /** DEV-only inspection (see main.ts's `window.__audioBus` hook). */
  get contextState(): AudioContextState | "uncreated" {
    return this.ctx?.state ?? "uncreated";
  }

  get masterGainValue(): number | null {
    return this.master?.gain.value ?? null;
  }

  get musicTheme(): MusicTheme {
    return this.theme;
  }

  /** Created on first use, not at construction — "lazily" per the design
   *  doc — so importing/instantiating AudioBus never touches the page's
   *  audio permissions on its own. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);

    const sfx = ctx.createGain();
    sfx.gain.value = SFX_BUS_LEVEL;
    sfx.connect(master);

    const music = ctx.createGain();
    music.gain.value = 0;
    music.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    return ctx;
  }

  /** Play a synthesized SFX by id. No-op (not queued) if the context isn't
   *  running yet (pre-gesture) or the same id was just played within the
   *  throttle window. */
  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || ctx.state !== "running") return;

    const now = performance.now();
    const last = this.lastPlayAt.get(id) ?? -Infinity;
    if (now - last < THROTTLE_MS) return;
    this.lastPlayAt.set(id, now);

    const recipe = SFX[id];
    const pitchMul = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;
    recipe(ctx, this.sfxGain, ctx.currentTime, pitchMul);
  }

  /**
   * CD-33: set the looping music bed. Crossfades on change; `none` fades
   * out and stops the scheduler. Safe before context exists (theme is
   * remembered and starts on first user gesture — no AudioContext at boot).
   */
  setMusicTheme(theme: MusicTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.musicStep = 0;
    this.musicTarget = theme === "none" ? 0 : MUSIC_BUS_LEVEL;

    // Lazy: don't create the context until the user has gestured (same as
    // SFX play). Theme is stored; resume handler arms transport.
    if (!this.ctx || !this.musicGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(
      this.musicTarget,
      now + MUSIC_CROSSFADE,
    );

    if (theme === "none") {
      window.setTimeout(() => {
        if (this.theme === "none") this.stopScheduler();
      }, MUSIC_CROSSFADE * 1000 + 50);
      return;
    }

    this.armMusicTransport(ctx);
    if (ctx.state === "running") this.ensureScheduler();
  }

  /** Reset step clock so a theme change starts near "now". */
  private armMusicTransport(ctx: AudioContext): void {
    this.nextStepTime = ctx.currentTime + 0.05;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private ensureScheduler(): void {
    if (this.schedulerTimer !== null) return;
    this.schedulerTimer = setInterval(() => this.scheduleAhead(), MUSIC_SCHEDULE_TICK_MS);
    this.scheduleAhead();
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleAhead(): void {
    const ctx = this.ctx;
    const music = this.musicGain;
    if (!ctx || !music || ctx.state !== "running") return;
    if (this.theme === "none") return;

    const pattern = MUSIC[this.theme];
    if (!pattern) return;

    const stepDur = 60 / pattern.bpm / 4;
    if (this.nextStepTime < ctx.currentTime - 0.05) {
      // Recover if the tab was backgrounded long enough to fall behind.
      this.nextStepTime = ctx.currentTime + 0.02;
    }

    while (this.nextStepTime < ctx.currentTime + MUSIC_SCHEDULE_AHEAD) {
      scheduleMusicStep(ctx, music, pattern, this.musicStep, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.musicStep += 1;
    }
  }
}
