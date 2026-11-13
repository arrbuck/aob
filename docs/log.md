# Technical log

Newest entries at the bottom. Plain technical English: what was done, how, and why.

## 2026-11-12 — session 1

### Context
- An earlier session did research only and ended before writing any files. Its findings were recovered and are summarised below.

### Research findings (checked against live docs on 2026-11-12)
- **Whisper on Workers AI:** model `@cf/openai/whisper-large-v3-turbo`. Accepts audio as a base64 string. Returns the transcript plus word-level timings (useful later for lip-sync).
- **Workers AI pricing:** 10,000 "neurons" per day free; then $0.011 per 1,000 neurons.
- **Workers static assets limits:** 20,000 files per version (free), 100,000 (paid); 25 MiB max per file.
- **R2 (object storage):** 10 GB-month free, 1M Class A / 10M Class B operations free per month, zero egress fees.
- **Jev (TypeSafe AI):** TypeSafe paused direct sign-ups in September 2026. Reachable via OpenRouter: `POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.14` (pinned) or `~typesafe/jev-latest`. Needs an OpenRouter account with prepaid credit; roughly $0.00002 per call.
- **Workers AI JSON mode:** `response_format: { type: "json_schema", json_schema: {...} }` (OpenAI-style) forces structured output from supported LLMs — the fallback decision-model option.
- **Rate limiting:** Workers have a built-in `ratelimits` binding (configured in wrangler config, e.g. 50 requests per 10 s per key).
- **Tooling versions (npm, today):** vite 8.3.8, typescript 7.0.2, @cloudflare/vite-plugin 1.69.1, @vitejs/plugin-basic-ssl 2.3.0, wrangler 4.161.0.

### Decisions
- Subdomain: `aob.<domain>` (domain name to be supplied).
- Private GitHub repo named `aob`.
- Include Jev in the decision-model comparison (user to sign up to OpenRouter when needed).
- Deployment is premature; work local-first, deploy only when there's a reason.

### Steps
- Created `docs/design.md` (the brief) and this log.
- **Minimal Vite + strict TypeScript project**, written by hand rather than via a template so every file is understood:
  - `package.json` — project manifest. Scripts: `npm run dev` (dev server, `--host` exposes it on the local network), `npm run build` (type-check then bundle into `dist/`), `npm run typecheck`.
  - `tsconfig.json` — TypeScript settings. `strict` plus extra checks (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused locals/params). `noEmit`: TypeScript only checks; Vite does the actual bundling.
  - `vite.config.ts` — adds `@vitejs/plugin-basic-ssl`, which serves the dev site over HTTPS with a self-signed certificate. Needed because browsers only grant microphone access on HTTPS (or localhost), so phone testing over Wi-Fi requires it.
  - `index.html` + `src/main.ts` — a placeholder page.
  - `.gitignore` — keeps `node_modules/`, `dist/`, `.wrangler/` and all secret files (`.dev.vars`, `.env`) out of git.
  - `.gitattributes` — normalises line endings to LF in the repo (silences Windows CRLF warnings, avoids noisy diffs).
