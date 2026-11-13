// Voice spike, stage A: mic loudness only. Audio never leaves the browser.
import "./style.css";
import { Mic, type MicOptions } from "./spike/mic";
import {
  DEFAULT_CALIBRATION, calibrate, judge, measure,
  type Calibration, type Frame, type Measure, type Verdict,
} from "./spike/loudness";

const MAX_RECORDING_MS = 10_000;
const MIN_RECORDING_MS = 500;
const METER_MIN_DB = -70;
const SAMPLES_PER_STEP = 3;

type Step = "whisper" | "normal" | "shout";
const STEP_ORDER: readonly Step[] = ["whisper", "normal", "shout"];
const STEP_TEXT: Record<Step, { verb: string; phrase: string }> = {
  whisper: { verb: "Whisper", phrase: "“Is this meeting nearly over?”" },
  normal: { verb: "Say normally", phrase: "“Can we take this offline?”" },
  shout: { verb: "Shout (optional)", phrase: "“ANY OTHER BUSINESS?!”" },
};

interface Attempt {
  n: number;
  meant: Step;
  measure: Measure;
  verdict: Verdict;
  settings: MicOptions;
}

const device = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone/iPad"
  : /Android/.test(navigator.userAgent) ? "Android" : "desktop";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <h1>AOB voice test</h1>
  <p class="lede">Loudness only. Your voice stays on this device.</p>

  <section>
    <h2>1. Turn the mic on</h2>
    <div class="row"><button id="open">Enable microphone</button><span class="muted" id="micStatus">Off</span></div>
  </section>

  <section>
    <h2 id="stepTitle">2. Teach it your voice</h2>
    <p id="instruction" class="instruction">Turn the mic on first.</p>
    <div class="meter"><div class="meter-fill" id="meterFill"></div></div>
    <button id="ptt" disabled>Hold to talk</button>
    <p class="muted" id="hint">Hold the button (or the space bar) while you speak, then let go.</p>
    <div class="row">
      <button id="skipShout" hidden>Skip shouting</button>
      <button id="recal" hidden>Start calibration again</button>
    </div>
  </section>

  <section id="resultBox" hidden>
    <div class="verdict" id="verdict">–</div>
    <p class="muted mono" id="resultText"></p>
  </section>

  <section id="attemptsBox" hidden>
    <h2>Your tests</h2>
    <div class="row" style="margin-bottom:8px">
      <button id="send">Send results to laptop</button>
      <button id="copy">Copy as text</button>
      <span class="muted" id="score"></span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>meant</th><th>heard</th><th>dB</th><th>breathy</th><th>score</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </section>

  <details>
    <summary>Advanced</summary>
    <section>
      <p class="muted">Changing these restarts the mic and the calibration.</p>
      <label><input type="checkbox" id="agc" /> Automatic gain control (volume levelling)</label>
      <label><input type="checkbox" id="ns" /> Noise suppression</label>
      <label><input type="checkbox" id="ec" /> Echo cancellation</label>
      <p class="muted mono" id="applied"></p>
      <p class="muted mono" id="liveText"></p>
      <p class="muted mono" id="calText"></p>
      <audio id="playback" controls hidden></audio>
    </section>
  </details>
