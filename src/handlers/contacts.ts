import { allContacts, findContacts, prettyPhone } from "../contacts.js";
import type { Deps } from "../deps.js";
import { json } from "../http.js";
import { logEvent } from "../log.js";
import { authenticateTool } from "./auth.js";

/** Names the agent passes to get the whole contact list. */
const LIST_ALL = new Set(["all", "everyone", "list", "all contacts"]);

/** find_contact tool: look up a saved contact's number. Only for the owner and the trusted person. */
export async function handleFindContact(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const name = typeof auth.body["name"] === "string" ? auth.body["name"] : "";
  if (LIST_ALL.has(name.trim().toLowerCase())) {
    // The whole list. Numbers only on a confirmed call from the person's own phone;
    // otherwise names only (one number can still be looked up by name).
    const all = await allContacts(deps.store, deps.config);
    const withNumbers = auth.claims.verified;
    logEvent("contact_list", { count: all.length, withNumbers });
    return json(200, {
      ok: true,
      found: all.length,
      contacts: all.map((m) => (withNumbers ? { name: m.name, phone: prettyPhone(m.phone) } : { name: m.name })),
      ...(withNumbers ? {} : { note: "Names only. Look up one person's number with find_contact and their name." }),
    });
  }
  const matches = await findContacts(name, deps.store, deps.config);
  logEvent("contact_lookup", { found: matches.length });
  if (!matches.length) {
    return json(200, { ok: true, found: 0, message: `No saved contact named "${name}". Offer to save one.` });
  }
  return json(200, { ok: true, found: matches.length, contacts: matches.map((m) => ({ name: m.name, phone: prettyPhone(m.phone) })) });
}
