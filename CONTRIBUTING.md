# Contributing to ARES

Guide for developers and AI agents working on the ARES codebase.

## Quick Orientation

**Read first**:
1. `README.md` - Project overview, quick start
2. `ARCHITECTURE.md` - Pipeline details, entity lifecycle
3. This file - Development workflow

**Key insight**: ARES is deterministic and rule-based. No ML black boxes. Every extraction decision should be traceable to explicit rules.

## Development Workflow

### 1. Setup

```bash
npm install
make parser          # Start spaCy (Terminal 1) - WAIT for "Application startup complete"
npm test            # Verify baseline (Terminal 2)
```

### 2. Before Making Changes

```bash
# Verify current tests pass
npm test tests/ladder/level-1-simple.spec.ts

# Read the code you're about to modify
# Never modify what you haven't read
```

### 3. Make Incremental Changes

- **One change at a time**
- **Test after each change**
- **Don't batch multiple fixes**

### 4. Test Your Changes

```bash
npm test                                    # All tests
npm test tests/ladder/level-1-simple.spec.ts  # Specific level
L3_DEBUG=1 npm test ...                     # Verbose output
```

### 5. Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: Improve entity type classification for school names

- Add school name detection in MockParserClient
- Block common noun fragments from PERSON classification
- Target: reduce false positives in Barty Beauregard corpus
EOF
)"
```

## Core Patterns

- **Local-first**: Everything runs offline on SQLite. No cloud dependencies.
- **HERT IDs**: Stable entity references. Never use raw names in relations.
- **Evidence required**: Each fact includes source text + location.
- **Deterministic**: Same input → same output. No randomness.
- **Progressive testing**: Pass Stage 1 before Stage 2, etc.

## Code Conventions

### Entity Extraction

```typescript
// Always include provenance
const entity: Entity = {
  id: uuid(),
  type: 'PERSON',
  canonical: 'John Smith',
  aliases: ['Smith', 'Dr. Smith'],  // No pronouns!
  confidence: 0.95,
  created_at: new Date().toISOString()
};
```

### Relation Extraction

```typescript
// Always include evidence
const relation: Relation = {
  id: uuid(),
  subj: entity1.id,
  pred: 'married_to',
  obj: entity2.id,
  evidence: [{
    doc_id: docId,
    sentence_index: 5,
    span: { text: 'John married Mary', start: 100, end: 117 }
  }],
  confidence: 0.85
};
```

## Common Tasks

### Adding a New Relation Pattern

1. Add pattern to `app/engine/extract/relations.ts`
2. Add inverse to `app/engine/schema.ts`
3. Add test case to `tests/ladder/level-1-simple.spec.ts`
4. Run tests: `npm test tests/ladder/level-1-simple.spec.ts`

### Adding Entity Type Guard

1. Add to blocklist in `app/engine/linguistics/entity-heuristics.ts`
2. Or add keyword detection in `app/parser/MockParserClient.ts`

### Debugging Extraction Failures

```bash
# Enable verbose logging
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts

# Check span traces
cat tmp/span-trace.log

# Run diagnostic script
npx ts-node scripts/diagnose-l2.ts
```

## Test Structure

| Level | File | Focus |
|-------|------|-------|
| 1 | `level-1-simple.spec.ts` | Single sentences |
| 2 | `level-2-multisentence.spec.ts` | Multi-sentence |
| 3 | `level-3-complex.spec.ts` | Complex narratives |
| 5A | `level-5-cross-document.spec.ts` | Cross-doc merge |
| 5B | `level-5b-performance.spec.ts` | Performance |

## Common Pitfalls

- **Parser not running** → Tests use MockParserClient with lower quality NER
- **Breaking Stage 1** → Always rerun Stage 1 after changes
- **Over-aggressive filtering** → Watch F1, not just precision
- **Duplicating docs** → Search existing docs before creating new ones

## Debugging Tips

### Entity Not Extracted

1. Check parser is running: `curl http://127.0.0.1:8000/health`
2. Check NER label: MockParserClient defaults capitalized → PERSON
3. Check quality filter: might be blocked as common noun
4. Enable debug: `L3_DEBUG=1`

### Wrong Entity Type

1. Check ORG_KEYWORDS in MockParserClient
2. Check PLACE_KEYWORDS
3. Check entity-heuristics.ts blocklists
4. Verify with spaCy parser (not mock)

### Relation Not Extracted

1. Check dependency pattern matches
2. Check narrative pattern matches
3. Verify entity types are compatible
4. Check confidence threshold (0.65)

## Code Organization

```
app/engine/extract/    # Core extraction
app/parser/            # Parser clients
app/storage/           # SQLite persistence
app/api/               # GraphQL API
app/ui/                # Web interfaces
tests/ladder/          # Progressive tests
tests/unit/            # Unit tests
docs/                  # Reference documentation
```

## Key Files

| File | Purpose |
|------|---------|
| `app/engine/extract/orchestrator.ts` | Pipeline coordinator |
| `app/engine/extract/entities.ts` | Entity extraction |
| `app/engine/extract/relations.ts` | Relation extraction |
| `app/parser/MockParserClient.ts` | Test fallback parser |
| `app/engine/coref.ts` | Coreference resolution |

## AI Agent Notes

### Before Starting

- [ ] Read README.md and ARCHITECTURE.md
- [ ] Run `make parser` and wait for startup
- [ ] Run `npm test` to verify baseline
- [ ] Read the code you're about to modify

### Common Mistakes

1. **Modifying without reading**: Always read before edit
2. **Batching changes**: Make one change, test, repeat
3. **Breaking lower levels**: Stage 1 tests must always pass
4. **Adding complexity**: Simpler is better

### When to Ask for Help

- Linguistic ambiguity (entity merging rules, pronoun resolution)
- Architecture decisions affecting multiple modules
- Test failures that don't make sense

### Output Checklist

- [ ] All previous tests still pass
- [ ] New functionality has tests
- [ ] No redundant documentation created
- [ ] Commit message is descriptive
- [ ] Changes are minimal and focused

## Resources

- `docs/LINGUISTIC_REFERENCE.md` - Language patterns for debugging
- `docs/architecture/` - Technical design documents
- `docs/testing/TESTING_STRATEGY.md` - Testing approach
