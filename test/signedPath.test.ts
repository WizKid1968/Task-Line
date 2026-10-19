import { describe, expect, it } from "vitest";
import { handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { makeDeps, NOW_SECONDS, OWNER_PHONE, signedRequest, STRANGER_PHONE, TRUSTED_PHONE } from "./helpers.js";

const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";

/** What Telnyx fills in by itself on every tool request. */
function presets(over: Record<string, string> = {}) {
  return {
    caller_number: OWNER_PHONE,
    conversation_channel: "sms_chat",
    caller_attestation: "",
    call_ref: "{{call_control_id}}", // texts have no call id; Telnyx leaves the placeholder
    ...over,
  };
}

const textAction = { action_type: "send_text", details: { to: "5555550143", message: "On my way" } };

describe("texts: Telnyx signature + Telnyx-filled caller details", () => {
  it("accepts a signed request from an allowed number and requires the code word on texts", async () => {
    const deps = makeDeps();
    const res = await handleRequestAction(signedRequest(REQ, { ...textAction, ...presets() }), deps);
    expect(res.status).toBe(200);
    const out = (await res.json()) as any;
    expect(out.code_word_required).toBe(true);
    expect(deps.store.pending[0]).toMatchObject({ requestedBy: OWNER_PHONE, channel: "sms_chat", needsCodeWord: true });
  });

  it("works for the trusted person too, with their own code word", async () => {
    const deps = { ...makeDeps(), fetchImpl: (async () => new Response(JSON.stringify({ data: { id: "m1" } }))) as unknown as typeof fetch };
    const p = presets({ caller_number: TRUSTED_PHONE });
    const req = (await (await handleRequestAction(signedRequest(REQ, { ...textAction, ...p }), deps)).json()) as any;
    const wrong = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", ...p }), deps);
    expect(wrong.status).toBe(403);
    const right = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "green river", ...p }), deps);
    expect(right.status).toBe(200);
  });

  it("calls with full carrier confirmation (A) need only a yes; B or C need the code word", async () => {
    const deps = makeDeps();
    const a = (await (await handleRequestAction(
      signedRequest(REQ, { ...textAction, ...presets({ conversation_channel: "phone_call", caller_attestation: "A", call_ref: "v3:abc" }) }),
      deps,
    )).json()) as any;
    expect(a.code_word_required).toBe(false);
    for (const level of ["B", "C", "", "{{telnyx_shaken_stir_attestation}}"]) {
      const r = (await (await handleRequestAction(
        signedRequest(REQ, { ...textAction, ...presets({ conversation_channel: "phone_call", caller_attestation: level }) }),
        deps,
      )).json()) as any;
      expect(r.code_word_required).toBe(true);
    }
  });

  it("refuses strangers", async () => {
    const deps = makeDeps();
    const res = await handleRequestAction(signedRequest(REQ, { ...textAction, ...presets({ caller_number: STRANGER_PHONE }) }), deps);
    expect(res.status).toBe(403);
    expect(deps.store.pending).toHaveLength(0);
  });

  it("refuses unsigned requests, even with an allowed caller number", async () => {
    const deps = makeDeps();
    const unsigned = new Request(REQ, { method: "POST", body: JSON.stringify({ ...textAction, ...presets() }) });
    expect((await handleRequestAction(unsigned, deps)).status).toBe(401);
    expect(deps.store.pending).toHaveLength(0);
  });

  it("refuses tampered requests (someone changes the caller number after Telnyx signed it)", async () => {
    const deps = makeDeps();
    const original = signedRequest(REQ, { ...textAction, ...presets({ caller_number: STRANGER_PHONE }) });
    const forgedBody = JSON.stringify({ ...textAction, ...presets() });
    const forged = new Request(REQ, { method: "POST", headers: original.headers, body: forgedBody });
    expect((await handleRequestAction(forged, deps)).status).toBe(401);
    expect(deps.store.pending).toHaveLength(0);
  });

  it("refuses old (replayed) requests", async () => {
    const deps = makeDeps();
    const old = signedRequest(REQ, { ...textAction, ...presets() }, { timestamp: String(NOW_SECONDS - 301) });
    expect((await handleRequestAction(old, deps)).status).toBe(401);
  });

  it("refuses when Telnyx couldn't fill in the caller number", async () => {
    const deps = makeDeps();
    for (const caller of ["{{telnyx_end_user_target}}", "", "not a number"]) {
      const res = await handleRequestAction(signedRequest(REQ, { ...textAction, ...presets({ caller_number: caller }) }), deps);
      expect(res.status).toBe(401);
    }
    const noCaller = await handleRequestAction(signedRequest(REQ, { ...textAction }), deps);
    expect(noCaller.status).toBe(401);
    expect(deps.store.pending).toHaveLength(0);
  });

  it("one person can't confirm the other's request", async () => {
    const deps = makeDeps();
    const req = (await (await handleRequestAction(signedRequest(REQ, { ...textAction, ...presets() }), deps)).json()) as any;
    const other = await handleConfirmAction(
      signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "green river", ...presets({ caller_number: TRUSTED_PHONE }) }),
      deps,
    );
    expect(other.status).toBe(404);
  });
});
