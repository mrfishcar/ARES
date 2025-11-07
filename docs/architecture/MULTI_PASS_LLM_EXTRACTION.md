# Multi-Pass LLM-Enhanced Entity Extraction

**Problem**: Pattern-based extraction is only 2% effective. Basic names don't populate. Too many mistakes.

**Root Cause**: Current extraction thinks at the micro-level (sentence-by-sentence) without document-wide reasoning, context understanding, or entity memory.

**Solution**: Multi-pass architecture that mimics human reading comprehension using LLM-driven context and reasoning.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    RAW DOCUMENT                         │
│              (Novel, story, book chapter)               │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 1: CHARACTER CENSUS (LLM)                         │
│  "Who exists in this document?"                         │
│                                                          │
│  Input: Full document (or chapters)                     │
│  LLM Prompt: "List all named characters/entities"       │
│  Output: Entity Registry (canonical names)              │
│                                                          │
│  Example: ["Harry Potter", "Hermione Granger",          │
│            "Uncle Vernon", "Dudley Dursley"]            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 2: SALIENCE SCORING                               │
│  "Who matters in this document?"                        │
│                                                          │
│  Metrics:                                               │
│  - Mention frequency (how often named?)                 │
│  - Centrality (how many connections?)                   │
│  - Narrative weight (protagonist vs background)         │
│  - Syntactic subject frequency (agent of actions)       │
│                                                          │
│  Output: Scored entity list                             │
│  Top entities become "tracked" for coreference          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 3: MENTION TRACKING (Hybrid)                      │
│  "Find all mentions of tracked entities"                │
│                                                          │
│  For each tracked entity:                               │
│  1. Exact match: "Harry Potter" → entity               │
│  2. First name: "Harry" → entity (if high salience)     │
│  3. Pronoun: "he/him" → entity (via dependency)         │
│  4. Descriptive: "the boy" → entity (context clues)     │
│                                                          │
│  Use spaCy dependency parsing + LLM validation          │
│  Output: All mention spans with entity links            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 4: ENTITY PROFILING (LLM)                         │
│  "What do we know about each entity?"                   │
│                                                          │
│  For top N entities, extract:                           │
│  - Attributes: age, role, appearance, personality       │
│  - Relationships: family, friends, enemies              │
│  - Key facts: occupation, origin, goals                 │
│                                                          │
│  LLM Prompt: "Read all mentions of X. Summarize."       │
│  Output: Structured entity profiles                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  PASS 5: RELATION EXTRACTION (LLM-Guided)               │
│  "How are entities connected?"                          │
│                                                          │
│  For each sentence with 2+ tracked entities:            │
│  1. Extract via dependency paths (fast)                 │
│  2. Validate with LLM (high precision)                  │
│  3. Build relation graph                                │
│                                                          │
│  Output: Relations with confidence scores               │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  OUTPUT: KNOWLEDGE GRAPH                                │
│  - Entities with profiles                               │
│  - Relations with evidence                              │
│  - Wiki-ready structured data                           │
└─────────────────────────────────────────────────────────┘
```

---

## Pass 1: Character Census (LLM)

### Purpose
Get the "ground truth" list of who/what exists in the document by asking an LLM to read and list all entities.

### Implementation

```typescript
async function characterCensus(
  fullText: string,
  options: {
    chunkSize?: number;  // Process in chunks for long docs
    entityTypes?: string[];  // What to look for
  }
): Promise<EntityRegistry> {

  const prompt = `Read this text and list ALL named entities (people, places, organizations, objects).

For each entity, provide:
- Canonical name (most complete form)
- Type (PERSON, PLACE, ORG, OBJECT)
- First appearance (approximate)

Text:
"""
${fullText}
"""

Return JSON array:
[
  {"name": "Harry Potter", "type": "PERSON", "aliases": ["Harry"]},
  {"name": "Privet Drive", "type": "PLACE", "aliases": ["the house"]},
  ...
]`;

  const llmResponse = await ollama.generate({
    model: 'llama3.1',
    prompt: prompt,
    format: 'json'
  });

  const entities = parseEntityList(llmResponse.response);
  return buildEntityRegistry(entities);
}
```

### Why This Works
- **Context-aware**: LLM reads entire document (or chapters)
- **Common sense**: Knows "Uncle Vernon" is a person, not an org
- **Alias detection**: Understands "Harry" = "Harry Potter"
- **Narrative understanding**: Filters out metaphors, false positives

---

## Pass 2: Salience Scoring

### Purpose
Not all entities are equal. Harry Potter appears 500 times; "Ernie Prang" appears once. Focus on who **matters**.

### Metrics

1. **Mention Frequency**
   ```
   salience_score = log(mention_count + 1) * 10
   ```

2. **Syntactic Subject Frequency** (agent of actions)
   ```typescript
   // Count how often entity is nsubj (subject) in dependency trees
   const subjectCount = sentences.filter(s =>
     s.dependencies.some(dep =>
       dep.relation === 'nsubj' && dep.token === entityName
     )
   ).length;
   ```

3. **Centrality in Relation Graph**
   ```typescript
   // Entities with many connections are important
   const relationDegree = relations.filter(r =>
     r.subject === entity.id || r.object === entity.id
   ).length;
   ```

4. **Narrative Weight** (LLM-based)
   ```typescript
   // Ask LLM to rate importance
   const prompt = `On a scale 1-10, how important is "${entityName}" to this story?`;
   ```

### Implementation

```typescript
interface SalienceScore {
  entity_id: string;
  mention_freq: number;      // Raw count
  subject_freq: number;      // Times as agent
  relation_degree: number;   // Connection count
  narrative_weight: number;  // LLM rating (1-10)
  total_score: number;       // Weighted sum
}

