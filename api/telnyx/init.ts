import { withDeps } from "../../src/deps.js";
import { handleInit } from "../../src/handlers/init.js";

// Telnyx "dynamic variables webhook": runs at the start of each call or text.
export const POST = withDeps(handleInit);
