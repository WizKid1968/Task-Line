---
name: animate
description: Edit raw footage into a finished, motion-graphics-rich video. Transcribes (if there is speech), cuts to the best take of every line or the best moments, adds motion graphics in a chosen design system (DESIGN.md) with HyperFrames, renders MP4, then applies timestamped fixes sent as follow-up jobs. Use for "animate this video", "cut and animate my footage", "edit my raw recording", "make a highlight video from these clips", or timed notes ("0:42 - move the title") about an earlier edit. Not for videos built from scratch with no footage (use motion-graphics).
---

# animate — raw footage to finished edit (worker version)

Adapted from Rudy's Mac skill (source: "Sonnet 5.5 Video Editing Guide", RoboNuggets) for the
Task-Line worker. The worker runs in the cloud, with no one watching mid-job: approval for the
job happened up front (with the code word on texts), and Rudy's changes arrive later as
follow-up jobs with timed notes.

## Rules (never break)

- **Only footage Rudy supplied** for this job (from the job's footage location). Never download
  footage from YouTube, social media or broadcasters, and never use a realistic AI likeness of a
  real person.
- Talking-head edits: only remove. Never reorder or rewrite what the speaker said.
- Never alter the voice or the footage itself. For talking-head edits, `final.mp4` has the SAME
  length as `cut.mp4` (stays in sync). Highlight/montage edits may reorder clips and add music,
  sound effects and speed ramps, as the task asks.
- Use only colours, fonts and shapes from the project's `DESIGN.md`. No generic default look.
- Fix only what the notes list. Keep everything else exact.
- Work in one project folder (e.g. `work/<project-name>/`). Do not scatter files.
- Never ask for or print an API key.

## Step 0 — Tools

- `ffmpeg` / `ffprobe`: check with `ffmpeg -version`. If missing, install (`sudo apt-get install -y ffmpeg`
  or `apt-get install -y ffmpeg`). If it can't be installed, stop and report.
- HyperFrames: https://github.com/heygen-com/hyperframes. Install the official skills before
  animating with the agent-safe command from its README: `npx -y hyperframes skills update` (core set:
  `/hyperframes` router, `hyperframes-*` domain skills, `media-use`; the router installs workflows on
  demand), then `npx hyperframes doctor`. Requirements: Node.js 22+, FFmpeg, headless Chrome. Read its guide first. **Ignore the
  HeyGen MCP `compose` / `render_video` tools: HeyGen disables them in Claude Code.**
- Pick the look PER VIDEO, in this order: (1) `DESIGN.md` provided with the job; (2) a style the
  task names from `.claude/skills/animate/designs/`; (3) otherwise choose the design file or style
  that best fits the task's mood and say which one you used in the report (Rudy can ask for a
  different one in a follow-up). Copy the chosen file into the project folder as `DESIGN.md`.

## Step 1 — Transcribe and cut (when the footage has speech)

1. Transcribe with word-level timestamps.
   - If the environment provides AssemblyAI (network secret for `api.assemblyai.com`), use it
     (fast, about $0.21/h). The environment adds the key; don't set one.
   - Otherwise use Whisper locally: `pip install faster-whisper` and run with word timestamps ON
     (CPU, slower: allow time).
2. Pick the keep list: if a line is said more than once, keep the LAST clean take. Drop stumbles,
   restarts, coughs, long pauses.
3. No one can approve mid-job, so decide the keep list yourself, conservatively (when unsure, keep).
   Save it as `keep-list.txt` and mention unsure cuts in the report with their times.
4. Cut in one ffmpeg pass → `cut.mp4`. Save the transcript of the cut.
5. Check every join for chopped words or clicks. List unsure spots with their times.

For **highlight / montage** jobs (no speech to keep), skip transcription: review the clips
(extract frames), pick the strongest moments, and build the sequence to match the task's mood
(build-up, pacing, beat-matched cuts).

## Step 2 — Animate

1. Read the project's `DESIGN.md`. Read the HyperFrames guide (and the `motion-graphics` skill for
   individual graphics: kinetic type, stat slams, lower thirds).
2. Talking head: speaker on screen the whole time, sometimes full screen, sometimes in a panel on
   the right with graphics on the left. Highlights: graphics punctuate the action.
3. Graphics match the words or the action: short titles, key words, numbers, simple diagrams, real
   logos of anything named. Time each graphic to the transcript or the moment it refers to.
4. Render MP4 (1920x1080 by default; 1080x1920 if the task asks for vertical/social) → `final.mp4`.
5. Verify: `ffprobe` duration (equal to `cut.mp4` for talking-head edits). Extract frames at start,
   middle, end and look at them. Fix anything that covers a face or runs off screen. It must feel
   like a real edited video, not a slideshow.

## Step 3 — Direct (fixes, as follow-up jobs)

Notes arrive as `m:ss - change` in a follow-up job that includes the earlier job's result. Fix each
one, re-render, change nothing else. Then add each fix to `RULES.md` in this skill folder as
`- rule — why` (commit it on the job's branch so future jobs learn it). Read `RULES.md` at the start
of every run.

## Design system setup (to add a style to the library)

Source: Refero Styles, https://styles.refero.design (2,000+ brand design systems).
1. Get the style link from the task.
2. Open the page and take its DESIGN.md (colours, fonts, spacing, shapes, components, do's and don'ts).
3. If the page will not open, report that and ask Rudy to send the copied DESIGN.md text in a follow-up.
4. Save word for word to `.claude/skills/animate/designs/<style-name>.md` (a library, not a default)
   and copy it to the project as `DESIGN.md`. Do not change the brand's rules.
5. Name the main colours and fonts in the report.
