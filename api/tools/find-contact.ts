import { withDeps } from "../../src/deps.js";
import { handleFindContact } from "../../src/handlers/contacts.js";

export const POST = withDeps(handleFindContact);
