/**
 * Local LLM-Based Entity Extraction (Phase 1 - Few-Shot Learning)
 *
 * Uses Ollama for LOCAL entity extraction (no cloud APIs, no token costs).
 *
 * Benefits:
 * - Add new entity types in minutes (vs hours of manual pattern coding)
 * - Domain-specific entities (SPELL, CREATURE, HOUSE, etc.)
 * - User-provided examples guide extraction
 * - Works offline, zero API cost, data stays local
 *
 * Requirements:
 * - Ollama installed locally (ollama.com)
 * - Model downloaded (e.g., llama3.1, mistral, phi3)
 */

import { Ollama } from 'ollama';
import { v4 as uuid } from 'uuid';
import type { Entity, EntityType } from './schema';

/**
 * Entity type definition with examples for few-shot prompting
 */
export interface EntityTypeDefinition {
  type: string;           // Entity type name (e.g., "SPELL", "CREATURE")
  description: string;    // What this entity type represents
  examples: string[];     // 3-5 example entities of this type
}

/**
 * LLM extraction result
 */
export interface LLMExtractionResult {
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
}

/**
 * Build few-shot prompt for entity extraction
 */
function buildFewShotPrompt(
  text: string,
  entityTypes: EntityTypeDefinition[]
): string {
  const examplesSection = entityTypes
    .map(et => {
      const exampleList = et.examples.map(ex => `  - ${ex}`).join('\n');
      return `**${et.type}** (${et.description}):\n${exampleList}`;
    })
    .join('\n\n');

  return `You are an entity extraction assistant. Extract entities of the following types from the text below.

Entity Types:
${examplesSection}

Instructions:
1. Find all entities matching these types
2. Return ONLY entities that clearly match the type definitions
3. For each entity, provide:
   - The exact text as it appears in the document
   - The character offset (start position)
   - The entity type
4. Return results as JSON array

Format:
[
  {"text": "entity name", "start": 0, "type": "TYPE"}
]

Text to analyze:
"""
${text}
"""

Extract entities (JSON only, no explanation):`;
}

/**
 * Parse LLM response into entities
 */
