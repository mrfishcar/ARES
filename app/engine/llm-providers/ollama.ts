/**
 * Ollama LLM Provider
 *
 * Local LLM inference (free, private, offline)
 * Requires: Ollama installed on user's machine or server
 * Install: https://ollama.com
 *
 * Best for:
 * - Desktop applications
 * - Self-hosted deployments
 * - Privacy-sensitive use cases
 */

import type {
  LLMProvider,
  LLMMessage,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMProviderConfig
} from './base';
import { LLMProviderError } from './base';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  format?: 'json';
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  format?: 'json';
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(private config: LLMProviderConfig) {
    if (!config.ollamaUrl) {
      config.ollamaUrl = 'http://localhost:11434';
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: 'GET',
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
    const available = await this.isAvailable();
    if (!available) {
      throw new LLMProviderError(
        'ollama',
        `Ollama not available at ${this.config.ollamaUrl}. Install from https://ollama.com`
      );
    }

    const model = options?.model || this.config.defaultModel || 'llama3.1';

    const requestBody: OllamaGenerateRequest = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.3,
        num_predict: options?.maxTokens
      }
    };

    if (options?.systemPrompt) {
      requestBody.system = options.systemPrompt;
    }

    if (options?.format === 'json') {
      requestBody.format = 'json';
    }

    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 60000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaGenerateResponse;

      return {
        text: data.response,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        model: data.model,
        provider: this.name
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError('ollama', `Request timed out after ${this.config.timeout}ms`);
      }
      throw new LLMProviderError('ollama', `Generation failed: ${error}`);
    }
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new LLMProviderError(
        'ollama',
        `Ollama not available at ${this.config.ollamaUrl}. Install from https://ollama.com`
      );
    }

    const model = options?.model || this.config.defaultModel || 'llama3.1';

    const requestBody: OllamaChatRequest = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.3,
        num_predict: options?.maxTokens
      }
    };

    if (options?.format === 'json') {
      requestBody.format = 'json';
    }

    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 60000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaChatResponse;

      return {
        text: data.message.content,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        model: data.model,
        provider: this.name
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError('ollama', `Request timed out after ${this.config.timeout}ms`);
      }
      throw new LLMProviderError('ollama', `Chat failed: ${error}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map(m => m.name);
    } catch (error) {
      throw new LLMProviderError('ollama', `Failed to list models: ${error}`);
    }
  }
}
