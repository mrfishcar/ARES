import { describe, expect, it, vi } from 'vitest';
import { runBookNlpProxy } from '../app/api/booknlp-proxy';

const baseConfig = {
  serviceUrl: 'http://localhost:8100',
  maxChars: 50000,
  timeoutMs: 1000
};

describe('runBookNlpProxy', () => {
  it('rejects oversized text', async () => {
    const text = 'a'.repeat(50001);
    const result = await runBookNlpProxy(text, baseConfig);
    expect(result.status).toBe(413);
    expect(result.body).toContain('text too long');
  });

  it('returns 502 when service is unreachable', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;

    const result = await runBookNlpProxy('hello', baseConfig, failingFetch);
    expect(result.status).toBe(502);
    expect(result.body).toContain('unreachable');
  });

  it('passes through JSON when service responds ok', async () => {
    const payload = { ok: true };
    const okFetch = vi.fn(async () => {
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as typeof fetch;

    const result = await runBookNlpProxy('hello', baseConfig, okFetch);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual(payload);
  });
});