async function scoreSalience(
  entities: Entity[],
  fullText: string,
  parsedSentences: ParsedSentence[]
): Promise<SalienceScore[]> {

  const scores = entities.map(entity => {
    const mentionFreq = countMentions(entity, fullText);
    const subjectFreq = countAsSubject(entity, parsedSentences);
    const relationDegree = countRelations(entity, relations);

    return {
      entity_id: entity.id,
      mention_freq: mentionFreq,
      subject_freq: subjectFreq,
      relation_degree: relationDegree,
      narrative_weight: 5, // Default, enhance with LLM later
      total_score: (
        Math.log(mentionFreq + 1) * 10 +
        subjectFreq * 5 +
        relationDegree * 3
      )
    };
  });

  // Sort by total score (descending)
  return scores.sort((a, b) => b.total_score - a.total_score);
}
```

### Output
Track only top N entities (e.g., top 20 for a chapter, top 100 for a book).

---

## Pass 3: Mention Tracking (Hybrid)

### Purpose
Find ALL mentions of tracked entities using multiple strategies.

### Strategies

#### 1. Exact Match (Fast, High Precision)
```typescript
const exactMatches = findExactMatches(text, entity.canonical_name);
```

#### 2. Alias Match (Medium Precision)
```typescript
// If entity is high-salience, match first name
if (entity.salience_score > THRESHOLD) {
  const aliasMatches = findExactMatches(text, entity.first_name);
}
```

#### 3. Pronoun Resolution (spaCy + Rules)
```typescript
// Use dependency parsing to link pronouns
// "Harry opened the door. He walked inside."
// dep: "He" → coreference → "Harry"

function resolvePronouns(
  sentence: ParsedSentence,
  trackedEntities: Entity[]
): Map<number, string> {

  const pronouns = sentence.tokens.filter(t =>
    t.pos === 'PRON' && ['he', 'she', 'it', 'they'].includes(t.text.toLowerCase())
  );

  const resolved = new Map<number, string>(); // token_idx -> entity_id

  for (const pronoun of pronouns) {
    // Strategy 1: Look back for nearest matching entity (gender + number)
    const candidate = findNearestEntity(sentence, pronoun, trackedEntities);

    // Strategy 2: Check syntactic dependencies
    const headVerb = findHeadVerb(sentence, pronoun);
    if (headVerb) {
      const subject = findSubject(sentence, headVerb);
      if (subject && isTracked(subject)) {
        resolved.set(pronoun.idx, subject.entity_id);
      }
    }
  }

  return resolved;
}
```

#### 4. Descriptive Reference (LLM Validation)
```typescript
// "the boy wizard" → Harry Potter
// "the groundskeeper" → Hagrid

