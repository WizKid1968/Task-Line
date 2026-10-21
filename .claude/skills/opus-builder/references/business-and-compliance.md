# Before you sell: business and compliance checks

This is a checklist of things to confirm, not legal advice. Rules and prices change;
check each one at the source before the first sale and once a year after. Have a lawyer
review your client agreement.

## 1. Can you resell the pieces?

- [ ] **Anthropic (Claude)**: read the current Consumer Terms / Commercial Terms and usage
      policies. The safe model is: the client buys their own Claude plan and you are paid
      for setup and support (a service), not for reselling Claude access.
- [ ] **Vercel**: Hobby plan is for personal, non-commercial use. Confirm whether a
      client's install needs Pro (on the client's own account).
- [ ] **Telnyx**: if numbers sit on your Telnyx account, check their reseller / ISV rules
      and who is responsible for the traffic. Simpler: the client has their own account.
- [ ] **Airtable, TypeSafe AI (Jev), Higgsfield**: check commercial-use terms of the plan
      the client is on.
- [ ] **This code**: it's yours to license. Decide what the client gets (a licence to use
      their copy, no resale) and put it in the agreement.

## 2. Texting rules (US)

- [ ] **10DLC registration** for every number that sends texts (brand + campaign). The
      campaign description should match what Opus does: personal assistant texts sent on
      the owner's request, and replies to the owner.
- [ ] **Consent**: Opus texts people only when the owner asks. The owner is responsible
      for having the right to text those people. Put that in the agreement and the client
      guide. Never use Opus for marketing blasts.
- [ ] Handle "STOP": Telnyx handles standard opt-out keywords on registered numbers;
      confirm this is on for the client's messaging profile.

## 3. Calls

- [ ] The phone agent answers calls; it doesn't place calls. If you ever add outbound
      calls, check robocall and AI-voice disclosure rules first.
- [ ] Call recording: Opus doesn't record by default. If you turn on recording or
      transcripts, check one-party / two-party consent rules for the client's state.

## 4. Privacy and data

- [ ] Tell the client in writing where their data lives: Telnyx (calls, texts,
      transcripts), Vercel (server logs), Airtable (activity log, contacts, jobs),
      Anthropic (worker sessions), TypeSafe AI (text checked by Jev: tasks, results,
      forwarded replies, email sender/subject/preview, watchdog transcripts with code words
      blanked).
- [ ] You don't keep copies. Your access to their accounts ends at handover unless the
      support agreement says otherwise, and then it's the least access needed.
- [ ] Health, legal or financial clients: extra rules (for example HIPAA) may apply. Don't
      sell to them without checking.

## 5. Pricing (decide, then write down)

Costs the client pays directly (get current prices before quoting): Claude plan, Telnyx
number + per-minute and per-text usage + 10DLC fees, Vercel plan, Airtable plan, Jev, any
video credits.

Your charges, typical structure:

- One-time setup fee (Parts 1–9 of the checklist, about a day of work plus waiting for
  10DLC approval).
- Monthly support fee (watching the watchdog, updating the worker's instructions,
  fixes, adding apps).
- Add-ons quoted separately (time-zone change, new apps, custom actions).

## 6. The agreement should say

- What Opus does today (copy the SKILL.md list) and what's "coming".
- The client owns their accounts and data; you have no access after handover except as
  agreed.
- The client is responsible for whom they text and what they ask the assistant to do.
- AI can make mistakes; permanent actions are read back and need the client's yes.
- No money, trading or payment features.
- Support hours and response times; how changes are priced; how to end the service.
