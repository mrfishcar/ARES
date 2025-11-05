# Golden Truth Test Suite

**Purpose:** Synthetic stress-test passages with precise, human-validated entity extraction annotations for validating and evolving ARES extraction rules.

## What is Golden Truth?

Golden truth files are **reference-quality test cases** that define:

1. **Input text** (1000-1400 words) designed to stress specific extraction rules
2. **Expected entities** with character-level span indices
3. **Expected relations** with evidence spans
4. **Coreference clusters** and alias dictionaries
5. **Negative cases** (things that should NOT be tagged)
6. **Rule upgrade suggestions** discovered during annotation

Unlike the `/tests/golden/` corpus (real-world texts like LotR, HP, Bible), these are **synthetic passages** crafted to expose edge cases and rule interactions.

---

## Directory Structure

```
tests/golden_truth/
├── README.md          # This file
├── schema.json        # JSON schema for validation
├── index.json         # Master list of all test cases
├── fantasy/           # Fantasy/fictional texts
├── academic/          # Academic papers, citations
├── news/              # News articles, journalism
├── legal/             # Legal documents, contracts
├── technical/         # Technical manuals, docs
└── mixed/             # Multi-domain hybrid texts
```

---

## Golden Truth Schema

### Top-Level Structure

```json
{
  "version": "ares-test-v1",
  "case_id": "string-snake-case",
  "domain": "fantasy|academic|news|legal|technical|mixed",
  "source_notes": "Brief description of passage style and intent",
  "input_text": "The full passage text (1000-1400 words)",
  "entities": [...],
  "coref_clusters": [...],
  "alias_dictionary": {...},
  "relations": [...],
  "dates": [...],
  "negative_cases": [...],
  "rule_upgrade_suggestions": [...]
}
```

### Entity Schema

```json
{
  "id": "E1",                    // Unique ID within this case
  "surface": "The Great Hall",   // Exact text as it appears
  "start": 123,                  // Character offset (inclusive)
  "end": 136,                    // Character offset (exclusive)
  "type": "PLACE",               // Entity type
  "canonical": "The Great Hall", // Canonical form
  "alias_of": null,              // ID of canonical entity (if alias)
  "reasoning": "Why this annotation was made (rule references)"
}
```

**Supported Types:**
- `PERSON`, `PLACE`, `ORG`, `EVENT`, `WORK`, `OBJECT`
- `DATE`, `TIME`, `QUANTITY`, `MONEY`, `LAW`
- `CONCEPT`, `NORP`, `PRODUCT`

### Coreference Cluster Schema

```json
{
  "canonical": "Harold Finch",
  "members": ["E4", "E7", "E12"],
  "aliases": ["Dr. H.", "the inventor", "Harold"]
}
```

### Alias Dictionary Schema

```json
{
  "Harold Finch": ["Dr. H.", "the inventor", "Harold"],
  "The Great Hall": ["the hall", "the assembly room"]
}
```

### Relation Schema

```json
{
  "type": "communicated_with",
  "head": "E4",                  // Entity ID
  "tail": "E9",                  // Entity ID
  "evidence_span": {
    "start": 410,
    "end": 455,
    "surface": "Finch told Hermione by letter"
  },
  "reasoning": "Verb-class=communication → PERSON↔PERSON bias"
}
```

**Common Relation Types:**
- `communicated_with`, `traveled_to`, `located_in`, `works_for`
- `parent_of`, `married_to`, `member_of`, `created_by`
- `owned_by`, `employed_by`, `studied_at`, `taught_at`

### Date Schema

```json
{
  "surface": "Frostmonth 12, Y149",
  "start": 890,
  "end": 910,
  "normalized": {
    "calendar": "fictional",
    "pattern": "Frostmonth-12-Y149",
    "iso_guess": null,
    "relative_to": null
  },
  "reasoning": "Fictional calendar normalization"
}
```

### Negative Case Schema

```json
{
  "surface": "to Harold",
  "start": 500,
  "end": 509,
  "should_tag": true,
  "normalized_surface": "Harold",
  "reasoning": "Preposition trimmed; entity is PERSON without 'to'"
}
```

**Purpose:** Document edge cases where:
- A surface form should NOT be tagged (common noun, no unique referent)
- A surface form SHOULD be normalized (trim preposition, expand title)

---

## S5 Hotfix Rule Goals

Each golden truth file should stress-test these rule goals:

### 1. Preposition-Trim for "to + Name"
Avoid capturing "to " in PERSON spans.
```
❌ "to Harold" → PERSON span [0,9]
✅ "Harold" → PERSON span [3,9]
```

