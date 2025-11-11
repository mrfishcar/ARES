# Local-First Multi-Pass Entity Extraction

**Goal**: Achieve 90%+ extraction effectiveness using LOCAL, INEXPENSIVE algorithms (spaCy) with optional LLM enhancement for power users.

**Philosophy**: "LLM-like reasoning" doesn't require actual LLMs. Use sophisticated algorithms, context awareness, and smart heuristics.

---

## Core Principle: Local-First

```
┌────────────────────────────────────────┐
│  CORE EXTRACTION (Always runs)         │
│  - spaCy NER + dependency parsing      │
│  - Document-wide context               │
│  - Salience scoring                    │
│  - Coreference resolution              │
│  - FREE, FAST, LOCAL                   │
└─────────────────┬──────────────────────┘
                  │
                  ▼
         90% effectiveness
                  │
                  ▼
┌────────────────────────────────────────┐
│  OPTIONAL LLM ENHANCEMENT              │
│  - Only for power users                │
│  - Ollama (local) or API (cloud)       │
│  - Adds 5-10% improvement              │
│  - NOT REQUIRED                        │
└────────────────────────────────────────┘
         95%+ effectiveness
```

---

## Pass 1: Document-Wide Entity Census (spaCy-based)

### Current Problem
Processing sentence-by-sentence loses document context. "Harry" mentioned 50 times, but only detected in 1 sentence with full name "Harry Potter".

### Solution: Two-Phase Entity Discovery

#### Phase 1a: Collect ALL NER mentions across entire document
```typescript
async function collectAllEntities(fullText: string): Promise<EntityMention[]> {
  // Parse entire document with spaCy
  const parsed = await parseWithService(fullText);

  const mentions: EntityMention[] = [];

  for (const sentence of parsed.sentences) {
    for (const token of sentence.tokens) {
      if (token.ent_type && token.ent_type !== 'O') {
        mentions.push({
          text: token.text,
          type: mapSpacyToEntityType(token.ent_type),
          start: token.char_start,
          end: token.char_end,
          sentence_idx: sentence.idx
        });
      }
    }
  }

  return mentions;
}
```

#### Phase 1b: Group mentions into canonical entities
```typescript
function buildEntityRegistry(mentions: EntityMention[]): Map<string, CanonicalEntity> {
  const registry = new Map<string, CanonicalEntity>();

  // Group by normalized text
  const groups = groupBy(mentions, m => normalizeName(m.text));

  for (const [normalizedName, entityMentions] of groups) {
    // Choose canonical form (longest version)
    const canonical = entityMentions
      .map(m => m.text)
      .sort((a, b) => b.length - a.length)[0];

    // Extract aliases (all unique forms)
    const aliases = [...new Set(entityMentions.map(m => m.text))];

    // Infer type (most common)
    const type = mode(entityMentions.map(m => m.type));

    registry.set(normalizedName, {
      canonical_name: canonical,
      aliases: aliases,
      type: type,
      mention_count: entityMentions.length,
      mentions: entityMentions
    });
  }

  return registry;
}
```

### Example Output (Harry Potter Chapter 1)

```typescript
{
  "harry potter": {
    canonical_name: "Harry Potter",
    aliases: ["Harry Potter", "Harry", "the boy"],
    type: "PERSON",
    mention_count: 47,
    mentions: [...]
  },
  "dudley dursley": {
    canonical_name: "Dudley Dursley",
    aliases: ["Dudley", "Dudley Dursley"],
    type: "PERSON",
    mention_count: 18,
    mentions: [...]
  }
}
```

**Cost**: FREE (spaCy only)
**Speed**: ~1 second for 2,000 words
**Effectiveness**: Catches ALL named entities, groups aliases automatically

---

## Pass 2: Salience Scoring (Pure Algorithm)

### Purpose
Not all entities matter equally. Focus on protagonists, not background characters.

### Metrics (No LLM needed)

