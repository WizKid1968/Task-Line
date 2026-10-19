import type { AirtableConfig, Role } from "../config.js";
import type { ActivityEntry, PendingAction, PendingStatus, Store } from "./types.js";

export const TABLES = {
  activity: "Activity Log",
  pending: "Pending Actions",
} as const;

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
}
