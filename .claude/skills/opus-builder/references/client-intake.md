# Client intake

Ask these on the first call. Write the answers into a copy of
`templates/client.example.json`. **Never** write code words, passwords or API keys in it.

Keep each client's file outside this repository (for example in a private folder or a
private repository just for that client), because it holds personal phone numbers.

## 1. People

1. Owner's first name (how the assistant greets them).
2. Owner's mobile number (US only).
3. Trusted person: first name and mobile number (one person; optional).
4. Tell them: each person will pick a **code word** and type it into the settings
   themselves. Any language is fine (accents and capitals don't matter). Don't tell me.

## 2. The assistant

5. What should the assistant be called? (Default "Opus".)
6. Time zone. (Opus is built for New York time; another zone needs a small change in the
   client's copy — see SKILL.md.)
7. A new phone number, or move an existing one? Which area code?

## 3. What they want it to do

Tick what they'll use, so you connect only those apps (fewest apps = safest):

- [ ] Text people for them (built in)
- [ ] Contacts by name (built in)
- [ ] Calendar: Google Calendar? Which account?
- [ ] Email: Gmail? Which account? Should the worker **send** email, or only draft?
- [ ] Research and questions (built in to the worker)
- [ ] Videos / images (needs Higgsfield or HyperFrames; not yet proven end to end — set
      expectations)
- [ ] Web pages / apps (needs a separate GitHub repository and Vercel project for the
      client's sites; not yet proven end to end)
- [ ] Code changes to their own repository

Anything involving payments, banking, trading or purchases: **not offered**.

## 4. Accounts (who owns what)

For each, record whether the client has it, and the account email (no passwords):

| Account | Needed for | Owner |
|---|---|---|
| Claude plan with Claude Code (cloud sessions and routines) | The worker | Client |
| GitHub | Copy of the Opus code | Client (or you, with a transfer plan) |
| Vercel | The server | Client |
| Airtable | Log and records | Client |
| Telnyx | Phone number and phone agent | Client, or yours with a pass-through charge (decide in `business-and-compliance.md`) |
| TypeSafe AI (Jev) | Safety checks | Client |
| Google (Gmail, Calendar) | Email and calendar jobs | Client |
| Higgsfield (optional) | Videos and images | Client |

## 5. Expectations to agree in writing

- What it does today (SKILL.md list) and what's "coming".
- Typical answer time for look-ups: minutes, not seconds.
- Running costs are theirs (Claude plan, Telnyx number and usage, Vercel, Airtable, Jev,
  any credits) — get current prices before quoting.
- Support terms: who they contact, how fast you answer, what changes cost.
