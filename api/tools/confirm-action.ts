import { withDeps } from "../../src/deps.js";
import { handleConfirmAction } from "../../src/handlers/actions.js";

export const POST = withDeps(handleConfirmAction);
