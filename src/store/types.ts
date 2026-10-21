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

export type JobStatus = "starting" | "running" | "done" | "failed" | "held";
/** read_only: look things up, change nothing. approved_changes: the caller approved changes (with code word if needed). */
export type JobPermission = "read_only" | "approved_changes";

/** A bigger job handed to the Claude Code routine. */
export interface Job {
  jobId: string; // random, unguessable; the routine reports back with it
  status: JobStatus;
  permission: JobPermission;
  task: string;
  requestedBy: string; // E.164; results are texted here
  requesterName: string;
  channel: string;
  sessionUrl?: string;
  result?: string;
  createdAt: string;
  finishedAt?: string;
  recordId?: string;
}

/** Someone Rudy or the trusted person can text by name. */
export interface Contact {
  name: string;
  phone: string; // E.164
  addedBy: string; // who saved it (name)
  createdAt: string;
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
  createJob(j: Job): Promise<Job>;
  findJob(jobId: string): Promise<Job | null>;
  updateJob(j: Job, changes: Partial<Job>): Promise<Job>;
  /** Jobs requested by `phone` created at or after `sinceIso`. */
  countJobsSince(phone: string, sinceIso: string): Promise<number>;
  listContacts(): Promise<Contact[]>;
  /** Add a contact, or replace the number of one with the same name (ignoring case). */
  saveContact(c: Contact): Promise<Contact>;
}
