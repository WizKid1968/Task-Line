import { describe, expect, it } from "vitest";
import { handleConfirmAction, handleRequestAction } from "../src/handlers/actions.js";
import { handleJobReport, handleStartLookup } from "../src/handlers/jobs.js";
import { MAX_JOBS_PER_HOUR } from "../src/jobs.js";
import { makeDeps, OWNER_PHONE, signedRequest, STRANGER_PHONE, TRUSTED_PHONE } from "./helpers.js";

const LOOKUP = "https://x.test/api/tools/start-lookup";
const REQ = "https://x.test/api/tools/request-action";
const CONFIRM = "https://x.test/api/tools/confirm-action";
const REPORT = "https://x.test/api/jobs/report";
const FIRE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_TEST123/fire";
const SECRET = "test-report-secret-that-is-long-enough-0123";

/** Fake network: the routine's fire endpoint and Telnyx texting. */
function fakeNet(fireStatus = 200) {
  const fires: { headers: Headers; body: any }[] = [];
  const texts: { to: string; text: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url === FIRE_URL) {
      fires.push({ headers: new Headers(init.headers), body });
      return fireStatus === 200
        ? new Response(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_1", claude_code_session_url: "https://claude.ai/code/session_1" }))
        : new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { status: fireStatus });
    }
    texts.push({ to: body.to, text: body.text });
    return new Response(JSON.stringify({ data: { id: `msg-${texts.length}` } }));
  }) as unknown as typeof fetch;
  return { fires, texts, fetchImpl };
}

function setup(fireStatus = 200) {
  const net = fakeNet(fireStatus);
  return { deps: { ...makeDeps(), fetchImpl: net.fetchImpl }, net };
}

function presets(phone: string, channel = "sms_chat") {
  return { caller_number: phone, conversation_channel: channel, caller_attestation: "", call_ref: "{{call_control_id}}" };
}

function report(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new Request(REPORT, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("look-ups (no approval needed)", () => {
  it("start the routine with the right headers and a read-only job", async () => {
    const { deps, net } = setup();
    const res = await handleStartLookup(signedRequest(LOOKUP, { task: "Summarize my latest email from Product Hunt", ...presets(OWNER_PHONE) }), deps);
    expect(res.status).toBe(200);
    expect(net.fires).toHaveLength(1);
    const fire = net.fires[0]!;
    expect(fire.headers.get("authorization")).toBe("Bearer test-routine-token");
    expect(fire.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(fire.body.text).toContain("permission: read_only");
    expect(fire.body.text).toContain("requested_by: Owner");
    expect(fire.body.text).toContain("Summarize my latest email from Product Hunt");
    expect(deps.store.jobs[0]).toMatchObject({ status: "running", permission: "read_only", requestedBy: OWNER_PHONE, sessionUrl: "https://claude.ai/code/session_1" });
  });

  it("refuse strangers and unsigned requests, and start nothing", async () => {
    const { deps, net } = setup();
    expect((await handleStartLookup(signedRequest(LOOKUP, { task: "x", ...presets(STRANGER_PHONE) }), deps)).status).toBe(403);
    const unsigned = new Request(LOOKUP, { method: "POST", body: JSON.stringify({ task: "x", ...presets(OWNER_PHONE) }) });
    expect((await handleStartLookup(unsigned, deps)).status).toBe(401);
    expect(net.fires).toHaveLength(0);
  });

  it("say 'not set up yet' until the routine settings are filled in", async () => {
    const { deps, net } = setup();
    deps.config.routine = { fireUrl: null, token: null, reportSecret: null };
    const res = await handleStartLookup(signedRequest(LOOKUP, { task: "x", ...presets(OWNER_PHONE) }), deps);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).message).toBe("Bigger jobs are not set up yet.");
    expect(net.fires).toHaveLength(0);
  });

  it(`stop at ${MAX_JOBS_PER_HOUR} jobs per hour per person`, async () => {
    const { deps, net } = setup();
    for (let i = 0; i < MAX_JOBS_PER_HOUR; i++) {
      expect((await handleStartLookup(signedRequest(LOOKUP, { task: `q${i}`, ...presets(OWNER_PHONE) }), deps)).status).toBe(200);
    }
    expect((await handleStartLookup(signedRequest(LOOKUP, { task: "one more", ...presets(OWNER_PHONE) }), deps)).status).toBe(400);
    // The other person has their own limit.
    expect((await handleStartLookup(signedRequest(LOOKUP, { task: "mine", ...presets(TRUSTED_PHONE) }), deps)).status).toBe(200);
    expect(net.fires).toHaveLength(MAX_JOBS_PER_HOUR + 1);
  });

  it("mark the job failed when the routine refuses to start", async () => {
    const { deps } = setup(429);
    const res = await handleStartLookup(signedRequest(LOOKUP, { task: "x", ...presets(OWNER_PHONE) }), deps);
    expect(res.status).toBe(400);
    expect(deps.store.jobs[0]!.status).toBe("failed");
  });
});

describe("jobs that change things (ask first)", () => {
  async function request(deps: ReturnType<typeof setup>["deps"]) {
    const p = presets(OWNER_PHONE);
    return (await (await handleRequestAction(
      signedRequest(REQ, { action_type: "claude_job", details: { task: "Reply to Sam's email: see you at 3" }, ...p }),
      deps,
    )).json()) as any;
  }

  it("read back first and start nothing until confirmed with the code word", async () => {
    const { deps, net } = setup();
    const req = await request(deps);
    expect(req.read_back).toContain("it may make changes");
    expect(req.code_word_required).toBe(true);
    expect(net.fires).toHaveLength(0);

    const wrong = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "nope", ...presets(OWNER_PHONE) }), deps);
    expect(wrong.status).toBe(403);
    expect(net.fires).toHaveLength(0);

    const ok = await handleConfirmAction(signedRequest(CONFIRM, { pending_code: req.pending_code, code_word: "Blue Falcon", ...presets(OWNER_PHONE) }), deps);
    expect(ok.status).toBe(200);
    expect(net.fires).toHaveLength(1);
    expect(net.fires[0]!.body.text).toContain("permission: approved_changes");
  });
});

