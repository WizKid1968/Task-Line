# Build checklist (one client)

Do the parts in order. Tick each box. Where a step says **client types it**, the client
types the value themselves (screen-share is fine); you never see it.

Names used below (replace with the client's, from `client.json`):

- `<client>` — short name, lowercase, no spaces (e.g. `acme`).
- `<server>` — the client's server address, e.g. `opus-acme.vercel.app`.
- `<assistant>` — the assistant's name (e.g. `Opus`).

---

## Part 1 — Accounts (client owns them)

- [ ] **Claude**: a plan that includes Claude Code cloud sessions and routines. Check the
      current plan requirements and routine run limits before quoting.
- [ ] **GitHub**: an account for the client's copy of the code. Install the Claude GitHub
      App on that repository (github.com/apps/claude) so the worker can read it.
- [ ] **Vercel**: an account (Hobby works for one install; check Vercel's terms on
      commercial use — Hobby is for non-commercial use, so a paid client may need Pro).
- [ ] **Airtable**: an account and a workspace.
- [ ] **Telnyx**: an account with a US number that can do voice and SMS, and **texting
      registration (10DLC) approved** for that number. Unregistered numbers get texts
      blocked (Telnyx error 40010). Registration can take days — start it first.
- [ ] **TypeSafe AI (Jev)**: an account and an API key (docs.typesafe.ai).
- [ ] **Google**: the Gmail / Calendar account the worker should use.
- [ ] Optional: **Higgsfield** API key (videos/images).

## Part 2 — Copy the code

- [ ] Create a **private** repository for the client (e.g. `<client>-opus`) and push this
      repository's current main branch to it. Do not fork publicly.
- [ ] In the copy: if the client is not on New York time, make the time-zone changes
      listed in SKILL.md.
- [ ] Run `npm install` and `npm run check`. All tests must pass.

## Part 3 — Airtable base

- [ ] Create a base named `<assistant> System` (or similar) in the client's workspace.
- [ ] Create these 5 tables with **exactly** these names and fields (the server finds them
      by name; first field listed is the primary field):

| Table | Fields (type) |
|---|---|
| Activity Log | Event (single line), Time (date and time), Who (single line), Phone (single line), Channel (single line), Details (long text), Conversation (single line) |
| Pending Actions | Code (single line), Status (single select), Action (single line), Summary (long text), Payload (long text), Requested By (single line), Role (single line), Channel (single line), Needs Code Word (checkbox), Created (date and time), Expires (date and time), Code Word Failures (number), Result (long text) |
| Outreach | Recipient (single line), Requested By (single line), Requester Name (single line), Message (long text), Sent (date and time), Expires (date and time), Forwards (number) |
| Jobs | Job ID (single line), Status (single select), Permission (single select), Task (long text), Requested By (single line), Requester Name (single line), Channel (single line), Session URL (URL), Result (long text), Created (date and time), Finished (date and time) |
| Contacts | Name (single line), Phone (single line), Added By (single line), Created (date and time) |

      Single-select options are added automatically when the server first writes them.
- [ ] Create a **personal access token** (airtable.com/create/tokens) with scopes
      `data.records:read` and `data.records:write`, access to **this base only**.
      The client copies it straight into Vercel in Part 4.
- [ ] Note the base ID (starts with `app`, from the base's web address).

## Part 4 — Server (Vercel)

- [ ] Import the client's repository into a new Vercel project named `opus-<client>`.
      Note its address: `<server>`.
- [ ] Settings → Environment Variables (Production). Generate random values with
      `openssl rand -base64 36 | tr -d '\n' | pbcopy` (Mac) so they're copied, not shown.

| Name | Value | Who types it |
|---|---|---|
| `OWNER_NAME` | Owner's first name | You |
| `OWNER_PHONE` | Owner's mobile | You |
| `OWNER_CODE_WORD` | Owner's code word (Sensitive) | **Client** |
| `TRUSTED_NAME`, `TRUSTED_PHONE` | Trusted person (optional) | You |
| `TRUSTED_CODE_WORD` | Trusted person's code word (Sensitive) | **Trusted person** |
| `ASSISTANT_NAME` | `<assistant>` | You |
| `TELNYX_PUBLIC_KEY` | Telnyx portal → Keys & Credentials → Public Key | You |
| `TELNYX_API_KEY` | Telnyx API key (Sensitive) | **Client** |
| `AGENT_PHONE` | The assistant's number | You |
| `SESSION_SECRET` | Random, 32+ characters (Sensitive) | Generated |
| `TELNYX_ENCRYPTION_KEY` | 32 random bytes, base64url: `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \| pbcopy` (Sensitive) | Generated |
| `AIRTABLE_TOKEN` | From Part 3 (Sensitive) | **Client** |
| `AIRTABLE_BASE_ID` | From Part 3 | You |
| `JEV_API_KEY` | Jev key (Sensitive) | **Client** |
| `CRON_SECRET` | Random (Sensitive) | Generated |
| `JOB_REPORT_SECRET` | Random, 32+ characters (Sensitive). Paste the **same** value into the worker environment in Part 6 before copying anything else | Generated |
| `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN` | Added in Part 7 | — |

- [ ] Redeploy. Open `https://<server>/api/health`: it must show `"configured": true`.

## Part 5 — Phone assistant (Telnyx)

- [ ] From the client's repository, run (the Telnyx key can be given as `TELNYX_API_KEY`
      by the client in their own terminal, or added by a proxy):

```
SERVER_URL=https://<server> \
TELNYX_ENCRYPTION_KEY=<same as Vercel> \
ASSISTANT_NAME=<assistant> \
TELNYX_ASSISTANT_NAME="<assistant> - <client>" \
TELNYX_SECRET_ID=<client>_enc_key \
node scripts/configure-assistant.mjs
```

      Use `--dry-run` first to see what it will create. Every later re-run uses the same
      `TELNYX_ASSISTANT_NAME`, `TELNYX_SECRET_ID` and `ASSISTANT_NAME`, plus
      `--skip-secret` when the key didn't change.
- [ ] Do **not** connect the number yet (Part 9).

## Part 6 — Worker environment (client's Claude account)

On claude.ai/code (the client signed in), cloud icon under the message box → **New
environment** (or edit an existing one) → Cloud:

- [ ] Name: `<assistant> worker`.
- [ ] Network access: **Limited**, with package managers allowed. Add only the websites
      the client's jobs need (see `docs/SAFETY_RULES.md`). For videos add
      `docs.higgsfield.ai`, `github.com`, `raw.githubusercontent.com`,
      `codeload.github.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`,
      `fonts.gstatic.com`.
- [ ] Network secrets → **Add secret**:
      - Name: `<assistant> report`
      - Allowed website: `<server>`, limited to the path `/api/jobs/` if the form offers a
        path box
      - Header `Authorization`, prefix `Bearer`, value: the `JOB_REPORT_SECRET`
        (paste from the clipboard).
- [ ] Optional Higgsfield secret: allowed website `api.higgsfield.ai`, header
      `Authorization`, prefix `Key`, value the client's Higgsfield key (**client types it**).
- [ ] Save.

## Part 7 — Worker routine (client's Claude account)

- [ ] Fill the worker's instructions:
      `node .claude/skills/opus-builder/scripts/fill-template.mjs client.json > worker-prompt.txt`
      Read the result once end to end.
- [ ] claude.ai/code/routines → **New routine** → Cloud.
      - Name: `<assistant> worker`
      - Instructions: paste `worker-prompt.txt`
      - Model: the strongest Opus model offered
      - Repository: the client's `<client>-opus` repository
      - Environment: `<assistant> worker` (Part 6)
      - Connectors: **only** what intake said (e.g. Gmail, Google Calendar). Remove every
        trading, investing or payment connector. Never the system Airtable base.
- [ ] Add an **API** trigger (website only). Copy its address into Vercel as
      `ROUTINE_FIRE_URL`. **Generate token** (shown once) → **client pastes it** into
      Vercel as `ROUTINE_TOKEN` (Sensitive).
- [ ] Redeploy the server.

## Part 8 — Daily watchdog

- [ ] `vercel.json` already schedules `/api/cron/watchdog` daily at 13:00 UTC (9 AM New
      York, 8 AM in winter). Check Vercel → project → Settings → Cron Jobs shows it.

## Part 9 — Test, then go live

- [ ] Run every test in `acceptance-tests.md` that doesn't need the number (health, unit
      tests, dry runs).
- [ ] With the client's agreement, connect the number:

```
AGENT_PHONE=<number> TELNYX_ASSISTANT_NAME="<assistant> - <client>" node scripts/connect-number.mjs        # shows the change
AGENT_PHONE=<number> TELNYX_ASSISTANT_NAME="<assistant> - <client>" node scripts/connect-number.mjs --yes  # does it (saves a backup first)
```

- [ ] Run the live acceptance tests with the owner on the phone.
- [ ] Hand over `client-guide.md`, filled in.
- [ ] First week: read each morning's watchdog text and the Activity Log; fix anything odd.
