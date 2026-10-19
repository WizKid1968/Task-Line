import { ConfigError, loadConfig } from "../src/config.js";
import { json } from "../src/http.js";

// Quick check that the server is up and its settings are filled in.
// Never returns setting values.
export function GET(): Response {
  try {
    loadConfig();
    return json(200, { ok: true, service: "task-line", configured: true });
  } catch (err) {
    if (err instanceof ConfigError) return json(200, { ok: true, service: "task-line", configured: false });
    throw err;
  }
}
