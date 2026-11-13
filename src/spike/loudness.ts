// Pure audio maths for the voice spike. No browser APIs here, so it can be
// unit-tested and reused by the game whatever engine we pick.

export type Loudness = "whisper" | "normal" | "shout";

/** One analysis frame (~1/60 s of audio). */
export interface Frame {
  /** Loudness in dBFS: 0 is the loudest possible, -100 is near silence. */
  db: number;
  /** 0 = tonal/voiced (normal speech), 1 = noise-like (whispers are breathy, so higher). */
  flatness: number;
}

/** Measurements of one push-to-talk utterance. */
export interface Measure {
  durationMs: number;
  peakDb: number;
  /** Mean level of the loudest half of frames: ignores pauses between words. */
  speechDb: number;
  /** Mean spectral flatness over those same frames. */
  flatness: number;
}

/**
 * What "whisper", "normal" and (optionally) "shout" look like for this player,
 * this mic and these settings. Built from calibration samples.
 */
export interface Calibration {
  whisperDb: number;
  normalDb: number;
  whisperFlatness: number;
  normalFlatness: number;
  /** Absent if the player skipped shout calibration. */
  shoutDb?: number;
}

/**
 * Starting point before calibration, from desktop laptop-mic tests with
 * auto gain off (2026-11-12): normal ≈ -39 dB / 0.07 breathy, whisper ≈ -50 dB / 0.18.
 */
export const DEFAULT_CALIBRATION: Calibration = {
  whisperDb: -50,
  normalDb: -39,
  whisperFlatness: 0.18,
  normalFlatness: 0.07,
};

/** Shout bonus if not calibrated: this many dB above normal speech. */
const DEFAULT_SHOUT_MARGIN_DB = 14;

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

export function measure(frames: readonly Frame[], durationMs: number): Measure {
  if (frames.length === 0) return { durationMs, peakDb: -100, speechDb: -100, flatness: 0 };
  const sorted = [...frames].sort((a, b) => b.db - a.db);
  const loud = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const speechDb = loud.reduce((acc, f) => acc + f.db, 0) / loud.length;
  const flatness = loud.reduce((acc, f) => acc + f.flatness, 0) / loud.length;
  return { durationMs, peakDb: sorted[0]?.db ?? -100, speechDb, flatness };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Builds a calibration from sample utterances. Returns null if whisper and normal are indistinguishable. */
export function calibrate(
  whispers: readonly Measure[],
  normals: readonly Measure[],
  shouts: readonly Measure[] = [],
): Calibration | null {
  if (whispers.length === 0 || normals.length === 0) return null;
  const cal: Calibration = {
    whisperDb: mean(whispers.map((m) => m.speechDb)),
    normalDb: mean(normals.map((m) => m.speechDb)),
    whisperFlatness: mean(whispers.map((m) => m.flatness)),
    normalFlatness: mean(normals.map((m) => m.flatness)),
  };
  if (shouts.length > 0) cal.shoutDb = mean(shouts.map((m) => m.speechDb));
  const volumeGap = cal.normalDb - cal.whisperDb;
  const breathGap = cal.whisperFlatness - cal.normalFlatness;
  return volumeGap > 1 || breathGap > 0.01 ? cal : null;
}

export interface Verdict {
  loudness: Loudness;
  /** 0 = sounds exactly like this player's whisper, 1 = exactly like their normal voice. */
  volumeScore: number;
  breathScore: number;
  /** Average of the cues that are usable. Below 0.5 = whisper. */
  combined: number;
}

/**
 * Whisper vs normal uses two cues, each scaled so 0 = the player's whisper and
 * 1 = their normal voice: loudness and breathiness. A cue is ignored if
 * calibration showed no gap for it (e.g. auto gain flattened the volume).
 * Shout is a bonus: clearly louder than normal speech.
 */
export function judge(m: Measure, cal: Calibration): Verdict {
  const volumeGap = cal.normalDb - cal.whisperDb;
  const breathGap = cal.whisperFlatness - cal.normalFlatness;
  const volumeScore = volumeGap > 1 ? (m.speechDb - cal.whisperDb) / volumeGap : NaN;
  const breathScore = breathGap > 0.01 ? (cal.whisperFlatness - m.flatness) / breathGap : NaN;
  const usable = [volumeScore, breathScore].filter((x) => Number.isFinite(x));
  const combined = usable.length ? mean(usable) : 1;

  const shoutAbove =
    cal.shoutDb !== undefined ? (cal.normalDb + cal.shoutDb) / 2 : cal.normalDb + DEFAULT_SHOUT_MARGIN_DB;

  let loudness: Loudness = combined < 0.5 ? "whisper" : "normal";
  if (m.speechDb > shoutAbove) loudness = "shout";
  return { loudness, volumeScore, breathScore, combined };
}
