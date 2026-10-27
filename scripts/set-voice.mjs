#!/usr/bin/env node
// Switches the phone assistant's voice. Only the voice changes; everything else stays.
//
// Usage:
//   [TELNYX_ASSISTANT_NAME="Task-Line Agent"] [TELNYX_API_KEY=<key>] \
//   node scripts/set-voice.mjs <nova|katie|full voice id> [--yes]
//
//   nova   Fish Audio "Nova" (s2.1-pro), the main voice since Oct 27, 2026
//   katie  Telnyx Ultra "Katie - Friendly Fixer", the backup (the voice before Nova)
//
// Without --yes it only shows the change. Before changing anything it saves the
// assistant's current voice settings to voice-backup-<time>.json (to undo).
// In a Claude Code cloud session, add NODE_USE_ENV_PROXY=1.

import { writeFileSync } from "node:fs";

export const VOICES = {
  nova: "FishAudio.s2.1-pro.b545c585f631496c914815291da4e893",
  katie: "Telnyx.Ultra.f786b574-daa5-4673-aa0c-cbe3e8534c02",
};

const API = "https://api.telnyx.com/v2";
const ASSISTANT_NAME = process.env.TELNYX_ASSISTANT_NAME || "Task-Line Agent";
const choice = (process.argv[2] ?? "").trim();
const apply = process.argv.includes("--yes");
const voice = VOICES[choice.toLowerCase()] ?? (choice.includes(".") ? choice : "");
if (!voice) throw new Error(`Say which voice: ${Object.keys(VOICES).join(" or ")} (or a full voice id).`);

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
if (!assistant) throw new Error(`No assistant named "${ASSISTANT_NAME}".`);
const current = assistant.voice_settings ?? {};

console.log(`Assistant "${ASSISTANT_NAME}"`);
console.log(`  voice now: ${current.voice ?? "none"}`);
console.log(`  new voice: ${voice}`);
if (current.voice === voice) {
  console.log("Already using that voice. Nothing to do.");
  process.exit(0);
}
if (!apply) {
  console.log("Nothing changed. Add --yes to switch.");
  process.exit(0);
}

const backupFile = `voice-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backupFile, JSON.stringify({ savedAt: new Date().toISOString(), assistant: assistant.id, voice_settings: current }, null, 2));
console.log(`Saved the old voice settings to ${backupFile}.`);

await api("POST", `/ai/assistants/${assistant.id}`, { voice_settings: { ...current, voice } });
const check = await api("GET", `/ai/assistants/${assistant.id}`);
const now = (check.data ?? check).voice_settings?.voice;
if (now !== voice) throw new Error(`Telnyx still shows ${now}. The switch didn't take; try again or check the Telnyx portal.`);
console.log(`Done. The assistant now speaks with ${voice}. Make a test call.`);
