# Opus: your personal assistant, one call away

**Opus** ("OmniPotent Personal Utility System") is a personal AI assistant that lives in a phone
number. There's no app to download. You call it or text it, say what you need in plain words,
and it gets it done.

This repository holds everything needed to run Opus and to set it up for someone new.

---

## What Opus can do

- **Answer calls and texts** like a receptionist, and talk with you naturally.
- **Text people for you**, by name or number, and pass their replies back to you.
- **Keep your contacts**: save a number, look one up, or read you the whole list.
- **Look things up**: research, your email, your calendar. The answer comes back by text.
- **Do bigger jobs** with a Claude worker: send or reply to email, manage your calendar, make
  videos and web pages, change code. These always ask you first.

Examples of what to say:

- "Text Sam: running 10 minutes late."
- "What's on my calendar tomorrow?"
- "Summarize my emails from today."
- "Who's on my contact list?"

## How it keeps you safe

- **Only approved phones can use it.** Each install has an owner and, optionally, one trusted
  person. Anyone else who calls hears one short sentence and nothing more.
- **Nothing permanent happens without your yes.** Opus reads the request back first.
- **Code word.** Over text, and on calls the phone company can't fully confirm, Opus also asks
  for your private code word. Three wrong tries cancel the request.
- **Scam emails are screened** before the worker opens them.
- **A second AI judge** (Jev, from TypeSafe) double-checks risky steps. If it's unsure, the
  safer choice wins.
- **No money.** Opus is never connected to payments, purchases or trading.
- **Everything is logged**, so any problem can be traced.

More detail: [`docs/SAFETY_RULES.md`](docs/SAFETY_RULES.md).

## How it works

```
 Your phone ──call/text──▶ Telnyx phone number + AI receptionist
                                   │  (asks the server: who is this caller?)
                                   ▼
                          Opus server (Vercel) ──▶ Airtable (log, approvals, contacts, jobs)
                                   │
                                   ├──▶ Jev safety checks
                                   │
                                   └──▶ Claude worker (bigger jobs: email, calendar, research…)
                                          │
                                          └── reports back ──▶ server texts you the result
```

| Part | What it does | Service |
|---|---|---|
| Phone number and receptionist | Answers calls and texts in a natural voice | Telnyx |
| Server | Decides who may do what, keeps approvals, sends texts | Vercel |
| Records | Activity log, approvals, contacts, jobs | Airtable |
| Worker | Does the longer jobs | Claude (a scheduled task, called a "routine") |
| Safety judge | Yes/no checks before risky steps | Jev (TypeSafe AI) |

## The phone assistant's models and voice

| Job | What it uses | Notes |
|---|---|---|
| Thinking (what Opus says) | Claude Haiku 4.5 (Anthropic), inside Telnyx | Fastest Claude model; the only Anthropic model Telnyx offers |
| Hearing (speech to text) | Deepgram Flux | Set in the Telnyx portal |
| **Voice (current)** | **Telnyx Ultra "Katie - Friendly Fixer"** | The original voice, back in use since Oct 27, 2026. Voice ID `Telnyx.Ultra.f786b574-daa5-4673-aa0c-cbe3e8534c02` |
| Voice (alternative) | Fish Audio "Nova", model S2.1 Pro | Tried Oct 27, 2026 (slight echo). Voice ID `FishAudio.s2.1-pro.b545c585f631496c914815291da4e893` |
| Voices tried and dropped | Fish Audio "Claire" (sounded worse) and "Aria" (slight echo) | Claire: `FishAudio.s2.1-pro.5567200c7d8341738f0892bbacd3be3c` |

Telnyx runs Fish Audio on its own account, so no Fish Audio key is needed. Only Telnyx's 10
hand-picked Fish voices work (Aria, Nova, Paula, Claire, Yuki, Ethan, Atlas, Max, Adrian, Mateo).
Telnyx can't switch voices automatically if one fails, so switching is a manual step:

```
NODE_USE_ENV_PROXY=1 node scripts/set-voice.mjs nova          # shows the change
NODE_USE_ENV_PROXY=1 node scripts/set-voice.mjs nova --yes    # switches to Nova (saves a backup first)
NODE_USE_ENV_PROXY=1 node scripts/set-voice.mjs katie --yes   # back to Katie
```

(`NODE_USE_ENV_PROXY=1` is only needed in a Claude Code cloud session. Elsewhere, add
`TELNYX_API_KEY=<key>` in your own terminal.)

## What it costs to run (one person)

| Item | About |
|---|---|
| Claude plan (the worker) | $20–100 a month |
| Telnyx (number, calls, texts) | $8–20 a month, plus one-time texting registration (about $20) |
| Vercel (the server) | $0 for personal use; $20 a month for business use |
| Airtable (records) | $0, or $20–24 a month for busy accounts |
| Jev safety checks | Fractions of a cent per check |

Check current prices before quoting anyone.

---

## Setting up Opus for someone new

Plan for about **one working day**, plus a few days' wait for texting approval. The full
checklist is [`.claude/skills/opus-builder/references/setup-checklist.md`](.claude/skills/opus-builder/references/setup-checklist.md).
The steps below are the overview.

**Golden rule:** passwords, keys and code words are typed by their owner straight into the
service's settings page. Never send them by text, email or chat.

### Step 1: Start the texting registration (do this first)

1. The new owner creates a **Telnyx** account at telnyx.com and buys a US phone number that
   can do voice and texts.