- Installed dev dependencies (exact versions): vite 8.3.8, typescript 7.0.2 (the new native "Go" compiler; `tsc` works as before), @vitejs/plugin-basic-ssl 2.3.0. `package-lock.json` pins the full dependency tree.
- Verified: `npm run typecheck` passes; `vite build` produces a 0.9 kB bundle.
- `git init -b main` — local repository on branch `main`. Commits use the existing global git identity.
- Added `docs/git-cheatsheet.md` (everyday git commands).
- **GitHub:** private repo `aob` created on github.com (empty, no README). Remote `origin` points at it over HTTPS; first push with `git push -u origin main` (`-u` sets upstream so later `git push` needs no arguments). Authentication via Git Credential Manager (bundled with Git for Windows): browser OAuth flow, which redirects to a temporary local listener on `127.0.0.1:<port>` to hand the one-time code back to git; the token is then stored in Windows Credential Manager, not in the repo. Verified with `git ls-remote origin` — remote `main` matches local `59fe387`.
- **Commit identity cleanup:** the first commits carried a personal email in their author/committer fields (git records these in every commit). Fix:
  - Backed up the whole repo first with `git bundle create <file> --all` (a single-file copy of every commit; restorable with `git clone <file>`).
  - Set a repo-local identity (`git config user.name` / `user.email`, without `--global`, so it only affects this project) to the GitHub-provided noreply address.
  - Rewrote all commits: `git rebase --root --exec "git commit --amend --no-edit --reset-author"`. This replays every commit from the first one and re-stamps the author with the current identity. File contents unchanged (`git diff old new` empty); commit IDs change because they're hashes that include the author.
  - The old GitHub repo still holds the old commits, so it's being deleted and recreated rather than force-pushed (GitHub can keep overwritten commits reachable for a while). GitHub's "block command line pushes that expose my email" setting rejects future pushes containing the personal address.
  - After recreating the GitHub repo and pushing: verified `origin/main` == local `main` and that GitHub's history contains only the noreply address.
  - Purged the old commits locally: `git reflog expire --expire=now --all` (drops git's undo history that still pointed at them) then `git gc --prune=now` (deletes unreferenced objects). Deleted the backup bundle. Verified no trace of the old identity remains.
- **Account security:** two-factor authentication enabled on GitHub and CF.
- **Secret scanning with Gitleaks 8.30.1** (installed via `winget install --id Gitleaks.Gitleaks -e`):
  - `.githooks/pre-commit` — a shell script git runs before each commit (Git for Windows runs hooks with its bundled shell). It runs `gitleaks git --pre-commit --staged --redact`, which scans only the changes being committed; non-zero exit blocks the commit. Fails closed: if Gitleaks isn't installed, the commit is refused.
  - `git config core.hooksPath .githooks` — points git at that folder. Hooks normally live in `.git/hooks`, which isn't version-controlled; keeping them in `.githooks/` means the hook itself is in git. The config setting is local, so a fresh clone needs it re-run (noted in the cheat sheet).
  - Verified: full history scan (`gitleaks git .`) found no leaks across 6 commits; a test commit containing a fake GitHub-token-shaped string was blocked.
  - Limits: pattern-based, so it catches known key formats and high-entropy strings, not everything. `git commit --no-verify` skips hooks — never use it.
- **Plan check:** CF account is on the Workers Free plan. Per CF's pricing docs, once the free Workers AI allocation (10,000 neurons/day, resets 00:00 UTC) is used, further calls fail with an error; Free plan can't be billed for overage.
- **Local CF Worker** (nothing deployed):
  - Installed `@cloudflare/vite-plugin@1.69.1` and `wrangler@4.161.0` as project dev dependencies (pinned, so the project doesn't depend on whatever global Wrangler version is cached).
  - npm 11 blocked postinstall scripts for `esbuild` and `workerd` (CF's local Workers runtime). This is an npm supply-chain safety feature: packages can't run code at install time unless approved. Both work without their scripts (their native binaries arrive as normal optional dependencies), so nothing was approved. `npm install-scripts ls` shows the list.
  - `wrangler.jsonc` — Worker config, committed, no secrets. Key settings: `main` (entry file), `compatibility_date` (pins runtime behaviour), `workers_dev: false` (no accidental public `*.workers.dev` deploy), `assets.run_worker_first: ["/api/*"]` (API routes hit the Worker; everything else is static files), `ai` binding with `remote: true` (Workers AI models always run on CF's servers, even locally), `ratelimits` binding `AI_LIMITER` (20 requests / 60 s per key; period must be 10 or 60).
  - **Bindings** = capabilities CF injects into the Worker as properties of `env` (e.g. `env.AI`). No API key is needed for CF's own services; access comes from the account the Worker runs under (locally: the Wrangler login).
  - `worker/index.ts` — Worker entry. `fetch(request, env)` handles every `/api/*` request. `GET /api/health` → `{"ok":true}`; other `/api/*` → 404 JSON.
  - `npx wrangler types` generated `worker-configuration.d.ts`: TypeScript definitions for CF's runtime plus our `Env` (AI, AI_LIMITER). Re-run (`npm run types`) after changing `wrangler.jsonc`. Committed so a fresh clone type-checks.
  - `tsconfig.worker.json` — separate TypeScript settings for the Worker (no browser DOM types; CF runtime types instead). `npm run typecheck` now checks both page and Worker.
  - `vite.config.ts` — added `cloudflare()` plugin: `npm run dev` runs page and Worker on one HTTPS address.
  - Secrets: `dev.vars.example` (names only, committed; originally `.dev.vars.example`, renamed — see below) → copied by the user to `.dev.vars` (values, git-ignored) when a key is needed. Note: never prefix secrets with `VITE_`; Vite embeds `VITE_*` env vars into browser code.
  - Verified with the dev server: `/api/health` → `{"ok":true}`, `/api/nope` → 404, `/` → the page. Startup takes ~10 s while it opens the remote AI connection.
  - Dev-server shortcut `t` starts a CF tunnel (makes the local server reachable from the internet). Not to be used.
- **Keeping secrets away from Claude Code:** `.claude/settings.json` (project settings, committed) has `permissions.deny` rules for `Read` and `Edit` on `**/.dev.vars`, `**/.dev.vars.*`, `**/.env`, `**/.env.*`. Deny rules override any allow rule or permission mode. Tested with a dummy file: the Read tool was refused, and a PowerShell command writing to `.dev.vars` was refused too. Not a guaranteed wall against every shell route, so the standing rule (Claude never opens or prints secret files) still applies.
  - Template renamed `.dev.vars.example` → `dev.vars.example` (no leading dot) so the `.dev.vars.*` deny rule and `.gitignore` rule don't catch it; the `!.dev.vars.example` gitignore exception was removed as no longer needed.
- **Voice spike, stage A (loudness only, no network):**
  - `src/spike/loudness.ts` — pure maths, no browser APIs (engine-agnostic, testable):
    - `rmsDb`: root-mean-square level of a block of samples in dBFS (decibels relative to full scale: 0 = loudest possible, about -100 = silence).
    - `spectralFlatness`: geometric mean ÷ arithmetic mean of power across 300 Hz–4 kHz. Near 0 for voiced (tonal) sound, higher for breathy noise. Whispers have no vocal-cord vibration, so they should score higher. That gives a second cue besides volume, which matters if automatic gain control flattens loudness.
    - `summarise`: per utterance, "speech level" = mean of the loudest half of frames (ignores pauses between words); peak; mean flatness; classification against two thresholds (default whisper < -38 dB, shout > -18 dB; placeholders until measured).
    - Verified with synthetic signals: 0.5-amplitude sine → -9.0 dB, ÷100 → -49.0 dB; flatness of a pure tone 0.000, flat noise 1.000.
  - `src/spike/mic.ts` — `getUserMedia` with the three processing constraints (`autoGainControl`, `noiseSuppression`, `echoCancellation`) set from checkboxes; reports `track.getSettings()` so we see what the browser actually applied (it can ignore requests). Web Audio `AnalyserNode` (FFT 2048, no smoothing) read once per animation frame. `MediaRecorder` records each utterance; preferred formats WebM/Opus (Chrome, Android, Firefox) then MP4 (iPhone Safari). Audio context is created inside a tap because iOS only allows audio after a user gesture.
  - `src/main.ts` + `src/style.css` — test page: mic toggles, live meter with threshold marks, push-to-talk (pointer events with pointer capture so a finger sliding off doesn't stop it; space bar on desktop; 10 s cap), verdict, playback of your own recording (local blob URL), threshold sliders that re-score past attempts, attempts table with "meant vs got" score and copy-as-text for recording findings.
- **Stage A results: desktop, built-in laptop mic, 15 attempts, no shouting possible (quiet environment).**
  - Attempts 1–3 (0.1–0.2 s) were accidental taps with no speech; excluded. The page should ignore presses under ~0.5 s.
  - AGC off, speech level: normal -38.3 to -40.8 dB (4 attempts); whisper -45.7 to -54.2 dB (4). A threshold near -43 dB separates them; the default -38 was too high, so every "normal" scored as whisper.
  - AGC off, breathiness: normal 0.05–0.09; whisper 0.11–0.21. Separates cleanly at about 0.10, independent of volume.
  - AGC on: everything ~13 dB louder (normal -25.3, a whisper -31.3), so the whisper landed louder than an AGC-off normal voice. Volume thresholds don't carry across settings. The whisper's breathiness (0.21) still stood well above normal (0.07). One sample each, so indicative only.
  - Noise suppression on: whispers survived (-49.6 to -54.2 dB) but breathiness fell to 0.11–0.14, closer to normal's 0.06–0.07. Noise suppression seems to strip some of the breath noise the whisper detector relies on.
  - Shout: one restrained attempt with AGC on (-18.2 dB). Not enough data.
  - Takeaways: (1) absolute dB thresholds are device- and setting-specific, so per-player calibration is needed; (2) breathiness is a promising volume-independent whisper cue, even under AGC; (3) request AGC and noise suppression off; (4) shouting may be impractical for many players. Design question raised with the user.
## 2026-11-13

- **Housekeeping:** `creative/` git-ignored (verified with `git check-ignore -v`), holding reference notes from Claude Cowork / ChatGPT / claude.ai with its own `INDEX.md`. Added `CLAUDE.md` (project notes for Claude Code: how to run, conventions, `creative/` rules) and `docs/security.md` (security summary, kept current).
- **Plugins assessed, none installed:** typescript-lsp, security-guidance, code-review, and CF's `cloudflare/skills`. Notes are in `creative/plugin-assessment.md`.
- **Design decision recorded in `docs/design.md`:** core voice mechanic is whisper vs speak; shouting is an optional bonus, with an on-screen shout alternative.
- **Voice spike stage A, revision 2:**
  - Classifier rewritten (`src/spike/loudness.ts`). Per-player **calibration**: 3 whispers, 3 normal, then up to 3 optional shouts, averaged into a `Calibration` (whisper/normal speech dB and breathiness, optional shout dB). `judge()` scales each cue so 0 = this player's whisper and 1 = their normal voice, averages the usable cues, and calls it a whisper if the result is under 0.5. A cue is dropped if calibration showed no gap for it (e.g. auto gain flattening volume). Shout = louder than halfway between normal and calibrated shout, or 14 dB above normal if shout was skipped.
  - Replaying the 7 valid desktop attempts from 2026-11-12 (calibrated on 2 whispers + 2 normals with all processing off): **7/7 correct**, including noise-suppressed attempts the old fixed threshold got wrong.
  - Page (`src/main.ts`) reworked into a guided flow: enable mic → calibrate (with phrases to say) → test. Presses under 0.5 s are ignored. Mic switches, applied settings, live numbers, calibration values and playback moved into a collapsed "Advanced" section.
  - **"Send results to laptop":** dev-only Vite middleware (`vite.config.ts`, `apply: "serve"`, so it never exists in a build or deploy). `POST /__spike/results` takes JSON up to 256 KB and appends one line to `spike-results/results.jsonl` (git-ignored). Numbers only, no audio. Other methods get 405; invalid JSON gets 400. Tested: valid POST 204, GET 405.
  - `vite.config.ts` now uses Node's file APIs, so it has its own `tsconfig.node.json` (Node types via `@types/node@24`, matching Node 24). It's kept apart from browser code so the page can't accidentally use Node-only features. `npm run typecheck` checks page, Worker and config.

- **Desktop results via "Send to laptop" didn't arrive.** The dev server was running from the right folder and the route answered a test POST correctly (probe entry then deleted), so the problem was on the page side. Likely cause: the button only appears after at least one test-step attempt, or the page was stale. To check with the user.
- **Workers AI data policy (checked 2026-11-13):** for standard inference CF "does not retain inputs or outputs after they are no longer needed" and "does not use Customer Content processed by Workers AI to train AI models". Only operational metadata (timestamps, sizes) is kept. Storage happens only if we opt into features like AI Gateway logging, R2 or KV.
- **Voice spike stage B: speech-to-text.**
  - Worker `POST /api/transcribe` (`worker/index.ts`): raw audio body; content type must be one of webm/mp4/ogg/wav/mpeg (else 415); 1 MB cap (413); rate-limited per client IP via `AI_LIMITER` (429; locally there's no client IP, so one shared bucket). Audio is base64-encoded in 32 KB chunks (a single `btoa` on a large buffer can overflow the stack) and sent to `@cf/openai/whisper-large-v3-turbo` with `language: "en"` and `vad_filter: true` (voice activity detection trims silence). Returns transcript, segments and per-word timings, plus server-side STT time. Responses are `Cache-Control: no-store`; nothing is logged or stored.
  - Whisper input/output schemas read from CF's `schema-input.json` / `schema-output.json`: output includes `text`, `segments[].words[]` with start/end seconds (usable for lip-sync later), `transcription_info.duration`. Price: $0.000513 per audio minute, ≈46.6 neurons/min, so the free 10,000 neurons/day ≈ 214 minutes of audio.
  - Tested with synthetic speech (Windows built-in voice, converted with ffmpeg), 6.8 s clip: WebM/Opus 26.6 KB → 1.48 s STT, perfect text; MP4/AAC 51.1 KB → 2.26 s STT, perfect text. Both formats accepted, so iPhone (MP4) and Chrome/Android (WebM) recordings work without conversion. A `text/plain` upload was refused with 415.
  - Page: in the test step, each recording is POSTed to `/api/transcribe` (calibration recordings are not sent). New per-attempt fields: distance from mic (close / arm's length / across the room), optional prompted phrase, transcript, **word error rate** (`src/spike/wer.ts`: word-level edit distance ÷ phrase length, after lower-casing and stripping punctuation; checked: identical 0, 1 of 4 wrong 0.25, nothing heard 1), STT and round-trip time, estimated cost.
  - Why distance matters: players won't always be close to the mic. Distance lowers level and adds room echo, which should hurt both whisper detection (breath noise fades into background) and transcription. Test matrix: whisper / normal / shout × close / arm's length / far.

- "Send results to laptop" is now always visible (it was hidden until the first test attempt, which is why the earlier send never happened). The report includes a `stage` field (e.g. `calibrating (normal)`) so partial results can be interpreted.
- Added `PLAN.md` (status table, findings, open decisions, later stages) and a handoff section in `CLAUDE.md`.

- **Security practice for API keys** (applies from here on): paste keys only into `.dev.vars` (via Notepad) or the `wrangler secret put` prompt; never into chat or code. One key per purpose with a spending cap; separate local and production keys; keep a copy in a password manager; if a key leaks, revoke and replace it (removing it from files/git doesn't un-leak it). The Wrangler OAuth login has broad account scope; replace with a scoped API token before any deploy.
