import type { ParserClient, ParseInput, ParseOutput } from "./ParserClient";

type EmbeddedParserFn = (text: string) => Promise<ParseOutput> | ParseOutput;

function loadEmbeddedParser(): EmbeddedParserFn {
  // Browser environment check - embedded parser only works in Node.js
  if (typeof process === 'undefined' || typeof require === 'undefined') {
    throw new Error('Embedded parser not available in browser environment');
  }

  const modulePath =
    process.env.PARSER_EMBEDDED_MODULE || "../embedded/parseText";

  try {
    // Use dynamic require to stay compatible with CommonJS output
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(modulePath);
    const fn: EmbeddedParserFn =
      typeof mod === "function"
        ? mod
        : typeof mod?.default === "function"
        ? mod.default
        : typeof mod?.parseText === "function"
        ? mod.parseText
        : null;

    if (!fn) {
      throw new Error(
        `Embedded parser module "${modulePath}" does not export a callable parser`
      );
    }

    return fn;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
    throw new Error(`Failed to load embedded parser: ${message}`);
  }
}

export class EmbeddedParserClient implements ParserClient {
  private readonly parser: EmbeddedParserFn;

  constructor() {
    this.parser = loadEmbeddedParser();
  }

  async parse(input: ParseInput): Promise<ParseOutput> {
    const result = await this.parser(input.text);
    return result;
  }
}
