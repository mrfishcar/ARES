/**
 * Pattern Bootstrapping (Phase 2 - DIPRE-style Learning)
 *
 * Learns extraction patterns from seed examples automatically.
 *
 * Algorithm (DIPRE - Dual Iterative Pattern Relation Extraction):
 * 1. User provides seed entities: ["Gandalf", "Saruman", "Radagast"]
 * 2. Find contexts where seeds appear: "X the wizard", "wizard X"
 * 3. Generalize to patterns: /(\w+) the wizard/, /wizard (\w+)/
 * 4. Apply patterns to corpus → find new entities
 * 5. Score by confidence, ask user to confirm
 * 6. Repeat with confirmed entities
 *
 * Benefits:
 * - 10x faster than manual pattern coding
 * - Learns from corpus (not just examples)
 * - Patterns are reusable
 * - Zero LLM cost (rule-based)
 */

/**
 * Seed entity definition
 */
export interface SeedEntity {
  type: string;          // Entity type (e.g., "WIZARD", "SPELL")
  examples: string[];    // Seed examples
}

/**
 * Context around a seed entity
 */
export interface EntityContext {
  entity: string;
  before: string;  // 5 tokens before
  after: string;   // 5 tokens after
  fullSentence: string;
}

/**
 * Learned pattern
 */
export interface Pattern {
  type: string;           // Entity type this pattern extracts
  template: string;       // Pattern template (e.g., "X the wizard")
  regex: RegExp;          // Compiled regex
  confidence: number;     // 0-1, based on seed support
  examples: string[];     // Entities that support this pattern
  extractionCount: number; // How many times pattern was used
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  entity: string;
  pattern: Pattern;
  context: string;
  confidence: number;
}

/**
 * Extract contexts around seed entities
 *
 * Finds all occurrences of seed entities in corpus and captures
 * surrounding context (5 tokens before/after).
 */
export function extractContexts(
  seeds: SeedEntity,
  corpus: string[]
): EntityContext[] {
  const contexts: EntityContext[] = [];

  for (const doc of corpus) {
    const sentences = doc.split(/[.!?]+/).filter(s => s.trim());

    for (const sentence of sentences) {
      const tokens = sentence.split(/\s+/).filter(t => t.trim());

      for (const example of seeds.examples) {
        // Find occurrences of this seed entity
        const exampleTokens = example.split(/\s+/);
        const exampleLen = exampleTokens.length;

        for (let i = 0; i <= tokens.length - exampleLen; i++) {
          const slice = tokens.slice(i, i + exampleLen).join(' ');

          if (slice.toLowerCase() === example.toLowerCase()) {
            // Found a match! Capture context
            const beforeTokens = tokens.slice(Math.max(0, i - 5), i);
            const afterTokens = tokens.slice(i + exampleLen, i + exampleLen + 5);

            contexts.push({
              entity: example,
              before: beforeTokens.join(' ').trim(),
              after: afterTokens.join(' ').trim(),
              fullSentence: sentence.trim()
            });
          }
        }
      }
    }
  }

  return contexts;
}

/**
 * Generalize contexts into patterns
 *
 * Groups similar contexts and extracts common patterns.
 * Uses simple heuristics to identify patterns:
 * - "[descriptor] X" (e.g., "powerful wizard")
 * - "X the [descriptor]" (e.g., "Gandalf the Grey")
 * - "X, a [descriptor]" (e.g., "Dumbledore, a wizard")
 */
