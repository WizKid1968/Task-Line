import { timingSafeEqual } from "node:crypto";
import { jobsEnabled } from "../config.js";
import type { Deps } from "../deps.js";
import { bestEffort, json, parseJsonObject } from "../http.js";
import { checkLookup, checkResult, screenEmail } from "../jevChecks.js";
import { JobError, startJob } from "../jobs.js";
import { logEvent, maskPhone } from "../log.js";
import type { Job } from "../store/types.js";
import { sendText } from "../telnyxSend.js";
import { authenticateTool } from "./auth.js";

const MAX_RESULT_TEXT = 900; // about 6 text segments

/**
 * start_lookup tool: a job that only looks things up and changes nothing
 * (research, read and summarize email). Starts right away; no approval needed.
 */
export async function handleStartLookup(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateTool(req, deps);
  if (!auth.ok) return auth.response;
  const { claims, person, body } = auth;
  const task = typeof body["task"] === "string" ? body["task"] : "";

  // Checkpoint 1: a second, independent judge makes sure a "look-up" really only
  // reads. Anything else (or no answer) must go through ask-first instead.
  const verdict = await checkLookup(deps.config.jevApiKey, task, deps.fetchImpl);
  if (!verdict.ok) {
    logEvent("lookup_redirected", { reason: verdict.reason, changes: verdict.changes });
    await bestEffort(
      deps.store.log({
        who: person.name,
        phone: person.phone,
        channel: claims.channel,
        event: "lookup_redirected",
        details: `${verdict.reason === "unavailable" ? "Safety check unavailable" : `Jev: changes things (${verdict.changes})`}: ${task}`,
        conversation: claims.conversation,
      }),
      1500,
    );
    return json(409, {
      ok: false,
      error: "needs_approval",
      message:
        verdict.reason === "unavailable"
          ? "The safety check couldn't confirm this only looks things up, so it needs approval. Call request_action with action_type claude_job and the same task, then follow the ask-first rule."
          : "This would change, send or spend something, so it needs approval. Call request_action with action_type claude_job and the same task, then follow the ask-first rule.",
    });
  }

  try {
    const job = await startJob({
      task,
      permission: "read_only",
      person,
      channel: claims.channel,
      store: deps.store,
      config: deps.config,
      now: deps.now,
      fetchImpl: deps.fetchImpl,
    });
    await bestEffort(
      deps.store.log({
        who: person.name,
        phone: person.phone,
        channel: claims.channel,
        event: "job_started",
        details: `${job.jobId} (look-up only): ${job.task}`,
        conversation: claims.conversation,
      }),
      1500,
    );
    return json(200, { ok: true, message: "Opus is on it. The answer will come by text." });
  } catch (err) {
    if (err instanceof JobError) return json(400, { ok: false, error: "job_not_started", message: err.message });
    throw err;
  }
}

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The routine reports a finished job. It must send the report secret (added by
 * its environment, never seen by the session) and the job's unguessable id.
 * Each job can report once. The result is texted only to whoever asked for it.
 */
type WorkerAuth = { ok: true; body: Record<string, unknown>; job: Job } | { ok: false; response: Response };

/**
 * Requests from the worker (routine) carry the report secret, which its
 * environment adds without the session seeing it, plus the id of a job that is
 * still running. Used by the report and email-screening endpoints.
 */
async function authenticateWorker(req: Request, deps: Deps, label: string): Promise<WorkerAuth> {
  if (!jobsEnabled(deps.config)) return { ok: false, response: json(503, { error: "not_configured" }) };
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !secretMatches(given, deps.config.routine.reportSecret!)) {
    logEvent(`${label}_rejected`, { reason: "bad_secret", hasAuth: Boolean(auth) });
    return { ok: false, response: json(401, { error: "not_authorized" }) };
  }
  const body = parseJsonObject(await req.text());
  if (!body) return { ok: false, response: json(400, { error: "bad_request", message: "Body must be JSON." }) };
  const jobId = typeof body["job_id"] === "string" ? body["job_id"].trim() : "";
  if (!/^job_[0-9a-f]{32}$/.test(jobId)) return { ok: false, response: json(400, { error: "bad_request", message: "Need a valid job_id." }) };
  const job = await deps.store.findJob(jobId);
  if (!job) {
    logEvent(`${label}_rejected`, { reason: "unknown_job" });
    return { ok: false, response: json(404, { error: "not_found" }) };
  }
  if (job.status !== "running") {
    logEvent(`${label}_rejected`, { reason: "not_running", status: job.status });
    return { ok: false, response: json(409, { error: "already_reported", status: job.status }) };
  }
  return { ok: true, body, job };
}

