# Grammar Modules Integration Guide

**Status**: Grammar modules fully implemented but not yet integrated into extraction pipeline
**Implementation Date**: 2025-11-15
**Developer**: Claude Online (pronoun refactor branch)
**Location**: `app/engine/grammar/`

## Overview

Claude Online built two comprehensive grammar analysis modules based on Grammar Monster and Purdue OWL specifications:

1. **`parts-of-speech.ts`** (794 lines) - All 8 parts of speech with categorization
2. **`sentence-analyzer.ts`** (546 lines) - 5 Purdue OWL sentence patterns

These modules are **production-ready** but **dormant** - they need to be hooked into the extraction pipeline.

## Module 1: Parts of Speech (`app/engine/grammar/parts-of-speech.ts`)

### Capabilities

- **8 Parts of Speech**: Nouns, Pronouns, Verbs, Adjectives, Adverbs, Prepositions, Conjunctions, Determiners
- **Noun Categories**: Proper person/place/org, Common concrete/abstract, Collective, Compound
- **Verb Categories**: Action transitive/intransitive, Linking, Auxiliary, Modal, Stative
- **Verb Tense Detection**: Simple/perfect/progressive past/present/future
- **Adjective/Adverb Classification**: Descriptive, quantitative, demonstrative, manner, time, place, etc.

### Key Functions

```typescript
// Detect noun category and map to entity type
import { detectNounCategory, nounCategoryToEntityType } from '../grammar/parts-of-speech';

const category = detectNounCategory(word, posTag, isCapitalized);
const entityType = nounCategoryToEntityType(category);
// PROPER_PERSON → PERSON, PROPER_PLACE → PLACE, etc.

// Detect verb category for relation typing
import { detectVerbCategory } from '../grammar/parts-of-speech';

const verbCat = detectVerbCategory(lemma, hasDirectObject, hasComplement);
// ACTION_TRANSITIVE, ACTION_INTRANSITIVE, LINKING, etc.

// Detect verb tense for temporal analysis
import { detectVerbTense, getTenseTemporality } from '../grammar/parts-of-speech';

const tense = detectVerbTense(tag, lemma);
const temporality = getTenseTemporality(tense); // 'past' | 'present' | 'future'
```

## Module 2: Sentence Analyzer (`app/engine/grammar/sentence-analyzer.ts`)

### Capabilities

- **5 Purdue OWL Patterns**: SV, SVO, SVC, SVOO, SVOC
- **Component Extraction**: Subject, verb, direct/indirect objects, complements
- **Phrase Detection**: Prepositional phrases, adjuncts, modifiers
- **Pattern Matching**: Identifies sentence structure for enhanced relation extraction

### Key Functions

```typescript
import { analyzeSentenceStructure, SentencePattern } from '../grammar/sentence-analyzer';

const components = analyzeSentenceStructure(parsedSentence);

// Components available:
// - subject: Token (the entity performing the action)
// - verb: Token (the main action/state)
// - directObject: Token | undefined (receives the action)
// - indirectObject: Token | undefined (benefits from the action)
// - complement: Token | undefined (describes/renames subject/object)
// - pattern: SentencePattern (SV, SVO, SVC, SVOO, SVOC)
// - prepositionalPhrases: { preposition, object, tokens }[]
// - adjuncts: Token[] (modifiers, adverbs, etc.)
```

## Integration Points

### 1. Entity Type Classification (`app/engine/extract/entity-quality.ts`)

**Current State**: Keyword-based heuristics
**Enhancement**: Use noun category detection from POS tags

```typescript
// TODO: Integrate parts-of-speech module for entity type classification
// Located in: app/engine/extract/entity-quality.ts, refineEntityType()

import { detectNounCategory, nounCategoryToEntityType } from '../grammar/parts-of-speech';

function refineEntityTypeWithGrammar(entity: Entity, posTag: string): EntityType {
  // Use POS-based noun categorization
  const isCapitalized = /^[A-Z]/.test(entity.canonical);
  const category = detectNounCategory(entity.canonical, posTag, isCapitalized);
  const grammaticalType = nounCategoryToEntityType(category);

  // Combine with existing heuristics for confidence
  const heuristicType = inferTypeFromKeywords(entity.canonical);

  if (grammaticalType === heuristicType) {
    // Both agree - high confidence
    return grammaticalType;
  } else {
    // Conflict - prefer grammatical analysis for proper nouns
    return posTag === 'PROPN' ? grammaticalType : heuristicType;
  }
}
```

**Requirements**:
- Access to spaCy POS tags at entity quality pass
- Entity span tracking to map back to parsed tokens

### 2. Entity Quality Filter (`app/engine/extract/entity-quality.ts`)

**Current State**: No POS-based validation
**Enhancement**: Reject entities that are verbs/adverbs/etc.

