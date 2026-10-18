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
| Brain on calls/texts | Claude Haiku 4.5, built into Telnyx |
| Behind-the-scenes server | Vercel, team **Rudy's projects** |
| Notes & reminders storage | Airtable |
| Coding work | **Option A** — agent files a GitHub issue, Claude's GitHub app does the work and opens a pull request for you to approve |
| Other tasks | Look things up · Send messages for you · Use connected apps · Schedule things for later |

## 3. How it fits together

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
                     ├─ Coding work        ──► GitHub issue ──► Claude GitHub app ──► pull request
                     ├─ Look things up     ──► Claude (stronger model) with web search
                     └─ Send a message     ──► Telnyx (text or call someone)
```

## 4. Safety design

1. **Trusted numbers only.** Every request is checked against your number plus the
   two trusted numbers. Anyone else gets a polite "sorry, I can't help" and nothing runs.
2. **Two-step for anything permanent.** The server never does a permanent action on
   the first request. It first creates a "pending" action and the agent reads it back:
   *"I'll text Sam: 'Running 10 min late.' Should I send it?"* Only a clear "yes"
   (spoken, or a text reply of YES) releases it. Pending actions expire after 10 minutes.
3. **Secrets stay secret.** API keys live in Vercel's private settings, never in code
   or chat.
4. **Every request is logged** to Airtable so you can see what the agent did and when.
5. **Coding changes never go live on their own.** They arrive as pull requests you
   approve.

## 5. Build phases

Each phase ends with something you can test from your phone before moving on.

| Phase | What you get | You test it by |
|---|---|---|
| 1. Foundation | Vercel server, trusted-number check, "ask first" system, activity log, Telnyx assistant connected | Calling and texting; a non-trusted phone is refused |
| 2. Notes | "Save a note…", "What are my notes about X?" | Notes appear in Airtable |
| 3. Reminders & scheduling | "Remind me at 5pm to…", "Check on X tomorrow" | You get the text at the right time |
| 4. Coding work | "Add a dark mode to Task-Line" → issue → pull request → texted link | A pull request shows up for you to approve |
| 5. Send messages for me | "Text Sam I'm running late" (with confirmation) | Message is sent only after you say yes |
| 6. Look things up | "What's the weather / find me…" with answer by voice or text | Ask a question, get a sourced answer |
| 7. Connected apps | Airtable first; Google Drive later (needs extra Google sign-in setup) | Ask about a file or record |

## 6. What I still need to verify (not guessing)

These come from Telnyx docs I could only read as search summaries, because this
environment currently blocks `telnyx.com`. I'll confirm each against the real docs
before writing code:

- How the Telnyx assistant tells our server **which number is calling or texting**
  (needed for the trusted-number check).
- How Telnyx **signs** requests to our server so nobody can fake them.
- Whether the same assistant can handle **both calls and texts** on one number.
- Exact setup for the assistant's **webhook tools** (how it calls our server).
- Which **Vercel plan** you're on — the "Schedules" feature for reminders may depend on it.

## 7. What you'll need to set up (I'll give step-by-step instructions)

- **Telnyx:** your API key, added privately to this environment and to Vercel.
- **Allow Telnyx websites** in this environment's network settings
  (`developers.telnyx.com`, `api.telnyx.com`).
- **Anthropic API key** — used by the Claude GitHub app for coding work and for
  "look things up".
- **GitHub:** install the Claude GitHub app on each project you want coding help with,
  and a GitHub token so the server can create issues.
- **Airtable:** a base for notes, reminders, and the activity log (I can create it).
- **Vercel:** deploys under the **Rudy's projects** team.

## 8. Open questions

1. Do you already have an **Anthropic API key**?
2. Which **GitHub projects** should the agent be allowed to start coding work on?
   (Just Task-Line, or others too?)
3. Is **Google Drive** needed early, or can it wait until the end (Phase 7)?
