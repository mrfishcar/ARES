import type { ParserClient } from "./ParserClient";
import { createParserClient } from "./createClient";

let clientPromise: Promise<ParserClient> | null = null;

export function getParserClient(): Promise<ParserClient> {
  if (!clientPromise) {
    clientPromise = createParserClient();
  }
  return clientPromise;
}

export { createParserClient };
export type { ParserClient } from "./ParserClient";
