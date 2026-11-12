// Voice spike, stage A: mic loudness only. Nothing leaves the browser.
import "./style.css";
import { Mic, type MicOptions } from "./spike/mic";
import { DEFAULT_THRESHOLDS, summarise, type Frame, type Thresholds, type UtteranceSummary } from "./spike/loudness";

const MAX_RECORDING_MS = 10_000;
const METER_MIN_DB = -70;

interface Attempt extends UtteranceSummary {
  n: number;
  intended: string;
  agc: boolean;
  ns: boolean;
  ec: boolean;
  device: string;
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <h1>AOB voice test · stage A</h1>
  <p class="lede">Loudness only. Your voice stays on this device; nothing is sent anywhere.</p>

  <section>
    <h2>1. Microphone</h2>
    <label><input type="checkbox" id="agc" /> Automatic gain control (volume levelling)</label>
    <label><input type="checkbox" id="ns" /> Noise suppression</label>
    <label><input type="checkbox" id="ec" /> Echo cancellation</label>
    <div class="row" style="margin-top:8px">
      <button id="open">Enable microphone</button>
      <span class="muted" id="micStatus">Off</span>
    </div>
    <p class="muted mono" id="applied"></p>
  </section>

  <section>
    <h2>2. Live level</h2>
    <div class="meter"><div class="meter-fill" id="meterFill"></div>
      <div class="meter-mark" id="markWhisper"></div><div class="meter-mark" id="markShout"></div></div>
    <p class="muted mono" id="liveText">–</p>
  </section>

  <section>
    <h2>3. Speak</h2>
    <label>I'm about to:
      <select id="intended">
        <option value="whisper">whisper</option>
        <option value="normal" selected>talk normally</option>
        <option value="shout">shout</option>
      </select>
    </label>
    <button id="ptt" disabled>Hold to talk</button>
    <p class="muted">Desktop: you can also hold the space bar. Max ${MAX_RECORDING_MS / 1000} seconds.</p>
  </section>

  <section>
    <h2>4. Result</h2>
    <div class="verdict" id="verdict">–</div>
    <p class="mono" id="resultText"></p>
    <audio id="playback" controls hidden></audio>
  </section>

  <section>
    <h2>5. Thresholds</h2>
    <label>Whisper below <span class="mono" id="wVal"></span> dB</label>
    <input type="range" id="wSlider" min="-70" max="-10" step="1" />
    <label>Shout above <span class="mono" id="sVal"></span> dB</label>
    <input type="range" id="sSlider" min="-60" max="0" step="1" />
    <p class="muted">Moving these re-scores every attempt below.</p>
  </section>

