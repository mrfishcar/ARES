/**
 * Structured logging with pino
 */

import pino from 'pino';

export const logger = pino({
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['Authorization', 'Cookie', 'X-API-Key'],
    remove: true
  },
  base: null
});

/**
 * Create child logger with request_id
 */
export function withRequest(parentLogger: pino.Logger, requestId: string): pino.Logger {
  return parentLogger.child({ request_id: requestId });
}
