# Security

Plain-English summary of every security measure in this project, and the rules to follow. Keep this current whenever anything security-related changes.

_Last updated: 2026-11-12_

## Secret files
| File | What it's for | In git? |
|---|---|---|
| `.dev.vars` | Real API keys for local testing, read by the Worker during `npm run dev` | **No**, git-ignored |
| `.dev.vars.*`, `.env`, `.env.*` | Other secret-file variants (none in use yet) | **No**, git-ignored |
| `dev.vars.example` | Template listing key **names only**, no values | Yes |

Online, keys will live in CF's encrypted Worker secrets (set with `npx wrangler secret put NAME`, which prompts for the value and never writes it to a file). Nothing is deployed yet, so none exist.

## What keeps secrets out of git
- **`.gitignore`** excludes `.dev.vars`, `.dev.vars.*`, `.env`, `.env.*`, plus `node_modules/`, `dist/`, `.wrangler/` (local CF cache), `*.log` and `creative/`.
- **Gitleaks pre-commit hook** (`.githooks/pre-commit`): every commit is scanned for anything that looks like a key, token or password, and blocked if found. It fails closed: if Gitleaks isn't installed, commits are refused. Git is pointed at the hook with `git config core.hooksPath .githooks`; re-run that on any fresh copy of the repo. Full history scan: `gitleaks git . --redact`.

## What keeps secrets away from Claude Code
- **`.claude/settings.json`** denies Claude Code's file-reading and file-editing tools access to `.dev.vars`, `.dev.vars.*`, `.env` and `.env.*`, anywhere in the project. Tested: reads were refused, and so was a shell command writing to `.dev.vars`.
- It isn't a guaranteed wall against every possible shell command, so the standing rule also applies: Claude never opens, prints or edits secret files.

## Keys never reach the browser
- Only the CF Worker (`worker/`) talks to AI or paid services and holds keys. The page calls `/api/...` on our own site.
- Never prefix a secret with `VITE_`: Vite copies `VITE_*` values into browser code.
- Worker code must never log or return secret values.

## Accounts
- **Two-factor authentication** is on for GitHub and CF. Authenticator app backup is on; recovery codes are stored separately from the phone.
- **GitHub login** (for `git push`) is stored by Git Credential Manager in Windows Credential Manager, not in the project.
- **CF login** (Wrangler) is an OAuth token stored in a plain file in the user profile, with broad access to the whole CF account. Acceptable for local work; **replace it with a scoped API token (this project only) before any deploy.**

## Commit identity
- This repo commits as the GitHub **noreply** address (repo-local git config), so the personal email isn't published.
- Earlier commits that carried the personal email were rewritten, the old GitHub repo was deleted and recreated, and the old commits were purged locally.
- GitHub settings: "Keep my email addresses private" and "Block command line pushes that expose my email" are both on.

## Limiting abuse and cost
- **Rate limit:** Worker binding `AI_LIMITER`, 20 requests per 60 seconds per key, for anything that calls an AI service.
- **CF Workers Free plan:** once the free AI allowance (10,000 neurons/day, resets 00:00 UTC) is used, calls fail; it can't bill.
- **Recording cap:** the voice test stops recording after 10 seconds.
- **No public address:** `workers_dev: false` in `wrangler.jsonc` stops accidental deploys to a public `*.workers.dev` URL.
- **npm install scripts:** npm blocks packages from running code at install time unless approved. None approved so far (`npm install-scripts ls`).

## Privacy
- Stage A voice test: audio stays in the browser.
- From stage B: speech recordings go to CF's Whisper for transcription; only text goes to decision models. The Worker stores nothing.
- `creative/` is git-ignored, so it is **not backed up to GitHub**. Back it up separately if it matters.

## Rules to follow
1. Paste API keys only into `.dev.vars` (via Notepad) or the `wrangler secret put` prompt. Never into chat, code or any committed file.
2. One key per purpose, with a spending cap where the provider allows it. Separate keys for local testing and the live game.
3. Keep a copy of each key in a password manager.
4. **If a key leaks, revoke it and create a new one.** Deleting it from files or git history doesn't undo a leak.
5. Run `git status` before committing. If `.dev.vars` or `.env` ever appears, stop.
6. Never bypass the Gitleaks hook (`git commit --no-verify`).
7. Don't run `npm run dev` on public Wi-Fi (other people on the network could reach it). Don't press `t` in the dev server (it opens a public tunnel).
8. Don't deploy without first switching to a scoped CF API token.
