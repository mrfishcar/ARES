interface BookNlpProxyConfig {
  serviceUrl: string;
  maxChars: number;
  timeoutMs: number;
}

interface ProxyResult {
  status: number;
  body: string;
}

export async function runBookNlpProxy(
  text: string,
  config: BookNlpProxyConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ProxyResult> {
  if (!config.serviceUrl) {
    return {
      status: 500,
      body: JSON.stringify({ error: 'BOOKNLP_SERVICE_URL is not configured' })
    };
  }

  if (!text || typeof text !== 'string') {
    return {
      status: 400,
      body: JSON.stringify({ error: 'text is required' })
    };
  }

  if (text.length > config.maxChars) {
    return {
      status: 413,
      body: JSON.stringify({ error: `text too long; limit is ${config.maxChars} characters` })
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.serviceUrl}/booknlp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    const textBody = await response.text();
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: response.status, body: textBody };
    }

    return {
      status: 200,
      body: textBody
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 502,
      body: JSON.stringify({ error: `BookNLP service unreachable: ${message}` })
    };
  }
}