`;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const ui = {
  open: el<HTMLButtonElement>("open"), micStatus: el("micStatus"),
  stepTitle: el("stepTitle"), instruction: el("instruction"), meterFill: el("meterFill"),
  ptt: el<HTMLButtonElement>("ptt"), hint: el("hint"),
  skipShout: el<HTMLButtonElement>("skipShout"), recal: el<HTMLButtonElement>("recal"),
  resultBox: el("resultBox"), verdict: el("verdict"), resultText: el("resultText"),
  attemptsBox: el("attemptsBox"), send: el<HTMLButtonElement>("send"), copy: el<HTMLButtonElement>("copy"),
  score: el("score"), rows: el("rows"),
  agc: el<HTMLInputElement>("agc"), ns: el<HTMLInputElement>("ns"), ec: el<HTMLInputElement>("ec"),
  applied: el("applied"), liveText: el("liveText"), calText: el("calText"),
  playback: el<HTMLAudioElement>("playback"),
};

const state = {
  mic: null as Mic | null,
  recording: false,
  frames: [] as Frame[],
  startedAt: 0,
  stopTimer: 0,
  /** Calibration step in progress, or null once calibrated (testing mode). */
  step: "whisper" as Step | null,
  samples: { whisper: [] as Measure[], normal: [] as Measure[], shout: [] as Measure[] },
  calibration: DEFAULT_CALIBRATION as Calibration,
  attempts: [] as Attempt[],
  playbackUrl: "",
};

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
      `Browser applied: AGC ${String(s.autoGainControl ?? "?")}, noise suppression ${String(s.noiseSuppression ?? "?")}, ` +
      `echo cancellation ${String(s.echoCancellation ?? "?")}, ${String(s.sampleRate ?? "?")} Hz, ` +
      `format ${state.mic.mimeType || "default"}`;
    ui.ptt.disabled = false;
    startCalibration();
  } catch (err) {
    ui.micStatus.textContent = `Couldn't start: ${err instanceof Error ? err.message : String(err)}`;
  }
}

ui.open.addEventListener("click", () => void openMic());
for (const box of [ui.agc, ui.ns, ui.ec]) {
  box.addEventListener("change", () => { if (state.mic) void openMic(); });
}

// ---- Calibration and test flow ----

function startCalibration(): void {
  state.step = "whisper";
  state.samples = { whisper: [], normal: [], shout: [] };
  state.calibration = DEFAULT_CALIBRATION;
  renderStep();
}

function finishCalibration(): void {
  const cal = calibrate(state.samples.whisper, state.samples.normal, state.samples.shout);
  state.step = null;
  if (cal) {
    state.calibration = cal;
    ui.hint.textContent = "Calibrated. Now test it: pick what you'll do, then speak.";
  } else {
    ui.hint.textContent = "Your whisper and normal voice sounded the same, so I'm using default settings. Try again a bit quieter?";
  }
  renderStep();
}

function renderStep(): void {
  ui.skipShout.hidden = state.step !== "shout";
  ui.recal.hidden = state.step === "whisper" && state.samples.whisper.length === 0;
  if (state.step) {
    const done = state.samples[state.step].length;
    const t = STEP_TEXT[state.step];
    ui.stepTitle.textContent = "2. Teach it your voice";
    ui.instruction.innerHTML = "";
    ui.instruction.append(`${t.verb} ${done + 1} of ${SAMPLES_PER_STEP}: `);
    const b = document.createElement("strong");
    b.textContent = t.phrase;
    ui.instruction.append(b);
  } else {
    ui.stepTitle.textContent = "3. Test it";
    ui.instruction.innerHTML = `
      <span>I'm about to: </span>
      <select id="meant"><option value="whisper">whisper</option><option value="normal" selected>talk normally</option><option value="shout">shout</option></select>`;
  }
  const c = state.calibration;
  ui.calText.textContent =
    `Calibration: whisper ${c.whisperDb.toFixed(1)} dB / breathy ${c.whisperFlatness.toFixed(2)}; ` +
    `normal ${c.normalDb.toFixed(1)} dB / breathy ${c.normalFlatness.toFixed(2)}; ` +
    `shout ${c.shoutDb !== undefined ? c.shoutDb.toFixed(1) + " dB" : "not calibrated"}`;
}

ui.skipShout.addEventListener("click", finishCalibration);
ui.recal.addEventListener("click", () => {
  state.attempts = [];
  renderAttempts();
  ui.resultBox.hidden = true;
  startCalibration();
});

function handleUtterance(m: Measure): void {
  if (state.step) {
    state.samples[state.step].push(m);
    showMeasure(m, null);
    if (state.samples[state.step].length >= SAMPLES_PER_STEP) {
      const next = STEP_ORDER[STEP_ORDER.indexOf(state.step) + 1];
      if (next) {
        state.step = next;
        renderStep();
      } else {
        finishCalibration();
      }
    } else {
      renderStep();
    }
    return;
  }
  const meant = (document.getElementById("meant") as HTMLSelectElement | null)?.value as Step | undefined;
  const verdict = judge(m, state.calibration);
  state.attempts.push({ n: state.attempts.length + 1, meant: meant ?? "normal", measure: m, verdict, settings: options() });
  showMeasure(m, verdict);
  renderAttempts();
}

