/** Minimal persistent job queue (heavy tools run one at a time to bound CPU/RAM). */
import crypto from 'node:crypto';

export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export interface Job {
  id: string;
  type: string;
  target: string;
  label: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  log: string[];
}

const MAX_LOG = 4000;
const jobs = new Map<string, Job>();
const queue: { job: Job; run: (j: Job, ctl: AbortController) => Promise<void> }[] = [];
const controllers = new Map<string, AbortController>();
let running = 0;
const CONCURRENCY = Math.max(1, Number(process.env.APPXRAY_JOBS ?? 1));

export function log(job: Job, line: string) {
  job.log.push(line.length > 2000 ? line.slice(0, 2000) + '…' : line);
  if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
}

export function enqueue(type: string, target: string, label: string, run: (j: Job, ctl: AbortController) => Promise<void>): Job {
  const job: Job = { id: crypto.randomBytes(6).toString('hex'), type, target, label, status: 'queued', createdAt: new Date().toISOString(), log: [] };
  jobs.set(job.id, job);
  queue.push({ job, run });
  pump();
  return job;
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const { job, run } = queue.shift()!;
    if (job.status === 'cancelled') continue;
    running++;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    const ctl = new AbortController();
    controllers.set(job.id, ctl);
    run(job, ctl)
      .then(() => {
        if (job.status === 'running') job.status = 'success';
      })
      .catch((e: Error) => {
        job.status = ctl.signal.aborted ? 'cancelled' : 'failed';
        job.error = e.message;
        log(job, `✖ ${e.message}`);
      })
      .finally(() => {
        job.endedAt = new Date().toISOString();
        controllers.delete(job.id);
        running--;
        pump();
      });
  }
}

export function getJob(id: string) {
  return jobs.get(id);
}
export function listJobs(filter?: (j: Job) => boolean) {
  return [...jobs.values()].filter(filter ?? (() => true)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function cancelJob(id: string) {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === 'queued') j.status = 'cancelled';
  controllers.get(id)?.abort();
  return true;
}
export function cancelFor(target: string) {
  for (const j of jobs.values()) if (j.target === target && (j.status === 'queued' || j.status === 'running')) cancelJob(j.id);
}
