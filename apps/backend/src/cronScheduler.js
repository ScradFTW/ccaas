import { CronExpressionParser } from 'cron-parser';
import { execInContainer, collectStdoutUntilClose } from './dockerExec.js';
import { containerNameForUser, startUserContainer, ensureEgressProxy, ServerAtCapacityError } from './docker.js';
import { ensureAclFileForUser } from './squid.js';
import { getDueCronJobs, recordCronRun } from './db.js';
import { touch } from './activity.js';

const CHECK_INTERVAL_MS = 60 * 1000;

export function nextRunAtIso(cronExpr, fromDate = new Date()) {
  const interval = CronExpressionParser.parse(cronExpr, { currentDate: fromDate });
  return interval.next().toDate().toISOString();
}

async function runJob(job) {
  await ensureEgressProxy();
  await ensureAclFileForUser(job.user_id);

  try {
    await startUserContainer(job.user_id);
  } catch (err) {
    if (err instanceof ServerAtCapacityError) {
      // Leave next_run_at as-is; it's already <= now, so it'll be picked
      // up and retried on the next tick once a slot frees up.
      console.warn(`cron job ${job.id}: server at capacity, will retry next tick`);
      return;
    }
    throw err;
  }

  touch(job.user_id);

  const cmd = ['claude', '-p', job.prompt, '--output-format=json', '--dangerously-skip-permissions'];
  if (job.session_id) cmd.push('--resume', job.session_id);

  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(job.user_id), cmd);
  stream.end(); // one-shot prompt mode reads no stdin; close it so claude doesn't wait on it
  stderr.on('data', (c) => console.error(`cron job ${job.id} stderr:`, c.toString('utf8')));
  const output = await collectStdoutUntilClose(stream, stdout, stderr, 5 * 60 * 1000);

  let sessionId = job.session_id;
  let lastResult = output.trim();
  let lastIsError = true;
  try {
    const parsed = JSON.parse(output);
    sessionId = parsed.session_id || sessionId;
    lastResult = parsed.result ?? lastResult;
    lastIsError = Boolean(parsed.is_error);
  } catch {
    // Keep raw output as the result if it wasn't parseable JSON.
  }

  recordCronRun(job.id, {
    sessionId,
    nextRunAt: nextRunAtIso(job.cron_expr),
    lastResult,
    lastIsError,
  });
}

export function startCronScheduler() {
  setInterval(async () => {
    let due;
    try {
      due = getDueCronJobs(new Date().toISOString());
    } catch (err) {
      console.error('cron scheduler: failed to list due jobs', err);
      return;
    }

    // Run all due jobs concurrently rather than one at a time: each
    // runJob() can block for minutes (execInContainer's own timeout), and
    // a sequential `for` loop here meant one slow or misbehaving user's
    // job starved every other tenant's cron jobs from running at all until
    // it finished. Concurrency is still bounded -- startUserContainer's
    // own maxConcurrentContainers check throws ServerAtCapacityError once
    // the host is full, same as it does for interactive session starts.
    await Promise.allSettled(
      due.map(async (job) => {
        try {
          await runJob(job);
        } catch (err) {
          console.error(`cron job ${job.id} failed`, err);
          // Push next_run_at forward by one interval so a persistently
          // failing job doesn't spin every tick.
          try {
            recordCronRun(job.id, {
              sessionId: job.session_id,
              nextRunAt: nextRunAtIso(job.cron_expr),
              lastResult: String(err.message || err),
              lastIsError: true,
            });
          } catch (recordErr) {
            console.error(`cron job ${job.id}: failed to record failure`, recordErr);
          }
        }
      })
    );
  }, CHECK_INTERVAL_MS).unref();
}
