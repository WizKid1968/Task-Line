#!/usr/bin/env node
// Points a Telnyx phone number's calls and texts at the assistant.
// Run this only after every acceptance test passes and the client agrees:
// it takes the number away from whatever it was connected to before.
//
// Usage:
//   AGENT_PHONE=+16315550100 [TELNYX_ASSISTANT_NAME="Task-Line Agent"] \
//   [TELNYX_API_KEY=<key>] node scripts/connect-number.mjs [--yes]
//
// Without --yes it only shows what it would change. Before changing anything it
// saves the number's current settings to number-backup-<digits>.json (to undo).

import { writeFileSync } from "node:fs";

const API = "https://api.telnyx.com/v2";
const ASSISTANT_NAME = process.env.TELNYX_ASSISTANT_NAME || "Task-Line Agent";
const phone = (process.env.AGENT_PHONE ?? "").trim();
const apply = process.argv.includes("--yes");
if (!/^\+1\d{10}$/.test(phone)) throw new Error("Set AGENT_PHONE like +16315550100");

const headers = { "Content-Type": "application/json" };
if (process.env.TELNYX_API_KEY) headers.Authorization = `Bearer ${process.env.TELNYX_API_KEY}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const assistants = await api("GET", "/ai/assistants");
const assistant = (assistants.data ?? []).find((a) => a.name === ASSISTANT_NAME);
if (!assistant) throw new Error(`No assistant named "${ASSISTANT_NAME}". Run scripts/configure-assistant.mjs first.`);
const callApp = assistant.telephony_settings?.default_texml_app_id;
const textProfile = assistant.messaging_settings?.default_messaging_profile_id;
if (!callApp || !textProfile) throw new Error("The assistant has no call app or text profile yet. Check that telephony and messaging are turned on for it.");

const numbers = await api("GET", `/phone_numbers?filter[phone_number]=${encodeURIComponent(phone)}`);
const number = (numbers.data ?? [])[0];
if (!number) throw new Error(`${phone} is not a number on this Telnyx account.`);
const messaging = (await api("GET", `/phone_numbers/${number.id}/messaging`)).data ?? {};

console.log(`Number ${phone}`);
console.log(`  calls now go to:  ${number.connection_name ?? "nothing"} (${number.connection_id ?? "-"})  ->  assistant call app ${callApp}`);
console.log(`  texts now go to:  profile ${messaging.messaging_profile_id ?? "none"}  ->  assistant text profile ${textProfile}`);
if (!apply) {
  console.log("Nothing changed. Add --yes to switch the number to the assistant.");
  process.exit(0);
}

const backupFile = `number-backup-${phone.slice(1)}.json`;
writeFileSync(backupFile, JSON.stringify({ savedAt: new Date().toISOString(), number, messaging }, null, 2));
console.log(`Saved the old settings to ${backupFile}.`);

await api("PATCH", `/phone_numbers/${number.id}`, { connection_id: callApp });
await api("PATCH", `/phone_numbers/${number.id}/messaging`, { messaging_profile_id: textProfile });
console.log(`Done. Calls and texts to ${phone} now reach "${ASSISTANT_NAME}". Test with a call and a text.`);
