// Microphone access for the voice spike: live level analysis plus recording.
// Audio stays in the browser at this stage; nothing is sent anywhere.

import { rmsDb, spectralFlatness, type Frame } from "./loudness";

export interface MicOptions {
  autoGainControl: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

/** Recording formats in order of preference: Chrome/Android/Firefox use WebM, iPhone Safari uses MP4. */
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export class Mic {
  private readonly timeBuf: Float32Array<ArrayBuffer>;
  private readonly freqBuf: Float32Array<ArrayBuffer>;
  private readonly fromBin: number;
  private readonly toBin: number;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  private constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly analyser: AnalyserNode,
    readonly mimeType: string,
  ) {
    this.timeBuf = new Float32Array(analyser.fftSize);
    this.freqBuf = new Float32Array(analyser.frequencyBinCount);
    // Speech band for the breathiness measure: roughly 300 Hz to 4 kHz.
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    this.fromBin = Math.floor(300 / hzPerBin);
    this.toBin = Math.ceil(4000 / hzPerBin);
  }

  /** Must be called from a tap/click: browsers (especially iPhone) only start audio after a user gesture. */
  static async open(opts: MicOptions): Promise<Mic> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't access the microphone here. The page must be opened over https.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: opts.autoGainControl,
        noiseSuppression: opts.noiseSuppression,
        echoCancellation: opts.echoCancellation,
        channelCount: 1,
      },
    });
    const ctx = new AudioContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    return new Mic(ctx, stream, analyser, mimeType);
  }

  /** What the browser actually applied: it may ignore what we asked for (common on iPhone). */
  appliedSettings(): MediaTrackSettings {
    return this.stream.getAudioTracks()[0]?.getSettings() ?? {};
  }

  frame(): Frame {
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    this.analyser.getFloatFrequencyData(this.freqBuf);
    return {
      db: rmsDb(this.timeBuf),
      flatness: spectralFlatness(this.freqBuf, this.fromBin, this.toBin),
    };
  }

  startRecording(): void {
    this.chunks = [];
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  stopRecording(): Promise<Blob> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(new Blob());
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || this.mimeType }));
      rec.stop();
    });
  }

  close(): void {
    this.recorder?.stop();
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}
