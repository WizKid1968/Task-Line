import { timingSafeEqual } from "node:crypto";
import { jobsEnabled } from "../config.js";
import type { Deps } from "../deps.js";
import { bestEffort, json, parseJsonObject } from "../http.js";
import { JobError, startJob } from "../jobs.js";
import { logEvent, maskPhone } from "../log.js";
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
export async function handleJobReport(req: Request, deps: Deps): Promise<Response> {
  if (!jobsEnabled(deps.config)) return json(503, { error: "not_configured" });
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !secretMatches(given, deps.config.routine.reportSecret!)) {
    logEvent("job_report_rejected", { reason: "bad_secret", hasAuth: Boolean(auth) });
    return json(401, { error: "not_authorized" });
  }

  const body = parseJsonObject(await req.text());
  if (!body) return json(400, { error: "bad_request", message: "Body must be JSON." });
  const jobId = typeof body["job_id"] === "string" ? body["job_id"].trim() : "";
  const status = body["status"] === "done" || body["status"] === "failed" ? body["status"] : null;
  const summary = typeof body["summary"] === "string" ? body["summary"].trim() : "";
  const link = typeof body["link"] === "string" && /^https:\/\/\S+$/.test(body["link"].trim()) ? body["link"].trim() : "";
  if (!/^job_[0-9a-f]{32}$/.test(jobId) || !status || !summary) {
    return json(400, { error: "bad_request", message: "Need job_id, status (done or failed) and summary." });
  }

  const job = await deps.store.findJob(jobId);
  if (!job) {
    logEvent("job_report_rejected", { reason: "unknown_job" });
    return json(404, { error: "not_found" });
  }
  if (job.status !== "running") {
    logEvent("job_report_rejected", { reason: "not_running", status: job.status });
    return json(409, { error: "already_reported", status: job.status });
  }

  const head = status === "done" ? "Opus: done." : "Opus: that didn't work.";
  const tail = link ? `\n${link}` : "";
  const room = MAX_RESULT_TEXT - head.length - tail.length - 1;
  const text = `${head}\n${summary.length > room ? `${summary.slice(0, room - 1)}…` : summary}${tail}`;

  await deps.store.updateJob(job, { status, result: summary + (link ? `\n${link}` : ""), finishedAt: deps.now().toISOString() });
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
