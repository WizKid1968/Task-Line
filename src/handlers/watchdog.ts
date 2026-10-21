import { timingSafeEqual } from "node:crypto";
import { findPerson } from "../config.js";
import type { Deps } from "../deps.js";
import { bestEffort, json } from "../http.js";
import { watchMember, watchStranger, WATCH_CUTOFF } from "../jevChecks.js";
import { logEvent } from "../log.js";
import { normalizeUsPhone } from "../phone.js";
import { sendText } from "../telnyxSend.js";

/**
 * Checkpoint 5: once a day, read the phone agent's conversations from the last
 * 24 hours and ask Jev two things:
 *  - with the owner or the trusted person: did the agent refuse or answer on its own
 *    instead of handing the request to the worker?
 *  - with strangers: did the agent say more than the fixed "private line" sentence?
 * If anything is flagged, the owner gets one text. Code words are blanked out
 * before anything leaves the server.
 */

const TELNYX = "https://api.telnyx.com/v2";
const WINDOW_MS = 24 * 3600_000;
const MAX_CONVERSATIONS = 60;

interface TelnyxConversation {
  id: string;
  created_at: string;
  last_message_at?: string;
  metadata?: Record<string, unknown>;
}

interface TelnyxMessage {
  role?: string;
  text?: string;
  tool_calls?: { function?: { name?: string } }[];
  created_at?: string;
}

function authorized(req: Request, secret: string | null): boolean {
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Blank out the code words, in any capitalization or spacing. */
export function redactCodeWords(text: string, codeWords: string[]): string {
  let out = text;
  for (const word of codeWords) {
    const parts = word.trim().split(/\s+/).filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!parts.length) continue;
    out = out.replace(new RegExp(parts.join("[\\s\\W]*"), "gi"), "****");
  }
  return out;
}

export function transcriptOf(messages: TelnyxMessage[], callerLabel: string, codeWords: string[]): string {
  const lines: string[] = [];
  for (const m of [...messages].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (m.role === "user") lines.push(`${callerLabel}: ${redactCodeWords(m.text ?? "", codeWords)}`);
    else if (m.role === "assistant") {
      for (const t of m.tool_calls ?? []) if (t.function?.name) lines.push(`assistant: [tool: ${t.function.name}]`);
      if (m.text?.trim()) lines.push(`assistant: ${m.text.trim()}`);
    }
  }
  return lines.join("\n");
}

function nyTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function handleWatchdog(req: Request, deps: Deps): Promise<Response> {
  if (!authorized(req, deps.config.cronSecret)) return json(401, { error: "not_authorized" });
  const { apiKey, agentPhone } = deps.config.telnyx;
  if (!apiKey) return json(503, { error: "not_configured" });
  const fetchImpl = deps.fetchImpl ?? fetch;
  const telnyx = async <T>(path: string): Promise<T> => {
    const res = await fetchImpl(`${TELNYX}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Telnyx ${path.split("?")[0]} failed (${res.status})`);
    return (await res.json()) as T;
  };

  const since = deps.now().getTime() - WINDOW_MS;
  const list = await telnyx<{ data?: TelnyxConversation[] }>(`/ai/conversations?order=created_at.desc&limit=${MAX_CONVERSATIONS}`);
  const recent = (list.data ?? []).filter((c) => {
    const last = Date.parse(c.last_message_at ?? c.created_at);
    const target = String(c.metadata?.["telnyx_agent_target"] ?? "");
    return last >= since && (!agentPhone || normalizeUsPhone(target) === agentPhone);
  });

  const codeWords = deps.config.people.map((p) => p.codeWord);
  const flagged: string[] = [];
  let checked = 0;
  let unchecked = 0;

  for (const c of recent) {
    const phone = normalizeUsPhone(String(c.metadata?.["telnyx_end_user_target"] ?? ""));
    const channel = String(c.metadata?.["telnyx_conversation_channel"] ?? "");
    const kind = channel === "phone_call" ? "call" : "text";
    const person = findPerson(deps.config, phone);
    let messages: TelnyxMessage[] = [];
    try {
      messages = (await telnyx<{ data?: TelnyxMessage[] }>(`/ai/conversations/${c.id}/messages`)).data ?? [];
    } catch {
      unchecked++;
      continue;
    }
    if (!messages.some((m) => m.role === "user")) continue; // only our own outgoing texts
    const transcript = transcriptOf(messages, person ? "owner" : "caller", codeWords);
    if (!person && transcript.includes("[tool: forward_reply]")) continue; // a reply being passed along: expected

    const p = person ? await watchMember(deps.config.jevApiKey, transcript, deps.fetchImpl) : await watchStranger(deps.config.jevApiKey, transcript, deps.fetchImpl);
    if (p === null) {
      unchecked++;
      continue;
    }
    checked++;
    if (p >= WATCH_CUTOFF) {
      flagged.push(
        person
          ? `${nyTime(c.created_at)} ${kind} with ${person.name}: ${deps.config.assistantName} didn't hand a request to the worker.`
          : `${nyTime(c.created_at)} ${kind} from an unknown number: ${deps.config.assistantName} said more than the private-line reply.`,
      );
    }
  }

  logEvent("watchdog", { conversations: recent.length, checked, unchecked, flagged: flagged.length });
  const owner = deps.config.people.find((p) => p.role === "owner");
  if ((flagged.length || unchecked) && owner) {
    const lines = flagged.slice(0, 5);
    if (flagged.length > 5) lines.push(`…and ${flagged.length - 5} more.`);
    if (unchecked) lines.push(`${unchecked} conversation(s) couldn't be checked.`);
    const text = `${deps.config.assistantName} daily check: ${flagged.length ? "something needs a look" : "partly done"}.\n${lines.join("\n")}`;
    try {
      await sendText(deps.config.telnyx, owner.phone, text.slice(0, 900), deps.fetchImpl);
    } catch (err) {
      logEvent("watchdog_text_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
  await bestEffort(
    deps.store.log({
      who: "watchdog",
      phone: "",
      channel: "daily",
      event: "watchdog",
      details: `Checked ${checked} of ${recent.length} conversations; flagged ${flagged.length}; unchecked ${unchecked}.${flagged.length ? `\n${flagged.join("\n")}` : ""}`,
    }),
    1500,
  );
  return json(200, { ok: true, conversations: recent.length, checked, unchecked, flagged });
}