2. In Telnyx, start **10DLC registration** (texting registration) for that number.
   Approval can take several days, and texts are blocked until it's approved.

### Step 2: Create the other accounts (the new owner owns all of them)

| Account | Why |
|---|---|
| **Claude** (claude.ai) | Runs the worker |
| **GitHub** (github.com) | Holds their private copy of this code |
| **Vercel** (vercel.com) | Runs the server |
| **Airtable** (airtable.com) | Keeps the records |
| **TypeSafe AI** (docs.typesafe.ai) | Jev safety checks |
| **Google** | The Gmail and Calendar Opus will use |

### Step 3: Make a private copy of the code

1. Create a **private** GitHub repository for them, for example `smith-opus`.
2. Copy this code into it.
3. Install the Claude GitHub App on that repository (github.com/apps/claude).

### Step 4: Create the records base in Airtable

1. Create a new base, for example "Opus System".
2. Add the 5 tables (Activity Log, Pending Actions, Outreach, Jobs, Contacts) with the exact
   field names listed in the setup checklist, Part 3.
3. Create a personal access token for **this base only**, with read and write access to
   records. The owner pastes it into Vercel in the next step.

### Step 5: Put the server online (Vercel)

1. In Vercel, **Add New → Project**, and import their repository.
2. Open **Settings → Environment Variables** and add the settings listed in the setup
   checklist, Part 4: the owner's name and phone, the trusted person (optional), the
   assistant's name, the Telnyx and Airtable details, and the generated secrets.
3. Each person types their own **code word** themselves.
4. Redeploy, then open `https://<their-server>.vercel.app/api/health`. It must say
   `"configured": true`.

### Step 6: Create the phone receptionist (Telnyx)

Run the setup script from their copy of the code (exact command in the setup checklist,
Part 5). Run it with `--dry-run` first to see what it will create. **Don't connect the
phone number yet.**

### Step 7: Set up the worker (Claude)

1. In Claude, create a cloud **environment** with limited internet access and the secret the
   worker uses to report back.
2. Create a **routine** with the worker's instructions (generated from a template), the
   strongest model offered, and only the connectors they need, such as Gmail and Calendar.
   Never add money or trading connectors.
3. Add an **API trigger**, and paste its address and token into Vercel. Redeploy.

### Step 8: Test, then go live

1. Run the tests in [`acceptance-tests.md`](.claude/skills/opus-builder/references/acceptance-tests.md)
   that don't need the phone.
2. With the owner's OK, connect the phone number (`scripts/connect-number.mjs`, which saves a
   backup first).
3. Run the live tests with the owner on the phone.
4. Give them their one-page guide
   ([`client-guide.md`](.claude/skills/opus-builder/references/client-guide.md), filled in).
5. For the first week, read the daily 9 AM safety summary text and the Activity Log.

**Tip:** in Claude Code, ask for the **opus-builder** skill ("set up Opus for a new client").
It walks through every step above, including the questions to ask the client.

---

## Common changes

| Change | How |
|---|---|
| Change the owner's or trusted person's phone | Vercel → Settings → Environment Variables → `OWNER_PHONE` or `TRUSTED_PHONE` → Save → Redeploy |
| Change a code word | The person edits `OWNER_CODE_WORD` or `TRUSTED_CODE_WORD` in Vercel themselves → Redeploy |
| Add or remove a contact | Ask Opus ("Save Sam's number…"), or edit the Contacts table in Airtable |
| Rename the assistant | `ASSISTANT_NAME` in Vercel, then re-run the setup script with the same name |
| Change the voice | `scripts/set-voice.mjs` (see "The phone assistant's models and voice" above) |
| Give the worker a new app | Follow the checklist in `docs/SAFETY_RULES.md` before connecting it |

## Where things are

| Folder or file | What's in it |
|---|---|
| `src/` | The server's code |
| `api/` | The server's web addresses (one file each) |
| `test/` | Automated tests |
| `assistant/` | The phone receptionist's instructions |
| `scripts/` | Setup scripts (create the receptionist, connect the number) |
| `docs/SETUP.md` | Every setting explained, and how the safety pieces fit |
| `docs/SAFETY_RULES.md` | The safety rules, and the checklist for adding apps |
| `docs/ROUTINE_PROMPT.md` | The worker's instructions |
| `docs/ROUTINE_SETUP_STEPS.md` | Setting up the worker, step by step |
| `.claude/skills/opus-builder/` | The full playbook for setting up a new client |
| `marketing/` | Promo video and landing-page brief |

## For developers

```
npm install
npm run check   # type check plus all tests
```

## Something not working?

| Problem | First thing to check |
|---|---|
| Opus doesn't answer | Telnyx balance, and that the number is connected to the assistant |
| "Not configured" on `/api/health` | A setting is missing in Vercel. The page lists which one, never its value |
| Texts don't arrive | Texting registration (10DLC) must be approved (Telnyx error 40010 means it isn't) |
| Bigger jobs never come back | The routine's API trigger address and token in Vercel, and the worker's report secret |
| A caller says the voice sounds strange | Listen to the call recording in Telnyx. With the Katie voice, calls from one carrier (Consumer Cellular) have sometimes played at half speed. Fish Audio voices were tried as a fix; Katie is back in use, and a Telnyx support ticket is the next step |
| Opus is silent or the voice fails | Check the voice in use (README section above). If it is a Fish Audio voice, switch back to Katie with `scripts/set-voice.mjs katie --yes` |
