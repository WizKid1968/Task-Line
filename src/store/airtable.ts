import type { AirtableConfig, Role } from "../config.js";
import type { ActivityEntry, Contact, Job, JobPermission, JobStatus, Outreach, PendingAction, PendingStatus, Store } from "./types.js";

export const TABLES = {
  activity: "Activity Log",
  pending: "Pending Actions",
  outreach: "Outreach",
  jobs: "Jobs",
  contacts: "Contacts",
} as const;

function contactFromRecord(r: AirtableRecord): Contact {
  const f = r.fields;
  return {
    recordId: r.id,
    name: String(f["Name"] ?? ""),
    phone: String(f["Phone"] ?? ""),
    addedBy: String(f["Added By"] ?? ""),
    createdAt: String(f["Created"] ?? ""),
  };
}

function jobFields(j: Partial<Job>): Fields {
  const f: Fields = {};
  if (j.jobId !== undefined) f["Job ID"] = j.jobId;
  if (j.status !== undefined) f["Status"] = j.status;
  if (j.permission !== undefined) f["Permission"] = j.permission;
  if (j.task !== undefined) f["Task"] = j.task;
  if (j.requestedBy !== undefined) f["Requested By"] = j.requestedBy;
  if (j.requesterName !== undefined) f["Requester Name"] = j.requesterName;
  if (j.channel !== undefined) f["Channel"] = j.channel;
  if (j.sessionUrl !== undefined) f["Session URL"] = j.sessionUrl;
  if (j.result !== undefined) f["Result"] = j.result;
  if (j.createdAt !== undefined) f["Created"] = j.createdAt;
  if (j.finishedAt !== undefined) f["Finished"] = j.finishedAt;
  return f;
}

function jobFromRecord(r: AirtableRecord): Job {
  const f = r.fields;
  const opt = (k: string) => (f[k] === undefined ? undefined : String(f[k]));
  return {
    recordId: r.id,
    jobId: String(f["Job ID"] ?? ""),
    status: (f["Status"] as JobStatus) ?? "starting",
    permission: (f["Permission"] as JobPermission) ?? "read_only",
    task: String(f["Task"] ?? ""),
    requestedBy: String(f["Requested By"] ?? ""),
    requesterName: String(f["Requester Name"] ?? ""),
    channel: String(f["Channel"] ?? ""),
    sessionUrl: opt("Session URL"),
    result: opt("Result"),
    createdAt: String(f["Created"] ?? ""),
    finishedAt: opt("Finished"),
  };
}

function outreachFields(o: Partial<Outreach>): Fields {
  const f: Fields = {};
  if (o.recipient !== undefined) f["Recipient"] = o.recipient;
  if (o.requestedBy !== undefined) f["Requested By"] = o.requestedBy;
  if (o.requesterName !== undefined) f["Requester Name"] = o.requesterName;
  if (o.message !== undefined) f["Message"] = o.message;
  if (o.sentAt !== undefined) f["Sent"] = o.sentAt;
  if (o.expiresAt !== undefined) f["Expires"] = o.expiresAt;
  if (o.forwards !== undefined) f["Forwards"] = o.forwards;
  return f;
}

function outreachFromRecord(r: AirtableRecord): Outreach {
  const f = r.fields;
  return {
    recordId: r.id,
    recipient: String(f["Recipient"] ?? ""),
    requestedBy: String(f["Requested By"] ?? ""),
    requesterName: String(f["Requester Name"] ?? ""),
    message: String(f["Message"] ?? ""),
    sentAt: String(f["Sent"] ?? ""),
    expiresAt: String(f["Expires"] ?? ""),
    forwards: Number(f["Forwards"] ?? 0),
  };
}

type Fields = Record<string, unknown>;

interface AirtableRecord {
  id: string;
  fields: Fields;
}

