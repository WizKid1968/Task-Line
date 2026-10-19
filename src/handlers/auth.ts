import { findPerson, type Person } from "../config.js";
import type { Deps } from "../deps.js";
import { json, parseJsonObject } from "../http.js";
import { logEvent, maskPhone } from "../log.js";
import { normalizeUsPhone } from "../phone.js";
import { type SessionClaims, verifySessionToken } from "../session.js";
import type { Outreach } from "../store/types.js";
import { verifyTelnyxSignature } from "../telnyxSignature.js";

export type ToolAuth =
  | { ok: true; claims: SessionClaims; person: Person; body: Record<string, unknown> }
  | { ok: false; response: Response };

/** Short-lived claims for a request proven by Telnyx's signature. */
const SIGNED_REQUEST_SECONDS = 60;

/**
 * Fields Telnyx fills into every tool request (assistant "preset" fields).
 * The AI can neither see nor change them, and Telnyx's signature covers them.
 */
export const PRESET_FIELDS = {
  callerNumber: "caller_number", // {{telnyx_end_user_target}}
  channel: "conversation_channel", // {{telnyx_conversation_channel}}
  attestation: "caller_attestation", // {{telnyx_shaken_stir_attestation}}
  callRef: "call_ref", // {{call_control_id}}
} as const;

/** Telnyx leaves a placeholder untouched when it can't fill it in. */
function filled(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.includes("{{")) return null;
  return v;
}

function deny(seen: Record<string, unknown>, reason: string, status: number, extra: Record<string, unknown> = {}): ToolAuth {
  logEvent("tool_rejected", { ...seen, reason, ...extra });
  const message =
    status === 401
      ? "This tool only works for approved callers. Politely tell the caller you can't help."
      : "Caller is not approved.";
  return { ok: false, response: json(status, { error: status === 400 ? "bad_request" : "not_authorized", message }) };
}

/**
 * Two accepted ways to prove who is asking:
 *
 * 1. Per-conversation pass in the Authorization header (from the encrypted
 *    dynamic variable). Works on calls; Telnyx doesn't attach it on texts.
 * 2. Telnyx signature (required, max 5 minutes old) plus the caller details
 *    Telnyx fills in itself. The signature covers the whole body, so neither
 *    the AI nor anyone in between can change the caller number or channel.
 *
 * In both cases the caller must be one of the allowed numbers. If signature
 * headers are present they must be valid, whichever way is used.
 */
export async function authenticateTool(req: Request, deps: Deps): Promise<ToolAuth> {
  const rawBody = await req.text();
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);

  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  const authHeader = req.headers.get("authorization") ?? "";
  const seen: Record<string, unknown> = {
    path: new URL(req.url).pathname,
    hasSignature: Boolean(signature),
    authHeader: authHeader ? (authHeader.startsWith("Bearer ") ? "bearer" : "other") : "missing",
    bodyBytes: rawBody.length,
  };

  let signed = false;
  if (signature || timestamp) {
    signed = verifyTelnyxSignature({ rawBody, signature, timestamp, publicKey: deps.config.telnyxPublicKey, nowSeconds });
    if (!signed) return deny(seen, "bad_signature", 401, { timestamp, now: nowSeconds });
  }

  const body = parseJsonObject(rawBody);
  if (!body) return deny(seen, "body_not_json", 400);

  const presetCaller = filled(body[PRESET_FIELDS.callerNumber]);

  // Way 1: the per-conversation pass.
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  let claims = verifySessionToken(token, deps.config.sessionSecret, nowSeconds);
  let method = "pass";
  if (claims && presetCaller && normalizeUsPhone(presetCaller) !== claims.phone) {
    return deny(seen, "caller_mismatch", 403, { pass: maskPhone(claims.phone), preset: maskPhone(presetCaller) });
  }

  // Way 2: Telnyx signature + Telnyx-filled caller details.
  if (!claims) {
    if (!signed) return deny(seen, "no_pass_and_unsigned", 401);
    const phone = normalizeUsPhone(presetCaller);
    if (!phone) return deny(seen, "no_caller_number", 401);
    const channel = filled(body[PRESET_FIELDS.channel]) ?? "unknown";
    const attestation = (filled(body[PRESET_FIELDS.attestation]) ?? "").toLowerCase();
    const person = findPerson(deps.config, phone);
    if (!person) return deny(seen, "caller_not_allowed", 403, { caller: maskPhone(phone) });
    claims = {
      v: 1,
      role: person.role,
      phone,
      channel,
      // Carrier-confirmed only for calls with full ("A") attestation.
      verified: channel === "phone_call" && attestation === "a",
      conversation: filled(body[PRESET_FIELDS.callRef]) ?? "",
      exp: nowSeconds + SIGNED_REQUEST_SECONDS,
    };
    method = "signature";
  }

  const person = findPerson(deps.config, claims.phone);
  if (!person) return deny(seen, "caller_not_allowed", 403, { caller: maskPhone(claims.phone) });

  logEvent("tool_accepted", {
    ...seen,
    method,
    caller: maskPhone(claims.phone),
    channel: claims.channel,
    verified: claims.verified,
    keys: Object.keys(body),
  });
  return { ok: true, claims, person, body };
}

export type RecipientAuth =
  | { ok: true; phone: string; outreach: Outreach; body: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * For forward_reply: the sender must be someone the agent texted for an allowed
 * person within the reply window. Telnyx's signature is required (no pass is
 * ever issued to recipients), and the sender's number comes only from the
 * Telnyx-filled field. Texts only.
 */
export async function authenticateRecipient(req: Request, deps: Deps): Promise<RecipientAuth> {
  const rawBody = await req.text();
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  const seen: Record<string, unknown> = { path: new URL(req.url).pathname, hasSignature: Boolean(signature), bodyBytes: rawBody.length };
  const fail = (reason: string, status: number, extra: Record<string, unknown> = {}): RecipientAuth => {
    deny(seen, reason, status, extra);
    return { ok: false, response: json(status, { error: "not_authorized", message: "This reply can't be passed along." }) };
  };

  const signed = verifyTelnyxSignature({ rawBody, signature, timestamp, publicKey: deps.config.telnyxPublicKey, nowSeconds });
  if (!signed) return fail("bad_signature", 401, { timestamp, now: nowSeconds });
  const body = parseJsonObject(rawBody);
  if (!body) return fail("body_not_json", 400);

  const phone = normalizeUsPhone(filled(body[PRESET_FIELDS.callerNumber]));
  if (!phone) return fail("no_caller_number", 401);
  if (filled(body[PRESET_FIELDS.channel]) !== "sms_chat") return fail("not_a_text", 403, { caller: maskPhone(phone) });
  // Allowed people use the normal tools; this is only for recipients.
  if (findPerson(deps.config, phone)) return fail("allowed_person_not_recipient", 403, { caller: maskPhone(phone) });

  const outreach = await deps.store.findActiveOutreach(phone, deps.now().toISOString());
  if (!outreach) return fail("no_recent_outreach", 403, { caller: maskPhone(phone) });

  logEvent("recipient_accepted", { ...seen, caller: maskPhone(phone) });
  return { ok: true, phone, outreach, body };
}