  <section>
    <h2>6. Attempts</h2>
    <div class="row" style="margin-bottom:8px">
      <button id="copy">Copy as text</button><button id="clear">Clear</button>
      <span class="muted" id="score"></span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>meant</th><th>got</th><th>speech dB</th><th>peak dB</th><th>breathy</th><th>secs</th><th>AGC/NS/EC</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </section>
`;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const ui = {
  agc: el<HTMLInputElement>("agc"),
  ns: el<HTMLInputElement>("ns"),
  ec: el<HTMLInputElement>("ec"),
  open: el<HTMLButtonElement>("open"),
  micStatus: el("micStatus"),
  applied: el("applied"),
  meterFill: el("meterFill"),
  markWhisper: el("markWhisper"),
  markShout: el("markShout"),
  liveText: el("liveText"),
  intended: el<HTMLSelectElement>("intended"),
  ptt: el<HTMLButtonElement>("ptt"),
  verdict: el("verdict"),
  resultText: el("resultText"),
  playback: el<HTMLAudioElement>("playback"),
  wSlider: el<HTMLInputElement>("wSlider"),
  sSlider: el<HTMLInputElement>("sSlider"),
  wVal: el("wVal"),
  sVal: el("sVal"),
  copy: el<HTMLButtonElement>("copy"),
  clear: el<HTMLButtonElement>("clear"),
  score: el("score"),
  rows: el("rows"),
};

const state = {
  mic: null as Mic | null,
  thresholds: { ...DEFAULT_THRESHOLDS } as Thresholds,
  recording: false,
  frames: [] as Frame[],
  startedAt: 0,
  stopTimer: 0,
  attempts: [] as Attempt[],
  playbackUrl: "",
};

const device = /iPhone|iPad/.test(navigator.userAgent)
  ? "iPhone/iPad"
  : /Android/.test(navigator.userAgent)
    ? "Android"
    : "desktop";

// ---- Microphone ----

function options(): MicOptions {
  return { autoGainControl: ui.agc.checked, noiseSuppression: ui.ns.checked, echoCancellation: ui.ec.checked };
}

async function openMic(): Promise<void> {
  state.mic?.close();
  state.mic = null;
  ui.ptt.disabled = true;
  ui.micStatus.textContent = "Starting…";
  try {
    state.mic = await Mic.open(options());
    const s = state.mic.appliedSettings();
    ui.micStatus.textContent = "On";
    ui.open.textContent = "Restart microphone";
    ui.applied.textContent =
      `Browser applied → AGC: ${String(s.autoGainControl ?? "?")}, ` +
      `noise suppression: ${String(s.noiseSuppression ?? "?")}, ` +
      `echo cancellation: ${String(s.echoCancellation ?? "?")}, ` +
      `sample rate: ${String(s.sampleRate ?? "?")}, recording format: ${state.mic.mimeType || "browser default"}`;
    ui.ptt.disabled = false;
  } catch (err) {
    ui.micStatus.textContent = `Couldn't start: ${err instanceof Error ? err.message : String(err)}`;
  }
}

ui.open.addEventListener("click", () => void openMic());
for (const box of [ui.agc, ui.ns, ui.ec]) {
  box.addEventListener("change", () => {
    if (state.mic) void openMic(); // settings only take effect on a fresh mic stream
  });
}

// ---- Live meter loop ----

function pct(db: number): number {
  return Math.min(100, Math.max(0, ((db - METER_MIN_DB) / -METER_MIN_DB) * 100));
}

function tick(): void {
  if (state.mic) {
    const f = state.mic.frame();
    if (state.recording) state.frames.push(f);
    ui.meterFill.style.width = `${pct(f.db)}%`;
    ui.meterFill.style.background =
      f.db > state.thresholds.shoutAboveDb ? "var(--shout)"
        : f.db < state.thresholds.whisperBelowDb ? "var(--whisper)" : "var(--normal)";
    ui.liveText.textContent = `${f.db.toFixed(1)} dB · breathy ${f.flatness.toFixed(2)}`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- Push to talk ----

function startTalking(): void {
  if (!state.mic || state.recording) return;
  state.recording = true;
  state.frames = [];
  state.startedAt = performance.now();
  state.mic.startRecording();
  ui.ptt.classList.add("active");
  ui.ptt.textContent = "Listening… release to stop";
  state.stopTimer = window.setTimeout(() => void stopTalking(), MAX_RECORDING_MS);
}

async function stopTalking(): Promise<void> {
  if (!state.mic || !state.recording) return;
  window.clearTimeout(state.stopTimer);
  state.recording = false;
  const durationMs = performance.now() - state.startedAt;
  ui.ptt.classList.remove("active");
  ui.ptt.textContent = "Hold to talk";
  const blob = await state.mic.stopRecording();

  const summary = summarise(state.frames, durationMs, state.thresholds);
  const s = options();
  state.attempts.push({
    ...summary,
    n: state.attempts.length + 1,
    intended: ui.intended.value,
    agc: s.autoGainControl,
    ns: s.noiseSuppression,
    ec: s.echoCancellation,
    device,
  });
  showResult(summary);
  renderAttempts();

  if (state.playbackUrl) URL.revokeObjectURL(state.playbackUrl);
  state.playbackUrl = URL.createObjectURL(blob);
  ui.playback.src = state.playbackUrl;
  ui.playback.hidden = blob.size === 0;
}

ui.ptt.addEventListener("pointerdown", (e) => {
  ui.ptt.setPointerCapture(e.pointerId);
  startTalking();
});
ui.ptt.addEventListener("pointerup", () => void stopTalking());
ui.ptt.addEventListener("pointercancel", () => void stopTalking());
ui.ptt.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  e.preventDefault();
  startTalking();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") void stopTalking();
});

