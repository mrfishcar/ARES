/**
 * Pipeline Configuration Loader
 * Reads config/pipeline.json with sane fallbacks
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ConfidenceConfig {
  ACCEPT: number;
  REVIEW: number;
}

export interface WatchConfig {
  intervalMs: number;
  rebuildDebounceMs: number;
  incomingDir: string;
}

export interface PipelineConfig {
  confidence: ConfidenceConfig;
  watch: WatchConfig;
}

const DEFAULT_CONFIG: PipelineConfig = {
  confidence: {
    ACCEPT: 0.7,
    REVIEW: 0.4
  },
  watch: {
    intervalMs: 3000,
    rebuildDebounceMs: 5000,
    incomingDir: './incoming'
  }
};

let cachedConfig: PipelineConfig | null = null;

/**
 * Load pipeline configuration from config/pipeline.json
 * Falls back to defaults if file not found or invalid
 */
export function loadConfig(): PipelineConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(process.cwd(), 'config', 'pipeline.json');

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Merge with defaults to handle partial configs
      cachedConfig = {
        confidence: {
          ACCEPT: parsed.confidence?.ACCEPT ?? DEFAULT_CONFIG.confidence.ACCEPT,
          REVIEW: parsed.confidence?.REVIEW ?? DEFAULT_CONFIG.confidence.REVIEW
        },
        watch: {
          intervalMs: parsed.watch?.intervalMs ?? DEFAULT_CONFIG.watch.intervalMs,
          rebuildDebounceMs: parsed.watch?.rebuildDebounceMs ?? DEFAULT_CONFIG.watch.rebuildDebounceMs,
          incomingDir: parsed.watch?.incomingDir ?? DEFAULT_CONFIG.watch.incomingDir
        }
      };

      return cachedConfig;
    }
  } catch (error) {
    console.warn('Failed to load config/pipeline.json, using defaults:', error instanceof Error ? error.message : error);
  }

  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

/**
 * Clear cached config (useful for tests)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
