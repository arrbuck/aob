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
  - Secrets: `.dev.vars.example` (names only, committed) → copied by the user to `.dev.vars` (values, git-ignored) when a key is needed. `.gitignore` gained `!.dev.vars.example` because the `.dev.vars.*` rule would otherwise hide the template. Note: never prefix secrets with `VITE_`; Vite embeds `VITE_*` env vars into browser code.
  - Verified with the dev server: `/api/health` → `{"ok":true}`, `/api/nope` → 404, `/` → the page. Startup takes ~10 s while it opens the remote AI connection.
  - Dev-server shortcut `t` starts a CF tunnel (makes the local server reachable from the internet). Not to be used.