async function resolveDescriptive(
  phrase: string,
  trackedEntities: Entity[],
  context: string
): Promise<Entity | null> {

  const prompt = `Given this context:
"""
${context}
"""

Does the phrase "${phrase}" refer to one of these entities?
${trackedEntities.map(e => `- ${e.name}`).join('\n')}

If yes, return the entity name. If no, return "NONE".`;

  const response = await ollama.generate({
    model: 'llama3.1',
    prompt: prompt
  });

  const matchedName = response.response.trim();
  return trackedEntities.find(e => e.name === matchedName) || null;
}
```

---

## Pass 4: Entity Profiling (LLM)

### Purpose
Build rich knowledge about each entity by aggregating all their mentions.

### Implementation

```typescript
interface EntityProfile {
  entity_id: string;
  canonical_name: string;

  // Extracted attributes
  attributes: {
    age?: string;
    gender?: string;
    occupation?: string;
    appearance?: string;
    personality?: string[];
  };

  // Relationships
  relationships: {
    entity_id: string;
    relation_type: string;  // "friend", "family", "enemy"
    evidence: string[];
  }[];

  // Key facts
  facts: string[];

  // Summary
  summary: string;
}

async function buildEntityProfile(
  entity: Entity,
  allMentions: Mention[],
  fullText: string
): Promise<EntityProfile> {

  // Collect all sentences mentioning this entity
  const mentionContexts = allMentions.map(m =>
    extractContext(fullText, m.start, m.end, 200)
  );

  const prompt = `You are analyzing a character in a story.

Character: ${entity.name}

All mentions and context:
${mentionContexts.map((ctx, i) => `${i+1}. ${ctx}`).join('\n\n')}

Extract:
1. Physical attributes (age, gender, appearance)
2. Occupation/role
3. Personality traits
4. Key relationships (who are they connected to?)
5. Important facts or events

Return as JSON:
{
  "attributes": {
    "age": "...",
    "occupation": "...",
    "appearance": "...",
    "personality": ["trait1", "trait2"]
  },
  "relationships": [
    {"person": "...", "type": "friend/family/enemy", "evidence": "..."}
  ],
  "facts": ["fact1", "fact2"],
  "summary": "2-3 sentence character summary"
}`;

  const llmResponse = await ollama.generate({
    model: 'llama3.1',
    prompt: prompt,
    format: 'json'
  });

  return JSON.parse(llmResponse.response);
}
```

---

## Pass 5: Relation Extraction (LLM-Guided)

### Strategy: Fast Extraction + LLM Validation

```typescript
async function extractRelationsLLMGuided(
  sentences: ParsedSentence[],
  trackedEntities: Entity[]
): Promise<Relation[]> {

  const relations: Relation[] = [];

  for (const sentence of sentences) {
    // Step 1: Fast dependency-based extraction
    const candidateRelations = extractViaDependencyPaths(sentence);

    // Step 2: Filter to only tracked entities
    const relevantRelations = candidateRelations.filter(r =>
      isTracked(r.subject) && isTracked(r.object)
    );

    // Step 3: LLM validation for high-value relations
    for (const rel of relevantRelations) {
      const confidence = await validateRelationWithLLM(
        rel,
        sentence.text,
        trackedEntities
      );

      if (confidence > 0.7) {
        relations.push({...rel, confidence});
      }
    }
  }

  return relations;
}

