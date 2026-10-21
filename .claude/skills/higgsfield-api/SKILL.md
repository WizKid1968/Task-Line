---
name: higgsfield-api
description: Generate images and videos through the Higgsfield REST API on Rudy's pay-per-use API key (NOT the Higgsfield subscription/credit plan) using the `hf` CLI in tools/higgsfield. Use whenever a job needs AI image or video generation — Seedance, Kling, Wan, Soul, Happy Horse, MiniMax/Hailuo, LTX, PixVerse, Grok Imagine, Recraft, Qwen Image, Ideogram, Z-Image, Cinema Studio, Genjutsu, Marketing Studio. Prefer this over the Higgsfield MCP connector tools: the connector spends subscription credits (currently 0) and the API key is what Rudy pays with.
---

# Higgsfield API (pay-per-use) — worker version

Adapted from Rudy's Mac skill for the Task-Line worker (cloud). The CLI is the same
program (`tools/higgsfield/hf_cli.py`, official `higgsfield-client` SDK), copied into
this repository.

**Do not use the Higgsfield MCP connector tools** (`mcp__Higgsfield__generate_*` and
similar). They spend subscription credits, which are 0. Checking the connector's balance
or browsing presets is fine; generating is not.

## How the key works here

The API key is a **network secret** on the worker's environment: the environment adds
`Authorization: Key <id:secret>` to every request to `api.higgsfield.ai`. You never see
the key, and must never try to read, print or guess it. The SDK refuses to start without
an `HF_KEY` value, so set a placeholder for each command:

```bash
export HF_KEY=added-by-environment
```

If requests fail with 401, the secret is missing or wrong: stop and report "Higgsfield
API key not set up on the worker". Never ask for the key.

## Commands

Run from the repository root. Install once per job:

```bash
pip install --quiet "higgsfield-client>=0.2.0,<0.3" "python-dotenv>=1.0"
export HF_KEY=added-by-environment
HF="python tools/higgsfield/hf_cli.py"
```

```bash
$HF run    <endpoint-id> --input '<json>'      # submit and wait; result JSON on stdout
$HF submit <endpoint-id> --input-file req.json # submit only; prints {"request_id": ...}
$HF status <request-id>                         # queued | in_progress | completed | failed | nsfw | canceled
$HF result <request-id>                         # wait for and print the result JSON
$HF cancel <request-id>                         # only works while still queued
$HF upload ./file.png                           # prints a public URL for image_url / video_url / audio_url
```

- `run` and `submit` print `Idempotency-Key: ...` and (`run`) `Request ID: ...` on stderr. Note both.
- If a `run`/`submit` dies before you get a request ID (timeout, network, 5xx), retry the **same endpoint and same JSON** with `--idempotency-key <that key>`. Higgsfield then returns the first job instead of billing a new one. Never retry without the key.
- A new key means a new paid job. Changing the JSON while reusing a key gives `422`.
- Long video jobs: prefer `submit`, then `result`, so the request ID is safe if a wait is cut off.
- Write request JSON to a scratch folder, not into the repository.
- Upload types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `audio/wav`.

## Money rules (worker version)

- **Every generation costs money.** Only generate on `approved_changes` jobs, and only what the
  task needs. On `read_only` jobs, never generate.
- Rudy approved the job (with his code word on texts) before the worker started, so you do not
  ask again per request. But no extra variations, re-rolls or upscales beyond what the task
  needs; if a generation fails, retry at most once.
- The API docs do not publish prices. Never guess a cost. In the report, list the endpoint(s)
  used and how many requests were made.
- Never invent an endpoint or a field. Read the model page first (below).

## Pick the model and its fields

1. Find the endpoint in `references/endpoints.md` (82 workflows, captured 2026-10-06).
2. Fetch its schema page: `curl -sL https://docs.higgsfield.ai/docs/models/<docs page>.md`. Read the required fields, allowed values and limits. Build JSON only from that page.
3. If the endpoint is not in the list, or the page 404s, re-check the live catalog:
   `https://docs.higgsfield.ai/docs/models/video-generation.md` and `.../image-generation.md`.
   Report if it is still missing. Do not swap in another model unless the task allows it.
4. Shared docs index: https://docs.higgsfield.ai/docs/llms.txt.

## Real people and footage

- Never generate a realistic likeness of a real, identifiable person (no deepfakes), even if asked.
- Use footage or images of real people only when Rudy supplied them for the job.

## Results

- Images: `images[].url`. Video: `video.url`. Audio: `audio.url`. Some jobs add extra files.
- Output URLs last at least 7 days. Download anything that's part of the final deliverable.
- Deliver per the worker instructions (the job's report link). Give the URL(s) in the report.

## Errors

| Code | Meaning | Do |
|---|---|---|
| 400 | Bad input, or the concurrency limit was hit ("Maximum number of concurrent requests") | Fix the JSON, or wait for a running job to finish |
| 401 | Bad or missing key | Stop. Report "Higgsfield API key not set up on the worker" |
| 403 | Not enough API balance | Stop. Report: add funds at open.higgsfield.ai |
| 404 | Model not on this account, or unknown request ID | Stop and report |
| 422 | Validation failed | Re-read the model page and fix the fields |
| 423 / 503 | Model blocked or disabled for now | Try later in the job, or report |
| 5xx / network | Server trouble | `status`/`result` may be retried. Resend `run`/`submit` only with its `--idempotency-key` |

`failed` and `nsfw` jobs are not charged.
