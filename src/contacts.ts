import type { Config } from "./config.js";
import { normalizeUsPhone } from "./phone.js";
import type { Store } from "./store/types.js";

/**
 * The contact list. Rudy and the trusted person come from the server settings
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
 * Find contacts by name. An exact full-name match wins; otherwise any contact
 * whose first name (or any single word of the name) matches. Can return
 * several, so the caller can ask which one.
 */
export async function findContacts(name: string, store: Store, config: Config): Promise<ContactMatch[]> {
  const q = clean(name);
  if (!q) return [];
  const all = await allContacts(store, config);
  const exact = all.filter((c) => clean(c.name) === q);
  if (exact.length) return exact;
  const words = q.split(" ");
  return all.filter((c) => {
    const parts = clean(c.name).split(" ");
    return words.every((w) => parts.includes(w));
  });
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
