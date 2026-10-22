#!/usr/bin/env node
// Creates or updates the Task-Line assistant in Telnyx.
//
// Usage:
//   SERVER_URL=https://<your-vercel-app>.vercel.app \
//   TELNYX_ENCRYPTION_KEY=<same value as in Vercel> \
//   [ASSISTANT_NAME=Opus] [TELNYX_ASSISTANT_NAME="Task-Line Agent"] \
//   [TELNYX_API_KEY=<key>] node scripts/configure-assistant.mjs [--dry-run] [--skip-secret] [--keep-conversations]
//
// TELNYX_API_KEY can be left out where a proxy adds the key automatically.
// This script does NOT connect a phone number; that is a separate, deliberate step.

import { readFileSync } from "node:fs";

// Safe default for {{role_instructions}} if the server can't be reached: treat
// everyone as a stranger. Kept in sync with src/agentInstructions.ts by a test.
const strangerInstructions = readFileSync(new URL("../assistant/stranger-instructions.txt", import.meta.url), "utf8").trim();

// The record name in Telnyx (how the script finds it again) and the name callers hear.
const ASSISTANT_NAME = process.env.TELNYX_ASSISTANT_NAME || "Task-Line Agent";
const SPOKEN_NAME = process.env.ASSISTANT_NAME || "Opus";
// Unique per client when several assistants share one Telnyx account.
const ENC_SECRET_ID = process.env.TELNYX_SECRET_ID || "task_line_enc_key";
const API = "https://api.telnyx.com/v2";

