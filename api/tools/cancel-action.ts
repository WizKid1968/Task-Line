import { withDeps } from "../../src/deps.js";
import { handleCancelAction } from "../../src/handlers/actions.js";

export const POST = withDeps(handleCancelAction);
