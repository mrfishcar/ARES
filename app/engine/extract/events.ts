/**
 * Event Extraction
 * STUB - Will be implemented in Phase 4
 */

import type { Event } from "../schema";
import { logger } from '../../infra/logger';

export async function extractEvents(
  text: string,
  docId: string
): Promise<Event[]> {
  logger.debug({ msg: 'extractEvents: stub implementation', doc_id: docId });
  return [];
}