const dryRun = process.argv.includes("--dry-run");
// --skip-secret: keep the existing Telnyx integration secret (use when the key hasn't changed).
const skipSecret = process.argv.includes("--skip-secret");
const serverUrl = (process.env.SERVER_URL ?? "").replace(/\/+$/, "");
const encKey = process.env.TELNYX_ENCRYPTION_KEY ?? "";
if (!/^https:\/\//.test(serverUrl)) throw new Error("Set SERVER_URL to the https address of the Vercel app");
if (!process.argv.includes("--skip-secret") && Buffer.from(encKey, "base64url").length !== 32) throw new Error("Set TELNYX_ENCRYPTION_KEY (32 bytes, base64url)");

const headers = { "Content-Type": "application/json" };
if (process.env.TELNYX_API_KEY) headers.Authorization = `Bearer ${process.env.TELNYX_API_KEY}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

// Caller details Telnyx fills into every tool request. The AI can neither see nor
// change them, and Telnyx's signature on the request covers them. The server
// requires a valid signature and checks the caller against the allowed numbers.
// (An encrypted pass header was used before, but Telnyx doesn't attach it on
// texts and then silently drops the request, so tools rely on these instead.)
const presetCallerDetails = {
  caller_number: "{{telnyx_end_user_target}}",
  conversation_channel: "{{telnyx_conversation_channel}}",
  caller_attestation: "{{telnyx_shaken_stir_attestation}}",
  call_ref: "{{call_control_id}}",
};

function webhookTool(name, description, path, properties, required) {
  return {
    type: "webhook",
    timeout_ms: 15000,
    webhook: {
      name,
      description,
      url: `${serverUrl}${path}`,
      method: "POST",
      headers: [],
      body_parameters: { type: "object", properties, required },
      preset_body_fields: presetCallerDetails,
    },
  };
}

const assistant = {
  name: ASSISTANT_NAME,
  model: "anthropic/claude-haiku-4-5",
  instructions: readFileSync(new URL("../assistant/instructions.md", import.meta.url), "utf8").replaceAll("%ASSISTANT_NAME%", SPOKEN_NAME),
  enabled_features: ["telephony", "messaging"],
  // A text conversation that goes quiet for 30 minutes starts fresh next time,
  // so one stuck exchange can't silence the agent for good.
  messaging_settings: { conversation_inactivity_minutes: 30 },
  dynamic_variables_webhook_url: `${serverUrl}/api/telnyx/init`,
  dynamic_variables_webhook_timeout_ms: 5000,
  // Safe defaults if the server can't be reached: treat the caller as unknown.
  dynamic_variables: { caller_role: "unknown", caller_name: "", code_word_required: "yes", role_instructions: strangerInstructions, greeting: "Sorry, this is a private line and it can't take messages." },
  // What the agent says first on a call. The server picks it per caller (members hear their name,
  // everyone else hears only the private-line sentence).
  greeting: "{{greeting}}",
  tools: [
    webhookTool(
      "request_action",
      "Step 1 of the ask-first rule. Prepares a permanent action WITHOUT doing it. Returns a read_back sentence to read to the caller and a pending_code.",
      "/api/tools/request-action",
      {
        action_type: { type: "string", description: "The kind of action: send_text, save_contact, claude_job or test_action." },
        details: { type: "object", description: "Details for the action. For send_text: {\"to\": \"contact name or phone number\", \"message\": \"exact text\"}. For save_contact: {\"name\": \"Sam\", \"phone\": \"917-555-0101\"}. For claude_job: {\"task\": \"the full job\"}." },
      },
      ["action_type"],
    ),
    webhookTool(
      "confirm_action",
      "Step 2. Call ONLY after the caller clearly said yes in this conversation. Runs the pending action.",
      "/api/tools/confirm-action",
      {
        pending_code: { type: "string", description: "The pending_code from request_action." },
        code_word: { type: "string", description: "The caller's code word, exactly as said. Only when code_word_required was true." },
      },
      ["pending_code"],
    ),
    webhookTool(
      "cancel_action",
      "Cancels a pending action when the caller says no or changes their mind.",
      "/api/tools/cancel-action",
      { pending_code: { type: "string", description: "The pending_code from request_action." } },
      ["pending_code"],
    ),
    webhookTool(
      "find_contact",
      "Look up a saved contact's phone number by name (the owner, the trusted person, or anyone saved with save_contact). No approval needed.",
      "/api/tools/find-contact",
      { name: { type: "string", description: "The contact's name as the caller said it." } },
      ["name"],
    ),
    webhookTool(
      "start_lookup",
      "ALWAYS use this when the caller asks about their email, calendar, schedule, documents, or anything to look up or research. Claude (the worker) has access to these; you do not. Only for requests that change or send nothing. No approval needed. The answer is texted to the caller.",
      "/api/tools/start-lookup",
      { task: { type: "string", description: "The request in the caller's words, with every detail they gave." } },
      ["task"],
    ),
    webhookTool(
      "forward_reply",
      "Only for someone replying to a text you sent. Passes their message, word for word, to the person the text was sent for.",
      "/api/tools/forward-reply",
      { message: { type: "string", description: "The person's message, word for word." } },
      ["message"],
    ),
    { type: "hangup", hangup: { description: "Hang up the call. Use when the caller is not approved, or the conversation is finished." } },
  ],
};

if (dryRun) {
  console.log(JSON.stringify({ ...assistant, instructions: `<${assistant.instructions.length} chars>` }, null, 2));
  process.exit(0);
}

// 1. Encryption key as an integration secret (create once; update if it exists).
if (!skipSecret) {
const secrets = await api("GET", "/integration_secrets");
const existingSecret = (secrets.data ?? []).find((s) => s.identifier === ENC_SECRET_ID);
if (existingSecret) {
  await api("DELETE", `/integration_secrets/${existingSecret.id}`);
}
await api("POST", "/integration_secrets", { identifier: ENC_SECRET_ID, type: "bearer", token: encKey });
console.log(`Integration secret "${ENC_SECRET_ID}" saved.`);
} else {
  console.log(`Keeping existing integration secret "${ENC_SECRET_ID}".`);
}

// 2. Create or update the assistant.
const list = await api("GET", "/ai/assistants");
const existing = (list.data ?? []).find((a) => a.name === ASSISTANT_NAME);
const saved = existing
  ? await api("POST", `/ai/assistants/${existing.id}`, assistant)
  : await api("POST", "/ai/assistants", assistant);
const result = saved.data ?? saved;
console.log(`${existing ? "Updated" : "Created"} assistant "${ASSISTANT_NAME}" (${result.id}).`);

// 3. Close open text conversations for this assistant. Telnyx keeps each text
//    conversation on the assistant version it started with, so without this an
//    old conversation would keep using the old settings. Conversations active in
//    the last 2 minutes are left alone (someone may be mid-request) and listed.
//    Use --keep-conversations to skip this step.
if (!process.argv.includes("--keep-conversations")) {
  const recentMs = 2 * 60 * 1000;
  const skipped = new Set();
  let closed = 0;
  for (let round = 0; round < 20; round++) {
    const page = await api("GET", "/ai/conversations?order=created_at.desc&limit=100");
    const targets = (page.data ?? []).filter(
      (c) =>
        c.metadata?.assistant_id === result.id &&
        c.metadata?.telnyx_conversation_channel === "sms_chat" &&
        !skipped.has(c.id),
    );
    if (targets.length === 0) break;
    for (const c of targets) {
      const last = Date.parse(c.last_message_at ?? c.created_at);
      if (Date.now() - last < recentMs) {
        skipped.add(c.id);
        continue;
      }
      await api("DELETE", `/ai/conversations/${c.id}`);
      closed++;
    }
  }
  console.log(`Closed ${closed} old text conversation(s).`);
  if (skipped.size) console.log(`Left ${skipped.size} active conversation(s) open; re-run in a few minutes to close them.`);
}
