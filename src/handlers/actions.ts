import { randomInt } from "node:crypto";
import { getAction, listActionTypes } from "../actions/registry.js";
import { codeWordMatches, codeWordRequired } from "../codeWord.js";
import type { Deps } from "../deps.js";
import { asObject, bestEffort, json } from "../http.js";
import { logEvent } from "../log.js";
import { authenticateTool } from "./auth.js";

const PENDING_MINUTES = 10;
const MAX_CODE_WORD_ATTEMPTS = 3;
// No look-alike characters (0/O, 1/I/L, 5/S, 8/B) so codes are easy to say.
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

export function newPendingCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Step 1: the agent asks to do something permanent. Nothing runs yet. */
export async function handleRequestAction(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const { claims, person, body } = auth;

  const type = typeof body["action_type"] === "string" ? body["action_type"].trim() : "";
  const def = getAction(type);
  if (!def) {
    logEvent("request_rejected", { reason: "unknown_action", type });
    return json(400, {
      error: "unknown_action",
      message: "That action isn't available yet.",
      available_actions: listActionTypes(),
    });
  }

  const details = asObject(body["details"]);
  const problem = def.validate(details);
  if (problem) {
    logEvent("request_rejected", { reason: "invalid_details", type, problem });
    return json(400, { error: "invalid_details", message: problem });
  }

  const now = deps.now();
  const needsCodeWord = codeWordRequired(claims.channel, claims.verified);
  const readBack = def.readBack(details);
  const pending = await deps.store.createPending({
    code: newPendingCode(),
    action: def.type,
    summary: readBack,
    payload: details,
    requestedBy: claims.phone,
    role: claims.role,
    channel: claims.channel,
    needsCodeWord,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PENDING_MINUTES * 60_000).toISOString(),
    status: "pending",
    failures: 0,
  });

  logEvent("action_requested", { code: pending.code, type: def.type, needsCodeWord });
  await bestEffort(
    deps.store.log({
      who: person.name,
      phone: person.phone,
      channel: claims.channel,
      event: "action_requested",
      details: `${pending.code}: ${readBack}`,
      conversation: claims.conversation,
    }),
    1500,
  );

  return json(200, {
    ok: true,
    pending_code: pending.code,
    read_back: readBack,
    code_word_required: needsCodeWord,
    expires_in_minutes: PENDING_MINUTES,
    next_step: needsCodeWord
      ? "Read this back to the caller. Ask them to say yes AND their code word. Then call confirm_action with pending_code and code_word."
      : "Read this back to the caller and ask for a clear yes. Only after they say yes, call confirm_action with pending_code.",
  });
}

/** Step 2: the caller said yes (and gave the code word if needed). Run it. */
export async function handleConfirmAction(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const { claims, person, body } = auth;

  const code = String(body["pending_code"] ?? "").trim().toUpperCase();
  let pending = code ? await deps.store.findPending(code, claims.phone) : null;
  if (!pending) {
    return json(404, { error: "not_found", message: "No pending action with that code for this caller." });
  }
  if (pending.status !== "pending") {
    return json(409, { error: "not_pending", status: pending.status, message: `That action is already ${pending.status}.` });
  }
  if (new Date(pending.expiresAt).getTime() < deps.now().getTime()) {
    await deps.store.updatePending(pending, { status: "expired" });
    return json(410, { error: "expired", message: "That request expired. Ask the caller if they want to start again." });
  }

  const log = (event: string, details: string) =>
    bestEffort(
      deps.store.log({
        who: person.name,
        phone: person.phone,
        channel: claims.channel,
        event,
        details: `${pending!.code}: ${details}`,
        conversation: claims.conversation,
      }),
      1500,
    );

  if (pending.needsCodeWord) {
    const given = typeof body["code_word"] === "string" ? body["code_word"] : "";
    if (!codeWordMatches(given, person.codeWord)) {
      const failures = pending.failures + 1;
      if (failures >= MAX_CODE_WORD_ATTEMPTS) {
        await deps.store.updatePending(pending, { failures, status: "cancelled", result: "Too many wrong code words." });
        await log("code_word_locked", "Cancelled after too many wrong code words.");
        return json(403, {
          error: "too_many_attempts",
          message: "Too many wrong code words. The request was cancelled for safety.",
        });
      }
      await deps.store.updatePending(pending, { failures });
      await log("code_word_wrong", `Wrong code word (attempt ${failures}).`);
      return json(403, {
        error: "wrong_code_word",
        attempts_left: MAX_CODE_WORD_ATTEMPTS - failures,
        message: "That code word is not right. Nothing was done.",
      });
    }
  }

  const def = getAction(pending.action);
  if (!def) {
    await deps.store.updatePending(pending, { status: "failed", result: "Action type no longer exists." });
    return json(400, { error: "unknown_action", message: "That action is no longer available." });
  }

  pending = await deps.store.updatePending(pending, { status: "running" });
  try {
    const result = await def.run(pending.payload, {
      caller: claims,
      callerName: person.name,
      store: deps.store,
      config: deps.config,
      fetchImpl: deps.fetchImpl,
    });
    await deps.store.updatePending(pending, { status: "done", result });
    await log("action_done", result);
    logEvent("action_done", { code: pending.code, type: pending.action });
    return json(200, { ok: true, result });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await deps.store.updatePending(pending, { status: "failed", result: reason });
    await log("action_failed", reason);
    logEvent("action_failed", { code: pending.code, type: pending.action, reason });
    return json(502, { ok: false, error: "action_failed", message: "The action failed. Tell the caller it didn't go through." });
  }
}

/** The caller changed their mind. */
export async function handleCancelAction(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const { claims, person, body } = auth;

  const code = String(body["pending_code"] ?? "").trim().toUpperCase();
  const pending = code ? await deps.store.findPending(code, claims.phone) : null;
  if (!pending) return json(404, { error: "not_found", message: "No pending action with that code for this caller." });
  if (pending.status !== "pending") {
    return json(409, { error: "not_pending", status: pending.status, message: `That action is already ${pending.status}.` });
  }

  await deps.store.updatePending(pending, { status: "cancelled", result: "Cancelled by caller." });
  await bestEffort(
    deps.store.log({
      who: person.name,
      phone: person.phone,
      channel: claims.channel,
      event: "action_cancelled",
      details: `${pending.code}: ${pending.summary}`,
      conversation: claims.conversation,
    }),
    1500,
  );
  return json(200, { ok: true, message: "Cancelled. Nothing was done." });
}
