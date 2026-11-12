// Pure audio maths for the voice spike. No browser APIs here, so it can be
// unit-tested and reused by the game whatever engine we pick.

export type Loudness = "whisper" | "normal" | "shout";

export interface Thresholds {
  /** Speech level (dBFS) below this counts as a whisper. */
  whisperBelowDb: number;
  /** Speech level (dBFS) above this counts as a shout. */
  shoutAboveDb: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { whisperBelowDb: -38, shoutAboveDb: -18 };

/** One analysis frame (~1/60 s of audio). */
export interface Frame {
  /** Loudness in dBFS: 0 is the loudest possible, -100 is near silence. */
  db: number;
  /** 0 = tonal/voiced (normal speech), 1 = noise-like (whispers are breathy, so higher). */
  flatness: number;
}

export interface UtteranceSummary {
  durationMs: number;
  peakDb: number;
  /** Mean level of the loudest half of frames: ignores pauses between words. */
  speechDb: number;
  /** Mean spectral flatness over those same frames. */
  flatness: number;
  loudness: Loudness;
}

/** Root-mean-square level of a block of samples, in dBFS. */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

/**
 * Spectral flatness (geometric mean / arithmetic mean of power) over a band
 * of frequency bins given in dB. Near 0 for voiced sound, higher for breathy noise.
 */
export function spectralFlatness(binsDb: Float32Array, fromBin: number, toBin: number): number {
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = fromBin; i < toBin && i < binsDb.length; i++) {
    const db = binsDb[i] ?? -160;
    const power = Math.pow(10, Math.max(db, -160) / 10);
    logSum += Math.log(power + 1e-20);
    sum += power;
    n++;
  }
  if (n === 0 || sum <= 0) return 0;
  return Math.exp(logSum / n) / (sum / n);
}

export function classify(speechDb: number, t: Thresholds): Loudness {
  if (speechDb < t.whisperBelowDb) return "whisper";
  if (speechDb > t.shoutAboveDb) return "shout";
  return "normal";
}

export function summarise(frames: readonly Frame[], durationMs: number, t: Thresholds): UtteranceSummary {
  if (frames.length === 0) {
    return { durationMs, peakDb: -100, speechDb: -100, flatness: 0, loudness: "whisper" };
  }
  const sorted = [...frames].sort((a, b) => b.db - a.db);
  const loud = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const speechDb = loud.reduce((acc, f) => acc + f.db, 0) / loud.length;
  const flatness = loud.reduce((acc, f) => acc + f.flatness, 0) / loud.length;
  const peakDb = sorted[0]?.db ?? -100;
  return { durationMs, peakDb, speechDb, flatness, loudness: classify(speechDb, t) };
}
