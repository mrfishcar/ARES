/**
 * Assertion Builder - Three Deterministic Micro-Passes
 *
 * Transforms raw assertions into semantically-enriched assertions with:
 * - Attribution (who says it)
 * - Modality (epistemic status)
 * - Reference resolution (pronouns, group suppression)
 *
 * Design principles:
 * - Deterministic: same input → same output
 * - Confidence-based: update confidence instead of deleting
 * - Evidence-preserving: never lose provenance
 *
 * @module ir/assertion-builder
 */

import type {
  Assertion,
  Attribution,
  Modality,
  Confidence,
  EntityId,
  EvidenceSpan,
  ProjectIR,
  Entity,
} from './types';

// =============================================================================
// PASS A: ATTRIBUTION
// =============================================================================

/**
 * Quote context from BookNLP or extraction.
 */
export interface QuoteContext {
  /** Is this assertion derived from quoted speech? */
  isQuoted: boolean;
  /** Speaker entity ID (if known from BookNLP) */
  speakerId?: EntityId;
  /** Confidence in speaker attribution */
  speakerConfidence?: number;
}

/**
 * Attribution detection rules (deterministic):
 *
 * 1. If assertion evidence is inside a quote AND speaker is known:
 *    → attribution.source = 'CHARACTER', attribution.character = speakerId
 *
 * 2. If assertion evidence is inside a quote but speaker unknown:
 *    → attribution.source = 'CHARACTER', attribution.character = undefined
 *    → reliability reduced
 *
 * 3. Otherwise:
 *    → attribution.source = 'NARRATOR'
 */
export function applyAttributionPass(
  assertion: Assertion,
  quoteContext?: QuoteContext
): Assertion {
  // Default: narrator says it
  if (!quoteContext || !quoteContext.isQuoted) {
    return {
      ...assertion,
      attribution: {
        source: 'NARRATOR',
        reliability: 0.9,
        isDialogue: false,
        isThought: false,
      },
    };
  }

  // Quoted speech with known speaker
  if (quoteContext.speakerId) {
    return {
      ...assertion,
      attribution: {
        source: 'CHARACTER',
        character: quoteContext.speakerId,
        reliability: quoteContext.speakerConfidence ?? 0.8,
        isDialogue: true,
        isThought: false,
      },
    };
  }

  // Quoted speech with unknown speaker (reduce reliability)
  return {
    ...assertion,
    attribution: {
      source: 'CHARACTER',
      character: undefined,
      reliability: 0.5, // Lower reliability - we don't know who said it
      isDialogue: true,
      isThought: false,
    },
  };
}

// =============================================================================
// PASS B: MODALITY
// =============================================================================

/**
 * Belief verbs that indicate BELIEF modality.
 * If the subject "believes/thinks/assumes" something, the object is BELIEF.
 */
const BELIEF_VERBS = new Set([
  'believes',
  'believe',
  'believed',
  'thinks',
  'think',
  'thought',
  'assumes',
  'assume',
  'assumed',
  'supposes',
  'suppose',
  'supposed',
  'imagines',
  'imagine',
  'imagined',
  'suspects',
  'suspect',
  'suspected',
  'fears',
  'fear',
  'feared',
  'hopes',
  'hope',
  'hoped',
  'expects',
  'expect',
  'expected',
  'considers',
  'consider',
  'considered',
]);

// =============================================================================
// FUTURE: PERCEPTION EPISTEMICS
// =============================================================================
//
// Perception verbs (saw, watched, heard, noticed, observed, felt) currently
// remain as FACT modality by default. In the future, these should be attributed
// as "character perception" rather than pure narrator fact:
//
// Example: "Harry saw Draco enter the room"
// - Current: FACT modality (narrator-asserted event)
// - Future: CHARACTER_PERCEPTION modality with perceiver=Harry
//
// This requires:
// 1. New modality type: CHARACTER_PERCEPTION
// 2. Attribution field: perceiver: EntityId
// 3. Epistemic chain: "Harry saw X" means Harry believes X happened
//
// Not urgent - perception verbs work correctly as FACT for now.
// Track: https://github.com/mrfishcar/ARES/issues/xxx
// =============================================================================

/**
 * Negation cues that indicate NEGATED modality.
 */
const NEGATION_CUES = new Set([
  'not',
  "n't",
  'never',
  'no longer',
  'neither',
  'nor',
  'none',
  'nothing',
  'nobody',
  'nowhere',
  'hardly',
  'barely',
  'scarcely',
  'denied',
  'denies',
  'deny',
  'refused',
  'refuses',
  'refuse',
  'rejected',
  'rejects',
  'reject',
]);

