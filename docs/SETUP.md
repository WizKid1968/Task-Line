# Task-Line setup guide

This is the checklist for getting Phase 1 running. Values marked **private** go only
into Vercel's environment variables, never into code, GitHub, or chat.

## 1. Vercel settings (environment variables)

| Name | What it is | Who fills it in |
|---|---|---|
| `TELNYX_PUBLIC_KEY` | Telnyx account public key, used to check Telnyx signatures. Not secret. | Claude |
| `SESSION_SECRET` | Random secret that seals each conversation's pass. **Private.** | Claude (generated) |
| `TELNYX_ENCRYPTION_KEY` | Random key shared with Telnyx so it can attach the pass to tool requests. **Private.** | Claude (generated) |
| `OWNER_PHONE` | Owner's phone number | Claude |
| `OWNER_NAME` | Owner's first name, used in greetings | You |
| `OWNER_CODE_WORD` | Owner's code word. **Private.** | **You** |
| `TRUSTED_PHONE` | Trusted person's phone number | Claude |
| `TRUSTED_NAME` | Trusted person's first name | You |
| `TRUSTED_CODE_WORD` | Trusted person's code word. **Private.** | **You** |
| `AIRTABLE_TOKEN` | Airtable personal access token for the Task-Line base. **Private.** | **You** |
| `AIRTABLE_BASE_ID` | ID of the Task-Line base (starts with `app`) | Claude |
| `TELNYX_API_KEY` | Telnyx key used to send texts. **Private.** | **You** |
| `AGENT_PHONE` | The number texts are sent from (8100) | Claude |
| `ROUTINE_FIRE_URL` | The routine's API trigger address (`https://api.anthropic.com/v1/claude_code/routines/trig_.../fire`). Not secret. | You (copy from the routine page) |
| `ROUTINE_TOKEN` | The routine's API trigger token (starts `sk-ant-oat01-`). **Private.** | **You** |
| `JEV_API_KEY` | Jev (TypeSafe AI) key for the safety checks. **Private.** Without it every check takes the safer path. | **You** |
| `CRON_SECRET` | Password Vercel's daily scheduler sends to the watchdog. **Private.** | Claude (generated) |
| `ASSISTANT_NAME` | The name the assistant uses for itself (default `Opus`). Optional. | You |
| `JOB_REPORT_SECRET` | A long random password (32+ characters) the routine sends back with results. Must match the routine environment's network secret. **Private.** | **You** |

Check: open `https://<your-app>.vercel.app/api/health`. It shows `"configured": true`
when every setting is filled in. It never shows the values.

## 2. Airtable base "Task-Line"

Tables (Claude creates these):

- **Activity Log** — Event, Time, Who, Phone, Channel, Details, Conversation
- **Pending Actions** — Code, Status, Action, Summary, Payload, Requested By, Role,
  Channel, Needs Code Word, Created, Expires, Code Word Failures, Result
- **Outreach** — Recipient, Requested By, Requester Name, Message, Sent, Expires,
  Forwards (texts sent for someone, so replies within 24 hours can be passed back)
- **Contacts** — Name, Phone, Added By, Created (people you can text by name; the two
  approved people come from the server settings and aren't stored here)
- **Jobs** — Job ID, Status, Permission, Task, Requested By, Requester Name, Channel,
  Session URL, Result, Created, Finished (bigger jobs handed to the routine)

The Airtable token needs `data.records:read` and `data.records:write` access to this
base only.

## 3. Telnyx

Run `scripts/configure-assistant.mjs` (see the top of the file). In a Claude Code cloud
session, add `NODE_USE_ENV_PROXY=1` so Node's requests go through the session proxy. It:

1. Saves `TELNYX_ENCRYPTION_KEY` as the Telnyx integration secret `task_line_enc_key`.
2. Creates or updates the assistant **Task-Line Agent** (Claude Haiku 4.5) with the
   start-of-conversation check and the three "ask first" tools.

Note: `TELNYX_ENCRYPTION_KEY` is stored in Vercel as a *sensitive* value, which can't be
read back. To re-run the script later, generate a new key, save it in Vercel **and** pass
it to the script, then redeploy, so both sides match.

Connecting number **8100** to the assistant is a separate step, done only after
testing, because it takes the number away from the old Kai settings.

## 4. How the safety pieces fit

1. A call or text arrives. Telnyx sends a **signed** message to `/api/telnyx/init`
   with the caller's number. The server logs it and tells the agent the caller's
   name and role (or "unknown").
2. Every tool request carries the caller's number, the channel (call or text) and,
   for calls, the carrier's confirmation level. **Telnyx fills these in itself**;
   the AI can't see or change them.
3. The server requires **Telnyx's signature** on each tool request (max 5 minutes
   old; it covers the whole request, including those details) and checks the
   caller against the two allowed numbers. Strangers are refused.
