import { randomBytes } from "node:crypto";
import { type Config, jobsEnabled, type Person } from "./config.js";
import { logEvent } from "./log.js";
import type { Job, JobPermission, Store } from "./store/types.js";

/** Most jobs one person can start per hour (the routine itself allows 30 per hour). */
export const MAX_JOBS_PER_HOUR = 10;
export const MAX_TASK_CHARS = 4000;

export class JobError extends Error {}

export function newJobId(): string {
  return `job_${randomBytes(16).toString("hex")}`;
}

/**
 * The text handed to the routine. The routine's saved instructions explain
 * these fields; the routine treats this text as the job description.
 */
export function firePayload(job: Job): string {
  return [
    "Task-Line job",
    `job_id: ${job.jobId}`,
    `requested_by: ${job.requesterName}`,
    `permission: ${job.permission}`,
    `channel: ${job.channel}`,
    "task:",
    job.task,
  ].join("\n");
}

export interface StartJobInput {
  task: string;
  permission: JobPermission;
  person: Person;
  channel: string;
  store: Store;
  config: Config;
  now: () => Date;
  fetchImpl?: typeof fetch;
}

/** Record the job, start the routine, and return the saved job. */
export async function startJob(input: StartJobInput): Promise<Job> {
  const { config, store, person } = input;
  if (!jobsEnabled(config)) throw new JobError("Bigger jobs are not set up yet.");
  const task = input.task.trim();
  if (!task) throw new JobError("I need to know what the job is.");
  if (task.length > MAX_TASK_CHARS) throw new JobError(`That's too long (max ${MAX_TASK_CHARS} characters).`);

  const now = input.now();
  const recent = await store.countJobsSince(person.phone, new Date(now.getTime() - 3600_000).toISOString());
  if (recent >= MAX_JOBS_PER_HOUR) throw new JobError(`You've reached the limit of ${MAX_JOBS_PER_HOUR} jobs per hour. Try again later.`);

  let job = await store.createJob({
    jobId: newJobId(),
    status: "starting",
    permission: input.permission,
    task,
    requestedBy: person.phone,
    requesterName: person.name,
    channel: input.channel,
    createdAt: now.toISOString(),
  });

  const fetchImpl = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(config.routine.fireUrl!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.routine.token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: firePayload(job) }),
    });
  } catch (err) {
    await store.updateJob(job, { status: "failed", result: "Could not reach the routine." });
    throw new JobError("I couldn't reach Claude to start the job.");
  }
  const body = (await res.json().catch(() => ({}))) as {
    claude_code_session_url?: string;
    error?: { type?: string; message?: string };
  };
  if (!res.ok) {
    const reason = `${res.status} ${body.error?.type ?? ""}`.trim();
    logEvent("job_fire_failed", { jobId: job.jobId, reason });
    await store.updateJob(job, { status: "failed", result: `Routine refused to start (${reason}).` });
    throw new JobError(res.status === 429 ? "Claude is busy (too many jobs this hour). Try again later." : "Claude didn't accept the job.");
  }

  job = await store.updateJob(job, { status: "running", sessionUrl: body.claude_code_session_url ?? "" });
  logEvent("job_started", { jobId: job.jobId, permission: job.permission });
  return job;
}
