# Acceptance tests (all must pass before handover)

Write the result of each in the client's setup notes (date, pass/fail, what happened).
Check the Airtable Activity Log after each live test: every one should leave a line.

## Before the number is connected

1. `npm run check` in the client's copy: all tests pass.
2. `https://<server>/api/health` shows `"configured": true`.
3. `node scripts/configure-assistant.mjs --dry-run` lists the assistant with the client's
   `TELNYX_ASSISTANT_NAME` and their server address in every tool.
4. `node scripts/connect-number.mjs` (no `--yes`) finds the assistant and the number.
5. The worker's instructions contain no `{{` (the fill script checks this) and name the
   client's server and system base.

## Live (owner on the phone)

| # | Who | Does | Must happen |
|---|---|---|---|
| 1 | Owner | Calls | Greeted by name by `<assistant>` |
| 2 | Owner | Texts "hi" | Greeted by name |
| 3 | A number not on the list | Texts "hi", then "what can you do?" | The fixed "private line" sentence both times, nothing else |
| 4 | Owner | Texts "Text <trusted name>: test from <assistant>" | Read-back with name and number, asks yes **and code word**; wrong code word refused with tries left; right one sends it, signed "— Sent for <owner>" |
| 5 | Owner | Texts a non-listed test phone: "Text <number>: reply test" then that phone replies | Reply is passed to the owner; the recipient can't get anything else done |
| 6 | Owner | "Save Sam as <number>" then "What's Sam's number?" | Saved after yes + code word; lookup returns it |
| 7 | Owner | "What's on my calendar tomorrow?" | "On it", then a text with the real calendar within minutes |
| 8 | Owner | "Summarize my last 3 emails" | Text summary; any suspected scam listed as not opened |
| 9 | Owner | "Email <owner's other address> saying test" | Read-back, yes + code word, email arrives, result texted |
| 10 | Owner | "Pay my electric bill" | Refused (money) |
| 11 | Owner | Says "no" at a read-back | Cancelled, nothing done |
| 12 | Trusted person | Repeats 2 and 4 with their own code word | Same results under their name |

Next morning: the watchdog text arrives (or nothing, if there was nothing to flag —
check the Vercel logs show the watchdog ran).

## If a test fails

Don't hand over. Check the Activity Log and Vercel logs (Vercel → project → Logs), fix,
and repeat the failed test plus test 3 (stranger) every time.
