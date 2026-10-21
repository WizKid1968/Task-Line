import { type Config, findPerson } from "../config.js";
import { MAX_TASK_CHARS, startJob } from "../jobs.js";
import { checkJob } from "../jevChecks.js";
import { prettyPhone, resolveRecipient } from "../contacts.js";
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
  /**
   * Optional: fill in details before validating, e.g. turn a contact's name into
   * a number. Returns the updated details, or an error message for the agent.
   */
  prepare?(details: Record<string, unknown>, ctx: { store: Store; config: Config }): Promise<{ details: Record<string, unknown> } | { error: string }>;
  /** Returns an error message, or null if the details are OK. */
  validate(details: Record<string, unknown>, info: RequestInfo): string | null;
  /** Plain-English sentence the agent reads back before asking for a yes. */
  readBack(details: Record<string, unknown>, info: RequestInfo): string;
  /**
   * Optional extra safety check before the request is saved (Jev). It can refuse
   * the request or require the code word even on carrier-confirmed calls.
   */
  check?(details: Record<string, unknown>, ctx: { config: Config; fetchImpl?: typeof fetch }): Promise<{ block: string | null; forceCodeWord: boolean; note: string }>;
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


/** Text someone on the caller's behalf, from the agent's number. */
const sendTextAction: ActionDefinition = {
  prepare: async (details, ctx) => {
    const raw = typeof details["to"] === "string" ? details["to"] : String(details["to"] ?? "");
    const r = await resolveRecipient(raw, ctx.store, ctx.config);
    if (!r.ok) return { error: r.message };
    return { details: { ...details, to: r.phone, ...(r.name ? { to_name: r.name } : {}) } };
  },
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
    const who = typeof details["to_name"] === "string" ? `${details["to_name"]} (${prettyPhone(to!)})` : prettyPhone(to!);
    return `I'll text ${who} this message: "${message}${signOff(info.callerName)}"`;
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
    // An approved person (owner or trusted) who replies is talking to Opus
    // directly, not being passed along, so don't promise that.
    const approvedRecipient = findPerson(ctx.config, to!);
    if (approvedRecipient) {
      return `Text sent to ${approvedRecipient.name} (${prettyPhone(to!)}). ${approvedRecipient.name} can use Opus too, so a reply from ${approvedRecipient.name} goes to Opus as their own conversation and is not passed to ${ctx.callerName}.`;
    }
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
    'Hand a job that changes things (send an email, change code, open a pull request) to the worker. details: {"task": "the full job in the caller\'s words"}.',
  validate: (details) => {
    const task = jobTask(details);
    if (!task) return "I need to know what the job is.";
    if (task.length > MAX_TASK_CHARS) return `That's too long (max ${MAX_TASK_CHARS} characters).`;
    return null;
  },
  check: (details, ctx) => checkJob(ctx.config.jevApiKey, jobTask(details), ctx.fetchImpl),
  readBack: (details) =>
    `I'll do this job, and it may make changes: "${jobTask(details)}". I'll text you the result when it's done.`,
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
    return "Opus is on it. You'll get a text with the result.";
  },
};

function contactDetails(details: Record<string, unknown>): { name: string; phone: string | null } {
  const name = typeof details["name"] === "string" ? details["name"].trim().replace(/\s+/g, " ") : "";
  const phone = normalizeUsPhone(typeof details["phone"] === "string" ? details["phone"] : String(details["phone"] ?? ""));
  return { name, phone };
}

/** Save (or update) a contact so the caller can text them by name. */
const saveContactAction: ActionDefinition = {
  type: "save_contact",
  prepare: async (details, ctx) => {
    const { name } = contactDetails(details);
    const existing = (await ctx.store.listContacts()).find((c) => c.name.toLowerCase() === name.toLowerCase());
    return { details: existing ? { ...details, replaces: existing.phone } : details };
  },
  description: 'Save a contact so texts can be sent by name. details: {"name": "Sam Rivera", "phone": "917-555-0101"}.',
  validate: (details) => {
    const { name, phone } = contactDetails(details);
    if (!name || name.length > 60 || !/[a-z]/i.test(name)) return "I need the contact's name.";
    if (!phone) return "I need a valid US phone number for the contact.";
    return null;
  },
  readBack: (details) => {
    const { name, phone } = contactDetails(details);
    const replaces = typeof details["replaces"] === "string" ? normalizeUsPhone(details["replaces"]) : null;
    return replaces
      ? `You already have a contact named ${name} (${prettyPhone(replaces)}). I'll replace that number with ${prettyPhone(phone!)}. To keep both, use a different name, like a last name.`
      : `I'll save ${name} as ${prettyPhone(phone!)} in your contacts.`;
  },
  run: async (details, ctx) => {
    const { name, phone } = contactDetails(details);
    if (ctx.config.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`${name} is one of the two approved people; that number can only be changed in the server settings.`);
    }
    const now = ctx.now();
    // Stored in the easy-to-read 917-555-0101 form; any US format is read back correctly.
    await ctx.store.saveContact({ name, phone: prettyPhone(phone!), addedBy: ctx.callerName, createdAt: now.toISOString() });
    await ctx.store.log({
      who: ctx.callerName,
      phone: ctx.caller.phone,
      channel: ctx.caller.channel,
      event: "contact_saved",
      details: `${name}: ${phone}`,
      conversation: ctx.caller.conversation,
    });
    return `Saved ${name} (${prettyPhone(phone!)}) to your contacts.`;
  },
};

const ACTIONS: ActionDefinition[] = [testAction, sendTextAction, claudeJobAction, saveContactAction];

export function getAction(type: string): ActionDefinition | null {
  return ACTIONS.find((a) => a.type === type) ?? null;
}

export function listActionTypes(): string[] {
  return ACTIONS.map((a) => a.type);
}
