import { mutate } from './api';

const LOG_CLIENT_ERROR = `
  mutation LogClientError($project: String!, $input: ClientErrorInput!) {
    logClientError(project: $project, input: $input)
  }
`;

const RECENT_ERROR_WINDOW_MS = 5_000;
const recentErrors = new Map<string, number>();

interface ClientErrorPayload {
  message: string;
  stack?: string;
  component?: string;
  url?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

function shouldLog(key: string): boolean {
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last && now - last < RECENT_ERROR_WINDOW_MS) {
    return false;
  }
  recentErrors.set(key, now);
  return true;
}

export async function logClientError(project: string, payload: ClientErrorPayload): Promise<void> {
  if (!project) return;

  const key = [payload.message, payload.component, payload.stack?.split('\n')[0]].filter(Boolean).join('|');
  if (!shouldLog(key)) return;

  try {
    await mutate(LOG_CLIENT_ERROR, {
      project,
      input: {
        message: payload.message,
        stack: payload.stack,
        component: payload.component,
        url: payload.url,
        userAgent: payload.userAgent,
        extra: payload.extra,
      },
    });
  } catch (error) {
    // Avoid throwing from logger; simply report in console for local debugging.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to send client error log:', error);
    }
  }
}

export function initializeClientErrorLogger(project: string) {
  const handler = (event: ErrorEvent) => {
    const stack = event.error instanceof Error ? event.error.stack : undefined;
    logClientError(project, {
      message: event.message || (event.error && String(event.error)) || 'Unknown error',
      stack,
      component: event.filename ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      extra: {
        type: 'error',
      },
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    let message = 'Unhandled promise rejection';
    let stack: string | undefined;

    if (event.reason instanceof Error) {
      message = event.reason.message;
      stack = event.reason.stack;
    } else if (typeof event.reason === 'string') {
      message = event.reason;
    } else {
      try {
        message = JSON.stringify(event.reason);
      } catch {
        message = String(event.reason);
      }
    }

    logClientError(project, {
      message,
      stack,
      component: 'unhandledrejection',
      url: window.location.href,
      userAgent: navigator.userAgent,
      extra: {
        type: 'unhandledrejection',
      },
    });
  };

  window.addEventListener('error', handler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    window.removeEventListener('error', handler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}

