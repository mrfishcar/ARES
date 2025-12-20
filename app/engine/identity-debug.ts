// DEBUG_IDENTITY: Structured logging helper for identity debug runs.

export function logDebugIdentity(
  runId: string | undefined,
  stage: string,
  data: Record<string, unknown>
): void {
  if (!runId) return;
  // Single-line JSON for easy parsing
  console.log(JSON.stringify({
    msg: 'DEBUG_IDENTITY',
    stage,
    runId,
    ...data,
  }));
}
