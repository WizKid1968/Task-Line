import { withDeps } from "../../src/deps.js";
import { handleWatchdog } from "../../src/handlers/watchdog.js";

// Vercel's scheduler calls this once a day with GET and the CRON_SECRET.
export const GET = withDeps(handleWatchdog);
