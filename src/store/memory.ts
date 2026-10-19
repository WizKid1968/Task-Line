import type { ActivityEntry, Outreach, PendingAction, Store } from "./types.js";

/** In-memory store for tests. Data disappears when the process ends. */
export class MemoryStore implements Store {
  pending: PendingAction[] = [];
  logs: ActivityEntry[] = [];
  outreach: Outreach[] = [];

  async createPending(p: PendingAction): Promise<PendingAction> {
    const saved = { ...p, recordId: `mem${this.pending.length + 1}` };
    this.pending.push(saved);
    return { ...saved };
  }

  async findPending(code: string, phone: string): Promise<PendingAction | null> {
    const found = this.pending.find((p) => p.code === code && p.requestedBy === phone);
    return found ? { ...found } : null;
  }

  async updatePending(p: PendingAction, changes: Partial<PendingAction>): Promise<PendingAction> {
    const i = this.pending.findIndex((x) => x.recordId === p.recordId);
    if (i < 0) throw new Error("pending action not found");
    const updated = { ...this.pending[i]!, ...changes };
    this.pending[i] = updated;
    return { ...updated };
  }

  async log(entry: ActivityEntry): Promise<void> {
    this.logs.push(entry);
  }

  async recordOutreach(o: Outreach): Promise<Outreach> {
    const saved = { ...o, recordId: `out${this.outreach.length + 1}` };
    this.outreach.push(saved);
    return { ...saved };
  }

  async findActiveOutreach(recipient: string, nowIso: string): Promise<Outreach | null> {
    const now = Date.parse(nowIso);
    const active = this.outreach
      .filter((o) => o.recipient === recipient && Date.parse(o.expiresAt) > now)
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
    return active[0] ? { ...active[0] } : null;
  }

  async updateOutreach(o: Outreach, changes: Partial<Outreach>): Promise<Outreach> {
    const i = this.outreach.findIndex((x) => x.recordId === o.recordId);
    if (i < 0) throw new Error("outreach not found");
    const updated = { ...this.outreach[i]!, ...changes };
    this.outreach[i] = updated;
    return { ...updated };
  }
}
