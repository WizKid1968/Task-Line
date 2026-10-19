import type { ActivityEntry, PendingAction, Store } from "./types.js";

/** In-memory store for tests. Data disappears when the process ends. */
export class MemoryStore implements Store {
  pending: PendingAction[] = [];
  logs: ActivityEntry[] = [];

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
}
