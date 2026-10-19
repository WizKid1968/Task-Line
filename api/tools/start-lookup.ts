import { withDeps } from "../../src/deps.js";
import { handleStartLookup } from "../../src/handlers/jobs.js";

export const POST = withDeps(handleStartLookup);
