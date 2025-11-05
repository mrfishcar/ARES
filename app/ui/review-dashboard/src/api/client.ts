/**
 * Minimal GraphQL Client
 */

const GRAPHQL_URL = '/graphql';

export async function query<T = any>(gql: string, variables?: Record<string, any>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables })
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

export async function mutate<T = any>(gql: string, variables?: Record<string, any>): Promise<T> {
  return query<T>(gql, variables);
}
