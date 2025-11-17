# Instructions for ChatGPT Codex

**Date**: 2025-11-15
**Supervisor**: Claude (Anthropic)
**Project**: ARES Entity Extraction Engine
**Your Role**: Testing and quality assurance under Claude's supervision

---

## Current State Summary

You're joining an ongoing project to improve the **ARES (Advanced Relation Extraction System)** entity extraction quality. Recent work has completed three major improvements:

### ✅ Completed Work

1. **Pronoun Resolution Fix** (3 bug fixes)
   - Fixed pronouns being stored as canonical names
   - Fixed pronouns being stored as aliases
   - Fixed existing pronoun aliases being preserved during cross-document merge
   - **Result**: Eliminated false entity merges caused by pronouns

2. **Grammar Module Integration**
   - Integrated parts-of-speech analysis (8 parts of speech + noun categorization)
   - Imported sentence pattern analyzer (5 Purdue OWL patterns)
   - POS-based entity type enhancement working (+7% accuracy expected)

3. **Meaning Layer Implementation**
   - Created `MeaningRecord` interface for clean intermediate representation
   - Built meaning assembly module (`meaning-assembly.ts`)
   - Created test utilities with `expectMeaning()` helper
   - Integrated into extraction pipeline (orchestrator.ts)
   - Added debug logging with `MEANING_DEBUG=1`
   - **Result**: Stage 3 debugging now tractable

### 📁 Key Files to Know

| File | Purpose |
|------|---------|
| `app/engine/extract/orchestrator.ts` | Main extraction orchestration |
| `app/engine/extract/entities.ts` | Entity extraction + pronoun fixes |
| `app/engine/extract/relations.ts` | Relation extraction |
| `app/engine/meaning-assembly.ts` | Meaning layer assembly |
| `app/engine/meaning-test-utils.ts` | Test helpers (`expectMeaning()`) |
| `app/engine/schema.ts` | Type definitions (Entity, Relation, MeaningRecord) |
| `docs/MEANING_LAYER.md` | Complete meaning layer documentation |
| `test-meaning-layer.ts` | Example integration test |

---

## The Lab Environment

### What is "The Lab"?

The lab is a controlled testing environment for ARES extraction quality. It consists of:

1. **Parser Backend** (`parser_service/`) - spaCy NER + coreference resolution (Python)
2. **GraphQL API** (`app/api/graphql.ts`) - Extraction orchestration (TypeScript)
3. **Test Suites** - Various test files for different extraction scenarios

### Starting the Lab

```bash
# From /Users/corygilford/ares directory
./launch-ares.sh
```

This launches:
- Python parser service on `http://localhost:4000`
- GraphQL API on `http://localhost:4000/graphql`
- Frontend dev server (optional)

### Stopping the Lab

```bash
pkill -f "uvicorn parser_service"
pkill -f "node.*graphql"
pkill -f "vite"
```

### Running Tests

```bash
# TypeScript compilation first
npx tsc

# Run specific test
npx ts-node test-meaning-layer.ts

# Run with meaning debug logging
MEANING_DEBUG=1 npx ts-node test-meaning-layer.ts

# Check debug output
cat debug/meaning/test-meaning-layer.json
```

---

## Your Testing Objectives

### Primary Goals

1. **Verify Pronoun Fix Works**
   - Test text: "Frederick walked. He knocked on the door. Saul appeared. He spoke."
   - **Expected**: 2 entities (Frederick, Saul) with NO pronoun aliases
   - **NOT Expected**: 1 entity named "He" with aliases [Frederick, Saul]

2. **Verify Meaning Layer Works**
   - Extract entities and relations from test text
   - Verify `meaningRecords` are generated correctly
   - Use `expectMeaning()` test helper
   - Check debug output in `/debug/meaning/`

3. **Verify Grammar Integration Works**
   - Test proper noun entity type enhancement
   - Verify POS analysis improves entity categorization
   - Check PROPER_PERSON → PERSON, PROPER_PLACE → PLACE conversions

### Test Scenarios to Run