```typescript
// TODO: Add POS-based entity validation
// Located in: app/engine/extract/entity-quality.ts, validateEntity()

import { isNounByPOS } from '../grammar/parts-of-speech';

function isValidEntityByGrammar(text: string, posTag: string): boolean {
  // Reject if clearly a verb, adverb, conjunction, etc.
  const invalidPOS = new Set(['VERB', 'AUX', 'ADV', 'CCONJ', 'SCONJ', 'PART']);
  if (invalidPOS.has(posTag)) {
    return false;
  }

  // Must be noun or proper noun
  return posTag === 'NOUN' || posTag === 'PROPN';
}
```

### 3. Relation Extraction (`app/engine/extract/relations.ts` or `narrative-relations.ts`)

**Current State**: Pattern-based with regex
**Enhancement**: Use sentence structure analysis for relation triples

```typescript
// TODO: Integrate sentence-analyzer for structured relation extraction
// Located in: app/engine/extract/relations.ts, extractRelations()

import { analyzeSentenceStructure, SentencePattern } from '../grammar/sentence-analyzer';
import { detectVerbCategory, detectVerbTense } from '../grammar/parts-of-speech';

function extractRelationsFromSentenceStructure(sentence: ParsedSentence) {
  const components = analyzeSentenceStructure(sentence);

  if (!components.subject || !components.verb) {
    return []; // Need at least subject and verb
  }

  const verbCategory = detectVerbCategory(
    components.verb.lemma,
    !!components.directObject,
    !!components.complement
  );

  const verbTense = detectVerbTense(
    components.verb.tag,
    components.verb.lemma
  );

  // Extract based on sentence pattern
  switch (components.pattern) {
    case SentencePattern.SVO:
      // Subject-Verb-Object: "Frederick met Sarah"
      return [{
        subj: extractEntityFromToken(components.subject),
        pred: inferPredicateFromVerb(components.verb, verbCategory),
        obj: extractEntityFromToken(components.directObject!),
        confidence: 0.9,
        temporality: getTenseTemporality(verbTense)
      }];

    case SentencePattern.SVC:
      // Subject-Verb-Complement: "Frederick is the king"
      return [{
        subj: extractEntityFromToken(components.subject),
        pred: inferRoleRelation(components.verb, components.complement!),
        obj: extractEntityFromToken(components.complement!),
        confidence: 0.85
      }];

    case SentencePattern.SVOO:
      // Subject-Verb-IndirectObject-DirectObject: "Frederick gave Sarah a gift"
      return [{
        subj: extractEntityFromToken(components.subject),
        pred: 'gave_to',
        obj: extractEntityFromToken(components.indirectObject!),
        confidence: 0.8
      }, {
        subj: extractEntityFromToken(components.subject),
        pred: 'gave_item',
        obj: extractEntityFromToken(components.directObject!),
        confidence: 0.75
      }];

    default:
      return [];
  }
}
```

### 4. Relation Qualifiers (`app/engine/extract/relations.ts`)

**Current State**: No adverbial/prepositional modifiers
**Enhancement**: Use adjuncts and prepositional phrases for rich relations

```typescript
// TODO: Add relation qualifiers from sentence components
// Located in: app/engine/extract/relations.ts, enhanceRelations()

import { analyzeSentenceStructure } from '../grammar/sentence-analyzer';

function extractRelationQualifiers(sentence: ParsedSentence) {
  const components = analyzeSentenceStructure(sentence);

  const qualifiers = {
    manner: [] as string[],      // how (adverbs of manner)
    time: [] as string[],         // when (time expressions)
    place: [] as string[],        // where (prepositional phrases)
    degree: [] as string[]        // how much (adverbs of degree)
  };

  // Extract from adjuncts (adverbs)
  for (const adjunct of components.adjuncts) {
    const adverbCat = detectAdverbCategory(adjunct.text, adjunct.pos);
    switch (adverbCat) {
      case AdverbCategory.MANNER:
        qualifiers.manner.push(adjunct.text);
        break;
      case AdverbCategory.TIME:
        qualifiers.time.push(adjunct.text);
        break;
      case AdverbCategory.PLACE:
        qualifiers.place.push(adjunct.text);
        break;
    }
  }

  // Extract from prepositional phrases
  for (const pp of components.prepositionalPhrases) {
    const prepCat = detectPrepositionCategory(pp.preposition);
    switch (prepCat) {
      case PrepositionCategory.TIME:
        qualifiers.time.push(`${pp.preposition} ${pp.object.text}`);
        break;
      case PrepositionCategory.LOCATION:
        qualifiers.place.push(`${pp.preposition} ${pp.object.text}`);
        break;
    }
  }

  return qualifiers;
}
```

## Integration Checklist

### Phase 1: Entity Enhancement (High Priority)

- [ ] Add POS tag access to entity quality pass
- [ ] Integrate `detectNounCategory()` into type inference
- [ ] Add POS-based entity validation to filter non-nouns
- [ ] Test with diverse entity types (persons, places, orgs, items)

