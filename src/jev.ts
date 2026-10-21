import { logEvent } from "./log.js";

/**
 * Jev (TypeSafe AI): answers fixed yes/no questions about a piece of text with a
 * probability from 0 (no) to 1 (yes). Used as a second, independent judge at
 * several checkpoints. It is never the only lock: callers treat "unavailable"
 * as a reason to take the safer path.
 *
 * API (docs.typesafe.ai, quick start, checked Oct 2026):
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <key>
 *   { "model": "jev-latest", "state": "...", "questions": { "<id>": { "type": "noul", "instructions": "..." } } }
 *   -> { "model": "jev-1.13.0", "answers": { "<id>": { "type": "noul", "noul": 0.97 } }, "usage": {...} }
 */

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_TIMEOUT_MS = 5000;
/** Keep each request well under Jev's size limits. */
const MAX_STATE_CHARS = 20_000;

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export type NoulAnswers<K extends string> = Record<K, number>;

/**
 * Ask several yes/no questions about one piece of text. Returns the probability
 * for each question, or null if Jev is not set up, slow, or returned something
 * unexpected. Never throws.
 */
export async function askJev<K extends string>(
  apiKey: string | null,
  state: string,
  questions: Record<K, NoulQuestion>,
  fetchImpl: typeof fetch = fetch,
  label = "check",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<NoulAnswers<K> | null> {
  if (!apiKey) {
    logEvent("jev_unavailable", { label, reason: "no_key" });
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state: state.slice(0, MAX_STATE_CHARS), questions }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logEvent("jev_unavailable", { label, reason: `status_${res.status}` });
      return null;
    }
    const body = (await res.json()) as { answers?: Record<string, { noul?: unknown }> };
    const out = {} as NoulAnswers<K>;
    for (const id of Object.keys(questions) as K[]) {
      const p = body.answers?.[id]?.noul;
      if (typeof p !== "number" || !(p >= 0 && p <= 1)) {
        logEvent("jev_unavailable", { label, reason: "bad_answer", id });
        return null;
      }
      out[id] = p;
    }
    logEvent("jev_answered", { label, ...out });
    return out;
  } catch (err) {
    logEvent("jev_unavailable", { label, reason: err instanceof Error && err.name === "AbortError" ? "timeout" : "network" });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
