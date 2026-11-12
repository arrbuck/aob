# AOB (Any Other Business) — design brief

The source of truth for what the game is. Decisions get recorded here as they firm up; open questions live in PLAN.md.

## The game
A comedy game about disrupting a pointless corporate meeting. Shocking and silly, with cartoon gore (red blood and viscera, stylised, never realistic). Browser-based, on both phone and desktop.

### Modes
- **Human (first person, voice):** whisper to neighbours or shout at the room. Mic volume decides who hears. An HR "heat" meter escalates (warning → moved seats → HR joins → security escort). Getting fired ends the run with a scored exit interview.
- **Insects (mosquito, bee, wasp), pigeon, and an unlockable tiger:** third-person score-attack runs, each with its own jeopardy.

### Characters
Puzzles with hidden triggers and breaking points: Boss, Bore, Obnoxious Bloke, Suck-up, Cynic, Remote Guy, etc. Diverse cast; characters are hated for behaviour, never identity. Scoring rewards punching up.

### Meetings
Timed levels with an agenda, long presentation scripts held as data (which get interrupted and derailed), and three star objectives. End-of-run HR incident report generated from an event log.

### Hard rule
Identity-based abuse (racist, sexist, homophobic, etc.) is a dead end in-game: zero points, the whole room turns on you, instant HR.

## Decided
- Vite + strict TypeScript, code-first (no editor-driven engine).
- A Cloudflare Worker sits between the game and any paid/AI service and holds all secrets. Anything that calls an AI service is rate-limited.

## Working assumptions (to test, not decisions)
- Voice pipeline candidate:
  1. Mic loudness in the browser classifies whisper vs shout.
  2. Speech-to-text via Whisper on Cloudflare Workers AI.
  3. A typed decision model (e.g. Jev from TypeSafe AI) behind a swappable interface. Alternatives: a small LLM on Workers AI returning JSON; the open-weight Laya later.
  4. Game rules apply consequences.
  5. The reaction is picked from a finite, pre-voiced line library keyed by character × category × intensity.
- Hosting everything on Cloudflare.
- Check current docs for every service rather than relying on memory.

## Not decided — don't commit to these
- **Art style:** completely open (claymation, felt puppets, cel-shaded, paper cut-out, Pixar-style, others). Faces with changing expressions are critical whatever we choose.
- **3D engine:** Babylon.js is likely but not confirmed; depends on art style. Game logic stays engine-agnostic.

## Platform constraints
- Must work on phone (touch-first) and desktop.
- Dev machine has no real GPU (integrated AMD), 16 GB RAM — affects local AI/TTS options.
