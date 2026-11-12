# Git cheat sheet

All commands run in **PowerShell**, in the project folder. Start every session with:

```
cd C:\dev\aob
```

## The everyday loop
| What | Command |
|---|---|
| What's changed since the last save? | `git status` |
| Show the actual line changes | `git diff` |
| Save a snapshot (a "commit") of everything | `git add -A; git commit -m "Short description of what changed"` |
| Upload commits to GitHub | `git push` |
| All of the above in one go | `git add -A; git commit -m "Describe the change"; git push` |

A **commit** is a save point on your laptop. A **push** copies your commits to GitHub (the backup). Commits are free and instant, so make them often.

## Looking back
| What | Command |
|---|---|
| List recent commits | `git log --oneline -15` |
| What changed in one commit | `git show <id>` (the id is the 7-character code from `git log`) |
| Who/what changed a file over time | `git log --oneline -- docs/PLAN.md` |

Press `q` to leave any screen that fills the window.

## Undoing (safe ones)
| What | Command |
|---|---|
| Throw away unsaved changes to one file | `git restore path\to\file` |
| Unstage something you `git add`-ed by mistake | `git restore --staged path\to\file` |
| Undo a commit by adding a new "reverse" commit | `git revert <id>` |

Avoid `git reset --hard` and `git push --force` unless you've asked first: they delete history.

## Secret scanning
Every commit is checked automatically by Gitleaks. If it finds something that looks like a key, the commit is refused and it tells you which file and line. Remove the secret and commit again.

- Never bypass it with `--no-verify`.
- Scan the whole history by hand: `gitleaks git . --redact`
- On a fresh copy of the repo (new laptop), switch the check on once with: `git config core.hooksPath .githooks`

## Never commit
Secrets: API keys live in `.dev.vars` (local) and Cloudflare Worker secrets (online). `.gitignore` already blocks `.dev.vars` and `.env` files. If `git status` ever lists one, stop and ask.
