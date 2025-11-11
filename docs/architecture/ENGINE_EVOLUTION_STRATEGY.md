# ARES Engine Evolution Strategy
## Path to Most Powerful Algorithmic Entity/Relation Detection

**Created:** Oct 22, 2025
**Goal:** Transform ARES from 41% entity precision / 24% relation recall to industry-leading performance

---

## Current State Analysis

### Mega Regression Performance (mega-001, 933 words)
```
Entity Precision:  41.2%  (extracting ~17 when gold is 8 → 9 false positives)
Entity Recall:     87.5%  (finding 7/8 gold entities → 1 missed)
Relation Precision: 50.0%  (extracting ~8 when gold is 17, 4 correct → 4 false positives)
Relation Recall:    23.5%  (finding 4/17 gold relations → 13 MISSED)
```

**Critical Issues:**
1. **Over-extraction** - Too many false positive entities (low precision)
2. **Relation Blindness** - Missing 76% of actual relationships (catastrophic recall)
3. **Hallucination** - Creating false relations (e.g., "Kara Nightfall parent_of")

### Root Cause Diagnosis

#### Entity Extraction (entities.ts:1-1242)
**Strengths:**
- Multi-source extraction (NER, dependency, fallback, whitelist)
- Variant merging (Gandalf / Gandalf the Grey)
- Compound name handling
- Coordination splitting (James and Lily Potter)

**Weaknesses:**
1. **Fallback over-trigger** (line 677): Catches ANY capitalized 1-3 word pattern
2. **Weak context classification** (line 624): Simple regex heuristics
3. **No confidence scoring**: All entities treated equally
4. **No cross-sentence coreference**: "She" not linked to "Aria Thorne"
5. **Generic titles cause noise**: "Professor", "The strategist" extracted as separate entities

