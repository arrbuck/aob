# Plan

Stages and status. Kept short while big decisions (art style, engine) are open. Details of what was done: `docs/log.md`.

## Session 1 (2026-11-12/13): foundations, voice spike, assessment
| Item | Status |
|---|---|
| Repo, Vite + strict TS, git, private GitHub | ✅ Done |
| Local CF Worker (AI + rate-limit bindings), secrets setup | ✅ Done (nothing deployed) |
| Security: Gitleaks hook, noreply identity, 2FA, Claude deny rules, `docs/security.md` | ✅ Done |
| CLAUDE.md, docs/design.md, this plan | ✅ Done |
| Voice spike A: loudness, calibration, whisper detection | ✅ Built; desktop tested |
| Voice spike B: Whisper speech-to-text | ✅ Built; synthetic test only |
| Voice spike C: decision models (Workers AI JSON vs Jev) | ⏳ Not started |
| Mobile + distance testing | ⏳ Waiting on user tests |
| docs/assessment.md (controls, hosting, voices, pipeline) | ⏳ Not started |
| Sub-agents (`.claude/agents`) | ⏸ Deferred until feature building |
| Deploy to `aob.<domain>` | ⏸ Deferred: no reason to deploy yet; needs scoped CF token first |

## Spike findings so far
- **Loudness (desktop laptop mic, 2026-11-12):** whisper vs normal separable by volume (~-50 vs ~-39 dB) and by breathiness (~0.18 vs ~0.07) with processing off. Auto gain control shifts volume ~13 dB and breaks fixed thresholds; breathiness held up. Noise suppression weakens breathiness. Per-player calibration + both cues: 7/7 on replayed data.
- **STT:** Whisper large-v3-turbo on Workers AI. Synthetic 6.8 s clip: perfect transcript; 1.5 s (WebM) / 2.3 s (MP4) processing. $0.000513 per audio minute (~214 free minutes/day). Word timings included.
- **Unknown yet:** real-voice accuracy, whisper transcription quality, distance effects, phone behaviour (esp. iPhone ignoring mic settings), decision-model latency and accuracy.

## Open decisions
- Art style (claymation, felt, cel-shaded, paper cut-out, Pixar-style…): faces with expressions are critical.
- 3D engine (Babylon.js likely, not confirmed): depends on art style.
- Decision model: pending spike C.
- Whether voice mode is viable at all: pending real-voice, mobile and distance tests.
- Claude Code plugins: all on hold (`creative/plugin-assessment.md`).

## Later stages
1. Decide art style (concept art, expression sheets) and confirm engine.
2. Meeting engine logic: agenda, presentation scripts, patience, heat, event log, HR report.
3. Pigeon mode.
4. Insects and tiger, with gore.
5. Human voice mode.
6. Full line library and voices.
7. Art pass.
8. Polish and leaderboards.
