import type { Config } from "../config.js";
import { normalizeUsPhone } from "../phone.js";
import type { SessionClaims } from "../session.js";
import type { Store } from "../store/types.js";
import { sendText } from "../telnyxSend.js";

export interface ActionContext {
  caller: SessionClaims;
  callerName: string;
  store: Store;
  config: Config;
  fetchImpl?: typeof fetch;
}

/** A permanent action the agent can do after the caller approves it. */
export interface ActionDefinition {
  type: string;
  /** Shown to the AI so it knows when to use this action. */
  description: string;
  /** Returns an error message, or null if the details are OK. */
  validate(details: Record<string, unknown>): string | null;
  /** Plain-English sentence the agent reads back before asking for a yes. */
  readBack(details: Record<string, unknown>): string;
  /** Does the work. Returns a short result for the agent to tell the caller. */
  run(details: Record<string, unknown>, ctx: ActionContext): Promise<string>;
}

/**
 * Phase 1 ships one harmless action so the whole "ask first" flow can be
 * tested end to end. Real actions (notes, reminders, messages, routines)
 * are added in later phases.
 */
const testAction: ActionDefinition = {
  type: "test_action",
  description: "A harmless test that only writes a line to the activity log. Use it when the caller asks to test the system.",
  validate: () => null,
  readBack: (details) => {
    const label = typeof details["label"] === "string" && details["label"].trim() ? details["label"].trim() : "a test";
    return `I'll run ${label}. It only writes a line in the activity log.`;
  },
  run: async (details, ctx) => {
    await ctx.store.log({
      who: ctx.callerName,
      phone: ctx.caller.phone,
      channel: ctx.caller.channel,
      event: "test_action_ran",
      details: JSON.stringify(details),
      conversation: ctx.caller.conversation,
    });
    return "Test action completed.";
  },
};

const MAX_TEXT_LENGTH = 640; // about 4 text segments

function textDetails(details: Record<string, unknown>): { to: string | null; message: string } {
  const to = normalizeUsPhone(typeof details["to"] === "string" ? details["to"] : String(details["to"] ?? ""));
  const message = typeof details["message"] === "string" ? details["message"].trim() : "";
  return { to, message };
}

/** "+19172809243" -> "917-280-9243" so it reads back clearly. */
function prettyPhone(e164: string): string {
  const d = e164.slice(2);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Text someone on the caller's behalf, from the agent's number. */
const sendTextAction: ActionDefinition = {
  type: "send_text",
  description:
    'Send a text message to a US phone number on the caller\'s behalf. details: {"to": "phone number", "message": "exact text"}.',
  validate: (details) => {
    const { to, message } = textDetails(details);
    if (!to) return "I need a valid US phone number to text.";
    if (!message) return "I need the message to send.";
    if (message.length > MAX_TEXT_LENGTH) return `That message is too long (max ${MAX_TEXT_LENGTH} characters).`;
    return null;
  },
  readBack: (details) => {
    const { to, message } = textDetails(details);
    return `I'll text ${prettyPhone(to!)} this message: "${message}"`;
  },
  run: async (details, ctx) => {
    const { to, message } = textDetails(details);
    const sent = await sendText(ctx.config.telnyx, to!, message, ctx.fetchImpl);
    await ctx.store.log({
      who: ctx.callerName,
      phone: ctx.caller.phone,
      channel: ctx.caller.channel,
      event: "text_sent",
      details: `To ${to}: "${message}" (Telnyx id ${sent.id})`,
      conversation: ctx.caller.conversation,
    });
    return `Text sent to ${prettyPhone(to!)}.`;
  },
};

const ACTIONS: ActionDefinition[] = [testAction, sendTextAction];

export function getAction(type: string): ActionDefinition | null {
  return ACTIONS.find((a) => a.type === type) ?? null;
}

export function listActionTypes(): string[] {
  return ACTIONS.map((a) => a.type);
}
