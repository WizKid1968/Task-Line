import { describe, expect, it } from "vitest";
import { handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { handleFindContact } from "../src/handlers/contacts.js";
import { fakeNet, makeDeps, OWNER_PHONE, signedRequest, STRANGER_PHONE, TRUSTED_PHONE } from "./helpers.js";

const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";
const FIND = "https://x.test/api/tools/find-contact";

function setup() {
  const net = fakeNet();
  return { deps: { ...makeDeps(), fetchImpl: net.fetchImpl }, net };
}
const presets = (phone: string) => ({ caller_number: phone, conversation_channel: "sms_chat", caller_attestation: "", call_ref: "{{call_control_id}}" });
const text = (to: string, phone = OWNER_PHONE) =>
  signedRequest(REQ, { action_type: "send_text", details: { to, message: "On my way" }, ...presets(phone) });

describe("contacts", () => {
  it("the trusted person can be texted by name without saving anything", async () => {
    const { deps, net } = setup();
    const req = (await (await handleRequestAction(text("friend"), deps)).json()) as any;
    expect(req.read_back).toBe('I\'ll text Friend (555-555-0102) this message: "On my way — Sent for Owner"');
    await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps);
    expect(net.texts.at(-1)!.to).toBe(TRUSTED_PHONE);
  });

  it("saving a contact asks first, then texting by first name works", async () => {
    const { deps, net } = setup();
    const save = (await (await handleRequestAction(
      signedRequest(REQ, { action_type: "save_contact", details: { name: "Sam  Rivera", phone: "(555) 555-0177" }, ...presets(OWNER_PHONE) }),
      deps,
    )).json()) as any;
    expect(save.read_back).toBe("I'll save Sam Rivera as 555-555-0177 in your contacts.");
    expect(deps.store.contacts).toHaveLength(0); // nothing saved before yes + code word
    await handleConfirmAction(signedRequest(CONFIRM, { pending_code: save.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps);
    expect(deps.store.contacts[0]).toMatchObject({ name: "Sam Rivera", phone: "+15555550177", addedBy: "Owner" });

    const req = (await (await handleRequestAction(text("sam"), deps)).json()) as any;
    expect(req.read_back).toContain("Sam Rivera (555-555-0177)");
    await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps);
    expect(net.texts.at(-1)!.to).toBe("+15555550177");
  });

  it("unknown or ambiguous names are sent back to the agent to ask", async () => {
    const { deps } = setup();
    await deps.store.saveContact({ name: "Sam Rivera", phone: "+15555550177", addedBy: "Owner", createdAt: "" });
    await deps.store.saveContact({ name: "Sam Lee", phone: "+15555550178", addedBy: "Owner", createdAt: "" });
    const none = (await (await handleRequestAction(text("Shelly"), deps)).json()) as any;
    expect(none.message).toContain('no saved contact named "Shelly"');
    const two = (await (await handleRequestAction(text("Sam"), deps)).json()) as any;
    expect(two.message).toContain("Sam Rivera, Sam Lee");
    expect(deps.store.pending).toHaveLength(0);
  });

  it("the approved people's numbers can't be changed by saving a contact", async () => {
    const { deps } = setup();
    const save = (await (await handleRequestAction(
      signedRequest(REQ, { action_type: "save_contact", details: { name: "friend", phone: "555-555-0199" }, ...presets(OWNER_PHONE) }),
      deps,
    )).json()) as any;
    const res = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: save.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps);
    expect(res.status).toBe(502);
    expect(deps.store.contacts).toHaveLength(0);
    const req = (await (await handleRequestAction(text("friend"), deps)).json()) as any;
    expect(req.read_back).toContain("555-555-0102");
  });

  it("find_contact answers Rudy and the trusted person, and refuses strangers", async () => {
    const { deps } = setup();
    const ok = (await (await handleFindContact(signedRequest(FIND, { name: "Friend", ...presets(OWNER_PHONE) }), deps)).json()) as any;
    expect(ok.contacts).toEqual([{ name: "Friend", phone: "555-555-0102" }]);
    expect((await handleFindContact(signedRequest(FIND, { name: "Friend", ...presets(STRANGER_PHONE) }), deps)).status).toBe(403);
  });

  it("plain phone numbers still work as before", async () => {
    const { deps } = setup();
    const req = (await (await handleRequestAction(text("555-555-0143"), deps)).json()) as any;
    expect(req.read_back).toBe('I\'ll text 555-555-0143 this message: "On my way — Sent for Owner"');
  });
});

describe("contacts with the same name", () => {
  it("saving a name that already exists warns that it will replace the number", async () => {
    const { deps } = setup();
    await deps.store.saveContact({ name: "Victor", phone: "+15555550170", addedBy: "Owner", createdAt: "" });
    const save = (await (await handleRequestAction(
      signedRequest(REQ, { action_type: "save_contact", details: { name: "victor", phone: "555-555-0171" }, ...presets(OWNER_PHONE) }),
      deps,
    )).json()) as any;
    expect(save.read_back).toContain("You already have a contact named victor (555-555-0170). I'll replace that number with 555-555-0171.");
  });

  it("an exact name wins over first-name matches", async () => {
    const { deps } = setup();
    await deps.store.saveContact({ name: "Victor", phone: "+15555550170", addedBy: "Owner", createdAt: "" });
    await deps.store.saveContact({ name: "Victor Diaz", phone: "+15555550172", addedBy: "Owner", createdAt: "" });
    const req = (await (await handleRequestAction(text("Victor"), deps)).json()) as any;
    expect(req.read_back).toContain("Victor (555-555-0170)");
    const req2 = (await (await handleRequestAction(text("Victor Diaz"), deps)).json()) as any;
    expect(req2.read_back).toContain("Victor Diaz (555-555-0172)");
  });
});

describe("texting the other approved person", () => {
  it("doesn't promise to pass their reply along, and doesn't record it as outreach", async () => {
    const { deps } = setup();
    const req = (await (await handleRequestAction(text("friend"), deps)).json()) as any;
    const ok = (await (await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps)).json()) as any;
    expect(ok.result).toContain("goes to Opus as their own conversation");
    expect(deps.store.outreach).toHaveLength(0);
  });

  it("contacts saved in any format are found", async () => {
    const { deps } = setup();
    await deps.store.saveContact({ name: "Ana", phone: "+15555550180", addedBy: "Owner", createdAt: "" });
    await deps.store.saveContact({ name: "Ben", phone: "(555) 555-0181", addedBy: "Owner", createdAt: "" });
    expect(((await (await handleRequestAction(text("Ana"), deps)).json()) as any).read_back).toContain("555-555-0180");
    expect(((await (await handleRequestAction(text("Ben"), deps)).json()) as any).read_back).toContain("555-555-0181");
  });
});
