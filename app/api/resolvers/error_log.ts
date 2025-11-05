/**
 * Client Error Log Resolvers
 * Captures UI errors for later debugging by appending to a log file.
 */

import * as fs from 'fs';
import * as path from 'path';

interface LogClientErrorArgs {
  project: string;
  input: {
    message: string;
    stack?: string | null;
    component?: string | null;
    url?: string | null;
    userAgent?: string | null;
    extra?: any;
  };
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'client-errors.log');

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', 'utf-8');
  }
}

function safeSerialize(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ error: 'Failed to serialize value', originalType: typeof value });
  }
}

export const errorLogResolvers = {
  Mutation: {
    logClientError: (_: any, args: LogClientErrorArgs) => {
      const { project, input } = args;

      ensureLogFile();

      const entry = {
        timestamp: new Date().toISOString(),
        project,
        message: input.message,
        stack: input.stack,
        component: input.component,
        url: input.url,
        userAgent: input.userAgent,
        extra: input.extra,
      };

      try {
        fs.appendFileSync(LOG_FILE, `${safeSerialize(entry)}\n`, 'utf-8');
        return true;
      } catch (error) {
        console.error('Failed to write client error log:', error);
        return false;
      }
    },
  },
};
