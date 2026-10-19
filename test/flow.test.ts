import { describe, expect, it } from "vitest";
import { decryptFromTelnyx } from "../src/encrypt.js";
import { handleCancelAction, handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { handleInit } from "../src/handlers/init.js";
import { verifySessionToken } from "../src/session.js";
import { makeDeps, NOW, NOW_SECONDS, OWNER_PHONE, sessionFor, signedRequest, STRANGER_PHONE, toolRequest, TRUSTED_PHONE } from "./helpers.js";

const INIT = "https://x.test/api/telnyx/init";
const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";
const CANCEL = "https://x.test/api/tools/cancel-action";

function initBody(phone: string, channel = "phone_call", verified = true) {
  return {
    data: {
      record_type: "event",
      id: "evt-1",
      event_type: "assistant.initialization",
      payload: {
        telnyx_conversation_channel: channel,
        telnyx_agent_target: "+15555550100",
        telnyx_end_user_target: phone,
        telnyx_end_user_target_verified: verified,
        call_control_id: "v3:call-1",
        assistant_id: "assistant-1",
      },
    },
  };
}

describe("start of conversation", () => {
  it("issues an encrypted pass to the owner on a confirmed call", async () => {
    const deps = makeDeps();
    const res = await handleInit(signedRequest(INIT, initBody(OWNER_PHONE)), deps);
    expect(res.status).toBe(200);
    const out = (await res.json()) as any;
    expect(out.dynamic_variables).toEqual({ caller_role: "owner", caller_name: "Owner", code_word_required: "no" });
    const token = decryptFromTelnyx(out.encrypted_dynamic_variables.session_token, deps.config.telnyxEncryptionKey);
    const claims = verifySessionToken(token, deps.config.sessionSecret, NOW_SECONDS);
    expect(claims).toMatchObject({ role: "owner", phone: OWNER_PHONE, channel: "phone_call", verified: true });
    expect(deps.store.logs.at(-1)?.event).toBe("conversation_started");
  });

  it("requires the code word for texts and unconfirmed calls", async () => {
    const deps = makeDeps();
    const text = (await (await handleInit(signedRequest(INIT, initBody(TRUSTED_PHONE, "sms_chat", false)), deps)).json()) as any;
    expect(text.dynamic_variables).toMatchObject({ caller_role: "trusted", code_word_required: "yes" });
    const call = (await (await handleInit(signedRequest(INIT, initBody(OWNER_PHONE, "phone_call", false)), deps)).json()) as any;
    expect(call.dynamic_variables.code_word_required).toBe("yes");
  });

  it("gives strangers no pass", async () => {
    const deps = makeDeps();
    const out = (await (await handleInit(signedRequest(INIT, initBody(STRANGER_PHONE)), deps)).json()) as any;
    expect(out.dynamic_variables.caller_role).toBe("unknown");
    expect(out.encrypted_dynamic_variables).toEqual({});
    expect(deps.store.logs.at(-1)?.event).toBe("refused_unknown_caller");
  });

  it("rejects requests not signed by Telnyx", async () => {
    const deps = makeDeps();
    expect((await handleInit(signedRequest(INIT, initBody(OWNER_PHONE), { badSig: true }), deps)).status).toBe(401);
    const old = String(NOW_SECONDS - 600);
    expect((await handleInit(signedRequest(INIT, initBody(OWNER_PHONE), { timestamp: old }), deps)).status).toBe(401);
    const unsigned = new Request(INIT, { method: "POST", body: JSON.stringify(initBody(OWNER_PHONE)) });
    expect((await handleInit(unsigned, deps)).status).toBe(401);
  });
});

describe("tools refuse anyone without a valid pass", () => {
  it("no pass, forged pass, expired pass", async () => {
    const deps = makeDeps();
    const body = { action_type: "test_action" };
    expect((await handleRequestAction(toolRequest(REQ, body, null), deps)).status).toBe(401);
    expect((await handleRequestAction(toolRequest(REQ, body, "abc.def"), deps)).status).toBe(401);
    const expired = sessionFor(deps, { exp: NOW_SECONDS - 1 });
    expect((await handleRequestAction(toolRequest(REQ, body, expired), deps)).status).toBe(401);
    expect(deps.store.pending).toHaveLength(0);
  });

  it("a pass for a number that was removed from the allowed list", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps, { phone: STRANGER_PHONE });
    expect((await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).status).toBe(403);
  });

  it("caller number from Telnyx must match the pass", async () => {
    const deps = makeDeps();
    const res = await handleRequestAction(
      toolRequest(REQ, { action_type: "test_action", caller_number: TRUSTED_PHONE }, sessionFor(deps)),
      deps,
    );
    expect(res.status).toBe(403);
  });

  it("bad Telnyx signature is rejected even with a valid pass", async () => {
    const deps = makeDeps();
    const req = signedRequest(REQ, { action_type: "test_action" }, { badSig: true });
    req.headers.set("authorization", `Bearer ${sessionFor(deps)}`);
    expect((await handleRequestAction(req, deps)).status).toBe(401);
  });
});

