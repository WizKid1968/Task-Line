import { withDeps } from "../../src/deps.js";
import { handleForwardReply } from "../../src/handlers/forward.js";

export const POST = withDeps(handleForwardReply);
