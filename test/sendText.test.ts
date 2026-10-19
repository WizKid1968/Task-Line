import { describe, expect, it } from "vitest";
import { handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { makeDeps, sessionFor, toolRequest } from "./helpers.js";

const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";

/** A fake Telnyx that records what would have been sent. */
function fakeTelnyx(ok = true) {
  const calls: { url: string; auth: string | null; body: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
    return ok
      ? new Response(JSON.stringify({ data: { id: "msg-123" } }), { status: 200 })
      : new Response(JSON.stringify({ errors: [{ code: "40010", title: "Not 10DLC registered" }] }), { status: 400 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const details = { to: "(917) 280-9243", message: "This is a test, testing 1, 2, and 3." };

describe("send a text for me", () => {
  it("reads back the number and message, sends nothing until confirmed", async () => {
    const tel = fakeTelnyx();
    const deps = { ...makeDeps(), fetchImpl: tel.fetchImpl };
    const token = sessionFor(deps, { channel: "sms_chat", verified: false });
    const res = (await (await handleRequestAction(toolRequest(REQ, { action_type: "send_text", details }, token), deps)).json()) as any;
    expect(res.read_back).toBe('I\'ll text 917-280-9243 this message: "This is a test, testing 1, 2, and 3."');
    expect(res.code_word_required).toBe(true);
    expect(tel.calls).toHaveLength(0);
  });

  it("wrong code word sends nothing; right code word sends exactly the approved text", async () => {
    const tel = fakeTelnyx();
    const deps = { ...makeDeps(), fetchImpl: tel.fetchImpl };
    const token = sessionFor(deps, { channel: "sms_chat", verified: false });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "send_text", details }, token), deps)).json()) as any;

    const bad = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "nope" }, token), deps);
    expect(bad.status).toBe(403);
    expect(tel.calls).toHaveLength(0);

    // Even if the AI tried to slip in different details at confirm time, the stored ones are used.
    const ok = await handleConfirmAction(
      toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", details: { to: "5555550199", message: "evil" } }, token),
      deps,
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).result).toBe("Text sent to 917-280-9243.");
    expect(tel.calls).toHaveLength(1);
    expect(tel.calls[0]).toEqual({
      url: "https://api.telnyx.com/v2/messages",
      auth: "Bearer test-telnyx-key",
      body: { from: "+15555550100", to: "+19172809243", text: "This is a test, testing 1, 2, and 3." },
    });
    expect(deps.store.logs.some((l) => l.event === "text_sent" && l.details.includes("msg-123"))).toBe(true);
  });

  it("rejects bad numbers and empty or overlong messages before anything is stored", async () => {
    const deps = { ...makeDeps(), fetchImpl: fakeTelnyx().fetchImpl };
    const token = sessionFor(deps);
    for (const d of [{ to: "123", message: "hi" }, { to: "9172809243", message: "  " }, { to: "9172809243", message: "x".repeat(641) }]) {
      const r = await handleRequestAction(toolRequest(REQ, { action_type: "send_text", details: d }, token), deps);
      expect(r.status).toBe(400);
    }
    expect(deps.store.pending).toHaveLength(0);
  });

  it("reports a Telnyx failure honestly", async () => {
    const tel = fakeTelnyx(false);
    const deps = { ...makeDeps(), fetchImpl: tel.fetchImpl };
    const token = sessionFor(deps); // confirmed call: yes only
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "send_text", details }, token), deps)).json()) as any;
    const res = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, token), deps);
    expect(res.status).toBe(502);
    expect(deps.store.pending[0]?.status).toBe("failed");
    expect(deps.store.pending[0]?.result).toContain("40010");
  });

  it("fails clearly if the server has no Telnyx key", async () => {
    const tel = fakeTelnyx();
    const base = makeDeps();
    const deps = { ...base, config: { ...base.config, telnyx: { apiKey: null, agentPhone: "+15555550100" } }, fetchImpl: tel.fetchImpl };
    const token = sessionFor(deps);
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "send_text", details }, token), deps)).json()) as any;
    const res = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, token), deps);
    expect(res.status).toBe(502);
    expect(deps.store.pending[0]?.result).toContain("TELNYX_API_KEY");
    expect(tel.calls).toHaveLength(0);
  });
});
