# Task-Line safety rules

Plain-English rules every part of Task-Line follows, and the checklist for adding any
new app. Written October 2026. Update this page whenever an app or rule changes.

## The two dangers

1. **Someone pretending to be you.** Stopped by: only two allowed phone numbers, the
   server checking every request, and the **code word** for permanent actions on texts
   (and on calls when the carrier can't confirm your number).
2. **The worker being tricked during a job you started.** Anyone can hide instructions
   in an email, web page, document or record. The code word does **not** stop this,
   because the trick happens after the job has started. What limits it: the worker's
   instructions, Claude's safety checker, a short list of websites the worker may
   reach, and above all **what the worker's apps are able to do.**

## The rules

1. **Reading is free. Changing asks first. Deleting, sending and money need extra care
   or are off.**

   | Action | Example | Rule |
   |---|---|---|
   | Read / look up | "Summarize today's emails" | Starts right away |
   | Change or create | "Add a client to my list" | Read-back, then yes (+ code word on texts) |
   | Send, delete, publish | "Email Sam", "Delete that record" | Read-back, then yes (+ code word on texts) |
   | Paid credits | Videos, images (Higgsfield, HeyGen) | Read-back, then yes (+ code word on texts); credits used reported |
| Money | Payments, trades, purchases | **Never connected** |

2. **Fewest apps possible.** The worker only gets apps it needs for jobs you actually
   ask for. Add one at a time, after a real need.
3. **Watch dangerous pairs.** An app that brings in outside content (email, web, forms)
   plus an app that can send or delete is a dangerous pair. Prefer read-only or
   draft-only for one side.
4. **The system's own records stay off-limits.** The worker never gets access to the
   Task-Line Airtable base (log, approvals, reply permissions, jobs). Only the server
   writes there. Your personal or business data lives in separate bases.
5. **Short website list.** The worker's environment allows only package managers and
   the Task-Line server. Add a website only when a job needs it.
6. **Spot and report tricks.** The worker looks for hidden text (white or tiny font,
   off-screen text, invisible characters) and any other attempt to give it orders,
   refuses to follow it, and puts a warning at the top of its result text. This is an
   extra layer on top of rules 1 to 5, not a replacement.
7. **Everything is logged.** Every call, text, approval, job and result goes to the
   Airtable Activity Log and Jobs table.
8. **Secrets never travel through chat.** Passwords, tokens and code words go straight
   into Vercel or environment settings. Nobody pastes them into a conversation.
9. **Strangers get nothing.** Unknown numbers get one fixed sentence. People you texted
   can only reply (passed to you) for 24 hours. Neither can start jobs.

## Checklist before connecting a new app

Answer these, write the answers in the table below, then decide.

1. **What will I use it for?** (a real job, not "just in case")
2. **Can outsiders put words into it?** (emails, forms, shared docs, comments)
3. **What can a fooled worker change or delete with it?**
4. **Can it send information out of my accounts?**
5. **Does it make a dangerous pair with an app already connected?**
6. **Can its access be limited?** (read-only, specific folders or bases only)
7. **Which actions need ask-first?** (anything from rule 1 beyond reading)
8. **Does it touch money?** If yes, don't connect it.

## Apps today

| App | Used for | Outsiders can write to it? | Can change / delete / send? | Ask-first for | Status |
|---|---|---|---|---|---|
| Phone line (Telnyx) | Calls and texts | Yes (anyone can call/text) | Sends texts | Every text sent for you | Live |
| Gmail | Read, summarize, send email | Yes (anyone can email you) | Send, reply, forward, delete | Sending, replying, deleting | Attached to worker |
| Google Calendar | Read schedule, manage events | Yes (anyone can send an invite) | Create, move, delete events | Creating, moving, deleting | Attached to worker |
| Higgsfield | Videos and images | Low | Spends paid credits | Any generation (no credit cap, by Rudy's choice; credits used are reported) | Attached to worker |
| HyperFrames by HeyGen | Videos | Low | May spend paid credits | Any generation or render | Attached to worker |
| GitHub (Task-Line code) | Code, web pages, apps | Low (only you write there) | Push code, open pull requests | Any code change (never merges) | Attached to worker |
| Airtable (Task-Line base) | System records | No | Server only | n/a | **Worker told never to touch it.** Plan: limit the Airtable connection to other bases only |
| Robinhood, Co-Invest | — | — | Trades (money) | — | **Not connected to the worker. Keep it that way.** |

## Open decisions

- **Draft-only email:** the worker writes drafts; you approve sending by text. Would
  remove the main email risk. Not decided yet.
- **Two workers:** one for look-ups with read-only apps, one for approved jobs. Needs
  checking what Claude's routine settings allow. Not decided yet.