describe("results from the routine", () => {
  async function runningJob() {
    const s = setup();
    await handleStartLookup(signedRequest(LOOKUP, { task: "What's the weather?", ...presets(TRUSTED_PHONE) }), s.deps);
    return { ...s, jobId: s.deps.store.jobs[0]!.jobId };
  }

  it("are texted to whoever asked, once", async () => {
    const { deps, net, jobId } = await runningJob();
    const res = await handleJobReport(report({ job_id: jobId, status: "done", summary: "Sunny, 70F.", link: "https://example.com/w" }), deps);
    expect(res.status).toBe(200);
    expect(net.texts.at(-1)).toEqual({ to: TRUSTED_PHONE, text: "Opus: done.\nSunny, 70F.\nhttps://example.com/w" });
    expect(deps.store.jobs[0]!.status).toBe("done");
    const again = await handleJobReport(report({ job_id: jobId, status: "done", summary: "again" }), deps);
    expect(again.status).toBe(409);
    expect(net.texts).toHaveLength(1);
  });

  it("are refused without the right secret, or for unknown jobs", async () => {
    const { deps, net, jobId } = await runningJob();
    expect((await handleJobReport(report({ job_id: jobId, status: "done", summary: "x" }, null), deps)).status).toBe(401);
    expect((await handleJobReport(report({ job_id: jobId, status: "done", summary: "x" }, "wrong-secret-wrong-secret-wrong-secret!!"), deps)).status).toBe(401);
    expect((await handleJobReport(report({ job_id: `job_${"0".repeat(32)}`, status: "done", summary: "x" }), deps)).status).toBe(404);
    expect((await handleJobReport(report({ job_id: jobId, status: "maybe", summary: "x" }), deps)).status).toBe(400);
    expect(net.texts).toHaveLength(0);
  });

  it("are shortened to fit a text, and non-https links are dropped", async () => {
    const { deps, net, jobId } = await runningJob();
    await handleJobReport(report({ job_id: jobId, status: "failed", summary: "y".repeat(2000), link: "javascript:alert(1)" }), deps);
    const sent = net.texts.at(-1)!.text;
    expect(sent.startsWith("Opus: that didn't work.\n")).toBe(true);
    expect(sent.length).toBeLessThanOrEqual(900);
    expect(sent).not.toContain("javascript");
  });
});