export function generalizePatterns(
  contexts: EntityContext[],
  seeds: SeedEntity
): Pattern[] {
  const patterns: Pattern[] = [];
  const patternTemplates = new Map<string, { examples: Set<string>; contexts: EntityContext[] }>();

  // Pattern 1: "X the [descriptor]" (e.g., "Gandalf the Grey", "Harry the wizard")
  for (const ctx of contexts) {
    const match = ctx.after.match(/^the\s+(\w+)/i);
    if (match) {
      const descriptor = match[1].toLowerCase();
      const template = `X the ${descriptor}`;

      if (!patternTemplates.has(template)) {
        patternTemplates.set(template, { examples: new Set(), contexts: [] });
      }

      patternTemplates.get(template)!.examples.add(ctx.entity);
      patternTemplates.get(template)!.contexts.push(ctx);
    }
  }

  // Pattern 2: "[descriptor] X" (e.g., "wizard Gandalf", "powerful wizard")
  for (const ctx of contexts) {
    const match = ctx.before.match(/(\w+)\s*$/i);
    if (match) {
      const descriptor = match[1].toLowerCase();
      const template = `${descriptor} X`;

      if (!patternTemplates.has(template)) {
        patternTemplates.set(template, { examples: new Set(), contexts: [] });
      }

      patternTemplates.get(template)!.examples.add(ctx.entity);
      patternTemplates.get(template)!.contexts.push(ctx);
    }
  }

  // Pattern 3: "X, a [descriptor]" (e.g., "Dumbledore, a wizard")
  for (const ctx of contexts) {
    const match = ctx.after.match(/^,\s*a\s+(\w+)/i);
    if (match) {
      const descriptor = match[1].toLowerCase();
      const template = `X, a ${descriptor}`;

      if (!patternTemplates.has(template) ) {
        patternTemplates.set(template, { examples: new Set(), contexts: [] });
      }

      patternTemplates.get(template)!.examples.add(ctx.entity);
      patternTemplates.get(template)!.contexts.push(ctx);
    }
  }

  // Pattern 4: "X [verb]" for action patterns (e.g., "Gandalf traveled", "wizard fought")
  for (const ctx of contexts) {
    const match = ctx.after.match(/^(\w+ed|traveled|fought|spoke|arrived|departed)\b/i);
    if (match) {
      const verb = match[1].toLowerCase();
      const template = `X ${verb}`;

      if (!patternTemplates.has(template)) {
        patternTemplates.set(template, { examples: new Set(), contexts: [] });
      }

      patternTemplates.get(template)!.examples.add(ctx.entity);
      patternTemplates.get(template)!.contexts.push(ctx);
    }
  }

  // Convert templates to Pattern objects with confidence scoring
  for (const [template, data] of patternTemplates.entries()) {
    // Confidence = (# of seeds supporting pattern) / (total seeds)
    const confidence = data.examples.size / seeds.examples.length;

    // Only keep patterns supported by at least 2 seeds or 40% of seeds
    if (data.examples.size >= 2 || confidence >= 0.4) {
      // Build regex from template
      const regex = templateToRegex(template);

      patterns.push({
        type: seeds.type,
        template,
        regex,
        confidence,
        examples: Array.from(data.examples),
        extractionCount: 0
      });
    }
  }

  // Sort by confidence (highest first)
  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Convert pattern template to regex
 *
 * Templates use "X" as placeholder for entity.
 * Examples:
 * - "X the wizard" → /(\w+(?:\s+\w+)?)\s+the\s+wizard/i
 * - "wizard X" → /wizard\s+(\w+(?:\s+\w+)?)/i
 */
function templateToRegex(template: string): RegExp {
  // Escape special regex characters except X
  let pattern = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace X with capture group that matches 1-3 word names
  // Matches: "Gandalf", "Gandalf Grey", "Gandalf the Grey"
  pattern = pattern.replace(/X/g, '([A-Z][a-z]+(?:\\s+(?:the|of|de)\\s+[A-Z][a-z]+|\\s+[A-Z][a-z]+)?)');

  // Replace spaces with flexible whitespace
  pattern = pattern.replace(/\s+/g, '\\s+');

  return new RegExp(pattern, 'gi');
}

/**
 * Apply patterns to corpus to find new entities
 *
 * Returns candidate entities with confidence scores.
 */
export function applyPatterns(
  corpus: string[],
  patterns: Pattern[]
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const seen = new Set<string>();

  for (const doc of corpus) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex.source, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(doc)) !== null) {
        const entity = match[1].trim();
        const key = `${pattern.type}:${entity.toLowerCase()}`;

        // Skip if already seen
        if (seen.has(key)) continue;
        seen.add(key);

        // Skip if entity is too short or looks like a common word
        if (entity.length < 3 || /^(the|and|but|for|with)$/i.test(entity)) {
          continue;
        }

        // Skip if entity was already in seed examples
        if (pattern.examples.some(ex => ex.toLowerCase() === entity.toLowerCase())) {
          continue;
        }

        // Extract context
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(doc.length, match.index + match[0].length + 50);
        const context = doc.slice(contextStart, contextEnd);

        matches.push({
          entity,
          pattern,
          context,
          confidence: pattern.confidence
        });

        // Update pattern extraction count
        pattern.extractionCount++;
      }
    }
  }

  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Bootstrap patterns from seeds
 *
 * Main entry point for pattern bootstrapping.
 * Returns learned patterns and candidate entities.
 */
export function bootstrapPatterns(
  seeds: SeedEntity,
  corpus: string[]
): {
  patterns: Pattern[];
  candidates: PatternMatch[];
} {
  // Step 1: Extract contexts around seed entities
  const contexts = extractContexts(seeds, corpus);

  if (contexts.length === 0) {
    console.warn(`[BOOTSTRAP] No contexts found for seeds: ${seeds.examples.join(', ')}`);
    return { patterns: [], candidates: [] };
  }

  // Step 2: Generalize contexts into patterns
  const patterns = generalizePatterns(contexts, seeds);

  if (patterns.length === 0) {
    console.warn(`[BOOTSTRAP] No patterns learned from ${contexts.length} contexts`);
    return { patterns: [], candidates: [] };
  }

  // Step 3: Apply patterns to find new entities
  const candidates = applyPatterns(corpus, patterns);

  return { patterns, candidates };
}
