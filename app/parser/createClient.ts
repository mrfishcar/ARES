import { HttpParserClient } from "./HttpParserClient";
import { EmbeddedParserClient } from "./EmbeddedParserClient";
import { MockParserClient } from "./MockParserClient";
import type { ParserClient } from "./ParserClient";

// Browser-compatible env access
const getEnv = (key: string, defaultValue: string = ''): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
};

const DEFAULT_BASE_URL = getEnv('PARSER_URL', "http://127.0.0.1:8000");
const TIMEOUT_MS = Number(getEnv('PARSER_TIMEOUT_MS', '800'));

async function canReachHTTP(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/health`, {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function activate(client: ParserClient, backend: string): ParserClient {
  // Store backend info (skip in browser environment)
  if (typeof process !== 'undefined' && process.env) {
    process.env.PARSER_ACTIVE_BACKEND = backend;
  }
  return client;
}

function tryCreateEmbedded(): ParserClient | null {
  try {
    const client = new EmbeddedParserClient();
    return activate(client, "embedded");
  } catch {
    return null;
  }
}

export async function createParserClient(): Promise<ParserClient> {
  const preferred = getEnv('PARSER_BACKEND', '').toLowerCase();
  const baseUrl = getEnv('PARSER_URL', DEFAULT_BASE_URL);

  if (preferred === "mock") {
    return activate(new MockParserClient(), "mock");
  }

  if (preferred === "embedded") {
    const embedded = tryCreateEmbedded();
    if (embedded) return embedded;
    return activate(new MockParserClient(), "mock");
  }

  if (preferred === "http") {
    if (await canReachHTTP(baseUrl)) {
      return activate(new HttpParserClient(baseUrl), "http");
    }
    return activate(new MockParserClient(), "mock");
  }

  // AUTO: try HTTP → Embedded → Mock
  if (await canReachHTTP(baseUrl)) {
    return activate(new HttpParserClient(baseUrl), "http");
  }

  const embedded = tryCreateEmbedded();
  if (embedded) return embedded;

  return activate(new MockParserClient(), "mock");
}