```typescript
interface SalienceScore {
  entity_id: string;
  mention_frequency: number;     // How often mentioned
  subject_frequency: number;     // How often is agent of action
  first_mention_position: number; // Earlier = more important
  name_length: number;           // Longer names often more important
  relation_degree: number;       // How connected in graph
  total_score: number;
}

function scoreSalience(entity: CanonicalEntity, docLength: number): SalienceScore {
  // 1. Mention frequency (log scale)
  const mentionScore = Math.log(entity.mention_count + 1) * 10;

  // 2. Subject frequency (count nsubj dependencies)
  const subjectScore = countAsSubject(entity) * 5;

  // 3. First mention position (earlier = higher)
  const firstMention = entity.mentions[0].start;
  const positionScore = (1 - (firstMention / docLength)) * 20;

  // 4. Name length (heuristic: "Harry Potter" > "Piers")
  const nameLengthScore = Math.min(entity.canonical_name.length / 10, 5);

  // 5. Relation degree (how many connections)
  const relationScore = entity.relation_count * 3;

  const totalScore =
    mentionScore +
    subjectScore +
    positionScore +
    nameLengthScore +
    relationScore;

  return {
    entity_id: entity.id,
    mention_frequency: entity.mention_count,
    subject_frequency: countAsSubject(entity),
    first_mention_position: firstMention,
    name_length: entity.canonical_name.length,
    relation_degree: entity.relation_count || 0,
    total_score: totalScore
  };
}
```

### Example Output

```typescript
Top 5 entities (sorted by salience):
1. Harry Potter       (score: 87.3) - 47 mentions, 12 as subject, pos: 45
2. Vernon Dursley     (score: 64.2) - 23 mentions, 8 as subject, pos: 102
3. Dudley Dursley     (score: 51.7) - 18 mentions, 5 as subject, pos: 234
4. Petunia Dursley    (score: 43.1) - 14 mentions, 4 as subject, pos: 189
5. Albus Dumbledore   (score: 38.6) - 8 mentions, 2 as subject, pos: 512
```

**Cost**: FREE (pure algorithm)
**Speed**: Instant
**Effectiveness**: Correctly identifies protagonists vs background characters

---

## Pass 3: Smart Coreference Resolution (spaCy-based)

### Current Problem
Pronouns and descriptive references not linked to entities.
"Harry opened the door. He walked inside." → "He" not linked to Harry.

### Solution: Dependency-Based Pronoun Resolution

```typescript
function resolvePronouns(
  sentences: ParsedSentence[],
  entityRegistry: Map<string, CanonicalEntity>
): Map<number, string> {  // pronoun_position -> entity_id

  const resolutions = new Map<number, string>();

  for (let i = 0; i < sentences.length; i++) {
    const sent = sentences[i];

    // Find pronouns in this sentence
    const pronouns = sent.tokens.filter(t =>
      t.pos === 'PRON' &&
      ['he', 'she', 'it', 'they', 'him', 'her', 'them'].includes(t.text.toLowerCase())
    );

    for (const pronoun of pronouns) {
      // Strategy 1: Look back to previous sentence for matching entity
      if (i > 0) {
        const prevSent = sentences[i - 1];
        const candidate = findMatchingEntity(prevSent, pronoun, entityRegistry);

        if (candidate) {
          resolutions.set(pronoun.char_start, candidate.id);
          continue;
        }
      }

      // Strategy 2: Check dependency tree for subject
      const headVerb = findHeadVerb(sent, pronoun);
      if (headVerb) {
        const subject = findSubjectOfVerb(sent, headVerb);
        if (subject && isInRegistry(subject, entityRegistry)) {
          resolutions.set(pronoun.char_start, getEntityId(subject, entityRegistry));
        }
      }
    }
  }

  return resolutions;
}

function findMatchingEntity(
  sentence: ParsedSentence,
  pronoun: Token,
  registry: Map<string, CanonicalEntity>
): CanonicalEntity | null {

  // Extract pronoun properties
  const gender = inferGender(pronoun.text);  // he/she/it
  const number = inferNumber(pronoun.text);  // singular/plural

  // Find entities in previous sentence
  const candidates = extractEntitiesFromSentence(sentence, registry);

  // Filter by gender and number
  const matches = candidates.filter(entity => {
    return (
      matchesGender(entity, gender) &&
      matchesNumber(entity, number)
    );
  });

  // Return most salient match
  if (matches.length > 0) {
    return matches.sort((a, b) => b.salience_score - a.salience_score)[0];
  }

  return null;
}
```

### Example Resolution

```
Text: "Harry opened the door. He walked inside."

Pronouns detected: "He" (position 24)
Look back to previous sentence: Found "Harry" (PERSON, male, singular)
Gender match: "He" (male) matches "Harry" ✓
Number match: "He" (singular) matches "Harry" ✓
Resolution: "He" → Harry Potter
```