// ---- Results ----

function showResult(r: UtteranceSummary): void {
  ui.verdict.textContent = r.loudness;
  ui.verdict.className = `verdict ${r.loudness}`;
  ui.resultText.textContent =
    `speech ${r.speechDb.toFixed(1)} dB · peak ${r.peakDb.toFixed(1)} dB · ` +
    `breathy ${r.flatness.toFixed(2)} · ${(r.durationMs / 1000).toFixed(1)} s`;
}

function rescore(): void {
  for (const a of state.attempts) {
    a.loudness = a.speechDb < state.thresholds.whisperBelowDb ? "whisper"
      : a.speechDb > state.thresholds.shoutAboveDb ? "shout" : "normal";
  }
}

function renderAttempts(): void {
  ui.rows.innerHTML = "";
  for (const a of [...state.attempts].reverse()) {
    const tr = document.createElement("tr");
    const cells = [
      String(a.n), a.intended, a.loudness, a.speechDb.toFixed(1), a.peakDb.toFixed(1),
      a.flatness.toFixed(2), (a.durationMs / 1000).toFixed(1),
      `${a.agc ? "on" : "off"}/${a.ns ? "on" : "off"}/${a.ec ? "on" : "off"}`,
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    if (a.intended !== a.loudness) tr.style.color = "var(--shout)";
    ui.rows.appendChild(tr);
  }
  const right = state.attempts.filter((a) => a.intended === a.loudness).length;
  ui.score.textContent = state.attempts.length ? `${right}/${state.attempts.length} correct` : "";
}

function renderThresholds(): void {
  ui.wSlider.value = String(state.thresholds.whisperBelowDb);
  ui.sSlider.value = String(state.thresholds.shoutAboveDb);
  ui.wVal.textContent = String(state.thresholds.whisperBelowDb);
  ui.sVal.textContent = String(state.thresholds.shoutAboveDb);
  ui.markWhisper.style.left = `${pct(state.thresholds.whisperBelowDb)}%`;
  ui.markShout.style.left = `${pct(state.thresholds.shoutAboveDb)}%`;
}

function onSlider(): void {
  state.thresholds = { whisperBelowDb: Number(ui.wSlider.value), shoutAboveDb: Number(ui.sSlider.value) };
  renderThresholds();
  rescore();
  renderAttempts();
}
ui.wSlider.addEventListener("input", onSlider);
ui.sSlider.addEventListener("input", onSlider);
renderThresholds();

ui.clear.addEventListener("click", () => {
  state.attempts = [];
  renderAttempts();
});

ui.copy.addEventListener("click", () => {
  const header = "n\tdevice\tmeant\tgot\tspeechDb\tpeakDb\tbreathy\tsecs\tagc\tns\tec";
  const lines = state.attempts.map((a) =>
    [a.n, a.device, a.intended, a.loudness, a.speechDb.toFixed(1), a.peakDb.toFixed(1), a.flatness.toFixed(2),
      (a.durationMs / 1000).toFixed(1), a.agc, a.ns, a.ec].join("\t"));
  const text =
    `thresholds: whisper<${state.thresholds.whisperBelowDb} shout>${state.thresholds.shoutAboveDb}\n` +
    [header, ...lines].join("\n");
  navigator.clipboard.writeText(text).then(
    () => { ui.copy.textContent = "Copied"; setTimeout(() => (ui.copy.textContent = "Copy as text"), 1500); },
    () => { ui.copy.textContent = "Copy failed"; },
  );
});
