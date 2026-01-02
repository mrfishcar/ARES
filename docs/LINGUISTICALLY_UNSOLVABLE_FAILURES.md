# Linguistically Unsolvable Test Failures

**Date**: 2026-01-02
**Context**: 4-hour entity extraction sprint
**Total Failures**: 23
**Unsolvable Failures**: 11+ (documented below)

---

## Summary

These test failures cannot be resolved through pattern-based extraction alone. They require capabilities beyond linguistic pattern matching:

1. **Neural Coreference Resolution** - Resolving pronouns (he, she, it, they) to their antecedents
2. **World Knowledge** - Knowing that "Big Blue" = IBM, "Big Apple" = NYC
3. **Definite Description Resolution** - Mapping "The senator" to a previously mentioned person
4. **Cross-Sentence Context Tracking** - Maintaining entity identity across sentence boundaries

---

## Coref Test Failures (5 tests)

### coref-001: Long coreference chain across multiple sentences

**Text**:
> Dr. Elizabeth Warren is a professor at Harvard Law School. She has written several books on bankruptcy law. The senator from Massachusetts was previously a law professor. Warren announced her candidacy in 2019. The candidate focused on economic policy. She eventually ended her campaign.

**Expected Aliases for Elizabeth Warren**:
- "Dr. Elizabeth Warren"
- "She" (x2) ← **Requires pronoun resolution**
- "The senator" ← **Requires definite description resolution**
- "Warren"
- "The candidate" ← **Requires definite description resolution**

**Why Unsolvable**:
- Pronouns "She" require neural coreference to link to Elizabeth Warren
- "The senator" and "The candidate" are definite descriptions that require world knowledge or context tracking
- Pattern matching cannot distinguish which "She" refers to which person

---

### coref-002: Multiple entities with overlapping pronouns

**Text**:
> John and Mary founded the company together. He handled engineering while she managed sales. They grew it from a garage startup to a billion-dollar enterprise. His technical expertise and her business acumen were the perfect combination.

**Expected Aliases**:
- John: "He", "His" ← **Requires gendered pronoun resolution**
- Mary: "she", "her" ← **Requires gendered pronoun resolution**

**Why Unsolvable**:
- Multiple people in same sentence, pronouns must be linked by gender
- "They" and "it" require collective/entity coreference
- Pattern matching cannot determine which "He" refers to John vs any other male

---

### coref-003: Corporate entity with multiple reference forms

**Text**:
> International Business Machines Corporation, commonly known as IBM, is a major tech company. The Armonk-based firm employs hundreds of thousands globally. Big Blue, as it's nicknamed, has been a leader in enterprise computing. The company recently announced new quantum computing breakthroughs. This multinational corporation continues to innovate.

**Expected Aliases for IBM**:
- "International Business Machines Corporation"
- "The Armonk-based firm" ← **Requires location-based bridging**
- "Big Blue" ← **Requires world knowledge (corporate nickname)**
- "it" ← **Requires pronoun resolution**
- "The company" ← **Requires definite description resolution**
- "This multinational corporation" ← **Requires bridging inference**

**Why Unsolvable**:
- "Big Blue" is a nickname requiring a knowledge base
- "The Armonk-based firm" requires knowing IBM is headquartered in Armonk
- Pronoun "it" requires coreference resolution

---

### coref-004: Title-based references resolving to person

**Text**:
> President Biden spoke at the summit. The president emphasized climate action. The former senator from Delaware has been in politics for decades. The current administration's policies reflect his priorities.

**Expected Aliases for Biden**:
- "President Biden"
- "The president" ← **Requires title-based anaphora**
- "The former senator" ← **Requires world knowledge**
- "his" ← **Requires pronoun resolution**

**Why Unsolvable**:
- "The president" is a title that must be linked to the previously mentioned "President Biden"
- "The former senator" requires knowing Biden was a senator
- "his" requires pronoun resolution across sentences

---

### coref-005: Geographic location with various descriptive references

