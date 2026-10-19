import { withDeps } from "../../src/deps.js";
import { handleRequestAction } from "../../src/handlers/actions.js";

export const POST = withDeps(handleRequestAction);
