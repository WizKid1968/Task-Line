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

Check: open `https://<your-app>.vercel.app/api/health`. It shows `"configured": true`
when every setting is filled in. It never shows the values.

## 2. Airtable base "Task-Line"

Tables (Claude creates these):

- **Activity Log** — Event, Time, Who, Phone, Channel, Details, Conversation
- **Pending Actions** — Code, Status, Action, Summary, Payload, Requested By, Role,
  Channel, Needs Code Word, Created, Expires, Code Word Failures, Result

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

Note: an encrypted per-conversation pass was used at first. Telnyx doesn't attach it
to tool requests on texts (it silently drops them), so tools now rely on step 2-3.
The server still accepts the pass if present.

## 5. Developer commands

```
npm install
npm run check   # type check + tests
```

## 6. Current status (Phase 1)

- Server live at `https://task-line-phi.vercel.app` (`/api/health` reports configured).
- Vercel protection: standard (production address public, previews protected).
- Telnyx assistant **Task-Line Agent** created (Claude Haiku 4.5), integration secret
  `task_line_enc_key` saved.
- Number +1 631-212-8100 connected to Task-Line Agent for calls and texts (10DLC
  registration still assigned). Previous routing was the old "Kai Voice Receptionist"
  call app and "Kai" messaging profile, which still serve 8282 and 8273.
- Live tests passed: calls and texts reach the agent, caller check and Airtable log work.
- **send_text** works on calls (tested: text delivered). Texting fix (signature +
  Telnyx-filled caller details) deployed; awaiting first text test.
- Text conversations restart after 30 quiet minutes, so one failure can't silence them.