#### Relation Extraction (relations.ts:1-500+)
**Strengths:**
- Dependency-based patterns (nsubj, dobj, pobj)
- Type guards (PERSON can't marry PLACE)
- Qualifier extraction (time/place metadata)
- Inverse relation generation

**Critical Weaknesses:**
1. **ONLY uses dependency parse** - Misses narrative patterns like:
   - "X married Y eight years earlier" (temporal past tense)
   - "X and Y remained friends" (state continuity)
   - "The couple's daughter, Mira" (possessive + appositive)
   - "Jun Park, their oldest friend" (appositive descriptor)

2. **No coreference resolution**:
   - "She met her partner" → Can't link "She" to "Aria Thorne"
   - "The strategist" → Can't link to "Kara Nightfall"
   - "Their daughter" → Can't link "Their" to (Aria, Elias)

3. **Distance-limited**: Relationships can span paragraphs, but our window is ±80 chars

4. **No semantic role labeling**: Can't extract "X's son Y" possessive patterns

5. **No event extraction**: Can't infer relations from events (marriage ceremony → married_to)

---

## The Alphanumeric Entity Tracking System

### Concept: Mention-Entity Resolution Framework

**Core Idea:** Separate MENTIONS (surface text) from ENTITIES (unique real-world objects)

#### Structure:
```
Entity E001: "Aria Thorne" (PERSON)
  Mentions:
    M001: "Aria Thorne" (span 45-56, sentence 0, canonical)
    M002: "Aria" (span 234-238, sentence 3, short form)
    M003: "She" (span 567-570, sentence 5, pronoun)
    M004: "The explorer" (span 891-904, sentence 8, descriptor)

Entity E002: "Elias Calder" (PERSON)
  Mentions:
    M005: "Elias Calder" (span 78-90, canonical)
    M006: "Elias" (span 456-461, short form)
    M007: "her partner" (span 102-113, descriptor relative to E001)
    M008: "He" (span 678-680, pronoun)
```

#### Benefits:
1. **Coreference chains**: Track all ways an entity is referenced
2. **Disambiguation**: "Professor" in sentence 5 → E007 (Lysa Marren)
3. **Relation extraction**: Can link "She married him" using pronoun resolution
4. **Alias discovery**: Automatic detection of all name variants
5. **Debugging**: Can trace exactly which mention triggered extraction

#### Implementation Strategy:
```typescript
interface Mention {
  id: string;              // M001, M002...
  span: [number, number];  // character offsets
  surface: string;         // raw text
  sentenceIdx: number;
  type: 'canonical' | 'pronoun' | 'descriptor' | 'short_form';
  entityId: string;        // E001
}

interface EntityCluster {
  id: string;              // E001
  type: EntityType;
  canonical: string;
  mentions: Mention[];
  corefChain: string[];    // [M001, M002, M003] ordered by appearance
}
```

---

## Evolution Roadmap: 4 Phases

### Phase 1: Enhanced Entity Detection (Target: 75% precision, 90% recall)

**1.1 Confidence Scoring**
```typescript
interface EntityCandidate {
  text: string;
  type: EntityType;
  span: [number, number];
  confidence: number;  // 0-1 score
  sources: ('NER' | 'DEP' | 'WHITELIST' | 'FALLBACK')[];
}

function computeEntityConfidence(candidate: EntityCandidate): number {
  let score = 0;

  // Base score by source
  if (candidate.sources.includes('WHITELIST')) score += 0.95;
  else if (candidate.sources.includes('NER')) score += 0.85;
  else if (candidate.sources.includes('DEP')) score += 0.75;
  else score += 0.4; // fallback only

  // Frequency bonus: multiple mentions boost confidence
  const frequency = countMentions(candidate.text);
  score *= Math.min(1.2, 1.0 + (frequency * 0.05));

  // Context validation
  if (hasStrongContext(candidate)) score *= 1.1;
  if (isGenericWord(candidate.text)) score *= 0.5;

  return Math.min(1.0, score);
}
```

**1.2 Aggressive Filtering**
- Drop entities with confidence < 0.5 threshold
- Filter generic titles unless they appear with specific names
- Blocklist common narrative words: "couple", "friends", "trio", "pair"

**1.3 Cross-Validation**
- If entity only appears once and is from FALLBACK → likely noise
- If entity appears in multiple sentences → likely real

---

### Phase 2: Coreference Resolution (Target: Enable Phase 3)

**2.1 Pronoun Resolution**
```typescript
function resolvePronoun(
  pronoun: string,
  sentenceIdx: number,
  tokens: Token[],
  entities: EntityCluster[]
): string | null {
  // Gender matching
  const gender = pronoun.toLowerCase();
  const masculine = ['he', 'him', 'his'];
  const feminine = ['she', 'her', 'hers'];

  // Find recent PERSON entities in prior 3 sentences
  const candidates = entities.filter(e =>
    e.type === 'PERSON' &&
    e.mentions.some(m => m.sentenceIdx >= sentenceIdx - 3 && m.sentenceIdx < sentenceIdx)
  );

  // Prefer most recent mention
  candidates.sort((a, b) => {
    const aLast = Math.max(...a.mentions.map(m => m.sentenceIdx));
    const bLast = Math.max(...b.mentions.map(m => m.sentenceIdx));
    return bLast - aLast;
  });

  // Gender filter (if name suggests gender)
  if (masculine.includes(gender)) {
    return candidates.find(c => seemsMasculine(c.canonical))?.id ?? candidates[0]?.id ?? null;
  }
  if (feminine.includes(gender)) {
    return candidates.find(c => seemsFeminine(c.canonical))?.id ?? candidates[0]?.id ?? null;
  }

  return candidates[0]?.id ?? null;
}
```

**2.2 Descriptor Resolution**
Examples:
- "The strategist" → Find recent PERSON with role descriptor in context
- "Their daughter" → Find recent couple (married_to relation)
- "The explorer" → Match with entity that has exploration-related evidence

**2.3 Building Coreference Chains**
- Pass 1: Exact name matches
- Pass 2: Pronoun resolution
- Pass 3: Descriptor matching
- Pass 4: Merge clusters with high overlap

---

### Phase 3: Advanced Relation Extraction (Target: 70% precision, 65% recall)

**3.1 Narrative Pattern Extraction**
```typescript
const NARRATIVE_PATTERNS: RelationPattern[] = [
  // Family patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*),?\s+(?:their|his|her|the)\s+(son|daughter|child|parent|father|mother|brother|sister)/gi,
    extract: (match, entities) => {
      const descriptor = match[2]; // "son", "daughter"
      // Find possessor entities in prior context
      // Create child_of / parent_of relations
    }
  },

  // Marriage patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:married|wed)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'married_to',
    symmetric: true
  },
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:had married|married)/gi,
    predicate: 'married_to',
    symmetric: true
  },

  // Friendship patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:remained|stayed|became|was)\s+(?:best\s+)?friends?\s+with\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'friends_with',
    symmetric: true
  },
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*),?\s+their\s+oldest\s+friend/gi,
    extract: (match, context, entities) => {
      // Find possessor of "their" (recent couple/group)
      // Create friends_with relation
    }
  },

  // Enemy patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:became|remained)\s+(?:an\s+)?enemy\s+of\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'enemy_of',
    symmetric: true
  },

  // Education patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:studied|enrolled|attended)\s+at\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'studies_at'
  },
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:taught|teaches|lectured)\s+at\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'teaches_at'
  },

  // Location patterns
  {
    regex: /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:lived|dwelt)\s+in\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/gi,
    predicate: 'lives_in'
  }
];

function extractNarrativeRelations(
  text: string,
  entities: EntityCluster[],
  spans: Span[]
): Relation[] {
  const relations: Relation[] = [];

  for (const pattern of NARRATIVE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text))) {
      const subjSurface = match[1];
      const objSurface = match[pattern.objGroup ?? 2];

      // Map to entity IDs using coreference
      const subjEntity = resolveEntityBySurface(subjSurface, match.index, entities);
      const objEntity = resolveEntityBySurface(objSurface, match.index, entities);

      if (subjEntity && objEntity && passesGuard(pattern.predicate, subjEntity, objEntity)) {
        relations.push({
          id: uuid(),
          subj: subjEntity.id,
          pred: pattern.predicate,
          obj: objEntity.id,
          evidence: [{
            doc_id: 'current',
            span: { start: match.index, end: match.index + match[0].length, text: match[0] },
            sentence_index: getSentenceIndex(match.index),
            source: 'RULE'
          }],
          confidence: 0.85,
          extractor: 'regex'
        });

        // Symmetric relations
        if (pattern.symmetric) {
          relations.push({
            ...relations[relations.length - 1],
            id: uuid(),
            subj: objEntity.id,
            obj: subjEntity.id
          });
        }
      }
    }
  }

  return relations;
}
```

**3.2 Possessive Pattern Extraction**
```typescript
// "Aria's daughter" → parent_of
// "The couple's son" → parent_of (need to resolve "couple" to [Aria, Elias])
// "Jun's best friend" → friends_with

function extractPossessiveRelations(parsed: ParseResponse, entities: EntityCluster[]): Relation[] {
  const relations: Relation[] = [];

  for (const sent of parsed.sentences) {
    for (const tok of sent.tokens) {
      if (tok.dep === 'poss') { // possessive
        const possessor = tok;
        const possessed = sent.tokens.find(t => t.i === tok.head);

        if (!possessed) continue;

        // Family relations
        if (['daughter', 'son', 'child'].includes(possessed.lemma.toLowerCase())) {
          // possessor is parent, possessed's referent is child
          const parentEntity = resolveToken(possessor, entities);
          const childEntity = findChildReferent(possessed, sent, entities);

          if (parentEntity && childEntity) {
            relations.push(createRelation(parentEntity, 'parent_of', childEntity, ...));
          }
        }

        // Friendship, partnership, etc.
        if (['friend', 'partner', 'ally'].includes(possessed.lemma.toLowerCase())) {
          // ... similar logic
        }
      }
    }
  }

  return relations;
}
```

**3.3 Appositive Extraction**
```typescript
// "Jun Park, their oldest friend" → friends_with
// "Kara Nightfall, a strategist" → (adds role descriptor)
// "Mira Calder, the couple's daughter" → child_of

function extractAppositiveRelations(parsed: ParseResponse, entities: EntityCluster[]): Relation[] {
  for (const sent of parsed.sentences) {
    for (const tok of sent.tokens) {
      if (tok.dep === 'appos') {
        const head = sent.tokens.find(t => t.i === tok.head);
        if (!head) continue;

        // Check if appositive describes a relationship
        const appositiveText = expandNP(tok, sent.tokens).text.toLowerCase();

        if (appositiveText.includes('friend')) {
          // Find possessor of "their" and create friends_with
        }
        if (appositiveText.includes('daughter') || appositiveText.includes('son')) {
          // Create child_of relation
        }
      }
    }
  }
}
```

**3.4 Event-Based Inference**
```typescript
// Extract events first, then infer relations
interface Event {
  type: 'marriage' | 'birth' | 'death' | 'meeting' | 'conflict';
  participants: string[]; // entity IDs
  time?: string;
  place?: string;
  evidence: Evidence;
}

function inferRelationsFromEvents(events: Event[]): Relation[] {
  const relations: Relation[] = [];

  for (const event of events) {
    if (event.type === 'marriage' && event.participants.length >= 2) {
      const [p1, p2] = event.participants;
      relations.push(createRelation(p1, 'married_to', p2, event.evidence));
      relations.push(createRelation(p2, 'married_to', p1, event.evidence));
    }
    // ... similar for other event types
  }

  return relations;
}
```

---

### Phase 4: Quality Assurance & Deduplication

**4.1 Relation Deduplication**
- Same (subj, pred, obj) with different evidence → merge evidence
- Conflicting relations (married_to vs enemy_of for same pair) → flag for review

**4.2 Confidence-Based Filtering**
- Relations with confidence < 0.6 → send to review queue
- Relations with conflicting evidence → send to review queue

**4.3 Consistency Validation**
- child_of → must have parent_of inverse
- married_to → both parties must be PERSON
- Timeline validation: can't be born after death

---

## Implementation Priority

### Sprint E1: Foundation (Week 1-2)
1. Implement EntityCluster + Mention data structures
2. Add confidence scoring to entity extraction
3. Aggressive filtering (drop <0.5 confidence)
4. Test on mega-001 → Target: 70% entity precision

### Sprint E2: Coreference (Week 3-4)
1. Pronoun resolution (he/she/it/they)
2. Descriptor resolution (the strategist, the explorer)
3. Build complete mention chains
4. Test on mega-001 → Target: Resolve 80% of pronouns

### Sprint E3: Narrative Relations (Week 5-7)
1. Implement 15-20 narrative patterns (marriage, family, friendship, education, location)
2. Possessive pattern extraction
3. Appositive pattern extraction
4. Test on mega-001 → Target: 60% relation recall

### Sprint E4: Polish (Week 8)
1. Relation deduplication
2. Confidence tuning
3. Review queue integration
4. Final mega regression → Target: Meet all 75%+ thresholds

---

## Expected Outcomes

### After Full Implementation:
```
Entity Precision:  80%+  (filter noise, confidence threshold)
Entity Recall:     85%+  (coreference captures more mentions)
Relation Precision: 75%+  (pattern quality > current dependency-only)
Relation Recall:    70%+  (narrative patterns catch what dependency misses)
```

### Key Innovations:
1. **Mention-Entity separation** - Industry standard (used by Stanford CoreNLP, spaCy, AllenNLP)
2. **Multi-pass extraction** - Dependency + Pattern + Event-based (comprehensive)
3. **Coreference chains** - Links all entity references (critical for long text)
4. **Confidence scoring** - Enables precision/recall tuning
5. **Alphanumeric tracking** - Debugging and provenance

### Competitive Advantages:
- **Narrative text specialty**: Most NER systems fail on literature/fiction
- **Multi-modal extraction**: Dependency + Regex + Events (not just one approach)
- **Provenance tracking**: Every relation has evidence chain
- **Interactive review**: Low-confidence items go to human validation

---

## Next Actions

1. **Clarify alphanumeric coding** - Is the Mention ID system (M001, E001) what you envisioned?
2. **Prioritize phases** - Start with Entity confidence + filtering or jump to Coreference?
3. **Test harness** - Create detailed debug output for mega-001 to see exact misses
4. **Pattern expansion** - Need more narrative patterns for specific domains (fantasy, sci-fi, historical)?

**This document is the blueprint. Let's build the most powerful entity extraction engine in existence.**
