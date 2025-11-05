import type { ParserClient, ParseInput, ParseOutput } from "./ParserClient";

export class HttpParserClient implements ParserClient {
  constructor(private readonly baseUrl: string) {}

  async parse(input: ParseInput): Promise<ParseOutput> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Parser HTTP ${response.status}${body ? `: ${body}` : ""}`);
    }

    return response.json() as Promise<ParseOutput>;
  }
}
