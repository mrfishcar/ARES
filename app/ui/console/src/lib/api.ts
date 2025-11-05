const GRAPHQL_URL = '/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
  }>;
}

async function executeGraphQL<T>(
  document: string,
  variables?: Record<string, any>
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: document, variables })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GraphQL request failed (${response.status}): ${body}`);
  }

  let json: GraphQLResponse<T>;
  try {
    json = (await response.json()) as GraphQLResponse<T>;
  } catch {
    throw new Error('Invalid JSON response from GraphQL endpoint');
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? 'Unknown GraphQL error');
  }

  if (!json.data) {
    throw new Error('GraphQL response is missing data');
  }

  return json.data;
}

export async function query<T>(
  queryString: string,
  variables?: Record<string, any>
): Promise<T> {
  return executeGraphQL<T>(queryString, variables);
}

export async function mutate<T>(
  mutationString: string,
  variables?: Record<string, any>
): Promise<T> {
  return executeGraphQL<T>(mutationString, variables);
}

/**
 * Fetch wiki file content via HTTP
 */
export async function fetchWikiFile(project: string, id: string): Promise<string> {
  try {
    const response = await fetch(`/wiki-file?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Wiki file not found');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch wiki file';
    throw new Error(message);
  }
}

/**
 * Fetch metrics from HTTP endpoint
 */
export async function fetchMetrics(): Promise<string> {
  try {
    const response = await fetch('/metrics');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch metrics';
    throw new Error(message);
  }
}

/**
 * Parse Prometheus metrics text into key-value pairs
 */
export function parseMetrics(metricsText: string): Record<string, number> {
  const lines = metricsText.split('\n');
  const metrics: Record<string, number> = {};

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }

    // Parse metric line (format: metric_name value)
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+([0-9.]+)$/);
    if (match) {
      const [, name, value] = match;
      metrics[name] = parseFloat(value);
    }
  }

  return metrics;
}
