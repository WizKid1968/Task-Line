import { type Config, findPerson } from "../config.js";
import { MAX_TASK_CHARS, startJob } from "../jobs.js";
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
  now: () => Date;
}

/** Who is asking, for validating and reading back an action before it runs. */
export interface RequestInfo {
  callerName: string;
}

/** A permanent action the agent can do after the caller approves it. */
export interface ActionDefinition {
  type: string;
  /** Shown to the AI so it knows when to use this action. */
  description: string;
  /** Returns an error message, or null if the details are OK. */
  validate(details: Record<string, unknown>, info: RequestInfo): string | null;
  /** Plain-English sentence the agent reads back before asking for a yes. */
  readBack(details: Record<string, unknown>, info: RequestInfo): string;
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

const MAX_TEXT_LENGTH = 640; // about 4 text segments, sign-off included
/** Replies to a text count as "we reached out first" for this long. */
export const REPLY_WINDOW_HOURS = 24;

/** Added to every text the agent sends, so the recipient knows who it's from. */
export function signOff(callerName: string): string {
  return ` — Sent for ${callerName}`;
}

function textDetails(details: Record<string, unknown>): { to: string | null; message: string } {
  const to = normalizeUsPhone(typeof details["to"] === "string" ? details["to"] : String(details["to"] ?? ""));
  const message = typeof details["message"] === "string" ? details["message"].trim() : "";
  return { to, message };
}

/** "+15555550143" -> "555-555-0143" so it reads back clearly. */
function prettyPhone(e164: string): string {
  const d = e164.slice(2);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Text someone on the caller's behalf, from the agent's number. */
const sendTextAction: ActionDefinition = {
  type: "send_text",
  description:
    'Send a text message to a US phone number on the caller\'s behalf. details: {"to": "phone number", "message": "exact text"}.',
  validate: (details, info) => {
    const { to, message } = textDetails(details);
    if (!to) return "I need a valid US phone number to text.";
    if (!message) return "I need the message to send.";
    const max = MAX_TEXT_LENGTH - signOff(info.callerName).length;
    if (message.length > max) return `That message is too long (max ${max} characters).`;
    return null;
  },
  readBack: (details, info) => {
    const { to, message } = textDetails(details);
    return `I'll text ${prettyPhone(to!)} this message: "${message}${signOff(info.callerName)}"`;
  },
  run: async (details, ctx) => {
    const { to, message } = textDetails(details);
    const text = `${message}${signOff(ctx.callerName)}`;
    const sent = await sendText(ctx.config.telnyx, to!, text, ctx.fetchImpl);
    await ctx.store.log({
      who: ctx.callerName,
      phone: ctx.caller.phone,
      channel: ctx.caller.channel,
      event: "text_sent",
      details: `To ${to}: "${text}" (Telnyx id ${sent.id})`,
      conversation: ctx.caller.conversation,
    });
    // Remember the recipient so their replies can be passed back. The text is
    // already sent, so a failure here is logged but doesn't fail the action.
    const now = ctx.now();
    try {
      await ctx.store.recordOutreach({
        recipient: to!,
        requestedBy: ctx.caller.phone,
        requesterName: ctx.callerName,
        message: text,
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + REPLY_WINDOW_HOURS * 3600_000).toISOString(),
        forwards: 0,
      });
    } catch (err) {
      console.error(JSON.stringify({ event: "outreach_record_failed", message: err instanceof Error ? err.message : String(err) }));
    }
    return `Text sent to ${prettyPhone(to!)}. If they reply within ${REPLY_WINDOW_HOURS} hours, their reply will be passed to ${ctx.callerName}.`;
  },
};

function jobTask(details: Record<string, unknown>): string {
  return typeof details["task"] === "string" ? details["task"].trim() : "";
}

/**
 * A bigger job for Claude (the routine) that may change things: send an email,
 * change code, open a pull request. Look-ups that change nothing use the
 * start_lookup tool instead and need no approval.
 */
const claudeJobAction: ActionDefinition = {
  type: "claude_job",
  description:
    'Hand a job that changes things (send an email, change code, open a pull request) to Claude. details: {"task": "the full job in the caller\'s words"}.',
  validate: (details) => {
    const task = jobTask(details);
    if (!task) return "I need to know what the job is.";
    if (task.length > MAX_TASK_CHARS) return `That's too long (max ${MAX_TASK_CHARS} characters).`;
    return null;
  },
  readBack: (details) =>
    `I'll have Claude do this job, and it may make changes: "${jobTask(details)}". I'll text you the result when it's done.`,
  run: async (details, ctx) => {
    const person = findPerson(ctx.config, ctx.caller.phone);
    if (!person) throw new Error("Caller is not approved.");
    const job = await startJob({
      task: jobTask(details),
      permission: "approved_changes",
      person,
      channel: ctx.caller.channel,
      store: ctx.store,
      config: ctx.config,
      now: ctx.now,
      fetchImpl: ctx.fetchImpl,
    });
    await ctx.store.log({
      who: ctx.callerName,
      phone: ctx.caller.phone,
      channel: ctx.caller.channel,
      event: "job_started",
      details: `${job.jobId} (approved changes): ${job.task}`,
      conversation: ctx.caller.conversation,
    });
    return "Claude is working on it. You'll get a text with the result.";
  },
};

const ACTIONS: ActionDefinition[] = [testAction, sendTextAction, claudeJobAction];

export function getAction(type: string): ActionDefinition | null {
  return ACTIONS.find((a) => a.type === type) ?? null;
}

export function listActionTypes(): string[] {
  return ACTIONS.map((a) => a.type);
}
