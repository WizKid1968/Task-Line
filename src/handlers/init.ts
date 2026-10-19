import { codeWordRequired } from "../codeWord.js";
import { findPerson } from "../config.js";
import type { Deps } from "../deps.js";
import { encryptForTelnyx } from "../encrypt.js";
import { bestEffort, json, parseJsonObject } from "../http.js";
import { normalizeUsPhone } from "../phone.js";
import { createSessionToken } from "../session.js";
import { logEvent, maskPhone } from "../log.js";
import { verifyTelnyxSignature } from "../telnyxSignature.js";

const CALL_PASS_SECONDS = 2 * 60 * 60; // calls are limited to 30 min; 2h is generous
const TEXT_PASS_SECONDS = 24 * 60 * 60; // texts refresh the pass on each message

/**
 * Telnyx calls this at the start of every conversation (the "dynamic
 * variables webhook"). We check who is calling and, only for the two allowed
 * numbers, hand back an encrypted per-conversation pass that the agent's
 * tools must carry. Anyone else gets no pass, so the tools refuse them.
 */
export async function handleInit(req: Request, deps: Deps): Promise<Response> {
  const rawBody = await req.text();
  const signed = verifyTelnyxSignature({
    rawBody,
    signature: req.headers.get("telnyx-signature-ed25519"),
    timestamp: req.headers.get("telnyx-timestamp"),
    publicKey: deps.config.telnyxPublicKey,
    nowSeconds: Math.floor(deps.now().getTime() / 1000),
  });
  if (!signed) {
    logEvent("init_rejected", { reason: "bad_signature", hasSignature: req.headers.has("telnyx-signature-ed25519") });
    return json(401, { error: "bad_signature" });
  }

  const body = parseJsonObject(rawBody);
  const data = (body?.["data"] ?? {}) as Record<string, unknown>;
  const payload = (data["payload"] ?? {}) as Record<string, unknown>;

  const channel = String(payload["telnyx_conversation_channel"] ?? "unknown");
  const rawPhone = typeof payload["telnyx_end_user_target"] === "string" ? payload["telnyx_end_user_target"] : "";
  const phone = normalizeUsPhone(rawPhone);
  const verified = payload["telnyx_end_user_target_verified"] === true;
  const conversation = String(payload["call_control_id"] ?? data["id"] ?? "");
  const person = findPerson(deps.config, phone);

  logEvent("init", { caller: maskPhone(phone), channel, verified, allowed: Boolean(person) });
  if (!person) {
    await bestEffort(
      deps.store.log({
        who: "unknown",
        phone: rawPhone,
        channel,
        event: "refused_unknown_caller",
        details: "Caller is not on the allowed list. No pass was issued.",
        conversation,
      }),
      700,
    );
    return json(200, {
      dynamic_variables: { caller_role: "unknown", caller_name: "", code_word_required: "yes" },
      // An empty section clears any pass left over in this conversation.
      encrypted_dynamic_variables: {},
    });
  }

  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const needsCodeWord = codeWordRequired(channel, verified);
  const token = createSessionToken(
    {
      v: 1,
      role: person.role,
      phone: person.phone,
      channel,
      verified,
      conversation,
      exp: nowSeconds + (channel === "phone_call" ? CALL_PASS_SECONDS : TEXT_PASS_SECONDS),
    },
    deps.config.sessionSecret,
  );

  await bestEffort(
    deps.store.log({
      who: person.name,
      phone: person.phone,
      channel,
      event: "conversation_started",
      details: `Pass issued. Carrier-confirmed number: ${verified ? "yes" : "no"}. Code word needed for permanent actions: ${needsCodeWord ? "yes" : "no"}.`,
      conversation,
    }),
    700,
  );

  return json(200, {
    dynamic_variables: {
      caller_role: person.role,
      caller_name: person.name,
      code_word_required: needsCodeWord ? "yes" : "no",
    },
    encrypted_dynamic_variables: {
      session_token: encryptForTelnyx(token, deps.config.telnyxEncryptionKey),
    },
  });
}
