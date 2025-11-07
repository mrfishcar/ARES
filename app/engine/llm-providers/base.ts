/**
 * LLM Provider Abstraction
 *
 * Supports multiple LLM backends:
 * - Ollama (local, free)
 * - OpenAI (cloud, paid)
 * - Anthropic Claude (cloud, paid)
 * - Custom endpoints
 *
 * This abstraction allows ARES to work in:
 * - Desktop apps (use Ollama)
 * - Web apps (use cloud APIs)
 * - Self-hosted deployments (Ollama on server)
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  format?: 'json' | 'text';
  systemPrompt?: string;
}

export interface LLMGenerateResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

/**
 * Base interface for LLM providers
 */
export interface LLMProvider {
  readonly name: string;  // 'ollama', 'openai', 'anthropic', etc.

  /**
   * Check if provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate completion from prompt
   */
  generate(
    prompt: string,
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult>;

  /**
   * Generate completion from chat messages
   */
  chat(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult>;

  /**
   * Get list of available models
   */
  listModels(): Promise<string[]>;
}

/**
 * Error thrown when provider is unavailable
 */
export class LLMProviderError extends Error {
  constructor(
    public provider: string,
    message: string
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'LLMProviderError';
  }
}

/**
 * Configuration for LLM provider
 */
export interface LLMProviderConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'custom';

  // Ollama config
  ollamaUrl?: string;  // Default: http://localhost:11434

  // OpenAI config
  openaiApiKey?: string;
  openaiOrgId?: string;

  // Anthropic config
  anthropicApiKey?: string;

  // Custom endpoint
  customUrl?: string;
  customHeaders?: Record<string, string>;

  // General
  defaultModel?: string;
  timeout?: number;  // milliseconds
}

/**
 * Default configurations
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<string, Partial<LLMProviderConfig>> = {
  ollama: {
    provider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    timeout: 60000
  },
  openai: {
    provider: 'openai',
    defaultModel: 'gpt-4o-mini',
    timeout: 30000
  },
  anthropic: {
    provider: 'anthropic',
    defaultModel: 'claude-3-haiku-20240307',
    timeout: 30000
  }
};
