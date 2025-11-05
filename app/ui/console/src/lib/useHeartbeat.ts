/**
 * Heartbeat Hook - Sprint R5
 * Polls GraphQL endpoint every 2s to check connectivity
 */

import { useState, useEffect } from 'react';

interface HeartbeatState {
  isAlive: boolean;
  lastPing: Date | null;
  error: string | null;
}

const HEARTBEAT_QUERY = `
  query Heartbeat {
    __typename
  }
`;

export function useHeartbeat(intervalMs: number = 2000): HeartbeatState {
  const [state, setState] = useState<HeartbeatState>({
    isAlive: false,
    lastPing: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    const ping = async () => {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: HEARTBEAT_QUERY }),
        });

        if (!isMounted) return;

        if (response.ok) {
          setState({
            isAlive: true,
            lastPing: new Date(),
            error: null,
          });
        } else {
          setState({
            isAlive: false,
            lastPing: null,
            error: `HTTP ${response.status}`,
          });
        }
      } catch (error) {
        if (!isMounted) return;

        setState({
          isAlive: false,
          lastPing: null,
          error: error instanceof Error ? error.message : 'Network error',
        });
      }
    };

    // Immediate first ping
    ping();

    // Set up interval
    const interval = setInterval(ping, intervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return state;
}
