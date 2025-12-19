/**
 * DEBUG_IDENTITY: Minimal harness to run extraction with debugIdentity enabled
 * without starting the HTTP server. Outputs the debug block to stdout.
 */

import { appendDoc, clearStorage } from '../app/storage/storage';
import { buildIdentityDebugReport } from '../app/api/debug/identity-report';
import fs from 'fs';
import path from 'path';

async function main() {
  // Use fixture contract if BookNLP is unavailable in this environment.
  process.env.BOOKNLP_CONTRACT_PATH = process.env.BOOKNLP_CONTRACT_PATH
    || path.resolve(__dirname, '../tests/fixtures/booknlp/barty-excerpt-contract.json');

  const textPath = process.argv[2];
  const text = textPath && fs.existsSync(textPath)
    ? fs.readFileSync(textPath, 'utf-8')
    : 'Barty Beauregard met Barty at Barty\'s house. Preston saw Barty too.';

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = './tmp/debug-identity-storage.json';
  await clearStorage(tempPath);

  const appendResult = await appendDoc('debug-doc', text, tempPath, { debugIdentity: true, debugRunId: runId });
  const rawEntities = appendResult.localEntities?.length ? appendResult.localEntities : appendResult.entities;
  const debugBlock = buildIdentityDebugReport(rawEntities, appendResult.spans);

  console.log(JSON.stringify({ runId, debugBlock }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
