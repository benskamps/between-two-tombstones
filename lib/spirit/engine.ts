// The static. White noise from a looped AudioBuffer through a band-pass filter
// that jumps to a new frequency every N ms, with short gain dips (clicks) and
// faint carrier blips. Browser only; create it inside a tap handler so iOS lets
// the AudioContext run.

export const SWEEP_MIN_MS = 50;
export const SWEEP_MAX_MS = 350;
export const SWEEP_DEFAULT_MS = 150;

/** Band centre range, Hz. Picked log-uniformly so low and high bands get equal time. */
const BAND_LO = 250;
const BAND_HI = 3800;
/** Band-passed noise is quiet; this brings it up to a comfortable level at volume 1. */
const MAKEUP_GAIN = 3.2;
/** Gain while a voice is speaking (ducking), relative to full. */
const DUCK_LEVEL = 0.28;

export function clampSweepMs(ms: number): number {
  if (!Number.isFinite(ms)) return SWEEP_DEFAULT_MS;
  return Math.min(SWEEP_MAX_MS, Math.max(SWEEP_MIN_MS, Math.round(ms)));
}

export function randomBandFrequency(rng: () => number): number {
  const lo = Math.log(BAND_LO);
  const hi = Math.log(BAND_HI);
  return Math.min(BAND_HI, Math.max(BAND_LO, Math.exp(lo + rng() * (hi - lo))));
}

/** Seconds of ducking for a fragment: roughly how long the voice takes to say it. */
export function speechSeconds(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).length;
  return 0.6 + (words * 0.55) / Math.max(0.3, rate);
}

export type NoiseEngine = {
  setSweepMs(ms: number): void;
  /**
   * Step the band to this centre frequency and Q right now. Séance mode drives
   * the band from the shared schedule this way (with `autoSweep: false`), so
   * every phone's static moves together.
   */
  setBand(frequency: number, q: number): void;
  setVolume(v: number): void;
  /** Lower the static for `seconds`, then bring it back (scheduled on the audio clock). */
  duck(seconds: number): void;
  stop(): void;
};

type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number, rng: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buf;
}

export function startNoise(
  ctx: Ctx,
  opts: { sweepMs: number; volume: number; rng?: () => number; autoSweep?: boolean },
): NoiseEngine {
  const rng = opts.rng ?? Math.random;
  const autoSweep = opts.autoSweep ?? true;
  let sweepMs = clampSweepMs(opts.sweepMs);
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const blips = new Set<OscillatorNode>();

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2, rng);
  src.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = randomBandFrequency(rng);
  band.Q.value = 3;

  // A little unfiltered hiss under the band, like a radio between stations.
  const hiss = ctx.createGain();
  hiss.gain.value = 0.035;

  const gate = ctx.createGain(); // click gaps
  const duckGain = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, opts.volume)) * MAKEUP_GAIN;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 12;

  src.connect(band).connect(gate);
  src.connect(hiss).connect(gate);
  gate.connect(duckGain).connect(master).connect(limiter).connect(ctx.destination);

  function later(fn: () => void, ms: number) {
    if (stopped) return;
    const id = setTimeout(() => {
      timers.delete(id);
      if (!stopped) fn();
    }, ms);
    timers.add(id);
  }

  function sweep() {
    const t = ctx.currentTime;
    band.frequency.setValueAtTime(randomBandFrequency(rng), t);
    band.Q.setValueAtTime(2 + rng() * 5, t);
    later(sweep, sweepMs);
  }

  function click() {
    const t = ctx.currentTime;
    const gapS = 0.012 + rng() * 0.06;
    gate.gain.setValueAtTime(0, t);
    gate.gain.setValueAtTime(1, t + gapS);
    later(click, 250 + rng() * 1200);
  }

  function blip() {
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const dur = 0.04 + rng() * 0.12;
    const peak = 0.025 + rng() * 0.03;
    osc.type = "sine";
    osc.frequency.value = 650 + rng() * 1600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.012);
    osc.connect(g).connect(duckGain);
    osc.onended = () => {
      blips.delete(osc);
      osc.disconnect();
      g.disconnect();
    };
    blips.add(osc);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    later(blip, 1200 + rng() * 3300);
  }

  src.start();
  if (autoSweep) sweep();
  later(click, 300 + rng() * 600);
  later(blip, 800 + rng() * 1500);

  return {
    setSweepMs(ms) {
      sweepMs = clampSweepMs(ms);
    },
    setBand(frequency, q) {
      if (stopped || !Number.isFinite(frequency) || !Number.isFinite(q)) return;
      const t = ctx.currentTime;
      band.frequency.setValueAtTime(Math.min(BAND_HI, Math.max(BAND_LO, frequency)), t);
      band.Q.setValueAtTime(Math.min(10, Math.max(0.5, q)), t);
    },
    setVolume(v) {
      if (stopped) return;
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * MAKEUP_GAIN, ctx.currentTime, 0.03);
    },
    duck(seconds) {
      if (stopped) return;
      const t = ctx.currentTime;
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setTargetAtTime(DUCK_LEVEL, t, 0.04);
      duckGain.gain.setTargetAtTime(1, t + Math.max(0.2, seconds), 0.25);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(0, t);
      for (const node of [src, ...blips]) {
        try {
          node.stop();
        } catch {
          // Already stopped; nothing to do.
        }
      }
      blips.clear();
      for (const node of [src, band, hiss, gate, duckGain, master, limiter]) node.disconnect();
    },
  };
}
