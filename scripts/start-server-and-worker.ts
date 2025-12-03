/**
 * Railway startup script - runs GraphQL server + background job worker
 * Version: 2025-12-03-v4 - Force fresh deployment
 */

import { startGraphQLServer } from '../app/api/graphql';
import { listQueuedJobs, updateJobStatus, getJob } from '../app/jobs/job-store';
import { runExtractionJob } from '../app/jobs/extraction-runner';

// Global error handlers - register FIRST before anything else
process.on('unhandledRejection', (reason: any) => {
  console.error('💥 UNHANDLED REJECTION IN WORKER SCRIPT:', reason);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
});

process.on('uncaughtException', (err: any) => {
  console.error('💥 UNCAUGHT EXCEPTION IN WORKER SCRIPT:', err);
  console.error('Message:', err?.message);
  console.error('Stack:', err?.stack);
});

const PORT = parseInt(process.env.PORT || '4000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.JOB_WORKER_INTERVAL_MS || '3000', 10);
const MAX_BATCH = parseInt(process.env.JOB_WORKER_BATCH || '1', 10);

// Store startup logs for debugging via HTTP endpoint
const startupLogs: string[] = [];
function logStartup(message: string) {
  const timestamped = `[${new Date().toISOString()}] ${message}`;
  console.log(timestamped);
  startupLogs.push(timestamped);
}
(global as any).getStartupLogs = () => startupLogs;

async function processQueuedJobs() {
  console.log('[worker] Checking for queued jobs...');
  const queued = await listQueuedJobs(MAX_BATCH);
  console.log(`[worker] Found ${queued.length} queued job(s)`);

  if (!queued.length) {
    return;
  }

  for (const job of queued) {
    console.log(`[worker] ⚡ Starting job ${job.id}, inputType=${job.inputType}, textLength=${job.inputRef?.length || 0}`);
    await updateJobStatus(job.id, 'running');

    try {
      const latest = await getJob(job.id);
      if (!latest) {
        console.warn(`[worker] ⚠️  Job ${job.id} disappeared`);
        continue;
      }

      if (latest.inputType !== 'rawText') {
        throw new Error(`Unsupported inputType ${latest.inputType}`);
      }

      console.log(`[worker] 🔄 Processing extraction for job ${job.id}...`);
      const result = await runExtractionJob(job.id, latest.inputRef);
      console.log(`[worker] ✅ Extraction complete for job ${job.id}: ${result.entities.length} entities, ${result.relations.length} relations`);

      await updateJobStatus(job.id, 'done', { resultJson: JSON.stringify(result) });
      console.log(`[worker] ✅ Job ${job.id} marked as DONE`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] ❌ Job ${job.id} failed: ${message}`);
      console.error(`[worker] Error stack:`, error);
      await updateJobStatus(job.id, 'failed', { errorMessage: message });
    }
  }
}

async function startWorker() {
  console.log(`[worker] 🚀 Worker starting - will poll every ${POLL_INTERVAL_MS}ms`);

  // Set global flag for health check
  (global as any).workerRunning = true;

  // Initial poll immediately
  console.log('[worker] Running initial job check...');
  try {
    await processQueuedJobs();
  } catch (error) {
    console.error('[worker] Error in initial poll:', error);
  }

  // Run worker loop in background
  setInterval(async () => {
    try {
      await processQueuedJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] ⚠️  Unexpected error in poll cycle: ${message}`);
      console.error('[worker] Error details:', error);
    }
  }, POLL_INTERVAL_MS);

  console.log(`[worker] ✅ Worker polling loop established`);
}

async function main() {
  logStartup('[startup] 🚀 Starting ARES backend...');
  logStartup(`[startup] PORT=${PORT}, POLL_INTERVAL=${POLL_INTERVAL_MS}ms`);

  // Start GraphQL server
  logStartup(`[startup] 📡 Starting GraphQL server on port ${PORT}...`);
  try {
    await startGraphQLServer(PORT);
    logStartup('[startup] ✅ GraphQL server started successfully');
  } catch (error) {
    const msg = `[startup] ❌ Failed to start GraphQL server: ${error}`;
    logStartup(msg);
    console.error(error);
    throw error;
  }

  // Start background job worker in the same process
  logStartup('[startup] 🔧 Starting background job worker...');
  try {
    await startWorker();
    logStartup('[startup] ✅ Worker started successfully');
  } catch (error) {
    const msg = `[startup] ❌ Failed to start worker: ${error}`;
    logStartup(msg);
    console.error(error);
    throw error;
  }

  logStartup('[startup] ✅ Server and worker both started successfully');
  logStartup('[startup] 🎉 ARES backend is ready!');
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
