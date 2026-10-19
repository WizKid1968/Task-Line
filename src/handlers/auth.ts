import { findPerson, type Person } from "../config.js";
import type { Deps } from "../deps.js";
import { json, parseJsonObject } from "../http.js";
import { normalizeUsPhone } from "../phone.js";
import { type SessionClaims, verifySessionToken } from "../session.js";
import { logEvent, maskPhone } from "../log.js";
import { verifyTelnyxSignature } from "../telnyxSignature.js";

export type ToolAuth =
  | { ok: true; claims: SessionClaims; person: Person; body: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Every tool request must carry the per-conversation pass (added by Telnyx
 * from the encrypted variable; the AI never sees it). If Telnyx signature
 * headers are present they must also be valid.
 */
export async function authenticateTool(req: Request, deps: Deps): Promise<ToolAuth> {
  const rawBody = await req.text();
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);

  const path = new URL(req.url).pathname;
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  const authHeaderRaw = req.headers.get("authorization") ?? "";
  const seen = {
    path,
    hasSignature: Boolean(signature),
    hasTimestamp: Boolean(timestamp),
    authHeader: authHeaderRaw ? (authHeaderRaw.startsWith("Bearer ") ? "bearer" : "other") : "missing",
    // Telnyx sends the literal template if it couldn't fill the pass in.
    authLooksUnfilled: authHeaderRaw.includes("{{"),
    bodyBytes: rawBody.length,
  };
  if (signature || timestamp) {
    const valid = verifyTelnyxSignature({
      rawBody,
      signature,
      timestamp,
      publicKey: deps.config.telnyxPublicKey,
      nowSeconds,
    });
    if (!valid) {
      logEvent("tool_rejected", { ...seen, reason: "bad_signature", timestamp, now: nowSeconds });
      return { ok: false, response: json(401, { error: "bad_signature" }) };
    }
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const claims = verifySessionToken(token, deps.config.sessionSecret, nowSeconds);
  if (!claims) {
    logEvent("tool_rejected", { ...seen, reason: "no_valid_pass" });
    return {
      ok: false,
      response: json(401, {
        error: "not_authorized",
        message: "This tool only works for approved callers. Politely tell the caller you can't help.",
      }),
    };
  }

  const person = findPerson(deps.config, claims.phone);
  if (!person) {
    logEvent("tool_rejected", { ...seen, reason: "caller_not_allowed", caller: maskPhone(claims.phone) });
    return { ok: false, response: json(403, { error: "not_authorized", message: "Caller is no longer approved." }) };
  }

  const body = parseJsonObject(rawBody);
  if (!body) {
    logEvent("tool_rejected", { ...seen, reason: "body_not_json" });
  }
  if (!body) return { ok: false, response: json(400, { error: "bad_request", message: "Body must be JSON." }) };

  // Extra check: Telnyx can attach the caller's number as a hidden preset field.
  if (typeof body["caller_number"] === "string" && body["caller_number"]) {
    if (normalizeUsPhone(body["caller_number"]) !== claims.phone) {
      logEvent("tool_rejected", { ...seen, reason: "caller_mismatch", pass: maskPhone(claims.phone), preset: maskPhone(String(body["caller_number"])) });
      return { ok: false, response: json(403, { error: "caller_mismatch" }) };
    }
  }

  logEvent("tool_accepted", { ...seen, caller: maskPhone(claims.phone), channel: claims.channel, keys: Object.keys(body) });
  return { ok: true, claims, person, body };
}