function parseLLMResponse(
  response: string,
  text: string
): Array<{ text: string; type: string; start: number }> {
  try {
    // Try to extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) ||
                      response.match(/(\[[\s\S]*\])/);

    if (!jsonMatch) {
      console.warn('[LLM-EXTRACTOR] No JSON found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[1]);

    if (!Array.isArray(parsed)) {
      console.warn('[LLM-EXTRACTOR] Response is not an array');
      return [];
    }

    // Validate and normalize entities
    const entities: Array<{ text: string; type: string; start: number }> = [];

    for (const item of parsed) {
      if (!item.text || !item.type) {
        continue;
      }

      // Verify entity actually exists in text
      let start = item.start;
      if (typeof start !== 'number' || start < 0) {
        // Try to find entity in text
        const idx = text.indexOf(item.text);
        if (idx === -1) {
          console.warn(`[LLM-EXTRACTOR] Entity "${item.text}" not found in text`);
          continue;
        }
        start = idx;
      }

      // Verify the text at that position matches
      const actualText = text.slice(start, start + item.text.length);
      if (actualText !== item.text) {
        // Try fuzzy match
        const idx = text.indexOf(item.text);
        if (idx !== -1) {
          start = idx;
        } else {
          console.warn(`[LLM-EXTRACTOR] Text mismatch at position ${start}: expected "${item.text}", found "${actualText}"`);
          continue;
        }
      }

      entities.push({
        text: item.text.trim(),
        type: item.type.toUpperCase(),
        start
      });
    }

    return entities;
  } catch (error) {
    console.error('[LLM-EXTRACTOR] Failed to parse LLM response:', error);
    console.error('[LLM-EXTRACTOR] Response:', response);
    return [];
  }
}

/**
 * Map custom entity types to ARES EntityType
 *
 * Custom types (SPELL, CREATURE, etc.) are mapped to closest ARES type
 * or stored as ITEM by default
 */
function mapToAresEntityType(customType: string): EntityType {
  const upper = customType.toUpperCase();

  // Direct mappings
  const directMappings: Record<string, EntityType> = {
    'PERSON': 'PERSON',
    'ORG': 'ORG',
    'ORGANIZATION': 'ORG',
    'PLACE': 'PLACE',
    'LOCATION': 'PLACE',
    'DATE': 'DATE',
    'TIME': 'DATE',
    'WORK': 'WORK',
    'ITEM': 'ITEM',
    'OBJECT': 'ITEM',
    'SPECIES': 'SPECIES',
    'CREATURE': 'SPECIES',
    'HOUSE': 'HOUSE',
    'TRIBE': 'TRIBE',
    'TITLE': 'TITLE',
    'EVENT': 'EVENT',

    // Custom mappings for common fiction types
    'SPELL': 'ITEM',      // Spells treated as magical items
    'POTION': 'ITEM',
    'ARTIFACT': 'ITEM',
    'WEAPON': 'ITEM',
    'TOOL': 'ITEM'
  };

  return directMappings[upper] || 'ITEM';
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    await ollama.list();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extract entities using local LLM (Ollama) with few-shot examples
 *
 * Example usage:
 * ```typescript
 * const result = await extractEntitiesWithLLM(
 *   "Hermione cast Expelliarmus. Harry used Patronus charm.",
 *   [
 *     {
 *       type: 'SPELL',
 *       description: 'magical spells and charms',
 *       examples: ['Expelliarmus', 'Patronus', 'Lumos', 'Wingardium Leviosa']
 *     }
 *   ],
 *   'llama3.1'
 * );
 * // Returns: [{ text: 'Expelliarmus', type: 'ITEM' }, { text: 'Patronus', type: 'ITEM' }]
 * ```
 */
export async function extractEntitiesWithLLM(
  text: string,
  entityTypes: EntityTypeDefinition[],
  model: string = 'llama3.1',
  options: {
    host?: string;
    temperature?: number;
  } = {}
): Promise<LLMExtractionResult> {
  const {
    host = 'http://127.0.0.1:11434',
    temperature = 0.0  // Deterministic for extraction
  } = options;

  // Check if Ollama is available
  const ollama = new Ollama({ host });

  try {
    // Verify model is available
    const models = await ollama.list();
    const modelAvailable = models.models.some(m => m.name.includes(model));

    if (!modelAvailable) {
      throw new Error(
        `Model "${model}" not found. Download with: ollama pull ${model}`
      );
    }
  } catch (error) {
    throw new Error(
      `Ollama not available at ${host}. Install from ollama.com and run: ollama serve`
    );
  }

  // Build few-shot prompt
  const prompt = buildFewShotPrompt(text, entityTypes);

  // Call Ollama API (local)
  const response = await ollama.generate({
    model,
    prompt,
    stream: false,
    options: {
      temperature,
      num_predict: 2000  // Max tokens for output
    }
  });

  // Parse response
  const rawEntities = parseLLMResponse(response.response, text);

  // Convert to ARES Entity format
  const entities: Entity[] = [];
  const spans: Array<{ entity_id: string; start: number; end: number }> = [];
  const now = new Date().toISOString();

  for (const raw of rawEntities) {
    const id = uuid();
    const aresType = mapToAresEntityType(raw.type);

    entities.push({
      id,
      type: aresType,
      canonical: raw.text,
      aliases: [],
      created_at: now,
      centrality: 1  // Default centrality
    });

    spans.push({
      entity_id: id,
      start: raw.start,
      end: raw.start + raw.text.length
    });
  }

  return {
    entities,
    spans
  };
}

/**
 * Hybrid extraction: Combine spaCy (standard entities) + LLM (custom entities)
 *
 * Strategy:
 * 1. Extract standard entities with spaCy (PERSON, ORG, PLACE)
 * 2. Extract custom entities with local LLM (SPELL, CREATURE, etc.)
 * 3. Deduplicate by (type, text)
 * 4. Return merged results
 *
 * Benefits:
 * - Fast for standard entities (spaCy)
 * - Flexible for custom entities (local LLM)
 * - Zero API cost, works offline
 */
export async function hybridExtraction(
  text: string,
  customEntityTypes: EntityTypeDefinition[],
  spacyExtractor: (text: string) => Promise<{
    entities: Entity[];
    spans: Array<{ entity_id: string; start: number; end: number }>;
  }>,
  model: string = 'llama3.1'
): Promise<{
  entities: Entity[];
  spans: Array<{ entity_id: string; start: number; end: number }>;
}> {
  // Extract standard entities with spaCy
  const spacyResults = await spacyExtractor(text);

  // If no custom types, return spaCy results only
  if (customEntityTypes.length === 0) {
    return spacyResults;
  }

  // Extract custom entities with local LLM
  const llmResults = await extractEntitiesWithLLM(text, customEntityTypes, model);

  // Merge results (deduplicate by canonical name)
  const entityMap = new Map<string, Entity>();
  const spanMap = new Map<string, Array<{ entity_id: string; start: number; end: number }>>();

  // Add spaCy entities
  for (const entity of spacyResults.entities) {
    const key = `${entity.type}:${entity.canonical.toLowerCase()}`;
    entityMap.set(key, entity);
    spanMap.set(entity.id,
      spacyResults.spans.filter(s => s.entity_id === entity.id)
    );
  }

  // Add LLM entities (avoid duplicates)
  for (const entity of llmResults.entities) {
    const key = `${entity.type}:${entity.canonical.toLowerCase()}`;

    if (!entityMap.has(key)) {
      entityMap.set(key, entity);
      spanMap.set(entity.id,
        llmResults.spans.filter(s => s.entity_id === entity.id)
      );
    }
  }

  // Flatten results
  const entities = Array.from(entityMap.values());
  const spans = Array.from(spanMap.values()).flat();

  return {
    entities,
    spans
  };
}
