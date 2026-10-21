---
name: opus-builder
description: Done-for-you playbook to build and hand over a private "Opus" assistant (OmniPotent Personal Utility System) for a paying client - a phone number they call or text that answers, checks who they are, asks before doing anything permanent, texts people for them, keeps contacts, and hands real work (email, calendar, research, videos, web pages, code) to a Claude worker. Use when setting up Opus for a new client, re-checking a client's setup, or preparing a sales/quote conversation about what Opus does. Not for changing the Opus code itself.
---

# Opus builder — set up Opus for a client

Opus is the system in this repository (Task-Line), built and proven for its first owner.
This skill is the repeatable recipe to build the same thing for a client, under the
client's own accounts, with the client's own assistant name.

Read these in order before starting a client:

1. `references/architecture.md` — what each piece is and why it exists (plain English).
2. `references/client-intake.md` — the questions to ask the client. Fill in a copy of
   `templates/client.example.json` with the answers.
3. `references/setup-checklist.md` — the build, step by step, in order.
4. `references/acceptance-tests.md` — the tests that must all pass before handover.
5. `references/business-and-compliance.md` — what to check before selling (accounts,
   texting registration, terms, consent). Do this **before** taking money.

Tools in this folder:

- `templates/client.example.json` — one client's non-secret details.
- `templates/worker-prompt.md` — the worker's instructions with `{{PLACEHOLDERS}}`.
- `scripts/fill-template.mjs` — fills the worker prompt from the client file and refuses
  to finish if any placeholder is left:
  `node .claude/skills/opus-builder/scripts/fill-template.mjs <client.json> > worker-prompt.txt`

## Rules (never break)

1. **One client, one set of accounts.** Each client gets their own copy of the code,
   Vercel project, Airtable base, Telnyx number and assistant, and Claude worker. Never
   point two clients at the same server, base or worker. Their data must never mix.
2. **The worker runs on the client's own Claude account.** It reads the client's Gmail and
   Calendar through that account's connectors, so it can't run on yours.
3. **Secrets never travel through chat, email or files in the repo.** Code words, API
   keys, tokens and passwords go straight from the client (or a generator) into Vercel
   environment variables or the worker environment's network secrets. Never print a
   generated secret. Never open a `.env` file someone uploads.
4. **The client chooses their own code words**, and types them into Vercel themselves
   (screen-share is fine; they type, you don't look). You never learn them.
5. **No money tools.** Never connect trading, investing or payment apps to the worker.
6. **The worker never touches the client's system base** (the Airtable base that holds the
   log, approvals and jobs). Only the server writes there.
7. **Use fake 555 numbers in any test you write.** Real numbers only in the client's
   settings.
8. **Don't promise what isn't built.** See "What Opus can and can't do today" below. Sell
   only what passes the acceptance tests.
9. **Nothing goes live without the client's yes.** Connect the phone number to the
   assistant only after the acceptance tests pass and the client agrees.

## What Opus can and can't do today

Proven end to end on the first install:

- Answers calls and texts on its own number; greets the owner and trusted person by name.
- Refuses everyone else with one fixed sentence (strangers learn nothing).
- Asks first: reads back any permanent action and waits for a clear yes, plus a spoken or
  texted code word on texts and on calls the carrier can't confirm.
- Texts people for the owner, by name or number, signed "— Sent for <name>"; replies
  within 24 hours are passed back to whoever asked.
- Saves and looks up contacts by name, and asks which one when two names match.
- Hands look-ups to the Claude worker right away: calendar, email summaries, research,
  weather, facts. The answer comes back by text, usually within minutes.
- Hands approved jobs to the worker: send or reply to email, add or move calendar events.
- Second-opinion safety checks (Jev by TypeSafe AI) at six points, including screening
  emails for scams before the worker opens them, and a daily review of the phone agent.
- Logs everything in the client's Airtable base.

Possible but **not yet proven end to end** (say "coming" or test it for that client first):

- Creating videos (Higgsfield, HyperFrames) and building web pages or apps.

Not built:

- Notes and reminders (the agent says "not set up yet").
- Non-US phone numbers (US numbers only).
- More than two approved people per install (owner + one trusted person).
- Time zones other than New York: the agent's instructions and the daily watchdog use
  New York time. For a client elsewhere, change `assistant/instructions.md` (the
  `{{telnyx_current_time_America/New_York}}` variable and the sentence after it) and
  `src/handlers/watchdog.ts` (`timeZone`), and the cron hour in `vercel.json`, in the
  client's copy, then run the tests.

## Order of work for a client (summary)

1. Business checks (`business-and-compliance.md`) and signed agreement.
2. Intake call → `client.json`.
3. Client creates or grants their accounts (Claude plan, Vercel, Airtable, Telnyx number,
   GitHub, Jev, optional Higgsfield) — see checklist Part 1.
4. Copy the code, build the Airtable base, deploy the server, set the settings.
5. Create the phone assistant (script), the worker environment and the worker routine.
6. Run every acceptance test, then connect the number, then hand over with the owner's
   one-page guide (`references/client-guide.md`).
7. Ongoing: watch the daily watchdog texts the first week; update the worker's
   instructions when the template changes.

## When something differs from this playbook

Product screens get renamed. If a button or field in the checklist isn't where it says,
stop, describe exactly what you see, and check the current docs
(https://code.claude.com/docs/en/claude-code-on-the-web for environments and routines)
rather than guessing. Update this skill when you confirm the new steps.
