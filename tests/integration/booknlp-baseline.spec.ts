import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractWithOptimalStrategy } from '../../app/engine/chunked-extraction';
import { DEFAULT_LLM_CONFIG } from '../../app/engine/llm-config';

function reconstructTextFromContract(contract: any): string {
  const length = contract?.metadata?.text_length || 0;
  const buffer = Array(Math.max(length, 0)).fill(' ');

  for (const token of contract.tokens || []) {
    const start = token.start_char ?? 0;
    const text = token.text || '';
    for (let i = 0; i < text.length; i++) {
      if (start + i < buffer.length) {
        buffer[start + i] = text[i];
      }
    }
  }

  return buffer.join('');
}

describe('BookNLP baseline integration', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/booknlp/barty-excerpt-contract.json');
  let originalContractPath: string | undefined;

  beforeAll(() => {
    originalContractPath = process.env.BOOKNLP_CONTRACT_PATH;
    process.env.BOOKNLP_CONTRACT_PATH = fixturePath;
  });

  afterAll(() => {
    if (originalContractPath === undefined) {
      delete process.env.BOOKNLP_CONTRACT_PATH;
    } else {
      process.env.BOOKNLP_CONTRACT_PATH = originalContractPath;
    }
  });

  it('returns BookNLP characters, quotes, and spans aligned to the excerpt', async () => {
    const contract = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const text = reconstructTextFromContract(contract);

    const result = await extractWithOptimalStrategy('barty-fixture', text, undefined, DEFAULT_LLM_CONFIG);

    expect(result.booknlp).toBeDefined();
    expect(result.booknlp?.entities.length || 0).toBeGreaterThanOrEqual(3);
    expect(result.booknlp?.quotes.length || 0).toBeGreaterThanOrEqual(1);
    expect(result.booknlp?.spans.length || 0).toBeGreaterThan(0);

    // Ensure BookNLP characters are present in the merged entity list
    expect(result.entities.some(e => (e as any).source === 'booknlp')).toBe(true);

    // Spans should align to the reconstructed text
    const span = result.booknlp!.spans[0];
    expect(text.slice(span.start, span.end)).toBe(span.text);

    // Quotes should map back to character IDs
    const quote = result.booknlp!.quotes[0];
    expect(quote.speaker_id).toBeTruthy();
  });
});