### 2. Verb-Class Assignment
- Communication verbs (tell, ask, email, call) → PERSON targets
- Motion verbs (walk, travel, arrive, go) → PLACE targets

### 3. Noun-Governed Overrides
Governor nouns imply entity type:
- `letter/gift/note/call/email/memo` → PERSON on object
- `road/path/bridge/square/street` → PLACE on object

### 4. Span Extension for "The …" Titles
Extend span for named places/works:
```
"The Great Hall" → PLACE (full span)
"The Codex of Shadows" → WORK (full span)
```

### 5. Temporal Preposition Trim
Trim temporal prepositions from DATE/TIME:
```
❌ "on January 12" → DATE span [0,13]
✅ "January 12" → DATE span [3,13]
```

### 6. Fictional Calendar Normalization
```json
{
  "surface": "Frostmonth 12, Y149",
  "normalized": {
    "calendar": "fictional",
    "pattern": "Frostmonth-12-Y149"
  }
}
```

### 7. Live Alias Propagation
Alias dictionary co-references:
```json
{
  "Dr. H.": ["Harold Finch", "the inventor"]
}
```

---

## Quality Gates

Before committing a golden truth file, verify:

✅ **Passage length:** ≥ 1000 words
✅ **Entity count:** ≥ 30 entities (mixed types)
✅ **Relation count:** ≥ 10 relations with evidence spans
✅ **Span accuracy:** All `start`/`end` offsets align with `input_text`
✅ **Alias coverage:** At least 3 recurring entities with aliases
✅ **Negative cases:** At least 5 documented
✅ **Rule coverage:** All 7 S5 hotfix goals represented

---

## Validation

Run validation script:
```bash
npm run validate:golden
```

This checks:
- JSON schema conformance
- Character offset alignment
- Entity ID references (coref, relations)
- Span overlap detection
- Duplicate alias detection

---

## Usage Workflow

### 1. Generate New Golden Truth

Use the Claude master prompt to generate:
- 1000-1400 word passage
- Full golden JSON annotation
- Analysis markdown

### 2. Save to Domain Directory

```bash
tests/golden_truth/<domain>/<case_id>.json
```

### 3. Validate

```bash
npm run validate:golden tests/golden_truth/<domain>/<case_id>.json
```

### 4. Run ARES Extraction

```bash
npm test tests/golden_truth/<domain>/<case_id>.spec.ts
```

This compares ARES output against golden truth:
- Entity precision/recall
- Relation precision/recall
- Span alignment (exact vs ±N characters)
- Type accuracy

### 5. Analyze Diffs

```bash
npm run compare:golden <case_id>
```

Produces:
- Missing entities (false negatives)
- Extra entities (false positives)
- Type mismatches
- Span shifts
- Relation mismatches
- Suggested rule patches ranked by recall gain

---

## Test Case Index

See `index.json` for the master list of all golden truth cases.

Each entry:
```json
{
  "case_id": "hotfix_s5_preposition_trim",
  "domain": "mixed",
  "created": "2025-10-22",
  "rules_tested": ["S5.1", "S5.2", "S5.3"],
  "difficulty": "hard",
  "status": "active"
}
```

---

## Naming Convention

**Case IDs:** `<rule>_<focus>_<variant>`

Examples:
- `s5_preposition_trim_baseline`
- `s5_verb_class_communication_heavy`
- `s5_noun_governed_ambiguous_senses`
- `s5_span_extension_the_titles`
- `s5_temporal_trim_mixed_calendars`
- `s5_fictional_calendar_complex`
- `s5_alias_propagation_long_chains`

**Domain Files:** `<domain>/<case_id>.json`

---

## Contributing New Test Cases

1. Use the Claude master prompt template
2. Validate JSON schema and offsets
3. Run ARES extraction and verify diffs
4. Add entry to `index.json`
5. Document any new rule discoveries in case file
6. Submit PR with:
   - Golden JSON file
   - Analysis markdown (as comment in JSON)
   - Test spec file
   - Index.json update

---

## Related Test Suites

- `/tests/ladder/` - Progressive difficulty (levels 1-3)
- `/tests/golden/` - Real-world corpus (LotR, HP, Bible)
- `/tests/integration/` - API and system tests

Golden truth is **synthetic** and **rule-focused**, while golden corpus is **real-world** and **coverage-focused**.

---

**Last Updated:** October 22, 2025
**Schema Version:** ares-test-v1
**Maintainer:** ARES Development Team
