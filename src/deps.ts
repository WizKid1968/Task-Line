import { type Config, ConfigError, loadConfig } from "./config.js";
import { json } from "./http.js";
import { AirtableStore } from "./store/airtable.js";
import type { Store } from "./store/types.js";

export interface Deps {
  config: Config;
  store: Store;
  now: () => Date;
}

let cached: Deps | null = null;

export function getDeps(): Deps {
  if (!cached) {
    const config = loadConfig();
    cached = { config, store: new AirtableStore(config.airtable), now: () => new Date() };
  }
  return cached;
}

/** Wrap a handler so setup mistakes return a clear error instead of crashing. */
export function withDeps(handler: (req: Request, deps: Deps) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    let deps: Deps;
    try {
      deps = getDeps();
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("Server settings problem:", err.message);
        return json(500, { error: "server_not_configured", message: "The agent server is not set up yet." });
      }
      throw err;
    }
    try {
      return await handler(req, deps);
    } catch (err) {
      console.error("Unhandled error:", err instanceof Error ? err.message : err);
      return json(500, { error: "server_error", message: "Something went wrong on the server. Nothing was done." });
    }
  };
}
