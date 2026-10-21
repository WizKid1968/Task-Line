import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRANGER_INSTRUCTIONS } from "../src/agentInstructions.js";
import { handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { handleForwardReply, MAX_FORWARDS } from "../src/handlers/forward.js";
import { handleInit } from "../src/handlers/init.js";
import { fakeNet, makeDeps, NOW, OWNER_PHONE, signedRequest, STRANGER_PHONE, TRUSTED_PHONE } from "./helpers.js";

const INIT = "https://x.test/api/telnyx/init";
const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";
const FORWARD = "https://x.test/api/tools/forward-reply";
const RECIPIENT = "+15555550143";

function fakeTelnyx(jev: Record<string, number> = {}) {
  const net = fakeNet({ jev });
  return { sent: net.texts, fetchImpl: net.fetchImpl, net };
}

function presets(phone: string, channel = "sms_chat") {
  return { caller_number: phone, conversation_channel: channel, caller_attestation: "", call_ref: "{{call_control_id}}" };
}

function initBody(phone: string, channel = "sms_chat") {
  return {
    data: {
      id: "evt-1",
      event_type: "assistant.initialization",
      payload: { telnyx_conversation_channel: channel, telnyx_end_user_target: phone, telnyx_end_user_target_verified: false },
    },
  };
}

/** The owner (or trusted person) texts RECIPIENT through the agent, with code word. */
async function sendTextFor(deps: ReturnType<typeof makeDeps> & { fetchImpl: typeof fetch }, who = OWNER_PHONE, codeWord = "Blue Falcon") {
  const p = presets(who);
  const req = (await (await handleRequestAction(
    signedRequest(REQ, { action_type: "send_text", details: { to: RECIPIENT, message: "He's on his way." }, ...p }),
    deps,
  )).json()) as any;
  const res = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: codeWord, ...p }), deps);
  expect(res.status).toBe(200);
}

function depsWithTelnyx(now: Date = NOW) {
  const tel = fakeTelnyx();
  return { deps: { ...makeDeps(now), fetchImpl: tel.fetchImpl }, tel };
}

async function initVars(deps: ReturnType<typeof makeDeps>, phone: string, channel = "sms_chat") {
  return ((await (await handleInit(signedRequest(INIT, initBody(phone, channel)), deps)).json()) as any).dynamic_variables;
}

describe("texts sent for you", () => {
  it("end with a sign-off and are remembered for 24 hours", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps);
    expect(tel.sent[0]).toEqual({ to: RECIPIENT, text: "He's on his way. — Sent for Owner" });
    expect(deps.store.outreach[0]).toMatchObject({
      recipient: RECIPIENT,
      requestedBy: OWNER_PHONE,
      requesterName: "Owner",
      expiresAt: new Date(NOW.getTime() + 24 * 3600_000).toISOString(),
      forwards: 0,
    });
  });
});

describe("who gets which instructions", () => {
  it("strangers get only the fixed 'private line' instructions", async () => {
    const { deps } = depsWithTelnyx();
    const vars = await initVars(deps, STRANGER_PHONE);
    expect(vars.caller_role).toBe("unknown");
    expect(vars.role_instructions).toBe(STRANGER_INSTRUCTIONS);
  });

  it("someone texted within 24 hours is a recipient; their instructions only allow passing replies along", async () => {
    const { deps } = depsWithTelnyx();
    await sendTextFor(deps);
    const vars = await initVars(deps, RECIPIENT);
    expect(vars.caller_role).toBe("recipient");
    expect(vars.role_instructions).toContain("forward_reply");
    expect(vars.role_instructions).toContain("pass this along to Owner");
    expect(vars.role_instructions).not.toContain("send_text");
    expect(vars.role_instructions).not.toContain("request_action");
  });

  it("after 24 hours the recipient is treated as a stranger", async () => {
    const { deps } = depsWithTelnyx();
    await sendTextFor(deps);
    const laterTime = new Date(NOW.getTime() + 24 * 3600_000 + 1000);
    const later = { ...deps, now: () => laterTime };
    const ts = String(Math.floor(laterTime.getTime() / 1000));
    const vars = ((await (await handleInit(signedRequest(INIT, initBody(RECIPIENT), { timestamp: ts }), later)).json()) as any).dynamic_variables;
    expect(vars.caller_role).toBe("unknown");
  });

  it("allowed people get the full instructions with their name", async () => {
    const { deps } = depsWithTelnyx();
    const vars = await initVars(deps, TRUSTED_PHONE);
    expect(vars.role_instructions).toContain("You are talking to Friend");
    expect(vars.role_instructions).toContain("send_text");
  });

  it("the assistant's built-in default (used if the server is down) is the stranger instructions", () => {
    const file = readFileSync(new URL("../assistant/stranger-instructions.txt", import.meta.url), "utf8").trim();
    expect(file).toBe(STRANGER_INSTRUCTIONS);
    const script = readFileSync(new URL("../scripts/configure-assistant.mjs", import.meta.url), "utf8");
    expect(script).toContain("role_instructions: strangerInstructions");
  });
});

