import type { Deps } from "../deps.js";
import { bestEffort, json } from "../http.js";
import { logEvent, maskPhone } from "../log.js";
import { checkReply } from "../jevChecks.js";
import { sendText } from "../telnyxSend.js";
import { authenticateRecipient } from "./auth.js";

/** Most replies passed back per text sent, so a chatty recipient can't run up costs. */
export const MAX_FORWARDS = 10;
const MAX_REPLY_CHARS = 400;
const QUOTE_CHARS = 60;

function prettyPhone(e164: string): string {
  const d = e164.slice(2);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Someone the agent texted replied. Text their reply to the person who asked
 * for the original text. Nothing else can be done from here.
 */
export async function handleForwardReply(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateRecipient(req, deps);
  if (!auth.ok) return auth.response;
  const { phone, outreach, body } = auth;

  const reply = typeof body["message"] === "string" ? body["message"].trim() : "";
  if (!reply) return json(400, { error: "bad_request", message: "No message to pass along." });
  if (outreach.forwards >= MAX_FORWARDS) {
    logEvent("forward_limit", { caller: maskPhone(phone) });
    return json(429, { error: "limit_reached", message: "Too many replies to pass along." });
  }

  // Strip the sign-off from the quote of the original text, so it reads cleanly.
  const original = outreach.message.replace(/ — Sent for .*$/, "");
  // Checkpoint 4: label replies that look like scams or try to order the assistant around.
  const warnings = await checkReply(deps.config.jevApiKey, reply, deps.fetchImpl);
  if (warnings.length) logEvent("reply_flagged", { from: maskPhone(phone), warnings });
  const text =
    (warnings.length ? `${warnings.join(" ")}\n` : "") +
    `Reply from ${prettyPhone(phone)} to your text "${shorten(original, QUOTE_CHARS)}":\n` +
    shorten(reply, MAX_REPLY_CHARS);

  await deps.store.updateOutreach(outreach, { forwards: outreach.forwards + 1 });
  try {
    const sent = await sendText(deps.config.telnyx, outreach.requestedBy, text, deps.fetchImpl);
    logEvent("reply_forwarded", { from: maskPhone(phone), to: maskPhone(outreach.requestedBy) });
    await bestEffort(
      deps.store.log({
        who: "recipient",
        phone,
        channel: "sms_chat",
        event: "reply_forwarded",
        details: `To ${outreach.requesterName}: "${text}" (Telnyx id ${sent.id})`,
      }),
      1500,
    );
    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("reply_forward_failed", { from: maskPhone(phone), message });
    return json(502, { error: "send_failed", message: "The reply could not be passed along." });
  }
}