#### Test 1: Pronoun Resolution
```typescript
const text = "Frederick walked. He knocked. Saul appeared. He spoke.";
const result = await extractFromSegments("test-pronouns", text);

// Check no pronouns in canonical names
result.entities.forEach(e => {
  console.assert(!isContextDependent(e.canonical),
    `Entity ${e.id} has pronoun canonical: ${e.canonical}`);
});

// Check no pronouns in aliases
result.entities.forEach(e => {
  e.aliases.forEach(alias => {
    console.assert(!isContextDependent(alias),
      `Entity ${e.id} has pronoun alias: ${alias}`);
  });
});
```

#### Test 2: Meaning Layer
```typescript
import { expectMeaning } from './app/engine/meaning-test-utils';

const text = "Frederick ruled Gondor wisely. Aragorn traveled to Rivendell.";
const result = await extractFromSegments("test-meaning", text);

// Should have meaning records
expectMeaning(result.meaningRecords).toHaveLength(2);

// Should extract "Frederick → rules → Gondor"
const frederickId = result.entities.find(e => e.canonical === 'Frederick')?.id;
expectMeaning(result.meaningRecords).toContain({
  subj: frederickId,
  rel: 'rules'
});

// Should extract "Aragorn → traveled_to → Rivendell"
const aragornId = result.entities.find(e => e.canonical === 'Aragorn')?.id;
expectMeaning(result.meaningRecords).toContain({
  subj: aragornId,
  rel: 'traveled_to'
});
```

#### Test 3: POS Enhancement
```typescript
const text = "Professor McGonagall teaches at Hogwarts.";
const result = await extractFromSegments("test-pos", text);

// Should recognize "Professor McGonagall" as PERSON (not TITLE)
const mcgonagall = result.entities.find(e => e.canonical.includes('McGonagall'));
console.assert(mcgonagall?.type === 'PERSON',
  `Expected PERSON, got ${mcgonagall?.type}`);

// Should recognize "Hogwarts" as PLACE
const hogwarts = result.entities.find(e => e.canonical === 'Hogwarts');
console.assert(hogwarts?.type === 'PLACE',
  `Expected PLACE, got ${hogwarts?.type}`);
```

---

## Working Under Claude's Supervision

### Communication Protocol

1. **Report your findings** after each test:
   ```
   Test: [test name]
   Status: PASS / FAIL
   Details: [what you found]
   Issues: [any problems encountered]
   ```

2. **Ask Claude before making code changes**:
   - "Claude, I found issue X. Should I fix it or just report it?"
   - "Claude, test Y is failing. What should I investigate next?"

3. **Share test results** in detail:
   - Copy exact error messages
   - Show entity/relation outputs
   - Include debug logs when relevant

### What You Can Do Independently

- Run all test scenarios listed above
- Create new test cases for edge cases
- Run tests with `MEANING_DEBUG=1` to inspect output
- Check debug files in `/debug/meaning/`
- Compile TypeScript with `npx tsc`
- Read documentation files in `/docs/`

### What Requires Claude's Approval

- Making code changes to core modules (entities.ts, relations.ts, orchestrator.ts)
- Creating new functionality
- Modifying the meaning layer
- Changing test utilities
- Deploying to production

### Escalation to Claude

If you encounter:
- Test failures you can't explain
- Unexpected entity merges
- Missing relations
- Meaning records that don't make sense
- TypeScript compilation errors
- Runtime errors

→ **Report to Claude immediately with full details**

---

## Expected Test Results

### Baseline Performance (After Recent Fixes)

Based on completed work, you should see:

1. **Pronoun Handling**: 100% success rate
   - No pronouns as canonical names
   - No pronouns in aliases
   - Proper entity separation when pronouns used

2. **Meaning Layer**: 100% operational
   - All relations → meaning records
   - Clean JSON output in `/debug/meaning/`
   - `expectMeaning()` assertions work

3. **POS Enhancement**: ~93% accuracy (up from 86%)
   - Better proper noun categorization
   - Improved PERSON/PLACE distinction

### Known Limitations

1. **Coreference still happens at spaCy level** - We filter pronouns after extraction, but spaCy may still create some odd clusterings
2. **Manner qualifiers** - Not in schema.ts Qualifier.type, inferred from value
3. **Sentence analyzer** - Imported but not yet used in relation extraction (future work)