describe("ask first, then act", () => {
  it("confirmed call: request, then a yes runs it", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps);
    const r1 = await handleRequestAction(toolRequest(REQ, { action_type: "test_action", details: { label: "a quick test" } }, token), deps);
    const req = (await r1.json()) as any;
    expect(r1.status).toBe(200);
    expect(req.code_word_required).toBe(false);
    expect(req.read_back).toContain("a quick test");
    expect(deps.store.logs.some((l) => l.event === "test_action_ran")).toBe(false); // nothing ran yet

    const r2 = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code.toLowerCase() }, token), deps);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as any).result).toBe("Test action completed.");
    expect(deps.store.logs.some((l) => l.event === "test_action_ran")).toBe(true);
    expect(deps.store.pending[0]?.status).toBe("done");

    // Can't run twice.
    const r3 = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, token), deps);
    expect(r3.status).toBe(409);
  });

  it("details sent as a JSON string are accepted", async () => {
    const deps = makeDeps();
    const r = await handleRequestAction(toolRequest(REQ, { action_type: "test_action", details: '{"label":"string test"}' }, sessionFor(deps)), deps);
    expect(((await r.json()) as any).read_back).toContain("string test");
  });

  it("text message: needs the right code word", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps, { channel: "sms_chat", verified: false });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).json()) as any;
    expect(req.code_word_required).toBe(true);

    const noWord = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, token), deps);
    expect(noWord.status).toBe(403);
    expect(((await noWord.json()) as any).attempts_left).toBe(2);

    const ok = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "blue falcon!" }, token), deps);
    expect(ok.status).toBe(200);
  });

  it("each person has their own code word", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps, { role: "trusted", phone: TRUSTED_PHONE, channel: "sms_chat", verified: false });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).json()) as any;
    const ownersWord = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon" }, token), deps);
    expect(ownersWord.status).toBe(403);
    const ownWord = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Green River" }, token), deps);
    expect(ownWord.status).toBe(200);
  });

  it("three wrong code words cancel the request", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps, { channel: "sms_chat", verified: false });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).json()) as any;
    for (let i = 0; i < 2; i++) {
      await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "wrong" }, token), deps);
    }
    const third = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "wrong" }, token), deps);
    expect(((await third.json()) as any).error).toBe("too_many_attempts");
    const after = await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon" }, token), deps);
    expect(after.status).toBe(409);
    expect(deps.store.logs.some((l) => l.event === "test_action_ran")).toBe(false);
  });

  it("the other person can't confirm your request", async () => {
    const deps = makeDeps();
    const owner = sessionFor(deps);
    const friend = sessionFor(deps, { role: "trusted", phone: TRUSTED_PHONE });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, owner), deps)).json()) as any;
    expect((await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, friend), deps)).status).toBe(404);
  });

  it("requests expire after 10 minutes", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps, { exp: NOW_SECONDS + 7200 });
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).json()) as any;
    // 11 minutes later. Sent without signature headers so only the expiry rule is tested.
    const later = { ...deps, now: () => new Date(NOW.getTime() + 11 * 60_000) };
    const res = await handleConfirmAction(
      new Request(CONFIRM, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ pending_code: req.pending_code }),
      }),
      later,
    );
    expect(res.status).toBe(410);
    expect(deps.store.pending[0]?.status).toBe("expired");
    expect(deps.store.logs.some((l) => l.event === "test_action_ran")).toBe(false);
  });

  it("unknown actions are refused with the list of available ones", async () => {
    const deps = makeDeps();
    const res = await handleRequestAction(toolRequest(REQ, { action_type: "wire_money" }, sessionFor(deps)), deps);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).available_actions).toEqual(["test_action"]);
  });

  it("cancel stops it", async () => {
    const deps = makeDeps();
    const token = sessionFor(deps);
    const req = (await (await handleRequestAction(toolRequest(REQ, { action_type: "test_action" }, token), deps)).json()) as any;
    expect((await handleCancelAction(toolRequest(CANCEL, { pending_code: req.pending_code }, token), deps)).status).toBe(200);
    expect((await handleConfirmAction(toolRequest(CONFIRM, { pending_code: req.pending_code }, token), deps)).status).toBe(409);
    expect(deps.store.logs.some((l) => l.event === "test_action_ran")).toBe(false);
  });
});
