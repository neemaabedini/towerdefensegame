import { SFX, type SoundId } from "./sfx";

/** Minimum ms between repeats of the same SoundId — a 20+ enemy wave firing
 *  the same weapon rapidly must not clip (see design-demo-milestone.md
 *  Problem 5, Batch 4 QA). */
const THROTTLE_MS = 40;

/** Random pitch variation applied per play, +/-6%. */
const PITCH_JITTER = 0.06;

/**
 * WebAudio output (CD-3). Lazy AudioContext + master GainNode, per-id
 * throttling, slight pitch randomization, and resume-on-first-gesture so
 * nothing plays (or warns) before the user has interacted with the page —
 * browsers create new AudioContexts suspended until a gesture resumes them.
 * `play()` is a safe no-op while suspended: it neither queues nor throws.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;
  private muted = false;
  private lastPlayAt = new Map<SoundId, number>();

  constructor() {
    const resume = () => {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {
          // Best-effort — a rejected resume just means audio stays silent.
        });
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

    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Play a synthesized SFX by id. No-op (not queued) if the context isn't
   *  running yet (pre-gesture) or the same id was just played within the
   *  throttle window. */
  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;

    const now = performance.now();
    const last = this.lastPlayAt.get(id) ?? -Infinity;
    if (now - last < THROTTLE_MS) return;
    this.lastPlayAt.set(id, now);

    const recipe = SFX[id];
    const pitchMul = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;
    recipe(ctx, this.master, ctx.currentTime, pitchMul);
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
}