### Phase 2: Relation Enhancement (Medium Priority)

- [ ] Integrate `analyzeSentenceStructure()` into relation extraction
- [ ] Map sentence patterns (SV, SVO, SVC, etc.) to relation templates
- [ ] Use verb categories to classify relation types
- [ ] Extract verb tense for temporal relation metadata

### Phase 3: Relation Qualifiers (Low Priority)

- [ ] Extract adverbial qualifiers (manner, time, place, degree)
- [ ] Extract prepositional phrase modifiers
- [ ] Attach qualifiers to relation objects as metadata
- [ ] Test with complex sentences

## Data Requirements

### spaCy Parser Output

The grammar modules require access to spaCy parse data:

```typescript
interface Token {
  text: string;
  lemma: string;
  pos: string;     // POS tag (NOUN, VERB, ADJ, etc.)
  tag: string;     // Fine-grained tag (VBD, NNP, JJ, etc.)
  dep: string;     // Dependency relation
  head_idx: number;  // Index of syntactic head
  // ... other fields
}

interface ParsedSentence {
  tokens: Token[];
  // ... other fields
}
```

**Current Status**: spaCy parser provides this data, but:
1. Entity extraction may not have direct access to Token objects
2. Need to map entity spans back to parsed tokens for POS lookup
3. Consider caching POS tags on Entity objects during extraction

## Testing Strategy

### Unit Tests

```typescript
// Test noun categorization
describe('detectNounCategory', () => {
  it('should categorize proper person names', () => {
    const category = detectNounCategory('Frederick', 'PROPN', true);
    expect(category).toBe(NounCategory.PROPER_PERSON);
    expect(nounCategoryToEntityType(category)).toBe('PERSON');
  });

  it('should categorize places', () => {
    const category = detectNounCategory('Hogwarts', 'PROPN', true);
    const entityType = nounCategoryToEntityType(category);
    expect(entityType).toBeOneOf(['PLACE', 'PERSON']); // May need context
  });
});

// Test sentence analysis
describe('analyzeSentenceStructure', () => {
  it('should identify SVO pattern', () => {
    const result = analyzeSentenceStructure(parsedSentence);
    expect(result.pattern).toBe(SentencePattern.SVO);
    expect(result.subject.text).toBe('Frederick');
    expect(result.verb.text).toBe('met');
    expect(result.directObject.text).toBe('Sarah');
  });
});
```

### Integration Tests

```typescript
// Test end-to-end extraction with grammar
describe('Grammar-Enhanced Extraction', () => {
  it('should extract entities with correct types using POS', () => {
    const text = "Frederick studied at Hogwarts with Hermione.";
    const result = extractEntities(text);

    expect(result.entities).toContainEqual({
      text: 'Frederick',
      type: 'PERSON',  // From PROPER_PERSON noun category
      // ...
    });

    expect(result.entities).toContainEqual({
      text: 'Hogwarts',
      type: 'PLACE',  // From PROPER_PLACE noun category
      // ...
    });
  });

  it('should extract relations with sentence patterns', () => {
    const text = "Frederick gave Sarah a gift.";
    const result = extractRelations(text);

    // SVOO pattern should produce two relations
    expect(result.relations).toContainEqual({
      subj: 'Frederick',
      pred: 'gave_to',
      obj: 'Sarah'
    });

    expect(result.relations).toContainEqual({
      subj: 'Frederick',
      pred: 'gave_item',
      obj: 'gift'
    });
  });
});
```

## Performance Considerations

- **Noun Category Detection**: O(1) dictionary lookups, negligible overhead
- **Sentence Analysis**: O(n) where n = tokens per sentence, ~1-5ms per sentence
- **Caching**: Consider caching POS analysis results for repeated entity mentions

## Future Enhancements

1. **Custom Entity Type Mapping**: Allow configuration of noun category → entity type mapping
2. **Verb Predicate Templates**: Build predicate templates from verb categories (e.g., ACTION_TRANSITIVE → "performed_action_on")
3. **Adjective Attributes**: Extract entity attributes from adjectives (e.g., "wise wizard" → wizard.wisdom = high)
4. **Adverb Relation Metadata**: Store adverbs as relation metadata (e.g., "fought bravely" → relation.manner = "bravely")
5. **Multi-Clause Analysis**: Extend sentence analyzer to handle complex/compound sentences with conjunctions

## References

- **Grammar Monster**: https://www.grammar-monster.com/
- **Purdue OWL**: https://owl.purdue.edu/
- **Implementation**: `app/engine/grammar/parts-of-speech.ts`, `app/engine/grammar/sentence-analyzer.ts`
- **Documentation**: `docs/grammar-rules.md` (for full Grammar Monster rule specifications)

---

**Next Steps**: Start with Phase 1 (Entity Enhancement) as it provides immediate quality improvements with minimal integration complexity.
