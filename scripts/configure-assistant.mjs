#!/usr/bin/env node
// Creates or updates the Task-Line assistant in Telnyx.
//
// Usage:
//   SERVER_URL=https://<your-vercel-app>.vercel.app \
//   TELNYX_ENCRYPTION_KEY=<same value as in Vercel> \
//   [TELNYX_API_KEY=<key>] node scripts/configure-assistant.mjs [--dry-run]
//
// TELNYX_API_KEY can be left out where a proxy adds the key automatically.
// This script does NOT connect a phone number; that is a separate, deliberate step.

import { readFileSync } from "node:fs";

const ASSISTANT_NAME = "Task-Line Agent";
const ENC_SECRET_ID = "task_line_enc_key";
const API = "https://api.telnyx.com/v2";

const dryRun = process.argv.includes("--dry-run");
const serverUrl = (process.env.SERVER_URL ?? "").replace(/\/+$/, "");
const encKey = process.env.TELNYX_ENCRYPTION_KEY ?? "";
if (!/^https:\/\//.test(serverUrl)) throw new Error("Set SERVER_URL to the https address of the Vercel app");
if (Buffer.from(encKey, "base64url").length !== 32) throw new Error("Set TELNYX_ENCRYPTION_KEY (32 bytes, base64url)");

const headers = { "Content-Type": "application/json" };
if (process.env.TELNYX_API_KEY) headers.Authorization = `Bearer ${process.env.TELNYX_API_KEY}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

// The pass header. Telnyx decrypts {{session_token}} with the integration secret
// and adds it to each tool request; the AI never sees it.
const authHeaders = [{ name: "Authorization", value: `Bearer {{session_token | ${ENC_SECRET_ID}}}` }];
// Filled in by Telnyx, not by the AI, so the server can double-check the caller.
const presetCaller = { caller_number: "{{telnyx_end_user_target}}" };

function webhookTool(name, description, path, properties, required) {
  return {
    type: "webhook",
    timeout_ms: 15000,
    webhook: {
      name,
      description,
      url: `${serverUrl}${path}`,
      method: "POST",
      headers: authHeaders,
      body_parameters: { type: "object", properties, required },
      preset_body_fields: presetCaller,
    },
  };
}

const assistant = {
  name: ASSISTANT_NAME,
  model: "anthropic/claude-haiku-4-5",
  instructions: readFileSync(new URL("../assistant/instructions.md", import.meta.url), "utf8"),
  enabled_features: ["telephony", "messaging"],
  dynamic_variables_webhook_url: `${serverUrl}/api/telnyx/init`,
  dynamic_variables_webhook_timeout_ms: 5000,
  // Safe defaults if the server can't be reached: treat the caller as unknown.
  dynamic_variables: { caller_role: "unknown", caller_name: "", code_word_required: "yes" },
  tools: [
    webhookTool(
      "request_action",
      "Step 1 of the ask-first rule. Prepares a permanent action WITHOUT doing it. Returns a read_back sentence to read to the caller and a pending_code.",
      "/api/tools/request-action",
      {
        action_type: { type: "string", description: "The kind of action. Currently available: test_action." },
        details: { type: "object", description: "Details for the action, e.g. {\"label\": \"a quick test\"}." },
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
    { type: "hangup", hangup: { description: "Hang up the call. Use when the caller is not approved, or the conversation is finished." } },
  ],
};

if (dryRun) {
  console.log(JSON.stringify({ ...assistant, instructions: `<${assistant.instructions.length} chars>` }, null, 2));
  process.exit(0);
}

// 1. Encryption key as an integration secret (create once; update if it exists).
const secrets = await api("GET", "/integration_secrets");
const existingSecret = (secrets.data ?? []).find((s) => s.identifier === ENC_SECRET_ID);
if (existingSecret) {
  await api("DELETE", `/integration_secrets/${existingSecret.id}`);
}
await api("POST", "/integration_secrets", { identifier: ENC_SECRET_ID, type: "bearer", token: encKey });
console.log(`Integration secret "${ENC_SECRET_ID}" saved.`);

// 2. Create or update the assistant.
const list = await api("GET", "/ai/assistants");
const existing = (list.data ?? []).find((a) => a.name === ASSISTANT_NAME);
const saved = existing
  ? await api("POST", `/ai/assistants/${existing.id}`, assistant)
  : await api("POST", "/ai/assistants", assistant);
const result = saved.data ?? saved;
console.log(`${existing ? "Updated" : "Created"} assistant "${ASSISTANT_NAME}" (${result.id}).`);
