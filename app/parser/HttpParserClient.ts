import type { ParserClient, ParseInput, ParseOutput } from "./ParserClient";
import * as crypto from "crypto";

const getEnv = (key: string, defaultValue: string = ''): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
};

// Use much longer timeout for parsing (60 seconds for complex literary texts)
const PARSE_TIMEOUT_MS = Number(getEnv('PARSER_PARSE_TIMEOUT_MS', '60000'));

// Enable caching to avoid re-parsing identical text
const CACHE_ENABLED = getEnv('PARSER_CACHE_ENABLED', 'true') === 'true';
const CACHE_MAX_SIZE = Number(getEnv('PARSER_CACHE_MAX_SIZE', '1000'));

export class HttpParserClient implements ParserClient {
  private cache: Map<string, ParseOutput> = new Map();

  constructor(private readonly baseUrl: string) {}

  async parse(input: ParseInput): Promise<ParseOutput> {
    // Generate cache key from input text
    const cacheKey = CACHE_ENABLED ? this.getCacheKey(input.text) : null;

    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Create abort controller with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      console.error(`[HttpParserClient] Parse request timed out after ${PARSE_TIMEOUT_MS}ms`);
    }, PARSE_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Parser HTTP ${response.status}${body ? `: ${body}` : ""}`);
      }

      const output = await response.json() as ParseOutput;

      // Cache the result
      if (cacheKey) {
        // Implement LRU eviction: if cache is full, remove oldest entry
        if (this.cache.size >= CACHE_MAX_SIZE) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) {
            this.cache.delete(firstKey);
          }
        }
        this.cache.set(cacheKey, output);
      }

      return output;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Parser request aborted after ${PARSE_TIMEOUT_MS}ms timeout`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private getCacheKey(text: string): string {
    // Use fast hash for cache key
    return crypto.createHash('md5').update(text).digest('hex');
  }
}
