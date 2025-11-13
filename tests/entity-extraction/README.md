# Entity Extraction Test Suite

Comprehensive test utilities and test cases for validating ARES entity extraction quality.

## Overview

This test suite provides a multi-faceted approach to validating entity extraction:

1. **Basic Metrics** - Precision, recall, F1 score
2. **Confidence Scoring** - Validate confidence calibration and correlation
3. **Type Validation** - Ensure correct entity type classification
4. **Alias Resolution** - Test coreference and pronoun resolution
5. **Pattern Validation** - Check for common extraction errors

## Directory Structure

```
tests/entity-extraction/
├── README.md                          # This file
├── extraction.test.ts                 # Main test file (vitest)
├── comprehensive-test-runner.ts       # Standalone test runner with reporting
│
├── test-utils.ts                      # Core testing utilities
├── confidence-validation.ts           # Confidence scoring validation
├── type-validation.ts                 # Entity type validation
├── alias-resolution.ts                # Alias and coreference validation
│
├── test-cases/                        # Test case definitions (JSON)
│   ├── 001-basic-aliases.json         # Basic person/org identification
│   ├── 002-historical-context.json    # Historical figures with titles
│   ├── 003-modern-informal.json       # Modern tech/social media
│   ├── 004-academic-paper.json        # Academic/research content
│   ├── 005-legal-document.json        # Legal text
│   ├── 006-multilingual.json          # Names with accents
│   ├── 007-social-media.json          # Social media handles
│   ├── 008-historical-medieval.json   # Medieval/fantasy names
│   ├── 009-technical-docs.json        # Technical documentation
│   ├── 010-edge-cases.json            # Edge cases and ambiguity
│   └── 011-coreference-chains.json    # Long coreference chains
│
└── suites/                            # Golden corpus test suites
    ├── 001/                           # Suite 001: AI Industry
    │   ├── README.md
    │   ├── corpus.md
    │   ├── golden.entities.jsonl
    │   ├── golden.mentions.jsonl
    │   └── golden.relations.jsonl
    └── 002/                           # Suite 002: TBD
        └── corpus.md
```

## Test Utilities

### test-utils.ts

Core utilities for entity comparison and metrics calculation:

```typescript
import { calculateMetrics, compareEntities, formatMetrics } from './test-utils';

// Calculate precision, recall, F1
const metrics = calculateMetrics(expectedEntities, extractedEntities);

// Get detailed comparison (matched, missing, unexpected)
const comparison = compareEntities(expectedEntities, extractedEntities);

// Format for display
console.log(formatMetrics(metrics));
console.log(formatComparison(comparison));
```

**Key Functions:**
- `calculateMetrics()` - Compute P/R/F1
- `compareEntities()` - Detailed entity matching
- `findMatchingEntity()` - Find entity with type and alias matching
- `aggregateMetrics()` - Combine metrics across test cases
- `validateEntityPatterns()` - Run standard validation patterns

### confidence-validation.ts

Confidence scoring validation and calibration:

```typescript
import {
  analyzeConfidenceDistribution,
  detectConfidenceIssues,
  generateConfidenceReport
} from './confidence-validation';

// Analyze confidence score distribution
const distribution = analyzeConfidenceDistribution(entities);

// Detect issues (too uniform, poor correlation, etc.)
const issues = detectConfidenceIssues(expected, extracted);

// Generate full report
console.log(generateConfidenceReport(expected, extracted));
```

**Key Functions:**
- `analyzeConfidenceDistribution()` - Analyze score distribution
- `validateConfidenceCorrelation()` - Check if high confidence = high accuracy
- `validateConfidenceCalibration()` - Check predicted vs actual accuracy
- `detectConfidenceIssues()` - Auto-detect common problems

### type-validation.ts

Entity type classification validation:

```typescript
import {
  validateTypeConsistency,
  generateTypeValidationReport,
  formatTypeDistribution
} from './type-validation';

// Validate all entity types
const result = validateTypeConsistency(entities, text);

// Generate report
console.log(generateTypeValidationReport(entities, text));

// Show type distribution
console.log(formatTypeDistribution(entities));
```

**Key Functions:**
- `validateTypeFromContext()` - Context-based type validation
- `validateTypeConsistency()` - Check all entities
- `TYPE_VALIDATION_RULES` - Standard validation rules
- `getTypeDistribution()` - Analyze type distribution

### alias-resolution.ts

Alias resolution and coreference validation:

```typescript
import {
  validateAliasResolution,
  analyzeAliasQuality,
  generateAliasReport
} from './alias-resolution';

// Validate expected aliases are present
const result = validateAliasResolution(expected, extracted);

// Analyze overall alias quality
const metrics = analyzeAliasQuality(entities, text);

// Generate report
console.log(generateAliasReport(expected, extracted, text));
```

**Key Functions:**
- `validateAliasResolution()` - Check alias coverage
- `validatePronounResolution()` - Test pronoun resolution
- `validateCanonicalName()` - Check canonical name quality
- `analyzeAliasQuality()` - Overall alias metrics

## Test Case Format

Test cases are defined in JSON files with the following structure:

```json
[
  {
    "id": "test-001",
    "description": "Brief description of what this tests",
    "text": "The text to extract entities from...",
    "expectedEntities": [
      {
        "type": "PERSON",
        "text": "John Smith",
        "aliases": ["Dr. Smith", "John"],
        "context": "professor at MIT",
        "confidence": 0.95
      },
      {
        "type": "ORGANIZATION",
        "text": "MIT",
        "context": "university",
        "confidence": 0.98
      }
    ]
  }
]
```

### Entity Types

Supported entity types:
- `PERSON` - People, including titles and roles
- `ORGANIZATION` / `ORG` - Companies, institutions, groups
- `LOCATION` / `PLACE` - Geographic locations
- `DATE` - Dates and time expressions
- `PRODUCT` - Products and brands
- `EVENT` - Events and conferences
- `WORK` - Books, papers, artworks

### Confidence Thresholds

- **High**: ≥0.9 - Very certain extraction
- **Medium**: 0.7-0.9 - Good extraction
- **Low**: 0.5-0.7 - Uncertain but plausible
- **Below minimum**: <0.5 - Should be filtered

## Running Tests

### Run with Vitest

```bash
# Run all entity extraction tests
npm test tests/entity-extraction/extraction.test.ts

# Run with watch mode
npm run test:watch tests/entity-extraction/

# Run with coverage
npm test -- --coverage tests/entity-extraction/
```

### Run Comprehensive Test Runner

```bash
# Run standalone test runner with detailed reporting
npx tsx tests/entity-extraction/comprehensive-test-runner.ts

# View the generated report
cat reports/entity-extraction-test-report.txt
```

## Integration with ARES Test Ladder

This entity extraction test suite integrates with the ARES 5-stage testing ladder:

**Stage 1 (Foundation) - Entity Quality Check (1.2)**
- Validates entity types are correct
- Checks confidence scoring is working
- Ensures basic entity extraction functions

**Stage 2 (Component Validation)**
- Multi-sentence entity tracking
- Pronoun resolution validation
- Cross-sentence coreference

**Stage 3 (Complex Extraction)**
- Long coreference chains
- Ambiguous entity disambiguation
- Complex nested entities

## Writing New Test Cases

### 1. Choose the Right Test Case File

- **Basic entities**: `001-basic-aliases.json`
- **Historical content**: `002-historical-context.json`
- **Modern/informal**: `003-modern-informal.json`
- **Technical**: `009-technical-docs.json`
- **Edge cases**: `010-edge-cases.json`
- **Coreference**: `011-coreference-chains.json`

### 2. Define Expected Entities

```json
{
  "id": "unique-test-id",
  "description": "What aspect this tests",
  "text": "Your test text here...",
  "expectedEntities": [
    {
      "type": "PERSON",
      "text": "Main canonical name",
      "aliases": ["Alternative forms"],
      "context": "Brief context description",
      "confidence": 0.95
    }
  ]
}
```

### 3. Test Your Test Case

```bash
# Run to see if it loads correctly
npx tsx tests/entity-extraction/comprehensive-test-runner.ts
```

## Best Practices

### Test Case Design

1. **Focus on specific patterns** - Each test should validate a specific extraction pattern
2. **Include context** - Provide enough text for meaningful extraction
3. **Set realistic confidence** - Don't expect 1.0 confidence on ambiguous cases
4. **Test edge cases** - Include boundary conditions and ambiguous cases

### Validation Approach

1. **Start with basic metrics** - Ensure P/R/F1 are in acceptable ranges
2. **Check confidence** - Validate scores correlate with accuracy
3. **Validate types** - Ensure entity types match context
4. **Test aliases** - Verify coreference resolution works
5. **Run pattern checks** - Catch common extraction errors

### Debugging Failed Tests

```typescript
// Use detailed comparison to see what's wrong
const comparison = compareEntities(expected, extracted);
console.log(formatComparison(comparison));

// Check confidence issues
const issues = detectConfidenceIssues(expected, extracted);
for (const issue of issues) {
  console.log(`${issue.severity}: ${issue.message}`);
}

// Validate types
const typeReport = generateTypeValidationReport(extracted, text);
console.log(typeReport);

// Check aliases
const aliasReport = generateAliasReport(expected, extracted, text);
console.log(aliasReport);
```

## Metrics Targets

Based on the ARES test ladder:

**Stage 1 (Simple):**
- Precision: ≥90%
- Recall: ≥85%
- F1: ≥87%

**Stage 2 (Multi-sentence):**
- Precision: ≥85%
- Recall: ≥80%
- F1: ≥82%

**Stage 3 (Complex):**
- Precision: ≥80%
- Recall: ≥75%
- F1: ≥77%

## Contributing

When adding new test utilities:

1. Add to appropriate utility file
2. Export from the file
3. Document with JSDoc comments
4. Add usage examples to this README
5. Include in comprehensive test runner if applicable

## Related Documentation

- [INTEGRATED_TESTING_STRATEGY.md](../../INTEGRATED_TESTING_STRATEGY.md) - Overall ARES testing approach
- [ENTITY_EXTRACTION_STATUS.md](../../ENTITY_EXTRACTION_STATUS.md) - Entity extraction system docs
- [tests/ladder/](../ladder/) - Progressive difficulty test ladder
