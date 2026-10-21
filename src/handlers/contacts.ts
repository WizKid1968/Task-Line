import { findContacts, prettyPhone } from "../contacts.js";
import type { Deps } from "../deps.js";
import { json } from "../http.js";
import { logEvent } from "../log.js";
import { authenticateTool } from "./auth.js";

/** find_contact tool: look up a saved contact's number. Only for the owner and the trusted person. */
export async function handleFindContact(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const name = typeof auth.body["name"] === "string" ? auth.body["name"] : "";
  const matches = await findContacts(name, deps.store, deps.config);
  logEvent("contact_lookup", { found: matches.length });
  if (!matches.length) {
    return json(200, { ok: true, found: 0, message: `No saved contact named "${name}". Offer to save one.` });
  }
  return json(200, { ok: true, found: matches.length, contacts: matches.map((m) => ({ name: m.name, phone: prettyPhone(m.phone) })) });
}