describe("passing replies along", () => {
  it("texts the reply to the person who asked for the original text", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps);
    const res = await handleForwardReply(signedRequest(FORWARD, { message: "Copy", ...presets(RECIPIENT) }), deps);
    expect(res.status).toBe(200);
    expect(tel.sent.at(-1)).toEqual({ to: OWNER_PHONE, text: 'Reply from 555-555-0143 to your text "He\'s on his way.":\nCopy' });
    expect(deps.store.outreach[0]!.forwards).toBe(1);
  });

  it("goes to the trusted person when they sent the original text", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps, TRUSTED_PHONE, "green river");
    await handleForwardReply(signedRequest(FORWARD, { message: "Ok", ...presets(RECIPIENT) }), deps);
    expect(tel.sent.at(-1)!.to).toBe(TRUSTED_PHONE);
  });

  it("refuses strangers, expired replies, calls, allowed people, unsigned and tampered requests", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps);
    const before = tel.sent.length;

    const stranger = await handleForwardReply(signedRequest(FORWARD, { message: "hi", ...presets(STRANGER_PHONE) }), deps);
    expect(stranger.status).toBe(403);

    const laterTime = new Date(NOW.getTime() + 25 * 3600_000);
    const later = { ...deps, now: () => laterTime };
    const ts = String(Math.floor(laterTime.getTime() / 1000));
    const expired = await handleForwardReply(signedRequest(FORWARD, { message: "hi", ...presets(RECIPIENT) }, { timestamp: ts }), later);
    expect(expired.status).toBe(403);

    const call = await handleForwardReply(signedRequest(FORWARD, { message: "hi", ...presets(RECIPIENT, "phone_call") }), deps);
    expect(call.status).toBe(403);

    const owner = await handleForwardReply(signedRequest(FORWARD, { message: "hi", ...presets(OWNER_PHONE) }), deps);
    expect(owner.status).toBe(403);

    const unsigned = await handleForwardReply(
      new Request(FORWARD, { method: "POST", body: JSON.stringify({ message: "hi", ...presets(RECIPIENT) }) }),
      deps,
    );
    expect(unsigned.status).toBe(401);

    const original = signedRequest(FORWARD, { message: "hi", ...presets(STRANGER_PHONE) });
    const forged = new Request(FORWARD, { method: "POST", headers: original.headers, body: JSON.stringify({ message: "hi", ...presets(RECIPIENT) }) });
    expect((await handleForwardReply(forged, deps)).status).toBe(401);

    expect(tel.sent.length).toBe(before);
  });

  it("stops after the limit so a chatty recipient can't run up costs", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps);
    for (let i = 0; i < MAX_FORWARDS; i++) {
      expect((await handleForwardReply(signedRequest(FORWARD, { message: `m${i}`, ...presets(RECIPIENT) }), deps)).status).toBe(200);
    }
    const over = await handleForwardReply(signedRequest(FORWARD, { message: "one more", ...presets(RECIPIENT) }), deps);
    expect(over.status).toBe(429);
    expect(tel.sent.filter((s) => s.to === OWNER_PHONE)).toHaveLength(MAX_FORWARDS);
  });

  it("recipients still can't use the normal tools", async () => {
    const { deps, tel } = depsWithTelnyx();
    await sendTextFor(deps);
    const before = tel.sent.length;
    const res = await handleRequestAction(
      signedRequest(REQ, { action_type: "send_text", details: { to: "5555550177", message: "hi" }, ...presets(RECIPIENT) }),
      deps,
    );
    expect(res.status).toBe(403);
    expect(tel.sent.length).toBe(before);
  });
});
