/**
 * Railway startup script - runs GraphQL server + background job worker
 */

import { spawn } from 'child_process';
import { startGraphQLServer } from '../app/api/graphql';

const PORT = parseInt(process.env.PORT || '4000', 10);

async function main() {
  console.log('[startup] Starting ARES backend...');

  // Start GraphQL server
  console.log(`[startup] Starting GraphQL server on port ${PORT}...`);
  startGraphQLServer(PORT).catch((err) => {
    console.error('[startup] GraphQL server failed:', err);
    process.exit(1);
  });

  // Give server a moment to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Start background job worker
  console.log('[startup] Starting background job worker...');
  const worker = spawn('npx', ['ts-node', 'scripts/job-worker.ts'], {
    stdio: 'inherit',
    env: process.env,
  });

  worker.on('error', (err) => {
    console.error('[startup] Worker process failed to start:', err);
  });

  worker.on('exit', (code) => {
    console.error(`[startup] Worker exited with code ${code}`);
    // Don't exit the main process - server can continue without worker
    // but log prominently
    console.error('[startup] ⚠️  WARNING: Background job worker is not running!');
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[startup] Received SIGTERM, shutting down...');
    worker.kill('SIGTERM');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('[startup] Received SIGINT, shutting down...');
    worker.kill('SIGINT');
    process.exit(0);
  });

  console.log('[startup] ✅ Server and worker started successfully');
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