/** Quote a value for an Airtable formula string. */
function formulaString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function toFields(p: Partial<PendingAction>): Fields {
  const f: Fields = {};
  if (p.code !== undefined) f["Code"] = p.code;
  if (p.status !== undefined) f["Status"] = p.status;
  if (p.action !== undefined) f["Action"] = p.action;
  if (p.summary !== undefined) f["Summary"] = p.summary;
  if (p.payload !== undefined) f["Payload"] = JSON.stringify(p.payload);
  if (p.requestedBy !== undefined) f["Requested By"] = p.requestedBy;
  if (p.role !== undefined) f["Role"] = p.role;
  if (p.channel !== undefined) f["Channel"] = p.channel;
  if (p.needsCodeWord !== undefined) f["Needs Code Word"] = p.needsCodeWord;
  if (p.createdAt !== undefined) f["Created"] = p.createdAt;
  if (p.expiresAt !== undefined) f["Expires"] = p.expiresAt;
  if (p.failures !== undefined) f["Code Word Failures"] = p.failures;
  if (p.result !== undefined) f["Result"] = p.result;
  return f;
}

function fromRecord(r: AirtableRecord): PendingAction {
  const f = r.fields;
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(f["Payload"] ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    recordId: r.id,
    code: String(f["Code"] ?? ""),
    status: (f["Status"] as PendingStatus) ?? "pending",
    action: String(f["Action"] ?? ""),
    summary: String(f["Summary"] ?? ""),
    payload,
    requestedBy: String(f["Requested By"] ?? ""),
    role: (f["Role"] as Role) ?? "owner",
    channel: String(f["Channel"] ?? ""),
    needsCodeWord: Boolean(f["Needs Code Word"]),
    createdAt: String(f["Created"] ?? ""),
    expiresAt: String(f["Expires"] ?? ""),
    failures: Number(f["Code Word Failures"] ?? 0),
    result: f["Result"] === undefined ? undefined : String(f["Result"]),
  };
}

