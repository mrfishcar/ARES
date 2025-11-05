import type { ParseResponse } from "../engine/extract/parse-types";

export type ParseInput = { text: string };
export type ParseOutput = ParseResponse;

export interface ParserClient {
  parse(input: ParseInput): Promise<ParseOutput>;
}
