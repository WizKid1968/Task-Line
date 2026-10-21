# OPUS promo — version 2 plan and handoff

Status as of Oct 21, 2026. Version 1 (42 s, text only, synthesized music) is done and
delivered (`index.html`, rebuild steps in `README.md`). This file holds everything decided
for version 2 so any session can continue. **Nothing for version 2 has been generated or
spent yet.** Rudy approves the plan, then style frames, then the render.

## Rudy's direction (his words, summarized)

- Upgrade the visuals: "mind-blowing", cinematic motion graphics. Use **Higgsfield** to
  create assets, composited and animated with **HyperFrames**.
- Add a **voice-over** made with **Fish Audio, free model S2.1 Pro** (`s2.1-pro-free`).
  Voice: `d0da4f95891148c4b08f8c7e6eaeb427` ("Young Enthusiast").
- **No tech talk.** Show what Opus is and what it does for a normal person:
  - a personal AI assistant, **no download**, all you need is a phone number;
  - call it or text it and it handles things for you, everyday tasks through to
    business work;
  - **OmniPotent: the "O" stands for it can do anything you can imagine** — make the O a
    visual motif.
- Vertical 9:16. Call to action: **GETOPUS.ONLINE**, button "Book your setup".

## Open decisions (ask Rudy before building)

1. **Fish voice ID** — chosen: `d0da4f95891148c4b08f8c7e6eaeb427` ("Young Enthusiast", young energetic male). Tested, free.
2. **"Ordering lunch"** — Opus can't do this today: ordering needs payment, and Rudy's own
   safety rule is that Opus never touches money. Options: (a) leave out; (b) reword to
   something real, e.g. "finds the best lunch spot near you and texts you the menu";
   (c) build ordering later (changes the money rule).
3. **"Builds web apps for your business"** — set up but never tested end to end.
   Recommended: test once first (e.g. Opus builds a simple GETOPUS.ONLINE landing page),
   then show its real result in the ad.
4. Length ~60 s, and the script below — Rudy hasn't confirmed either yet.

## What Opus has actually done in live tests (safe to show)

Calls and texts to one number; greets the owner by name; texts people for you by name and
passes their replies back; saves and finds contacts; checks the calendar and adds events;
summarizes email and sends replies once you say OK; researches questions and texts the
answer with sources; a trusted person can use it with their own code word; nothing
permanent happens without a yes (plus a code word on texts); strangers get nothing; scam
emails are screened before opening.

Not yet proven: making videos/images, building web pages/apps, ordering anything.

## Draft script (everyday words; revise with Rudy)

| Time | On screen | Narrator |
|---|---|---|
| 0–4 | The "O" forms from light | "What if you had an assistant who could do almost anything?" |
| 4–9 | OPUS, a phone number, "no app to download" | "Meet Opus. No app to download. Just a phone number. Call it or text it." |
| 9–17 | Text sent for you, reply comes back | "Need to text someone? Just say so. Opus sends it and brings their reply back to you." |
| 17–25 | Calendar + inbox | "It checks your schedule, books your meetings, reads your email and replies when you say OK." |
| 25–32 | Questions answered | "Ask it anything. It finds the answer and texts it back." |
| 32–42 | Bigger jobs (only what's proven, or tested first) | e.g. "Need a website for your business? Just ask." |
| 42–50 | Your yes, your code word | "And nothing happens without your okay." |
| 50–62 | The O → OPUS → GETOPUS.ONLINE | "Opus. OmniPotent. Your personal assistant, one call away. Get yours at getopus dot online." |

## Tools — verified status

- **Fish Audio:** working. `POST https://api.fish.audio/v1/tts`, header `model: s2.1-pro-free`,
  JSON `{"text", "reference_id": "<voice id>", "format": "mp3"}`. The key is a network secret
  (`Authorization: Bearer`). Verified free: the balance didn't change after a line.
  Samples made: `review/fish-voices/` (not committed). Avoid voices cloned from real people
  or famous characters (commercial use).
- **Higgsfield (pay-per-use API):** working in the builder environment (verified Oct 21,
  16:43 UTC, after Rudy corrected the network secret; prefix `Key`, value `id:secret`). Use
  `tools/higgsfield/hf_cli.py` per `.claude/skills/higgsfield-api/SKILL.md`. Free key check:
  `POST https://api.higgsfield.ai/files/generate-upload-url` with `{"content_type":"image/png"}`
  must return `upload_url`, not 401.
  Allowed domains also needed: `d3snorpfx4xhv8.cloudfront.net` (finished files) and
  `fnf-api-input-prod-20250414194641741400000002.s3.amazonaws.com` (uploads). Output files
  may use other hosts; check the first result. **Quote the price and get Rudy's yes before
  each batch.** Stills first, then animate only the approved ones.
- **HyperFrames:** local, v0.8.183. Export
  `PRODUCER_HEADLESS_SHELL_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.
  No GPU here: WebGL/WebGPU shader effects may not render; test each effect first. The
  registry (`npx hyperframes catalog --query ...`, `npx hyperframes add ...`) works.
  Candidates: light-leak / organic-light-leak-overlay, chromatic-aberration-wipe,
  grain-overlay, particle-image-reveal, device-frame-stage, parallax-device-dive.
- Local backup voice: Kokoro via `npx hyperframes tts` (needs a venv with
  `kokoro-onnx soundfile`, `HYPERFRAMES_PYTHON` pointing to it).

## Order of work once approved

1. Lock the script and voice; generate the voice-over (Fish).
2. Higgsfield stills (priced first) → 3–4 style frames composited in HyperFrames → Rudy approves.
3. Animate the approved stills (priced first) → full edit, captions synced to the voice,
   music lowered under the voice → frames to Rudy.
4. Render, check frames from the MP4 itself, send.
