# ARES Developer Guide

This guide helps you contribute to ARES, whether you're adding new relation patterns, improving entity extraction, or extending the system.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding Relation Patterns](#adding-relation-patterns)
- [Adding Entity Types](#adding-entity-types)
- [Writing Tests](#writing-tests)
- [Debugging Extractions](#debugging-extractions)
- [Code Style](#code-style)
- [Contributing](#contributing)

## Development Setup

### Prerequisites

- Node.js 16+ and npm
- Python 3.8+ with pip
- Git
- Text editor with TypeScript support (VS Code recommended)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/ARES.git
cd ARES

# Install dependencies
make install

# Start parser service (keep running)
make parser

# Run tests to verify setup
make test
```

### Development Workflow

```bash
# Terminal 1: Parser service (must be running)
make parser

# Terminal 2: Development work
# Run tests after changes
make test

# Run specific test file
npx vitest run tests/ladder/level-2-moderate.spec.ts

# Run tests in watch mode
npx vitest watch

# Debug a specific extraction
npx ts-node scripts/debug-parse.ts
```

## Project Structure

```
ARES/
├── app/
│   ├── engine/               # Core extraction engine
│   │   ├── extract/
│   │   │   ├── orchestrator.ts    # Main pipeline
│   │   │   ├── entities.ts        # Entity extraction
│   │   │   ├── relations.ts       # Dependency-based relations
│   │   │   └── spans.ts           # Span tracking
│   │   ├── coreference.ts         # Pronoun resolution
│   │   ├── narrative-relations.ts # Pattern-based relations
│   │   ├── confidence-scoring.ts  # Quality filtering
│   │   └── schema.ts              # Type definitions
│   ├── storage/              # Persistence layer
│   └── api/                  # GraphQL API
├── tests/
│   ├── ladder/               # Progressive difficulty tests
│   ├── golden/               # Golden corpus tests
│   ├── golden_truth/         # Annotated tests
│   └── integration/          # API tests
├── scripts/                  # Utility scripts
└── docs/                     # Documentation
```

### Key Files

- **orchestrator.ts** - Main extraction pipeline, coordinates all phases
- **entities.ts** - Multi-source entity extraction (NER, dependency, patterns)
- **relations.ts** - Dependency path-based relation extraction
- **narrative-relations.ts** - Pattern-based relation extraction (regex)
- **schema.ts** - All type definitions, predicate mappings
- **coreference.ts** - Pronoun and descriptor resolution

## Adding Relation Patterns

### Step 1: Choose Extraction Method

**Dependency-based** (`relations.ts`) - For grammatical patterns:
- Subject-verb-object: "X married Y"
- Prepositional phrases: "X, son of Y"
- Compounds: "X and Y are siblings"

**Pattern-based** (`narrative-relations.ts`) - For surface patterns:
- Narrative constructions: "X and Y remained friends"
- Temporal phrases: "X married Y eight years earlier"
- Possessives: "X's daughter"

### Step 2: Define the Predicate

Add to `schema.ts`:

```typescript
export const PREDICATES = [
  // ... existing predicates
  'teaches_at',  // NEW: X teaches at Y
] as const;

export type Predicate = typeof PREDICATES[number];

// Add inverse if needed
export const INVERSE: Partial<Record<Predicate, Predicate>> = {
  parent_of: 'child_of',
  child_of: 'parent_of',
  teaches_at: 'has_teacher',  // NEW
  has_teacher: 'teaches_at',  // NEW
  // ...
};
```

### Step 3A: Add Dependency Pattern

In `relations.ts`, add a new pattern function:

```typescript
/**
 * Pattern: "X teaches at Y"
 * Example: "Professor Snape teaches at Hogwarts"
 */
function extractTeachesAt(
  sent: Sentence,
  entities: Map<number, Entity>
): Relation[] {
  const relations: Relation[] = [];

  for (const tok of sent.tokens) {
    // Find "teaches" verb
    if (tok.lemma === 'teach' && tok.pos === 'VERB') {
      // Find subject (teacher)
      const subject = sent.tokens.find(
        t => t.dep === 'nsubj' && t.head === tok.i
      );

      // Find location (prep "at" + object)
      const atPrep = sent.tokens.find(
        t => t.dep === 'prep' && t.lemma === 'at' && t.head === tok.i
      );

      if (!subject || !atPrep) continue;

      const location = sent.tokens.find(
        t => t.dep === 'pobj' && t.head === atPrep.i
      );

      if (!location) continue;

      // Resolve to entities
      const teacherEntity = findEntityByToken(subject, entities);
      const schoolEntity = findEntityByToken(location, entities);

      if (!teacherEntity || !schoolEntity) continue;

      // Type guard: teacher must be PERSON, school must be ORG or PLACE
      if (teacherEntity.type !== 'PERSON') continue;
      if (!['ORG', 'PLACE'].includes(schoolEntity.type)) continue;

      relations.push({
        id: uuid(),
        subj: teacherEntity.id,
        pred: 'teaches_at',
        obj: schoolEntity.id,
        evidence: [{
          doc_id: 'current',
          span: extractSpan(sent, subject.i, location.i),
          sentence_index: sent.index,
          source: 'RULE'
        }],
        confidence: 0.9,
        extractor: 'dependency',
        symmetric: false
      });
    }
  }

  return relations;
}

// Add to extraction function
export async function extractRelations(
  parsed: ParseResponse,
  entities: Entity[]
): Promise<Relation[]> {
  const relations: Relation[] = [];

  for (const sent of parsed.sentences) {
    // ... existing patterns
    relations.push(...extractTeachesAt(sent, entityMap));
  }

  return relations;
}
```

### Step 3B: Add Narrative Pattern

In `narrative-relations.ts`, add to the patterns array:

```typescript
const NARRATIVE_PATTERNS: NarrativePattern[] = [
  // ... existing patterns

  {
    name: 'teaches_at',
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:teaches|taught|lectures)\s+at\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    predicate: 'teaches_at',
    subjectGroup: 1,
    objectGroup: 2,
    subjectType: ['PERSON'],
    objectType: ['ORG', 'PLACE'],
    symmetric: false,
    confidence: 0.85
  },

  // ... more patterns
];
```

### Step 4: Add Tests

Create a test in `tests/ladder/` or add to existing test:

```typescript
describe('teaches_at relation', () => {
  it('should extract teacher-school relation', async () => {
    const text = 'Professor Snape teaches at Hogwarts School.';
    const result = await extractFromSegments('test', text);

    const snape = result.entities.find(e => e.canonical === 'Snape');
    const hogwarts = result.entities.find(e => e.canonical === 'Hogwarts');

    expect(snape).toBeDefined();
    expect(hogwarts).toBeDefined();

    const teachesAt = result.relations.find(
      r => r.pred === 'teaches_at' &&
           r.subj === snape?.id &&
           r.obj === hogwarts?.id
    );

    expect(teachesAt).toBeDefined();
  });

  it('should handle past tense', async () => {
    const text = 'McGonagall taught at Hogwarts for decades.';
    const result = await extractFromSegments('test', text);

    const relation = result.relations.find(r => r.pred === 'teaches_at');
    expect(relation).toBeDefined();
  });
});
```

### Step 5: Run Tests

```bash
# Run all tests
make test

# Run specific test file
npx vitest run tests/ladder/your-test.spec.ts

# Debug output
L3_DEBUG=1 npx vitest run tests/ladder/level-3-complex.spec.ts
```

### Step 6: Add to Documentation

Update the pattern count in README.md and add an example to this guide!

## Adding Entity Types

### Step 1: Define the Type

Add to `schema.ts`:

```typescript
export const ENTITY_TYPES = [
  'PERSON',
  'PLACE',
  'ORG',
  'DATE',
  'THING',
  'EVENT',       // NEW: For battles, ceremonies, etc.
  'CONCEPT',     // NEW: For abstract ideas
] as const;

export type EntityType = typeof ENTITY_TYPES[number];
```

### Step 2: Add to Extraction Logic

In `entities.ts`, add type detection:

```typescript
function classifyEntityType(
  entity: string,
  context: string,
  nerType?: string
): EntityType {
  // ... existing logic

  // Event detection
  if (context.match(/\b(battle|war|ceremony|festival|celebration)\s+of\s+/i)) {
    return 'EVENT';
  }

  // Concept detection
  if (context.match(/\b(concept|idea|theory|principle)\s+of\s+/i)) {
    return 'CONCEPT';
  }

  // ... fallback logic
}
```

### Step 3: Add Type Guards

Add guards in `relations.ts` for predicates that need specific types:

```typescript
const TYPE_GUARDS: Record<Predicate, [EntityType[], EntityType[]]> = {
  parent_of: [['PERSON'], ['PERSON']],
  married_to: [['PERSON'], ['PERSON']],
  works_at: [['PERSON'], ['ORG', 'PLACE']],
  participated_in: [['PERSON', 'ORG'], ['EVENT']],  // NEW
  // ...
};
```

## Writing Tests

### Test Structure

ARES uses a ladder-based test system:

- **Level 1** (ladder-1-basic.spec.ts) - Simple patterns, obvious relations
- **Level 2** (ladder-2-moderate.spec.ts) - Moderate complexity
- **Level 3** (ladder-3-complex.spec.ts) - Complex grammar, edge cases

### Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

describe('Your Feature', () => {
  it('should extract basic pattern', async () => {
    const text = 'Your test text here.';
    const result = await extractFromSegments('test-id', text);

    // Check entities
    const entity = result.entities.find(e => e.canonical === 'ExpectedName');
    expect(entity).toBeDefined();
    expect(entity?.type).toBe('PERSON');

    // Check relations
    const relation = result.relations.find(r => r.pred === 'expected_predicate');
    expect(relation).toBeDefined();
    expect(relation?.subj).toBe(entity?.id);

    // Check evidence
    expect(relation?.evidence).toHaveLength(1);
    expect(relation?.evidence[0].source).toBe('RULE');
  });

  it('should handle edge case', async () => {
    // Test your edge case
  });
});
```

### Golden Truth Tests

For regression testing, add to `tests/golden_truth/`:

```json
{
  "id": "education-001",
  "text": "Professor McGonagall teaches at Hogwarts.",
  "expected": {
    "entities": [
      {
        "canonical": "McGonagall",
        "type": "PERSON",
        "span": [10, 21]
      },
      {
        "canonical": "Hogwarts",
        "type": "ORG",
        "span": [32, 40]
      }
    ],
    "relations": [
      {
        "predicate": "teaches_at",
        "subject": "McGonagall",
        "object": "Hogwarts"
      }
    ]
  }
}
```

## Debugging Extractions

### Debug Parser Output

Create a debug script:

```typescript
// scripts/debug-my-extraction.ts
import { parseText } from '../app/engine/parser-client';

const text = 'Your problematic text here.';

async function main() {
  const parsed = await parseText(text, 'http://127.0.0.1:8000');

  console.log('=== TOKENS ===');
  for (const sent of parsed.sentences) {
    for (const tok of sent.tokens) {
      console.log(`${tok.i}: ${tok.text} [${tok.pos}] (${tok.dep} → ${tok.head})`);
    }
  }

  console.log('\n=== NER TAGS ===');
  for (const ent of parsed.entities) {
    console.log(`${ent.text} [${ent.label}] (${ent.start}-${ent.end})`);
  }
}

main();
```

Run it:
```bash
npx ts-node scripts/debug-my-extraction.ts
```

### Debug Extraction Pipeline

Add logging to `orchestrator.ts`:

```typescript
const DEBUG = process.env.ARES_DEBUG === '1';

if (DEBUG) {
  console.log('[ENTITIES]', entities.length);
  console.log('[RELATIONS]', relations.length);
  console.log('[CONFIDENCE FILTER]', filteredEntities.length);
}
```

Run with debug:
```bash
ARES_DEBUG=1 npx ts-node your-test.ts
```

### Common Issues

**Entities not extracted?**
- Check spaCy NER output (debug parser)
- Verify entity passes confidence threshold (0.5)
- Check if fallback extraction is too restrictive

**Relations not extracted?**
- Debug dependency parse (is structure what you expect?)
- Check entity types (type guard may be blocking)
- Verify pattern regex matches (test in regex101.com)

**Wrong entity types?**
- Check context classification in `entities.ts`
- Add to KNOWN_ORGS or KNOWN_PLACES whitelist
- Improve type detection heuristics

## Code Style

### TypeScript Style

```typescript
// Use explicit types
function extractPattern(text: string): Relation[] {
  // ...
}

// Use const assertions for arrays
const PATTERNS = ['pattern1', 'pattern2'] as const;

// Use interfaces for complex types
interface ExtractionOptions {
  confidence?: number;
  sources?: ExtractionSource[];
}

// Prefer functional style
const filtered = entities.filter(e => e.confidence > 0.5);

// Add JSDoc for public functions
/**
 * Extracts entities from parsed text
 * @param parsed - spaCy parse response
 * @param options - Extraction options
 * @returns Array of entities
 */
export function extractEntities(
  parsed: ParseResponse,
  options?: ExtractionOptions
): Entity[] {
  // ...
}
```

### Naming Conventions

- **Functions**: `extractPattern`, `computeConfidence` (camelCase, verb prefix)
- **Types**: `Entity`, `Relation`, `ParseResponse` (PascalCase)
- **Constants**: `KNOWN_ORGS`, `PREDICATES` (UPPER_SNAKE_CASE)
- **Files**: `entity-profiler.ts`, `narrative-relations.ts` (kebab-case)

### File Organization

```typescript
// 1. Imports (external first, then internal)
import { v4 as uuid } from 'uuid';
import { Entity, Relation } from './schema';

// 2. Constants
const MAX_DISTANCE = 100;
const CONFIDENCE_THRESHOLD = 0.5;

// 3. Types/Interfaces
interface ExtractionContext {
  // ...
}

// 4. Helper functions (private)
function helperFunction() {
  // ...
}

// 5. Main exported functions
export function mainFunction() {
  // ...
}
```

## Contributing

### Workflow

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/my-feature`
3. **Make changes** and add tests
4. **Run tests**: `make test`
5. **Commit**: `git commit -m "Add: my feature description"`
6. **Push**: `git push origin feature/my-feature`
7. **Create PR** on GitHub

### Commit Messages

Use conventional commit format:

- `Add: new feature` - New functionality
- `Fix: bug description` - Bug fixes
- `Update: modification` - Changes to existing features
- `Refactor: code improvement` - Code restructuring
- `Test: test additions` - New tests
- `Docs: documentation update` - Documentation changes

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] All existing tests pass
- [ ] New tests added for changes
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
```

## Advanced Topics

### Custom Extraction Phases

To add a custom extraction phase to the pipeline:

1. Create your phase function in a new file
2. Import in `orchestrator.ts`
3. Add to the pipeline at appropriate point
4. Update tests to cover new phase

### Performance Optimization

Tips for optimizing extraction:

- **Cache entity lookups** - Use Map instead of array.find()
- **Limit regex backtracking** - Use atomic groups, possessive quantifiers
- **Batch API calls** - Send multiple sentences to parser at once
- **Lazy evaluation** - Only compute what's needed

### Integration with External Tools

ARES can be integrated with:

- **Knowledge bases** - Export to RDF, Neo4j, etc.
- **Note-taking apps** - Obsidian, Notion, Roam
- **Visualization tools** - Gephi, Cytoscape
- **LLM pipelines** - Use as retrieval step for RAG

---

## Getting Help

- **Issues**: Report bugs at GitHub Issues
- **Discussions**: Ask questions in GitHub Discussions
- **Tests**: Look at existing tests for examples
- **Code**: Read the source code (it's well-commented!)

**Happy coding!** 🚀
