import { withDeps } from "../../src/deps.js";
import { handleJobReport } from "../../src/handlers/jobs.js";

export const POST = withDeps(handleJobReport);
