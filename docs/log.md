# Technical log

Newest entries at the bottom. Plain technical English: what was done, how, and why.

## 2026-11-12 — session 1

### Context
- A first session (ID d0bc28dc) ran ~7 minutes doing research only, then ended when the folder was opened in VS Code. It wrote no files (Claude Code's session stats: 0 lines added). Its research findings were recovered from the transcript in `~/.claude/projects/C--dev-aob/` and are summarised below.

### Research findings (checked against live docs on 2026-11-12)
- **Whisper on Workers AI:** model `@cf/openai/whisper-large-v3-turbo`. Accepts audio as a base64 string. Returns the transcript plus word-level timings (useful later for lip-sync).
- **Workers AI pricing:** 10,000 "neurons" per day free; then $0.011 per 1,000 neurons.
- **Workers static assets limits:** 20,000 files per version (free), 100,000 (paid); 25 MiB max per file.
- **R2 (object storage):** 10 GB-month free, 1M Class A / 10M Class B operations free per month, zero egress fees.
- **Jev (TypeSafe AI):** TypeSafe paused direct sign-ups in September 2026. Reachable via OpenRouter: `POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.14` (pinned) or `~typesafe/jev-latest`. Needs an OpenRouter account with prepaid credit; roughly $0.00002 per call.
- **Workers AI JSON mode:** `response_format: { type: "json_schema", json_schema: {...} }` (OpenAI-style) forces structured output from supported LLMs — the fallback decision-model option.
- **Rate limiting:** Workers have a built-in `ratelimits` binding (configured in wrangler config, e.g. 50 requests per 10 s per key).
- **Tooling versions (npm, today):** vite 8.3.8, typescript 7.0.2, @cloudflare/vite-plugin 1.69.1, @vitejs/plugin-basic-ssl 2.3.0, wrangler 4.161.0.

### Decisions from the user
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
- **GitHub:** private repo `arrbuck/aob` created by the user on github.com (empty, no README). Remote `origin` = `https://github.com/arrbuck/aob.git`; first push with `git push -u origin main` (`-u` sets upstream so later `git push` needs no arguments). Authentication via Git Credential Manager (bundled with Git for Windows): browser OAuth flow, which redirects to a temporary local listener on `127.0.0.1:<port>` to hand the one-time code back to git; the token is then stored in Windows Credential Manager, not in the repo. Verified with `git ls-remote origin` — remote `main` matches local `59fe387`.