async function validateRelationWithLLM(
  relation: Relation,
  sentenceText: string,
  entities: Entity[]
): Promise<number> {

  const prompt = `Does this sentence express the relation "${relation.predicate}" between "${relation.subject}" and "${relation.object}"?

Sentence: "${sentenceText}"

Answer with confidence (0.0 to 1.0):`;

  const response = await ollama.generate({
    model: 'llama3.1',
    prompt: prompt
  });

  return parseFloat(response.response) || 0;
}
```

---

## Benefits of Multi-Pass Architecture

### 1. **Context-Aware**
- LLM reads full document, understands narrative flow
- Knows who matters vs background characters

### 2. **Robust**
- Multiple extraction strategies (exact, alias, pronoun, descriptive)
- LLM validation catches edge cases

### 3. **Scalable**
- Process books in chapters (Pass 1 per chapter)
- Aggregate entity registry across chapters
- Track character arcs across 100K+ words

### 4. **Rich Output**
- Not just entity names, but **profiles** with attributes
- Not just relations, but **evidence** and confidence
- Wiki-ready structured knowledge

---

## Implementation Plan

### Phase 1: Character Census (Week 1)
- [ ] Implement `characterCensus()` with Ollama
- [ ] Test on Harry Potter Chapter 1 (2,250 words)
- [ ] Validate: Should detect all 8+ main characters

### Phase 2: Salience Scoring (Week 1)
- [ ] Implement mention frequency counter
- [ ] Implement subject frequency (via spaCy dependency)
- [ ] Sort entities by salience
- [ ] Test: Harry should score highest

### Phase 3: Mention Tracking (Week 2)
- [ ] Exact + alias matching
- [ ] Pronoun resolution (spaCy-based)
- [ ] Descriptive reference (LLM validation)
- [ ] Test: Should find 50+ mentions of Harry, not just 1

### Phase 4: Entity Profiling (Week 2)
- [ ] Collect all mentions per entity
- [ ] LLM-based profile extraction
- [ ] Test: Should extract "11 years old", "black hair", "scar on forehead"

### Phase 5: Relation Extraction (Week 3)
- [ ] Dependency-based fast extraction
- [ ] LLM validation layer
- [ ] Test: Should find Harry-Vernon (lives_with), Harry-Hermione (friend_of)

---

## Example: Harry Potter Chapter 1

### Current System (2% effective)
```
Entities: 1 ("Harry")
Relations: 0
Profiles: None
```

### Multi-Pass System (Target: 90%+ effective)
```
PASS 1 - Character Census:
  - Harry Potter (PERSON)
  - Dudley Dursley (PERSON)
  - Vernon Dursley (PERSON)
  - Petunia Dursley (PERSON)
  - Albus Dumbledore (PERSON)
  - Minerva McGonagall (PERSON)
  - Rubeus Hagrid (PERSON)
  - Privet Drive (PLACE)
  - Hogwarts (PLACE)

PASS 2 - Salience Scores:
  1. Harry Potter (score: 85) - 47 mentions, 12 as subject
  2. Vernon Dursley (score: 62) - 23 mentions, 8 as subject
  3. Dudley Dursley (score: 51) - 18 mentions, 5 as subject
  ... (top 20 tracked)

PASS 3 - Mention Tracking:
  Harry Potter: 47 mentions
    - Exact: "Harry Potter" (3)
    - Alias: "Harry" (35)
    - Pronoun: "he/him" (8)
    - Descriptive: "the boy" (1)

PASS 4 - Entity Profile (Harry):
  Age: 11 years old
  Appearance: Small, thin, black hair, round glasses, lightning scar
  Personality: Curious, brave, mistreated
  Relationships:
    - Vernon Dursley (guardian, negative)
    - Dudley Dursley (cousin, bullied by)
    - Albus Dumbledore (mysterious connection)
  Facts:
    - Lives in cupboard under stairs
    - Parents died when he was one year old
    - Strange things happen around him

PASS 5 - Relations:
  - lives_with(Harry Potter, Vernon Dursley)
  - cousin_of(Harry Potter, Dudley Dursley)
  - bullied_by(Harry Potter, Dudley Dursley)
  - delivered_by(Harry Potter, Hagrid)
```

---

## Next Steps

1. **Choose architecture**: Full 5-pass or start with Pass 1-2?
2. **Test LLM models**: Which local model works best? (llama3.1, mistral, phi3)
3. **Build prototype**: Implement Pass 1 character census
4. **Validate**: Test on your Harry Potter text
5. **Iterate**: Measure improvement, refine prompts

**Question for you**: Do you want to start with the full 5-pass architecture, or prove out Pass 1 (Character Census) first to see the quality jump?
