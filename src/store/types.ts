import type { Role } from "../config.js";

export type PendingStatus = "pending" | "running" | "done" | "cancelled" | "expired" | "failed";

/** A permanent action waiting for the caller's "yes" (and code word if needed). */
export interface PendingAction {
  code: string; // short code the agent reads back, e.g. "K7QM"
  action: string; // action type, e.g. "test_action"
  summary: string; // plain-English read-back
  payload: Record<string, unknown>;
  requestedBy: string; // caller phone, E.164
  role: Role;
  channel: string;
  needsCodeWord: boolean;
  createdAt: string; // ISO time
  expiresAt: string; // ISO time
  status: PendingStatus;
  failures: number; // wrong code word attempts
  result?: string;
  recordId?: string; // storage id
}

export interface ActivityEntry {
  who: string; // name or "unknown"
  phone: string;
  channel: string;
  event: string; // short label, e.g. "conversation_started"
  details: string;
  conversation?: string;
}

/** A text the agent sent for someone, so the recipient's replies can be passed back. */
export interface Outreach {
  recipient: string; // who got the text, E.164
  requestedBy: string; // who asked for it, E.164
  requesterName: string;
  message: string; // the text as sent
  sentAt: string; // ISO time
  expiresAt: string; // ISO time; replies after this are treated like strangers
  forwards: number; // replies passed back so far
  recordId?: string;
}

export interface Store {
  createPending(p: PendingAction): Promise<PendingAction>;
  /** Find a pending action by its code, only among those requested by `phone`. */
  findPending(code: string, phone: string): Promise<PendingAction | null>;
  updatePending(p: PendingAction, changes: Partial<PendingAction>): Promise<PendingAction>;
  log(entry: ActivityEntry): Promise<void>;
  recordOutreach(o: Outreach): Promise<Outreach>;
  /** Most recent outreach to `recipient` that hasn't expired at `nowIso`. */
  findActiveOutreach(recipient: string, nowIso: string): Promise<Outreach | null>;
  updateOutreach(o: Outreach, changes: Partial<Outreach>): Promise<Outreach>;
}