// ---- Live meter ----

function tick(): void {
  if (state.mic) {
    const f = state.mic.frame();
    if (state.recording) state.frames.push(f);
    ui.meterFill.style.width = `${Math.min(100, Math.max(0, ((f.db - METER_MIN_DB) / -METER_MIN_DB) * 100))}%`;
    ui.liveText.textContent = `Live: ${f.db.toFixed(1)} dB · breathy ${f.flatness.toFixed(2)}`;
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
  ui.ptt.textContent = "Listening… let go when done";
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

  if (durationMs < MIN_RECORDING_MS) {
    ui.hint.textContent = "Too short, so ignored. Keep holding while you speak.";
    return;
  }
  ui.hint.textContent = "Hold the button (or the space bar) while you speak, then let go.";
  handleUtterance(measure(state.frames, durationMs));

  if (state.playbackUrl) URL.revokeObjectURL(state.playbackUrl);
  state.playbackUrl = URL.createObjectURL(blob);
  ui.playback.src = state.playbackUrl;
  ui.playback.hidden = blob.size === 0;
}

ui.ptt.addEventListener("pointerdown", (e) => { ui.ptt.setPointerCapture(e.pointerId); startTalking(); });
ui.ptt.addEventListener("pointerup", () => void stopTalking());
ui.ptt.addEventListener("pointercancel", () => void stopTalking());
ui.ptt.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  e.preventDefault();
  startTalking();
});
window.addEventListener("keyup", (e) => { if (e.code === "Space") void stopTalking(); });

// ---- Results ----

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(2) : "–";
}

function showMeasure(m: Measure, v: Verdict | null): void {
  ui.resultBox.hidden = false;
  ui.verdict.textContent = v ? v.loudness : "Got it";
  ui.verdict.className = `verdict ${v ? v.loudness : ""}`;
  ui.resultText.textContent =
    `${m.speechDb.toFixed(1)} dB · breathy ${m.flatness.toFixed(2)} · ${(m.durationMs / 1000).toFixed(1)} s` +
    (v ? ` · volume ${fmt(v.volumeScore)} · breath ${fmt(v.breathScore)} · combined ${fmt(v.combined)} (under 0.5 = whisper)` : "");
}

function renderAttempts(): void {
  ui.attemptsBox.hidden = state.attempts.length === 0;
  ui.rows.innerHTML = "";
  for (const a of [...state.attempts].reverse()) {
    const tr = document.createElement("tr");
    for (const c of [String(a.n), a.meant, a.verdict.loudness, a.measure.speechDb.toFixed(1),
      a.measure.flatness.toFixed(2), fmt(a.verdict.combined)]) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    if (a.meant !== a.verdict.loudness) tr.style.color = "var(--shout)";
    ui.rows.appendChild(tr);
  }
  const right = state.attempts.filter((a) => a.meant === a.verdict.loudness).length;
  ui.score.textContent = state.attempts.length ? `${right}/${state.attempts.length} right` : "";
}

function report(): object {
  return {
    device,
    userAgent: navigator.userAgent,
    applied: state.mic?.appliedSettings() ?? null,
    calibration: state.calibration,
    calibrationSamples: state.samples,
    attempts: state.attempts,
  };
}

ui.send.addEventListener("click", () => {
  ui.send.disabled = true;
  fetch("/__spike/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report()) })
    .then((r) => { ui.send.textContent = r.ok ? "Sent ✓" : `Failed (${r.status})`; })
    .catch(() => { ui.send.textContent = "Failed: is the laptop running npm run dev?"; })
    .finally(() => { ui.send.disabled = false; setTimeout(() => (ui.send.textContent = "Send results to laptop"), 2500); });
});

ui.copy.addEventListener("click", () => {
  navigator.clipboard.writeText(JSON.stringify(report(), null, 1)).then(
    () => { ui.copy.textContent = "Copied"; setTimeout(() => (ui.copy.textContent = "Copy as text"), 1500); },
    () => { ui.copy.textContent = "Copy failed"; },
  );
});
