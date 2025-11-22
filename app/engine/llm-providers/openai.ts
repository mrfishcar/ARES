/**
 * OpenAI LLM Provider
 *
 * Cloud-based LLM inference (paid, fast, high quality)
 * Requires: OpenAI API key
 * Get key: https://platform.openai.com/api-keys
 *
 * Best for:
 * - Web applications
 * - Production deployments
 * - Users without local GPU
 *
 * Cost: ~$0.01-0.10 per document (depending on model)
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMProviderConfig
} from './base';
import { LLMProviderError } from './base';

interface OpenAICompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

interface OpenAICompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(private config: LLMProviderConfig) {
    if (!config.openaiApiKey) {
      throw new LLMProviderError(
        'openai',
        'OpenAI API key required. Set openaiApiKey in config or OPENAI_API_KEY env var.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async generate(
    prompt: string,
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult> {
    const messages: LLMMessage[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    return this.chat(messages, options);
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new LLMProviderError(
        'openai',
        'OpenAI API not available. Check API key and network connection.'
      );
    }

    const model = options?.model || this.config.defaultModel || 'gpt-4o-mini';

    const requestBody: OpenAICompletionRequest = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens
    };

    if (options?.format === 'json') {
      requestBody.response_format = { type: 'json_object' };
      // Ensure system message instructs JSON output
      if (!messages.some(m => m.role === 'system')) {
        requestBody.messages.unshift({
          role: 'system',
          content: 'You are a helpful assistant. Always respond with valid JSON.'
        });
      }
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
          ...(this.config.openaiOrgId && { 'OpenAI-Organization': this.config.openaiOrgId })
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const parsedError =
          typeof errorData === 'object' && errorData !== null
            ? (errorData as { error?: { message?: string } })
            : undefined;
        throw new Error(
          `HTTP ${response.status}: ${parsedError?.error?.message || response.statusText}`
        );
      }

      const data = await response.json() as OpenAICompletionResponse;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No completion returned from OpenAI');
      }

      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        },
        model: data.model,
        provider: this.name
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError('openai', `Request timed out after ${this.config.timeout}ms`);
      }
      throw new LLMProviderError('openai', `Chat failed: ${error}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-'));  // Only GPT models
    } catch (error) {
      throw new LLMProviderError('openai', `Failed to list models: ${error}`);
    }
  }
}
