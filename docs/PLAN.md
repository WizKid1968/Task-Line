# Task-Line: Personal Phone & Text Agent — Plan

Status: **Draft, waiting for approval.** Nothing has been built yet.

## 1. What we're building

A personal assistant you reach by **calling or texting your Telnyx phone number**.
You tell it what you want in plain words; it does the task, and it **always asks
you first before doing anything permanent** (sending a message, starting coding
work, deleting something).

## 2. Decisions so far

| Topic | Decision |
|---|---|
| How you reach it | Phone calls **and** text messages |
| Safety rule | Ask before anything permanent |
| Who can use it | You + **two** trusted numbers (stored privately on Vercel, never in code) |
| Phone service | Your existing Telnyx account and number |
| Talks with you on calls/texts | Claude Haiku 4.5, hosted by Telnyx (no Anthropic key needed) |
| Does the bigger jobs | A **Claude Code routine** on your Claude **Pro** account (no Anthropic key needed) |
| Behind-the-scenes server | Vercel, team **Rudy's projects** |
| Notes & reminders storage | Airtable |
| Coding work | Routine works in the repo and opens a **pull request** for you to approve |
| Other tasks | Look things up · Send messages for you · Use connected apps · Schedule things for later |

## 3. Who does what

| Job | Handled by |
|---|---|
| Talking with you | Claude Haiku 4.5 on Telnyx — fast, made for conversation |
| Notes, reminders, texting someone | Your Vercel server directly — no AI needed |
| Coding, research, working in your apps | A Claude Code cloud session started by a **routine** |

A **routine** is a saved job on your Claude account (instructions + repos + the apps
it may use). It comes with a private web address; when the server contacts it,
Anthropic starts a new Claude session to do the work. It uses your normal Pro
allowance. Routines are a **preview feature**, so details may change.

## 4. How it fits together

```
 You (call or text)
        │
        ▼
 Telnyx phone number ──► Telnyx AI Assistant (Claude Haiku 4.5)
                               │  understands the request, talks back
                               │  calls "tools" when it needs to do something
                               ▼
                     Your Vercel server (this repo)
                     ├─ checks the caller is on the trusted list
                     ├─ holds permanent actions until you say "yes"
                     ├─ Notes & reminders  ──► Airtable
                     ├─ Schedule for later ──► Vercel Schedules ──► texts you
                     ├─ Send a message     ──► Telnyx (text or call someone)
                     └─ Bigger jobs        ──► Claude Code routine
                                                  │ does the work (code, research, apps)
                                                  │ opens a pull request for code
                                                  ▼
                                         reports back to the server ──► texts you
```

### A bigger job, step by step

1. You: *"Add a dark mode to Task-Line."*
2. Agent reads it back and asks for a yes. You say yes.
3. Server starts the routine with your request.
4. You get a text: *"Started. Watch here: [link]."*
5. Claude does the work. Code goes on a separate `claude/` branch with a pull request.
6. When finished, it reports to the server and you get a text with a summary and link.

## 5. Where projects live

- **Task-Line (this repo)** holds the agent's own code: the Vercel server, the
  instructions for the phone agent and the routine, and setup guides. Vercel deploys
  from here.
- **`workspace/` folder in Task-Line** for small jobs: research write-ups, drafts,
  quick experiments.
- **Your existing projects stay in their own repos.** The routine can work in any
  repo you add to it (each needs the Claude GitHub App).

## 6. Safety design

1. **Trusted numbers only.** Every request is checked against your number plus the
   two trusted numbers. Anyone else gets a polite "sorry, I can't help" and nothing runs.
2. **Two-step for anything permanent.** The server never does a permanent action on
   the first request. It first creates a "pending" action and the agent reads it back:
   *"I'll text Sam: 'Running 10 min late.' Should I send it?"* Only a clear "yes"
   (spoken, or a text reply of YES) releases it. Pending actions expire after 10 minutes.
3. **Routines are only started after your yes.** Once started, a routine works on its
   own without stopping to ask, so the "yes" happens before the server starts it.
4. **Routine double-checks with the server.** Before working, the routine asks the
   server "is request #123 real and approved?" If someone stole the routine's address,
   they still couldn't make it do anything.
5. **Least access.** The routine only gets the repos and apps it needs.
6. **Secrets stay secret.** Keys live in Vercel's private settings and the
   environment's private settings, never in code or chat.
7. **Every request is logged** to Airtable so you can see what was done and when.
8. **Code changes never go live on their own.** They arrive as pull requests you approve.

## 7. Limits to know

- A routine can be started up to **30 times an hour**; your account up to 100 an hour.
- Routines use your **Pro allowance**. Heavy use can hit the limit; you'd wait for it
  to reset.
- Bigger jobs take minutes, so results come back **by text**, not during the call.

## 8. Build phases

Each phase ends with something you can test from your phone before moving on.

| Phase | What you get | You test it by |
|---|---|---|
| 1. Foundation | Vercel server, trusted-number check, "ask first" system, activity log, Telnyx assistant connected | Calling and texting; a non-trusted phone is refused |
| 2. Notes | "Save a note…", "What are my notes about X?" | Notes appear in Airtable |
| 3. Reminders & scheduling | "Remind me at 5pm to…", "Check on X tomorrow" | You get the text at the right time |
| 4. Bigger jobs via routine | "Add a dark mode to Task-Line" → routine → pull request → texted link | A pull request shows up for you to approve |
| 5. Send messages for me | "Text Sam I'm running late" (with confirmation) | Message is sent only after you say yes |
| 6. Look things up | Research by the routine, answer by text | Ask a question, get a sourced answer |
| 7. Connected apps | Airtable first; Google Drive later | Ask about a file or record |

## 9. What I still need to verify (not guessing)

These come from Telnyx docs I could only read as search summaries, because this
environment currently blocks `telnyx.com`. I'll confirm each against the real docs
before writing code:

- How the Telnyx assistant tells our server **which number is calling or texting**
  (needed for the trusted-number check).
- How Telnyx **signs** requests to our server so nobody can fake them.
- Whether the same assistant can handle **both calls and texts** on one number.
- Exact setup for the assistant's **webhook tools** (how it calls our server).
- Which **Vercel plan** you're on — the "Schedules" feature for reminders may depend on it.

Already confirmed from Anthropic's official docs: routines, their private web address
(API trigger), Pro plan support, and the limits above.

## 10. What you'll need to set up (I'll give step-by-step instructions)

- **Telnyx:** your API key, added privately to this environment and to Vercel.
- **Allow Telnyx websites** in this environment's network settings
  (`developers.telnyx.com`, `api.telnyx.com`).
- **Routine:** create it at claude.ai/code/routines (I'll write its instructions),
  add the API trigger, and save its token privately in Vercel.
- **Routine's environment:** allow your Vercel app's web address so it can report back.
- **GitHub:** the Claude GitHub App on each repo the routine should work in
  (already done for Task-Line).
- **Airtable:** a base for notes, reminders, and the activity log (I can create it).
- **Vercel:** deploys under the **Rudy's projects** team.

## 11. Open questions

1. Which **other GitHub repos** should the routine be allowed to work in, besides Task-Line?
2. Is **Google Drive** needed early, or can it wait until the end (Phase 7)?
