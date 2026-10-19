import type { SessionClaims } from "../session.js";
import type { Store } from "../store/types.js";

export interface ActionContext {
  caller: SessionClaims;
  callerName: string;
  store: Store;
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

const ACTIONS: ActionDefinition[] = [testAction];

export function getAction(type: string): ActionDefinition | null {
  return ACTIONS.find((a) => a.type === type) ?? null;
}

export function listActionTypes(): string[] {
  return ACTIONS.map((a) => a.type);
}
