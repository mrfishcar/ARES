# Long-Form Test Corpus

This directory contains synthetic long-form narratives (2000-5000 words) designed to test extraction capabilities on contemporary writing styles.

## Files

1. **fantasy-chapter-01.txt** (2514 words)
   - Fantasy narrative with multiple characters, locations, magical elements
   - Tests: entity tracking across paragraphs, complex relationships, event chains
   - Key characters: Elara Moonwhisper, Master Theron, Cassandra Stormweaver, Lord Malachar
   - Challenges: Magic system entities, honorifics, long-distance coreference

2. **contemporary-chapter-01.txt** (2313 words)
   - Contemporary medical drama about burnout and life changes
   - Tests: family relationships, professional relationships, temporal sequences
   - Key characters: Dr. Sarah Chen, Marcus Williams, David Chen, Lily Chen
   - Challenges: Multiple locations, career transitions, emotional arcs

3. **historical-chapter-01.txt** (2689 words)
   - French Revolution narrative (1789-1823)
   - Tests: temporal ordering, political relationships, historical events
   - Key characters: Jean-Baptiste Moreau, Claire Moreau, Count de Valmont, Robespierre
   - Challenges: Long time span, complex political affiliations, death events

4. **complex-narrative-01.txt** (2610 words)
   - Detective mystery with multiple suspects and red herrings
   - Tests: coreference resolution, complex dialogue attribution, deduction chains
   - Key characters: Detective Raymond Cole, Lisa Park, Thomas Gardner, Derek Walsh
   - Challenges: Many named characters, professional relationships, crime investigation

## Total: 10,126 words across 4 chapters

## Testing Goals

These chapters are designed to test:
- Multi-paragraph entity tracking
- Long-distance coreference resolution
- Event chain extraction and ordering
- Complex relationship inference
- Temporal sequencing
- Dialogue attribution
- Professional vs. personal relationship distinction
- Location tracking across scenes

## Gold Standard Annotations

Gold standard annotations should be created for a 20% sample (~2000 words) to validate extraction quality.
