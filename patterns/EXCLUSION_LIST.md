# Pattern Exclusion List

This document explicitly lists patterns and pattern families that are excluded from integration into the ARES extraction pipeline, with rationales.

## Excluded Families

### NEGATION Family (31 patterns)

**Decision:** EXCLUDED from current integration
**Date:** 2025-11-10
**Rationale:**
- Represents uncertainty/modality rather than core semantic relations
- Requires separate confidence scoring and provenance tracking mechanisms
- Not part of original relation schema design
- Examples: `not_related_to`, `alleged`, `rumored`, `denied`, `disputed`, `uncertain_link`

**Future Work:**
- Consider as Phase 2 feature with proper uncertainty modeling
- May require changes to relation schema to include confidence scores
- Should be paired with provenance tracking for "who alleged X"

## Exclusion Criteria

Patterns are excluded if they:
1. Represent meta-properties (uncertainty, negation) rather than semantic relations
2. Would require significant schema changes to support properly
3. Have accuracy/quality issues in current generated form
4. Duplicate existing patterns without adding value

## Review Process

This exclusion list should be reviewed:
- Before each major release
- When new pattern families are proposed
- After significant schema changes
- Quarterly as part of pattern quality audit
