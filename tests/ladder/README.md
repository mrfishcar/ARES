# Test Ladder - Progressive Quality Gates

**📖 For complete testing strategy**: See `/home/user/ARES/UNIFIED_TESTING_STRATEGY.md`

This directory contains Progressive Level tests. Each level tests increasingly complex extraction scenarios. You must pass Level N before moving to Level N+1.

**Note**: These Level tests work together with Diagnostic Rungs (see unified strategy) to provide a complete testing workflow.

## Philosophy

- **No artificial scope limits** - we handle all entity types and predicates
- **Progressive difficulty** - start simple, add complexity
- **Precision & Recall metrics** - every level tracks P/R
- **Gold standard datasets** - hand-labeled ground truth
- **Deterministic rules** - no ML, pure algorithms

## Scoring

Each level has a minimum threshold:
- **Precision**: % of extracted facts that are correct
- **Recall**: % of true facts that were extracted
- **F1**: Harmonic mean of P and R

## Level Structure

```
Level 1: Simple Sentences       (P≥0.90, R≥0.85, F1≥0.87)
Level 2: Multi-Hop Relations    (P≥0.85, R≥0.80, F1≥0.82)
Level 3: Coreference Resolution (P≥0.80, R≥0.75, F1≥0.77)
Level 4: Temporal Reasoning     (P≥0.80, R≥0.70, F1≥0.74)
Level 5: Full Narrative         (P≥0.75, R≥0.65, F1≥0.69)
```

## Current Status

🟢 Level 1: Not started
⚪ Level 2: Locked
⚪ Level 3: Locked
⚪ Level 4: Locked
⚪ Level 5: Locked

## Running Tests

```bash
# Run all ladder tests
npm run test:ladder

# Run specific level
npm run test:ladder:1
npm run test:ladder:2

# View detailed report
npm run test:ladder:report
```

## Philosophy Notes

This isn't about limiting scope - it's about **proving** we can handle each complexity tier before tackling the next. Like building a skyscraper: solid foundation first, then add floors.

The final level (5) handles everything:
- Multiple entity types
- Complex predicates
- Temporal qualifiers
- Coreference chains
- Narrative understanding
- Conflict detection

But we earn it by proving quality at each step.