4. Permanent actions are two steps: `request_action` (nothing happens) then
   `confirm_action` after a clear yes. The **code word** is required for texts,
   and for calls unless the carrier fully confirmed the number (attestation "A").
   Three wrong code words cancel the request.
5. Everything is written to the Airtable Activity Log.
6. **Who sees what.** The server chooses the agent's instructions for each person
   (`{{role_instructions}}`): full instructions for the two allowed numbers; "pass the
   reply along" only, for someone texted in the last 24 hours; one fixed "private
   line" sentence for everyone else. If the server can't be reached, the agent's
   built-in default is the stranger version.
7. **Replies.** Texts sent for you end with "— Sent for <name>". A reply within 24
   hours goes through `forward_reply`, which needs Telnyx's signature, checks the
   Outreach table, and texts the reply only to whoever asked for the original text
   (max 10 replies per text sent). Recipients can't use any other tool.

Note: an encrypted per-conversation pass was used at first. Telnyx doesn't attach it
to tool requests on texts (it silently drops them), so tools now rely on step 2-3.
The server still accepts the pass if present.

## 5. Claude routine (bigger jobs)

Look-ups (research, reading email, reading code) start right away with `start_lookup`.
Jobs that change things (sending email, code changes) use the ask-first action
`claude_job`. Either way the server starts the routine through its API trigger, with
the job as text. The routine's instructions are in `docs/ROUTINE_PROMPT.md`. When it
finishes it POSTs to `/api/jobs/report`; its environment adds `JOB_REPORT_SECRET` as a
network secret for `task-line-phi.vercel.app`, so the session never sees it. The
server checks the secret and the job's random id (one report per job) and texts the
result only to whoever asked. Limits: 10 jobs per person per hour (the routine allows
30 per hour). Read-only is an instruction to the worker, not a hard lock.

## 6. Jev safety checks

Jev (TypeSafe AI, `src/jev.ts`, `src/jevChecks.ts`) answers fixed yes/no questions with a
probability. Every question and cutoff was tested on realistic examples first (29 of 29
correct). It is a second judge, never the only lock, and when it's down or unsure the system
takes the safer path.

| # | Where | Question | If flagged | If Jev is down |
|---|---|---|---|---|
| 1 | Look-up (`start_lookup`) | Would this send, change, delete or spend? (cutoff 0.35) | Sent back to ask-first (`claude_job`) | Sent back to ask-first |
| 2 | Change job (`claude_job`) | Money? (0.5) Deleting, many people, sensitive documents? (0.5) | Money: refused. Risky: code word even on calls | Code word required |
| 3 | Result report | Password or code? Actions not asked for? (0.5) | Held; requester gets an alert, result kept in Jobs table | Sent, marked unchecked |
| 4 | Forwarded reply | Scam? Orders to the assistant? (0.7) | Forwarded with a warning | Forwarded without label |
| 5 | Daily watchdog (`/api/cron/watchdog`, 9 AM New York) | Missed hand-off? Said too much to a stranger? (0.6) | Owner gets a text | Counted as "couldn't check" in the text |
| 6 | Worker email screening (`/api/jobs/screen`) | Scam, phishing or malware? (0.6) | Worker skips the email, lists it as suspected scam | "unchecked": worker uses its own judgment |

What leaves the server for Jev: the task text, the worker's result, forwarded replies, email
sender/subject/preview lines, and (watchdog) conversation transcripts with code words blanked out.

## 7. Developer commands

```
npm install
npm run check   # type check + tests
```

## 8. Current status (Phase 1)

- Server live at `https://task-line-phi.vercel.app` (`/api/health` reports configured).
- Vercel protection: standard (production address public, previews protected).
- Telnyx assistant **Task-Line Agent** created (Claude Haiku 4.5), integration secret
  `task_line_enc_key` saved.
- Number +1 631-212-8100 connected to Task-Line Agent for calls and texts (10DLC
  registration still assigned). Previous routing was the old "Kai Voice Receptionist"
  call app and "Kai" messaging profile, which still serve 8282 and 8273.
- Live tests passed: calls and texts reach the agent, caller check and Airtable log work.
- **send_text** works on calls and texts (both tested: texts delivered). On texts the
  code word is required; wrong code words are counted and refused.
- Replies: texts sent for you are signed, and replies within 24 hours are texted back
  to whoever asked for the text. Strangers get one fixed "private line" sentence.
- Re-running the setup script closes old text conversations for the agent, because
  Telnyx keeps each text conversation on the agent version it started with.
- Text conversations restart after 30 quiet minutes, so one failure can't silence them.
