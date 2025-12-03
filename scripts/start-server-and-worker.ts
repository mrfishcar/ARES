/**
 * Railway startup script - runs GraphQL server + background job worker
 */

import { startGraphQLServer } from '../app/api/graphql';
import { listQueuedJobs, updateJobStatus, getJob } from '../app/jobs/job-store';
import { runExtractionJob } from '../app/jobs/extraction-runner';

const PORT = parseInt(process.env.PORT || '4000', 10);
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

  // Set global flag for health check
  (global as any).workerRunning = true;

  // Run worker loop in background
  setInterval(async () => {
    try {
      await processQueuedJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] unexpected error: ${message}`);
    }
  }, POLL_INTERVAL_MS);
}

async function main() {
  console.log('[startup] Starting ARES backend...');

  // Start GraphQL server
  console.log(`[startup] Starting GraphQL server on port ${PORT}...`);
  await startGraphQLServer(PORT);

  // Start background job worker in the same process
  console.log('[startup] Starting background job worker...');
  await startWorker();

  console.log('[startup] ✅ Server and worker started successfully');
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
