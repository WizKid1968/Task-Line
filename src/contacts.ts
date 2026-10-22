import type { Config } from "./config.js";
import { normalizeUsPhone } from "./phone.js";
import type { Store } from "./store/types.js";

/**
 * The contact list. The owner and the trusted person come from the server settings
 * (always present, can't be changed by a text); everyone else is saved in the
 * Task-Line Airtable base, which only the server touches.
 */

export interface ContactMatch {
  name: string;
  phone: string; // E.164
  builtIn: boolean;
}

function clean(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function allContacts(store: Store, config: Config): Promise<ContactMatch[]> {
  const builtIn = config.people.map((p) => ({ name: p.name, phone: p.phone, builtIn: true }));
  const saved = (await store.listContacts())
    .map((c) => ({ name: c.name, phone: normalizeUsPhone(c.phone) ?? "", builtIn: false }))
    .filter((c) => c.phone && !builtIn.some((b) => clean(b.name) === clean(c.name)));
  return [...builtIn, ...saved];
}

/**
 * Find contacts by name. An exact full-name match wins; then contacts that have
 * every spoken word; then close spellings. Can return several, so the caller
 * can ask which one.
 */
export async function findContacts(name: string, store: Store, config: Config): Promise<ContactMatch[]> {
  const q = clean(name);
  if (!q) return [];
  const all = await allContacts(store, config);
  const exact = all.filter((c) => clean(c.name) === q);
  if (exact.length) return exact;
  const words = q.split(" ");
  const wordMatch = all.filter((c) => {
    const parts = clean(c.name).split(" ");
    return words.every((w) => parts.includes(w));
  });
  if (wordMatch.length) return wordMatch;
  // Close spellings: on calls, speech-to-text often hears a name slightly wrong
  // ("Orlando" for "Orlandus"). The read-back shows the saved name and number,
  // and nothing is sent without the caller's yes, so a close match is safe.
  return all.filter((c) => {
    const parts = clean(c.name).split(" ");
    return words.every((w) => parts.some((part) => similar(w, part)));
  });
}

/** Two name words sound alike: same word, a small spelling difference, or a long shared start. */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 3) return false;
  if (shorter >= 5 && a.slice(0, 5) === b.slice(0, 5)) return true;
  const allowed = shorter >= 7 ? 2 : 1;
  return editDistance(a, b) <= allowed;
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** "+19172803031" -> "917-280-3031". */
export function prettyPhone(e164: string): string {
  const d = e164.slice(2);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export type Recipient =
  | { ok: true; phone: string; name: string | null }
  | { ok: false; message: string };

/** Turn "917-555-0101" or "Victor" into a phone number. */
export async function resolveRecipient(to: string, store: Store, config: Config): Promise<Recipient> {
  const phone = normalizeUsPhone(to);
  if (phone) return { ok: true, phone, name: null };
  if (!/[a-z]/i.test(to)) return { ok: false, message: "I need a valid US phone number or a saved contact's name." };
  const matches = await findContacts(to, store, config);
  if (matches.length === 1) return { ok: true, phone: matches[0]!.phone, name: matches[0]!.name };
  if (matches.length > 1) {
    return { ok: false, message: `More than one contact matches "${to}": ${matches.map((m) => m.name).join(", ")}. Ask which one.` };
  }
  return { ok: false, message: `There's no saved contact named "${to}". Ask for the number, and offer to save it as a contact.` };
}
