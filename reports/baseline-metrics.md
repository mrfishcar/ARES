# Phase 2: Baseline Extraction Metrics

**Date:** 2025-11-08T05:19:53.611Z

## Overview

Baseline extraction performance on long-form narratives (2000-5000 words each).

## Summary Statistics

- **Total words:** 9,567
- **Total processing time:** 72133ms (7540ms per 1000 words)
- **Total entities:** 253
- **Total relations:** 30
- **Average memory:** 18.75MB
- **Entities per 1000 words:** 26.4
- **Relations per 1000 words:** 3.1

## Per-Chapter Results

| Chapter | Words | Time (ms) | Entities | Relations | Memory (MB) |
|---------|-------|-----------|----------|-----------|-------------|
| complex-narrative-01.txt | 2434 | 20908 | 18 | 16 | 18.99 |
| contemporary-chapter-01.txt | 2314 | 19154 | 75 | 9 | 26.21 |
| fantasy-chapter-01.txt | 2515 | 16862 | 86 | 2 | 16.2 |
| historical-chapter-01.txt | 2304 | 15209 | 74 | 3 | 13.61 |

## Entity Type Distribution

| Type | Count | Percentage |
|------|-------|------------|
| PERSON | 200 | 79% |
| PLACE | 28 | 11% |
| ORG | 12 | 5% |
| DATE | 8 | 3% |
| EVENT | 4 | 2% |
| WORK | 1 | 0% |

## Relation Predicate Distribution

| Predicate | Count | Percentage |
|-----------|-------|------------|
| enemy_of | 12 | 40% |
| married_to | 6 | 20% |
| parent_of | 4 | 13% |
| child_of | 4 | 13% |
| sibling_of | 2 | 7% |
| lives_in | 1 | 3% |
| born_in | 1 | 3% |

## Performance Analysis

### Processing Speed

❌ **FAIL:** Average processing time (7540ms per 1000 words) exceeds target (5000ms).

### Memory Usage

✅ **PASS:** Average memory usage (19MB) is below target (500MB).


## Observations

### Extraction Density

- **Entity density:** 26.4 entities per 1000 words
- **Relation density:** 3.1 relations per 1000 words
- **Relation/Entity ratio:** 12%

These metrics will serve as the baseline for measuring improvements in Phase 4.

## Next Steps

1. Manual review of extracted entities and relations
2. Create gold standard annotations for 20% sample
3. Calculate precision and recall
4. Proceed to Phase 3: Failure Analysis