/**
 * Rumor/hearsay cues.
 */
const RUMOR_CUES = new Set([
  'rumored',
  'rumoured',
  'allegedly',
  'supposedly',
  'reportedly',
  'said to be',
  'claimed to be',
  'thought to be',
  'believed to be',
]);

/**
 * Plan/intention cues (includes desire verbs).
 * Desire verbs (want, wish, hope) express future-oriented intentions.
 */
const PLAN_CUES = new Set([
  'plans to',
  'planned to',
  'planning to',
  'intends to',
  'intended to',
  'intending to',
  'will',
  'would',
  'going to',
  'about to',
  // Desire verbs (future-oriented)
  'wants to',
  'wanted to',
  'want to',
  'wishes to',
  'wished to',
  'wish to',
  'desires to',
  'desired to',
  'desire to',
  'needs to',
  'needed to',
  'need to',
]);

/**
 * Check if text contains any cue from a set (word boundary aware).
 * Multi-word cues use simple substring match.
 * Single-word cues use word boundary matching to avoid false positives
 * (e.g., "supposedly" should not match "suppose").
 * Contractions (containing apostrophe) use substring match.
 */
function containsCue(text: string, cues: Set<string>): boolean {
  const lower = text.toLowerCase();
  for (const cue of cues) {
    // Multi-word cues (like "said to be") use substring match
    if (cue.includes(' ')) {
      if (lower.includes(cue)) {
        return true;
      }
    } else if (cue.includes("'")) {
      // Contractions (like "n't") use substring match - word boundaries don't work
      if (lower.includes(cue)) {
        return true;
      }
    } else {
      // Single-word cues use word boundary matching
      const regex = new RegExp(`\\b${escapeRegex(cue)}\\b`, 'i');
      if (regex.test(lower)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract evidence text for modality detection.
 */
function getEvidenceText(assertion: Assertion): string {
  if (assertion.evidence.length === 0) return '';
  return assertion.evidence.map(e => e.text).join(' ');
}

/**
 * Modality detection rules (deterministic, ordered by priority):
 *
 * 1. If attribution is CHARACTER (quoted speech):
 *    → modality = 'CLAIM' (character claims it, may not be true)
 *
 * 2. If evidence contains belief verbs:
 *    → modality = 'BELIEF'
 *
 * 3. If evidence contains negation cues:
 *    → modality = 'NEGATED'
 *
 * 4. If evidence contains rumor cues:
 *    → modality = 'RUMOR'
 *
 * 5. If evidence contains plan cues:
 *    → modality = 'PLAN'
 *
 * 6. Otherwise:
 *    → modality = 'FACT' (narrator presents as true)
 */
export function applyModalityPass(assertion: Assertion): Assertion {
  const evidenceText = getEvidenceText(assertion);

  // Rule 1: Quoted character speech defaults to CLAIM
  if (assertion.attribution.source === 'CHARACTER' && assertion.attribution.isDialogue) {
    return {
      ...assertion,
      modality: 'CLAIM',
    };
  }

  // Rule 2: Belief verbs → BELIEF
  if (containsCue(evidenceText, BELIEF_VERBS)) {
    return {
      ...assertion,
      modality: 'BELIEF',
    };
  }

  // Rule 3: Negation cues → NEGATED
  if (containsCue(evidenceText, NEGATION_CUES)) {
    return {
      ...assertion,
      modality: 'NEGATED',
    };
  }

  // Rule 4: Rumor cues → RUMOR
  if (containsCue(evidenceText, RUMOR_CUES)) {
    return {
      ...assertion,
      modality: 'RUMOR',
    };
  }

  // Rule 5: Plan cues → PLAN
  if (containsCue(evidenceText, PLAN_CUES)) {
    return {
      ...assertion,
      modality: 'PLAN',
    };
  }

  // Rule 6: Default to FACT
  return {
    ...assertion,
    modality: 'FACT',
  };
}

// =============================================================================
// PASS C: REFERENCE RESOLUTION
// =============================================================================

/**
 * Coreference link from BookNLP or spaCy.
 */
export interface CorefLink {
  /** The mention text (e.g., "he", "she", "they") */
  mentionText: string;
  /** Start character offset */
  start: number;
  /** End character offset */
  end: number;
  /** Resolved entity ID */
  entityId: EntityId;
  /** Confidence in resolution */
  confidence: number;
  /** Source of resolution */
  source: 'booknlp' | 'spacy' | 'rule';
}

/**
 * Group placeholders that should be suppressed or penalized.
 * These are vague references that often cause false relations.
 */
const GROUP_PLACEHOLDERS = new Set([
  'the family',
  'the group',
  'the team',
  'the couple',
  'the pair',
  'the trio',
  'the gang',
  'the party',
  'the squad',
  'the crew',
  'the bunch',
  'everyone',
  'everybody',
  'someone',
  'somebody',
  'anyone',
  'anybody',
  'no one',
  'nobody',
  'people',
  'they',  // Ambiguous plural
  'them',
  'their',
]);

/**
 * Unambiguous pronouns that can be resolved.
 * Only resolve these if we have high-confidence coreference.
 */
const RESOLVABLE_PRONOUNS = new Set([
  'he',
  'him',
  'his',
  'she',
  'her',
  'hers',
  'it',
  'its',
]);

/**
 * Check if a surface form is a group placeholder.
 */
export function isGroupPlaceholder(text: string): boolean {
  return GROUP_PLACEHOLDERS.has(text.toLowerCase().trim());
}

/**
 * Check if a surface form is a resolvable pronoun.
 */
export function isResolvablePronoun(text: string): boolean {
  return RESOLVABLE_PRONOUNS.has(text.toLowerCase().trim());
}

/**
 * Reference resolution context.
 */
export interface RefResolutionContext {
  /** Available coreference links */
  corefLinks: CorefLink[];
  /** Entity map for lookups */
  entityMap: Map<string, Entity>;
  /** Minimum confidence to apply resolution */
  minCorefConfidence: number;
}

/**
 * Confidence penalty for group placeholders.
 * Applied to assertions involving unresolved group references.
 */
const GROUP_PLACEHOLDER_PENALTY = 0.3;

/**
 * Confidence penalty for unresolved pronouns.
 */
const UNRESOLVED_PRONOUN_PENALTY = 0.2;

/**
 * Reference resolution rules (deterministic):
 *
 * 1. If subject/object is a group placeholder:
 *    → Reduce confidence by GROUP_PLACEHOLDER_PENALTY
 *    → Do NOT resolve (these are intentionally vague)
 *
 * 2. If subject/object is a resolvable pronoun AND coref link exists with high confidence:
 *    → Replace with resolved entity ID
 *    → Keep original confidence
 *
 * 3. If subject/object is a resolvable pronoun but no coref link:
 *    → Keep pronoun
 *    → Reduce confidence by UNRESOLVED_PRONOUN_PENALTY
 *
 * 4. Otherwise:
 *    → Keep as-is
 */
export function applyReferenceResolutionPass(
  assertion: Assertion,
  context: RefResolutionContext
): Assertion {
  let updatedAssertion = { ...assertion };
  let confidenceAdjustment = 0;

  // Get surface forms for subject and object
  const subjSurface = getSubjectSurface(assertion);
  const objSurface = getObjectSurface(assertion);

  // Rule 1: Penalize group placeholders (do not resolve)
  if (subjSurface && isGroupPlaceholder(subjSurface)) {
    confidenceAdjustment -= GROUP_PLACEHOLDER_PENALTY;
  }
  if (objSurface && isGroupPlaceholder(objSurface)) {
    confidenceAdjustment -= GROUP_PLACEHOLDER_PENALTY;
  }

  // Rule 2 & 3: Handle pronouns
  if (subjSurface && isResolvablePronoun(subjSurface)) {
    const resolved = resolveReference(subjSurface, assertion.evidence, context);
    if (resolved) {
      updatedAssertion = {
        ...updatedAssertion,
        subject: resolved.entityId,
      };
    } else {
      confidenceAdjustment -= UNRESOLVED_PRONOUN_PENALTY;
    }
  }

  if (objSurface && typeof assertion.object === 'string' && isResolvablePronoun(objSurface)) {
    const resolved = resolveReference(objSurface, assertion.evidence, context);
    if (resolved) {
      updatedAssertion = {
        ...updatedAssertion,
        object: resolved.entityId,
      };
    } else {
      confidenceAdjustment -= UNRESOLVED_PRONOUN_PENALTY;
    }
  }

  // Apply confidence adjustment
  if (confidenceAdjustment !== 0) {
    const currentConfidence = updatedAssertion.confidence;
    updatedAssertion = {
      ...updatedAssertion,
      confidence: {
        ...currentConfidence,
        semantic: Math.max(0, (currentConfidence.semantic || 0.5) + confidenceAdjustment),
        composite: Math.max(0, currentConfidence.composite + confidenceAdjustment),
      },
    };
  }

  return updatedAssertion;
}

/**
 * Get subject surface form from assertion.
 */
function getSubjectSurface(assertion: Assertion): string | undefined {
  // Check evidence for surface form
  if (assertion.evidence.length > 0) {
    const text = assertion.evidence[0].text;

    // Check for group placeholder phrases first (e.g., "The family", "The group")
    for (const placeholder of GROUP_PLACEHOLDERS) {
      if (text.toLowerCase().startsWith(placeholder.toLowerCase())) {
        return placeholder;
      }
    }

    // Then check for pronouns (including ambiguous ones)
    const pronounMatch = text.match(/^([Hh]e|[Ss]he|[Tt]hey|[Ii]t|[Tt]hem|[Tt]heir)\b/);
    if (pronounMatch) return pronounMatch[1];

    // Finally, first capitalized word
    const wordMatch = text.match(/^([A-Z][a-z]+)\b/);
    if (wordMatch) return wordMatch[1];
  }
  return undefined;
}

/**
 * Get object surface form from assertion.
 */
function getObjectSurface(assertion: Assertion): string | undefined {
  if (typeof assertion.object !== 'string') return undefined;

  // If object looks like an entity ID, it's already resolved
  if (assertion.object.startsWith('entity_') || assertion.object.startsWith('booknlp_')) {
    return undefined;
  }

  return assertion.object;
}

/**
 * Resolve a reference using coreference links.
 */
function resolveReference(
  surfaceForm: string,
  evidence: EvidenceSpan[],
  context: RefResolutionContext
): CorefLink | undefined {
  if (evidence.length === 0) return undefined;

  const evidenceSpan = evidence[0];
  const surfaceLower = surfaceForm.toLowerCase();

  // Find coref link that matches this surface form in the evidence span
  for (const link of context.corefLinks) {
    // Check if link is within the evidence span
    if (link.start >= evidenceSpan.charStart && link.end <= evidenceSpan.charEnd) {
      // Check if mention text matches
      if (link.mentionText.toLowerCase() === surfaceLower) {
        // Check confidence threshold
        if (link.confidence >= context.minCorefConfidence) {
          return link;
        }
      }
    }
  }

  return undefined;
}

// =============================================================================
// COMBINED ASSERTION BUILDER
// =============================================================================

/**
 * Context for assertion building.
 */
export interface AssertionBuilderContext {
  /** Quote contexts for attribution detection */
  quoteContexts: Map<string, QuoteContext>; // assertion ID → quote context
  /** Coreference links for reference resolution */
  corefLinks: CorefLink[];
  /** Entity map for lookups */
  entityMap: Map<string, Entity>;
  /** Minimum confidence for coref resolution */
  minCorefConfidence: number;
}

/**
 * Build assertion with all three passes applied.
 *
 * Pass order is important:
 * 1. Attribution (affects modality detection)
 * 2. Modality (depends on attribution)
 * 3. Reference resolution (independent, applies penalties)
 */
export function buildAssertion(
  assertion: Assertion,
  context: AssertionBuilderContext
): Assertion {
  // Pass A: Attribution
  const quoteContext = context.quoteContexts.get(assertion.id);
  let result = applyAttributionPass(assertion, quoteContext);

  // Pass B: Modality
  result = applyModalityPass(result);

  // Pass C: Reference Resolution
  result = applyReferenceResolutionPass(result, {
    corefLinks: context.corefLinks,
    entityMap: context.entityMap,
    minCorefConfidence: context.minCorefConfidence,
  });

  // Mark compiler pass
  result = {
    ...result,
    compiler_pass: 'assertion_builder_v1',
  };

  return result;
}

/**
 * Build all assertions in a ProjectIR.
 */
export function buildAssertions(
  ir: ProjectIR,
  context: Partial<AssertionBuilderContext> = {}
): ProjectIR {
  // Build entity map if not provided
  const entityMap = context.entityMap ?? new Map(
    ir.entities.map(e => [e.id, e])
  );

  const fullContext: AssertionBuilderContext = {
    quoteContexts: context.quoteContexts ?? new Map(),
    corefLinks: context.corefLinks ?? [],
    entityMap,
    minCorefConfidence: context.minCorefConfidence ?? 0.7,
  };

  const builtAssertions = ir.assertions.map(a => buildAssertion(a, fullContext));

  return {
    ...ir,
    assertions: builtAssertions,
  };
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export {
  BELIEF_VERBS,
  NEGATION_CUES,
  RUMOR_CUES,
  PLAN_CUES,
  GROUP_PLACEHOLDERS,
  RESOLVABLE_PRONOUNS,
  GROUP_PLACEHOLDER_PENALTY,
  UNRESOLVED_PRONOUN_PENALTY,
};
