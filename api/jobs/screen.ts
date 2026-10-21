import { withDeps } from "../../src/deps.js";
import { handleScreenEmails } from "../../src/handlers/jobs.js";

export const POST = withDeps(handleScreenEmails);