export class AirtableStore implements Store {
  constructor(
    private readonly config: AirtableConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(table: string, suffix = ""): string {
    return `https://api.airtable.com/v0/${this.config.baseId}/${encodeURIComponent(table)}${suffix}`;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      // Airtable error bodies don't contain our token; status is enough to debug.
      throw new Error(`Airtable ${method} failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async createPending(p: PendingAction): Promise<PendingAction> {
    const out = await this.request<{ records: AirtableRecord[] }>("POST", this.url(TABLES.pending), {
      records: [{ fields: toFields(p) }],
      typecast: true,
    });
    const rec = out.records[0];
    if (!rec) throw new Error("Airtable returned no record");
    return fromRecord(rec);
  }

  async findPending(code: string, phone: string): Promise<PendingAction | null> {
    const formula = `AND({Code}=${formulaString(code)},{Requested By}=${formulaString(phone)})`;
    const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
    const out = await this.request<{ records: AirtableRecord[] }>(
      "GET",
      this.url(TABLES.pending, `?${params.toString()}`),
    );
    const rec = out.records[0];
    return rec ? fromRecord(rec) : null;
  }

  async updatePending(p: PendingAction, changes: Partial<PendingAction>): Promise<PendingAction> {
    if (!p.recordId) throw new Error("pending action has no record id");
    const out = await this.request<AirtableRecord>("PATCH", this.url(TABLES.pending, `/${p.recordId}`), {
      fields: toFields(changes),
      typecast: true,
    });
    return fromRecord(out);
  }

  async log(entry: ActivityEntry): Promise<void> {
    await this.request("POST", this.url(TABLES.activity), {
      records: [
        {
          fields: {
            Event: entry.event,
            Time: new Date().toISOString(),
            Who: entry.who,
            Phone: entry.phone,
            Channel: entry.channel,
            Details: entry.details,
            Conversation: entry.conversation ?? "",
          },
        },
      ],
      typecast: true,
    });
  }

  async recordOutreach(o: Outreach): Promise<Outreach> {
    const out = await this.request<{ records: AirtableRecord[] }>("POST", this.url(TABLES.outreach), {
      records: [{ fields: outreachFields(o) }],
      typecast: true,
    });
    const rec = out.records[0];
    if (!rec) throw new Error("Airtable returned no record");
    return outreachFromRecord(rec);
  }

  async findActiveOutreach(recipient: string, nowIso: string): Promise<Outreach | null> {
    // Expiry is compared in code (not in the formula) to avoid time-zone surprises.
    const formula = `{Recipient}=${formulaString(recipient)}`;
    const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "20" });
    params.append("sort[0][field]", "Sent");
    params.append("sort[0][direction]", "desc");
    const out = await this.request<{ records: AirtableRecord[] }>(
      "GET",
      this.url(TABLES.outreach, `?${params.toString()}`),
    );
    const now = Date.parse(nowIso);
    const active = out.records.map(outreachFromRecord).find((o) => Date.parse(o.expiresAt) > now);
    return active ?? null;
  }

  async updateOutreach(o: Outreach, changes: Partial<Outreach>): Promise<Outreach> {
    if (!o.recordId) throw new Error("outreach has no record id");
    const out = await this.request<AirtableRecord>("PATCH", this.url(TABLES.outreach, `/${o.recordId}`), {
      fields: outreachFields(changes),
      typecast: true,
    });
    return outreachFromRecord(out);
  }

  async createJob(j: Job): Promise<Job> {
    const out = await this.request<{ records: AirtableRecord[] }>("POST", this.url(TABLES.jobs), {
      records: [{ fields: jobFields(j) }],
      typecast: true,
    });
    const rec = out.records[0];
    if (!rec) throw new Error("Airtable returned no record");
    return jobFromRecord(rec);
  }

  async findJob(jobId: string): Promise<Job | null> {
    const params = new URLSearchParams({ filterByFormula: `{Job ID}=${formulaString(jobId)}`, maxRecords: "1" });
    const out = await this.request<{ records: AirtableRecord[] }>("GET", this.url(TABLES.jobs, `?${params.toString()}`));
    const rec = out.records[0];
    return rec ? jobFromRecord(rec) : null;
  }

  async updateJob(j: Job, changes: Partial<Job>): Promise<Job> {
    if (!j.recordId) throw new Error("job has no record id");
    const out = await this.request<AirtableRecord>("PATCH", this.url(TABLES.jobs, `/${j.recordId}`), {
      fields: jobFields(changes),
      typecast: true,
    });
    return jobFromRecord(out);
  }

  async countJobsSince(phone: string, sinceIso: string): Promise<number> {
    // Time is compared in code to avoid time-zone surprises in formulas.
    const params = new URLSearchParams({ filterByFormula: `{Requested By}=${formulaString(phone)}`, pageSize: "100" });
    params.append("sort[0][field]", "Created");
    params.append("sort[0][direction]", "desc");
    const out = await this.request<{ records: AirtableRecord[] }>("GET", this.url(TABLES.jobs, `?${params.toString()}`));
    const since = Date.parse(sinceIso);
    return out.records.map(jobFromRecord).filter((j) => Date.parse(j.createdAt) >= since).length;
  }

  async listContacts(): Promise<Contact[]> {
    const out: Contact[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);
      const page = await this.request<{ records: AirtableRecord[]; offset?: string }>(
        "GET",
        this.url(TABLES.contacts, `?${params.toString()}`),
      );
      out.push(...page.records.map(contactFromRecord));
      offset = page.offset;
    } while (offset && out.length < 2000);
    return out;
  }

  async saveContact(c: Contact): Promise<Contact> {
    const existing = (await this.listContacts()).find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    const fields = { Name: c.name, Phone: c.phone, "Added By": c.addedBy, Created: c.createdAt };
    if (existing?.recordId) {
      const out = await this.request<AirtableRecord>("PATCH", this.url(TABLES.contacts, `/${existing.recordId}`), { fields, typecast: true });
      return contactFromRecord(out);
    }
    const out = await this.request<{ records: AirtableRecord[] }>("POST", this.url(TABLES.contacts), { records: [{ fields }], typecast: true });
    const rec = out.records[0];
    if (!rec) throw new Error("Airtable returned no record");
    return contactFromRecord(rec);
  }
}
