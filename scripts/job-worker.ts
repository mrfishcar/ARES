import { listQueuedJobs, updateJobStatus, getJob } from '../app/jobs/job-store';
import { runExtractionJob } from '../app/jobs/extraction-runner';

const POLL_INTERVAL_MS = parseInt(process.env.JOB_WORKER_INTERVAL_MS || '3000', 10);
const MAX_BATCH = parseInt(process.env.JOB_WORKER_BATCH || '1', 10);

async function processQueuedJobs() {
  const queued = await listQueuedJobs(MAX_BATCH);
  if (!queued.length) {
    return;
  }

  for (const job of queued) {
    console.log(`[worker] starting job ${job.id}`);
    await updateJobStatus(job.id, 'running');

    try {
      const latest = await getJob(job.id);
      if (!latest) {
        console.warn(`[worker] job ${job.id} disappeared`);
        continue;
      }

      if (latest.inputType !== 'rawText') {
        throw new Error(`Unsupported inputType ${latest.inputType}`);
      }

      const result = await runExtractionJob(job.id, latest.inputRef);
      await updateJobStatus(job.id, 'done', { resultJson: JSON.stringify(result) });
      console.log(`[worker] finished job ${job.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] job ${job.id} failed: ${message}`);
      await updateJobStatus(job.id, 'failed', { errorMessage: message });
    }
  }
}

async function startWorker() {
  console.log(`[worker] polling every ${POLL_INTERVAL_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await processQueuedJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] unexpected error: ${message}`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

startWorker().catch(err => {
  console.error('[worker] fatal error', err);
  process.exit(1);
});
