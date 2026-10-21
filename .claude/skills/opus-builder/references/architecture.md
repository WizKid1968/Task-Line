# How Opus works (plain English)

Think of Opus as an office with a front desk and a back office.

```
 Client's phone ──call/text──▶  Phone number (Telnyx)
                                     │
                                     ▼
                          FRONT DESK: phone agent
                          (Telnyx AI assistant, quick model)
                                     │  every request goes through ▼
                                     ▼
                          GATEKEEPER: the server (Vercel)
                          - checks who is calling (signed by Telnyx)
                          - picks what the agent may say to them
                          - holds "ask first" approvals + code words
                          - sends texts, keeps contacts
                          - asks Jev for a second opinion on risky steps
                          - writes everything to the log (Airtable)
                                     │  starts jobs ▼        ▲ reports results
                                     ▼                       │
                          BACK OFFICE: the worker
                          (Claude Code routine on the client's Claude account,
                           with Gmail, Calendar and other apps connected)
```

## The pieces

| Piece | What it is | Lives in | Why it's there |
|---|---|---|---|
| Phone number | The number the client calls or texts | Telnyx | The front door |
| Phone agent | A fast AI that talks and texts | Telnyx AI assistant (record name set by `TELNYX_ASSISTANT_NAME`) | Quick, natural conversation |
| Server | The code in this repository | The client's Vercel project | The only part that decides who is allowed and what happens |
| Log and records | 5 tables: Activity Log, Pending Actions, Outreach, Jobs, Contacts | The client's Airtable base | A record of everything, plus approvals and contacts |
| Worker | A strong Claude that does the real work | A routine on the client's Claude account | Reads email and calendar, researches, builds things |
| Worker environment | The worker's workspace settings: which websites it may reach, and a hidden password for reporting back | The client's Claude account | Keeps the worker on a short leash |
| Jev | An independent AI judge (TypeSafe AI) | Called by the server | Second opinion before risky steps |

## Who can do what

- **Owner and trusted person** (two phone numbers in the server settings): full use.
- **Someone the owner texted** in the last 24 hours: can only reply; the reply is passed
  to whoever asked for the text. Up to 10 replies per text.
- **Everyone else**: one fixed sentence, nothing more. The agent isn't even told what it
  can do, so it can't be talked into anything.

The server, not the agent, decides this. Each conversation starts with Telnyx sending the
server a signed message with the caller's number; the server answers with the right set
of instructions for that person.

## The "ask first" rule

1. The agent prepares the action (`request_action`). Nothing happens yet.
2. The server writes a plain read-back ("I'll text Sam (917-555-0101) this message…").
3. The caller says yes. On texts — and on calls the carrier can't fully confirm — they
   also give their code word. Three wrong code words cancel the request.
4. Only then does the agent call `confirm_action`, and the server does it.

Look-ups that change nothing (calendar, email summaries, research) skip this and start
right away — but Jev double-checks that a "look-up" really changes nothing; if it might,
it goes back through ask-first.

## Jobs for the worker

- The server starts the worker through the routine's API trigger, with the job text
  (job id, who asked, read-only or approved changes, the task).
- The worker does the job under its instructions (`templates/worker-prompt.md`), screens
  emails with the server before opening them, and sends one report back.
- The report is authenticated by a password the worker never sees (the environment adds
  it to requests to the server's `/api/jobs/` address only).
- The server checks the result with Jev (no passwords leaking, no actions nobody asked
  for), then texts it to the person who asked. Flagged results are held and the person
  gets an alert instead.

## The six Jev checkpoints

| # | Where | Question | If flagged |
|---|---|---|---|
| 1 | Look-up | Would this send, change, delete or spend? | Back to ask-first |
| 2 | Approved job | Money? Deleting, many people, sensitive documents? | Money: refused. Risky: code word even on calls |
| 3 | Worker's result | Password or code inside? Actions not asked for? | Held, alert sent |
| 4 | Forwarded reply | Scam? Orders aimed at the assistant? | Forwarded with a warning |
| 5 | Daily watchdog (9 AM New York) | Agent missed a hand-off? Said too much to a stranger? | Owner gets a text |
| 6 | Worker email screening | Scam, phishing, malware? | Worker doesn't open it |

If Jev is down, every checkpoint takes the safer path.

## The settings that make an install unique

All in the client's Vercel project (full list in `setup-checklist.md`, Part 3):
the two people (name, phone, code word), the assistant's name, the Telnyx keys and agent
number, the Airtable base, the routine's trigger address and token, the report password,
the Jev key and the watchdog password. No client details are written in the code.
