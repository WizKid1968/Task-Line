# OPUS promo video

Vertical (1080x1920), 42 seconds, music and sound effects, on-screen text only.
Built with HyperFrames (HTML + GSAP). Everything is made here: no stock footage,
no samples, no licensed music.

## Rebuild

From this folder:

```
python3 -I tools/make_audio.py          # makes assets/audio/music.wav and sfx.wav
npx hyperframes@0.8.183 check .          # checks layout, motion, contrast
npx hyperframes@0.8.183 snapshot . --at 3.2,13.2,21,26.8,40   # still frames
npx hyperframes@0.8.183 render . -q high -o renders/opus-promo.mp4
```

In a Claude Code cloud session, point HyperFrames at the installed browser first:
`export PRODUCER_HEADLESS_SHELL_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`

## Scenes (120 BPM, one bar = 2 s; audio timings in tools/make_audio.py match)

| Time | Scene |
|---|---|
| 0-4 | Boot: rings draw, "OPUS", "System online" |
| 4-8 | The name: OmniPotent Personal Utility System |
| 8-14 | "One number. Call it. Text it." Phone with a calendar question and answer |
| 14-22 | Six things it does: calendar, inbox, texts, contacts, research, emails on your OK |
| 22-28 | It asks before it acts: read-back, code word, lock, "Sent." |
| 28-32 | Safety: strangers get nothing, scam emails screened, every action logged |
| 32-36 | "Stop juggling apps. Just say it. Done." |
| 36-42 | Logo, tagline, "Book your setup", contact line |

Claims are limited to what Opus does today (see `.claude/skills/opus-builder/SKILL.md`).
Video creation and web building are left out until they're proven end to end.
