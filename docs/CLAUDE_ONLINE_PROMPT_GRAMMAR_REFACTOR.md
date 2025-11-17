# PROMPT FOR CLAUDE ONLINE: Implement English Grammar Rules for ARES Pronoun Resolution

## 🎯 Mission
Refactor ARES (Advanced Relation Extraction System) to properly handle pronouns using formal English grammar rules from Grammar Monster (https://www.grammar-monster.com/). Currently, pronouns are stored as permanent entity aliases, causing catastrophic entity merging bugs. They should be temporary context-window pointers for coreference resolution.

---

## 📁 Project Structure

### Repository
- **Location**: `/Users/corygilford/ares`
- **Language**: TypeScript + Node.js backend, Python parser service
- **Database**: JSON file storage (`ares_graph.json`)
- **Frontend**: React + Vite (Extraction Lab UI at `http://localhost:3001/lab`)

### Critical Files for This Task

#### 1. Coreference Resolution (WHERE PRONOUNS ARE ADDED)
- **File**: `/Users/corygilford/ares/app/engine/extract/coreference.ts`
- **Current behavior**: Adds pronouns like "he", "she" to `entity.aliases` array
- **What to change**: Resolve pronouns to entity IDs, then discard

#### 2. Entity Schema (DATA MODEL)
- **File**: `/Users/corygilford/ares/app/engine/schema.ts`
- **Current**: `Entity.aliases: string[]` includes pronouns
- **Needed**: Separate pronoun resolution from aliases

#### 3. Entity Extraction Orchestrator (MAIN PIPELINE)
- **File**: `/Users/corygilford/ares/app/engine/extract/orchestrator.ts`
- **Purpose**: Coordinates all extraction steps
- **Integration point**: Where coreference results are merged with entities

#### 4. Relation Extraction (WHERE PRONOUNS MATTER)
- **File**: `/Users/corygilford/ares/app/engine/extract/relations.ts`
- **Purpose**: Extracts subject-predicate-object relations
- **Needs**: Pronoun-resolved entity IDs for accurate relation attribution

#### 5. Entity Merging (WHERE CURRENT BUG MANIFESTS)
- **File**: `/Users/corygilford/ares/app/engine/merge.ts`
- **Current issue**: All male entities merge because they share "he" alias
- **Band-aid fix**: Lines 104-141 filter pronouns from matching (temporary solution)
- **Real fix**: Don't store pronouns in aliases at all

#### 6. Storage Layer
- **File**: `/Users/corygilford/ares/app/storage/storage.ts`
- **Purpose**: Saves/loads knowledge graph, handles cross-document merges
- **Impact**: Needs to work with new pronoun-free alias model

### Supporting Files
- **Config**: `/Users/corygilford/ares/config/extraction.json` - Extraction parameters
- **Types**: `/Users/corygilford/ares/app/engine/schema.ts` - All TypeScript types
- **Tests**: `/Users/corygilford/ares/tests/` - Test suite for validation

---

## 🐛 Current Problem

### What's Broken
**Example narrative**: "Frederick walked to the house. He knocked on the door. Saul appeared. He spoke to Frederick."

**Current (wrong) behavior**:
```typescript
// After coreference resolution:
entity_frederick.aliases = ["Frederick", "Freddy", "he", "him", "his"]
entity_saul.aliases = ["Saul", "he", "him", "his"]

// During cross-document merge:
// Merge algorithm sees "he" in both entities → MERGES THEM
// Result: Frederick and Saul become the same entity! ❌
```

**Logs proving the bug**:
```
[MERGE] Merging "Frederick" into cluster 0 (matched: "he" ↔ "he")
[MERGE] Merging "Saul" into cluster 0 (matched: "he" ↔ "he")
[MERGE] Type PERSON: 1 cluster from 2 entities  // WRONG - should be 2 clusters!
```

### Why It's Wrong
Pronouns are **context-dependent temporary references**, not permanent entity identifiers:
- "he" in sentence 2 → Frederick (most recent male subject)
- "he" in sentence 4 → Saul (new context, new male subject)

Storing "he" as a permanent alias destroys this context-sensitivity.

---

## ✅ Correct Architecture (What to Implement)

### Phase 1: Pronoun Resolution (Within Extraction)
```typescript
// During extraction of: "Frederick walked. He knocked."

// Step 1: Identify pronoun and its antecedent
const pronoun = "He";
const antecedent = findAntecedent(pronoun, context); // → Frederick

// Step 2: Resolve to entity ID
const entityId = antecedent.id; // "extract-123_entity_0"

// Step 3: Create relation with resolved ID
const relation = {
  subj: entityId,  // Resolved! Not "He"
  pred: "knocked",
  obj: null
};

// Step 4: DISCARD pronoun binding
// DO NOT: entity.aliases.push("He") ❌
// Pronoun was used for resolution, now forgotten ✅
```

### Phase 2: Grammar Rules to Implement

Reference: **https://www.grammar-monster.com/**

#### 1. Antecedent Resolution Rules
**Source**: https://www.grammar-monster.com/glossary/antecedent.htm

```typescript
function findAntecedent(pronoun: string, context: Sentence[]): Entity {
  // Rule 1: Agreement (gender, number, person)
  const candidates = filterByAgreement(pronoun, context.entities);

  // Rule 2: Recency (nearest appropriate noun)
  const nearest = findNearestEntity(candidates, pronoun.position);

  // Rule 3: Salience (subjects preferred over objects)
  const salient = preferGrammaticalSubjects(candidates);

  // Rule 4: Syntactic constraints (same clause vs cross-clause)
  return applySyntacticRules(nearest, salient, context);
}
```

#### 2. Agreement Rules
**Pronouns must match antecedent**:
- **Gender**: he → male, she → female, it → neuter
- **Number**: he/she/it → singular, they → plural
- **Person**: I/we → 1st, you → 2nd, he/she/it/they → 3rd

#### 3. Context Window Rules
```typescript
// Sentence-level resolution (primary)
"Frederick knocked. He entered."
// → "He" resolves to Frederick (same sentence cluster)

// Paragraph-level resolution (secondary)
"Frederick approached the house.\n\nHe knocked on the door."
// → "He" still resolves to Frederick (paragraph continuation)

// Context reset (new paragraph with new subject)
"Frederick left. Saul arrived.\n\nHe looked around."
// → "He" resolves to Saul (most recent male subject in new context)
```

#### 4. Salience Hierarchy
**Grammatical subjects are preferred antecedents**:
```typescript
"Frederick told Saul about the plan. He agreed."
// Candidates: Frederick (subject), Saul (object)
// Resolution: "He" → Saul (most recent, but also nearest object)
// Correct: Need to check verb semantics ("agreed" suggests Saul)
```

### Phase 3: Data Model Changes

#### Option A: Separate Pronoun Tracking (Recommended)
```typescript
interface Entity {
  id: string;
  type: EntityType;
  canonical: string;
  aliases: string[];  // Real names only (no pronouns!)
  // ... other fields
}

interface PronounBinding {
  pronoun: string;       // "he", "she", etc.
  entity_id: string;     // Entity this pronoun refers to
  sentence_id: string;   // Context where binding is valid
  confidence: number;    // Resolution confidence (0-1)
}

// During extraction:
const pronounBindings: PronounBinding[] = [];  // Build this
// Use it for relation extraction, then discard
// Never store in entity.aliases
```

#### Option B: Relation-Only Resolution (Simpler)
```typescript
// Don't track pronouns at all as separate objects
// Just resolve them inline during relation extraction:

function extractRelation(sentence: ParsedSentence): Relation {
  let subj = sentence.subject;

  // If subject is pronoun, resolve it
  if (isPronoun(subj)) {
    subj = resolveToEntityId(subj, sentence.context);
  }

  return {
    subj: subj,  // Always an entity ID, never a pronoun
    pred: sentence.verb,
    obj: resolveIfPronoun(sentence.object)
  };
}
```

---

## 📚 Grammar Monster Rules to Implement

### Must-Read Pages
1. **Pronouns**: https://www.grammar-monster.com/lessons/pronouns.htm
   - Types: personal, possessive, reflexive, demonstrative
   - Usage rules and common mistakes

2. **Antecedents**: https://www.grammar-monster.com/glossary/antecedent.htm
   - Finding the noun a pronoun refers to
   - Agreement rules

3. **Sentence Structure**: https://www.grammar-monster.com/glossary/sentence_structure.htm
   - Subject-verb-object patterns
   - Clause types and dependencies

4. **Parts of Speech**: https://www.grammar-monster.com/lessons/parts_of_speech.htm
   - Identifying nouns, pronouns, verbs
   - Grammatical roles

### Key Grammar Concepts

#### Pronoun Types (from Grammar Monster)
```typescript
const PRONOUN_CATEGORIES = {
  personal: {
    subjective: ['I', 'you', 'he', 'she', 'it', 'we', 'they'],
    objective: ['me', 'you', 'him', 'her', 'it', 'us', 'them'],
    possessive: ['my', 'mine', 'your', 'yours', 'his', 'her', 'hers', 'its', 'our', 'ours', 'their', 'theirs']
  },
  demonstrative: ['this', 'that', 'these', 'those'],
  reflexive: ['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves'],
  indefinite: ['anyone', 'everyone', 'someone', 'no one', 'anybody', 'everybody', 'somebody', 'nobody']
};
```

#### Agreement Rules (from Grammar Monster)
```typescript
function checkAgreement(pronoun: string, antecedent: Entity): boolean {
  // Gender agreement
  if (pronoun === 'he' && antecedent.gender !== 'male') return false;
  if (pronoun === 'she' && antecedent.gender !== 'female') return false;

  // Number agreement
  const pluralPronouns = ['they', 'them', 'their', 'we', 'us', 'our'];
  if (pluralPronouns.includes(pronoun) && antecedent.number !== 'plural') return false;

  return true;
}
```

---

## 🎯 Implementation Tasks

### Task 1: Create Pronoun Resolution Module
**File**: Create `/Users/corygilford/ares/app/engine/extract/pronoun-resolver.ts`

```typescript
/**
 * Pronoun Resolution Module
 * Implements Grammar Monster rules for antecedent identification
 */

export interface PronounResolution {
  pronoun: string;
  entity_id: string;
  antecedent_text: string;
  confidence: number;
  method: 'recency' | 'salience' | 'agreement' | 'syntax';
}

export function resolvePronoun(
  pronoun: string,
  sentence: ParsedSentence,
  context: ParsedSentence[],
  entities: Entity[]
): PronounResolution | null {
  // 1. Filter candidates by agreement (gender, number)
  const candidates = entities.filter(e =>
    checkGenderAgreement(pronoun, e) &&
    checkNumberAgreement(pronoun, e)
  );

  // 2. Apply recency (nearest appropriate antecedent)
  const byRecency = rankByRecency(candidates, pronoun.position);

  // 3. Apply salience (prefer grammatical subjects)
  const bySalience = rankBySalience(candidates, context);

  // 4. Combine rankings and return best match
  return selectBestAntecedent(byRecency, bySalience);
}
```

### Task 2: Refactor Coreference Resolution
**File**: `/Users/corygilford/ares/app/engine/extract/coreference.ts`

**Current**: Adds pronouns to entity.aliases
**Change to**: Returns pronoun→entity mappings, doesn't modify aliases

```typescript
// OLD (wrong):
function resolveCoreferences(entities: Entity[], text: string) {
  // ... finds that "he" refers to Frederick
  frederick.aliases.push("he");  // ❌ WRONG
}

// NEW (correct):
function resolveCoreferences(
  entities: Entity[],
  sentences: ParsedSentence[]
): PronounResolution[] {
  const resolutions: PronounResolution[] = [];

  for (const sentence of sentences) {
    for (const pronoun of sentence.pronouns) {
      const resolution = resolvePronoun(pronoun, sentence, sentences, entities);
      if (resolution) {
        resolutions.push(resolution);
      }
    }
  }

  return resolutions;  // Return mappings, don't modify entities
}
```

### Task 3: Update Relation Extraction
**File**: `/Users/corygilford/ares/app/engine/extract/relations.ts`

Use pronoun resolutions to attribute actions correctly:

```typescript
function extractRelations(
  sentences: ParsedSentence[],
  entities: Entity[],
  pronounResolutions: PronounResolution[]  // NEW parameter
): Relation[] {
  const relations: Relation[] = [];

  for (const sentence of sentences) {
    let subjId = sentence.subject.entity_id;

    // If subject is pronoun, resolve it
    if (isPronoun(sentence.subject.text)) {
      const resolution = pronounResolutions.find(r =>
        r.pronoun === sentence.subject.text &&
        r.sentence_id === sentence.id
      );
      subjId = resolution?.entity_id || subjId;
    }

    relations.push({
      subj: subjId,  // Always entity ID
      pred: sentence.verb,
      obj: resolveIfPronoun(sentence.object, pronounResolutions)
    });
  }

  return relations;
}
```

### Task 4: Remove Pronouns from Entity Merging
**File**: `/Users/corygilford/ares/app/engine/merge.ts`

**Current**: Lines 104-141 filter pronouns as band-aid
**Change to**: Remove filter (no longer needed if pronouns not in aliases)

```typescript
// Can remove isPronounOrInvalidTerm() checks
// Because entity.aliases will never contain pronouns
```

### Task 5: Add Grammar Rules Configuration
**File**: Create `/Users/corygilford/ares/config/grammar-rules.json`

```json
{
  "pronoun_resolution": {
    "context_window_sentences": 3,
    "prefer_subjects_over_objects": true,
    "require_gender_agreement": true,
    "require_number_agreement": true,
    "recency_weight": 0.6,
    "salience_weight": 0.4
  },
  "agreement_rules": {
    "gendered_pronouns": {
      "male": ["he", "him", "his"],
      "female": ["she", "her", "hers"],
      "neutral": ["it", "its", "they", "them", "their"]
    },
    "number": {
      "singular": ["I", "me", "my", "you", "he", "she", "it", "him", "her"],
      "plural": ["we", "us", "our", "you", "they", "them", "their"]
    }
  }
}
```

---

## 🧪 Testing Requirements

### Test Case 1: Basic Pronoun Resolution
```typescript
const text = "Frederick walked to the house. He knocked on the door.";

// Expected:
// - Entity: Frederick (id: "e1")
// - Relation: {subj: "e1", pred: "walked", obj: "house"}
// - Relation: {subj: "e1", pred: "knocked", obj: "door"}  // "He" resolved to Frederick
// - Frederick.aliases should NOT contain "he"
```

### Test Case 2: Multiple Entities
```typescript
const text = "Frederick approached Saul. He extended his hand.";

// Expected:
// - "He" → Frederick (most recent subject)
// - "his" → Frederick (possessive agreement)
// - Relation: {subj: "frederick_id", pred: "extended", obj: "hand"}
```

### Test Case 3: Context Switch
```typescript
const text = "Frederick left the room. Saul entered. He looked around.";

// Expected:
// - "He" → Saul (new sentence, new subject takes precedence)
// - NOT Frederick (recency > salience in new context)
```

### Test Case 4: Cross-Document Merge (No False Positive)
```typescript
// Document 1:
"Frederick knocked. He entered."

// Document 2:
"Saul appeared. He spoke."

// Expected after merge:
// - 2 separate entities (Frederick, Saul)
// - NOT merged (no "he" alias to trigger false match)
```

### Test Files
- `/Users/corygilford/ares/tests/pronoun-resolution.test.ts` (create)
- `/Users/corygilford/ares/tests/ladder/` (existing test ladder - must all pass)

---

## 🏗️ Infrastructure

### Local Development
```bash
cd /Users/corygilford/ares

# Install dependencies
npm install

# Run TypeScript compilation
npx tsc

# Start services
./launch-ares.sh
# This starts:
# - Python parser (port 8000)
# - GraphQL API (port 4000)
# - Vite frontend (port 3001)

# Run tests
npm test
```

### Ports
- **Parser API**: http://localhost:8000/parse
- **GraphQL API**: http://localhost:4000/graphql
- **Entity Extraction**: http://localhost:4000/extract-entities
- **Frontend Lab**: http://localhost:3001/lab

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/grammar-based-pronoun-resolution

# Make changes
# Test thoroughly

# Commit
git add .
git commit -m "Implement grammar-based pronoun resolution

- Created pronoun-resolver.ts with Grammar Monster rules
- Refactored coreference.ts to return mappings instead of modifying aliases
- Updated relation extraction to use pronoun resolutions
- Removed pronouns from entity.aliases entirely
- Added grammar-rules.json configuration
- All tests passing"

# Push (if remote repo exists)
git push origin feature/grammar-based-pronoun-resolution
```

### Key Commands
```bash
# Rebuild after changes
npx tsc || true

# Restart GraphQL server
ps aux | grep "node dist/app/api/graphql.js" | grep -v grep | awk '{print $2}' | xargs kill -9
node dist/app/api/graphql.js > /tmp/ares-graphql.log 2>&1 &

# Check logs
tail -f /tmp/ares-graphql.log

# Run specific test
npx ts-node tests/pronoun-resolution.test.ts
```

---

## 📖 Additional Reading

### ARES Documentation
- Architecture: `/Users/corygilford/ares/docs/ARCHITECTURE.md` (if exists)
- Current status: Band-aid fix filtering pronouns from merge (temporary)
- Goal: Eliminate pronouns from aliases entirely

### Grammar Resources
- **Grammar Monster**: https://www.grammar-monster.com/
- **Saved reference**: `/Users/corygilford/ares/docs/references/english-grammar-rules.md`

### Coreference Resolution Papers (Academic Context)
- Stanford CoreNLP approach to pronoun resolution
- Hobbs algorithm for antecedent identification
- Neural coreference models (if implementing ML later)

---

## ⚠️ Important Notes

1. **Don't break existing tests**: The `/tests/ladder/` suite must continue passing
2. **TypeScript compilation**: Always run `npx tsc` after changes
3. **Server restart required**: Changes to `/app/` require GraphQL server restart
4. **Parser service**: Python code in `/parser/` runs separately, restart if changed
5. **Backward compatibility**: Existing graphs might have pronouns in aliases - need migration strategy

---

## 🎯 Success Criteria

### Must Achieve:
1. ✅ Pronouns never stored in `entity.aliases`
2. ✅ Pronoun resolution follows Grammar Monster rules (agreement, recency, salience)
3. ✅ Relations use entity IDs, never pronoun strings
4. ✅ Cross-document merge works without pronoun-based false positives
5. ✅ Test case: "Frederick walked. He knocked." → 1 entity, 2 relations, "he" not in aliases
6. ✅ Test case: "Frederick met Saul. He spoke." → 2 entities, correct resolution
7. ✅ All existing tests pass

### Would Be Great:
- Gender/number detection for entities (to enable agreement checking)
- Confidence scores for pronoun resolutions
- Handling of ambiguous pronouns ("he" could refer to multiple candidates)
- Support for reflexive pronouns ("himself", "herself")
- Proper noun vs common noun distinction for better salience

---

## 📞 Questions to Clarify

1. Should we add gender/number fields to Entity schema?
2. How to handle ambiguous pronouns (low confidence resolution)?
3. Migration strategy for existing graphs with pronouns in aliases?
4. Should pronoun resolutions be stored in the graph or ephemeral?
5. What confidence threshold for pronoun resolution to use?

---

## Final Checklist

Before considering this complete:
- [ ] Created `pronoun-resolver.ts` with Grammar Monster rules
- [ ] Refactored `coreference.ts` to return mappings
- [ ] Updated `relations.ts` to use pronoun resolutions
- [ ] Removed pronouns from `merge.ts` filter (no longer needed)
- [ ] Created `grammar-rules.json` config
- [ ] Added tests for pronoun resolution
- [ ] All ladder tests pass
- [ ] Documented changes
- [ ] Example: "Frederick walked. He knocked." correctly extracts 1 entity with 2 relations

---

Good luck! This refactor will transform ARES from a brittle system that breaks on pronouns into a robust NLP engine that understands English grammar. 🚀
