export interface EntityDecisionFeatures {
  entityId?: string;
  text: string;              // canonical name or mention text
  candidateType?: string;    // PERSON/ORG/PLACE before filter
  finalType?: string;        // after filter
  features: Record<string, unknown>;
  reason?: string;           // human-readable decision summary
}

export function logEntityDecision(
  features: EntityDecisionFeatures
): void {
  if (process.env.DEBUG_ENTITY_DECISIONS !== 'true') return;

  // Keep this simple JSON so it can be grepped/parsed
  // You can route this through a logger if you have one.
  console.log('[ENTITY_DECISION]', JSON.stringify(features));
}
