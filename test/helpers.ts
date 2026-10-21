import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import type { Config } from "../src/config.js";
import type { Deps } from "../src/deps.js";
import { encryptForTelnyx } from "../src/encrypt.js";
import { createSessionToken, type SessionClaims } from "../src/session.js";
import { MemoryStore } from "../src/store/memory.js";

// Fake numbers only. Real numbers live in Vercel settings, never in the repo.
export const OWNER_PHONE = "+15555550101";
export const TRUSTED_PHONE = "+15555550102";
export const STRANGER_PHONE = "+15555550199";

const keys = generateKeyPairSync("ed25519");
const publicJwk = keys.publicKey.export({ format: "jwk" }) as { x: string };
export const TEST_PUBLIC_KEY = Buffer.from(publicJwk.x, "base64url").toString("base64");

export function signTelnyx(rawBody: string, timestamp: string): string {
  return sign(null, Buffer.from(`${timestamp}|${rawBody}`), keys.privateKey).toString("base64");
}

export const NOW = new Date("2026-10-19T12:00:00Z");
export const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

export function makeConfig(): Config {
  return {
    telnyxPublicKey: TEST_PUBLIC_KEY,
    sessionSecret: "test-session-secret-that-is-long-enough-123",
    telnyxEncryptionKey: randomBytes(32).toString("base64url"),
    airtable: { token: "unused", baseId: "unused" },
    telnyx: { apiKey: "test-telnyx-key", agentPhone: "+15555550100" },
    routine: {
      fireUrl: "https://api.anthropic.com/v1/claude_code/routines/trig_TEST123/fire",
      token: "test-routine-token",
      reportSecret: "test-report-secret-that-is-long-enough-0123",
    },
    jevApiKey: "test-jev-key",
    assistantName: "Opus",
    cronSecret: "test-cron-secret",
    people: [
      { role: "owner", name: "Owner", phone: OWNER_PHONE, codeWord: "Blue Falcon" },
      { role: "trusted", name: "Friend", phone: TRUSTED_PHONE, codeWord: "green river" },
    ],
  };
}

export function makeDeps(now: Date = NOW): Deps & { store: MemoryStore } {
  return { config: makeConfig(), store: new MemoryStore(), now: () => now };
}

export function signedRequest(url: string, body: unknown, opts: { timestamp?: string; badSig?: boolean } = {}): Request {
  const raw = JSON.stringify(body);
  const ts = opts.timestamp ?? String(NOW_SECONDS);
  const sig = opts.badSig ? signTelnyx(raw + "tampered", ts) : signTelnyx(raw, ts);
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "telnyx-signature-ed25519": sig, "telnyx-timestamp": ts },
    body: raw,
  });
}

export function sessionFor(deps: Deps, overrides: Partial<SessionClaims> = {}): string {
  return createSessionToken(
    {
      v: 1,
      role: "owner",
      phone: OWNER_PHONE,
      channel: "phone_call",
      verified: true,
      conversation: "conv-1",
      exp: NOW_SECONDS + 3600,
      ...overrides,
    },
    deps.config.sessionSecret,
  );
}

/** A tool request the way Telnyx sends it: signed, with the pass in the header. */
export function toolRequest(url: string, body: unknown, token: string | null): Request {
  const req = signedRequest(url, body);
  if (token) req.headers.set("authorization", `Bearer ${token}`);
  return req;
}

export { encryptForTelnyx };

/**
 * A fake network for tests: answers Jev questions (all "no" = 0.05 unless set in
 * `jev`), and records everything else (routine fires, Telnyx texts).
 * Set `jevDown` to simulate Jev being unreachable.
 */
export function fakeNet(opts: { jev?: Record<string, number> | ((state: string, id: string) => number); jevDown?: boolean; fireStatus?: number; routes?: Record<string, unknown> } = {}) {
  const jevCalls: { state: string; ids: string[] }[] = [];
  const fires: { headers: Headers; body: any }[] = [];
  const texts: { to: string; text: string }[] = [];
  const other: { url: string; body: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (url.startsWith("https://api.typesafe.ai/")) {
      jevCalls.push({ state: body.state, ids: Object.keys(body.questions) });
      if (opts.jevDown) return new Response("overloaded", { status: 529 });
      const answers: Record<string, unknown> = {};
      for (const id of Object.keys(body.questions)) {
        const p = typeof opts.jev === "function" ? opts.jev(body.state, id) : opts.jev?.[id];
        answers[id] = { type: "noul", noul: p ?? 0.05 };
      }
      return new Response(JSON.stringify({ model: "jev-test", answers }));
    }
    if (url.includes("/claude_code/routines/")) {
      fires.push({ headers: new Headers(init.headers), body });
      const status = opts.fireStatus ?? 200;
      return status === 200
        ? new Response(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_1", claude_code_session_url: "https://claude.ai/code/session_1" }))
        : new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { status });
    }
    if (url === "https://api.telnyx.com/v2/messages") {
      texts.push({ to: body.to, text: body.text });
      return new Response(JSON.stringify({ data: { id: `msg-${texts.length}` } }));
    }
    other.push({ url, body });
    for (const [prefix, response] of Object.entries(opts.routes ?? {})) {
      if (url.startsWith(prefix)) return new Response(JSON.stringify(response));
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { jevCalls, fires, texts, other, fetchImpl };
}
