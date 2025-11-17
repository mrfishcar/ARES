# English Grammar Rules Reference for ARES

## Primary Reference
**Grammar Monster**: https://www.grammar-monster.com/

This comprehensive grammar reference should be used to implement proper English language rules for entity extraction and coreference resolution in ARES.

## Key Grammar Concepts for Entity Extraction

### 1. Pronouns and Antecedents
- **Antecedent**: The noun that a pronoun refers to
- **Rule**: A pronoun typically refers to the nearest appropriate antecedent
- **Example**: "Frederick walked. He knocked." → "He" refers to Frederick

### 2. Subject-Verb-Object Structure
- **Subject**: The entity performing the action (often who/what the sentence is about)
- **Predicate**: The verb and everything that follows
- **Object**: The entity receiving the action

### 3. Parts of Speech Relevant to Entity Extraction
- **Proper Nouns**: Specific names (Frederick, Saul, Charles Garrison)
- **Common Nouns**: General categories (mailman, demon, city)
- **Pronouns**: Temporary references (he, she, it, they)
- **Possessive Forms**: Ownership indicators (Frederick's, his, her)

### 4. Sentence Diagramming for Relations
- Understanding grammatical relationships helps identify:
  - Who performs actions (subject)
  - What actions are performed (predicate)
  - Who/what receives actions (direct object)
  - Additional context (indirect object, prepositional phrases)

## Implementation Goals

### Current Issue
ARES currently stores pronouns as permanent aliases on entities, causing:
- False entity merges (all male characters merged because they share "he" alias)
- Loss of contextual pronoun resolution
- Incorrect cross-document entity matching

### Correct Architecture
Pronouns should be:
1. **Temporary pointers** within a context window (sentence/paragraph)
2. **Resolved to entity IDs** during extraction
3. **Used to attribute actions** to the correct entity
4. **Discarded** after resolution (never stored in entity.aliases)

## Grammar Rules to Implement

### Pronoun Resolution Rules
1. **Recency**: Pronoun refers to most recently mentioned entity of matching gender/number
2. **Salience**: Grammatical subjects are more likely antecedents than objects
3. **Agreement**: Pronoun must match antecedent in:
   - Gender (he/she/it)
   - Number (singular/plural)
   - Person (1st/2nd/3rd)
4. **Syntax**: Subject pronouns vs object pronouns vs possessive pronouns

### Context Window Rules
1. **Sentence-level**: Pronouns typically resolve within same sentence
2. **Paragraph-level**: Can resolve to previous sentence if clear
3. **Context reset**: New paragraph often introduces new primary subject

### Relation Extraction Rules
1. **Subject identification**: Who is performing the action?
2. **Verb identification**: What action is being performed?
3. **Object identification**: Who/what receives the action?
4. **Prepositional relations**: Spatial, temporal, and relational context

## References for Implementation
- Grammar Monster - Pronouns: https://www.grammar-monster.com/lessons/pronouns.htm
- Grammar Monster - Antecedents: https://www.grammar-monster.com/glossary/antecedent.htm
- Grammar Monster - Sentence Structure: https://www.grammar-monster.com/glossary/sentence_structure.htm
- Grammar Monster - Parts of Speech: https://www.grammar-monster.com/lessons/parts_of_speech.htm

## Date Added
2025-11-15

## Priority
**CRITICAL** - Pronoun handling is currently breaking entity extraction on narrative fiction