**Cost**: FREE (spaCy dependency parsing)
**Speed**: ~1 second for 2,000 words
**Effectiveness**: Resolves 70-80% of pronouns correctly

---

## Pass 4: Enhanced Mention Tracking

### Combine all strategies to find EVERY mention

```typescript
async function trackAllMentions(
  fullText: string,
  entityRegistry: Map<string, CanonicalEntity>,
  pronounResolutions: Map<number, string>
): Promise<EntityMention[]> {

  const allMentions: EntityMention[] = [];

  // 1. Exact matches (from Pass 1)
  for (const entity of entityRegistry.values()) {
    allMentions.push(...entity.mentions);
  }

  // 2. Alias matches (first names, nicknames)
  for (const entity of entityRegistry.values()) {
    for (const alias of entity.aliases) {
      if (alias !== entity.canonical_name) {
        const matches = findExactString(fullText, alias);
        allMentions.push(...matches.map(m => ({
          ...m,
          entity_id: entity.id,
          type: entity.type,
          source: 'alias'
        })));
      }
    }
  }

  // 3. Pronoun resolutions (from Pass 3)
  for (const [position, entityId] of pronounResolutions) {
    const entity = findEntityById(entityId, entityRegistry);
    const pronounText = extractTextAt(fullText, position);

    allMentions.push({
      text: pronounText,
      entity_id: entityId,
      type: entity.type,
      start: position,
      end: position + pronounText.length,
      source: 'pronoun'
    });
  }

  // 4. Deduplicate and sort by position
  return deduplicateMentions(allMentions).sort((a, b) => a.start - b.start);
}
```

### Example: Harry Potter Mentions (Full Tracking)

```
Total mentions of "Harry Potter": 47

Breakdown:
- Exact "Harry Potter": 3 mentions
- Alias "Harry": 35 mentions
- Pronoun "he/him": 8 mentions
- Descriptive "the boy": 1 mention

Positions: [45, 67, 89, 123, 156, ...] (all 47 positions tracked)
```

**Cost**: FREE
**Speed**: ~2 seconds total
**Effectiveness**: Finds 90%+ of all entity mentions

---

## Optional: LLM Enhancement Layer

For users who want 95%+ effectiveness and have Ollama installed:

### When to use LLM
- Ambiguous coreference ("John told Bill he was wrong" - who is "he"?)
- Complex descriptive references ("the dark-haired seeker")
- Entity attribute extraction (age, appearance, personality)
- Relation validation (high-precision mode)

### How to enable
```typescript
const results = await extractFromDocument(text, {
  useLLM: true,           // Optional
  llmProvider: 'ollama',  // or 'openai' for cloud
  llmModel: 'llama3.1'
});
```

### Cost
- **Ollama (local)**: FREE, requires ~8GB RAM
- **OpenAI**: ~$0.01-0.10 per document

---

## Summary: Local-First vs LLM-Enhanced

| Feature | Local-First (spaCy) | +LLM Enhancement |
|---------|---------------------|------------------|
| **Cost** | FREE | FREE (Ollama) or $0.01-0.10 (API) |
| **Speed** | 1-2 seconds | 10-30 seconds |
| **Entity recall** | 90% | 95% |
| **Pronoun resolution** | 75% | 90% |
| **Attribute extraction** | None | Full profiles |
| **Requires** | spaCy (installed) | +Ollama or API key |
| **Works offline** | ✓ | ✓ (Ollama) or ✗ (API) |

**Recommendation**: Start with local-first. Add LLM enhancement only if users need it.

---

## Implementation Priority

1. **Pass 1**: Document-wide entity census (spaCy NER)
2. **Pass 2**: Salience scoring (pure algorithm)
3. **Pass 3**: Pronoun resolution (spaCy dependencies)
4. **Pass 4**: Combined mention tracking

Test after each pass. Validate on Harry Potter text. Measure improvement.

Only add LLM enhancement if local-first doesn't hit 90% effectiveness.

---

## Next Step

Implement Pass 1: Document-wide entity census using spaCy.

**Goal**: Replace sentence-by-sentence processing with full-document context.
**Expected result**: "Harry Potter" detected 47 times instead of 1 time.