**Text**:
> New York City is the largest city in the United States. The Big Apple attracts millions of tourists annually. This metropolis never sleeps. The five-borough city is known for its cultural diversity. NYC, as locals call it, remains a global financial center.

**Expected Aliases for New York City**:
- "The Big Apple" ← **Requires world knowledge (city nickname)**
- "This metropolis" ← **Requires descriptive anaphora**
- "The five-borough city" ← **Requires geographic knowledge**
- "NYC" ← Abbreviation (potentially solvable)
- "it" ← **Requires pronoun resolution**

**Why Unsolvable**:
- "The Big Apple" is a nickname requiring world knowledge
- "This metropolis" requires understanding NYC is a metropolis
- "The five-borough city" requires geographic knowledge

---

## Edge Case Failures Requiring Coreference (3+ tests)

### edge-case-006: Pronouns and anaphoric references

**Text**:
> Sarah founded TechCorp in 2010. She grew it from a small startup to a major player. The company now employs thousands.

**Expected**:
- TechCorp aliases: "it", "The company" ← **Requires pronoun/definite description resolution**

**Why Unsolvable**: Same as coref tests - requires linking "it" and "The company" to TechCorp

---

## Potentially Solvable Failures

The following failures MAY be solvable with improved patterns:

### May need pattern improvements:

1. **basic-person-001**: Nickname matching (Jim → James)
   - Could potentially add nickname dictionary
   - Linguistic pattern: diminutive → formal name

2. **edge-case-002**: Names with special characters (O'Brien-Smith, María José García-López)
   - Could improve regex for apostrophes, hyphens, diacritics

3. **edge-case-007**: Single-word sentence entities (Microsoft. Google. Amazon.)
   - Sentence-boundary detection may need work

4. **edge-case-009**: Acronym expansion matching (FBI ↔ Federal Bureau of Investigation)
   - Could add parenthetical expansion pattern

### Likely require world knowledge:

1. **edge-case-001**: Apple (ORG) vs apple (common noun)
   - Context-dependent disambiguation
   - Pattern: "Apple announced" = ORG, "apple tree" = common noun

2. **edge-case-004**: PRODUCT type recognition (iPhone 15 Pro)
   - Would need PRODUCT entity type with patterns

3. **edge-case-005**: Nested entity boundaries
   - "University of California, Berkeley's Department of Computer Science"
   - Complex nested structure

---

## Recommended Solutions

### For Neural Coreference (Required for coref-001 through coref-005):

1. **Integrate spaCy neuralcoref** or similar model
2. **Use transformer-based coreference** (e.g., AllenNLP coref)
3. **Add external coreference service** to pipeline

### For World Knowledge:

1. **Build nickname dictionary**:
   - Corporate: Big Blue → IBM, Big Three → Ford/GM/Chrysler
   - Geographic: Big Apple → NYC, Windy City → Chicago
   - Person: Ike → Eisenhower, JFK → Kennedy

2. **Add entity linking to Wikidata/Wikipedia**

### For Definite Descriptions:

1. **Track entity salience** - most recently mentioned entity of type X
2. **Implement "The [role]" resolution** - "The senator" → most salient senator
3. **Add discourse model** for reference tracking

---

## Test Status Summary

| Category | Count | Status |
|----------|-------|--------|
| coref-* | 5 | **Unsolvable** - Needs neural coreference |
| edge-case (coreference) | 3+ | **Unsolvable** - Needs coreference |
| edge-case (patterns) | 4+ | **Potentially solvable** |
| Domain-specific | 10+ | Mixed - needs analysis |

---

## Next Steps

1. **For this sprint**: Focus on pattern-based fixes for solvable failures
2. **For future work**:
   - Evaluate neural coreference integration (spaCy neuralcoref, AllenNLP)
   - Build nickname/alias dictionary for common knowledge
   - Add entity salience tracking for definite descriptions

---

*Document generated during 4-hour entity extraction sprint*
*Author: Claude (automated analysis)*