export async function handleJobReport(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateWorker(req, deps, "job_report");
  if (!auth.ok) return auth.response;
  const { body, job } = auth;
  const jobId = job.jobId;
  const status = body["status"] === "done" || body["status"] === "failed" ? body["status"] : null;
  const summary = typeof body["summary"] === "string" ? body["summary"].trim() : "";
  const link = typeof body["link"] === "string" && /^https:\/\/\S+$/.test(body["link"].trim()) ? body["link"].trim() : "";
  if (!status || !summary) {
    return json(400, { error: "bad_request", message: "Need job_id, status (done or failed) and summary." });
  }

  // Checkpoint 3: hold results that may contain a password or code, or that
  // describe actions nobody asked for. The requester gets an alert instead.
  const verdict = await checkResult(deps.config.jevApiKey, job.task, job.permission, summary, deps.fetchImpl);
  if (verdict.hold) {
    const why = verdict.reasons.join(" and ");
    await deps.store.updateJob(job, {
      status: "held",
      result: `[HELD: ${why}]\n${summary}${link ? `\n${link}` : ""}`,
      finishedAt: deps.now().toISOString(),
    });
    logEvent("job_result_held", { jobId, reasons: verdict.reasons });
    const alert = `Opus: a result was held for your safety because ${why}. The full result is in the Jobs table in Airtable (job ending ${jobId.slice(-6)}).`;
    try {
      await sendText(deps.config.telnyx, job.requestedBy, alert, deps.fetchImpl);
    } catch (err) {
      logEvent("job_result_text_failed", { jobId, message: err instanceof Error ? err.message : String(err) });
    }
    await bestEffort(
      deps.store.log({ who: job.requesterName, phone: job.requestedBy, channel: "sms_chat", event: "job_result_held", details: `${jobId}: ${why}` }),
      1500,
    );
    return json(200, { ok: true, held: true });
  }

  const head = status === "done" ? "Opus: done." : "Opus: that didn't work.";
  const tail = link ? `\n${link}` : "";
  const room = MAX_RESULT_TEXT - head.length - tail.length - 1;
  const text = `${head}\n${summary.length > room ? `${summary.slice(0, room - 1)}…` : summary}${tail}`;

  const unchecked = verdict.checked ? "" : "\n[safety check unavailable for this result]";
  await deps.store.updateJob(job, { status, result: summary + (link ? `\n${link}` : "") + unchecked, finishedAt: deps.now().toISOString() });
  try {
    await sendText(deps.config.telnyx, job.requestedBy, text, deps.fetchImpl);
  } catch (err) {
    logEvent("job_result_text_failed", { jobId, to: maskPhone(job.requestedBy), message: err instanceof Error ? err.message : String(err) });
    return json(502, { ok: false, error: "text_failed", message: "Result saved, but the text to the requester failed." });
  }
  logEvent("job_reported", { jobId, status });
  await bestEffort(
    deps.store.log({
      who: job.requesterName,
      phone: job.requestedBy,
      channel: "sms_chat",
      event: `job_${status}`,
      details: `${jobId}: ${text}`,
    }),
    1500,
  );
  return json(200, { ok: true });
}

const MAX_SCREEN_EMAILS = 50;

/**
 * Checkpoint 6: the worker sends sender, subject and preview of emails before
 * opening them; the server asks Jev whether each looks like a scam. Only for a
 * running job, with the report secret. The worker skips "skip" emails and is
 * extra careful with "unchecked" ones.
 */
export async function handleScreenEmails(req: Request, deps: Deps): Promise<Response> {
  const auth = await authenticateWorker(req, deps, "screen");
  if (!auth.ok) return auth.response;
  const list = Array.isArray(auth.body["emails"]) ? auth.body["emails"] : null;
  if (!list || list.length === 0 || list.length > MAX_SCREEN_EMAILS) {
    return json(400, { error: "bad_request", message: `Send 1 to ${MAX_SCREEN_EMAILS} emails as {id, from, subject, preview}.` });
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const emails = list.map((e, i) => {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    return { id: str(o["id"], 200) || String(i), from: str(o["from"], 300), subject: str(o["subject"], 500), preview: str(o["preview"], 1000) };
  });

  const results: { id: string; verdict: string; scam_probability: number | null }[] = [];
  // A few at a time, to stay polite to Jev and inside the function time limit.
  for (let i = 0; i < emails.length; i += 5) {
    const batch = await Promise.all(
      emails.slice(i, i + 5).map(async (e) => {
        const r = await screenEmail(deps.config.jevApiKey, e, deps.fetchImpl);
        return { id: e.id, verdict: r.verdict, scam_probability: r.scam };
      }),
    );
    results.push(...batch);
  }
  const skipped = results.filter((r) => r.verdict === "skip").length;
  logEvent("emails_screened", { jobId: auth.job.jobId, count: results.length, skipped });
  return json(200, { ok: true, results });
}