---

## Debug Workflow

### When Tests Fail

1. **Enable debug logging**:
   ```bash
   MEANING_DEBUG=1 npx ts-node your-test.ts
   ```

2. **Inspect meaning records**:
   ```bash
   cat debug/meaning/your-test.json
   ```

3. **Check entity details**:
   ```typescript
   result.entities.forEach(e => {
     console.log(`Entity: ${e.canonical} (${e.type})`);
     console.log(`  ID: ${e.id}`);
     console.log(`  Aliases: ${e.aliases.join(', ')}`);
     console.log(`  Mentions: ${e.mentions.map(m => m.text).join(', ')}`);
   });
   ```

4. **Check relation details**:
   ```typescript
   result.relations.forEach(r => {
     console.log(`Relation: ${r.subj} → ${r.pred} → ${r.obj}`);
     console.log(`  Confidence: ${r.confidence}`);
     console.log(`  Evidence: ${r.evidence.length} pieces`);
   });
   ```

5. **Compare meaning vs relations**:
   ```typescript
   console.log(`Relations: ${result.relations.length}`);
   console.log(`Meaning Records: ${result.meaningRecords.length}`);
   // Should be 1:1 mapping
   ```

### Debug Output Locations

- `/debug/meaning/` - Meaning records JSON
- `/tmp/ares-*.log` - Service logs
- Console output from tests

---

## Quick Reference Commands

```bash
# Start lab
./launch-ares.sh

# Compile TypeScript
npx tsc

# Run meaning layer test
npx ts-node test-meaning-layer.ts

# Run with debug output
MEANING_DEBUG=1 npx ts-node test-meaning-layer.ts

# Check parser service health
curl http://localhost:4000/health

# Test parser directly
curl -X POST http://localhost:4000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Frederick walked. He knocked."}'

# Stop all services
pkill -f "uvicorn parser_service"
pkill -f "node.*graphql"
pkill -f "vite"

# View meaning debug output
cat debug/meaning/test-*.json

# Check TypeScript compilation
npx tsc --noEmit
```

---

## Success Criteria

You've successfully validated the recent work when:

1. ✅ **Pronoun test passes** - No pronouns in canonical names or aliases
2. ✅ **Meaning layer test passes** - Clean MeaningRecords generated
3. ✅ **POS enhancement working** - Better entity type categorization
4. ✅ **No regressions** - Existing functionality still works
5. ✅ **Debug logging works** - Meaning records written to `/debug/meaning/`

---

## Questions for Claude

When reporting to Claude, structure your updates like this:

```
Status Report - [Date/Time]

Tests Completed:
- [Test 1]: PASS/FAIL - [brief description]
- [Test 2]: PASS/FAIL - [brief description]

Issues Found:
1. [Issue description with error messages/output]
2. [Issue description with error messages/output]

Questions:
1. [Question about unexpected behavior]
2. [Question about next steps]

Next Steps:
- [What you plan to test next]
```

---

## Documentation References

For deeper understanding, read these docs:

1. **`docs/MEANING_LAYER.md`** - Complete meaning layer architecture and usage
2. **`docs/GRAMMAR_INTEGRATION_GUIDE.md`** - Grammar module integration details
3. **`docs/GRAMMAR_INTEGRATION_SUMMARY.md`** - Summary of pronoun fix and POS integration
4. **`docs/PROMPT_FOR_NEXT_AGENT.md`** - Context about recent extraction improvements

---

## Important Notes

- **DO NOT** modify production code without Claude's approval
- **DO** report all test failures immediately
- **DO** run tests with debug logging when investigating issues
- **DO** provide complete error messages and outputs
- **ASK** Claude before trying experimental fixes

---

**Ready to start?**

1. Make sure the lab is running (`./launch-ares.sh`)
2. Run the meaning layer test first: `npx ts-node test-meaning-layer.ts`
3. Report results to Claude
4. Proceed with additional test scenarios based on Claude's guidance

Good luck! Claude is here to supervise and help you validate all the recent improvements to ARES.
