/**
 * Local LLM Extraction Configuration
 *
 * Configure custom entity types for LOCAL LLM-based extraction (Ollama).
 * This file is optional - if not configured, system uses spaCy only.
 *
 * Requirements:
 * - Ollama installed (ollama.com)
 * - Model downloaded (ollama pull llama3.1)
 */

import type { EntityTypeDefinition } from './llm-extractor';

/**
 * LLM extraction configuration
 */
export interface LLMConfig {
  enabled: boolean;           // Enable LLM extraction (default: false)
  model?: string;             // Ollama model to use (default: llama3.1)
  host?: string;              // Ollama host (default: http://127.0.0.1:11434)
  customEntityTypes: EntityTypeDefinition[];  // Custom entity types to extract
}

/**
 * Default configuration (LLM disabled)
 */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  enabled: false,
  model: 'llama3.1',
  host: 'http://127.0.0.1:11434',
  customEntityTypes: []
};

/**
 * Example: Harry Potter corpus configuration
 */
export const HARRY_POTTER_CONFIG: LLMConfig = {
  enabled: true,
  model: 'llama3.1',
  customEntityTypes: [
    {
      type: 'SPELL',
      description: 'magical spells, charms, hexes, and curses',
      examples: [
        'Expelliarmus',
        'Patronus',
        'Lumos',
        'Wingardium Leviosa',
        'Avada Kedavra',
        'Crucio',
        'Stupefy'
      ]
    },
    {
      type: 'HOUSE',
      description: 'Hogwarts houses',
      examples: [
        'Gryffindor',
        'Slytherin',
        'Hufflepuff',
        'Ravenclaw'
      ]
    },
    {
      type: 'CREATURE',
      description: 'magical creatures and beasts',
      examples: [
        'Dementor',
        'Hippogriff',
        'Basilisk',
        'Phoenix',
        'Dragon'
      ]
    }
  ]
};

/**
 * Example: Lord of the Rings corpus configuration
 */
export const LOTR_CONFIG: LLMConfig = {
  enabled: true,
  model: 'llama3.1',
  customEntityTypes: [
    {
      type: 'RACE',
      description: 'races and peoples of Middle-earth',
      examples: [
        'Hobbit',
        'Elf',
        'Dwarf',
        'Wizard',
        'Istari',
        'Ent',
        'Orc'
      ]
    },
    {
      type: 'REALM',
      description: 'kingdoms and realms',
      examples: [
        'Gondor',
        'Rohan',
        'Mordor',
        'Shire',
        'Rivendell',
        'Lothlorien'
      ]
    },
    {
      type: 'ARTIFACT',
      description: 'legendary items and artifacts',
      examples: [
        'One Ring',
        'Sting',
        'Anduril',
        'Glamdring',
        'Palantir'
      ]
    }
  ]
};

/**
 * Example: Biblical text configuration
 */
export const BIBLICAL_CONFIG: LLMConfig = {
  enabled: true,
  model: 'llama3.1',
  customEntityTypes: [
    {
      type: 'TRIBE',
      description: 'tribes and nations of Israel',
      examples: [
        'Judah',
        'Benjamin',
        'Ephraim',
        'Manasseh',
        'Levite'
      ]
    },
    {
      type: 'TITLE',
      description: 'religious and royal titles',
      examples: [
        'Priest',
        'Prophet',
        'King',
        'Judge',
        'Apostle'
      ]
    }
  ]
};

/**
 * Get LLM config from environment or use default
 *
 * Usage:
 * ```typescript
 * // Default (disabled)
 * const config = getLLMConfig();
 *
 * // With custom config
 * const config = getLLMConfig(HARRY_POTTER_CONFIG);
 *
 * // Override with env var
 * process.env.ARES_LLM_ENABLED = '1';
 * const config = getLLMConfig(); // enabled=true
 * ```
 */
export function getLLMConfig(baseConfig: LLMConfig = DEFAULT_LLM_CONFIG): LLMConfig {
  const envEnabled = process.env.ARES_LLM_ENABLED === '1' ||
                     process.env.ARES_LLM_ENABLED === 'true';

  const envModel = process.env.ARES_LLM_MODEL;
  const envHost = process.env.ARES_LLM_HOST;

  return {
    ...baseConfig,
    enabled: envEnabled || baseConfig.enabled,
    model: envModel || baseConfig.model || 'llama3.1',
    host: envHost || baseConfig.host || 'http://127.0.0.1:11434'
  };
}

/**
 * Validate LLM config
 */
export function validateLLMConfig(config: LLMConfig): { valid: boolean; error?: string } {
  if (!config.enabled) {
    return { valid: true }; // Disabled config is always valid
  }

  if (config.customEntityTypes.length === 0) {
    return {
      valid: false,
      error: 'LLM enabled but no custom entity types configured'
    };
  }

  if (!config.model || config.model.trim() === '') {
    return {
      valid: false,
      error: 'LLM enabled but no model specified'
    };
  }

  // Validate entity type definitions
  for (const et of config.customEntityTypes) {
    if (!et.type || et.type.trim() === '') {
      return { valid: false, error: `Entity type has empty name` };
    }

    if (!et.description || et.description.trim() === '') {
      return { valid: false, error: `Entity type "${et.type}" has no description` };
    }

    if (!et.examples || et.examples.length < 2) {
      return {
        valid: false,
        error: `Entity type "${et.type}" needs at least 2 examples (3-5 recommended)`
      };
    }
  }

  return { valid: true };
}
